import type { Attempt } from '@/domain/attempt';
import type { GrammarMetrics, SkillProfile } from '@/domain/mastery';
import type { EvidenceLevel, QuestionType, SkillDimension } from '@/domain/enums';
import {
  CONFIDENCE_EXPECTED,
  CONFUSION_SATURATION,
  ERROR_HALF_LIFE_DAYS,
  ERROR_WINDOW_DAYS,
  EVIDENCE_THRESHOLDS,
  GUESS_WINDOW,
  METRIC_WINDOW_DAYS,
  NEAR_EXAM_DAYS,
  RECENT_ATTEMPTS_WINDOW,
  RETENTION_GAP_DAYS,
  RT_OUTLIER_MS,
  SKILL_WEIGHTS,
} from '@/config/learning.config';
import { targetRt } from '@/config/timing.config';
import { MIN_METRIC_WINDOW_DAYS } from '@/config/learning.config';
import { accHat, clamp, median, weightedMean } from '@/shared/math';
import { daysAgo, daysBetweenKeys } from '@/shared/date';
import type { Phase } from '@/domain/enums';

const RECOGNITION_TYPES: QuestionType[] = ['MEANING_MC', 'FORM_MC'];
const COMPARISON_TYPES: QuestionType[] = ['MINIMAL_PAIR', 'WHY_NOT_OTHER'];
const EXAM_STYLE_TYPES: QuestionType[] = ['CLOZE_MC', 'SENTENCE_BUILD', 'TEXT_GRAMMAR'];
const USAGE_TYPES: QuestionType[] = ['CONTEXT_MATCH', 'VALID_OR_INVALID', 'GRAMMAR_RECOGNITION'];

export const QUESTION_TYPE_GROUPS = {
  RECOGNITION_TYPES,
  COMPARISON_TYPES,
  EXAM_STYLE_TYPES,
  USAGE_TYPES,
};

export interface MetricOptions {
  now: Date;
  phase: Phase;
  daysRemaining: number;
  choiceCountByQuestion?: Record<string, number>;
  /**
   * Câu nào có cài bẫy. Trước đây "độ nhận bẫy" chỉ đếm dạng câu meta `TRAP_ID`
   * ("câu này bẫy ở đâu?"), nên gỡ dạng đó đi là chỉ số tắt hẳn. Bẫy nằm sẵn trong
   * hàng trăm câu thường — đo trên chính chúng mới đúng việc làm bài.
   */
  trapByQuestion?: Record<string, boolean>;
}

/** Cửa sổ co lại khi gần thi (learning-engine §4.1). */
export function windowDays(base: number, daysRemaining: number): number {
  if (daysRemaining > 0 && daysRemaining <= NEAR_EXAM_DAYS) {
    return Math.max(MIN_METRIC_WINDOW_DAYS, daysRemaining);
  }
  return base;
}

function inWindow(a: Attempt, now: Date, days: number): boolean {
  return daysAgo(a.timestamp, now) <= days;
}

function p0For(a: Attempt, opts: MetricOptions): number {
  const n = opts.choiceCountByQuestion?.[a.questionId];
  return n && n > 0 ? 1 / n : 0.25;
}

function accuracyOf(attempts: Attempt[], opts: MetricOptions): number {
  if (attempts.length === 0) return accHat(0, 0, 0.25);
  const p0 = attempts.reduce((s, a) => s + p0For(a, opts), 0) / attempts.length;
  const correct = attempts.filter((a) => a.isCorrect).length;
  return accHat(correct, attempts.length, p0);
}

function recent(attempts: Attempt[], opts: MetricOptions, base = METRIC_WINDOW_DAYS): Attempt[] {
  const w = windowDays(base, opts.daysRemaining);
  return attempts.filter((a) => inWindow(a, opts.now, w)).slice(-RECENT_ATTEMPTS_WINDOW);
}

function byTypes(attempts: Attempt[], types: QuestionType[]): Attempt[] {
  return attempts.filter((a) => types.includes(a.questionType));
}

/** learning-engine §4.3 — chỉ tính trên attempt sống sót qua khoảng nghỉ ≥ 3 ngày. */
export function gapAttempts(attempts: Attempt[]): Attempt[] {
  const out: Attempt[] = [];
  for (let i = 1; i < attempts.length; i++) {
    const gap = daysBetweenKeys(attempts[i - 1].dayKey, attempts[i].dayKey);
    if (gap >= RETENTION_GAP_DAYS) out.push(attempts[i]);
  }
  return out;
}

