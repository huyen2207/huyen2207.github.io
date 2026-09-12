import { describe, it, expect } from 'vitest';
import { completeOnboarding } from '@/app/services/onboardingService';
import { loadContext } from '@/app/services/context';
import {
  buildDrill,
  buildExtraLearnBlocks,
  getOrCreateTodaySession,
  newGrammarToday,
} from '@/app/services/sessionService';
import { markLearnCard, gradeAnswer, persistAnswer } from '@/app/services/answerService';
import { getQuestion } from '@/content/repository';
import { resetAllData } from '@/storage/repositories';
import { NEW_PER_DAY_HARD_CAP } from '@/config/learning.config';
import type { EngineContext } from '@/app/services/context';

const START = new Date('2026-09-12T09:00:00.000Z');

/** Học hết buổi hôm nay: bấm xong mọi thẻ học và trả lời mọi câu. */
async function studyWholeDay(): Promise<EngineContext> {
  await resetAllData();
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
    START,
  );
  let ctx = (await loadContext(START))!;
  const session = await getOrCreateTodaySession(ctx);

  for (const b of session.blocks) {
    for (const it of b.items) if (it.kind === 'LEARN_CARD') await markLearnCard(ctx, it.grammarId, START);
  }
  ctx = (await loadContext(START))!;

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
        now: START,
      };
      await persistAnswer(input, gradeAnswer(input));
    }
  }
  return (await loadContext(START))!;
}

describe('/practice — học xong buổi chính rồi vẫn phải luyện thêm được', () => {
  it('các dạng luyện không được ra màn trắng chỉ vì hôm nay đã gặp câu đó', async () => {
    const ctx = await studyWholeDay();
    expect(ctx.mastery.filter((m) => m.state !== 'UNSEEN').length).toBeGreaterThan(0);

    for (const kind of ['REVIEW_TOP', 'ERROR_TYPE', 'FAMILY', 'TRAP_TYPE', 'SPEED'] as const) {
      expect(buildDrill(ctx, kind, {}, 5).items.length, kind).toBeGreaterThan(0);
    }
  });

  it('luyện thêm vẫn không được lôi mẫu chưa học ra hỏi (H9)', async () => {
    const ctx = await studyWholeDay();
    const taught = new Set(ctx.mastery.filter((m) => m.state !== 'UNSEEN').map((m) => m.grammarId));
    for (const kind of ['REVIEW_TOP', 'ERROR_TYPE', 'FAMILY', 'TRAP_TYPE', 'SPEED'] as const) {
      for (const it of buildDrill(ctx, kind, {}, 5).items) {
        if (it.kind !== 'QUESTION') continue;
        for (const g of getQuestion(it.questionId)!.targetGrammarIds) expect(taught.has(g)).toBe(true);
      }
    }
  });
});

describe('/practice — học thêm mẫu mới khi còn thời gian', () => {
  it('lấy tiếp mẫu chưa học theo đúng thứ tự lộ trình, kèm câu recall', async () => {
    const ctx = await studyWholeDay();
    const blocks = buildExtraLearnBlocks(ctx, 1);
    const learn = blocks.find((b) => b.type === 'LEARN')!;
    const recall = blocks.find((b) => b.type === 'RECALL')!;

    expect(learn.items).toHaveLength(1);
    const id = (learn.items[0] as { grammarId: string }).grammarId;
    expect(ctx.mastery.find((m) => m.grammarId === id)!.state).toBe('UNSEEN');
    // CLAUDE.md §11 — cấm đọc suông: mỗi thẻ học phải có ít nhất một câu recall.
    expect(recall.items.length).toBeGreaterThan(0);
  });

  it('người học chủ động thì KHÔNG bị chặn ở mốc 8 mẫu/ngày (CLAUDE.md §8.2 sau sửa)', async () => {
    const ctx = await studyWholeDay();
    const asked = buildExtraLearnBlocks(ctx, NEW_PER_DAY_HARD_CAP + 4).find((b) => b.type === 'LEARN')!;
    expect(asked.items.length).toBeGreaterThan(NEW_PER_DAY_HARD_CAP);
  });

  it('nhưng buổi học do HỆ THỐNG sinh ra thì vẫn không quá 8 mẫu mới', async () => {
    const ctx = await studyWholeDay();
    const session = await getOrCreateTodaySession(ctx, true);
    const learn = session.blocks.find((b) => b.type === 'LEARN')!;
    expect(learn.items.length).toBeLessThanOrEqual(NEW_PER_DAY_HARD_CAP);
  });

  it('học trước thì mục tiêu buổi sau tự trừ đi, không lệch lộ trình', async () => {
    const ctx = await studyWholeDay();
    const before = newGrammarToday(ctx);
    // Lộ trình chia đều số mẫu CHƯA HỌC cho số buổi còn lại — học trước thì tử số giảm.
    const after = newGrammarToday({
      ...ctx,
      mastery: ctx.mastery.map((m) =>
        ctx.plan.requiredGrammarIds.slice(0, 40).includes(m.grammarId) && m.state === 'UNSEEN'
          ? { ...m, state: 'INTRODUCED' as const, baseRank: 'INTRODUCED' as const }
          : m,
      ),
    });
    expect(after.unseenLeft).toBeLessThan(before.unseenLeft);
  });
});
