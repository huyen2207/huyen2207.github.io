import type { GrammarMastery } from '@/domain/mastery';
import type { Attempt } from '@/domain/attempt';
import type { Timeline } from '@/domain/learner';
import type { CoverageAudit, WeaknessProfile } from '@/domain/analytics';
import type {
  Confidence,
  DeliveryMode,
  ExamFrequency,
  GrammarFamily,
  QuestionType,
} from '@/domain/enums';
import {
  BASE_INTERVAL_DAYS,
  COMPRESSION,
  CONFUSION_SATURATION,
  ERROR_HALF_LIFE_DAYS,
  ERROR_SATURATION,
  EXAM_FREQUENCY_WEIGHT,
  GUARANTEED_SECOND_RATIO,
  MIN_ENCOUNTERS_BEFORE_EXAM,
  MS_PER_SECOND,
  NEVER_REVIEWED_SENTINEL,
  REVIEW_FAMILY_DIVISOR,
  REVIEW_PAIR_DIVISOR,
  ONE_DECIMAL,
  PHASE_FIT,
  PRIORITY_WEIGHTS,
  PRIORITY_WEIGHTS_NEAR_EXAM,
  STATE_WEIGHT,
  TRAP_SATURATION,
} from '@/config/learning.config';
import { staleThresholdDays } from '@/config/phase.config';
import { targetRt } from '@/config/timing.config';
import { addDaysToKey, dayKeyToUtcIso, daysAgo, daysBetweenKeys, isoToDayKey } from '@/shared/date';
import { clamp } from '@/shared/math';
import { atLeast, rankValue } from '@/engines/mastery';

export interface ReasonRef {
  key: string;
  params: Record<string, string | number>;
}

export interface GrammarPrioritySignals {
  examFrequency: ExamFrequency;
  family: GrammarFamily;
  /** Σ w(a)·[a sai] với w = 0.5^(daysAgo/7), cửa sổ 14 ngày. */
  weightedErrors: number;
  /** Số lần sập bẫy trong 14 ngày. */
  trapMisses: number;
  medianRtMs?: number;
  dominantType?: QuestionType;
  recentConfidences: Confidence[];
  hasTrapHistory: boolean;
}

export interface PriorityContext {
  timeline: Timeline;
  weakness: WeaknessProfile;
  now: Date;
  seenTodayGrammarIds: string[];
  signals: Record<string, GrammarPrioritySignals>;
}

export interface ScoredItem {
  grammarId: string;
  priority: number;
  reasons: ReasonRef[];
  suggestedDelivery: DeliveryMode;
  mixedOnly: boolean;
  pinned: boolean;
}

const EMPTY_SIGNALS: GrammarPrioritySignals = {
  examFrequency: 'MEDIUM',
  family: 'EVALUATION',
  weightedErrors: 0,
  trapMisses: 0,
  recentConfidences: [],
  hasTrapHistory: false,
};

/** Σ w(a)·[a sai] — dùng ở tầng app để dựng signals mà không cần lặp lại công thức. */
export function weightedErrorScore(attempts: Attempt[], now: Date): number {
  return attempts
    .filter((a) => !a.isCorrect)
    .reduce((s, a) => s + Math.pow(0.5, daysAgo(a.timestamp, now) / ERROR_HALF_LIFE_DAYS), 0);
}

interface Components {
  stateWeight: number;
  errorPressure: number;
  confusionPressure: number;
  decay: number;
  speedPenalty: number;
  guessPenalty: number;
  examFrequencyWeight: number;
  recencyPenalty: number;
  trapPressure: number;
}

