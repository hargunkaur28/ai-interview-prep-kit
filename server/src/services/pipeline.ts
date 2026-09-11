import {
  AppendixAKit,
  InternalKit,
  PipelineProgressEvent,
  QuestionCategory,
  Question,
  Flashcard,
  toAppendixAKit,
  validateAppendixAKit,
} from '@trao/shared';
import { extractRequirementsFromJD, generateCompanyBrief, generateQuestionsForCategory, generateGapQuestions, generateFlashcards } from './groq';
import { crawlCompanyWebsite } from './crawler';
import { searchPublicInterviewDiscussion } from './discussion';
import { checkCoverage } from '../domain/coverage';
import { allocateSchedule } from '../domain/scheduler';

export interface PipelineOptions {
  jd: string;
  companyUrl: string;
  days: number;
  onProgress?: (event: PipelineProgressEvent) => void;
}

/**
 * Executes the deliberate multi-step interview prep kit pipeline.
 * Never calls one giant prompt. Follows all 10 sequential stages.
 */
export async function runPipeline(options: PipelineOptions): Promise<InternalKit> {
  const { jd, companyUrl, days, onProgress } = options;
  const daysCount = Math.max(1, Math.floor(days || 5));

  const notify = (event: PipelineProgressEvent) => {
    if (onProgress) onProgress(event);
  };

  // Stage 1: Extract requirements from JD
  notify({
    stage: 'extracting_jd',
    status: 'running',
    message: 'Extracting structured role requirements and responsibilities...',
  });
  const role = await extractRequirementsFromJD(jd);
  notify({
    stage: 'extracting_jd',
    status: 'completed',
    message: `Extracted ${role.title} (${role.seniority}) with ${role.requirements.length} requirements.`,
    data: { role },
  });

  // Infer company name from URL or JD
  let inferredCompany = '';
  try {
    const parsed = new URL(companyUrl.startsWith('http') ? companyUrl : `https://${companyUrl}`);
    inferredCompany = parsed.hostname.replace(/^www\./i, '').split('.')[0];
    inferredCompany = inferredCompany.charAt(0).toUpperCase() + inferredCompany.slice(1);
  } catch {
    inferredCompany = 'Company';
  }

  // Stage 2: Crawl company website
  notify({
    stage: 'crawling_company',
    status: 'running',
    message: `Crawling ${companyUrl} and ranking relevant internal links...`,
  });
  const crawlResult = await crawlCompanyWebsite(companyUrl);

  if (!crawlResult.reachable) {
    notify({
      stage: 'crawling_company',
      status: 'warning',
      message: crawlResult.warning || 'Company site unreachable; continuing with job description.',
    });
  } else if (crawlResult.warning) {
    notify({
      stage: 'crawling_company',
      status: 'warning',
      message: crawlResult.warning,
    });
  } else {
    notify({
      stage: 'crawling_company',
      status: 'completed',
      message: `Retrieved ${crawlResult.pages.length} relevant company page(s).`,
    });
  }

  // Stage 3: Public Interview Discussion Research
  notify({
    stage: 'researching_interview',
    status: 'running',
    message: 'Searching public interview discussions and hiring process details...',
  });
  const publicDiscussion = await searchPublicInterviewDiscussion(inferredCompany, companyUrl);
  notify({
    stage: 'researching_interview',
    status: publicDiscussion.found ? 'completed' : 'warning',
    message: publicDiscussion.found
      ? 'Discovered public interview process insights.'
      : 'Public interview discussion unavailable for this company.',
  });

  // Stage 4: Generate Company Brief
  notify({
    stage: 'generating_brief',
    status: 'running',
    message: 'Synthesizing verified company brief...',
  });
  const companyBrief = await generateCompanyBrief(
    inferredCompany,
    companyUrl,
    crawlResult.pages,
    publicDiscussion.notes
  );
  notify({
    stage: 'generating_brief',
    status: 'completed',
    message: 'Company brief generated with verified sources.',
    data: { companyBrief },
  });

  // Stage 5: Categorized Question Generation
  notify({
    stage: 'generating_questions',
    status: 'running',
    message: 'Generating categorized interview question bank...',
  });

  const categories: QuestionCategory[] = ['technical', 'behavioural', 'system-design', 'company-fit'];
  const questions: Question[] = [];
  let questionCounter = 1;

  for (const cat of categories) {
    const catQuestions = await generateQuestionsForCategory(
      cat,
      role.requirements,
      role,
      companyBrief,
      questionCounter
    );
    questions.push(...catQuestions);
    questionCounter += catQuestions.length;
  }

  notify({
    stage: 'generating_questions',
    status: 'completed',
    message: `Generated initial bank of ${questions.length} categorized questions.`,
  });

  // Stage 6: Deterministic Coverage Check (Pass 1)
  notify({
    stage: 'checking_coverage',
    status: 'running',
    message: 'Checking deterministic question-to-requirement coverage...',
  });
  let coverageResult = checkCoverage(role.requirements, questions);
  let passes = 1;

  notify({
    stage: 'checking_coverage',
    status: 'completed',
    message: `Pass 1 coverage check: ${coverageResult.coveredRequirementIds.length}/${role.requirements.length} covered. Gaps: ${coverageResult.uncoveredMustRequirements.length} must-haves.`,
  });

  // Stage 7: Pass 2 - Closing Coverage Gaps
  if (coverageResult.uncoveredMustRequirements.length > 0) {
    notify({
      stage: 'closing_coverage_gaps',
      status: 'running',
      message: `Triggering Pass 2 to generate questions for ${coverageResult.uncoveredMustRequirements.length} uncovered must-have requirement(s)...`,
    });

    const gapQuestions = await generateGapQuestions(
      coverageResult.uncoveredMustRequirements,
      role,
      questionCounter
    );
    questions.push(...gapQuestions);
    questionCounter += gapQuestions.length;
    passes = 2;

    // Second deterministic coverage re-check
    coverageResult = checkCoverage(role.requirements, questions);

    notify({
      stage: 'closing_coverage_gaps',
      status: 'completed',
      message: `Pass 2 complete. Final must-have gaps: ${coverageResult.uncoveredMustRequirements.length}.`,
    });
  }

  // Stage 8: Generate Flashcards
  notify({
    stage: 'generating_flashcards',
    status: 'running',
    message: 'Generating revision flashcards...',
  });
  const flashcards = await generateFlashcards(role.requirements, role, companyBrief);
  notify({
    stage: 'generating_flashcards',
    status: 'completed',
    message: `Generated ${flashcards.length} revision flashcards.`,
  });

  // Stage 9: Deterministic Schedule Allocation
  notify({
    stage: 'creating_schedule',
    status: 'running',
    message: `Allocating ${daysCount}-day preparation schedule in application code...`,
  });
  const schedule = allocateSchedule(daysCount, questions, role.requirements);
  notify({
    stage: 'creating_schedule',
    status: 'completed',
    message: `Created ${schedule.days.length}-day balanced preparation schedule.`,
  });

  // Stage 10: Validation
  notify({
    stage: 'validating_kit',
    status: 'running',
    message: 'Validating final kit structure against Appendix A schema...',
  });

  const rawPagesUsed = crawlResult.pages.map(p => p.url);
  if (rawPagesUsed.length === 0 && companyUrl) rawPagesUsed.push(companyUrl);

  const internalKit: InternalKit = {
    source: {
      company: inferredCompany,
      company_url: companyUrl,
      role: role.title,
      location: 'Not Specified',
      jd_chars: jd.length,
      researched_at: new Date().toISOString(),
      pages_used: rawPagesUsed,
    },
    company_brief: companyBrief,
    role,
    questions: questions.map(q => ({
      ...q,
      origin: 'generated',
      is_edited: false,
      is_pinned: false,
    })),
    flashcards: flashcards.map(f => ({
      ...f,
      origin: 'generated',
      is_edited: false,
      is_pinned: false,
      confidence: undefined,
      practice_count: 0,
    })),
    schedule,
    coverage: {
      uncovered_requirement_ids: coverageResult.uncoveredRequirementIds,
      passes,
    },
    schedule_completed_days: [],
  };

  const validation = validateAppendixAKit(toAppendixAKit(internalKit));
  if (!validation.valid) {
    console.warn('[Pipeline] Kit validation warnings:', validation.errors);
  }

  notify({
    stage: 'validating_kit',
    status: validation.valid ? 'completed' : 'warning',
    message: validation.valid ? 'Kit successfully validated against Appendix A.' : 'Kit generated with minor schema warnings.',
  });

  return internalKit;
}
