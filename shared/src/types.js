"use strict";
// Appendix A & B TypeScript Specifications
Object.defineProperty(exports, "__esModule", { value: true });
exports.toAppendixAKit = toAppendixAKit;
/**
 * Strips internal tracking state to output strictly compliant Appendix A JSON.
 */
function toAppendixAKit(internal) {
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
            answer_outline: q.answer_outline,
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
