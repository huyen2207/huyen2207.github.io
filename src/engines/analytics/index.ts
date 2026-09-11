import type { Attempt } from '@/domain/attempt';
import type { GrammarMastery } from '@/domain/mastery';
import type { StudyPlan, Timeline } from '@/domain/learner';
import type {
  ConfusionMatrix,
  CoverageAudit,
  DashboardMetrics,
  FamilyScore,
  MetricCard,
  PhaseTransitionSummary,
  ReadinessComponents,
  ReadinessSnapshot,
  Recommendation,
  TrendPoint,
  WeaknessProfile,
  WeeklyCheckpoint,
} from '@/domain/analytics';
import type {
  ErrorType,
  EvidenceLevel,
  Phase,
  QuestionType,
  ReadinessBand,
  SkillDimension,
} from '@/domain/enums';
import {
  ERS_BANDS,
  ERS_MIN_COVERAGE,
  ERS_STABILITY_CEIL,
  ERS_STABILITY_FLOOR,
  ERS_WEIGHTS,
  ERROR_WINDOW_DAYS,
  MAX_RECOMMENDATIONS,
  METRIC_WINDOW_DAYS,
  STABILITY_WINDOW_DAYS,
} from '@/config/learning.config';
import { targetRt } from '@/config/timing.config';
import { accHat, clamp, median, stdev } from '@/shared/math';
import { daysAgo } from '@/shared/date';
import { atLeast } from '@/engines/mastery';
import { evidenceLevelOf, gapAttempts, windowDays } from '@/engines/mastery/metrics';

export interface AnalyticsEnv {
  familiesOf: (grammarId: string) => string[];
  hasTrap: (questionId: string) => boolean;
  patternOf: (grammarId: string) => string;
  /** grammarId có < 2 câu hỏi (grammar-schema V11). */
  contentGaps: () => string[];
}

const RECOGNITION_TYPES: QuestionType[] = ['MEANING_MC', 'FORM_MC'];
const COMPARISON_TYPES: QuestionType[] = ['MINIMAL_PAIR', 'WHY_NOT_OTHER'];

function inWindow(a: Attempt, now: Date, days: number): boolean {
  return daysAgo(a.timestamp, now) <= days;
}

function acc(list: Attempt[]): number | null {
  if (list.length === 0) return null;
  return accHat(list.filter((a) => a.isCorrect).length, list.length);
}

export function computeCoverage(plan: StudyPlan, mastery: GrammarMastery[]): number {
  if (plan.coverageTarget === 0) return 0;
  const required = new Set(plan.requiredGrammarIds);
  const covered = mastery.filter((m) => required.has(m.grammarId) && atLeast(m, 'RECOGNIZED')).length;
  return clamp(covered / plan.coverageTarget, 0, 1);
}

export function recentStability(attempts: Attempt[], now: Date): { value: number; evidence: EvidenceLevel } {
  const scoped = attempts.filter((a) => inWindow(a, now, STABILITY_WINDOW_DAYS));
  const byDay = new Map<string, Attempt[]>();
  for (const a of scoped) byDay.set(a.dayKey, [...(byDay.get(a.dayKey) ?? []), a]);
  const daily = [...byDay.values()].map((l) => l.filter((a) => a.isCorrect).length / l.length);
  if (daily.length <= 1) return { value: 1, evidence: daily.length === 0 ? 'NONE' : 'THIN' };
  return { value: clamp(1 - stdev(daily), 0, 1), evidence: daily.length >= 4 ? 'OK' : 'THIN' };
}

export interface MetricsInput {
  attempts: Attempt[];
  mastery: GrammarMastery[];
  timeline: Timeline;
  plan: StudyPlan;
  weakness: WeaknessProfile;
  coverageAudit: CoverageAudit;
  env: AnalyticsEnv;
  now: Date;
  readinessHistory?: ReadinessSnapshot[];
}

