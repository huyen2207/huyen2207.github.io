import { describe, it, expect } from 'vitest';
import { buildErrorMaterials } from '@/app/services/sessionService';
import { listQuestions } from '@/content/repository';
import { createInitialMastery, markLearnCardDone } from '@/engines/mastery';
import type { EngineContext } from '@/app/services/context';
import type { Attempt } from '@/domain/attempt';

const NOW = new Date('2026-09-12T09:00:00.000Z');
const DAY = '2026-09-12';

function wrongAttempt(id: string, questionId: string, grammarId: string): Attempt {
  return {
    attemptId: id,
    questionId,
    grammarId,
    sessionId: 's1',
    phase: 'PHASE_1_KNOW',
    blockType: 'APPLY',
    isTimed: false,
    selectedAnswer: 'x',
    correctAnswer: 'y',
    isCorrect: false,
    responseTimeMs: 12_000,
    confidence: 'UNSURE',
    timestamp: NOW.toISOString(),
    questionType: 'CLOZE_MC',
    delivery: 'PRACTICE',
    verified: true,
    dayKey: DAY,
  } as Attempt;
}

/** Chỉ dựng đúng những trường mà buildErrorMaterials đụng tới. */
function ctxWith(attempts: Attempt[], taught: string[]): EngineContext {
  const ids = new Set(attempts.flatMap((a) => [a.grammarId, ...taught]));
  return {
    now: NOW,
    attempts,
    timeline: { todayKey: DAY },
    mastery: [...ids].map((id) =>
      taught.includes(id)
        ? { ...markLearnCardDone(createInitialMastery(id), NOW), state: 'INTRODUCED' as const }
        : createInitialMastery(id),
    ),
  } as unknown as EngineContext;
}

describe('Màn "Chữa lỗi" chỉ chữa mẫu đã được dạy (H9)', () => {
  const q = listQuestions().find((x) => x.targetGrammarIds.length === 1)!;
  const gid = q.targetGrammarIds[0];

  it('mẫu CHƯA học thì câu sai không được đưa lên màn chữa lỗi', () => {
    const out = buildErrorMaterials(ctxWith([wrongAttempt('a1', q.id, gid)], []));
    expect(out.some((m) => m.attemptIds.includes('a1'))).toBe(false);
  });

  it('mẫu ĐÃ học thì câu sai vẫn phải lên màn chữa lỗi', () => {
    const out = buildErrorMaterials(ctxWith([wrongAttempt('a1', q.id, gid)], [gid]));
    expect(out.some((m) => m.noteKey === 'analyze.todayErrors' && m.attemptIds.includes('a1'))).toBe(true);
  });

  it('câu so sánh nhắm nhiều mẫu: chỉ cần MỘT mẫu chưa học là loại', () => {
    const multi = listQuestions().find((x) => x.targetGrammarIds.length >= 2)!;
    const [first, ...rest] = multi.targetGrammarIds;
    const att = wrongAttempt('a2', multi.id, first);
    expect(
      buildErrorMaterials(ctxWith([att], [first])).some((m) => m.attemptIds.includes('a2')),
    ).toBe(false);
    expect(
      buildErrorMaterials(ctxWith([att], [first, ...rest])).some((m) => m.attemptIds.includes('a2')),
    ).toBe(true);
  });
});
