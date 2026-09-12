import type { Attempt } from '@/domain/attempt';
import type { Question } from '@/domain/question';
import type { DailySession } from '@/domain/session';
import type {
  Confidence,
  DeliveryMode,
  ErrorType,
  SessionBlockType,
} from '@/domain/enums';
import { grade, type GradeContext, type GradeResult, type Response } from '@/engines/exercise';
import { applyAttempt, atLeast } from '@/engines/mastery';
import { computeNextReview } from '@/engines/review';
import { attemptRepo, masteryRepo, sessionRepo } from '@/storage/repositories';
import { dayKey } from '@/shared/date';
import { median } from '@/shared/math';
import { newId } from '@/shared/id';
import { RT_OUTLIER_MS } from '@/config/learning.config';
import type { EngineContext } from './context';

export interface AnswerInput {
  ctx: EngineContext;
  session: DailySession;
  question: Question;
  response: Response;
  responseTimeMs: number;
  confidence: Confidence;
  delivery: DeliveryMode;
  blockType: SessionBlockType;
  now: Date;
  /** MOCK ghi mặc định UNSURE + cờ (G-06). */
  confidenceImputed?: boolean;
  subKind?: Attempt['subKind'];
}

export interface AnswerOutcome {
  result: GradeResult;
  attempt: Attempt;
  stateChangedTo?: string;
  stateReason?: string;
}

function buildGradeContext(input: AnswerInput): GradeContext {
  const { ctx, question, now } = input;
  const grammarId = primaryGrammarId(question);
  const mastery = ctx.mastery.find((m) => m.grammarId === grammarId);
  const sameType = ctx.attempts.filter(
    (a) => a.grammarId === grammarId && a.questionType === question.type && a.responseTimeMs <= RT_OUTLIER_MS,
  );
  const todayKey = dayKey(now, ctx.profile.dayBoundaryHour);

  return {
    masteryState: mastery?.state ?? 'UNSEEN',
    personalMedianRtMs: sameType.length ? median(sameType.map((a) => a.responseTimeMs)) : null,
    knownConfusionPartners: Object.keys(mastery?.confusedWith ?? {}),
    sameSessionAttemptCount: ctx.attempts.filter((a) => a.grammarId === grammarId && a.dayKey === todayKey).length,
  };
}

export function primaryGrammarId(question: Question): string {
  const correct = question.choices.find((c) => c.isCorrect);
  if (correct?.confusedWithGrammarId && question.targetGrammarIds.includes(correct.confusedWithGrammarId)) {
    return question.targetGrammarIds[0];
  }
  return question.targetGrammarIds[0];
}

/** Bước chấm — chạy đồng bộ, không chạm DB. UI hiện feedback ngay từ kết quả này. */
export function gradeAnswer(input: AnswerInput): GradeResult {
  return grade({
    question: input.question,
    response: input.response,
    responseTimeMs: input.responseTimeMs,
    confidence: input.confidence,
    delivery: input.delivery,
    context: buildGradeContext(input),
  });
}

export function buildAttempt(input: AnswerInput, result: GradeResult, errorTypeOverride?: ErrorType): Attempt {
  const { ctx, question, now } = input;
  const grammarId = primaryGrammarId(question);
  const selected =
    input.response.kind === 'CHOICE'
      ? input.response.choiceId
      : input.response.kind === 'ORDER'
        ? input.response.orderedFragmentIds.join(',')
        : input.response.kind === 'TRAP'
          ? input.response.trapType
          : input.response.kind === 'CLUE'
            ? input.response.clueKind
            : '';

  const errorType = errorTypeOverride ?? result.errorTypeAuto ?? undefined;

  return {
    attemptId: newId('att'),
    sessionId: input.session.sessionId,
    questionId: question.id,
    grammarId,
    phase: ctx.timeline.currentPhase,
    blockType: input.blockType,
    isTimed: input.delivery === 'TIMED' || input.delivery === 'MOCK',
    selectedAnswer: selected,
    correctAnswer:
      question.type === 'SENTENCE_BUILD' ? (question.starFragmentId ?? question.correctChoiceId) : question.correctChoiceId,
    isCorrect: result.isCorrect,
    ...(errorType ? { errorType } : {}),
    ...(errorType ? { errorSource: errorTypeOverride ? ('SELF_REPORTED' as const) : ('AUTO' as const) } : {}),
    ...(result.confusedWith ? { confusedWith: result.confusedWith } : {}),
    responseTimeMs: input.responseTimeMs,
    confidence: input.confidence,
    timestamp: now.toISOString(),
    questionType: question.type,
    delivery: input.delivery,
    verified: question.verificationStatus === 'VERIFIED',
    ...(input.confidenceImputed ? { confidenceImputed: true } : {}),
    ...(input.subKind ? { subKind: input.subKind } : {}),
    dayKey: dayKey(now, ctx.profile.dayBoundaryHour),
  };
}