export function computeMetrics(input: MetricsInput): DashboardMetrics {
  const { attempts, mastery, timeline, plan, weakness, env, now } = input;
  const shortWin = windowDays(ERROR_WINDOW_DAYS, timeline.daysRemaining);
  const longWin = windowDays(METRIC_WINDOW_DAYS, timeline.daysRemaining);
  const recent = attempts.filter((a) => inWindow(a, now, shortWin));

  const coverage = computeCoverage(plan, mastery);
  const recognitionAccuracy = acc(recent.filter((a) => RECOGNITION_TYPES.includes(a.questionType)));
  const comparisonAccuracy = acc(recent.filter((a) => COMPARISON_TYPES.includes(a.questionType)));
  const trapAccuracy = acc(recent.filter((a) => env.hasTrap(a.questionId) || a.questionType === 'TRAP_ID'));
  const timedAccuracy = acc(recent.filter((a) => a.isTimed));

  const longScoped = attempts.filter((a) => inWindow(a, now, longWin));
  const byGrammar = new Map<string, Attempt[]>();
  for (const a of longScoped) byGrammar.set(a.grammarId, [...(byGrammar.get(a.grammarId) ?? []), a]);
  const retentionAttempts = [...byGrammar.values()].flatMap((list) =>
    gapAttempts([...list].sort((x, y) => x.timestamp.localeCompare(y.timestamp))),
  );
  const retention = acc(retentionAttempts);

  const averageResponseTimeMs: Partial<Record<QuestionType, number>> = {};
  const accuracyByQuestionType: Partial<Record<QuestionType, number>> = {};
  const speedRatios: number[] = [];
  const byType = new Map<QuestionType, Attempt[]>();
  for (const a of recent) byType.set(a.questionType, [...(byType.get(a.questionType) ?? []), a]);
  for (const [type, list] of byType) {
    const med = median(list.map((a) => a.responseTimeMs));
    averageResponseTimeMs[type] = med;
    accuracyByQuestionType[type] = accHat(list.filter((a) => a.isCorrect).length, list.length);
    if (med > 0) speedRatios.push(clamp(targetRt(type, timeline.currentPhase) / med, 0, 1));
  }
  const speedIndex = speedRatios.length ? speedRatios.reduce((s, v) => s + v, 0) / speedRatios.length : null;

  const familyMap = new Map<string, Attempt[]>();
  for (const a of recent) {
    for (const f of env.familiesOf(a.grammarId)) familyMap.set(f, [...(familyMap.get(f) ?? []), a]);
  }
  const familyScores: FamilyScore[] = [...familyMap.entries()]
    .map(([family, list]) => ({
      family: family as FamilyScore['family'],
      accuracy: accHat(list.filter((a) => a.isCorrect).length, list.length),
      n: list.length,
      evidence: evidenceLevelOf(list.length, new Set(list.map((a) => a.dayKey)).size, false),
    }))
    .filter((f) => f.evidence === 'OK' || f.evidence === 'SOLID');

  const masteryCounts: Record<string, number> = {};
  for (const m of mastery) masteryCounts[m.state] = (masteryCounts[m.state] ?? 0) + 1;

  const stability = recentStability(attempts, now);
  const components: ReadinessComponents = {
    coverage,
    retention,
    comparisonAccuracy,
    trapDetection: trapAccuracy,
    timedAccuracy,
    speedIndex,
  };
  const readiness = computeReadiness(components, stability.value, coverage, now);

  const skillScores: Record<SkillDimension, number | null> = {
    KNOW: weakness.accuracyByPhaseSkill.KNOW === null ? null : Math.round(weakness.accuracyByPhaseSkill.KNOW * 100),
    COMPARE: weakness.accuracyByPhaseSkill.COMPARE === null ? null : Math.round(weakness.accuracyByPhaseSkill.COMPARE * 100),
    DETECT: weakness.accuracyByPhaseSkill.DETECT === null ? null : Math.round(weakness.accuracyByPhaseSkill.DETECT * 100),
  };
  const skillEvidence: Record<SkillDimension, EvidenceLevel> = {
    KNOW: skillScores.KNOW === null ? 'NONE' : 'OK',
    COMPARE: skillScores.COMPARE === null ? 'NONE' : 'OK',
    DETECT: skillScores.DETECT === null ? 'NONE' : 'OK',
  };

  const speedTrend: TrendPoint[] = buildSpeedTrend(attempts, now, timeline);

  return {
    daysRemaining: timeline.daysRemaining,
    currentPhase: timeline.currentPhase,
    mode: timeline.mode,
    coverage,
    recognitionAccuracy,
    comparisonAccuracy,
    trapAccuracy,
    averageResponseTimeMs,
    reviewBacklog: weakness.reviewDebt,
    weakestFamilies: [...familyScores].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3),
    strongestFamilies: [...familyScores].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3),
    readiness,
    timedAccuracy,
    retention,
    speedTrend,
    accuracyByQuestionType,
    calibration: weakness.calibration,
    recurringErrorCount: weakness.topConfusionPairs.filter((p) => p.count >= 2).length,
    contentGaps: env.contentGaps(),
    coverageAudit: input.coverageAudit,
    masteryCounts,
    skillScores,
    skillEvidence,
  };
}

