import { describe, expect, it } from 'vitest';
import {
  auditExamCoverage,
  baseIntervalFor,
  compressInterval,
  computeNextReview,
  computePriority,
  reasonsFor,
  recompressAll,
  selectDueItems,
  type GrammarPrioritySignals,
  type PriorityContext,
} from './index';
import { createInitialMastery } from '@/engines/mastery';
import type { GrammarMastery } from '@/domain/mastery';
import type { Timeline } from '@/domain/learner';
import type { WeaknessProfile } from '@/domain/analytics';
import { PRIORITY_WEIGHTS, PRIORITY_WEIGHTS_NEAR_EXAM, STATE_WEIGHT } from '@/config/learning.config';
import type { Confidence, MasteryState } from '@/domain/enums';

const NOW = new Date('2026-10-01T09:00:00.000Z');

function timeline(over: Partial<Timeline> = {}): Timeline {
  return {
    totalStudyDays: 90,
    daysElapsed: 45,
    daysRemaining: 40,
    studyDayIndex: 46,
    currentPhase: 'PHASE_2_COMPARE',
    mode: 'NORMAL',
    progressExpected: 0.5,
    phaseBoundaries: { knowEndsDay: 30, compareEndsDay: 59 },
    daysLeftInPhase: 14,
    isPhaseTransitionDay: false,
    todayKey: '2026-10-01',
    ...over,
    isExamOver: (over.daysRemaining ?? 40) <= 0,
    isNearExam: (over.daysRemaining ?? 40) > 0 && (over.daysRemaining ?? 40) <= 21,
  };
}

const emptyWeakness: WeaknessProfile = {
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
  windowDays: 14,
  computedAt: NOW.toISOString(),
  totalAttempts: 0,
  daysSinceLastSession: 0,
};

function sig(over: Partial<GrammarPrioritySignals> = {}): GrammarPrioritySignals {
  return {
    examFrequency: 'MEDIUM',
    family: 'TIME',
    weightedErrors: 0,
    trapMisses: 0,
    recentConfidences: [],
    hasTrapHistory: false,
    ...over,
  };
}

function ctxOf(signals: Record<string, GrammarPrioritySignals>, over: Partial<Timeline> = {}): PriorityContext {
  return { timeline: timeline(over), weakness: emptyWeakness, now: NOW, seenTodayGrammarIds: [], signals };
}

function mastery(id: string, over: Partial<GrammarMastery> = {}): GrammarMastery {
  return { ...createInitialMastery(id), state: 'RECOGNIZED', baseRank: 'RECOGNIZED', ...over };
}

describe('ReviewEngine — R12 trọng số khớp CLAUDE.md §14.1', () => {
  it('bộ trọng số bình thường', () => {
    expect(PRIORITY_WEIGHTS).toEqual({
      stateWeight: 0.25,
      errorPressure: 0.2,
      confusionPressure: 0.15,
      decay: 0.15,
      speedPenalty: 0.1,
      guessPenalty: 0.1,
      examFrequencyWeight: 0.05,
      recencyPenalty: -0.1,
    });
  });
  it('bộ trọng số gần thi (§14.4)', () => {
    expect(PRIORITY_WEIGHTS_NEAR_EXAM.errorPressure).toBe(0.25);
    expect(PRIORITY_WEIGHTS_NEAR_EXAM.confusionPressure).toBe(0.25);
    expect(PRIORITY_WEIGHTS_NEAR_EXAM.decay).toBe(0.05);
    expect(PRIORITY_WEIGHTS_NEAR_EXAM.trapPressure).toBe(0.2);
  });
  it('stateWeight — INTRODUCED (0.6) cao hơn RECOGNIZED (0.5), cố ý', () => {
    expect(STATE_WEIGHT.INTRODUCED).toBe(0.6);
    expect(STATE_WEIGHT.RECOGNIZED).toBe(0.5);
    expect(STATE_WEIGHT.CONFUSED).toBe(1.0);
    expect(STATE_WEIGHT.UNSEEN).toBe(0);
  });
});

