export type RequirementKind = 'technical' | 'behavioural' | 'domain';
export type RequirementPriority = 'must' | 'nice';
export interface Requirement {
    id: string;
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
    researched_at: string;
    pages_used: string[];
}
export interface CompanyBrief {
    summary: string;
    what_they_do: string;
    sources: string[];
}
export type QuestionCategory = 'technical' | 'behavioural' | 'system-design' | 'company-fit';
export interface Question {
    id: string;
    requirement_ids: string[];
    category: QuestionCategory;
    prompt: string;
    answer_outline: string;
    difficulty: 1 | 2 | 3;
}
export interface Flashcard {
    id: string;
    front: string;
    back: string;
    requirement_ids: string[];
}
export interface ScheduleDay {
    day: number;
    focus: string;
    question_ids: string[];
    minutes: number;
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
    _id?: string;
    userId?: string;
    createdAt?: string;
    updatedAt?: string;
    questions: InternalQuestion[];
    flashcards: InternalFlashcard[];
    schedule_completed_days?: number[];
}
/**
 * Strips internal tracking state to output strictly compliant Appendix A JSON.
 */
export declare function toAppendixAKit(internal: InternalKit | AppendixAKit): AppendixAKit;
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
export type PipelineStage = 'extracting_jd' | 'crawling_company' | 'researching_interview' | 'generating_brief' | 'generating_questions' | 'checking_coverage' | 'closing_coverage_gaps' | 'generating_flashcards' | 'creating_schedule' | 'validating_kit';
export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'warning';
export interface PipelineProgressEvent {
    stage: PipelineStage;
    status: PipelineStageStatus;
    message: string;
    data?: Record<string, any>;
}