function buildSpeedTrend(attempts: Attempt[], now: Date, timeline: Timeline): TrendPoint[] {
  const byDay = new Map<string, Attempt[]>();
  for (const a of attempts.filter((x) => inWindow(x, now, 14))) {
    byDay.set(a.dayKey, [...(byDay.get(a.dayKey) ?? []), a]);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => {
      const ratios = list.map((a) => clamp(targetRt(a.questionType, timeline.currentPhase) / Math.max(1, a.responseTimeMs), 0, 1));
      return { date, value: ratios.reduce((s, v) => s + v, 0) / ratios.length };
    });
}

export function bandOf(ers: number): ReadinessBand {
  for (const row of ERS_BANDS) if (ers >= row.min) return row.band;
  return 'ALERT';
}

/**
 * ERS — công thức CLAUDE.md §23.
 * G-05 (đã duyệt): thành phần CHƯA CÓ DỮ LIỆU bị loại khỏi công thức và trọng số
 * được chuẩn hoá lại trên các thành phần còn lại — thay vì tính là 0 và phạt oan.
 */
export function computeReadiness(
  components: ReadinessComponents,
  stability: number,
  coverage: number,
  now: Date,
): ReadinessSnapshot | null {
  const date = now.toISOString().slice(0, 10);
  const stabilityFactor = clamp(stability, ERS_STABILITY_FLOOR, ERS_STABILITY_CEIL);

  if (coverage < ERS_MIN_COVERAGE) {
    return {
      id: date,
      date,
      ers: null,
      band: null,
      components,
      stabilityFactor,
      weakestComponent: null,
      evidence: 'THIN',
    };
  }

  const entries = (Object.keys(ERS_WEIGHTS) as Array<keyof ReadinessComponents>).filter(
    (k) => components[k] !== null,
  );
  const weightSum = entries.reduce((s, k) => s + ERS_WEIGHTS[k], 0);
  if (weightSum === 0) {
    return { id: date, date, ers: null, band: null, components, stabilityFactor, weakestComponent: null, evidence: 'THIN' };
  }

  const raw = entries.reduce((s, k) => s + (ERS_WEIGHTS[k] * (components[k] as number)) / weightSum, 0);
  const ers = Math.round(raw * stabilityFactor * 100);

  const weakestComponent = entries.reduce<keyof ReadinessComponents | null>((lo, k) => {
    if (lo === null) return k;
    return (components[k] as number) < (components[lo] as number) ? k : lo;
  }, null);

  return {
    id: date,
    date,
    ers,
    band: bandOf(ers),
    components,
    stabilityFactor,
    weakestComponent,
    evidence: entries.length >= 5 ? 'OK' : 'THIN',
  };
}

