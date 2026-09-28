import { describe, it, expect } from 'vitest';
import { computePriority } from './index';
import { createInitialMastery, markLearnCardDone, applyAttempt } from '@/engines/mastery';
import type { GrammarMastery } from '@/domain/mastery';
import type { PriorityContext } from './index';
import type { Attempt } from '@/domain/attempt';
import type { Question } from '@/domain/question';

const NOW = new Date('2026-09-28T09:00:00.000Z');

function mastery(over: Partial<GrammarMastery> = {}): GrammarMastery {
  return { ...createInitialMastery(over.grammarId ?? 'g1'), state: 'INTRODUCED', baseRank: 'INTRODUCED', ...over };
}

const ctx = {
  timeline: { currentPhase: 'PHASE_1_KNOW', mode: 'NORMAL', isNearExam: false },
  weakness: {},
  now: NOW,
  seenTodayGrammarIds: [],
  signals: {},
} as unknown as PriorityContext;

describe('Dấu sao của người học (CLAUDE.md §14.1 — learnerFlag)', () => {
  it('mẫu có ★ được ưu tiên hơn mẫu CÙNG HẠNG không ★', () => {
    const plain = computePriority(mastery({ grammarId: 'g1' }), ctx);
    const starred = computePriority(mastery({ grammarId: 'g2', starredAt: NOW.toISOString() }), ctx);
    expect(starred).toBeGreaterThan(plain);
  });

  it('nhưng KHÔNG đè được mẫu đang hỏng thật sự', () => {
    // Người học nêu nguyện vọng; dữ liệu vẫn nói tiếng nói cuối cùng.
    const starredOk = computePriority(
      mastery({ grammarId: 'g1', starredAt: NOW.toISOString() }),
      ctx,
    );
    const confused = computePriority(
      mastery({ grammarId: 'g2', state: 'CONFUSED', confusedPair: 'x' }),
      ctx,
    );
    expect(confused).toBeGreaterThan(starredOk);
  });

  it('★ tự gỡ khi mẫu đã lên COMPARABLE', () => {
    const start: GrammarMastery = {
      ...markLearnCardDone(createInitialMastery('g1'), NOW),
      state: 'COMPARABLE',
      baseRank: 'COMPARABLE',
      starredAt: NOW.toISOString(),
    };
    const attempt = {
      attemptId: 'a1', questionId: 'q1', grammarId: 'g1', sessionId: 's', phase: 'PHASE_2_COMPARE',
      blockType: 'APPLY', isTimed: false, selectedAnswer: 'a', correctAnswer: 'a', isCorrect: true,
      responseTimeMs: 10_000, confidence: 'CONFIDENT', timestamp: NOW.toISOString(),
      questionType: 'MINIMAL_PAIR', delivery: 'PRACTICE', verified: true, dayKey: '2026-09-28',
    } as Attempt;
    const q = { id: 'q1', type: 'MINIMAL_PAIR', verificationStatus: 'VERIFIED', choices: [] } as unknown as Question;

    const res = applyAttempt(start, attempt, q, NOW, { priorAttempts: [] });
    expect(res.mastery.starredAt).toBeUndefined();
  });

  it('★ KHÔNG tự gỡ khi mẫu còn yếu', () => {
    const start: GrammarMastery = {
      ...markLearnCardDone(createInitialMastery('g1'), NOW),
      state: 'INTRODUCED', baseRank: 'INTRODUCED', starredAt: NOW.toISOString(),
    };
    const attempt = {
      attemptId: 'a1', questionId: 'q1', grammarId: 'g1', sessionId: 's', phase: 'PHASE_1_KNOW',
      blockType: 'RECALL', isTimed: false, selectedAnswer: 'a', correctAnswer: 'a', isCorrect: true,
      responseTimeMs: 10_000, confidence: 'CONFIDENT', timestamp: NOW.toISOString(),
      questionType: 'MEANING_MC', delivery: 'STUDY', verified: true, dayKey: '2026-09-28',
    } as Attempt;
    const q = { id: 'q1', type: 'MEANING_MC', verificationStatus: 'VERIFIED', choices: [] } as unknown as Question;

    expect(applyAttempt(start, attempt, q, NOW, { priorAttempts: [] }).mastery.starredAt).toBe(NOW.toISOString());
  });
});
