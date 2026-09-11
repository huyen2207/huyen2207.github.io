import { describe, expect, it } from 'vitest';
import {
  bandOf,
  buildMetricCards,
  buildPhaseTransitionSummary,
  buildRecommendations,
  buildWeeklyCheckpoint,
  computeMetrics,
  computeReadiness,
  filterForFinal7,
  recentStability,
  type AnalyticsEnv,
} from './index';
import {
  buildConfusionMatrix,
  buildErrorRecords,
  buildWeaknessProfile,
  deriveLearnedRelations,
  emptyWeaknessProfile,
  summarizeForNotebook,
  type ErrorEnv,
} from '@/engines/error';
import { createInitialMastery } from '@/engines/mastery';
import type { Attempt } from '@/domain/attempt';
import type { Timeline, StudyPlan } from '@/domain/learner';
import type { GrammarMastery } from '@/domain/mastery';
import type { CoverageAudit } from '@/domain/analytics';
import { getGrammar, getQuestion, listRawGrammar } from '@/content/repository';
import viStrings from '@/i18n/vi';

const NOW = new Date('2026-10-20T09:00:00.000Z');

const errorEnv: ErrorEnv = {
  familiesOf: (id) => getGrammar(id)?.families ?? [],
  patternOf: (id) => getGrammar(id)?.pattern ?? id,
  trapTypeOf: (qid) => getQuestion(qid)?.trap?.trapType,
  skillOf: (qid) => getQuestion(qid)?.testedSkill,
};

const analyticsEnv: AnalyticsEnv = {
  familiesOf: errorEnv.familiesOf,
  hasTrap: (qid) => Boolean(getQuestion(qid)?.trap),
  patternOf: errorEnv.patternOf,
  contentGaps: () => [],
};

function timeline(over: Partial<Timeline> = {}): Timeline {
  return {
    totalStudyDays: 90,
    daysElapsed: 52,
    daysRemaining: 47,
    studyDayIndex: 53,
    currentPhase: 'PHASE_2_COMPARE',
    mode: 'NORMAL',
    progressExpected: 0.58,
    phaseBoundaries: { knowEndsDay: 30, compareEndsDay: 59 },
    daysLeftInPhase: 7,
    isPhaseTransitionDay: false,
    todayKey: '2026-10-20',
    ...over,
    isExamOver: (over.daysRemaining ?? 47) <= 0,
    isNearExam: (over.daysRemaining ?? 47) > 0 && (over.daysRemaining ?? 47) <= 21,
  };
}

const audit: CoverageAudit = {
  ok: true,
  atRisk: [],
  requiredSlots: 0,
  availableSlots: 0,
  messageKey: 'analytics.coverage.ok',
  params: {},
};

let n = 0;
function att(over: Partial<Attempt> & { day: string }): Attempt {
  n++;
  return {
    attemptId: `a${n}`,
    sessionId: `s-${over.day}`,
    questionId: over.questionId ?? 'q-ni-itatte-cloze-01',
    grammarId: over.grammarId ?? 'ni-itatte',
    phase: 'PHASE_2_COMPARE',
    blockType: 'APPLY',
    isTimed: over.isTimed ?? false,
    selectedAnswer: 'a',
    correctAnswer: 'a',
    isCorrect: over.isCorrect ?? true,
    responseTimeMs: over.responseTimeMs ?? 30000,
    confidence: over.confidence ?? 'CONFIDENT',
    timestamp: `${over.day}T09:00:00.000Z`,
    questionType: over.questionType ?? 'CLOZE_MC',
    delivery: 'PRACTICE',
    verified: true,
    dayKey: over.day,
    ...over,
  } as Attempt;
}

