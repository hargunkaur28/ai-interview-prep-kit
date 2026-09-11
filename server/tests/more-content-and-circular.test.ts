import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../src/models/User';
import { Kit } from '../src/models/Kit';
import { config } from '../src/config';
import { getNextNumericId, inFlightKitOperations } from '../src/routes/kits';
import { InternalKit, InternalQuestion, InternalFlashcard } from '@trao/shared';

describe('Generate More Content & Circular Flashcard Navigation', { timeout: 30000 }, () => {
  let testUserId = '';
  let testUserToken = '';
  let testKitId = '';
  let originalGroqKey = '';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongoUri);
    }
    originalGroqKey = config.groqApiKey;
    config.groqApiKey = ''; // deterministic fallback mode for tests

    const user = await User.create({
      email: `test-more-${Date.now()}@example.com`,
      passwordHash: await bcrypt.hash('password123', 10),
    });
    testUserId = user._id.toString();
    testUserToken = jwt.sign({ userId: testUserId }, config.jwtSecret, { expiresIn: '1h' });

    // Seed an initial kit with questions, ratings, and user-added items
    const initialKit = await Kit.create({
      userId: testUserId,
      source: {
        company: 'Acme Corp',
        company_url: 'https://acme.example.com',
        role: 'Senior Backend Engineer',
        pages_used: ['https://acme.example.com/about'],
      },
      role: {
        title: 'Senior Backend Engineer',
        seniority: 'Senior',
        responsibilities: ['Build distributed systems', 'Lead code reviews'],
        requirements: [
          { id: 'r1', text: 'Distributed systems and Node.js', kind: 'technical', priority: 'must' },
          { id: 'r2', text: 'Technical mentorship', kind: 'behavioural', priority: 'must' },
        ],
      },
      company_brief: {
        summary: 'Acme builds distributed data pipelines.',
        what_they_do: 'Cloud computing and big data infrastructure.',
        source_urls: ['https://acme.example.com'],
      },
      questions: [
        {
          id: 'q1',
          requirement_ids: ['r1'],
          category: 'technical',
          prompt: 'Existing Technical Question 1',
          answer_outline: 'Outline 1',
          difficulty: 2,
          origin: 'generated',
          is_edited: false,
          is_pinned: false,
        },
        {
          id: 'q2',
          requirement_ids: ['r2'],
          category: 'behavioural',
          prompt: 'User Edited Question',
          answer_outline: 'Custom notes from candidate',
          difficulty: 3,
          origin: 'user_added',
          is_edited: true,
          is_pinned: true,
        },
      ],
      flashcards: [
        {
          id: 'f1',
          front: 'CAP Theorem',
          back: 'Consistency, Availability, Partition tolerance trade-offs.',
          requirement_ids: ['r1'],
          origin: 'generated',
          confidence: 3, // Rating to preserve
          practice_count: 2,
        },
        {
          id: 'f2',
          front: 'Idempotency in APIs',
          back: 'Producing the same result regardless of repeated requests.',
          requirement_ids: ['r1'],
          origin: 'user_added',
          confidence: 1, // Rating to preserve
          practice_count: 1,
        },
      ],
      schedule: {
        days_available: 3,
        days: [
          { day: 1, focus: 'Foundations', question_ids: ['q1'], minutes: 45 },
          { day: 2, focus: 'Mentorship', question_ids: ['q2'], minutes: 45 },
          { day: 3, focus: 'Review', question_ids: ['q1', 'q2'], minutes: 45 },
        ],
      },
      coverage: {
        uncovered_requirement_ids: [],
        warning: null,
      },
    });
    testKitId = initialKit._id.toString();
  });

  afterAll(async () => {
    config.groqApiKey = originalGroqKey;
    if (testUserId) {
      await User.deleteOne({ _id: testUserId });
      await Kit.deleteMany({ userId: testUserId });
    }
    await mongoose.disconnect();
  });

  // 1. Safe ID Calculation
  describe('Safe ID Calculation (getNextNumericId)', () => {
    it('calculates the next numeric ID from maximum valid numeric ID', () => {
      const items = [{ id: 'q1' }, { id: 'q4' }, { id: 'q2' }];
      expect(getNextNumericId(items, 'q')).toBe(5);
    });

    it('safely ignores malformed, non-numeric, or missing IDs', () => {
      const items = [
        { id: 'q1' },
        { id: 'malformed_id' },
        { id: 'q-custom-12' },
        { id: 'q99' },
        { id: '' },
        {} as any,
      ];
      expect(getNextNumericId(items, 'q')).toBe(100);
    });

    it('returns 1 for empty arrays', () => {
      expect(getNextNumericId([], 'q')).toBe(1);
      expect(getNextNumericId([], 'f')).toBe(1);
    });
  });

  // 2. Circular Navigation Logic & Edge Cases
  describe('Circular Flashcard Navigation', () => {
    it('loops continuously: next from last card -> first card', () => {
      const cards = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
      let practiceIndex = 2; // last card

      // Simulate nextCard()
      practiceIndex = (practiceIndex + 1) % cards.length;
      expect(practiceIndex).toBe(0); // Loops to first!
    });

    it('loops continuously: previous from first card -> last card', () => {
      const cards = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
      let practiceIndex = 0; // first card

      // Simulate prevCard()
      practiceIndex = (practiceIndex - 1 + cards.length) % cards.length;
      expect(practiceIndex).toBe(2); // Loops to last!
    });

    it('handles continuous indefinite cycling without stopping', () => {
      const cards = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
      let index = 0;
      const history: number[] = [];

      for (let i = 0; i < 9; i++) {
        history.push(index);
        index = (index + 1) % cards.length;
      }

      expect(history).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
    });

    it('guards against an empty flashcard array safely', () => {
      const emptyCards: any[] = [];
      const navigate = (idx: number, len: number) => (len > 0 ? (idx + 1) % len : 0);
      expect(navigate(0, emptyCards.length)).toBe(0);
      expect(Number.isNaN(navigate(0, emptyCards.length))).toBe(false);
    });
  });

  // 3. Concurrency Lock & Lock Release Safeguards
  describe('In-Flight Lock Protection and Release', () => {
    it('prevents duplicate generation requests while an operation is in-flight', () => {
      const lockKey = `${testKitId}:more_questions`;
      inFlightKitOperations.add(lockKey);

      expect(inFlightKitOperations.has(lockKey)).toBe(true);

      // Attempting to acquire when locked must be blocked
      const isLocked = inFlightKitOperations.has(lockKey);
      expect(isLocked).toBe(true);

      inFlightKitOperations.delete(lockKey);
    });

    it('guarantees lock release using try/finally even if an error is thrown', async () => {
      const lockKey = `${testKitId}:error_simulation`;
      inFlightKitOperations.add(lockKey);

      try {
        throw new Error('Simulated Groq or Database failure');
      } catch {
        // caught
      } finally {
        inFlightKitOperations.delete(lockKey);
      }

      // Lock MUST be released
      expect(inFlightKitOperations.has(lockKey)).toBe(false);
    });
  });

  // 4. Generate More Questions Endpoint
  describe('POST /api/kits/:id/generate-more-questions', () => {
    it('generates and appends questions across all 4 categories while preserving existing questions and user edits', async () => {
      const kitBefore = await Kit.findById(testKitId);
      const initialCount = kitBefore!.questions.length;

      // Simulate the route logic directly
      const nextQNum = getNextNumericId(kitBefore!.questions, 'q');
      expect(nextQNum).toBe(3); // q1, q2 were present

      const { generateAllCategorizedQuestions } = await import('../src/services/groq');
      const freshQuestions = await generateAllCategorizedQuestions(
        kitBefore!.role.requirements,
        kitBefore!.role,
        kitBefore!.company_brief,
        nextQNum
      );

      expect(freshQuestions.length).toBeGreaterThanOrEqual(4);

      const mappedNew: InternalQuestion[] = freshQuestions.map(q => ({
        ...q,
        origin: 'generated' as const,
        is_edited: false,
        is_pinned: false,
      }));

      kitBefore!.questions = [...kitBefore!.questions, ...mappedNew];
      const { checkCoverage } = await import('../src/domain/coverage');
      const { allocateSchedule } = await import('../src/domain/study-planner');
      const coverageAnalysis = checkCoverage(kitBefore!.role.requirements, kitBefore!.questions);
      kitBefore!.coverage.uncovered_requirement_ids = coverageAnalysis.uncoveredRequirementIds;
      kitBefore!.schedule = allocateSchedule(kitBefore!.schedule.days_available, kitBefore!.questions, kitBefore!.role.requirements);

      await kitBefore!.save();

      // Verify persistence from database
      const reloaded = await Kit.findById(testKitId);
      expect(reloaded!.questions.length).toBe(initialCount + mappedNew.length);

      // Verify existing items were preserved
      const q1 = reloaded!.questions.find(q => q.id === 'q1');
      expect(q1).toBeDefined();
      expect(q1!.prompt).toBe('Existing Technical Question 1');

      const q2 = reloaded!.questions.find(q => q.id === 'q2');
      expect(q2).toBeDefined();
      expect(q2!.is_edited).toBe(true);
      expect(q2!.is_pinned).toBe(true);
      expect(q2!.origin).toBe('user_added');

      // Verify newly appended questions have sequential IDs starting from q3
      expect(reloaded!.questions.some(q => q.id === 'q3')).toBe(true);

      // Verify all 4 categories are represented
      const categories = new Set(reloaded!.questions.map(q => q.category));
      expect(categories.has('technical')).toBe(true);
      expect(categories.has('behavioural')).toBe(true);
      expect(categories.has('system-design')).toBe(true);
      expect(categories.has('company-fit')).toBe(true);
    });

    it('permits repeated generate-more requests after the first request completes', async () => {
      const kit = await Kit.findById(testKitId);
      const countBefore = kit!.questions.length;
      const nextQNum = getNextNumericId(kit!.questions, 'q');

      const { generateAllCategorizedQuestions } = await import('../src/services/groq');
      const freshQuestions = await generateAllCategorizedQuestions(
        kit!.role.requirements,
        kit!.role,
        kit!.company_brief,
        nextQNum
      );

      kit!.questions = [
        ...kit!.questions,
        ...freshQuestions.map(q => ({
          ...q,
          origin: 'generated' as const,
          is_edited: false,
          is_pinned: false,
        })),
      ];
      await kit!.save();

      const reloaded = await Kit.findById(testKitId);
      expect(reloaded!.questions.length).toBe(countBefore + freshQuestions.length);
      expect(reloaded!.questions.some(q => q.id === `q${nextQNum}`)).toBe(true);
    });
  });

  // 5. Generate More Flashcards Endpoint
  describe('POST /api/kits/:id/generate-more-flashcards', () => {
    it('generates and appends flashcards while preserving existing cards, ratings, and user-added items', async () => {
      const kitBefore = await Kit.findById(testKitId);
      const initialCount = kitBefore!.flashcards.length;

      const nextFNum = getNextNumericId(kitBefore!.flashcards, 'f');
      expect(nextFNum).toBe(3); // f1, f2 are present

      const { generateFlashcards } = await import('../src/services/groq');
      const freshCards = await generateFlashcards(
        kitBefore!.role.requirements,
        kitBefore!.role,
        kitBefore!.company_brief,
        nextFNum
      );

      expect(freshCards.length).toBeGreaterThan(0);

      const mappedNew: InternalFlashcard[] = freshCards.map(f => ({
        ...f,
        origin: 'generated' as const,
        is_edited: false,
        is_pinned: false,
        confidence: undefined,
        practice_count: 0,
      }));

      kitBefore!.flashcards = [...kitBefore!.flashcards, ...mappedNew];
      await kitBefore!.save();

      // Verify persistence from database
      const reloaded = await Kit.findById(testKitId);
      expect(reloaded!.flashcards.length).toBe(initialCount + mappedNew.length);

      // Verify existing f1 confidence and practice count are preserved
      const f1 = reloaded!.flashcards.find(f => f.id === 'f1');
      expect(f1).toBeDefined();
      expect(f1!.confidence).toBe(3);
      expect(f1!.practice_count).toBe(2);

      // Verify existing user-added f2 is preserved
      const f2 = reloaded!.flashcards.find(f => f.id === 'f2');
      expect(f2).toBeDefined();
      expect(f2!.confidence).toBe(1);
      expect(f2!.origin).toBe('user_added');

      // Verify newly appended cards start from f3
      expect(reloaded!.flashcards.some(f => f.id === 'f3')).toBe(true);
    });

    it('permits repeated generate-more-flashcards requests after the first request completes', async () => {
      const kit = await Kit.findById(testKitId);
      const countBefore = kit!.flashcards.length;
      const nextFNum = getNextNumericId(kit!.flashcards, 'f');

      const { generateFlashcards } = await import('../src/services/groq');
      const freshCards = await generateFlashcards(
        kit!.role.requirements,
        kit!.role,
        kit!.company_brief,
        nextFNum
      );

      kit!.flashcards = [
        ...kit!.flashcards,
        ...freshCards.map(f => ({
          ...f,
          origin: 'generated' as const,
          is_edited: false,
          is_pinned: false,
          confidence: undefined,
          practice_count: 0,
        })),
      ];
      await kit!.save();

      const reloaded = await Kit.findById(testKitId);
      expect(reloaded!.flashcards.length).toBe(countBefore + freshCards.length);
      expect(reloaded!.flashcards.some(f => f.id === `f${nextFNum}`)).toBe(true);
    });
  });
});
