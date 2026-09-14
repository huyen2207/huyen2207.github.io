import { beforeEach, describe, expect, it } from 'vitest';
import { completeOnboarding } from '@/app/services/onboardingService';
import { loadContext, type EngineContext } from '@/app/services/context';
import {
  completeSession,
  getOrCreateTodaySession,
  markSessionStarted,
} from '@/app/services/sessionService';
import { gradeAnswer, markLearnCard, persistAnswer } from '@/app/services/answerService';
import { finalizeSession, notebook, dashboard } from '@/app/services/analyticsService';
import { updateProfile } from '@/app/services/settingsService';
import { getQuestion, getQuestionsForGrammar, listQuestions, listRawGrammar } from '@/content/repository';
import { attemptRepo, masteryRepo, resetAllData, sessionRepo } from '@/storage/repositories';
import { exportBackup, importBackup } from '@/storage/backup';
import type { Question } from '@/domain/question';
import type { Confidence, DeliveryMode, SessionBlockType } from '@/domain/enums';
import { TRAP_ID_QUESTION } from '@/engines/exercise/__tests__/trapId-fixture';

const START = new Date('2026-09-07T09:00:00.000Z');

async function onboard(over: Partial<Parameters<typeof completeOnboarding>[0]> = {}) {
  await completeOnboarding(
    {
      examDate: '2026-12-06T00:00:00.000Z',
      selfAssessedLevel: 'N2_SOLID',
      grammarAlreadyStudiedCount: 0,
      availableMinutesPerDay: 45,
      daysPerWeek: 7,
      targetScoreBand: 'COMFORTABLE',
      initialConfidence: 3,
      ...over,
    },
    START,
  );
}

function wrongChoiceOf(q: Question): string {
  return q.choices.find((c) => !c.isCorrect)!.id;
}

async function answer(
  ctx: EngineContext,
  question: Question,
  choiceId: string,
  opts: {
    confidence?: Confidence;
    delivery?: DeliveryMode;
    blockType?: SessionBlockType;
    now?: Date;
    responseTimeMs?: number;
  } = {},
) {
  const session = await getOrCreateTodaySession(ctx);
  const input = {
    ctx,
    session,
    question,
    response: { kind: 'CHOICE' as const, choiceId },
    responseTimeMs: opts.responseTimeMs ?? 15000,
    confidence: opts.confidence ?? ('CONFIDENT' as Confidence),
    delivery: opts.delivery ?? ('PRACTICE' as DeliveryMode),
    blockType: opts.blockType ?? ('APPLY' as SessionBlockType),
    now: opts.now ?? ctx.now,
  };
  const result = gradeAnswer(input);
  return persistAnswer(input, result);
}

beforeEach(async () => {
  await resetAllData();
});

