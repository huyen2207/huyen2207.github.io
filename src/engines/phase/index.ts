import type { LearnerProfile, LearnerProgress, PhaseBoundaries, Timeline } from '@/domain/learner';
import type { ExamFrequency, Phase, StudyMode } from '@/domain/enums';
import {
  FINAL_14_THRESHOLD_DAYS,
  FINAL_7_THRESHOLD_DAYS,
  HIGH_ONLY_THRESHOLD_DAYS,
  MIN_DETECT_DAYS,
  MIN_TOTAL_DAYS_FOR_DETECT_FLOOR,
  NO_DEADLINE_DAYS,
  PHASE_PROGRESS_THRESHOLDS,
  PHASE_RATIO_TABLE,
  PLANNING_HORIZON_SESSIONS,
  TRIAGE_THRESHOLD_DAYS,
  type PhaseRatioRow,
} from '@/config/phase.config';
import { NEAR_EXAM_DAYS } from '@/config/learning.config';
import { calendarDaysBetween, dayKey, studyDaysBetween } from '@/shared/date';
import { clamp } from '@/shared/math';

/**
 * PhaseEngine — NƠI DUY NHẤT biến ngày tháng thành phase và mode (arch §7.1).
 * Pure: `now` luôn là tham số, không gọi Date.now().
 * CẤM mọi so sánh `daysRemaining <= 14` ở nơi khác; dùng `timeline.mode`.
 */

export function phaseRatiosFor(totalStudyDays: number): PhaseRatioRow {
  for (const row of PHASE_RATIO_TABLE) {
    if (totalStudyDays >= row.minDays) return row;
  }
  return PHASE_RATIO_TABLE[PHASE_RATIO_TABLE.length - 1];
}

export function computePhaseBoundaries(totalStudyDays: number): PhaseBoundaries {
  const total = Math.max(1, totalStudyDays);
  const r = phaseRatiosFor(total);

  let detectDays = Math.round(total * r.detect);
  if (total >= MIN_TOTAL_DAYS_FOR_DETECT_FLOOR) {
    detectDays = Math.max(detectDays, MIN_DETECT_DAYS);
  }
  detectDays = clamp(detectDays, 0, total);

  const remaining = total - detectDays;
  const knowShare = r.know + r.compare === 0 ? 0 : r.know / (r.know + r.compare);
  const knowDays = clamp(Math.round(remaining * knowShare), 0, remaining);
  const compareDays = remaining - knowDays;

  return { knowEndsDay: knowDays, compareEndsDay: knowDays + compareDays };
}

/**
 * CLAUDE.md §3.2 (sửa 2026-11-02) — giai đoạn do ĐỘ VỮNG quyết định, không do lịch.
 *
 * Lý do đổi: tính theo lịch thì nghỉ hai tuần là bị đẩy sang "so sánh" dù chưa thuộc mẫu nào,
 * và câu "tôi đang ở giai đoạn 2" không còn nghĩa gì. Theo độ vững thì nó nói đúng một điều:
 * bạn đã vững phần nhận biết.
 */
export function phaseOfProgress(progress: LearnerProgress): Phase {
  const t = PHASE_PROGRESS_THRESHOLDS;
  if (progress.comparableShare >= t.compareToDetect) return 'PHASE_3_DETECT';
  if (progress.recognizedShare >= t.knowToCompare) return 'PHASE_2_COMPARE';
  return 'PHASE_1_KNOW';
}

export function phaseOfStudyDay(studyDayIndex: number, b: PhaseBoundaries): Phase {
  if (studyDayIndex <= b.knowEndsDay) return 'PHASE_1_KNOW';
  if (studyDayIndex <= b.compareEndsDay) return 'PHASE_2_COMPARE';
  return 'PHASE_3_DETECT';
}

export function modeOf(daysRemaining: number): StudyMode {
  if (daysRemaining <= 0) return 'NORMAL';
  if (daysRemaining <= FINAL_7_THRESHOLD_DAYS) return 'FINAL_7';
  if (daysRemaining <= FINAL_14_THRESHOLD_DAYS) return 'FINAL_14';
  if (daysRemaining < TRIAGE_THRESHOLD_DAYS) return 'TRIAGE';
  return 'NORMAL';
}

