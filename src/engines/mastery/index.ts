import type { Attempt } from '@/domain/attempt';
import type { GrammarMastery, MasteryEvent, MasteryEvidence } from '@/domain/mastery';
import type { Question } from '@/domain/question';
import type { Timeline } from '@/domain/learner';
import type { BaseRank, MasteryState, QuestionType } from '@/domain/enums';
import { BASE_RANK_ORDER } from '@/domain/enums';
import { MASTERY_RULES, RT_OUTLIER_MS, SLOW_FACTOR, GUESS_WINDOW } from '@/config/learning.config';
import { staleThresholdDays } from '@/config/phase.config';
import { targetRt } from '@/config/timing.config';
import { daysAgo, daysBetweenKeys } from '@/shared/date';
import { median } from '@/shared/math';

export * from './metrics';

const LADDER: BaseRank[] = ['INTRODUCED', 'RECOGNIZED', 'COMPARABLE', 'EXAM_READY'];
const RECOGNITION_TYPES: QuestionType[] = ['MEANING_MC', 'FORM_MC'];
const COMPARISON_TYPES: QuestionType[] = ['MINIMAL_PAIR', 'WHY_NOT_OTHER'];
const EXAM_STYLE_TYPES: QuestionType[] = ['CLOZE_MC', 'SENTENCE_BUILD', 'TEXT_GRAMMAR'];

export function createInitialMastery(grammarId: string): GrammarMastery {
  return {
    grammarId,
    state: 'UNSEEN',
    baseRank: null,
    isStale: false,
    correctCount: 0,
    wrongCount: 0,
    distinctCorrectDays: 0,
    streak: 0,
    guessRate: 0,
    confusedWith: {},
    stateHistory: [],
    pinned: false,
  };
}

/** state ≥ mốc? SHAKY/CONFUSED lấy theo baseRank (G-01). */
export function rankValue(m: GrammarMastery): number {
  if (m.state === 'UNSEEN') return 0;
  const rank = m.baseRank ?? 'INTRODUCED';
  return BASE_RANK_ORDER[rank];
}

export function atLeast(m: GrammarMastery, rank: BaseRank): boolean {
  return rankValue(m) >= BASE_RANK_ORDER[rank];
}

function demoteRank(rank: BaseRank | null): BaseRank {
  if (!rank) return 'INTRODUCED';
  const idx = LADDER.indexOf(rank);
  return LADDER[Math.max(0, idx - 1)];
}

function promoteRank(rank: BaseRank | null): BaseRank {
  if (!rank) return 'INTRODUCED';
  const idx = LADDER.indexOf(rank);
  return LADDER[Math.min(LADDER.length - 1, idx + 1)];
}

function lastDistinctDays(attempts: Attempt[]): number {
  return new Set(attempts.map((a) => a.dayKey)).size;
}

/* ─────────────── Vị từ thăng cấp (dịch nguyên CLAUDE.md §5.1) ─────────────── */

export function canRecognize(history: Attempt[]): boolean {
  const recogCorrect = history.filter((a) => RECOGNITION_TYPES.includes(a.questionType) && a.isCorrect);
  if (recogCorrect.length < MASTERY_RULES.recognizeMinCorrect) return false;
  if (lastDistinctDays(recogCorrect) < MASTERY_RULES.recognizeMinDistinctDays) return false;

  const last2 = history.slice(-MASTERY_RULES.recognizeLastNAllCorrect);
  if (last2.length < MASTERY_RULES.recognizeLastNAllCorrect) return false;
  if (!last2.every((a) => a.isCorrect)) return false;

  const last = history[history.length - 1];
  return last.confidence !== 'GUESS';
}

export function canCompare(history: Attempt[], now: Date): boolean {
  const comp = history.filter((a) => COMPARISON_TYPES.includes(a.questionType) && a.subKind !== 'AXIS_ID');
  const window = comp.slice(-MASTERY_RULES.compareWindow);
  if (window.length < MASTERY_RULES.compareWindow) return false;
  if (window.filter((a) => a.isCorrect).length < MASTERY_RULES.compareMinCorrect) return false;
  if (lastDistinctDays(window) < MASTERY_RULES.compareMinDistinctDays) return false;

  const recentConfusion = history.some(
    (a) =>
      a.errorType === 'SIMILAR_GRAMMAR_CONFUSION' &&
      daysAgo(a.timestamp, now) <= MASTERY_RULES.compareConfusionFreeDays,
  );
  return !recentConfusion;
}