describe('Hành trình Day 1 — người học mới', () => {
  it('onboard → có session hôm nay → học mẫu → trả lời sai → sinh lỗi → lên lịch ôn → tiến độ cập nhật', async () => {
    await onboard();

    const ctx = (await loadContext(START))!;
    expect(ctx.profile.id).toBe('me');
    expect(ctx.timeline.studyDayIndex).toBe(1);
    expect(ctx.timeline.currentPhase).toBe('PHASE_1_KNOW');
    expect(ctx.plan.requiredGrammarIds.length).toBeGreaterThan(0);

    // Session hôm nay được sinh sẵn — người học không phải chọn gì.
    const session = await getOrCreateTodaySession(ctx);
    expect(session.blocks).toHaveLength(7);
    const learnBlock = session.blocks.find((b) => b.type === 'LEARN')!;
    expect(learnBlock.items.length).toBeGreaterThan(0);

    // Mở lại app trong ngày → CÙNG session, không sinh mới (arch §8.2).
    const again = await getOrCreateTodaySession(ctx);
    expect(again.sessionId).toBe(session.sessionId);

    // Học một mẫu.
    const grammarId = (learnBlock.items[0] as { grammarId: string }).grammarId;
    await markLearnCard(ctx, grammarId, START);

    // Trả lời SAI câu đầu của mẫu đó.
    const question = getQuestionsForGrammar(grammarId)[0];
    const outcome = await answer(ctx, question, wrongChoiceOf(question), { blockType: 'RECALL' });
    expect(outcome.result.isCorrect).toBe(false);

    // Attempt được ghi (append-only).
    const attempts = await attemptRepo.all();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].grammarId).toBe(question.targetGrammarIds[0]);

    // Mastery rời UNSEEN và có lịch ôn.
    const mastery = (await masteryRepo.get(attempts[0].grammarId))!;
    expect(mastery.state).not.toBe('UNSEEN');
    expect(mastery.nextReviewAt).toBeTruthy();
    expect(new Date(mastery.nextReviewAt!).getTime()).toBeGreaterThan(START.getTime());

    // Câu sai được đưa vào hàng đợi gặp lại trong cùng ngày.
    const stored = (await sessionRepo.get(session.sessionId))!;
    expect(stored.redoQueue).toContain(question.id);

    // Sổ lỗi có nội dung sau khi có lỗi.
    const ctx2 = (await loadContext(START))!;
    expect(ctx2.attempts).toHaveLength(1);
    expect(ctx2.weakness.totalAttempts).toBe(1);
  });

  it('hoàn thành session → trạng thái COMPLETED và analytics chạy được', async () => {
    await onboard();
    const ctx = (await loadContext(START))!;
    const session = await getOrCreateTodaySession(ctx);
    const started = await markSessionStarted(session, START);
    const done = await completeSession(started, START);
    expect(done.status).toBe('COMPLETED');

    const res = await finalizeSession(ctx);
    expect(res).toHaveProperty('checkpoint');
    const metrics = dashboard(ctx);
    expect(metrics.currentPhase).toBe('PHASE_1_KNOW');
    expect(metrics.readiness).not.toBeUndefined();
  });
});

describe('Buổi học đã lưu mà chứa mẫu chưa dạy thì tự dựng lại', () => {
  it('không bắt người học tự đi tìm nút "Tạo lại buổi học"', async () => {
    await onboard();
    const ctx = (await loadContext(START))!;
    const session = await getOrCreateTodaySession(ctx);

    // Giả lập ảnh chụp cũ sinh trước khi có luật H9: nhét một câu nhắm mẫu chưa hề dạy.
    const taught = new Set(ctx.mastery.filter((m) => m.state !== 'UNSEEN').map((m) => m.grammarId));
    for (const b of session.blocks) {
      for (const it of b.items) if (it.kind === 'LEARN_CARD') taught.add(it.grammarId);
    }
    const intruder = listQuestions().find((q) => q.targetGrammarIds.every((g) => !taught.has(g)))!;
    const block = session.blocks.find((b) => b.type === 'REVIEW' || b.items.length > 0)!;
    await sessionRepo.put({
      ...session,
      blocks: session.blocks.map((b) =>
        b.type === block.type
          ? {
              ...b,
              items: [
                ...b.items,
                {
                  kind: 'QUESTION' as const,
                  questionId: intruder.id,
                  timed: false,
                  delivery: 'PRACTICE' as const,
                  grammarId: intruder.targetGrammarIds[0],
                },
              ],
            }
          : b,
      ),
    });

    const rebuilt = await getOrCreateTodaySession((await loadContext(START))!);
    const ids = rebuilt.blocks.flatMap((b) =>
      b.items.filter((i) => i.kind === 'QUESTION').map((i) => (i as { questionId: string }).questionId),
    );
    expect(ids).not.toContain(intruder.id);
  });
});