export function priorityComponents(
  mastery: GrammarMastery,
  ctx: PriorityContext,
): Components {
  const sig = ctx.signals[mastery.grammarId] ?? EMPTY_SIGNALS;
  const threshold = staleThresholdDays(ctx.timeline.currentPhase, ctx.timeline.mode);

  const decay = mastery.lastReviewedAt
    ? clamp(daysAgo(mastery.lastReviewedAt, ctx.now) / threshold, 0, 1)
    : 0;

  const confusionMax = Object.values(mastery.confusedWith).reduce((a, b) => Math.max(a, b), 0);

  const target = sig.dominantType ? targetRt(sig.dominantType, ctx.timeline.currentPhase) : null;
  const speedPenalty =
    sig.medianRtMs && target ? clamp(sig.medianRtMs / target - 1, 0, 1) : 0;

  const conf = sig.recentConfidences;
  const guessPenalty =
    conf.length === 0
      ? 0
      : clamp(
          conf.reduce((s, c) => s + (c === 'GUESS' ? 1 : c === 'UNSURE' ? 0.5 : 0), 0) / conf.length,
          0,
          1,
        );

  return {
    stateWeight: STATE_WEIGHT[mastery.state],
    errorPressure: clamp(sig.weightedErrors / ERROR_SATURATION, 0, 1),
    confusionPressure: clamp(confusionMax / CONFUSION_SATURATION, 0, 1),
    decay,
    speedPenalty,
    guessPenalty,
    examFrequencyWeight: EXAM_FREQUENCY_WEIGHT[sig.examFrequency],
    recencyPenalty: ctx.seenTodayGrammarIds.includes(mastery.grammarId) ? 1 : 0,
    trapPressure: clamp(sig.trapMisses / TRAP_SATURATION, 0, 1),
  };
}

export function phaseFitOf(mastery: GrammarMastery, ctx: PriorityContext): number {
  const sig = ctx.signals[mastery.grammarId] ?? EMPTY_SIGNALS;
  const phase = ctx.timeline.currentPhase;
  let fit = 1.0;
  if (phase === 'PHASE_1_KNOW' && !atLeast(mastery, 'RECOGNIZED')) fit = PHASE_FIT.phase1Unrecognized;
  else if (phase === 'PHASE_2_COMPARE' && mastery.state === 'CONFUSED') fit = PHASE_FIT.phase2Confused;
  else if (phase === 'PHASE_3_DETECT' && sig.hasTrapHistory) fit = PHASE_FIT.phase3TrapHistory;
  return Math.min(fit, PHASE_FIT.max);
}

/** CLAUDE.md §14.1 — trọng số chép nguyên, không được đổi. */
export function computePriority(mastery: GrammarMastery, ctx: PriorityContext): number {
  const c = priorityComponents(mastery, ctx);
  const nearExam = ctx.timeline.isNearExam;
  const w = nearExam ? PRIORITY_WEIGHTS_NEAR_EXAM : PRIORITY_WEIGHTS;

  let score =
    w.stateWeight * c.stateWeight +
    w.errorPressure * c.errorPressure +
    w.confusionPressure * c.confusionPressure +
    w.decay * c.decay +
    w.speedPenalty * c.speedPenalty +
    w.guessPenalty * c.guessPenalty +
    w.examFrequencyWeight * c.examFrequencyWeight +
    w.recencyPenalty * c.recencyPenalty;

  if (nearExam) score += PRIORITY_WEIGHTS_NEAR_EXAM.trapPressure * c.trapPressure;

  return score * phaseFitOf(mastery, ctx);
}

/** review-engine §4.6 — engine trả ruleId + tham số, chuỗi hiển thị nằm ở i18n. */
export function reasonsFor(mastery: GrammarMastery, ctx: PriorityContext): ReasonRef[] {
  const c = priorityComponents(mastery, ctx);
  const nearExam = ctx.timeline.isNearExam;
  const w = nearExam ? PRIORITY_WEIGHTS_NEAR_EXAM : PRIORITY_WEIGHTS;
  const sig = ctx.signals[mastery.grammarId] ?? EMPTY_SIGNALS;

  const topPair = Object.entries(mastery.confusedWith).sort((a, b) => b[1] - a[1])[0];
  const contributions: Array<{ value: number; reason: ReasonRef }> = [
    {
      value: w.confusionPressure * c.confusionPressure,
      reason: {
        key: 'review.reason.confusion',
        params: { partner: topPair?.[0] ?? '', count: topPair?.[1] ?? 0 },
      },
    },
    {
      value: w.errorPressure * c.errorPressure,
      reason: { key: 'review.reason.errors', params: { count: Math.round(sig.weightedErrors * ONE_DECIMAL) / ONE_DECIMAL } },
    },
    {
      value: w.decay * c.decay,
      reason: {
        key: 'review.reason.decay',
        params: { days: mastery.lastReviewedAt ? daysAgo(mastery.lastReviewedAt, ctx.now) : 0 },
      },
    },
    {
      value: w.speedPenalty * c.speedPenalty,
      reason: {
        key: 'review.reason.speed',
        params: {
          actual: Math.round((sig.medianRtMs ?? 0) / MS_PER_SECOND),
          target: sig.dominantType
            ? Math.round(targetRt(sig.dominantType, ctx.timeline.currentPhase) / MS_PER_SECOND)
            : 0,
        },
      },
    },
    {
      value: w.guessPenalty * c.guessPenalty,
      reason: {
        key: 'review.reason.guess',
        params: {
          count: sig.recentConfidences.filter((x) => x === 'GUESS').length,
          total: sig.recentConfidences.length,
        },
      },
    },
    {
      value: w.stateWeight * c.stateWeight,
      reason: { key: 'review.reason.state', params: { state: mastery.state } },
    },
  ];
  if (nearExam) {
    contributions.push({
      value: PRIORITY_WEIGHTS_NEAR_EXAM.trapPressure * c.trapPressure,
      reason: { key: 'review.reason.trap', params: { count: sig.trapMisses } },
    });
  }

  const top = contributions
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((x) => x.reason);

  return top.length ? top : [{ key: 'review.reason.state', params: { state: mastery.state } }];
}

