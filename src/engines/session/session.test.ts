import { describe, expect, it } from 'vitest';
import {
  buildAdHocDrill,
  buildDailySession,
  capacityOf,
  computeRatios,
  dailyReviewCapacity,
  displayGroups,
  refreshAnalyzeBlock,
  estimatedMinutes,
  type SessionEnv,
  type SessionInput,
} from './index';
import { evaluate } from '@/engines/adaptation';
import { createInitialMastery } from '@/engines/mastery';
import { emptyWeaknessProfile } from '@/engines/error';
import { generatePlan } from '@/engines/roadmap';
import { computeTimeline } from '@/engines/phase';
import { pickQuestions, type ExposureHistory } from '@/engines/exercise';
import {
  getGrammar,
  getQuestion,
  listComparisonSets,
  listQuestions,
  listRawGrammar,
} from '@/content/repository';
import type { GrammarMastery } from '@/domain/mastery';
import type { LearnerProfile, Timeline } from '@/domain/learner';
import type { Phase, StudyMode } from '@/domain/enums';
import { SESSION_OVERRUN_TOLERANCE } from '@/config/learning.config';

const NOW = new Date('2026-10-15T09:00:00.000Z');
const emptyHistory: ExposureHistory = { byQuestion: {}, recentQuestionIdsToday: [] };

function profile(over: Partial<LearnerProfile> = {}): LearnerProfile {
  return {
    id: 'me',
    examDate: '2026-12-06T00:00:00.000Z',
    studyStartDate: '2026-09-07T00:00:00.000Z',
    availableMinutesPerDay: 45,
    daysPerWeek: 7,
    selfAssessedLevel: 'N2_SOLID',
    grammarAlreadyStudiedCount: 0,
    targetScoreBand: 'COMFORTABLE',
    initialConfidence: 3,
    dayBoundaryHour: 4,
    furiganaEnabled: false,
    createdAt: '2026-09-07T00:00:00.000Z',
    ...over,
  };
}

function makeEnv(over: Partial<SessionEnv> = {}): SessionEnv {
  return {
    selectDue: (capacity) =>
      listRawGrammar()
        .slice(0, capacity)
        .map((g) => ({
          grammarId: g.id,
          priority: 0.5,
          reasons: [{ key: 'review.reason.state', params: {} }],
          suggestedDelivery: 'PRACTICE' as const,
          mixedOnly: false,
          pinned: false,
        })),
    pickQuestions: (criteria, count) =>
      pickQuestions(
        listQuestions(),
        {
          phase: 'PHASE_2_COMPARE',
          mode: 'NORMAL',
          delivery: 'PRACTICE',
          daysUntilExam: 40,
          seed: 42,
          now: NOW,
          ...criteria,
        },
        emptyHistory,
        count,
        { grammarById: getGrammar },
      ),
    comparisonSetsFor: (ids) => listComparisonSets().filter((s) => s.grammarIds.some((g) => ids.includes(g))),
    questionById: getQuestion,
    errorMaterials: [],
    recentlyLearnedGrammarIds: [],
    familiesOf: (id) => getGrammar(id)?.families ?? [],
    ...over,
  };
}

function baseInput(over: Partial<SessionInput> = {}): SessionInput {
  const p = over.profile ?? profile();
  const timeline = over.timeline ?? computeTimeline(p, NOW);
  const mastery = over.allMastery ?? listRawGrammar().map((g) => createInitialMastery(g.id));
  const plan = over.plan ?? generatePlan({ profile: p, timeline, allGrammar: listRawGrammar(), mastery, now: NOW });
  return {
    profile: p,
    timeline,
    plan,
    allMastery: mastery,
    weakness: emptyWeaknessProfile(NOW),
    adaptations: [],
    env: over.env ?? makeEnv(),
    now: NOW,
    ...over,
  };
}

