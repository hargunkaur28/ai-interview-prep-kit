import { Requirement, Question } from '@trao/shared';

export interface CoverageAnalysis {
  coveredRequirementIds: string[];
  uncoveredRequirementIds: string[];
  uncoveredMustRequirements: Requirement[];
  uncoveredNiceRequirements: Requirement[];
  coverageRate: number; // 0 to 1
  isMustFullyCovered: boolean;
}

/**
 * Deterministically checks coverage between generated questions and extracted requirements.
 * This logic resides strictly in application code, never delegated to an LLM.
 */
export function checkCoverage(requirements: Requirement[], questions: Question[]): CoverageAnalysis {
  const coveredSet = new Set<string>();

  for (const q of questions) {
    if (Array.isArray(q.requirement_ids)) {
      for (const reqId of q.requirement_ids) {
        if (reqId) coveredSet.add(reqId);
      }
    }
  }

  const coveredRequirementIds: string[] = [];
  const uncoveredRequirementIds: string[] = [];
  const uncoveredMustRequirements: Requirement[] = [];
  const uncoveredNiceRequirements: Requirement[] = [];

  for (const req of requirements) {
    if (coveredSet.has(req.id)) {
      coveredRequirementIds.push(req.id);
    } else {
      uncoveredRequirementIds.push(req.id);
      if (req.priority === 'must') {
        uncoveredMustRequirements.push(req);
      } else {
        uncoveredNiceRequirements.push(req);
      }
    }
  }

  const total = requirements.length;
  const coverageRate = total > 0 ? coveredRequirementIds.length / total : 1.0;

  return {
    coveredRequirementIds,
    uncoveredRequirementIds,
    uncoveredMustRequirements,
    uncoveredNiceRequirements,
    coverageRate,
    isMustFullyCovered: uncoveredMustRequirements.length === 0,
  };
}
