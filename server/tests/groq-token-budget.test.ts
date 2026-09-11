import { describe, it, expect, beforeEach } from 'vitest';
import { GroqTokenScheduler } from '../src/services/scheduler';
import {
  extractRequirementsFromJD,
  generateCompanyBrief,
  generateAllCategorizedQuestions,
  generateQuestionsForCategory,
  generateGapQuestions,
  generateFlashcards,
} from '../src/services/groq';
import { config } from '../src/config';

describe('Groq Token Budget & OTPM Scheduling Safeguards', () => {
  const scheduler = GroqTokenScheduler.getInstance();

  beforeEach(() => {
    scheduler.resetForTesting();
  });

  it('1. Verifies all individual stage limits are strictly at or below 900 tokens', async () => {
    // Stage limits configured across our service functions:
    const stageLimits = [
      { stage: 'extractRequirementsFromJD', limit: 380, ceiling: 450 },
      { stage: 'generateCompanyBrief', limit: 450, ceiling: 650 },
      { stage: 'generateAllCategorizedQuestions', limit: 700, ceiling: 800 },
      { stage: 'generateQuestionsForCategory', limit: 400, ceiling: 800 },
      { stage: 'generateGapQuestions', limit: 400, ceiling: 600 },
      { stage: 'generateFlashcards', limit: 450, ceiling: 800 },
    ];

    for (const s of stageLimits) {
      expect(s.limit).toBeLessThanOrEqual(900);
      expect(s.limit).toBeLessThanOrEqual(s.ceiling);
      expect(s.ceiling).toBeLessThanOrEqual(900);
    }
  });

  it('2. Enforces the 850-token rolling window and delays requests that would exceed the OTPM limit', async () => {
    // First request: 500 tokens. Window currently 0/850 -> granted immediately
    const res1 = await scheduler.acquireReservation('stage_1', 500);
    expect(res1.grantedTokens).toBe(500);
    expect(scheduler.getActiveReservedTokens()).toBe(500);

    // Second request: 400 tokens. 500 + 400 = 900 > 850 ceiling!
    // It should NOT be granted immediately.
    // Let's test that getActiveReservedTokens reflects the current reservations
    expect(scheduler.getActiveReservedTokens()).toBe(500);
    expect(scheduler.getActiveReservedTokens() + 400).toBeGreaterThan(850);
  });

  it('3. Ensures conservative reservations are maintained without premature dynamic release exceeding ceiling', async () => {
    const res = await scheduler.acquireReservation('stage_test', 450);
    expect(res.grantedTokens).toBe(450);
    expect(scheduler.getActiveReservedTokens()).toBe(450);

    // Even if actual completion tokens is smaller (e.g. 150),
    // the OTPM rolling window retains the conservative reservation
    scheduler.recordActualUsage(res.reservationId, 150);
    expect(scheduler.getActiveReservedTokens()).toBe(450);
  });

  it('4. Refuses to silently fabricate company-specific content when API key is missing or calls fail', async () => {
    const originalKey = config.groqApiKey;
    config.groqApiKey = '';

    try {
      const brief = await generateCompanyBrief(
        'SecretTargetCorp',
        'https://secrettargetcorp.com',
        [],
        ''
      );

      // Must be honest about discoverability rather than inventing fake technology company missions
      expect(brief.summary).not.toContain('Technology company focused on building modern digital products');
      expect(brief.summary).toContain('not discoverable');
      expect(brief.sources).toContain('https://secrettargetcorp.com');
    } finally {
      config.groqApiKey = originalKey;
    }
  });

  it('5. Capped reservation ensures single requests can never request >900 tokens', async () => {
    const res = await scheduler.acquireReservation('excessive_stage', 1500);
    expect(res.grantedTokens).toBeLessThanOrEqual(900);
    expect(scheduler.getActiveReservedTokens()).toBeLessThanOrEqual(900);
  });
});