function timelineOf(phase: Phase, mode: StudyMode, daysRemaining = 40): Timeline {
  return {
    totalStudyDays: 90,
    daysElapsed: 40,
    daysRemaining,
    studyDayIndex: 41,
    currentPhase: phase,
    mode,
    progressExpected: 0.45,
    phaseBoundaries: { knowEndsDay: 30, compareEndsDay: 59 },
    daysLeftInPhase: 19,
    isPhaseTransitionDay: false,
    todayKey: '2026-10-15',
    isExamOver: daysRemaining <= 0,
    isNearExam: daysRemaining > 0 && daysRemaining <= 21,
  };
}

describe('SessionEngine — cấu trúc bắt buộc', () => {
  it('luôn đủ 7 block đúng thứ tự CLAUDE.md §7', () => {
    const s = buildDailySession(baseInput());
    expect(s.blocks.map((b) => b.type)).toEqual([
      'REVIEW',
      'LEARN',
      'RECALL',
      'COMPARE',
      'APPLY',
      'ANALYZE_ERROR',
      'SCHEDULE',
    ]);
  });

  it('ANALYZE_ERROR luôn tồn tại và có nội dung kể cả khi không có lỗi nào', () => {
    const s = buildDailySession(baseInput());
    const block = s.blocks.find((b) => b.type === 'ANALYZE_ERROR')!;
    expect(block.items.length).toBeGreaterThan(0);
    expect(block.budgetMinutes).toBeGreaterThan(0);
  });

  it('snapshot — cùng (input, seed) cho session giống hệt nhau', () => {
    const a = buildDailySession(baseInput({ seed: 777 }));
    const b = buildDailySession(baseInput({ seed: 777 }));
    expect(a).toEqual(b);
  });

  it('nhóm hiển thị gọn 3–5 mục nhưng blocks vẫn đủ 7', () => {
    const s = buildDailySession(baseInput());
    expect(displayGroups(s).length).toBeLessThanOrEqual(5);
    expect(s.blocks).toHaveLength(7);
  });
});

describe('SessionEngine — ngân sách thời lượng', () => {
  const minutesCases = [10, 20, 45, 60, 90, 120];
  const phases: Phase[] = ['PHASE_1_KNOW', 'PHASE_2_COMPARE', 'PHASE_3_DETECT'];
  const modes: StudyMode[] = ['NORMAL', 'TRIAGE', 'FINAL_14', 'FINAL_7'];

  it('tổng ước tính ≤ M × 1.15 với mọi tổ hợp M × phase × mode', () => {
    for (const m of minutesCases) {
      for (const phase of phases) {
        for (const mode of modes) {
          const t = timelineOf(phase, mode, mode === 'FINAL_7' ? 5 : mode === 'FINAL_14' ? 12 : mode === 'TRIAGE' ? 25 : 40);
          const env = makeEnv();
          const input = baseInput({ profile: profile({ availableMinutesPerDay: m }), timeline: t });
          const s = buildDailySession(input);
          const est = estimatedMinutes(s, env, t);
          expect(est).toBeLessThanOrEqual(s.plannedMinutes * SESSION_OVERRUN_TOLERANCE + 0.001);
        }
      }
    }
  });

  it('ANALYZE_ERROR có budget > 0 trong mọi tổ hợp khi M ≥ 15', () => {
    for (const m of [15, 20, 45, 60, 90, 120]) {
      for (const phase of phases) {
        for (const mode of modes) {
          const t = timelineOf(phase, mode);
          const s = buildDailySession(baseInput({ profile: profile({ availableMinutesPerDay: m }), timeline: t }));
          const block = s.blocks.find((b) => b.type === 'ANALYZE_ERROR')!;
          expect(block.budgetMinutes).toBeGreaterThan(0);
        }
      }
    }
  });

  it('M = 10 → session tối thiểu: chỉ REVIEW + ANALYZE_ERROR, không LEARN', () => {
    const s = buildDailySession(
      baseInput({ profile: profile({ availableMinutesPerDay: 9 }), timeline: timelineOf('PHASE_1_KNOW', 'NORMAL') }),
    );
    expect(s.blocks.find((b) => b.type === 'LEARN')!.items).toHaveLength(0);
    expect(s.blocks.find((b) => b.type === 'ANALYZE_ERROR')!.items.length).toBeGreaterThan(0);
    expect(s.adaptationNotes.some((n) => n.ruleId === 'tiny_session')).toBe(true);
  });

  it('M > 120 bị chặn bởi trần cứng', () => {
    const s = buildDailySession(baseInput({ profile: profile({ availableMinutesPerDay: 300 }) }));
    expect(s.plannedMinutes).toBeLessThanOrEqual(120);
  });

  it('FINAL_7 giảm tổng khối lượng 25%', () => {
    const s = buildDailySession(
      baseInput({ profile: profile({ availableMinutesPerDay: 60 }), timeline: timelineOf('PHASE_3_DETECT', 'FINAL_7', 5) }),
    );
    expect(s.plannedMinutes).toBe(45);
  });
});