describe('Hành trình Month 2 — nhầm mẫu gần nghĩa', () => {
  it('nhầm A/B hai lần → ghi confusion → CONFUSED → Compare Lab được gợi ý', async () => {
    await onboard();
    let ctx = (await loadContext(START))!;
    await getOrCreateTodaySession(ctx);

    // Phải học thẻ trước — mẫu chưa dạy thì không được lên thang mastery (§5.1).
    await markLearnCard(ctx, 'ni-itatte', START);
    ctx = (await loadContext(START))!;

    const q = getQuestion('q-ni-itatte-cloze-01')!;
    const confusingChoice = q.choices.find((c) => c.confusedWithGrammarId === 'ni-itatte-wa')!;

    await answer(ctx, q, confusingChoice.id, { confidence: 'UNSURE' });
    ctx = (await loadContext(new Date('2026-09-08T09:00:00.000Z')))!;

    const q2 = getQuestion('q-cmp-time-01-mp-01')!;
    const confusing2 = q2.choices.find((c) => c.confusedWithGrammarId === 'ni-itatte-wa')!;
    await answer(ctx, q2, confusing2.id, {
      confidence: 'UNSURE',
      now: new Date('2026-09-08T09:00:00.000Z'),
    });

    const mastery = (await masteryRepo.get('ni-itatte'))!;
    expect(mastery.confusedWith['ni-itatte-wa']).toBe(2);
    expect(mastery.state).toBe('CONFUSED');
    expect(mastery.confusedPair).toBe('ni-itatte-wa');

    // Sổ lỗi nêu đúng cặp và có nút luyện.
    const ctx3 = (await loadContext(new Date('2026-09-08T10:00:00.000Z')))!;
    const lines = notebook(ctx3);
    const confusionLine = lines.find((l) => l.kind === 'CONFUSION');
    expect(confusionLine).toBeDefined();
    expect(confusionLine!.drill?.kind).toBe('CONFUSION_PAIR');

    // Ma trận có hướng: cặp được ghi đúng chiều.
    expect(ctx3.weakness.topConfusionPairs[0].from).toBe('ni-itatte');
    expect(ctx3.weakness.topConfusionPairs[0].to).toBe('ni-itatte-wa');
  });
});

describe('Hành trình Month 3 — sập bẫy', () => {
  it('sai câu có bẫy → ghi TRAP_HIT và errorType, thống kê bẫy có dữ liệu', async () => {
    await onboard();
    const ctx = (await loadContext(START))!;
    await getOrCreateTodaySession(ctx);

    const q = getQuestion('q-narade-wa-valid-01')!;
    const outcome = await answer(ctx, q, wrongChoiceOf(q), { confidence: 'CONFIDENT' });

    expect(outcome.result.flags).toContain('TRAP_HIT');
    expect(outcome.result.outcome).toBe('INCORRECT_MISCONCEPTION');
    expect(outcome.attempt.errorType).toBe('NUANCE_ERROR');

    const ctx2 = (await loadContext(START))!;
    expect(ctx2.weakness.misconceptionItems).toContain('narade-wa');
    const lines = notebook(ctx2);
    expect(lines[0].kind).toBe('MISCONCEPTION');
  });

  it('TRAP_ID chọn sai loại bẫy → errorType TRAP_ERROR', async () => {
    await onboard();
    const ctx = (await loadContext(START))!;
    await getOrCreateTodaySession(ctx);
    const q = TRAP_ID_QUESTION;
    const session = (await sessionRepo.getByDate(ctx.timeline.todayKey))!;
    const input = {
      ctx,
      session,
      question: q,
      response: { kind: 'TRAP' as const, trapType: 'REGISTER_MISMATCH' as const },
      responseTimeMs: 12000,
      confidence: 'UNSURE' as const,
      delivery: 'STUDY' as const,
      blockType: 'APPLY' as const,
      now: ctx.now,
    };
    const result = gradeAnswer(input);
    const outcome = await persistAnswer(input, result);
    expect(outcome.attempt.errorType).toBe('TRAP_ERROR');
  });
});