describe('ReviewEngine — interval (bảng kiểm chứng review-engine §5.2)', () => {
  const rows: Array<[days: number, base: number, expected: number]> = [
    [60, 12, 12],
    [21, 12, 7],
    [20, 7, 4],
    [8, 12, 3],
    [7, 12, 2],
    [5, 7, 2],
    [5, 4, 1],
    [2, 12, 1],
    [1, 4, 1],
  ];
  it.each(rows)('daysUntilExam=%i, base=%i → %i', (days, base, expected) => {
    expect(compressInterval(base, days)).toBe(expected);
  });

  it('R1 — interval luôn ≥ 1 và là số nguyên', () => {
    for (let d = 1; d <= 120; d++) {
      for (const b of [1, 2, 4, 7, 12]) {
        const i = compressInterval(b, d);
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('R2 — kịch bản arch §13.6: daysUntilExam = 5 → mọi interval ≤ 2', () => {
    const states: MasteryState[] = ['INTRODUCED', 'RECOGNIZED', 'SHAKY', 'CONFUSED', 'COMPARABLE', 'EXAM_READY'];
    const confs: Confidence[] = ['GUESS', 'UNSURE', 'CONFIDENT'];
    for (const s of states) {
      for (const c of confs) {
        for (const correct of [true, false]) {
          const m = mastery('x', { state: s, baseRank: s === 'SHAKY' || s === 'CONFUSED' ? 'COMPARABLE' : (s as never) });
          expect(compressInterval(baseIntervalFor(correct, c, m), 5)).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('R4 — sai luôn cho interval 1 bất kể state', () => {
    for (const s of ['INTRODUCED', 'RECOGNIZED', 'COMPARABLE', 'EXAM_READY'] as MasteryState[]) {
      const m = mastery('x', { state: s, baseRank: s as never });
      expect(baseIntervalFor(false, 'CONFIDENT', m)).toBe(1);
    }
  });

  it('R5 — đúng + GUESS không bao giờ dài hơn đúng + UNSURE', () => {
    const m = mastery('x', { state: 'EXAM_READY', baseRank: 'EXAM_READY' });
    expect(baseIntervalFor(true, 'GUESS', m)).toBeLessThanOrEqual(baseIntervalFor(true, 'UNSURE', m));
  });

  it('R3 — nextReviewAt luôn trước ngày thi', () => {
    const t = timeline({ daysRemaining: 3 });
    const m = mastery('x', { state: 'EXAM_READY', baseRank: 'EXAM_READY' });
    const iso = computeNextReview(m, { isCorrect: true, confidence: 'CONFIDENT' }, t, 4);
    expect(iso.slice(0, 10) < '2026-10-04').toBe(true);
  });
});

describe('ReviewEngine — priority', () => {
  it('R8 — decay cắt tại 1.0', () => {
    const s = { a: sig(), b: sig() };
    const c = ctxOf(s);
    const a = mastery('a', { lastReviewedAt: '2026-09-21T09:00:00.000Z' });
    const b = mastery('b', { lastReviewedAt: '2026-07-01T09:00:00.000Z' });
    expect(computePriority(a, c)).toBeCloseTo(computePriority(b, c), 5);
  });

  it('ví dụ review-engine §11.1 — xếp hạng A → B → C', () => {
    const signals = {
      A: sig({ examFrequency: 'HIGH', medianRtMs: 48000, dominantType: 'CLOZE_MC', recentConfidences: ['GUESS', 'CONFIDENT', 'CONFIDENT', 'CONFIDENT', 'CONFIDENT', 'CONFIDENT'], weightedErrors: 2.25 }),
      B: sig({ examFrequency: 'MEDIUM', weightedErrors: 0.75 }),
      C: sig({ examFrequency: 'MEDIUM' }),
    };
    const c = ctxOf(signals);
    const A = mastery('A', { state: 'CONFUSED', baseRank: 'RECOGNIZED', confusedWith: { x: 6 }, lastReviewedAt: '2026-09-28T09:00:00.000Z' });
    const B = mastery('B', { lastReviewedAt: '2026-09-22T09:00:00.000Z', wrongCount: 1 });
    const C = mastery('C', { state: 'EXAM_READY', baseRank: 'EXAM_READY', lastReviewedAt: '2026-09-20T09:00:00.000Z' });
    const pa = computePriority(A, c);
    const pb = computePriority(B, c);
    const pc = computePriority(C, c);
    expect(pa).toBeGreaterThan(pb);
    expect(pb).toBeGreaterThan(pc);
    expect(pa).toBeGreaterThan(0.9);
  });

  it('R7 — deterministic', () => {
    const c = ctxOf({ a: sig() });
    const m = mastery('a', { lastReviewedAt: '2026-09-25T09:00:00.000Z' });
    expect(computePriority(m, c)).toBe(computePriority(m, c));
  });

  it('mọi ScoredItem có lý do không rỗng', () => {
    const c = ctxOf({ a: sig() });
    expect(reasonsFor(mastery('a'), c).length).toBeGreaterThan(0);
  });
});

describe('ReviewEngine — selectDueItems', () => {
  function bulk(n: number, over: Partial<GrammarMastery> = {}): GrammarMastery[] {
    return Array.from({ length: n }, (_, i) =>
      mastery(`g${i}`, { nextReviewAt: '2026-09-01T00:00:00.000Z', lastReviewedAt: '2026-09-01T00:00:00.000Z', ...over }),
    );
  }
  function signalsFor(list: GrammarMastery[]): Record<string, GrammarPrioritySignals> {
    const families = ['TIME', 'CONCESSION', 'EVALUATION', 'STANCE', 'CAUSE'] as const;
    return Object.fromEntries(
      list.map((m, i) => [m.grammarId, sig({ family: families[i % families.length] })]),
    );
  }

  it('R6 — backlog 300, capacity 12 → trả đúng 12', () => {
    const list = bulk(300);
    const out = selectDueItems(list, ctxOf(signalsFor(list)), 12);
    expect(out).toHaveLength(12);
  });

  it('R9 — item UNSEEN không bao giờ xuất hiện', () => {
    const list = [...bulk(5), createInitialMastery('unseen-1')];
    const out = selectDueItems(list, ctxOf(signalsFor(list)), 10);
    expect(out.map((o) => o.grammarId)).not.toContain('unseen-1');
  });

  it('R10 — item CONFUSED vào pool kể cả khi chưa due', () => {
    const confused = mastery('conf', {
      state: 'CONFUSED',
      baseRank: 'RECOGNIZED',
      nextReviewAt: '2027-01-01T00:00:00.000Z',
      confusedWith: { x: 3 },
    });
    const list = [confused, ...bulk(3)];
    const out = selectDueItems(list, ctxOf(signalsFor(list)), 5);
    expect(out.map((o) => o.grammarId)).toContain('conf');
  });

  it('pinned chen lên đầu và không bị capacity cắt', () => {
    const pinnedItem = mastery('pinned', { pinned: true, state: 'EXAM_READY', baseRank: 'EXAM_READY' });
    const list = [...bulk(50), pinnedItem];
    const out = selectDueItems(list, ctxOf(signalsFor(list)), 5);
    expect(out[0].grammarId).toBe('pinned');
    expect(out).toHaveLength(5);
  });

  it('backlog rỗng → vẫn không để block REVIEW trống', () => {
    const list = [mastery('a'), mastery('b')];
    const out = selectDueItems(list, ctxOf(signalsFor(list)), 3);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].reasons.length).toBeGreaterThan(0);
  });

  it('capacity = 0 → trả mảng rỗng', () => {
    expect(selectDueItems(bulk(5), ctxOf({}), 0)).toEqual([]);
  });

  it('tie-break xác định — chạy 50 lần cho cùng thứ tự', () => {
    const list = bulk(20);
    const c = ctxOf(signalsFor(list));
    const first = selectDueItems(list, c, 8).map((x) => x.grammarId);
    for (let i = 0; i < 50; i++) {
      expect(selectDueItems(list, c, 8).map((x) => x.grammarId)).toEqual(first);
    }
  });

  it('gần thi: EXAM_READY bị đánh dấu mixedOnly', () => {
    const list = [mastery('e', { state: 'EXAM_READY', baseRank: 'EXAM_READY', nextReviewAt: '2026-09-01T00:00:00.000Z' })];
    const out = selectDueItems(list, ctxOf({ e: sig() }, { daysRemaining: 10 }), 5);
    expect(out[0].mixedOnly).toBe(true);
  });

  it('CONFUSED → suggestedDelivery = STUDY; FINAL_7 → TIMED', () => {
    const conf = mastery('c', { state: 'CONFUSED', baseRank: 'RECOGNIZED' });
    expect(selectDueItems([conf], ctxOf({ c: sig() }), 3)[0].suggestedDelivery).toBe('STUDY');
    expect(
      selectDueItems([conf], ctxOf({ c: sig() }, { daysRemaining: 5, mode: 'FINAL_7' }), 3)[0].suggestedDelivery,
    ).toBe('TIMED');
  });
});

describe('ReviewEngine — bảo đảm 2 lần trước ngày thi', () => {
  it('R11 — không kịp thì cảnh báo, không âm thầm bỏ luật', () => {
    const list = Array.from({ length: 134 }, (_, i) => mastery(`g${i}`));
    const audit = auditExamCoverage(list, timeline({ daysRemaining: 21 }), 10);
    expect(audit.ok).toBe(false);
    expect(audit.requiredSlots).toBe(268);
    expect(audit.availableSlots).toBe(210);
    expect(audit.atRisk.length).toBeGreaterThan(0);
    expect(audit.messageKey).toBeTruthy();
  });

  it('đủ chỗ thì ok = true', () => {
    const list = Array.from({ length: 20 }, (_, i) => mastery(`g${i}`));
    expect(auditExamCoverage(list, timeline({ daysRemaining: 40 }), 10).ok).toBe(true);
  });
});

describe('ReviewEngine — đổi examDate', () => {
  it('gần hơn → recompressAll kéo mọi nextReviewAt về trước ngày thi', () => {
    const list = [mastery('a', { nextReviewAt: '2026-11-20T04:00:00.000Z' })];
    const out = recompressAll(list, timeline({ daysRemaining: 5 }), 4);
    expect(out[0].nextReviewAt!.slice(0, 10) <= '2026-10-05').toBe(true);
  });

  it('xa hơn → không nextReviewAt nào bị đẩy ra xa', () => {
    const list = [mastery('a', { nextReviewAt: '2026-10-03T04:00:00.000Z' })];
    const out = recompressAll(list, timeline({ daysRemaining: 200 }), 4);
    expect(out[0].nextReviewAt).toBe('2026-10-03T04:00:00.000Z');
  });
});