/* ─────────────── Interval ─────────────── */

export function baseIntervalFor(
  isCorrect: boolean,
  confidence: Confidence,
  mastery: GrammarMastery,
): number {
  if (!isCorrect) return BASE_INTERVAL_DAYS.WRONG;
  if (mastery.state === 'SHAKY') return BASE_INTERVAL_DAYS.CORRECT_SHAKY;
  if (mastery.state === 'CONFUSED') return BASE_INTERVAL_DAYS.CORRECT_CONFUSED;
  if (confidence === 'GUESS') return BASE_INTERVAL_DAYS.CORRECT_GUESS;
  if (confidence === 'UNSURE') return BASE_INTERVAL_DAYS.CORRECT_UNSURE;
  switch (mastery.baseRank ?? 'INTRODUCED') {
    case 'EXAM_READY':
      return BASE_INTERVAL_DAYS.CORRECT_CONFIDENT_EXAM_READY;
    case 'COMPARABLE':
      return BASE_INTERVAL_DAYS.CORRECT_CONFIDENT_COMPARABLE;
    case 'RECOGNIZED':
      return BASE_INTERVAL_DAYS.CORRECT_CONFIDENT_RECOGNIZED;
    default:
      return BASE_INTERVAL_DAYS.CORRECT_CONFIDENT_INTRODUCED;
  }
}

export function compressionFactor(daysUntilExam: number): number {
  if (daysUntilExam > COMPRESSION.farThresholdDays) return COMPRESSION.farFactor;
  if (daysUntilExam > COMPRESSION.nearThresholdDays) return COMPRESSION.midFactor;
  return COMPRESSION.nearFactor;
}

/** CLAUDE.md §14.3 — nén theo ngày thi. interval luôn ≥ 1 và là số nguyên. */
export function compressInterval(baseInterval: number, daysUntilExam: number): number {
  const factor = compressionFactor(daysUntilExam);
  const cap = Math.max(1, Math.floor(daysUntilExam * COMPRESSION.capRatio));
  return Math.max(1, Math.floor(Math.min(baseInterval * factor, cap)));
}

export function computeNextReview(
  mastery: GrammarMastery,
  attempt: { isCorrect: boolean; confidence: Confidence },
  timeline: Timeline,
  dayBoundaryHour: number,
): string {
  const base = baseIntervalFor(attempt.isCorrect, attempt.confidence, mastery);
  const interval = compressInterval(base, Math.max(1, timeline.daysRemaining));
  let targetKey = addDaysToKey(timeline.todayKey, interval);

  // Không lên lịch sau ngày thi (§5.3).
  const examKey = addDaysToKey(timeline.todayKey, Math.max(0, timeline.daysRemaining));
  if (daysBetweenKeys(targetKey, examKey) < 0) {
    targetKey = addDaysToKey(examKey, -1);
    if (daysBetweenKeys(timeline.todayKey, targetKey) < 1) targetKey = addDaysToKey(timeline.todayKey, 1);
  }
  return dayKeyToUtcIso(targetKey, dayBoundaryHour);
}

/**
 * Ngoại lệ DUY NHẤT được phép sửa hàng loạt nextReviewAt:
 * người học đổi examDate GẦN HƠN (review-engine §10).
 */