/** learning-engine §4.4 — median theo type, loại outlier khỏi thống kê tốc độ. */
export function medianRtByType(attempts: Attempt[]): Partial<Record<QuestionType, number>> {
  const buckets = new Map<QuestionType, number[]>();
  for (const a of attempts) {
    if (a.responseTimeMs > RT_OUTLIER_MS) continue;
    const list = buckets.get(a.questionType) ?? [];
    list.push(a.responseTimeMs);
    buckets.set(a.questionType, list);
  }
  const out: Partial<Record<QuestionType, number>> = {};
  for (const [type, values] of buckets) out[type] = median(values);
  return out;
}

export function speedIndexOf(attempts: Attempt[], phase: Phase): number {
  const medians = medianRtByType(attempts);
  const pairs: Array<[number, number]> = [];
  for (const [type, med] of Object.entries(medians) as Array<[QuestionType, number]>) {
    if (!med) continue;
    const count = attempts.filter((a) => a.questionType === type).length;
    pairs.push([clamp(targetRt(type, phase) / med, 0, 1), count]);
  }
  if (pairs.length === 0) return 0;
  return clamp(weightedMean(pairs), 0, 1);
}

/** learning-engine §4.5 — 1.0 nghĩa là tự đánh giá khớp thực tế. */
export function calibrationOf(attempts: Attempt[]): number | null {
  const buckets = new Map<keyof typeof CONFIDENCE_EXPECTED, Attempt[]>();
  for (const a of attempts) {
    if (a.confidenceImputed) continue;
    const list = buckets.get(a.confidence) ?? [];
    list.push(a);
    buckets.set(a.confidence, list);
  }
  if (buckets.size < 2) return null;
  const total = [...buckets.values()].reduce((s, l) => s + l.length, 0);
  let err = 0;
  for (const [conf, list] of buckets) {
    const actual = list.filter((a) => a.isCorrect).length / list.length;
    err += (list.length / total) * Math.abs(CONFIDENCE_EXPECTED[conf] - actual);
  }
  return clamp(1 - err, 0, 1);
}

export function recentErrorRateOf(attempts: Attempt[], now: Date): number {
  const window = attempts.filter((a) => daysAgo(a.timestamp, now) <= ERROR_WINDOW_DAYS);
  if (window.length === 0) return 0;
  let num = 0;
  let den = 0;
  for (const a of window) {
    const w = Math.pow(0.5, daysAgo(a.timestamp, now) / ERROR_HALF_LIFE_DAYS);
    den += w;
    if (!a.isCorrect) num += w;
  }
  return den === 0 ? 0 : clamp(num / den, 0, 1);
}

export function evidenceLevelOf(attemptCount: number, distinctDays: number, hasRetention: boolean): EvidenceLevel {
  if (attemptCount === 0) return 'NONE';
  if (attemptCount < EVIDENCE_THRESHOLDS.thinAttempts || distinctDays < EVIDENCE_THRESHOLDS.thinDistinctDays) return 'THIN';
  if (
    attemptCount >= EVIDENCE_THRESHOLDS.solidAttempts &&
    distinctDays >= EVIDENCE_THRESHOLDS.solidDistinctDays &&
    hasRetention
  ) {
    return 'SOLID';
  }
  return 'OK';
}