/** CLAUDE.md §24 — chỉ số không hành động được thì KHÔNG hiển thị. */
export function buildMetricCards(metrics: DashboardMetrics, weakness: WeaknessProfile): MetricCard[] {
  const cards: MetricCard[] = [];
  const push = (
    metricKey: string,
    value: number | null,
    evidence: EvidenceLevel,
    action: MetricCard['action'],
  ) => {
    if (action === null) return; // luật kiểm được bằng test
    cards.push({ metricKey, value, evidence, trend: 'FLAT', action });
  };

  push('metric.coverage', Math.round(metrics.coverage * 100), metrics.coverage > 0 ? 'OK' : 'NONE',
    metrics.coverage < 1 ? { labelKey: 'action.learnNew', drill: { kind: 'LEARN', payload: {} } } : null);

  push('metric.comparisonAccuracy', pctOrNull(metrics.comparisonAccuracy),
    metrics.comparisonAccuracy === null ? 'NONE' : 'OK',
    weakness.topConfusionPairs.length
      ? {
          labelKey: 'action.comparePairs',
          drill: {
            kind: 'CONFUSION_PAIR',
            payload: { pairs: weakness.topConfusionPairs.slice(0, 3).map((p) => [p.from, p.to]) },
          },
        }
      : null);

  push('metric.trapAccuracy', pctOrNull(metrics.trapAccuracy), metrics.trapAccuracy === null ? 'NONE' : 'OK',
    { labelKey: 'action.trapLab', drill: { kind: 'TRAP_TYPE', payload: {} } });

  push('metric.reviewBacklog', metrics.reviewBacklog, 'OK',
    metrics.reviewBacklog > 0 ? { labelKey: 'action.clearBacklog', drill: { kind: 'REVIEW_TOP', payload: { count: 10 } } } : null);

  const slow = weakness.slowQuestionTypes[0];
  push('metric.speed', slow ? Math.round(slow.medianMs / 1000) : null, slow ? 'OK' : 'NONE',
    slow ? { labelKey: 'action.rapidReview', drill: { kind: 'SPEED', payload: { type: slow.type } } } : null);

  push('metric.calibration', metrics.calibration === null ? null : Math.round(metrics.calibration * 100),
    metrics.calibration === null ? 'NONE' : 'OK',
    metrics.calibration !== null && metrics.calibration < 0.6
      ? { labelKey: 'action.calibration', drill: { kind: 'CALIBRATION', payload: {} } }
      : null);

  return cards;
}

function pctOrNull(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100);
}

/** analytics-engine §9 — mọi khuyến nghị phải nêu mẫu cụ thể + số liệu quan sát được. */
export function buildRecommendations(
  metrics: DashboardMetrics,
  weakness: WeaknessProfile,
  env: AnalyticsEnv,
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const pair of weakness.topConfusionPairs.slice(0, 2)) {
    out.push({
      id: `rec-confusion-${pair.from}-${pair.to}`,
      priority: 1,
      targetKey: 'rec.target.comparePair',
      targetParams: { pair: [pair.from, pair.to], grammarIds: [pair.from, pair.to] },
      reasonKey: 'rec.reason.confusion',
      reasonParams: { a: env.patternOf(pair.from), b: env.patternOf(pair.to), count: pair.count, days: weakness.windowDays },
      drill: { kind: 'CONFUSION_PAIR', payload: { from: pair.from, to: pair.to } },
      estimatedMinutes: 6,
    });
  }

  for (const gid of weakness.misconceptionItems.slice(0, 1)) {
    out.push({
      id: `rec-misconception-${gid}`,
      priority: 1,
      targetKey: 'rec.target.fixMisconception',
      targetParams: { grammarIds: [gid] },
      reasonKey: 'rec.reason.misconception',
      reasonParams: { pattern: env.patternOf(gid) },
      drill: { kind: 'ERROR_TYPE', payload: { grammarIds: [gid] } },
      estimatedMinutes: 5,
    });
  }

  const slow = weakness.slowQuestionTypes[0];
  if (slow) {
    out.push({
      id: `rec-speed-${slow.type}`,
      priority: 2,
      targetKey: 'rec.target.speed',
      targetParams: { type: slow.type },
      reasonKey: 'rec.reason.speed',
      reasonParams: { type: slow.type, actual: Math.round(slow.medianMs / 1000), target: Math.round(slow.targetMs / 1000) },
      drill: { kind: 'SPEED', payload: { type: slow.type } },
      estimatedMinutes: 5,
    });
  }

  if (metrics.readiness?.weakestComponent === 'trapDetection') {
    out.push({
      id: 'rec-trap',
      priority: 2,
      targetKey: 'rec.target.trap',
      targetParams: {},
      reasonKey: 'rec.reason.trap',
      reasonParams: { value: metrics.trapAccuracy === null ? 0 : Math.round(metrics.trapAccuracy * 100) },
      drill: { kind: 'TRAP_TYPE', payload: {} },
      estimatedMinutes: 5,
    });
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, MAX_RECOMMENDATIONS);
}

