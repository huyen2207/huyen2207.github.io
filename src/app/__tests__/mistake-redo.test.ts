import { describe, it, expect, beforeEach } from 'vitest';
import { completeOnboarding } from '@/app/services/onboardingService';
import { loadContext } from '@/app/services/context';
import { getOrCreateTodaySession } from '@/app/services/sessionService';
import { markLearnCard, gradeAnswer, persistAnswer } from '@/app/services/answerService';
import { wrongQuestionsToRedo } from '@/app/services/mistakeRedoService';
import { notebook } from '@/app/services/analyticsService';
import { getQuestionsForGrammar } from '@/content/repository';
import { attemptRepo, resetAllData } from '@/storage/repositories';
import type { EngineContext } from '@/app/services/context';
import type { Question } from '@/domain/question';

const NOW = new Date('2026-09-15T09:00:00.000Z');
const LATER = new Date('2026-09-15T10:00:00.000Z');

async function setup(): Promise<EngineContext> {
  await completeOnboarding(
    {
      examDate: '2026-12-06T00:00:00.000Z',
      selfAssessedLevel: 'N2_SOLID',
      grammarAlreadyStudiedCount: 0,
      availableMinutesPerDay: 45,
      daysPerWeek: 7,
      targetScoreBand: 'COMFORTABLE',
      initialConfidence: 3,
    },
    NOW,
  );
  return (await loadContext(NOW))!;
}

async function answer(ctx: EngineContext, q: Question, correct: boolean, now: Date) {
  const session = await getOrCreateTodaySession(ctx);
  const choiceId = q.choices.find((c) => c.isCorrect === correct)!.id;
  const input = {
    ctx, session, question: q,
    response: { kind: 'CHOICE' as const, choiceId },
    responseTimeMs: 12_000, confidence: 'CONFIDENT' as const,
    delivery: 'PRACTICE' as const, blockType: 'APPLY' as const, now,
  };
  await persistAnswer(input, gradeAnswer(input));
}

beforeEach(async () => {
  await resetAllData();
});

describe('Sổ lỗi — làm lại đúng những câu đã sai', () => {
  it('câu sai hiện ra kèm đáp án đã chọn; làm lại đúng thì rời danh sách', async () => {
    let ctx = await setup();
    await markLearnCard(ctx, 'nari-ni', NOW);
    const q = getQuestionsForGrammar('nari-ni').find((x) => x.type === 'MEANING_MC' && x.targetGrammarIds.length === 1)!;

    await answer(ctx, q, false, NOW);
    ctx = (await loadContext(NOW))!;
    const list = wrongQuestionsToRedo(ctx);
    const item = list.find((w) => w.question.id === q.id)!;
    expect(item).toBeDefined();
    expect(item.chosenLabel).toBe(q.choices.find((c) => !c.isCorrect)!.textJa);
    expect(item.correctLabel).toBe(q.choices.find((c) => c.isCorrect)!.textJa);

    await answer(ctx, q, true, LATER);
    ctx = (await loadContext(LATER))!;
    expect(wrongQuestionsToRedo(ctx).some((w) => w.question.id === q.id)).toBe(false);
  });

  it('không bắt làm lại câu thuộc mẫu chưa được dạy', async () => {
    let ctx = await setup();
    const q = getQuestionsForGrammar('nari-ni').find((x) => x.targetGrammarIds.length === 1)!;
    await answer(ctx, q, false, NOW); // chưa học thẻ → mẫu vẫn UNSEEN
    ctx = (await loadContext(NOW))!;
    expect(wrongQuestionsToRedo(ctx).some((w) => w.question.id === q.id)).toBe(false);
  });

  it('attempt ghi dưới id mẫu đã gộp không làm sổ lỗi tách một mẫu thành hai dòng', async () => {
    let ctx = await setup();
    await markLearnCard(ctx, 'narade-wa', NOW);
    const q = getQuestionsForGrammar('narade-wa').find((x) => x.targetGrammarIds.length === 1)!;
    await answer(ctx, q, false, NOW);
    // Giả lập một attempt cũ ghi dưới id trước khi gộp.
    const [a] = await attemptRepo.all();
    await attemptRepo.add({ ...a, attemptId: `${a.attemptId}-old`, grammarId: 'nara-dewa' });
    ctx = (await loadContext(NOW))!;
    expect(ctx.attempts.some((x) => x.grammarId === 'nara-dewa')).toBe(false);
    expect(JSON.stringify(notebook(ctx))).not.toContain('nara-dewa');
  });
});
