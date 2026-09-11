// Appendix A & B TypeScript Specifications

export type RequirementKind = 'technical' | 'behavioural' | 'domain';
export type RequirementPriority = 'must' | 'nice';

export interface Requirement {
  id: string; // e.g. "r1", "r2"
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export interface RoleInfo {
  title: string;
  seniority: string;
  responsibilities: string[];
  requirements: Requirement[];
}

export interface SourceInfo {
  company: string;
  company_url: string;
  role: string;
  location: string;
  jd_chars: number;
  researched_at: string; // ISO 8601 string
  pages_used: string[];
}

export interface CompanyBrief {
  summary: string;
  what_they_do: string;
  sources: string[];
}

export type QuestionCategory = 'technical' | 'behavioural' | 'system-design' | 'company-fit';

export interface Question {
  id: string; // e.g. "q1", "q2"
  requirement_ids: string[];
  category: QuestionCategory;
  prompt: string;
  answer_outline: string;
  difficulty: 1 | 2 | 3;
}

export interface Flashcard {
  id: string; // e.g. "f1", "f2"
  front: string;
  back: string;
  requirement_ids: string[];
}

export interface ScheduleDay {
  day: number; // 1 to N
  focus: string;
  question_ids: string[];
  minutes: number; // integer minutes
}

export interface Schedule {
  days_available: number;
  days: ScheduleDay[];
}

export interface Coverage {
  uncovered_requirement_ids: string[];
  passes: number;
}

/**
 * Exact Appendix A Kit Structure.
 * This contract must remain unchanged for exports and batch CLI output.
 */
export interface AppendixAKit {
  source: SourceInfo;
  company_brief: CompanyBrief;
  role: RoleInfo;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: Schedule;
  coverage: Coverage;
}

// Internal workspace representations for state tracking and Practice Mode
export interface InternalQuestion extends Question {
  origin?: 'generated' | 'user_added';
  is_edited?: boolean;
  is_pinned?: boolean;
}

export interface InternalFlashcard extends Flashcard {
  origin?: 'generated' | 'user_added';
  is_edited?: boolean;
  is_pinned?: boolean;
  confidence?: 1 | 2 | 3;
  last_practiced_at?: string;
  practice_count?: number;
}

export interface InternalKit extends Omit<AppendixAKit, 'questions' | 'flashcards'> {
  _id?: any;
  userId?: any;
  createdAt?: string;
  updatedAt?: string;
  questions: InternalQuestion[];
  flashcards: InternalFlashcard[];
  schedule_completed_days?: number[];
}

/**
 * Strips internal tracking state to output strictly compliant Appendix A JSON.
 */
export function toAppendixAKit(internal: InternalKit | AppendixAKit): AppendixAKit {
  return {
    source: {
      company: internal.source.company || '',
      company_url: internal.source.company_url || '',
      role: internal.source.role || '',
      location: internal.source.location || '',
      jd_chars: internal.source.jd_chars || 0,
      researched_at: internal.source.researched_at || new Date().toISOString(),
      pages_used: [...(internal.source.pages_used || [])],
    },
    company_brief: {
      summary: internal.company_brief.summary || '',
      what_they_do: internal.company_brief.what_they_do || '',
      sources: [...(internal.company_brief.sources || [])],
    },
    role: {
      title: internal.role.title || '',
      seniority: internal.role.seniority || '',
      responsibilities: [...(internal.role.responsibilities || [])],
      requirements: internal.role.requirements.map(r => ({
        id: r.id,
        text: r.text,
        kind: r.kind,
        priority: r.priority,
      })),
    },
    questions: internal.questions.map(q => ({
      id: q.id,
      requirement_ids: [...q.requirement_ids],
      category: q.category,
      prompt: q.prompt,
      answer_outline: Array.isArray(q.answer_outline) ? q.answer_outline.join(' ') : String(q.answer_outline || ''),
      difficulty: q.difficulty,
    })),
    flashcards: internal.flashcards.map(f => ({
      id: f.id,
      front: f.front,
      back: f.back,
      requirement_ids: [...f.requirement_ids],
    })),
    schedule: {
      days_available: internal.schedule.days_available,
      days: internal.schedule.days.map(d => ({
        day: d.day,
        focus: d.focus,
        question_ids: [...d.question_ids],
        minutes: Math.round(d.minutes),
      })),
    },
    coverage: {
      uncovered_requirement_ids: [...(internal.coverage.uncovered_requirement_ids || [])],
      passes: internal.coverage.passes || 1,
    },
  };
}

// Appendix B Types
export interface BatchCaseInput {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

export interface BatchCaseSuccess {
  id: string;
  status: 'ok';
  kit: AppendixAKit;
  error: null;
}

export interface BatchCaseFailure {
  id: string;
  status: 'failed';
  kit: null;
  error: {
    code: string;
    message: string;
  };
}

export type BatchCaseOutput = BatchCaseSuccess | BatchCaseFailure;

export interface BatchOutput {
  version: string;
  generated_at: string;
  kits: BatchCaseOutput[];
}

// Pipeline progress reporting
export type PipelineStage =
  | 'extracting_jd'
  | 'crawling_company'
  | 'researching_interview'
  | 'generating_brief'
  | 'generating_questions'
  | 'checking_coverage'
  | 'closing_coverage_gaps'
  | 'generating_flashcards'
  | 'creating_schedule'
  | 'validating_kit';

export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'warning';

export interface PipelineProgressEvent {
  stage: PipelineStage;
  status: PipelineStageStatus;
  message: string;
  data?: Record<string, any>;
}
