import type { Grammar } from '@/domain/grammar';
import type { LearnerProfile, StudyPlan, Timeline } from '@/domain/learner';
import type { GrammarMastery } from '@/domain/mastery';
import {
  EXAM_FREQUENCY_WEIGHT,
  NEW_PER_DAY_HARD_CAP,
  REPLAN_PROGRESS_DRIFT,
  RECOVERY_GAP_DAYS,
  CADENCE_WINDOW_DAYS,
  CADENCE_MIN_ELAPSED_DAYS,
  CADENCE_MIN_DRIFT,
} from '@/config/learning.config';
import { calendarDaysBetween, dayKey, MS_PER_DAY } from '@/shared/date';
import { allowedExamFrequencies, computeTimeline } from '@/engines/phase';
import { atLeast } from '@/engines/mastery';

export interface PlanInput {
  profile: LearnerProfile;
  timeline: Timeline;
  allGrammar: Grammar[];
  mastery: GrammarMastery[];
  now: Date;
  previousVersion?: number;
}

/**
 * RoadmapEngine — biến thời gian còn lại thành một kế hoạch có thật.
 * Sắp xếp theo examFrequency DESC → difficulty ASC → family, để các mẫu cùng nhóm
 * được học gần nhau, chuẩn bị sẵn cặp so sánh cho Phase 2 (arch §7.2).
 */
export function generatePlan(input: PlanInput): StudyPlan {
  const { profile, timeline, allGrammar, mastery, now } = input;
  const allowed = allowedExamFrequencies(timeline.daysRemaining);

  const required = allGrammar
    .filter((g) => allowed.includes(g.examFrequency))
    .filter((g) => g.verificationStatus !== 'DRAFT')
    .sort((a, b) => {
      const fa = EXAM_FREQUENCY_WEIGHT[b.examFrequency] - EXAM_FREQUENCY_WEIGHT[a.examFrequency];
      if (fa !== 0) return fa;
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
      const famA = a.families[0] ?? '';
      const famB = b.families[0] ?? '';
      if (famA !== famB) return famA.localeCompare(famB);
      return a.id.localeCompare(b.id);
    });

  const byId = new Map(mastery.map((m) => [m.grammarId, m]));
  const unseenRequired = required.filter((g) => {
    const m = byId.get(g.id);
    return !m || m.state === 'UNSEEN';
  }).length;

  // Số ngày còn lại của Phase 1; nếu đã qua Phase 1 thì trải trên số ngày học còn lại.
  const learningDaysLeft =
    timeline.currentPhase === 'PHASE_1_KNOW'
      ? Math.max(1, timeline.phaseBoundaries.knowEndsDay - timeline.studyDayIndex + 1)
      : Math.max(1, timeline.totalStudyDays - timeline.studyDayIndex + 1);

  const newPerDay = Math.min(
    NEW_PER_DAY_HARD_CAP,
    Math.max(1, Math.ceil(unseenRequired / learningDaysLeft)),
  );

  return {
    version: (input.previousVersion ?? 0) + 1,
    totalStudyDays: timeline.totalStudyDays,
    phaseBoundaries: timeline.phaseBoundaries,
    coverageTarget: required.length,
    requiredGrammarIds: required.map((g) => g.id),
    newPerDay,
    generatedAt: now.toISOString(),
    reasonVi: `${required.length} mẫu trong kế hoạch · ${profile.availableMinutesPerDay} phút/ngày · ${timeline.totalStudyDays} ngày học.`,
  };
}

export interface ReplanCheck {
  need: boolean;
  reasonKey?: string;
  params?: Record<string, string | number>;
}

export function coverageOf(plan: StudyPlan, mastery: GrammarMastery[]): number {
  if (plan.coverageTarget === 0) return 0;
  const required = new Set(plan.requiredGrammarIds);
  const covered = mastery.filter((m) => required.has(m.grammarId) && atLeast(m, 'RECOGNIZED')).length;
  return covered / plan.coverageTarget;
}

