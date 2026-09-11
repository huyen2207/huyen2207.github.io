import type { Attempt } from '@/domain/attempt';
import type { GrammarMastery } from '@/domain/mastery';
import type { Timeline } from '@/domain/learner';
import type {
  ConfusionMatrix,
  ConfusionPair,
  ErrorRecord,
  FamilyScore,
  NotebookLineVi,
  SlowType,
  WeaknessProfile,
} from '@/domain/analytics';
import type { GrammarRelation } from '@/domain/grammar';
import type {
  ErrorType,
  EvidenceLevel,
  GrammarFamily,
  QuestionType,
  SkillDimension,
  TrapType,
} from '@/domain/enums';
import {
  CONFUSION_PAIR_MIN,
  ERROR_HALF_LIFE_DAYS,
  ERROR_WINDOW_DAYS,
  LEARNED_EDGE_MIN,
  NOTEBOOK_ERROR_TYPE_MIN_N,
  NOTEBOOK_ERROR_TYPE_MIN_RATIO,
  NOTEBOOK_MAX_LINES,
  NOTEBOOK_NUANCE_MIN,
  RESOLVE_STREAK,
  RETENTION_GAP_DAYS,
  SLOW_TYPE_RATIO_THRESHOLD,
} from '@/config/learning.config';
import { targetRt } from '@/config/timing.config';
import { accHat, clamp, median } from '@/shared/math';
import { daysAgo, daysBetweenKeys } from '@/shared/date';
import { evidenceLevelOf, windowDays } from '@/engines/mastery/metrics';

export interface ErrorEnv {
  familiesOf: (grammarId: string) => GrammarFamily[];
  patternOf: (grammarId: string) => string;
  trapTypeOf: (questionId: string) => TrapType | undefined;
  skillOf: (questionId: string) => SkillDimension | undefined;
}

function weight(a: Attempt, now: Date): number {
  return Math.pow(0.5, daysAgo(a.timestamp, now) / ERROR_HALF_LIFE_DAYS);
}

export function groupKeyOf(a: Attempt): string {
  return a.errorType === 'SIMILAR_GRAMMAR_CONFUSION' && a.confusedWith
    ? `conf:${a.grammarId}→${a.confusedWith}`
    : `type:${a.grammarId}:${a.errorType ?? 'UNCLASSIFIED'}`;
}