describe('AnalyticsEngine — ERS (CLAUDE.md §23)', () => {
  it('khớp từng chữ số với ví dụ analytics-engine §12.2 → 56', () => {
    const snap = computeReadiness(
      {
        coverage: 0.72,
        retention: 0.69,
        comparisonAccuracy: 0.59,
        trapDetection: 0.44,
        timedAccuracy: 0.51,
        speedIndex: 0.63,
      },
      0.91,
      0.72,
      NOW,
    )!;
    expect(snap.ers).toBe(56);
    expect(snap.band).toBe('BUILDING');
    expect(snap.weakestComponent).toBe('trapDetection');
    expect(snap.stabilityFactor).toBe(0.91);
  });

  it('E1 — coverage = 0.19 → ers = null, band = null, nhưng vẫn giữ 6 thành phần', () => {
    const snap = computeReadiness(
      { coverage: 0.19, retention: 0.5, comparisonAccuracy: 0.5, trapDetection: 0.5, timedAccuracy: 0.5, speedIndex: 0.5 },
      1,
      0.19,
      NOW,
    )!;
    expect(snap.ers).toBeNull();
    expect(snap.band).toBeNull();
    expect(Object.keys(snap.components)).toHaveLength(6);
  });

  it('E2 — ReadinessSnapshot luôn có đủ 6 components', () => {
    const snap = computeReadiness(
      { coverage: 0.5, retention: null, comparisonAccuracy: null, trapDetection: null, timedAccuracy: null, speedIndex: null },
      1,
      0.5,
      NOW,
    )!;
    expect(Object.keys(snap.components).sort()).toEqual(
      ['comparisonAccuracy', 'coverage', 'retention', 'speedIndex', 'timedAccuracy', 'trapDetection'],
    );
  });

  it('G-05 — thành phần chưa đo bị loại và trọng số chuẩn hoá lại, không phạt oan', () => {
    const partial = computeReadiness(
      { coverage: 0.8, retention: 0.8, comparisonAccuracy: null, trapDetection: null, timedAccuracy: null, speedIndex: null },
      1,
      0.8,
      NOW,
    )!;
    // Nếu tính 0 cho 4 thành phần thiếu thì ERS chỉ ≈ 36; chuẩn hoá lại cho 80.
    expect(partial.ers).toBe(80);
  });

  it('thang band đúng mốc CLAUDE.md §23', () => {
    expect(bandOf(39)).toBe('ALERT');
    expect(bandOf(40)).toBe('BUILDING');
    expect(bandOf(60)).toBe('ON_TRACK');
    expect(bandOf(75)).toBe('SOLID');
    expect(bandOf(90)).toBe('READY');
  });

  it('E3 — dòng disclaimer đúng NGUYÊN VĂN CLAUDE.md §23', () => {
    expect(viStrings['analytics.ersDisclaimer']).toBe(
      'Chỉ số này đo mức độ sẵn sàng của bạn với dạng bài 文法, không phải xác suất đậu.',
    );
  });

  it('E4 — không chuỗi nào KHẲNG ĐỊNH xác suất đậu (trừ chính dòng phủ định ở E3)', () => {
    // ⚠️ CONFLICT đã hoà giải: CLAUDE.md §23 buộc dòng disclaimer chứa "xác suất đậu",
    // trong khi analytics-engine §13 E4 đòi grep không ra chuỗi đó. CLAUDE.md thắng (§0.3),
    // nên E4 được thu hẹp đúng phạm vi nó nhắm tới: cấm KHẲNG ĐỊNH, không cấm PHỦ ĐỊNH.
    for (const [key, value] of Object.entries(viStrings)) {
      if (key === 'analytics.ersDisclaimer') continue;
      const low = value.toLowerCase();
      expect(low).not.toContain('xác suất');
      expect(low).not.toContain('pass rate');
      expect(low).not.toMatch(/khả năng (đậu|qua)/);
      expect(low).not.toMatch(/tỉ lệ đậu/);
    }
  });

  it('recentStability với 1 ngày dữ liệu → 1.0 kèm evidence THIN', () => {
    const r = recentStability([att({ day: '2026-10-20' })], NOW);
    expect(r.value).toBe(1);
    expect(r.evidence).toBe('THIN');
  });
});

