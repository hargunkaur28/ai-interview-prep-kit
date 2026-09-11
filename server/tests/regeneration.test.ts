import { describe, it, expect } from 'vitest';
import { InternalQuestion, QuestionCategory } from '@trao/shared';

/**
 * Pure simulation of the server-side regeneration preservation logic.
 */
function simulateRegenerateCategory(
  questions: InternalQuestion[],
  targetCategory: QuestionCategory,
  freshlyGenerated: InternalQuestion[]
): InternalQuestion[] {
  // 1. Keep questions in targetCategory that are user_added, edited, or pinned
  const preservedInCat = questions.filter(
    q => q.category === targetCategory && (q.origin === 'user_added' || q.is_edited || q.is_pinned)
  );

  // 2. Keep questions in other categories completely untouched
  const otherCategories = questions.filter(q => q.category !== targetCategory);

  // 3. Return combined
  return [...otherCategories, ...preservedInCat, ...freshlyGenerated];
}

describe('Server-Side Regeneration Edit Preservation', () => {
  const initialQuestions: InternalQuestion[] = [
    {
      id: 'q1',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'Unmodified technical question',
      answer_outline: 'Default outline',
      difficulty: 2,
      origin: 'generated',
      is_edited: false,
      is_pinned: false,
    },
    {
      id: 'q2',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'User-edited technical question',
      answer_outline: 'Custom candidate notes',
      difficulty: 3,
      origin: 'generated',
      is_edited: true,
      is_pinned: false,
    },
    {
      id: 'q3',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'User-pinned technical question',
      answer_outline: 'Pinned outline',
      difficulty: 2,
      origin: 'generated',
      is_edited: false,
      is_pinned: true,
    },
    {
      id: 'q4',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'User-added custom question',
      answer_outline: 'User outline',
      difficulty: 1,
      origin: 'user_added',
      is_edited: false,
      is_pinned: false,
    },
    {
      id: 'q5',
      requirement_ids: ['r2'],
      category: 'behavioural',
      prompt: 'Behavioural question in another category',
      answer_outline: 'STAR response',
      difficulty: 2,
      origin: 'generated',
      is_edited: false,
      is_pinned: false,
    },
  ];

  it('preserves user-edited, user-pinned, and user-added questions while replacing unmodified generated ones', () => {
    const freshTechnical: InternalQuestion[] = [
      {
        id: 'q101',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Brand new technical question from LLM',
        answer_outline: 'New outline',
        difficulty: 2,
        origin: 'generated',
        is_edited: false,
        is_pinned: false,
      },
    ];

    const updated = simulateRegenerateCategory(initialQuestions, 'technical', freshTechnical);

    // q1 was unmodified generated -> must be replaced (not present)
    expect(updated.find(q => q.id === 'q1')).toBeUndefined();

    // q2 was edited -> preserved!
    const q2 = updated.find(q => q.id === 'q2');
    expect(q2).toBeDefined();
    expect(q2?.prompt).toBe('User-edited technical question');

    // q3 was pinned -> preserved!
    const q3 = updated.find(q => q.id === 'q3');
    expect(q3).toBeDefined();
    expect(q3?.is_pinned).toBe(true);

    // q4 was user_added -> preserved!
    const q4 = updated.find(q => q.id === 'q4');
    expect(q4).toBeDefined();
    expect(q4?.origin).toBe('user_added');

    // q5 was in behavioural category -> untouched!
    const q5 = updated.find(q => q.id === 'q5');
    expect(q5).toBeDefined();
    expect(q5?.category).toBe('behavioural');

    // q101 is newly added
    expect(updated.find(q => q.id === 'q101')).toBeDefined();
  });
});