describe('SessionEngine — luật đóng băng LEARN', () => {
  it('kịch bản 5: backlog 3× capacity → LEARN = 0 và có AdaptationNote', () => {
    const timeline = timelineOf('PHASE_1_KNOW', 'NORMAL');
    const capacity = dailyReviewCapacity(45, 0.2, timeline);
    const weakness = { ...emptyWeaknessProfile(NOW), reviewDebt: capacity * 3 };
    const s = buildDailySession(baseInput({ timeline, weakness }));
    expect(s.blocks.find((b) => b.type === 'LEARN')!.items).toHaveLength(0);
    expect(s.adaptationNotes.some((n) => n.ruleId === 'backlog_freeze')).toBe(true);
  });

  it('FINAL_7 → LEARN = 0 kể cả khi coverage thiếu và có adaptation đòi tăng', () => {
    const timeline = timelineOf('PHASE_3_DETECT', 'FINAL_7', 5);
    const forceLearn = [
      {
        ruleId: 'test_force_learn',
        priority: 10,
        blockDeltas: { LEARN: 0.5 as number },
        messageKey: 'x',
        params: {},
      },
    ];
    const r = computeRatios({
      timeline,
      plan: baseInput().plan,
      coverage: 0.1,
      knowDebt: 50,
      backlog: 0,
      minutes: 45,
      adaptations: forceLearn as never,
    });
    expect(r.ratios.LEARN).toBe(0);

    const s = buildDailySession(baseInput({ timeline, adaptations: forceLearn as never }));
    expect(s.blocks.find((b) => b.type === 'LEARN')!.items).toHaveLength(0);
  });

  it('recovery mode: nghỉ 5 ngày → không LEARN, số item ≤ capacity', () => {
    const timeline = timelineOf('PHASE_2_COMPARE', 'NORMAL');
    const mastery: GrammarMastery[] = listRawGrammar().map((g, i) => ({
      ...createInitialMastery(g.id),
      state: i < 6 ? 'RECOGNIZED' : 'UNSEEN',
      baseRank: i < 6 ? 'RECOGNIZED' : null,
      correctCount: 5,
      nextReviewAt: '2026-10-01T04:00:00.000Z',
    }));
    const weakness = { ...emptyWeaknessProfile(NOW), daysSinceLastSession: 5, reviewDebt: 61 };
    const adaptations = evaluate({
      weakness,
      timeline,
      mastery,
      reviewCapacity: 22,
      overallAccuracy: 0.8,
    });
    expect(adaptations[0].ruleId).toBe('recovery_return');

    const s = buildDailySession(baseInput({ timeline, allMastery: mastery, weakness, adaptations }));
    expect(s.blocks.find((b) => b.type === 'LEARN')!.items).toHaveLength(0);
    const reviewBlock = s.blocks.find((b) => b.type === 'REVIEW')!;
    const capacity = capacityOf('REVIEW', reviewBlock.budgetMinutes, timeline);
    expect(reviewBlock.items.length).toBeLessThanOrEqual(capacity);
    expect(s.adaptationNotes.some((n) => n.ruleId === 'recovery_return')).toBe(true);
  });
});