export interface ExamReadyCheck {
  ok: boolean;
  missingVi: string[];
}

export function canExamReady(history: Attempt[], globalGuessRate = 0): ExamReadyCheck {
  const missingVi: string[] = [];
  const exam = history.filter((a) => EXAM_STYLE_TYPES.includes(a.questionType));
  const window = exam.slice(-MASTERY_RULES.examReadyWindow);

  if (window.length < MASTERY_RULES.examReadyWindow) {
    missingVi.push(
      `Cần ${MASTERY_RULES.examReadyWindow} câu dạng đề gần nhất (đang có ${window.length}).`,
    );
  }
  if (window.filter((a) => a.isCorrect).length < MASTERY_RULES.examReadyMinCorrect) {
    missingVi.push(`Cần đúng ít nhất ${MASTERY_RULES.examReadyMinCorrect}/${MASTERY_RULES.examReadyWindow} câu dạng đề.`);
  }
  if (!window.some((a) => a.isTimed)) {
    missingVi.push('Chưa có lần đúng nào trong bài có giới hạn thời gian.');
  }
  if (new Set(window.map((a) => a.sessionId)).size < 2) {
    missingVi.push('Mọi lần đúng đang nằm trong cùng một buổi học.');
  }

  // Tốc độ theo từng question type có mặt trong bằng chứng.
  const byType = new Map<QuestionType, number[]>();
  for (const a of window) {
    if (a.responseTimeMs > RT_OUTLIER_MS) continue;
    byType.set(a.questionType, [...(byType.get(a.questionType) ?? []), a.responseTimeMs]);
  }
  for (const [type, values] of byType) {
    const target = targetRt(type, 'PHASE_3_DETECT');
    if (median(values) > target) {
      missingVi.push(`Tốc độ ở ${type} còn ${Math.round(median(values) / 1000)}s, mục tiêu ${Math.round(target / 1000)}s.`);
    }
  }

  const lastSix = history.slice(-MASTERY_RULES.examReadyWindow);
  const confidentRatio =
    lastSix.length === 0 ? 0 : lastSix.filter((a) => a.confidence === 'CONFIDENT').length / lastSix.length;
  if (confidentRatio < MASTERY_RULES.examReadyMinConfidentRatio) {
    missingVi.push(`Tỉ lệ "chắc chắn" mới đạt ${Math.round(confidentRatio * 100)}%, cần ≥ 70%.`);
  }

  // Sống sót qua khoảng nghỉ ≥ 3 ngày.
  let survived = false;
  for (let i = 1; i < history.length; i++) {
    if (
      history[i].isCorrect &&
      daysBetweenKeys(history[i - 1].dayKey, history[i].dayKey) >= MASTERY_RULES.examReadySurvivalGapDays
    ) {
      survived = true;
      break;
    }
  }
  if (!survived) {
    missingVi.push(`Cần 1 lần đúng sau khi nghỉ ít nhất ${MASTERY_RULES.examReadySurvivalGapDays} ngày.`);
  }

  // Bằng chứng phải đến từ nội dung VERIFIED (CLAUDE.md §16.4).
  if (window.length > 0 && !window.every((a) => a.verified)) {
    missingVi.push('Bằng chứng đang đến từ nội dung chưa được xác minh (NEEDS_REVIEW).');
  }

  // guessRate toàn cục cao thì khoá thăng cấp (analytics-engine §4.3).
  if (globalGuessRate > MASTERY_RULES.guessRateExamReadyLock) {
    missingVi.push('Tỉ lệ "đoán" gần đây còn cao — hệ thống tạm khoá mức Sẵn sàng thi.');
  }

  return { ok: missingVi.length === 0, missingVi };
}

export function canPromoteToExamReady(
  mastery: GrammarMastery,
  evidence: MasteryEvidence,
): ExamReadyCheck {
  if (!atLeast(mastery, 'COMPARABLE')) {
    return { ok: false, missingVi: ['Cần đạt mức "Phân biệt được" trước.'] };
  }
  return canExamReady(evidence.priorAttempts, evidence.globalGuessRate ?? 0);
}

/* ─────────────── applyAttempt ─────────────── */

function event(from: MasteryState, to: MasteryState, at: string, reason: string): MasteryEvent {
  return { at, from, to, reason };
}

