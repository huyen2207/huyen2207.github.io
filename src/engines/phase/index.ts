import type { LearnerProfile, PhaseBoundaries, Timeline } from '@/domain/learner';
import type { ExamFrequency, Phase, StudyMode } from '@/domain/enums';
import {
  FINAL_14_THRESHOLD_DAYS,
  FINAL_7_THRESHOLD_DAYS,
  HIGH_ONLY_THRESHOLD_DAYS,
  MIN_DETECT_DAYS,
  MIN_TOTAL_DAYS_FOR_DETECT_FLOOR,
  PHASE_RATIO_TABLE,
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

export function computeTimeline(profile: LearnerProfile, now: Date): Timeline {
  const bh = profile.dayBoundaryHour;
  const todayKey = dayKey(now, bh);

  const daysRemaining = Math.max(0, calendarDaysBetween(now, profile.examDate, bh));
  const totalStudyDays = Math.max(
    1,
    studyDaysBetween(profile.studyStartDate, profile.examDate, profile.daysPerWeek, bh),
  );
  const elapsedRaw = studyDaysBetween(profile.studyStartDate, now, profile.daysPerWeek, bh);
  const daysElapsed = clamp(elapsedRaw, 0, totalStudyDays);
  const studyDayIndex = clamp(daysElapsed + 1, 1, Math.max(1, totalStudyDays));

  const phaseBoundaries = computePhaseBoundaries(totalStudyDays);
  const currentPhase = phaseOfStudyDay(studyDayIndex, phaseBoundaries);
  const mode = modeOf(daysRemaining);

  const phaseEnd =
    currentPhase === 'PHASE_1_KNOW'
      ? phaseBoundaries.knowEndsDay
      : currentPhase === 'PHASE_2_COMPARE'
        ? phaseBoundaries.compareEndsDay
        : totalStudyDays;

  const isPhaseTransitionDay =
    (phaseBoundaries.knowEndsDay > 0 && studyDayIndex === phaseBoundaries.knowEndsDay + 1) ||
    (phaseBoundaries.compareEndsDay > phaseBoundaries.knowEndsDay &&
      studyDayIndex === phaseBoundaries.compareEndsDay + 1);

  return {
    totalStudyDays,
    daysElapsed,
    daysRemaining,
    studyDayIndex,
    currentPhase,
    mode,
    progressExpected: totalStudyDays === 0 ? 0 : clamp(daysElapsed / totalStudyDays, 0, 1),
    phaseBoundaries,
    daysLeftInPhase: Math.max(0, phaseEnd - studyDayIndex + 1),
    isPhaseTransitionDay,
    todayKey,
    isExamOver: daysRemaining <= 0,
    isNearExam: daysRemaining > 0 && daysRemaining <= NEAR_EXAM_DAYS,
  };
}

/** Phase trước đó — dùng cho màn hình chuyển giai đoạn. */
export function previousPhase(phase: Phase): Phase | null {
  if (phase === 'PHASE_2_COMPARE') return 'PHASE_1_KNOW';
  if (phase === 'PHASE_3_DETECT') return 'PHASE_2_COMPARE';
  return null;
}