describe('Bất biến hệ thống qua nhiều ngày', () => {
  it('không mẫu nào đạt EXAM_READY khi toàn bộ content là NEEDS_REVIEW (CLAUDE.md §16.4)', async () => {
    await onboard();
    const grammarId = 'ni-itatte';
    const days = ['2026-09-07', '2026-09-11', '2026-09-15', '2026-09-19', '2026-09-23', '2026-09-27'];
    const examStyle = getQuestionsForGrammar(grammarId).filter((q) => q.type === 'CLOZE_MC');

    for (const day of days) {
      const now = new Date(`${day}T09:00:00.000Z`);
      const ctx = (await loadContext(now))!;
      await getOrCreateTodaySession(ctx);
      const q = examStyle[0];
      await answer(ctx, q, q.correctChoiceId, {
        confidence: 'CONFIDENT',
        delivery: 'TIMED',
        now,
        responseTimeMs: 20000,
      });
    }

    const mastery = (await masteryRepo.get(grammarId))!;
    expect(mastery.state).not.toBe('EXAM_READY');
  });

  it('EXAM_READY GIỜ ĐÃ mở khoá được với nội dung trích từ sách (VERIFIED)', async () => {
    await onboard();
    // 〜べく: nội dung lấy từ 別冊 p.24, sourceId drill-drill-n1 (PRIMARY) ⇒ VERIFIED.
    const grammarId = 'beku';
    const examStyle = getQuestionsForGrammar(grammarId).filter((q) => q.type === 'CLOZE_MC');
    expect(examStyle.length).toBeGreaterThan(0);
    expect(examStyle[0].verificationStatus).toBe('VERIFIED');

    const days = ['2026-09-07', '2026-09-11', '2026-09-15', '2026-09-19', '2026-09-23', '2026-09-27'];
    for (const day of days) {
      const now = new Date(`${day}T09:00:00.000Z`);
      const ctx = (await loadContext(now))!;
      await getOrCreateTodaySession(ctx);
      const m = ctx.mastery.find((x) => x.grammarId === grammarId)!;
      // Đẩy lên COMPARABLE để kiểm đúng chặng cuối, các chặng trước đã có test riêng.
      await masteryRepo.put({ ...m, state: 'COMPARABLE', baseRank: 'COMPARABLE' });
      const fresh = (await loadContext(now))!;
      await getOrCreateTodaySession(fresh);
      await answer(fresh, examStyle[0], examStyle[0].correctChoiceId, {
        confidence: 'CONFIDENT',
        delivery: 'TIMED',
        now,
        responseTimeMs: 20000,
      });
    }

    const finalMastery = (await masteryRepo.get(grammarId))!;
    expect(finalMastery.state).toBe('EXAM_READY');
  });

  it('chuyển phase không làm mất bản ghi mastery/attempt nào (kịch bản 7)', async () => {
    await onboard();
    let ctx = (await loadContext(START))!;
    await getOrCreateTodaySession(ctx);
    const q = getQuestion('q-ni-itatte-meaning-01')!;
    await answer(ctx, q, q.correctChoiceId, { blockType: 'RECALL' });

    const beforeMastery = await masteryRepo.getAll();
    const beforeAttempts = await attemptRepo.all();

    // Nhảy sang Phase 2.
    const phase2Date = new Date('2026-10-15T09:00:00.000Z');
    ctx = (await loadContext(phase2Date))!;
    expect(ctx.timeline.currentPhase).toBe('PHASE_2_COMPARE');
    await getOrCreateTodaySession(ctx);

    const afterMastery = await masteryRepo.getAll();
    const afterAttempts = await attemptRepo.all();
    expect(afterAttempts).toHaveLength(beforeAttempts.length);
    expect(afterMastery.length).toBe(beforeMastery.length);
    const before = beforeMastery.find((m) => m.grammarId === 'ni-itatte')!;
    const after = afterMastery.find((m) => m.grammarId === 'ni-itatte')!;
    expect(after.state).toBe(before.state);
    expect(after.correctCount).toBe(before.correctCount);
  });

  it('đổi ngày thi gần hơn → replan + mọi nextReviewAt bị kéo về trước ngày thi', async () => {
    await onboard();
    let ctx = (await loadContext(START))!;
    await getOrCreateTodaySession(ctx);
    const q = getQuestion('q-ni-itatte-meaning-01')!;
    await answer(ctx, q, q.correctChoiceId, { blockType: 'RECALL' });

    const newExam = '2026-09-12T00:00:00.000Z';
    await updateProfile(ctx.profile, { examDate: newExam }, START);
    ctx = (await loadContext(START))!;

    expect(ctx.timeline.mode).toBe('FINAL_7');
    for (const m of ctx.mastery) {
      if (!m.nextReviewAt) continue;
      expect(new Date(m.nextReviewAt).getTime()).toBeLessThan(new Date(newExam).getTime());
    }
  });

  it('FINAL_7 → session không có mẫu mới', async () => {
    await onboard({ examDate: '2026-09-12T00:00:00.000Z' });
    const ctx = (await loadContext(START))!;
    expect(ctx.timeline.mode).toBe('FINAL_7');
    const session = await getOrCreateTodaySession(ctx);
    expect(session.blocks.find((b) => b.type === 'LEARN')!.items).toHaveLength(0);
  });

  it('sao lưu và khôi phục giữ nguyên toàn bộ tiến độ', async () => {
    await onboard();
    const ctx = (await loadContext(START))!;
    await getOrCreateTodaySession(ctx);
    const q = getQuestion('q-ni-itatte-meaning-01')!;
    await answer(ctx, q, q.correctChoiceId, { blockType: 'RECALL' });

    const backup = await exportBackup();
    await resetAllData();
    expect(await attemptRepo.count()).toBe(0);

    const result = await importBackup(backup);
    expect(result.ok).toBe(true);
    expect(await attemptRepo.count()).toBe(1);
    const restored = (await loadContext(START))!;
    expect(restored.profile.id).toBe('me');
    expect(restored.mastery.length).toBe(listRawGrammar().length);
  });

  it('file sao lưu sai định dạng bị từ chối, không phá dữ liệu', async () => {
    await onboard();
    const before = await attemptRepo.count();
    const result = await importBackup({ format: 'something-else' });
    expect(result.ok).toBe(false);
    expect(await attemptRepo.count()).toBe(before);
  });
});