/** TRIAGE lọc bỏ LOW; dưới 15 ngày chỉ giữ HIGH (CLAUDE.md §4.1). */
export function allowedExamFrequencies(daysRemaining: number): ExamFrequency[] {
  if (daysRemaining > 0 && daysRemaining < HIGH_ONLY_THRESHOLD_DAYS) return ['HIGH'];
  if (daysRemaining > 0 && daysRemaining < TRIAGE_THRESHOLD_DAYS) return ['HIGH', 'MEDIUM'];
  return ['HIGH', 'MEDIUM', 'LOW'];
}

/**
 * `progress` khuyết → quay về cách tính theo lịch cũ. Chỉ còn dùng cho test đơn vị của
 * chính PhaseEngine; đường chạy thật luôn truyền `progress` vào (xem `loadContext`).
 */
export function computeTimeline(
  profile: LearnerProfile,
  now: Date,
  progress?: LearnerProgress,
): Timeline {
  const bh = profile.dayBoundaryHour;
  const todayKey = dayKey(now, bh);
  const hasDeadline = Boolean(profile.examDate);

  const daysRemaining = hasDeadline
    ? Math.max(0, calendarDaysBetween(now, profile.examDate!, bh))
    : NO_DEADLINE_DAYS;
  const totalStudyDays = hasDeadline
    ? Math.max(1, studyDaysBetween(profile.studyStartDate, profile.examDate!, profile.daysPerWeek, bh))
    : PLANNING_HORIZON_SESSIONS;
  const elapsedRaw = hasDeadline
    ? studyDaysBetween(profile.studyStartDate, now, profile.daysPerWeek, bh)
    : (progress?.studyDaysDone ?? 0);
  const daysElapsed = clamp(elapsedRaw, 0, totalStudyDays);
  const studyDayIndex = clamp(daysElapsed + 1, 1, Math.max(1, totalStudyDays));

  const phaseBoundaries = computePhaseBoundaries(totalStudyDays);
  const currentPhase = progress ? phaseOfProgress(progress) : phaseOfStudyDay(studyDayIndex, phaseBoundaries);
  const mode = modeOf(daysRemaining);

  const phaseEnd =
    currentPhase === 'PHASE_1_KNOW'
      ? phaseBoundaries.knowEndsDay
      : currentPhase === 'PHASE_2_COMPARE'
        ? phaseBoundaries.compareEndsDay
        : totalStudyDays;

  // §22 — màn chuyển giai đoạn hiện MỘT LẦN. Theo độ vững thì không còn "ngày chuyển giai
  // đoạn" nào cả, nên mốc là: giai đoạn hiện tại khác giai đoạn người học đã xem lần trước.
  const isPhaseTransitionDay = progress
    ? profile.lastPhaseSeen !== undefined && profile.lastPhaseSeen !== currentPhase
    : (phaseBoundaries.knowEndsDay > 0 && studyDayIndex === phaseBoundaries.knowEndsDay + 1) ||
      (phaseBoundaries.compareEndsDay > phaseBoundaries.knowEndsDay &&
        studyDayIndex === phaseBoundaries.compareEndsDay + 1);

  return {
    hasDeadline,
    totalStudyDays,
    daysElapsed,
    daysRemaining,
    studyDayIndex,
    currentPhase,
    mode,
    // Không có hạn chót thì "đáng lẽ phải đạt bao nhiêu" vô nghĩa — lấy đúng mức đang đạt,
    // để `shouldReplan` không báo trễ tiến độ với một cái mốc không tồn tại.
    progressExpected: hasDeadline
      ? (totalStudyDays === 0 ? 0 : clamp(daysElapsed / totalStudyDays, 0, 1))
      : clamp(progress?.recognizedShare ?? 0, 0, 1),
    phaseBoundaries,
    daysLeftInPhase: Math.max(0, phaseEnd - studyDayIndex + 1),
    isPhaseTransitionDay,
    todayKey,
    isExamOver: hasDeadline && daysRemaining <= 0,
    isNearExam: hasDeadline && daysRemaining > 0 && daysRemaining <= NEAR_EXAM_DAYS,
  };
}

/** Phase trước đó — dùng cho màn hình chuyển giai đoạn. */
export function previousPhase(phase: Phase): Phase | null {
  if (phase === 'PHASE_2_COMPARE') return 'PHASE_1_KNOW';
  if (phase === 'PHASE_3_DETECT') return 'PHASE_2_COMPARE';
  return null;
}