export function shouldReplan(
  plan: StudyPlan,
  timeline: Timeline,
  mastery: GrammarMastery[],
  daysSinceLastSession: number,
): ReplanCheck {
  if (plan.totalStudyDays !== timeline.totalStudyDays) {
    return { need: true, reasonKey: 'roadmap.replan.scheduleChanged', params: {} };
  }
  if (
    plan.phaseBoundaries.knowEndsDay !== timeline.phaseBoundaries.knowEndsDay ||
    plan.phaseBoundaries.compareEndsDay !== timeline.phaseBoundaries.compareEndsDay
  ) {
    return { need: true, reasonKey: 'roadmap.replan.scheduleChanged', params: {} };
  }
  if (daysSinceLastSession >= RECOVERY_GAP_DAYS) {
    return { need: true, reasonKey: 'roadmap.replan.gap', params: { days: daysSinceLastSession } };
  }
  const actual = coverageOf(plan, mastery);
  const drift = timeline.progressExpected - actual;
  if (drift > REPLAN_PROGRESS_DRIFT) {
    return {
      need: true,
      reasonKey: 'roadmap.replan.behind',
      params: { expected: Math.round(timeline.progressExpected * 100), actual: Math.round(actual * 100) },
    };
  }
  return { need: false };
}

/** Số mẫu chưa vững nghĩa khi bước vào Phase 2 — "nợ KNOW" (learning-engine §14.1). */
export function knowDebtOf(plan: StudyPlan, mastery: GrammarMastery[]): number {
  const required = new Set(plan.requiredGrammarIds);
  const byId = new Map(mastery.map((m) => [m.grammarId, m]));
  let debt = 0;
  for (const id of required) {
    const m = byId.get(id);
    if (!m || !atLeast(m, 'RECOGNIZED')) debt++;
  }
  return debt;
}

export interface CoverageFeasibility {
  /** Số buổi học của Phase 1. */
  phase1Days: number;
  /** Số mẫu học được nếu chạy hết công suất Phase 1. */
  capacity: number;
  /** Số mẫu bắt buộc phải phủ. */
  required: number;
  /** > 0 nghĩa là Phase 1 KHÔNG kịp phủ hết; phần thiếu thành "nợ KNOW" ở Phase 2 (§22). */
  shortfall: number;
  /** Số buổi/tuần tối thiểu để hết thiếu, hoặc null nếu 7 buổi/tuần vẫn không đủ. */
  suggestedDaysPerWeek: number | null;
}

/**
 * Phase 1 có kịp phủ hết kho mẫu không?
 *
 * `newPerDay` đã bị chặn bởi trần cứng 8 mẫu/ngày (`CLAUDE.md §8.2`), nên khi số buổi
 * học ít, công suất Phase 1 có thể nhỏ hơn số mẫu bắt buộc. Engine vốn tính ra được
 * điều này nhưng trước đây không nói cho người học biết.
 */
export function coverageFeasibility(input: PlanInput): CoverageFeasibility {
  const plan = generatePlan(input);
  const phase1Days = Math.max(1, plan.phaseBoundaries.knowEndsDay);
  const capacity = phase1Days * plan.newPerDay;
  const required = plan.coverageTarget;

  let suggested: number | null = null;
  if (capacity < required) {
    for (let dpw = input.profile.daysPerWeek + 1; dpw <= 7; dpw += 1) {
      const profile = { ...input.profile, daysPerWeek: dpw };
      const timeline = computeTimeline(profile, input.now);
      const p = generatePlan({ ...input, profile, timeline });
      const days = Math.max(1, p.phaseBoundaries.knowEndsDay);
      if (days * p.newPerDay >= p.coverageTarget) {
        suggested = dpw;
        break;
      }
    }
  }

  return {
    phase1Days,
    capacity,
    required,
    shortfall: Math.max(0, required - capacity),
    suggestedDaysPerWeek: suggested,
  };
}