describe('Cập nhật nội dung không được làm người học kẹt', () => {
  it('buổi học đã lưu trỏ tới câu hỏi đã bị gỡ → tự dựng lại', async () => {
    await onboard();
    const ctx = (await loadContext(START))!;
    const session = await getOrCreateTodaySession(ctx);
    const block = session.blocks.find((b) => b.items.length > 0)!;
    await sessionRepo.put({
      ...session,
      blocks: session.blocks.map((b) =>
        b === block
          ? {
              ...b,
              items: [
                { kind: 'QUESTION' as const, questionId: 'q-da-bi-go', timed: false, delivery: 'PRACTICE' as const, grammarId: 'x' },
                ...b.items,
              ],
            }
          : b,
      ),
    });
    const rebuilt = await getOrCreateTodaySession((await loadContext(START))!);
    const ids = rebuilt.blocks.flatMap((b) => b.items.map((i) => ('questionId' in i ? i.questionId : '')));
    expect(ids).not.toContain('q-da-bi-go');
  });

  it('mẫu trùng đã gộp: tiến độ học dưới id cũ chuyển sang id mới', async () => {
    await onboard();
    await masteryRepo.putMany([
      {
        ...(await masteryRepo.get('narade-wa'))!,
        grammarId: 'nara-dewa',
        state: 'RECOGNIZED',
        baseRank: 'RECOGNIZED',
        learnCardDoneAt: START.toISOString(),
      },
    ]);
    const ctx = (await loadContext(START))!;
    expect(ctx.mastery.find((m) => m.grammarId === 'narade-wa')!.state).toBe('RECOGNIZED');
    expect(ctx.mastery.some((m) => m.grammarId === 'nara-dewa')).toBe(false);
  });
});