/** analytics-engine §3 — ErrorRecord là CHỈ MỤC DẪN XUẤT, tính lại từ attempts. */
export function buildErrorRecords(attempts: Attempt[], pinnedIds: string[] = []): ErrorRecord[] {
  const sorted = [...attempts].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const groups = new Map<string, Attempt[]>();
  for (const a of sorted.filter((x) => !x.isCorrect)) {
    const key = groupKeyOf(a);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  const records: ErrorRecord[] = [];
  for (const [groupKey, list] of groups) {
    const last = list[list.length - 1];
    const grammarId = last.grammarId;
    const after = sorted.filter(
      (a) => a.grammarId === grammarId && a.timestamp > last.timestamp,
    );
    const correctAfter = after.filter((a) => a.isCorrect);
    const survivedGap = correctAfter.some(
      (a) => daysBetweenKeys(last.dayKey, a.dayKey) >= RETENTION_GAP_DAYS,
    );
    const pairFixed =
      !last.confusedWith ||
      correctAfter.some((a) => a.questionType === 'MINIMAL_PAIR' || a.questionType === 'WHY_NOT_OTHER');
    const resolved = correctAfter.length >= RESOLVE_STREAK && survivedGap && pairFixed;

    // Tái phát: đã từng đủ điều kiện resolved rồi lại sai.
    const relapsed =
      list.length > 1 &&
      list.slice(0, -1).some((prev) => {
        const between = sorted.filter(
          (a) => a.grammarId === grammarId && a.timestamp > prev.timestamp && a.timestamp < last.timestamp,
        );
        return between.filter((a) => a.isCorrect).length >= RESOLVE_STREAK;
      });

    records.push({
      errorId: list[0].attemptId,
      groupKey,
      attemptIds: list.map((a) => a.attemptId),
      questionIds: [...new Set(list.map((a) => a.questionId))],
      grammarIds: [...new Set(list.map((a) => a.grammarId))],
      selectedChoice: last.selectedAnswer,
      correctChoice: last.correctAnswer,
      errorType: (last.errorType ?? 'MEANING_ERROR') as ErrorType,
      confusedWithGrammarId: last.confusedWith ?? null,
      confidence: last.confidence,
      responseTimeMs: median(list.map((a) => a.responseTimeMs)),
      firstOccurredAt: list[0].timestamp,
      lastOccurredAt: last.timestamp,
      recurrenceCount: list.length,
      resolved,
      relapsed,
      pinned: pinnedIds.includes(groupKey),
    });
  }
  return records.sort((a, b) => b.recurrenceCount - a.recurrenceCount);
}

/** analytics-engine §5 — ma trận CÓ HƯỚNG: (A→B) khác (B→A). */
export function buildConfusionMatrix(attempts: Attempt[], now: Date): ConfusionMatrix {
  const cells = new Map<string, ConfusionPair>();
  for (const a of attempts) {
    if (a.isCorrect || !a.confusedWith) continue;
    const key = `${a.grammarId}|${a.confusedWith}`;
    const prev = cells.get(key);
    cells.set(key, {
      from: a.grammarId,
      to: a.confusedWith,
      count: (prev?.count ?? 0) + 1,
      weighted: (prev?.weighted ?? 0) + weight(a, now),
      lastAt: prev && prev.lastAt > a.timestamp ? prev.lastAt : a.timestamp,
    });
  }

  const list = [...cells.values()].sort((a, b) => b.weighted - a.weighted);
  const byGrammar: Record<string, { outgoing: ConfusionPair[]; incoming: ConfusionPair[] }> = {};
  for (const p of list) {
    byGrammar[p.from] = byGrammar[p.from] ?? { outgoing: [], incoming: [] };
    byGrammar[p.to] = byGrammar[p.to] ?? { outgoing: [], incoming: [] };
    byGrammar[p.from].outgoing.push(p);
    byGrammar[p.to].incoming.push(p);
  }

  const sym = new Map<string, number>();
  for (const p of list) {
    const key = [p.from, p.to].sort().join('|');
    sym.set(key, (sym.get(key) ?? 0) + p.count);
  }

  return {
    cells: list,
    byGrammar,
    symmetricPairs: [...sym.entries()]
      .map(([k, total]) => {
        const [a, b] = k.split('|');
        return { a, b, total };
      })
      .sort((x, y) => y.total - x.total),
    computedAt: now.toISOString(),
  };
}

/** analytics-engine §5.2 — cạnh LEARNED chỉ sống ở storage, KHÔNG bao giờ ghi vào content. */
export function deriveLearnedRelations(attempts: Attempt[], now: Date): GrammarRelation[] {
  const matrix = buildConfusionMatrix(attempts, now);
  return matrix.cells
    .filter((c) => c.count >= LEARNED_EDGE_MIN)
    .map((c) => ({
      from: c.from,
      to: c.to,
      type: 'oftenConfusedWith' as const,
      source: 'LEARNED' as const,
      strength: c.weighted,
    }));
}

export function buildWeaknessProfile(
  attempts: Attempt[],
  mastery: GrammarMastery[],
  timeline: Timeline,
  now: Date,
  env: ErrorEnv,
): WeaknessProfile {
  const win = windowDays(ERROR_WINDOW_DAYS, timeline.daysRemaining);
  const scoped = attempts.filter((a) => daysAgo(a.timestamp, now) <= win);
  const wrong = scoped.filter((a) => !a.isCorrect);

  /* 3. errorTypeDistribution */
  const errorTypeDistribution: Partial<Record<ErrorType, number>> = {};
  const wrongWeight = wrong.reduce((s, a) => s + weight(a, now), 0);
  if (wrongWeight > 0) {
    for (const a of wrong) {
      const t = a.errorType;
      if (!t) continue;
      errorTypeDistribution[t] = (errorTypeDistribution[t] ?? 0) + weight(a, now) / wrongWeight;
    }
  }

  /* 4. topConfusionPairs */
  const matrix = buildConfusionMatrix(scoped, now);
  const topConfusionPairs = matrix.cells.filter((c) => c.count >= CONFUSION_PAIR_MIN).slice(0, 10);

  /* 5. weakFamilies */
  const byFamily = new Map<GrammarFamily, Attempt[]>();
  for (const a of scoped) {
    for (const f of env.familiesOf(a.grammarId)) {
      byFamily.set(f, [...(byFamily.get(f) ?? []), a]);
    }
  }
  const familyScores: FamilyScore[] = [];
  for (const [family, list] of byFamily) {
    const days = new Set(list.map((a) => a.dayKey)).size;
    const evidence: EvidenceLevel = evidenceLevelOf(list.length, days, false);
    familyScores.push({
      family,
      accuracy: accHat(list.filter((a) => a.isCorrect).length, list.length),
      n: list.length,
      evidence,
    });
  }
  const measured = familyScores.filter((f) => f.evidence === 'OK' || f.evidence === 'SOLID');
  const weakFamilies = [...measured].sort((a, b) => a.accuracy - b.accuracy);

  /* 6. slowQuestionTypes */
  const byType = new Map<QuestionType, number[]>();
  for (const a of scoped) {
    byType.set(a.questionType, [...(byType.get(a.questionType) ?? []), a.responseTimeMs]);
  }
  const slowQuestionTypes: SlowType[] = [];
  for (const [type, values] of byType) {
    const med = median(values);
    const target = targetRt(type, timeline.currentPhase);
    const ratio = target === 0 ? 0 : med / target;
    if (ratio > SLOW_TYPE_RATIO_THRESHOLD) {
      slowQuestionTypes.push({ type, medianMs: med, targetMs: target, ratio });
    }
  }
  slowQuestionTypes.sort((a, b) => b.ratio - a.ratio);

  /* 7. guessRate — loại attempt có confidence được gán mặc định trong MOCK (G-06) */
  const confidenceScoped = scoped.filter((a) => !a.confidenceImputed);
  const totalWeight = confidenceScoped.reduce((s, a) => s + weight(a, now), 0);
  const guessRate =
    totalWeight === 0
      ? 0
      : confidenceScoped.filter((a) => a.confidence === 'GUESS').reduce((s, a) => s + weight(a, now), 0) / totalWeight;

  /* 8. accuracyByPhaseSkill */
  const bySkill: Record<SkillDimension, Attempt[]> = { KNOW: [], COMPARE: [], DETECT: [] };
  for (const a of scoped) {
    const skill = env.skillOf(a.questionId);
    if (skill) bySkill[skill].push(a);
  }
  const accuracyByPhaseSkill: Record<SkillDimension, number | null> = {
    KNOW: bySkill.KNOW.length ? accHat(bySkill.KNOW.filter((a) => a.isCorrect).length, bySkill.KNOW.length) : null,
    COMPARE: bySkill.COMPARE.length ? accHat(bySkill.COMPARE.filter((a) => a.isCorrect).length, bySkill.COMPARE.length) : null,
    DETECT: bySkill.DETECT.length ? accHat(bySkill.DETECT.filter((a) => a.isCorrect).length, bySkill.DETECT.length) : null,
  };

  /* 9. reviewDebt — đọc từ mastery, không từ attempts */
  const nowIso = now.toISOString();
  const reviewDebt = mastery.filter((m) => m.nextReviewAt && m.nextReviewAt < nowIso).length;

  /* 10–11 */
  const misconceptionItems = [
    ...new Set(wrong.filter((a) => a.confidence === 'CONFIDENT' && !a.confidenceImputed).map((a) => a.grammarId)),
  ];
  const records = buildErrorRecords(attempts);
  const relapseItems = [...new Set(records.filter((r) => r.relapsed).flatMap((r) => r.grammarIds))];

  const trapDistribution: Partial<Record<TrapType, number>> = {};
  const trapWrong = wrong.filter((a) => env.trapTypeOf(a.questionId));
  for (const a of trapWrong) {
    const t = env.trapTypeOf(a.questionId)!;
    trapDistribution[t] = (trapDistribution[t] ?? 0) + 1 / trapWrong.length;
  }

  const errorCountByGrammar = new Map<string, number>();
  for (const a of wrong) {
    errorCountByGrammar.set(a.grammarId, (errorCountByGrammar.get(a.grammarId) ?? 0) + weight(a, now));
  }
  const errorGrammarIds = [...errorCountByGrammar.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const eligible = (['KNOW', 'COMPARE', 'DETECT'] as SkillDimension[]).filter(
    (d) => bySkill[d].length >= 4 && accuracyByPhaseSkill[d] !== null,
  );
  const bottleneckDimension =
    eligible.length === 0
      ? null
      : eligible.reduce((lo, d) => ((accuracyByPhaseSkill[d] ?? 1) < (accuracyByPhaseSkill[lo] ?? 1) ? d : lo), eligible[0]);

  const lastAttempt = attempts[attempts.length - 1];

  return {
    errorTypeDistribution,
    topConfusionPairs,
    weakFamilies,
    slowQuestionTypes,
    guessRate,
    accuracyByPhaseSkill,
    reviewDebt,
    misconceptionItems,
    relapseItems,
    trapDistribution,
    calibration: null,
    bottleneckDimension,
    errorGrammarIds,
    windowDays: win,
    computedAt: now.toISOString(),
    totalAttempts: scoped.length,
    daysSinceLastSession: lastAttempt ? daysAgo(lastAttempt.timestamp, now) : 0,
  };
}

/** Profile rỗng HỢP LỆ — ngày 1 chưa có attempt nào (analytics-engine §11). */
export function emptyWeaknessProfile(now: Date): WeaknessProfile {
  return {
    errorTypeDistribution: {},
    topConfusionPairs: [],
    weakFamilies: [],
    slowQuestionTypes: [],
    guessRate: 0,
    accuracyByPhaseSkill: { KNOW: null, COMPARE: null, DETECT: null },
    reviewDebt: 0,
    misconceptionItems: [],
    relapseItems: [],
    trapDistribution: {},
    calibration: null,
    bottleneckDimension: null,
    errorGrammarIds: [],
    windowDays: ERROR_WINDOW_DAYS,
    computedAt: now.toISOString(),
    totalAttempts: 0,
    daysSinceLastSession: 0,
  };
}

/** analytics-engine §6 — ミスノート: câu tiếng Việt đọc được, KHÔNG phải log thô. */
export function summarizeForNotebook(
  profile: WeaknessProfile,
  matrix: ConfusionMatrix,
  records: ErrorRecord[],
  env: ErrorEnv,
  now: Date,
): NotebookLineVi[] {
  const lines: NotebookLineVi[] = [];

  for (const gid of profile.misconceptionItems) {
    const count = records
      .filter((r) => r.grammarIds.includes(gid) && r.confidence === 'CONFIDENT')
      .reduce((s, r) => s + r.recurrenceCount, 0);
    lines.push({
      id: `misconception:${gid}`,
      kind: 'MISCONCEPTION',
      severity: 3,
      messageKey: 'notebook.misconception',
      params: { pattern: env.patternOf(gid), count: Math.max(1, count) },
      drill: { kind: 'ERROR_TYPE', payload: { grammarIds: [gid] } },
      pinned: false,
      weighted: 100 + count,
    });
  }

  for (const pair of matrix.cells.filter((c) => c.count >= CONFUSION_PAIR_MIN).slice(0, 3)) {
    lines.push({
      id: `confusion:${pair.from}:${pair.to}`,
      kind: 'CONFUSION',
      severity: 2,
      messageKey: 'notebook.confusion',
      params: {
        a: env.patternOf(pair.from),
        b: env.patternOf(pair.to),
        count: pair.count,
        days: profile.windowDays,
      },
      drill: { kind: 'CONFUSION_PAIR', payload: { from: pair.from, to: pair.to } },
      pinned: false,
      weighted: 50 + pair.weighted,
    });
  }

  const totalWrong = records.reduce((s, r) => s + r.recurrenceCount, 0);
  for (const [type, ratio] of Object.entries(profile.errorTypeDistribution) as Array<[ErrorType, number]>) {
    if (ratio < NOTEBOOK_ERROR_TYPE_MIN_RATIO) continue;
    if (totalWrong < NOTEBOOK_ERROR_TYPE_MIN_N) continue; // tránh kết luận vội (evidence THIN)
    if (type === 'NUANCE_ERROR') continue;
    lines.push({
      id: `errorType:${type}`,
      kind: 'ERROR_TYPE',
      severity: 2,
      messageKey: 'notebook.errorType',
      params: { type, percent: Math.round(ratio * 100) },
      drill: { kind: 'ERROR_TYPE', payload: { errorType: type } },
      pinned: false,
      weighted: 40 + ratio * 10,
    });
  }

  const nuanceCount = records
    .filter((r) => r.errorType === 'NUANCE_ERROR')
    .reduce((s, r) => s + r.recurrenceCount, 0);
  if (nuanceCount >= NOTEBOOK_NUANCE_MIN) {
    lines.push({
      id: 'nuance',
      kind: 'NUANCE',
      severity: 2,
      messageKey: 'notebook.nuance',
      params: { count: nuanceCount },
      drill: { kind: 'ERROR_TYPE', payload: { errorType: 'NUANCE_ERROR' } },
      pinned: false,
      weighted: 35 + nuanceCount,
    });
  }

  for (const slow of profile.slowQuestionTypes.slice(0, 2)) {
    lines.push({
      id: `speed:${slow.type}`,
      kind: 'SPEED',
      severity: 1,
      messageKey: 'notebook.speed',
      params: {
        type: slow.type,
        actual: Math.round(slow.medianMs / 1000),
        target: Math.round(slow.targetMs / 1000),
      },
      drill: { kind: 'SPEED', payload: { type: slow.type } },
      pinned: false,
      weighted: 20 + slow.ratio,
    });
  }

  for (const gid of profile.relapseItems.slice(0, 2)) {
    lines.push({
      id: `relapse:${gid}`,
      kind: 'RELAPSE',
      severity: 3,
      messageKey: 'notebook.relapse',
      params: { pattern: env.patternOf(gid) },
      drill: { kind: 'ERROR_TYPE', payload: { grammarIds: [gid] } },
      pinned: false,
      weighted: 90,
    });
  }

  const resolvedRecently = records.filter(
    (r) => r.resolved && daysAgo(r.lastOccurredAt, now) <= 7,
  ).length;
  if (resolvedRecently > 0) {
    lines.push({
      id: 'resolved',
      kind: 'RESOLVED',
      severity: 1,
      messageKey: 'notebook.resolved',
      params: { count: resolvedRecently },
      drill: null,
      pinned: false,
      weighted: 1,
    });
  }

  const pinnedFirst = lines.filter((l) => l.pinned);
  const rest = lines
    .filter((l) => !l.pinned)
    .sort((a, b) => (b.severity === a.severity ? b.weighted - a.weighted : b.severity - a.severity));

  return [...pinnedFirst, ...rest].slice(0, NOTEBOOK_MAX_LINES);
}

export function confusionRateOf(profile: WeaknessProfile): number {
  const total = Object.values(profile.errorTypeDistribution).reduce((s, v) => s + (v ?? 0), 0);
  if (total === 0) return 0;
  return clamp(profile.errorTypeDistribution.SIMILAR_GRAMMAR_CONFUSION ?? 0, 0, 1);
}