export interface CadenceCheck {
  /** Đủ dữ liệu để kết luận chưa. */
  hasEnoughData: boolean;
  /** Số buổi/tuần người học TỰ KHAI. */
  declared: number;
  /** Số buổi/tuần suy ra từ lịch sử làm bài (số thực, chưa làm tròn). */
  observed: number;
  /** Số ngày thực sự có làm bài trong cửa sổ quan sát. */
  studiedDays: number;
  windowDays: number;
  /**
   * Giá trị `daysPerWeek` nên đổi sang, hoặc null nếu con số đã khai là hợp lý.
   * Làm tròn XUỐNG khi nhịp thật thấp hơn — khai thấp an toàn hơn khai cao.
   */
  suggested: number | null;
  /** 'SLOWER' = học ít hơn khai · 'FASTER' = học nhiều hơn khai. */
  direction: 'SLOWER' | 'FASTER' | 'ON_TRACK';
}

/**
 * Đối chiếu nhịp học THỰC TẾ với `daysPerWeek` người học tự khai.
 *
 * `daysPerWeek` là con số khai một lần ở onboarding và chi phối toàn bộ `totalStudyDays`,
 * ranh giới giai đoạn và số mẫu mới mỗi ngày. Khai sai thì cả kế hoạch lệch theo, mà
 * RoadmapEngine không tự phát hiện được — nó chỉ chỉnh `newPerDay`.
 *
 * Hàm này đếm số NGÀY KHÁC NHAU có làm bài trong cửa sổ gần nhất và quy ra buổi/tuần.
 * Thuần tuý: chỉ nhận `dayKey` và `now`, không đọc đồng hồ.
 */
export function observedCadence(
  attemptDayKeys: readonly string[],
  declaredDaysPerWeek: number,
  studyStartDate: string,
  now: Date,
  boundaryHour: number,
): CadenceCheck {
  const windowDays = CADENCE_WINDOW_DAYS;
  const elapsed = calendarDaysBetween(studyStartDate, now, boundaryHour);

  const since = new Date(now.getTime() - windowDays * MS_PER_DAY);
  const sinceKey = dayKey(since, boundaryHour);
  const nowKey = dayKey(now, boundaryHour);
  const studiedDays = new Set(
    attemptDayKeys.filter((k) => k >= sinceKey && k <= nowKey),
  ).size;

  // Cửa sổ chỉ được tính tới số ngày đã thực sự trôi qua, để tuần đầu không bị chia sai.
  const effectiveWindow = Math.max(1, Math.min(windowDays, elapsed));
  const observed = (studiedDays / effectiveWindow) * DAYS_IN_WEEK;

  const hasEnoughData = elapsed >= CADENCE_MIN_ELAPSED_DAYS;
  const diff = declaredDaysPerWeek - observed;

  let suggested: number | null = null;
  let direction: CadenceCheck['direction'] = 'ON_TRACK';
  if (hasEnoughData && diff >= CADENCE_MIN_DRIFT) {
    direction = 'SLOWER';
    // Làm tròn XUỐNG: thà kế hoạch dè dặt còn hơn lạc quan quá đà.
    suggested = clampDaysPerWeek(Math.floor(observed));
  } else if (hasEnoughData && -diff >= CADENCE_MIN_DRIFT) {
    direction = 'FASTER';
    suggested = clampDaysPerWeek(Math.floor(observed));
  }
  if (suggested === declaredDaysPerWeek) suggested = null;

  return { hasEnoughData, declared: declaredDaysPerWeek, observed, studiedDays, windowDays, suggested, direction };
}

/** Một tuần có 7 ngày — đặt tên để không rải số 7 khắp nơi (CLAUDE.md §16.5). */
const DAYS_IN_WEEK = 7;

function clampDaysPerWeek(n: number): number {
  return Math.min(DAYS_IN_WEEK, Math.max(1, n));
}