describe('SessionEngine — sàn không thể phá', () => {
  it('mỗi mẫu trong LEARN luôn kèm ≥ 1 item RECALL, kể cả sau khi cắt ngân sách', () => {
    for (const m of [15, 20, 30, 45, 60]) {
      const s = buildDailySession(
        baseInput({ profile: profile({ availableMinutesPerDay: m }), timeline: timelineOf('PHASE_1_KNOW', 'NORMAL') }),
      );
      const learnIds = s.blocks
        .find((b) => b.type === 'LEARN')!
        .items.filter((i) => i.kind === 'LEARN_CARD')
        .map((i) => (i as { grammarId: string }).grammarId);
      const recallIds = new Set(
        s.blocks
          .find((b) => b.type === 'RECALL')!
          .items.filter((i) => i.kind === 'QUESTION')
          .map((i) => (i as { grammarId: string }).grammarId),
      );
      for (const id of learnIds) expect(recallIds.has(id)).toBe(true);
    }
  });

  it('trần cứng 8 mẫu mới/ngày', () => {
    const s = buildDailySession(
      baseInput({ profile: profile({ availableMinutesPerDay: 120 }), timeline: timelineOf('PHASE_1_KNOW', 'NORMAL') }),
    );
    expect(s.blocks.find((b) => b.type === 'LEARN')!.items.length).toBeLessThanOrEqual(8);
  });

  it('COMPARE không bao giờ còn lại nửa set', () => {
    const s = buildDailySession(baseInput({ timeline: timelineOf('PHASE_2_COMPARE', 'NORMAL') }));
    const compare = s.blocks.find((b) => b.type === 'COMPARE')!;
    if (compare.items.length > 0) {
      expect(compare.items.some((i) => i.kind === 'COMPARE_SET')).toBe(true);
    }
  });
});

describe('SessionEngine — nợ KNOW ở Phase 2', () => {
  it('chèn LEARN thêm nhưng không vượt trần 20%', () => {
    const timeline = timelineOf('PHASE_2_COMPARE', 'NORMAL');
    const r = computeRatios({
      timeline,
      plan: baseInput().plan,
      coverage: 0.1,
      knowDebt: 200,
      backlog: 0,
      minutes: 45,
      adaptations: [],
    });
    const baseline = computeRatios({
      timeline,
      plan: baseInput().plan,
      coverage: 1,
      knowDebt: 0,
      backlog: 0,
      minutes: 45,
      adaptations: [],
    });
    expect(r.ratios.LEARN).toBeGreaterThan(baseline.ratios.LEARN);
    expect(r.ratios.LEARN - baseline.ratios.LEARN).toBeLessThanOrEqual(0.21);
    expect(r.notes.some((n) => n.ruleId === 'know_debt')).toBe(true);
  });
});

describe('SessionEngine — buildAdHocDrill', () => {
  it('drill cặp nhầm chỉ lấy câu của đúng cặp đó', () => {
    const block = buildAdHocDrill('CONFUSION_PAIR', { from: 'ni-itatte', to: 'ni-itatte-wa' }, makeEnv(), 4);
    expect(block.type).toBe('COMPARE');
    for (const item of block.items) {
      if (item.kind !== 'QUESTION') continue;
      const q = getQuestion(item.questionId)!;
      expect(q.targetGrammarIds.some((g) => ['ni-itatte', 'ni-itatte-wa'].includes(g))).toBe(true);
    }
  });

  it('drill tốc độ dùng delivery TIMED', () => {
    const block = buildAdHocDrill('SPEED', { type: 'MEANING_MC' }, makeEnv(), 3);
    for (const item of block.items) {
      if (item.kind === 'QUESTION') expect(item.timed).toBe(true);
    }
  });
});

