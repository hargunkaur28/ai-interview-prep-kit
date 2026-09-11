import { Requirement, Question, Schedule, ScheduleDay } from '@trao/shared';

/**
 * Deterministically distributes questions and requirements across exactly N days.
 * Rules:
 * 1. Schedule length equals exactly days_available.
 * 2. Every must-have requirement with a generated question appears somewhere in the schedule.
 * 3. Harder and higher-priority material lands earlier.
 * 4. Minutes are integers.
 * 5. All referenced question IDs exist in questions.
 */
export function allocateSchedule(
  daysAvailable: number,
  questions: Question[],
  requirements: Requirement[]
): Schedule {
  const daysCount = Math.max(1, Math.floor(daysAvailable));
  const validQuestions = questions.filter(q => q && q.id);

  if (validQuestions.length === 0) {
    // Fallback for empty questions
    return {
      days_available: daysCount,
      days: Array.from({ length: daysCount }, (_, i) => ({
        day: i + 1,
        focus: i === 0 ? 'General Preparation & Research' : 'Review & Practice',
        question_ids: [],
        minutes: 45,
      })),
    };
  }

  // Map must-have requirements
  const mustReqIds = new Set(
    requirements.filter(r => r.priority === 'must').map(r => r.id)
  );

  // Score each question to order: higher priority/difficulty first
  const scoredQuestions = [...validQuestions].map(q => {
    const coversMust = q.requirement_ids.some(id => mustReqIds.has(id));
    let catWeight = 0;
    if (q.category === 'system-design') catWeight = 3;
    else if (q.category === 'technical') catWeight = 2;
    else if (q.category === 'behavioural') catWeight = 1;

    const score = (coversMust ? 100 : 0) + q.difficulty * 10 + catWeight;
    return { question: q, score };
  });

  // Sort descending: highest impact and difficulty first
  scoredQuestions.sort((a, b) => b.score - a.score);
  const sortedQuestions = scoredQuestions.map(s => s.question);

  const days: ScheduleDay[] = [];

  if (daysCount === 1) {
    // Single-day schedule: condense all primary questions into an intensive session
    days.push({
      day: 1,
      focus: 'Intensive Review: Core Technical, Architecture & Behavioral Alignment',
      question_ids: sortedQuestions.map(q => q.id),
      minutes: Math.min(180, Math.max(60, sortedQuestions.length * 15)),
    });

    return { days_available: 1, days };
  }

  // Multi-day distribution
  // Initialize buckets for each day
  const dayBuckets: string[][] = Array.from({ length: daysCount }, () => []);

  // Guarantee that every must-have requirement that has a question is scheduled
  const scheduledQuestions = new Set<string>();

  // Distribute questions across days
  sortedQuestions.forEach((q, idx) => {
    // Spread questions sequentially or wrap around if days > questions
    const targetDayIndex = idx % daysCount;
    dayBuckets[targetDayIndex].push(q.id);
    scheduledQuestions.add(q.id);
  });

  // If days > questions, distribute reviews of top questions so no day is empty
  for (let d = 0; d < daysCount; d++) {
    if (dayBuckets[d].length === 0) {
      // Pick a question from earlier days for reinforcement/review
      const reviewQ = sortedQuestions[d % sortedQuestions.length];
      dayBuckets[d].push(reviewQ.id);
    }
  }

  // Construct day entries with thematic focus and integer minutes
  for (let i = 0; i < daysCount; i++) {
    const dayNumber = i + 1;
    const qIds = dayBuckets[i];
    const qObjects = qIds.map(id => validQuestions.find(q => q.id === id)).filter(Boolean) as Question[];

    let focus = '';
    const isFirstDay = i === 0;
    const isLastDay = i === daysCount - 1;
    const hasSysDesign = qObjects.some(q => q.category === 'system-design');
    const hasTechnical = qObjects.some(q => q.category === 'technical');
    const hasBehavioural = qObjects.some(q => q.category === 'behavioural');
    const hasCompanyFit = qObjects.some(q => q.category === 'company-fit');

    if (isFirstDay) {
      focus = 'Core Must-Have Requirements & Technical Fundamentals';
    } else if (isLastDay) {
      focus = 'Company Fit, Behavioral Stories & Final Interview Readiness';
    } else if (hasSysDesign) {
      focus = 'System Architecture, Scalability & Design Trade-offs';
    } else if (hasTechnical) {
      focus = 'Deep-Dive Technical Implementation & Problem Solving';
    } else if (hasBehavioural || hasCompanyFit) {
      focus = 'Leadership, Collaboration & Scenario-Based Questions';
    } else {
      focus = `Day ${dayNumber} Focus: Applied Concepts & Targeted Practice`;
    }

    // Integer minutes calculation: base 30m + 15m per question, clamped
    const calculatedMinutes = Math.round(Math.max(30, 20 + qIds.length * 15));

    days.push({
      day: dayNumber,
      focus,
      question_ids: qIds,
      minutes: calculatedMinutes,
    });
  }

  return {
    days_available: daysCount,
    days,
  };
}