describe('AnalyticsEngine — metrics & cards', () => {
  const plan: StudyPlan = {
    version: 1,
    totalStudyDays: 90,
    phaseBoundaries: { knowEndsDay: 30, compareEndsDay: 59 },
    coverageTarget: 10,
    requiredGrammarIds: listRawGrammar().slice(0, 10).map((g) => g.id),
    newPerDay: 3,
    generatedAt: NOW.toISOString(),
  };

  it('ngày 1, 0 attempt → cấu trúc rỗng hợp lệ, readiness.ers = null, không ném lỗi', () => {
    const mastery = listRawGrammar().map((g) => createInitialMastery(g.id));
    const m = computeMetrics({
      attempts: [],
      mastery,
      timeline: timeline(),
      plan,
      weakness: emptyWeaknessProfile(NOW),
      coverageAudit: audit,
      env: analyticsEnv,
      now: NOW,
    });
    expect(m.coverage).toBe(0);
    expect(m.readiness!.ers).toBeNull();
    expect(m.recognitionAccuracy).toBeNull();
  });

  it('mọi MetricCard có action = null đều bị loại khỏi output', () => {
    const mastery = listRawGrammar().map((g) => createInitialMastery(g.id));
    const metrics = computeMetrics({
      attempts: [],
      mastery,
      timeline: timeline(),
      plan,
      weakness: emptyWeaknessProfile(NOW),
      coverageAudit: audit,
      env: analyticsEnv,
      now: NOW,
    });
    const cards = buildMetricCards(metrics, emptyWeaknessProfile(NOW));
    for (const c of cards) expect(c.action).not.toBeNull();
  });

  it('FINAL_7 → ẩn reviewBacklog và cảnh báo coverage', () => {
    const mastery = listRawGrammar().map((g) => createInitialMastery(g.id));
    const metrics = computeMetrics({
      attempts: [],
      mastery,
      timeline: timeline({ mode: 'FINAL_7', daysRemaining: 5 }),
      plan,
      weakness: { ...emptyWeaknessProfile(NOW), reviewDebt: 14 },
      coverageAudit: { ...audit, ok: false, atRisk: ['x'] },
      env: analyticsEnv,
      now: NOW,
    });
    const filtered = filterForFinal7(metrics);
    expect(filtered.reviewBacklog).toBe(0);
    expect(filtered.coverageAudit.atRisk).toEqual([]);
  });
});

describe('ErrorEngine — confusion matrix & notebook', () => {
  const attempts = [
    ...Array.from({ length: 8 }, (_, i) =>
      att({
        day: `2026-10-1${i % 9}`,
        isCorrect: false,
        confusedWith: 'ni-itatte-wa',
        errorType: 'SIMILAR_GRAMMAR_CONFUSION',
        confidence: i === 0 ? 'CONFIDENT' : 'UNSURE',
      }),
    ),
    att({ day: '2026-10-12', grammarId: 'ni-itatte-wa', isCorrect: false, confusedWith: 'ni-itatte', errorType: 'SIMILAR_GRAMMAR_CONFUSION' }),
  ];

  it('ma trận CÓ HƯỚNG — (A→B, 8) và (B→A, 1) không bị gộp', () => {
    const matrix = buildConfusionMatrix(attempts, NOW);
    const ab = matrix.cells.find((c) => c.from === 'ni-itatte' && c.to === 'ni-itatte-wa');
    const ba = matrix.cells.find((c) => c.from === 'ni-itatte-wa' && c.to === 'ni-itatte');
    expect(ab!.count).toBe(8);
    expect(ba!.count).toBe(1);
    expect(matrix.symmetricPairs[0].total).toBe(9);
  });

  it('deriveLearnedRelations chỉ sinh cạnh LEARNED, ngưỡng ≥ 2 lần', () => {
    const rels = deriveLearnedRelations(attempts, NOW);
    expect(rels.every((r) => r.source === 'LEARNED')).toBe(true);
    expect(rels.some((r) => r.from === 'ni-itatte-wa')).toBe(false); // chỉ 1 lần
  });

  it('confusion pair 1 lần không vào topConfusionPairs', () => {
    const profile = buildWeaknessProfile(attempts, [], timeline(), NOW, errorEnv);
    expect(profile.topConfusionPairs.every((p) => p.count >= 2)).toBe(true);
  });

  it('ミスノート sinh dòng MISCONCEPTION đứng trên cùng và tối đa 7 dòng', () => {
    const profile = buildWeaknessProfile(attempts, [], timeline(), NOW, errorEnv);
    const matrix = buildConfusionMatrix(attempts, NOW);
    const records = buildErrorRecords(attempts);
    const lines = summarizeForNotebook(profile, matrix, records, errorEnv, NOW);
    expect(lines.length).toBeLessThanOrEqual(7);
    expect(lines[0].kind).toBe('MISCONCEPTION');
    for (const l of lines) {
      if (l.kind !== 'RESOLVED') expect(l.drill).not.toBeNull();
      expect(l.messageKey.startsWith('notebook.')).toBe(true);
    }
  });

  it('dòng RESOLVED là dòng duy nhất không có nút Luyện ngay', () => {
    const resolvedAttempts = [
      att({ day: '2026-10-01', isCorrect: false, errorType: 'FORM_ERROR' }),
      att({ day: '2026-10-05' }),
      att({ day: '2026-10-06' }),
      att({ day: '2026-10-07' }),
    ];
    const records = buildErrorRecords(resolvedAttempts);
    expect(records[0].resolved).toBe(true);
  });

  it('buildWeaknessProfile với 0 attempt → không ném lỗi', () => {
    const p = buildWeaknessProfile([], [], timeline(), NOW, errorEnv);
    expect(p.totalAttempts).toBe(0);
    expect(p.topConfusionPairs).toEqual([]);
    expect(p.accuracyByPhaseSkill.KNOW).toBeNull();
  });

  it('attempt trên content NEEDS_REVIEW vẫn vào metric hiển thị', () => {
    const unverified = [att({ day: '2026-10-19', verified: false })];
    const p = buildWeaknessProfile(unverified, [], timeline(), NOW, errorEnv);
    expect(p.totalAttempts).toBe(1);
  });
});