describe('Bài xếp lớp đổi thứ tự LEARN (P5)', () => {
  function learnIdsWith(mastery: GrammarMastery[]): string[] {
    const s = buildDailySession(baseInput({ allMastery: mastery }));
    return (
      s.blocks
        .find((b) => b.type === 'LEARN')
        ?.items.filter((i) => i.kind === 'LEARN_CARD')
        .map((i) => i.grammarId!) ?? []
    );
  }

  it('mẫu được đánh KNOWN bị đẩy ra khỏi nhóm học đầu tiên', () => {
    const base = listRawGrammar().map((g) => createInitialMastery(g.id));
    const before = learnIdsWith(base);
    expect(before.length).toBeGreaterThan(0);

    // Đánh dấu đúng những mẫu lẽ ra học hôm nay là ĐÃ BIẾT.
    const marked = base.map((m) =>
      before.includes(m.grammarId) ? { ...m, placementResult: 'KNOWN' as const } : m,
    );
    const after = learnIdsWith(marked);

    expect(after).toHaveLength(before.length);
    for (const id of after) expect(before).not.toContain(id);
  });

  it('KHÔNG loại mẫu nào khỏi kế hoạch — chỉ đổi thứ tự', () => {
    const base = listRawGrammar().map((g) => createInitialMastery(g.id));
    const allKnown = base.map((m) => ({ ...m, placementResult: 'KNOWN' as const }));
    // Mọi mẫu đều KNOWN thì vẫn phải có bài học hôm nay, chỉ là không còn ưu tiên nào khác.
    expect(learnIdsWith(allKnown).length).toBe(learnIdsWith(base).length);
  });

  it('UNKNOWN được xếp ngang với mẫu chưa kiểm tra, không bị phạt', () => {
    const base = listRawGrammar().map((g) => createInitialMastery(g.id));
    const unknown = base.map((m) => ({ ...m, placementResult: 'UNKNOWN' as const }));
    expect(learnIdsWith(unknown)).toEqual(learnIdsWith(base));
  });
});

describe('Không hỏi mẫu chưa được dạy (H9)', () => {
  const env0 = makeEnv();
  /** Mọi grammarId xuất hiện trong một khối, lấy qua câu hỏi thật. */
  function idsOf(s: ReturnType<typeof buildDailySession>, block: string): string[] {
    const items = s.blocks.find((b) => b.type === block)?.items ?? [];
    const out: string[] = [];
    for (const i of items) {
      if (i.kind === 'QUESTION' || i.kind === 'TRAP_DRILL') {
        out.push(...(env0.questionById(i.questionId)?.targetGrammarIds ?? []));
      }
    }
    return out;
  }
  function learnedIn(s: ReturnType<typeof buildDailySession>): string[] {
    const items = s.blocks.find((b) => b.type === 'LEARN')?.items ?? [];
    return items.flatMap((i) => (i.kind === 'LEARN_CARD' ? [i.grammarId] : []));
  }

  it('buổi ĐẦU TIÊN: mọi câu chỉ nhắm mẫu học trong chính buổi đó', () => {
    const mastery = listRawGrammar().map((g) => createInitialMastery(g.id));
    const s = buildDailySession(baseInput({ allMastery: mastery, env: env0 }));

    const learned = new Set(learnedIn(s));
    expect(learned.size).toBeGreaterThan(0);

    for (const block of ['RECALL', 'COMPARE', 'APPLY']) {
      for (const gid of idsOf(s, block)) {
        expect(learned.has(gid)).toBe(true);
      }
    }
  });

  it('mẫu đã học từ trước vẫn được dùng lại', () => {
    const all = listRawGrammar();
    const known = all.slice(0, 40).map((g) => g.id);
    const mastery = all.map((g) =>
      known.includes(g.id)
        ? { ...createInitialMastery(g.id), state: 'RECOGNIZED' as const, baseRank: 'RECOGNIZED' as const }
        : createInitialMastery(g.id),
    );
    const s = buildDailySession(baseInput({ allMastery: mastery, env: env0 }));
    const learned = learnedIn(s);
    const allowed = new Set([...known, ...learned]);

    // Ghi lại số liệu để thấy rõ H9 lọc chứ không làm cạn kho câu.
    const applied = idsOf(s, 'APPLY');
    const recalled = idsOf(s, 'RECALL');
    expect(recalled.length + applied.length).toBeGreaterThan(0);
    for (const gid of [...applied, ...recalled]) expect(allowed.has(gid)).toBe(true);
  });

  it('câu so sánh chỉ ra khi ĐỦ CẢ BỘ mẫu đã học, không ra khi mới biết một nửa', () => {
    const all = listRawGrammar();
    const set = listComparisonSets().find((c) => c.grammarIds.length >= 3)!;
    // Chỉ cho biết 1 trong số các mẫu của bộ đó.
    const mastery = all.map((g) =>
      g.id === set.grammarIds[0]
        ? { ...createInitialMastery(g.id), state: 'RECOGNIZED' as const, baseRank: 'RECOGNIZED' as const }
        : createInitialMastery(g.id),
    );
    const s = buildDailySession(baseInput({ allMastery: mastery, env: env0 }));
    const learned = new Set(learnedIn(s));
    const allowed = new Set([set.grammarIds[0], ...learned]);

    for (const block of ['RECALL', 'COMPARE', 'APPLY']) {
      for (const gid of idsOf(s, block)) expect(allowed.has(gid)).toBe(true);
    }
  });
});