/**
 * MasteryEngine.applyAttempt — nơi DUY NHẤT đổi MasteryState.
 * Pure: không I/O, không Date.now(). Thứ tự bắt buộc: đếm → cờ → TỤT → THĂNG.
 */
export function applyAttempt(
  mastery: GrammarMastery,
  attempt: Attempt,
  question: Question,
  now: Date,
  evidence: MasteryEvidence = { priorAttempts: [] },
): { mastery: GrammarMastery; event?: MasteryEvent } {
  const prior = evidence.priorAttempts;
  // `question` là nguồn sự thật về verificationStatus (grammar-schema §5.2) —
  // bằng chứng từ nội dung NEEDS_REVIEW không được dùng để thăng EXAM_READY.
  const scored: Attempt = { ...attempt, verified: question.verificationStatus === 'VERIFIED' };
  const history = [...prior, scored];
  const at = scored.timestamp;
  const from = mastery.state;

  /* 1. Bộ đếm */
  const next: GrammarMastery = {
    ...mastery,
    confusedWith: { ...mastery.confusedWith },
    stateHistory: [...mastery.stateHistory],
    correctCount: mastery.correctCount + (scored.isCorrect ? 1 : 0),
    wrongCount: mastery.wrongCount + (scored.isCorrect ? 0 : 1),
    streak: scored.isCorrect ? mastery.streak + 1 : 0,
    lastReviewedAt: at,
    firstSeenAt: mastery.firstSeenAt ?? at,
    isStale: false,
  };
  next.distinctCorrectDays = new Set(history.filter((a) => a.isCorrect).map((a) => a.dayKey)).size;

  const rtSamples = history.filter((a) => a.responseTimeMs <= RT_OUTLIER_MS).map((a) => a.responseTimeMs);
  next.medianResponseTimeMs = rtSamples.length ? median(rtSamples) : undefined;

  const lastN = history.slice(-GUESS_WINDOW);
  next.guessRate = lastN.length ? lastN.filter((a) => a.confidence === 'GUESS').length / lastN.length : 0;

  if (!scored.isCorrect && scored.confusedWith) {
    next.confusedWith[scored.confusedWith] = (next.confusedWith[scored.confusedWith] ?? 0) + 1;
  }

  /* 2. Cờ rủi ro */
  const sameTypeRt = prior
    .filter((a) => a.questionType === scored.questionType && a.responseTimeMs <= RT_OUTLIER_MS)
    .map((a) => a.responseTimeMs);
  const personalMedian = sameTypeRt.length ? median(sameTypeRt) : null;
  const isGuessCorrect = scored.isCorrect && scored.confidence === 'GUESS';
  const isTooSlow =
    personalMedian !== null && scored.responseTimeMs > SLOW_FACTOR * personalMedian;

  let state: MasteryState = mastery.state;
  let baseRank: BaseRank | null = mastery.baseRank;
  let reason = '';

  /* UNSEEN → INTRODUCED: chạm mẫu lần đầu qua learn card + mini recall */
  if (state === 'UNSEEN') {
    state = 'INTRODUCED';
    baseRank = 'INTRODUCED';
    reason = 'Đã học thẻ và trả lời mini-recall lần đầu.';
    next.state = state;
    next.baseRank = baseRank;
    const ev = event(from, state, at, reason);
    next.stateHistory.push(ev);
    return { mastery: next, event: ev };
  }

  /* 3. TỤT CẤP trước (CLAUDE.md §5.2) */
  let demoted = false;

  if (!scored.isCorrect) {
    if (atLeast(mastery, 'RECOGNIZED')) {
      baseRank = demoteRank(baseRank);
      state = 'SHAKY';
      reason = 'Trả lời sai — tụt một bậc và đánh dấu chưa vững.';
      demoted = true;
    } else {
      state = mastery.state === 'CONFUSED' ? 'CONFUSED' : mastery.state;
    }

    // Nhầm cùng một mẫu ≥ 2 lần trong 14 ngày → CONFUSED
    if (scored.confusedWith) {
      const partner = scored.confusedWith;
      const recentSame = history.filter(
        (a) =>
          !a.isCorrect &&
          a.confusedWith === partner &&
          daysAgo(a.timestamp, now) <= MASTERY_RULES.confusionWindowDays,
      ).length;
      if (recentSame >= MASTERY_RULES.confusionThreshold) {
        state = 'CONFUSED';
        next.confusedPair = partner;
        reason = `Nhầm với mẫu ${partner} ${recentSame} lần trong ${MASTERY_RULES.confusionWindowDays} ngày.`;
        demoted = true;
      }
    }
  } else if (isGuessCorrect) {
    if (atLeast(mastery, 'RECOGNIZED')) {
      state = 'SHAKY';
      reason = 'Đúng nhưng do đoán — chưa tính là vững.';
    }
    demoted = true; // không thăng cấp
  } else if (isTooSlow) {
    if (atLeast(mastery, 'RECOGNIZED')) {
      state = 'SHAKY';
      reason = 'Trả lời đúng nhưng chậm bất thường so với chính bạn.';
    }
    demoted = true;
  }

  /* 3b. Thoát CONFUSED chỉ bằng contrast drill của ĐÚNG cặp đó */
  if (mastery.state === 'CONFUSED' && !demoted && scored.isCorrect) {
    const win = evidence.contrastDrillWin;
    const pair = mastery.confusedPair;
    const won =
      win &&
      pair &&
      win.partnerId === pair &&
      ((win.total === MASTERY_RULES.exitConfusedStrict && win.correct === MASTERY_RULES.exitConfusedStrict) ||
        (win.total === MASTERY_RULES.exitConfusedWindow && win.correct >= MASTERY_RULES.exitConfusedMinCorrect));
    if (won) {
      state = baseRank ?? 'INTRODUCED';
      next.confusedPair = undefined;
      reason = `Đã thắng bài luyện đối chiếu với ${pair}.`;
    } else {
      state = 'CONFUSED';
      demoted = true;
    }
  }

  /* 4. THĂNG CẤP — chỉ khi không có tụt/khoá nào trong lượt này */
  if (!demoted && scored.isCorrect) {
    // Gỡ cờ SHAKY trước: phải trả lời đúng, không đoán, không chậm.
    if (mastery.state === 'SHAKY') {
      state = baseRank ?? 'INTRODUCED';
      reason = 'Đã trả lời đúng và chắc chắn trở lại.';
    }

    const currentRank: BaseRank = baseRank ?? 'INTRODUCED';
    if (currentRank === 'INTRODUCED' && canRecognize(history)) {
      baseRank = promoteRank(currentRank);
      state = 'RECOGNIZED';
      reason = 'Nhận ra mẫu và hiểu nghĩa qua nhiều ngày khác nhau.';
    } else if (currentRank === 'RECOGNIZED' && canCompare(history, now)) {
      baseRank = promoteRank(currentRank);
      state = 'COMPARABLE';
      reason = 'Phân biệt được với các mẫu gần nghĩa cùng nhóm.';
    } else if (currentRank === 'COMPARABLE') {
      const check = canExamReady(history, evidence.globalGuessRate ?? 0);
      if (check.ok) {
        baseRank = promoteRank(currentRank);
        state = 'EXAM_READY';
        reason = 'Xử lý ổn câu dạng đề có giới hạn thời gian, và sống sót qua khoảng nghỉ.';
      }
    }
  }

  /* 5. Sàn — không bao giờ về UNSEEN (M2) */
  if (state === 'UNSEEN') state = 'INTRODUCED';
  if (baseRank === null) baseRank = 'INTRODUCED';

  next.state = state;
  next.baseRank = baseRank;

  if (state !== from) {
    const ev = event(from, state, at, reason || 'Cập nhật theo kết quả trả lời.');
    next.stateHistory.push(ev);
    return { mastery: next, event: ev };
  }
  return { mastery: next };
}

/** CLAUDE.md §5.3 — decay CHỈ đặt cờ isStale, không đổi state. */
export function applyDecay(mastery: GrammarMastery, timeline: Timeline, now: Date): GrammarMastery {
  if (!atLeast(mastery, 'RECOGNIZED') || !mastery.lastReviewedAt) return mastery;
  const threshold = staleThresholdDays(timeline.currentPhase, timeline.mode);
  const isStale = daysAgo(mastery.lastReviewedAt, now) > threshold;
  return isStale === mastery.isStale ? mastery : { ...mastery, isStale };
}

/** Đánh dấu đã hoàn thành learn card (điều kiện đầu của UNSEEN → INTRODUCED). */
export function markLearnCardDone(mastery: GrammarMastery, now: Date): GrammarMastery {
  return { ...mastery, learnCardDoneAt: now.toISOString(), firstSeenAt: mastery.firstSeenAt ?? now.toISOString() };
}