export function recompressAll(
  all: GrammarMastery[],
  timeline: Timeline,
  dayBoundaryHour: number,
): GrammarMastery[] {
  const examKey = addDaysToKey(timeline.todayKey, Math.max(0, timeline.daysRemaining));
  const lastAllowed = addDaysToKey(examKey, -1);
  return all.map((m) => {
    if (!m.nextReviewAt) return m;
    const key = isoToDayKey(m.nextReviewAt);
    if (daysBetweenKeys(key, lastAllowed) >= 0) return m;
    return { ...m, nextReviewAt: dayKeyToUtcIso(lastAllowed, dayBoundaryHour) };
  });
}

/* ─────────────── selectDueItems ─────────────── */

export function suggestedDeliveryFor(
  mastery: GrammarMastery,
  ctx: PriorityContext,
): DeliveryMode {
  const c = priorityComponents(mastery, ctx);
  if (ctx.timeline.mode === 'FINAL_7') return 'TIMED';
  if (mastery.state === 'CONFUSED') return 'STUDY';
  if (c.speedPenalty > 0.5) return 'TIMED';
  if (ctx.timeline.currentPhase === 'PHASE_3_DETECT' && atLeast(mastery, 'COMPARABLE')) return 'TIMED';
  if (mastery.state === 'SHAKY' && ctx.timeline.currentPhase !== 'PHASE_3_DETECT') return 'PRACTICE';
  return 'PRACTICE';
}

function tieBreak(a: ScoredItem, b: ScoredItem, ctx: PriorityContext, byId: Map<string, GrammarMastery>): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const fa = EXAM_FREQUENCY_WEIGHT[(ctx.signals[a.grammarId] ?? EMPTY_SIGNALS).examFrequency];
  const fb = EXAM_FREQUENCY_WEIGHT[(ctx.signals[b.grammarId] ?? EMPTY_SIGNALS).examFrequency];
  if (fb !== fa) return fb - fa;
  const ma = byId.get(a.grammarId);
  const mb = byId.get(b.grammarId);
  const da = ma?.lastReviewedAt ? daysAgo(ma.lastReviewedAt, ctx.now) : NEVER_REVIEWED_SENTINEL;
  const dbb = mb?.lastReviewedAt ? daysAgo(mb.lastReviewedAt, ctx.now) : NEVER_REVIEWED_SENTINEL;
  if (dbb !== da) return dbb - da;
  return a.grammarId.localeCompare(b.grammarId);
}

export function selectDueItems(
  allMastery: GrammarMastery[],
  ctx: PriorityContext,
  capacity: number,
): ScoredItem[] {
  if (capacity <= 0) return [];
  const byId = new Map(allMastery.map((m) => [m.grammarId, m]));
  const nowIso = ctx.now.toISOString();
  const nearExam = ctx.timeline.isNearExam;

  const eligible = allMastery.filter((m) => m.state !== 'UNSEEN');
  const isDue = (m: GrammarMastery) => Boolean(m.nextReviewAt && m.nextReviewAt <= nowIso);

  let pool = eligible.filter((m) => isDue(m) || m.isStale || m.state === 'CONFUSED');
  // Không để block REVIEW trống (review-engine §10).
  if (pool.length === 0) pool = eligible;

  const score = (m: GrammarMastery): ScoredItem => ({
    grammarId: m.grammarId,
    priority: computePriority(m, ctx),
    reasons: pool === eligible && !isDue(m) && !m.isStale
      ? [{ key: 'review.reason.noBacklog', params: {} }]
      : reasonsFor(m, ctx),
    suggestedDelivery: suggestedDeliveryFor(m, ctx),
    mixedOnly: nearExam && m.state === 'EXAM_READY',
    pinned: m.pinned,
  });

  const pinned = eligible.filter((m) => m.pinned).map(score).sort((a, b) => tieBreak(a, b, ctx, byId));
  const pinnedIds = new Set(pinned.map((p) => p.grammarId));
  const rest = pool
    .filter((m) => !pinnedIds.has(m.grammarId))
    .map(score)
    .sort((a, b) => tieBreak(a, b, ctx, byId));

  const out: ScoredItem[] = [];
  const familyCount = new Map<GrammarFamily, number>();
  const pairCount = new Map<string, number>();
  const familyCap = Math.ceil(capacity / REVIEW_FAMILY_DIVISOR);
  const pairCap = Math.ceil(capacity / REVIEW_PAIR_DIVISOR);

  const tryPush = (item: ScoredItem, enforceDiversity: boolean): boolean => {
    if (out.length >= capacity) return false;
    if (enforceDiversity) {
      const sig = ctx.signals[item.grammarId] ?? EMPTY_SIGNALS;
      if ((familyCount.get(sig.family) ?? 0) >= familyCap) return false;
      const m = byId.get(item.grammarId);
      const pair = m?.confusedPair ? [m.grammarId, m.confusedPair].sort().join('|') : null;
      if (pair && (pairCount.get(pair) ?? 0) >= pairCap) return false;
      familyCount.set(sig.family, (familyCount.get(sig.family) ?? 0) + 1);
      if (pair) pairCount.set(pair, (pairCount.get(pair) ?? 0) + 1);
    }
    out.push(item);
    return true;
  };

  for (const item of pinned) tryPush(item, false);
  for (const item of rest) tryPush(item, true);
  // Nếu ràng buộc đa dạng làm thiếu chỗ, lấp bằng ứng viên còn lại theo thứ hạng.
  if (out.length < capacity) {
    const chosen = new Set(out.map((o) => o.grammarId));
    for (const item of rest) {
      if (out.length >= capacity) break;
      if (!chosen.has(item.grammarId)) {
        out.push(item);
        chosen.add(item.grammarId);
      }
    }
  }

  return out.slice(0, capacity);
}

