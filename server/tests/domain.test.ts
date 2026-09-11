import { describe, it, expect } from 'vitest';
import { allocateSchedule } from '../src/domain/scheduler';
import { checkCoverage } from '../src/domain/coverage';
import { validateAppendixAKit } from '@trao/shared';
import { Requirement, Question, AppendixAKit } from '@trao/shared';

describe('Deterministic Scheduler', () => {
  const sampleRequirements: Requirement[] = [
    { id: 'r1', text: '5+ years with React', kind: 'technical', priority: 'must' },
    { id: 'r2', text: 'Distributed systems & Node.js', kind: 'technical', priority: 'must' },
    { id: 'r3', text: 'Mentoring junior engineers', kind: 'behavioural', priority: 'nice' },
  ];

  const sampleQuestions: Question[] = [
    {
      id: 'q1',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'Explain React Fiber reconciliation.',
      answer_outline: 'Virtual DOM, scheduling, concurrency.',
      difficulty: 2,
    },
    {
      id: 'q2',
      requirement_ids: ['r2'],
      category: 'system-design',
      prompt: 'Design a high-throughput event streaming system.',
      answer_outline: 'Partitioning, consensus, backpressure.',
      difficulty: 3,
    },
    {
      id: 'q3',
      requirement_ids: ['r3'],
      category: 'behavioural',
      prompt: 'Describe how you mentor struggling teammates.',
      answer_outline: 'Patience, 1-on-1s, incremental goals.',
      difficulty: 1,
    },
  ];

  it('allocates exactly 5 days when 5 days are requested', () => {
    const schedule = allocateSchedule(5, sampleQuestions, sampleRequirements);
    expect(schedule.days_available).toBe(5);
    expect(schedule.days.length).toBe(5);
    schedule.days.forEach((day, idx) => {
      expect(day.day).toBe(idx + 1);
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThan(0);
      expect(day.focus.length).toBeGreaterThan(0);
    });
  });

  it('handles 1-day schedule correctly', () => {
    const schedule = allocateSchedule(1, sampleQuestions, sampleRequirements);
    expect(schedule.days_available).toBe(1);
    expect(schedule.days.length).toBe(1);
    expect(schedule.days[0].question_ids).toContain('q1');
    expect(schedule.days[0].question_ids).toContain('q2');
    expect(Number.isInteger(schedule.days[0].minutes)).toBe(true);
  });

  it('handles 60-day schedule without gaps or non-integers', () => {
    const schedule = allocateSchedule(60, sampleQuestions, sampleRequirements);
    expect(schedule.days_available).toBe(60);
    expect(schedule.days.length).toBe(60);
    schedule.days.forEach(day => {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.question_ids.length).toBeGreaterThan(0);
    });
  });

  it('prioritizes harder/must-have questions on Day 1', () => {
    const schedule = allocateSchedule(3, sampleQuestions, sampleRequirements);
    // q2 is difficulty 3 and covers must-have requirement r2
    expect(schedule.days[0].question_ids).toContain('q2');
  });

  it('guarantees every referenced question ID exists', () => {
    const validIds = new Set(sampleQuestions.map(q => q.id));
    const schedule = allocateSchedule(5, sampleQuestions, sampleRequirements);
    schedule.days.forEach(day => {
      day.question_ids.forEach(qId => {
        expect(validIds.has(qId)).toBe(true);
      });
    });
  });
});

describe('Deterministic Coverage Checker', () => {
  const reqs: Requirement[] = [
    { id: 'r1', text: 'React', kind: 'technical', priority: 'must' },
    { id: 'r2', text: 'SQL', kind: 'technical', priority: 'must' },
    { id: 'r3', text: 'GraphQL', kind: 'technical', priority: 'nice' },
  ];

  it('detects uncovered must requirements accurately', () => {
    const partialQuestions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'React state hook internals',
        answer_outline: 'useState vs useReducer',
        difficulty: 2,
      },
    ];

    const result = checkCoverage(reqs, partialQuestions);
    expect(result.coveredRequirementIds).toEqual(['r1']);
    expect(result.uncoveredRequirementIds).toContain('r2');
    expect(result.uncoveredRequirementIds).toContain('r3');
    expect(result.uncoveredMustRequirements.map(r => r.id)).toEqual(['r2']);
    expect(result.isMustFullyCovered).toBe(false);
  });

  it('reports complete coverage when all must requirements have questions', () => {
    const completeQuestions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'React state hook internals',
        answer_outline: 'useState vs useReducer',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'technical',
        prompt: 'SQL indexing',
        answer_outline: 'B-tree indexes and query plans',
        difficulty: 2,
      },
    ];

    const result = checkCoverage(reqs, completeQuestions);
    expect(result.uncoveredMustRequirements).toHaveLength(0);
    expect(result.isMustFullyCovered).toBe(true);
  });
});

describe('Appendix A Kit Validator', () => {
  const validKit: AppendixAKit = {
    source: {
      company: 'Acme Corp',
      company_url: 'https://acme.com',
      role: 'Backend Engineer',
      location: 'Remote',
      jd_chars: 500,
      researched_at: '2026-09-01T12:00:00Z',
      pages_used: ['https://acme.com/about'],
    },
    company_brief: {
      summary: 'Acme builds logistics software.',
      what_they_do: 'Freight automation and supply chain.',
      sources: ['https://acme.com/about'],
    },
    role: {
      title: 'Backend Engineer',
      seniority: 'Mid-Level',
      responsibilities: ['Build APIs', 'Optimize database queries'],
      requirements: [
        { id: 'r1', text: 'Go / Python', kind: 'technical', priority: 'must' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Explain Go goroutine scheduling.',
        answer_outline: 'M:N scheduler with work stealing.',
        difficulty: 2,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is a goroutine?',
        back: 'A lightweight execution thread managed by Go runtime.',
        requirement_ids: ['r1'],
      },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: 'Go Core', question_ids: ['q1'], minutes: 60 },
        { day: 2, focus: 'Review', question_ids: ['q1'], minutes: 45 },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  };

  it('validates a conformant Appendix A kit', () => {
    const result = validateAppendixAKit(validKit);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects kits with missing or invalid categories', () => {
    const invalid = JSON.parse(JSON.stringify(validKit));
    invalid.questions[0].category = 'invalid-category';
    const result = validateAppendixAKit(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('category must be'))).toBe(true);
  });

  it('rejects kits with float minutes in schedule', () => {
    const invalid = JSON.parse(JSON.stringify(validKit));
    invalid.schedule.days[0].minutes = 45.5;
    const result = validateAppendixAKit(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('minutes must be an integer'))).toBe(true);
  });
});
