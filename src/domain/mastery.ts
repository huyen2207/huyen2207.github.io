import type { BaseRank, MasteryState, SkillDimension, EvidenceLevel, PlacementResult } from './enums';

export interface MasteryEvent {
  at: string;
  from: MasteryState;
  to: MasteryState;
  reason: string;
}

export interface GrammarMastery {
  grammarId: string;
  state: MasteryState;
  /** Bậc nền song song với state — cần thiết để "tụt 1 bậc" có định nghĩa (G-01). */
  baseRank: BaseRank | null;
  isStale: boolean;
  firstSeenAt?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  correctCount: number;
  wrongCount: number;
  distinctCorrectDays: number;
  streak: number;
  medianResponseTimeMs?: number;
  guessRate: number;
  confusedWith: Record<string, number>;
  stateHistory: MasteryEvent[];
  /** Bảo đảm "≥ 2 lần trước ngày thi" (G-04). */
  pinned: boolean;
  guaranteedSecondAt?: string;
  /** Cặp đang CONFUSED — chỉ thoát bằng contrast drill của ĐÚNG cặp này. */
  confusedPair?: string;
  learnCardDoneAt?: string;
  /**
   * Kết quả bài xếp lớp ở onboarding. CỐ Ý tách khỏi `state`:
   * CLAUDE.md §5.1 đòi ≥ 2 ngày khác nhau mới lên RECOGNIZED, mà xếp lớp chỉ diễn ra một ngày.
   * Vì vậy trường này KHÔNG bao giờ đổi `state`, chỉ dùng để xếp lại thứ tự LEARN.
   */
  placementResult?: PlacementResult;
}

export interface GrammarMetrics {
  grammarId: string;
  meaningAccuracy: number;
  formAccuracy: number;
  usageAccuracy: number;
  comparisonAccuracy: number;
  timedAccuracy: number;
  trapAccuracy: number;
  examStyleAccuracy: number;
  retentionScore: number | null;
  medianResponseTimeMs: number;
  speedIndex: number;
  confidenceCalibration: number | null;
  guessRate: number;
  recentErrorRate: number;
  evidence: EvidenceLevel;
  attemptCount: number;
  distinctDays: number;
  verifiedAttemptCount: number;
}

export interface SkillProfile {
  know: number | null;
  compare: number | null;
  detect: number | null;
  evidence: Record<SkillDimension, EvidenceLevel>;
  bottleneck: SkillDimension | null;
}

/**
 * Bằng chứng đưa vào MasteryEngine. Bộ đếm trên GrammarMastery không đủ để biểu diễn
 * các vị từ dạng "5 attempt gần nhất thuộc MINIMAL_PAIR" (CLAUDE.md §5.1), nên engine
 * nhận thêm lịch sử attempt của chính mẫu đó qua tham số (vẫn pure, vẫn không I/O).
 */
export interface MasteryEvidence {
  /** Attempt của mẫu này, cũ → mới, KHÔNG gồm attempt đang xét. */
  priorAttempts: import('./attempt').Attempt[];
  /** Đã thắng contrast drill của đúng cặp đang CONFUSED trong lượt này chưa. */
  contrastDrillWin?: { partnerId: string; correct: number; total: number };
  /** guessRate toàn cục 14 ngày — khoá thăng EXAM_READY khi > ngưỡng (analytics §4.3). */
  globalGuessRate?: number;
}