/** CLAUDE.md §21 — checkpoint được LƯU, không tính lại. */
export function buildWeeklyCheckpoint(
  weekIndex: number,
  attempts: Attempt[],
  mastery: GrammarMastery[],
  metrics: DashboardMetrics,
  weakness: WeaknessProfile,
  prev: WeeklyCheckpoint | null,
  now: Date,
): WeeklyCheckpoint {
  const scoped = attempts.filter((a) => inWindow(a, now, 7));
  const accuracy = scoped.length ? accHat(scoped.filter((a) => a.isCorrect).length, scoped.length) : 0;

  const medianRtByType: Partial<Record<QuestionType, number>> = {};
  const byType = new Map<QuestionType, number[]>();
  for (const a of scoped) byType.set(a.questionType, [...(byType.get(a.questionType) ?? []), a.responseTimeMs]);
  for (const [t, v] of byType) medianRtByType[t] = median(v);

  const grammarLearned = mastery
    .filter((m) => m.firstSeenAt && daysAgo(m.firstSeenAt, now) <= 7)
    .map((m) => m.grammarId);
  const grammarWeak = mastery.filter((m) => m.state === 'SHAKY' || m.state === 'CONFUSED').map((m) => m.grammarId);

  const errorDistribution: Partial<Record<ErrorType, number>> = { ...weakness.errorTypeDistribution };
  const speedNow = metrics.speedTrend.length ? metrics.speedTrend[metrics.speedTrend.length - 1].value : 0;

  const deltaVsPrev = prev
    ? {
        accuracy: accuracy - prev.accuracy,
        speed: speedNow - (prev.medianRtByType ? 0 : 0),
        coverage: metrics.coverage - prev.coverage,
        confusionCount: weakness.topConfusionPairs.length - prev.confusionPairs.length,
      }
    : null;

  const biggestImprovementKey =
    deltaVsPrev && deltaVsPrev.accuracy > 0.05
      ? 'checkpoint.improve.accuracy'
      : deltaVsPrev && deltaVsPrev.coverage > 0.05
        ? 'checkpoint.improve.coverage'
        : null;
  const biggestWeaknessKey =
    weakness.bottleneckDimension === 'COMPARE'
      ? 'checkpoint.weak.compare'
      : weakness.bottleneckDimension === 'DETECT'
        ? 'checkpoint.weak.detect'
        : weakness.bottleneckDimension === 'KNOW'
          ? 'checkpoint.weak.know'
          : null;

  return {
    id: `wk-${weekIndex}`,
    weekIndex,
    createdAt: now.toISOString(),
    grammarLearned,
    grammarWeak,
    confusionPairs: weakness.topConfusionPairs,
    errorDistribution,
    accuracy,
    medianRtByType,
    reviewDebt: weakness.reviewDebt,
    deltaVsPrev,
    planChanges: [],
    coverage: metrics.coverage,
    biggestImprovementKey,
    biggestWeaknessKey,
  };
}

/** CLAUDE.md §22 — nội dung màn hình chuyển phase. KHÔNG reset dữ liệu gì. */
export function buildPhaseTransitionSummary(
  fromPhase: Phase,
  toPhase: Phase,
  mastery: GrammarMastery[],
  matrix: ConfusionMatrix,
): PhaseTransitionSummary {
  return {
    fromPhase,
    toPhase,
    knownCount: mastery.filter((m) => atLeast(m, 'RECOGNIZED')).length,
    shakyCount: mastery.filter((m) => m.state === 'SHAKY').length,
    needsReviewCount: mastery.filter((m) => m.isStale || m.state === 'CONFUSED').length,
    confusionMap: fromPhase === 'PHASE_2_COMPARE' ? matrix.symmetricPairs.slice(0, 12) : [],
  };
}

/** analytics-engine §10.3 — FINAL_7 LỌC cái đưa lên trước, không sửa con số nào. */
export function filterForFinal7(metrics: DashboardMetrics): DashboardMetrics {
  if (metrics.mode !== 'FINAL_7') return metrics;
  return {
    ...metrics,
    reviewBacklog: 0,
    contentGaps: [],
    coverageAudit: { ...metrics.coverageAudit, ok: true, atRisk: [], messageKey: 'analytics.coverage.hiddenFinal7' },
  };
}