/**
 * Ghi nhận kết quả — chạy BẤT ĐỒNG BỘ sau khi UI đã hiện feedback (arch §8.3).
 * Luồng: Attempt (append-only) → MasteryEngine → ReviewEngine → hàng đợi làm lại.
 */
export async function persistAnswer(
  input: AnswerInput,
  result: GradeResult,
  errorTypeOverride?: ErrorType,
): Promise<AnswerOutcome> {
  const { ctx, question, now } = input;
  const attempt = buildAttempt(input, result, errorTypeOverride);
  await attemptRepo.add(attempt);

  const grammarId = attempt.grammarId;
  const current =
    ctx.mastery.find((m) => m.grammarId === grammarId) ??
    (await masteryRepo.get(grammarId)) ??
    undefined;

  let stateChangedTo: string | undefined;
  let stateReason: string | undefined;

  if (current) {
    const prior = ctx.attempts.filter((a) => a.grammarId === grammarId);
    const globalGuess = ctx.weakness.guessRate;
    const applied = applyAttempt(current, attempt, question, now, {
      priorAttempts: prior,
      globalGuessRate: globalGuess,
      ...(input.subKind === undefined && result.isCorrect && current.state === 'CONFUSED' && current.confusedPair
        ? { contrastDrillWin: contrastWin(prior, attempt, current.confusedPair) }
        : {}),
    });

    let next = applied.mastery;
    next = {
      ...next,
      nextReviewAt: computeNextReview(
        next,
        { isCorrect: attempt.isCorrect, confidence: attempt.confidence },
        ctx.timeline,
        ctx.profile.dayBoundaryHour,
      ),
    };
    await masteryRepo.put(next);

    // Cập nhật ngữ cảnh trong bộ nhớ để câu tiếp theo dùng dữ liệu mới.
    ctx.mastery = ctx.mastery.map((m) => (m.grammarId === grammarId ? next : m));
    if (applied.event) {
      stateChangedTo = applied.event.to;
      stateReason = applied.event.reason;
    }
  }

  ctx.attempts = [...ctx.attempts, attempt];

  // Sai → gặp lại cuối session hôm nay (CLAUDE.md §14.2, learning-engine §11).
  if (!attempt.isCorrect && input.delivery !== 'MOCK') {
    const session = await sessionRepo.get(input.session.sessionId);
    if (session && !session.redoQueue.includes(question.id)) {
      await sessionRepo.put({ ...session, redoQueue: [...session.redoQueue, question.id] });
    }
  }

  return { result, attempt, stateChangedTo, stateReason };
}

/** Thắng contrast drill: 3/3 hoặc 4/5 câu so sánh gần nhất đúng cặp đang nhầm. */
function contrastWin(
  prior: Attempt[],
  current: Attempt,
  partnerId: string,
): { partnerId: string; correct: number; total: number } | undefined {
  const compare = [...prior, current].filter(
    (a) => a.questionType === 'MINIMAL_PAIR' || a.questionType === 'WHY_NOT_OTHER',
  );
  const last5 = compare.slice(-5);
  const last3 = compare.slice(-3);
  if (last3.length === 3 && last3.every((a) => a.isCorrect)) {
    return { partnerId, correct: 3, total: 3 };
  }
  if (last5.length === 5) {
    return { partnerId, correct: last5.filter((a) => a.isCorrect).length, total: 5 };
  }
  return undefined;
}

/** Learn card hoàn thành + mini recall → UNSEEN → INTRODUCED. */
export async function markLearnCard(ctx: EngineContext, grammarId: string, now: Date): Promise<void> {
  const m = ctx.mastery.find((x) => x.grammarId === grammarId);
  if (!m) return;
  // Chỉ đóng dấu LẦN ĐẦU. Xem lại thẻ cũ không được tính là "hôm nay học mẫu mới",
  // nếu không thì việc dựng lại buổi học sẽ ăn mất quota mẫu mới của ngày hôm đó.
  if (m.learnCardDoneAt) return;
  const next = {
    ...m,
    learnCardDoneAt: now.toISOString(),
    firstSeenAt: m.firstSeenAt ?? now.toISOString(),
  };
  await masteryRepo.put(next);
  ctx.mastery = ctx.mastery.map((x) => (x.grammarId === grammarId ? next : x));
}

export function isExamReadyBlocked(ctx: EngineContext, grammarId: string): boolean {
  const m = ctx.mastery.find((x) => x.grammarId === grammarId);
  return Boolean(m && atLeast(m, 'COMPARABLE'));
}
