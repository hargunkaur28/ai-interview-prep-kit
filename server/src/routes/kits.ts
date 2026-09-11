import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from './auth';
import { Kit } from '../models/Kit';
import { runPipeline } from '../services/pipeline';
import { generateQuestionsForCategory, generateCompanyBrief } from '../services/groq';
import { checkCoverage } from '../domain/coverage';
import { allocateSchedule } from '../domain/study-planner';
import {
  InternalKit,
  InternalQuestion,
  InternalFlashcard,
  toAppendixAKit,
  QuestionCategory,
  PipelineProgressEvent,
} from '@trao/shared';

export const kitsRouter = Router();

// Apply auth to all kit routes
kitsRouter.use(requireAuth);

// List user kits
kitsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const kits = await Kit.find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .select('source role schedule.days_available updatedAt createdAt');

    res.json({ kits });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch interview kits' });
  }
});

// Stream generation via Server-Sent Events (SSE) or standard POST
kitsRouter.post('/generate', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { jd, company_url, days } = req.body;

  if (!jd || typeof jd !== 'string' || jd.trim().length === 0) {
    res.status(400).json({ error: 'Job description is required' });
    return;
  }

  const companyUrl = (company_url || '').trim();
  const daysCount = parseInt(days || '5', 10);

  // Detect if client requested SSE stream
  const isSSE = req.headers.accept === 'text/event-stream';

  if (isSSE) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
  }

  const sendEvent = (event: PipelineProgressEvent) => {
    if (isSSE) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  try {
    const internalKit = await runPipeline({
      jd,
      companyUrl,
      days: daysCount,
      onProgress: sendEvent,
    });

    const saved = await Kit.create({
      ...internalKit,
      userId: req.userId,
    });

    if (isSSE) {
      res.write(
        `data: ${JSON.stringify({
          stage: 'completed',
          status: 'completed',
          message: 'Prep kit generation finished successfully.',
          data: { kitId: saved._id.toString() },
        })}\n\n`
      );
      res.end();
    } else {
      res.status(201).json({
        kitId: saved._id.toString(),
        kit: saved,
      });
    }
  } catch (err: any) {
    console.error('[Kits] Generation failed:', err);
    if (isSSE) {
      res.write(
        `data: ${JSON.stringify({
          stage: 'failed',
          status: 'failed',
          message: err.message || 'Generation failed',
        })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({ error: err.message || 'Failed to generate kit' });
    }
  }
});

// Get single kit
kitsRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    res.json({ kit });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch interview kit' });
  }
});

// Update kit (inline editing, reordering, adding, deleting)
kitsRouter.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }

    const { company_brief, role, questions, flashcards, schedule } = req.body;

    if (company_brief) kit.company_brief = company_brief;
    if (role) kit.role = role;
    if (questions) kit.questions = questions;
    if (flashcards) kit.flashcards = flashcards;
    if (schedule) kit.schedule = schedule;

    // Recalculate deterministic coverage
    const coverageAnalysis = checkCoverage(kit.role.requirements, kit.questions);
    kit.coverage.uncovered_requirement_ids = coverageAnalysis.uncoveredRequirementIds;

    await kit.save();
    res.json({ kit });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update kit' });
  }
});

// Regenerate single section (Question Category) with EDIT PRESERVATION
kitsRouter.post('/:id/regenerate-category', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { category } = req.body;
    if (!category || !['technical', 'behavioural', 'system-design', 'company-fit'].includes(category)) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }

    const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }

    // Preservation Rule:
    // Keep user-added, user-edited, and pinned questions in this category!
    const preservedInCat = kit.questions.filter(
      q => q.category === category && (q.origin === 'user_added' || q.is_edited || q.is_pinned)
    );

    // Filter out all other categories (they remain completely untouched)
    const otherCategories = kit.questions.filter(q => q.category !== category);

    // Determine start index for fresh IDs
    const maxExistingQNum = kit.questions.reduce((max, q) => {
      const match = q.id.match(/^q(\d+)$/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);

    // Generate fresh questions for this category
    const generatedFresh = await generateQuestionsForCategory(
      category as QuestionCategory,
      kit.role.requirements,
      kit.role,
      kit.company_brief,
      maxExistingQNum + 1
    );

    // Combine preserved + newly generated questions for this category
    const updatedCatQuestions: InternalQuestion[] = [
      ...preservedInCat,
      ...generatedFresh.map(q => ({
        ...q,
        origin: 'generated' as const,
        is_edited: false,
        is_pinned: false,
      })),
    ];

    kit.questions = [...otherCategories, ...updatedCatQuestions];

    // Re-check coverage and allocate schedule
    const coverageAnalysis = checkCoverage(kit.role.requirements, kit.questions);
    kit.coverage.uncovered_requirement_ids = coverageAnalysis.uncoveredRequirementIds;

    const newSchedule = allocateSchedule(kit.schedule.days_available, kit.questions, kit.role.requirements);
    kit.schedule = newSchedule;

    await kit.save();
    res.json({ kit, preservedCount: preservedInCat.length, newCount: generatedFresh.length });
  } catch (err: any) {
    console.error('[Kits] Category regeneration error:', err);
    res.status(500).json({ error: 'Failed to regenerate category' });
  }
});

// Regenerate Company Brief
kitsRouter.post('/:id/regenerate-brief', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }

    const companyName = kit.source.company || 'Company';
    const brief = await generateCompanyBrief(
      companyName,
      kit.source.company_url,
      kit.source.pages_used.map(url => ({ url, content: '' })),
      ''
    );

    kit.company_brief = brief;
    await kit.save();
    res.json({ kit });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to regenerate company brief' });
  }
});

// Practice Mode - Record flashcard confidence
kitsRouter.post('/:id/practice', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { flashcard_id, confidence } = req.body;
    if (!flashcard_id || ![1, 2, 3].includes(confidence)) {
      res.status(400).json({ error: 'flashcard_id and confidence (1-3) required' });
      return;
    }

    const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }

    const card = kit.flashcards.find(f => f.id === flashcard_id);
    if (!card) {
      res.status(404).json({ error: 'Flashcard not found' });
      return;
    }

    card.confidence = confidence;
    card.last_practiced_at = new Date().toISOString();
    card.practice_count = (card.practice_count || 0) + 1;

    await kit.save();
    res.json({ success: true, card });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record practice score' });
  }
});

// Toggle schedule completed day
kitsRouter.post('/:id/toggle-schedule-day', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { day } = req.body;
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }

    const completed = new Set(kit.schedule_completed_days || []);
    if (completed.has(day)) {
      completed.delete(day);
    } else {
      completed.add(day);
    }

    kit.schedule_completed_days = Array.from(completed);
    await kit.save();
    res.json({ schedule_completed_days: kit.schedule_completed_days });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle schedule day' });
  }
});

// Export clean Appendix A JSON
kitsRouter.get('/:id/export', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.userId });
    if (!kit) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    const cleanAppendixA = toAppendixAKit((kit.toObject() as unknown) as InternalKit);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="interview-kit-${kit._id}.json"`);
    res.json(cleanAppendixA);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to export kit' });
  }
});

// Delete kit
kitsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await Kit.deleteOne({ _id: req.params.id, userId: req.userId });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Kit not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete kit' });
  }
});
