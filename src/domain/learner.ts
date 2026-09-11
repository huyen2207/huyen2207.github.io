import type { Phase, StudyMode } from './enums';

export interface LearnerProfile {
  id: 'me';
  examDate: string;
  studyStartDate: string;
  availableMinutesPerDay: number;
  daysPerWeek: number;
  selfAssessedLevel: 'N2_JUST' | 'N2_SOLID' | 'N2_PLUS';
  grammarAlreadyStudiedCount: number;
  targetScoreBand: 'PASS' | 'COMFORTABLE' | 'HIGH';
  initialConfidence: 1 | 2 | 3 | 4 | 5;
  dayBoundaryHour: number;
  furiganaEnabled: boolean;
  createdAt: string;
}

export interface PhaseBoundaries {
  knowEndsDay: number;
  compareEndsDay: number;
}

/** Đầu ra DUY NHẤT của PhaseEngine. Không ai khác được tự tính phase. */
export interface Timeline {
  totalStudyDays: number;
  daysElapsed: number;
  daysRemaining: number;
  studyDayIndex: number;
  currentPhase: Phase;
  mode: StudyMode;
  progressExpected: number;
  phaseBoundaries: PhaseBoundaries;
  daysLeftInPhase: number;
  isPhaseTransitionDay: boolean;
  todayKey: string;
  /** Đã qua ngày thi. Mọi nơi khác dùng cờ này thay vì so sánh daysRemaining. */
  isExamOver: boolean;
  /** daysUntilExam ≤ NEAR_EXAM_DAYS — bật bộ trọng số gần thi (CLAUDE.md §14.4). */
  isNearExam: boolean;
}

export interface StudyPlan {
  version: number;
  totalStudyDays: number;
  phaseBoundaries: PhaseBoundaries;
  coverageTarget: number;
  requiredGrammarIds: string[];
  newPerDay: number;
  generatedAt: string;
  reasonVi?: string;
}