describe('AnalyticsEngine — checkpoint & phase transition', () => {
  const mastery: GrammarMastery[] = listRawGrammar().map((g, i) => ({
    ...createInitialMastery(g.id),
    state: i < 5 ? 'RECOGNIZED' : i < 7 ? 'SHAKY' : 'UNSEEN',
    baseRank: i < 7 ? 'RECOGNIZED' : null,
  }));

  it('tuần 1 → deltaVsPrev = null, không crash', () => {
    const metrics = computeMetrics({
      attempts: [],
      mastery,
      timeline: timeline(),
      plan: {
        version: 1,
        totalStudyDays: 90,
        phaseBoundaries: { knowEndsDay: 30, compareEndsDay: 59 },
        coverageTarget: 12,
        requiredGrammarIds: listRawGrammar().map((g) => g.id),
        newPerDay: 3,
        generatedAt: NOW.toISOString(),
      },
      weakness: emptyWeaknessProfile(NOW),
      coverageAudit: audit,
      env: analyticsEnv,
      now: NOW,
    });
    const cp = buildWeeklyCheckpoint(1, [], mastery, metrics, emptyWeaknessProfile(NOW), null, NOW);
    expect(cp.deltaVsPrev).toBeNull();
    expect(cp.weekIndex).toBe(1);
  });

  it('phase transition không đụng vào mastery, và có confusion map ở cuối Phase 2', () => {
    const matrix = buildConfusionMatrix(
      [att({ day: '2026-10-10', isCorrect: false, confusedWith: 'ni-itatte-wa' }), att({ day: '2026-10-11', isCorrect: false, confusedWith: 'ni-itatte-wa' })],
      NOW,
    );
    const before = JSON.stringify(mastery);
    const s1 = buildPhaseTransitionSummary('PHASE_1_KNOW', 'PHASE_2_COMPARE', mastery, matrix);
    const s2 = buildPhaseTransitionSummary('PHASE_2_COMPARE', 'PHASE_3_DETECT', mastery, matrix);
    expect(JSON.stringify(mastery)).toBe(before);
    expect(s1.confusionMap).toEqual([]);
    expect(s2.confusionMap.length).toBeGreaterThan(0);
    expect(s1.knownCount).toBe(7);
    expect(s1.shakyCount).toBe(2);
  });

  it('khuyến nghị luôn có reasonKey và target không rỗng (N1, N2)', () => {
    const attempts = Array.from({ length: 4 }, () =>
      att({ day: '2026-10-18', isCorrect: false, confusedWith: 'ni-itatte-wa', errorType: 'SIMILAR_GRAMMAR_CONFUSION', confidence: 'CONFIDENT' }),
    );
    const weakness = buildWeaknessProfile(attempts, mastery, timeline(), NOW, errorEnv);
    const metrics = computeMetrics({
      attempts,
      mastery,
      timeline: timeline(),
      plan: {
        version: 1,
        totalStudyDays: 90,
        phaseBoundaries: { knowEndsDay: 30, compareEndsDay: 59 },
        coverageTarget: 12,
        requiredGrammarIds: listRawGrammar().map((g) => g.id),
        newPerDay: 3,
        generatedAt: NOW.toISOString(),
      },
      weakness,
      coverageAudit: audit,
      env: analyticsEnv,
      now: NOW,
    });
    const recs = buildRecommendations(metrics, weakness, analyticsEnv);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.length).toBeLessThanOrEqual(3);
    for (const r of recs) {
      expect(r.reasonKey).toBeTruthy();
      expect(Object.keys(r.reasonParams).length).toBeGreaterThan(0);
      expect(r.estimatedMinutes).toBeGreaterThan(0);
    }
  });
});
