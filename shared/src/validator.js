"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAppendixAKit = validateAppendixAKit;
/**
 * Deterministically validates that a kit matches the exact Appendix A structure and invariants.
 */
function validateAppendixAKit(kit) {
    const errors = [];
    if (!kit || typeof kit !== 'object') {
        return { valid: false, errors: ['Kit must be a valid JSON object'] };
    }
    // 1. Source
    if (!kit.source || typeof kit.source !== 'object') {
        errors.push('Missing or invalid "source" object');
    }
    else {
        if (typeof kit.source.company !== 'string')
            errors.push('source.company must be a string');
        if (typeof kit.source.company_url !== 'string')
            errors.push('source.company_url must be a string');
        if (typeof kit.source.role !== 'string')
            errors.push('source.role must be a string');
        if (typeof kit.source.location !== 'string')
            errors.push('source.location must be a string');
        if (typeof kit.source.jd_chars !== 'number')
            errors.push('source.jd_chars must be a number');
        if (typeof kit.source.researched_at !== 'string')
            errors.push('source.researched_at must be an ISO date string');
        if (!Array.isArray(kit.source.pages_used))
            errors.push('source.pages_used must be an array of strings');
    }
    // 2. Company Brief
    if (!kit.company_brief || typeof kit.company_brief !== 'object') {
        errors.push('Missing or invalid "company_brief" object');
    }
    else {
        if (typeof kit.company_brief.summary !== 'string')
            errors.push('company_brief.summary must be a string');
        if (typeof kit.company_brief.what_they_do !== 'string')
            errors.push('company_brief.what_they_do must be a string');
        if (!Array.isArray(kit.company_brief.sources))
            errors.push('company_brief.sources must be an array of strings');
    }
    // 3. Role & Requirements
    const requirementIds = new Set();
    if (!kit.role || typeof kit.role !== 'object') {
        errors.push('Missing or invalid "role" object');
    }
    else {
        if (typeof kit.role.title !== 'string')
            errors.push('role.title must be a string');
        if (typeof kit.role.seniority !== 'string')
            errors.push('role.seniority must be a string');
        if (!Array.isArray(kit.role.responsibilities))
            errors.push('role.responsibilities must be an array');
        if (!Array.isArray(kit.role.requirements)) {
            errors.push('role.requirements must be an array');
        }
        else {
            kit.role.requirements.forEach((req, index) => {
                if (!req.id || typeof req.id !== 'string') {
                    errors.push(`Requirement at index ${index} is missing a string "id"`);
                }
                else {
                    if (requirementIds.has(req.id)) {
                        errors.push(`Duplicate requirement id: "${req.id}"`);
                    }
                    requirementIds.add(req.id);
                }
                if (typeof req.text !== 'string' || !req.text.trim()) {
                    errors.push(`Requirement "${req.id || index}" has empty or invalid text`);
                }
                if (!['technical', 'behavioural', 'domain'].includes(req.kind)) {
                    errors.push(`Requirement "${req.id || index}" kind must be "technical", "behavioural", or "domain" (got "${req.kind}")`);
                }
                if (!['must', 'nice'].includes(req.priority)) {
                    errors.push(`Requirement "${req.id || index}" priority must be "must" or "nice" (got "${req.priority}")`);
                }
            });
        }
    }
    // 4. Questions
    const questionIds = new Set();
    if (!Array.isArray(kit.questions)) {
        errors.push('"questions" must be an array');
    }
    else {
        kit.questions.forEach((q, index) => {
            if (!q.id || typeof q.id !== 'string') {
                errors.push(`Question at index ${index} missing a string "id"`);
            }
            else {
                if (questionIds.has(q.id)) {
                    errors.push(`Duplicate question id: "${q.id}"`);
                }
                questionIds.add(q.id);
            }
            if (!Array.isArray(q.requirement_ids)) {
                errors.push(`Question "${q.id || index}" requirement_ids must be an array`);
            }
            else {
                q.requirement_ids.forEach((reqId) => {
                    if (!requirementIds.has(reqId)) {
                        errors.push(`Question "${q.id || index}" references non-existent requirement id "${reqId}"`);
                    }
                });
            }
            if (!['technical', 'behavioural', 'system-design', 'company-fit'].includes(q.category)) {
                errors.push(`Question "${q.id || index}" category must be "technical", "behavioural", "system-design", or "company-fit" (got "${q.category}")`);
            }
            if (typeof q.prompt !== 'string')
                errors.push(`Question "${q.id || index}" prompt must be a string`);
            if (typeof q.answer_outline !== 'string')
                errors.push(`Question "${q.id || index}" answer_outline must be a string`);
            if (![1, 2, 3].includes(q.difficulty)) {
                errors.push(`Question "${q.id || index}" difficulty must be 1, 2, or 3 (got "${q.difficulty}")`);
            }
        });
    }
    // 5. Flashcards
    const flashcardIds = new Set();
    if (!Array.isArray(kit.flashcards)) {
        errors.push('"flashcards" must be an array');
    }
    else {
        kit.flashcards.forEach((f, index) => {
            if (!f.id || typeof f.id !== 'string') {
                errors.push(`Flashcard at index ${index} missing a string "id"`);
            }
            else {
                if (flashcardIds.has(f.id)) {
                    errors.push(`Duplicate flashcard id: "${f.id}"`);
                }
                flashcardIds.add(f.id);
            }
            if (typeof f.front !== 'string')
                errors.push(`Flashcard "${f.id || index}" front must be a string`);
            if (typeof f.back !== 'string')
                errors.push(`Flashcard "${f.id || index}" back must be a string`);
            if (Array.isArray(f.requirement_ids)) {
                f.requirement_ids.forEach((reqId) => {
                    if (!requirementIds.has(reqId)) {
                        errors.push(`Flashcard "${f.id || index}" references non-existent requirement id "${reqId}"`);
                    }
                });
            }
        });
    }
    // 6. Schedule
    if (!kit.schedule || typeof kit.schedule !== 'object') {
        errors.push('Missing or invalid "schedule" object');
    }
    else {
        if (typeof kit.schedule.days_available !== 'number' || kit.schedule.days_available <= 0) {
            errors.push('schedule.days_available must be a positive number');
        }
        if (!Array.isArray(kit.schedule.days)) {
            errors.push('schedule.days must be an array');
        }
        else {
            if (kit.schedule.days.length !== kit.schedule.days_available) {
                errors.push(`schedule.days length (${kit.schedule.days.length}) must equal days_available (${kit.schedule.days_available})`);
            }
            kit.schedule.days.forEach((d, index) => {
                if (d.day !== index + 1) {
                    errors.push(`schedule.days[${index}] day number must be ${index + 1} (got ${d.day})`);
                }
                if (typeof d.focus !== 'string')
                    errors.push(`schedule.days[${index}].focus must be a string`);
                if (!Number.isInteger(d.minutes)) {
                    errors.push(`schedule.days[${index}].minutes must be an integer (got ${d.minutes})`);
                }
                if (!Array.isArray(d.question_ids)) {
                    errors.push(`schedule.days[${index}].question_ids must be an array`);
                }
                else {
                    d.question_ids.forEach((qId) => {
                        if (!questionIds.has(qId)) {
                            errors.push(`schedule.days[${index}] references non-existent question id "${qId}"`);
                        }
                    });
                }
            });
        }
    }
    // 7. Coverage
    if (!kit.coverage || typeof kit.coverage !== 'object') {
        errors.push('Missing or invalid "coverage" object');
    }
    else {
        if (!Array.isArray(kit.coverage.uncovered_requirement_ids)) {
            errors.push('coverage.uncovered_requirement_ids must be an array');
        }
        if (typeof kit.coverage.passes !== 'number') {
            errors.push('coverage.passes must be an integer');
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