/* ─────────────── auditExamCoverage ─────────────── */

export function auditExamCoverage(
  allMastery: GrammarMastery[],
  timeline: Timeline,
  dailyCapacity: number,
  ctx?: PriorityContext,
): CoverageAudit {
  const learned = allMastery.filter((m) => m.state !== 'UNSEEN');
  const requiredSlots = MIN_ENCOUNTERS_BEFORE_EXAM * learned.length;
  const daysLeft = Math.max(0, timeline.daysRemaining);
  const availableSlots = daysLeft * dailyCapacity;

  if (requiredSlots <= availableSlots) {
    return {
      ok: true,
      atRisk: [],
      requiredSlots,
      availableSlots,
      messageKey: 'analytics.coverage.ok',
      params: { requiredSlots, availableSlots },
    };
  }

  const shortfall = requiredSlots - availableSlots;
  const atRiskCount = Math.min(learned.length, Math.ceil(shortfall / MIN_ENCOUNTERS_BEFORE_EXAM));
  const ordered = ctx
    ? [...learned].sort((a, b) => computePriority(a, ctx) - computePriority(b, ctx))
    : [...learned].sort((a, b) => rankValue(b) - rankValue(a));

  return {
    ok: false,
    atRisk: ordered.slice(0, atRiskCount).map((m) => m.grammarId),
    requiredSlots,
    availableSlots,
    messageKey: 'analytics.coverage.atRisk',
    params: { count: atRiskCount, daysLeft, capacity: dailyCapacity },
  };
}

/** Ghim hai lượt bắt buộc trước ngày thi (G-04, review-engine §6.2). */
export function pinForGuaranteedEncounters(
  allMastery: GrammarMastery[],
  timeline: Timeline,
  dayBoundaryHour: number,
): GrammarMastery[] {
  const daysLeft = Math.max(0, timeline.daysRemaining);
  if (daysLeft <= 0) return allMastery;
  const secondKey = addDaysToKey(
    timeline.todayKey,
    Math.max(1, daysLeft - Math.max(1, Math.floor(daysLeft * GUARANTEED_SECOND_RATIO))),
  );

  return allMastery.map((m) => {
    if (m.state === 'UNSEEN') return m;
    const scheduledWithinWindow =
      m.nextReviewAt && daysBetweenKeys(isoToDayKey(m.nextReviewAt), addDaysToKey(timeline.todayKey, daysLeft)) > 0;
    const encounters = scheduledWithinWindow ? 1 : 0;
    if (encounters >= MIN_ENCOUNTERS_BEFORE_EXAM) return m;
    if (m.guaranteedSecondAt) return m;
    return {
      ...m,
      pinned: encounters === 0,
      guaranteedSecondAt: dayKeyToUtcIso(secondKey, dayBoundaryHour),
    };
  });
}
