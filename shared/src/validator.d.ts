export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
/**
 * Deterministically validates that a kit matches the exact Appendix A structure and invariants.
 */
export declare function validateAppendixAKit(kit: any): ValidationResult;