describe('H9 lọc nhưng KHÔNG làm cạn buổi học', () => {
  it('buổi đầu tiên vẫn đủ mục ở mọi khối có ngân sách', () => {
    const mastery = listRawGrammar().map((g) => createInitialMastery(g.id));
    const s = buildDailySession(baseInput({ allMastery: mastery }));
    const report: string[] = [];
    for (const b of s.blocks) {
      report.push(`${b.type}=${b.items.length}/${b.budgetMinutes}p(thiếu ${b.shortfall ?? 0})`);
      // Khối có ngân sách > 0 thì phải có ít nhất 1 mục.
      if (b.budgetMinutes > 0 && b.type !== 'SCHEDULE') {
        expect(b.items.length).toBeGreaterThan(0);
      }
    }
    console.log('BUỔI 1:', report.join(' · '));
  });
});

describe('Khối Chữa lỗi phải phản ánh câu VỪA làm, không phải ảnh chụp đầu ngày', () => {
  it('dựng lúc chưa có bài làm thì báo không có lỗi', () => {
    const s = buildDailySession(baseInput({ env: makeEnv({ errorMaterials: [] }) }));
    const items = s.blocks.find((b) => b.type === 'ANALYZE_ERROR')!.items;
    expect(items).toHaveLength(1);
    expect(items[0].kind === 'ERROR_REVIEW' && items[0].noteKey).toBe('analyze.noErrors');
  });

  it('sau khi có câu sai, refreshAnalyzeBlock thay bằng chính các câu đó', () => {
    const built = buildDailySession(baseInput({ env: makeEnv({ errorMaterials: [] }) }));
    expect(
      built.blocks.find((b) => b.type === 'ANALYZE_ERROR')!.items[0],
    ).toMatchObject({ noteKey: 'analyze.noErrors' });

    // Người học làm bài xong, giờ mới có nguyên liệu lỗi.
    const withErrors = makeEnv({
      errorMaterials: [{ attemptIds: ['att_1', 'att_2'], noteKey: 'analyze.todayErrors' }],
    });
    const refreshed = refreshAnalyzeBlock(built, withErrors, baseInput().timeline);
    const items = refreshed.blocks.find((b) => b.type === 'ANALYZE_ERROR')!.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ noteKey: 'analyze.todayErrors', attemptIds: ['att_1', 'att_2'] });
  });

  it('chỉ đụng vào khối ANALYZE_ERROR, các khối khác giữ nguyên', () => {
    const built = buildDailySession(baseInput());
    const refreshed = refreshAnalyzeBlock(
      built,
      makeEnv({ errorMaterials: [{ attemptIds: ['x'], noteKey: 'analyze.todayErrors' }] }),
      baseInput().timeline,
    );
    for (const b of built.blocks) {
      if (b.type === 'ANALYZE_ERROR') continue;
      expect(refreshed.blocks.find((r) => r.type === b.type)!.items).toEqual(b.items);
    }
  });
});