export function computeGrammarMetrics(
  grammarId: string,
  allAttempts: Attempt[],
  opts: MetricOptions,
): GrammarMetrics {
  const attempts = allAttempts
    .filter((a) => a.grammarId === grammarId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const win = recent(attempts, opts);
  const distinctDays = new Set(attempts.map((a) => a.dayKey)).size;

  const gaps = gapAttempts(attempts);
  const retentionScore = gaps.length === 0 ? null : accuracyOf(gaps, opts);
  const medians = medianRtByType(win.length ? win : attempts);
  const overallMedian = median(
    (win.length ? win : attempts).filter((a) => a.responseTimeMs <= RT_OUTLIER_MS).map((a) => a.responseTimeMs),
  );
  const lastN = attempts.slice(-GUESS_WINDOW);

  return {
    grammarId,
    meaningAccuracy: accuracyOf(byTypes(win, ['MEANING_MC']), opts),
    formAccuracy: accuracyOf(byTypes(win, ['FORM_MC']), opts),
    usageAccuracy: accuracyOf(byTypes(win, USAGE_TYPES), opts),
    comparisonAccuracy: accuracyOf(byTypes(win, COMPARISON_TYPES), opts),
    timedAccuracy: accuracyOf(win.filter((a) => a.isTimed), opts),
    trapAccuracy: accuracyOf(win.filter((a) => isTrapAttempt(a, opts)), opts),
    examStyleAccuracy: accuracyOf(byTypes(win, EXAM_STYLE_TYPES), opts),
    retentionScore,
    medianResponseTimeMs: overallMedian,
    speedIndex: speedIndexOf(win.length ? win : attempts, opts.phase),
    confidenceCalibration: calibrationOf(win),
    guessRate: lastN.length === 0 ? 0 : lastN.filter((a) => a.confidence === 'GUESS').length / lastN.length,
    recentErrorRate: recentErrorRateOf(attempts, opts.now),
    evidence: evidenceLevelOf(attempts.length, distinctDays, retentionScore !== null),
    attemptCount: attempts.length,
    distinctDays,
    verifiedAttemptCount: attempts.filter((a) => a.verified).length,
    ...(Object.keys(medians).length ? {} : {}),
  };
}

/** Lần trả lời này có đụng bẫy không? */
function isTrapAttempt(a: Attempt, opts: MetricOptions): boolean {
  return a.questionType === 'TRAP_ID' || a.subKind === 'TRAP_ID' || Boolean(opts.trapByQuestion?.[a.questionId]);
}

function evidenceForDimension(
  dim: SkillDimension,
  attempts: Attempt[],
  retentionAvailable: boolean,
  opts?: MetricOptions,
): EvidenceLevel {
  const types =
    dim === 'KNOW' ? [...RECOGNITION_TYPES, ...USAGE_TYPES] : dim === 'COMPARE' ? COMPARISON_TYPES : EXAM_STYLE_TYPES;
  const subset = attempts.filter(
    (a) => types.includes(a.questionType) || (dim === 'DETECT' && (a.isTimed || (opts ? isTrapAttempt(a, opts) : a.questionType === 'TRAP_ID'))),
  );
  const days = new Set(subset.map((a) => a.dayKey)).size;
  return evidenceLevelOf(subset.length, days, retentionAvailable);
}

/**
 * learning-engine §5 — ba chiều là CHẨN ĐOÁN, không phải điều kiện thăng cấp (S5).
 * Chiều chưa có bằng chứng trả `null` chứ không trả `0` (S2).
 */
export function computeSkillProfile(
  metrics: GrammarMetrics,
  attempts: Attempt[],
  confusedWithTotal: number,
  opts?: MetricOptions,
): SkillProfile {
  const retentionPlus = metrics.retentionScore ?? metrics.meaningAccuracy;
  const confusionPenalty = clamp(confusedWithTotal / CONFUSION_SATURATION, 0, 1);

  const know =
    100 *
    (SKILL_WEIGHTS.KNOW.meaningAccuracy * metrics.meaningAccuracy +
      SKILL_WEIGHTS.KNOW.formAccuracy * metrics.formAccuracy +
      SKILL_WEIGHTS.KNOW.retention * retentionPlus +
      SKILL_WEIGHTS.KNOW.usageAccuracy * metrics.usageAccuracy);

  const compare =
    100 *
    (SKILL_WEIGHTS.COMPARE.comparisonAccuracy * metrics.comparisonAccuracy +
      SKILL_WEIGHTS.COMPARE.confusionFree * (1 - confusionPenalty) +
      SKILL_WEIGHTS.COMPARE.usageAccuracy * metrics.usageAccuracy);

  const detect =
    100 *
    (SKILL_WEIGHTS.DETECT.examStyleAccuracy * metrics.examStyleAccuracy +
      SKILL_WEIGHTS.DETECT.trapAccuracy * metrics.trapAccuracy +
      SKILL_WEIGHTS.DETECT.timedAccuracy * metrics.timedAccuracy +
      SKILL_WEIGHTS.DETECT.speedIndex * metrics.speedIndex);

  const evidence: Record<SkillDimension, EvidenceLevel> = {
    KNOW: evidenceForDimension('KNOW', attempts, metrics.retentionScore !== null, opts),
    COMPARE: evidenceForDimension('COMPARE', attempts, metrics.retentionScore !== null, opts),
    DETECT: evidenceForDimension('DETECT', attempts, metrics.retentionScore !== null, opts),
  };

  const scores: Record<SkillDimension, number | null> = {
    KNOW: evidence.KNOW === 'NONE' ? null : Math.round(know),
    COMPARE: evidence.COMPARE === 'NONE' ? null : Math.round(compare),
    DETECT: evidence.DETECT === 'NONE' ? null : Math.round(detect),
  };

  // S3 — bottleneck bỏ qua chiều THIN/NONE.
  const eligible = (['KNOW', 'COMPARE', 'DETECT'] as SkillDimension[]).filter(
    (d) => evidence[d] === 'OK' || evidence[d] === 'SOLID',
  );
  const bottleneck =
    eligible.length === 0
      ? null
      : eligible.reduce((lo, d) => ((scores[d] ?? 100) < (scores[lo] ?? 100) ? d : lo), eligible[0]);

  return { know: scores.KNOW, compare: scores.COMPARE, detect: scores.DETECT, evidence, bottleneck };
}
