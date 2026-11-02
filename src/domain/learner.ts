import type { Phase, StudyMode } from './enums';

export interface LearnerProfile {
  id: 'me';
  /** Tuỳ chọn. Không khai → học đều đặn, không hạn chót (CLAUDE.md §4 sau sửa 2026-11-02). */
  examDate?: string;
  studyStartDate: string;
  availableMinutesPerDay: number;
  daysPerWeek: number;
  selfAssessedLevel: 'N2_JUST' | 'N2_SOLID' | 'N2_PLUS';
  grammarAlreadyStudiedCount: number;
  targetScoreBand: 'PASS' | 'COMFORTABLE' | 'HIGH';
  initialConfidence: 1 | 2 | 3 | 4 | 5;
  dayBoundaryHour: number;
  furiganaEnabled: boolean;
  /** Giai đoạn người học đã xem màn chuyển giai đoạn (§22 — chỉ hiện một lần). */
  lastPhaseSeen?: Phase;
  createdAt: string;
}

export interface PhaseBoundaries {
  knowEndsDay: number;
  compareEndsDay: number;
}

/** Độ vững hiện tại — đầu vào để PhaseEngine quyết định giai đoạn (§3.2 sau sửa). */
export interface LearnerProgress {
  /** Tỉ lệ mẫu trong kế hoạch đạt ≥ RECOGNIZED. */
  recognizedShare: number;
  /** Tỉ lệ mẫu trong kế hoạch đạt ≥ COMPARABLE. */
  comparableShare: number;
  /** Số ngày đã thực sự ngồi học (đếm từ lịch sử trả lời). */
  studyDaysDone: number;
}

/** Đầu ra DUY NHẤT của PhaseEngine. Không ai khác được tự tính phase. */
export interface Timeline {
  /** Có khai ngày thi hay không. UI dùng cờ này để ẩn/hiện mọi thứ về hạn chót. */
  hasDeadline: boolean;
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
