import { describe, it, expect, beforeEach } from 'vitest';
import { completeOnboarding } from '@/app/services/onboardingService';
import { loadContext } from '@/app/services/context';
import { getOrCreateTodaySession } from '@/app/services/sessionService';
import { markLearnCard, gradeAnswer, persistAnswer } from '@/app/services/answerService';
import { buildFlashcardDrill, listFlashcards, toggleFlashcard } from '@/app/services/flashcardService';
import { getQuestion, listComparisonSets } from '@/content/repository';
import { resetAllData, flashcardRepo } from '@/storage/repositories';
import { exportBackup } from '@/storage/backup';
import type { EngineContext } from '@/app/services/context';

const NOW = new Date('2026-09-13T09:00:00.000Z');

async function studied(): Promise<EngineContext> {
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
  let ctx = (await loadContext(NOW))!;
  const session = await getOrCreateTodaySession(ctx);
  for (const b of session.blocks) {
    for (const it of b.items) if (it.kind === 'LEARN_CARD') await markLearnCard(ctx, it.grammarId, NOW);
  }
  ctx = (await loadContext(NOW))!;
  for (const b of session.blocks) {
    for (const it of b.items) {
      if (it.kind !== 'QUESTION') continue;
      const q = getQuestion(it.questionId)!;
      const input = {
        ctx,
        session,
        question: q,
        response: { kind: 'CHOICE' as const, choiceId: q.choices.find((c) => c.isCorrect)!.id },
        responseTimeMs: 12_000,
        confidence: 'CONFIDENT' as const,
        delivery: 'PRACTICE' as const,
        blockType: 'APPLY' as const,
        now: NOW,
      };
      await persistAnswer(input, gradeAnswer(input));
    }
  }
  return (await loadContext(NOW))!;
}

beforeEach(async () => {
  await resetAllData();
});

describe('Thẻ ôn của tôi', () => {
  it('bật rồi tắt lại một thẻ', async () => {
    expect(await toggleFlashcard('GRAMMAR', 'nari-ni', NOW)).toBe(true);
    expect((await listFlashcards()).map((c) => c.refId)).toContain('nari-ni');
    expect(await toggleFlashcard('GRAMMAR', 'nari-ni', NOW)).toBe(false);
    expect(await listFlashcards()).toHaveLength(0);
  });

  it('bỏ qua thẻ trỏ tới nội dung không còn tồn tại', async () => {
    await flashcardRepo.put({ id: 'GRAMMAR:khong-co-that', kind: 'GRAMMAR', refId: 'khong-co-that', addedAt: NOW.toISOString() });
    expect(await listFlashcards()).toHaveLength(0);
  });

  it('luyện bộ thẻ vẫn chịu H9 — không lôi mẫu chưa học ra hỏi', async () => {
    const ctx = await studied();
    const taught = new Set(ctx.mastery.filter((m) => m.state !== 'UNSEEN').map((m) => m.grammarId));
    expect(taught.size).toBeGreaterThan(0);

    // Đánh dấu một bảng so sánh có mẫu người học CHƯA học.
    const set = listComparisonSets().find((s) => s.grammarIds.some((g) => !taught.has(g)))!;
    await toggleFlashcard('COMPARISON', set.id, NOW);
    for (const g of taught) await toggleFlashcard('GRAMMAR', g, NOW);

    const items = buildFlashcardDrill(ctx, await listFlashcards(), 10);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      if (it.kind !== 'QUESTION') continue;
      for (const g of getQuestion(it.questionId)!.targetGrammarIds) expect(taught.has(g)).toBe(true);
    }
  });

  it('bộ thẻ nằm trong file sao lưu', async () => {
    await toggleFlashcard('GRAMMAR', 'nari-ni', NOW);
    const backup = await exportBackup();
    expect(backup.data.flashcards).toHaveLength(1);
  });
});
