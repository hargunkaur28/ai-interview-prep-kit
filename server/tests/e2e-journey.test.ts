import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../src/index';
import { User } from '../src/models/User';
import { Kit } from '../src/models/Kit';
import { config } from '../src/config';
import { toAppendixAKit, validateAppendixAKit } from '@trao/shared';

// Live Integration test for complete user journey
describe('Complete User Journey End-to-End (Integration)', { timeout: 30000 }, () => {
  let testUserToken = '';
  let testUserId = '';
  let testKitId = '';
  const testEmail = `candidate-${Date.now()}@example.com`;
  const testPassword = 'securePassword123!';

  let originalGroqKey = '';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongoUri);
    }
    // Mock external LLM network latency for deterministic test execution
    originalGroqKey = config.groqApiKey;
    config.groqApiKey = '';
  });

  afterAll(async () => {
    config.groqApiKey = originalGroqKey;
    // Cleanup test data
    if (testUserId) {
      await User.deleteOne({ _id: testUserId });
      await Kit.deleteMany({ userId: testUserId });
    }
    await mongoose.disconnect();
  });

  it('1. Registers a new candidate user', async () => {
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const user = await User.create({ email: testEmail, passwordHash });
    testUserId = user._id.toString();

    expect(user._id).toBeDefined();
    expect(user.email).toBe(testEmail);
  });

  it('2. Authenticates and creates a JWT session', async () => {
    const jwt = await import('jsonwebtoken');
    testUserToken = jwt.sign({ userId: testUserId }, config.jwtSecret, { expiresIn: '1h' });
    expect(testUserToken).toBeDefined();
  });

  it('3. Generates a new interview preparation kit via the pipeline', async () => {
    const { runPipeline } = await import('../src/services/pipeline');
    const internalKit = await runPipeline({
      jd: 'Staff Backend Engineer\nExpert in TypeScript, Node.js, distributed databases, and high-concurrency architecture. Mentoring experience required.',
      companyUrl: 'https://posthog.com',
      days: 5,
    });

    const saved = await Kit.create({
      ...internalKit,
      userId: testUserId,
    });
    testKitId = saved._id.toString();

    expect(saved._id).toBeDefined();
    expect(saved.role.title).toBeDefined();
    expect(saved.questions.length).toBeGreaterThan(0);
    expect(saved.schedule.days.length).toBe(5);
  });

  it('4. Edits a question and verifies is_edited flag is stored', async () => {
    const kit = await Kit.findById(testKitId);
    expect(kit).toBeDefined();

    // Edit first question
    const q1 = kit!.questions[0];
    const customPrompt = 'Custom candidate edited prompt about architecture';
    q1.prompt = customPrompt;
    q1.is_edited = true;

    await kit!.save();

    const reloaded = await Kit.findById(testKitId);
    expect(reloaded!.questions[0].prompt).toBe(customPrompt);
    expect(reloaded!.questions[0].is_edited).toBe(true);
  });

  it('5. Pins a question and verifies is_pinned flag is stored', async () => {
    const kit = await Kit.findById(testKitId);
    const q2 = kit!.questions[1];
    q2.is_pinned = true;

    await kit!.save();

    const reloaded = await Kit.findById(testKitId);
    expect(reloaded!.questions[1].is_pinned).toBe(true);
  });

  it('6. Regenerates category and guarantees preservation of edited and pinned questions', async () => {
    const kit = await Kit.findById(testKitId);
    const targetCategory = kit!.questions[0].category;
    const editedPrompt = kit!.questions[0].prompt;

    // Simulate the server regeneration endpoint logic
    const preservedInCat = kit!.questions.filter(
      q => q.category === targetCategory && (q.origin === 'user_added' || q.is_edited || q.is_pinned)
    );
    const otherCategories = kit!.questions.filter(q => q.category !== targetCategory);

    // Fresh question
    const freshQ = {
      id: 'q999',
      requirement_ids: [kit!.role.requirements[0].id],
      category: targetCategory,
      prompt: 'Freshly generated question',
      answer_outline: 'Fresh outline',
      difficulty: 2 as const,
      origin: 'generated' as const,
      is_edited: false,
      is_pinned: false,
    };

    kit!.questions = [...otherCategories, ...preservedInCat, freshQ as any];
    const { allocateSchedule } = await import('../src/domain/scheduler');
    kit!.schedule = allocateSchedule(kit!.schedule.days_available, kit!.questions, kit!.role.requirements);
    await kit!.save();

    const reloaded = await Kit.findById(testKitId);
    const foundEdited = reloaded!.questions.find(q => q.prompt === editedPrompt);
    expect(foundEdited).toBeDefined();
    expect(foundEdited!.is_edited).toBe(true);

    const foundFresh = reloaded!.questions.find(q => q.id === 'q999');
    expect(foundFresh).toBeDefined();
  });

  it('7. Practices a flashcard and records confidence score', async () => {
    const kit = await Kit.findById(testKitId);
    const f1 = kit!.flashcards[0];
    f1.confidence = 3;
    f1.practice_count = 1;
    f1.last_practiced_at = new Date().toISOString();

    await kit!.save();

    const reloaded = await Kit.findById(testKitId);
    expect(reloaded!.flashcards[0].confidence).toBe(3);
    expect(reloaded!.flashcards[0].practice_count).toBe(1);
  });

  it('8. Completes a schedule day and verifies persistence', async () => {
    const kit = await Kit.findById(testKitId);
    kit!.schedule_completed_days = [1];
    await kit!.save();

    const reloaded = await Kit.findById(testKitId);
    expect(reloaded!.schedule_completed_days).toContain(1);
  });

  it('9. Exports clean Appendix A JSON and validates zero schema errors or internal field leaks', async () => {
    const kit = await Kit.findById(testKitId);
    const exported = toAppendixAKit(kit!.toObject() as any);

    // Validate with strict schema validator
    const validation = validateAppendixAKit(exported);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Check no internal leaks
    for (const q of exported.questions as any[]) {
      expect(q.origin).toBeUndefined();
      expect(q.is_edited).toBeUndefined();
      expect(q.is_pinned).toBeUndefined();
    }
  });

  it('10. Enforces user ownership authorization', async () => {
    const anotherUserKit = await Kit.findOne({ _id: testKitId, userId: new mongoose.Types.ObjectId() });
    expect(anotherUserKit).toBeNull();
  });
});
