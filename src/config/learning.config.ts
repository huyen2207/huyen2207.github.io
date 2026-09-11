import type {
  BaseRank,
  Confidence,
  ExamFrequency,
  MasteryState,
  SkillDimension,
} from '@/domain/enums';

/**
 * learning.config.ts — MỌI hằng số học thuật của project (CLAUDE.md §0.5, §17.5).
 * Magic number nằm ngoài file này là vi phạm luật.
 * Bảng đối chiếu đầy đủ: spec-consistency-check.md §5.2.
 */

/* ── Metric (learning-engine §4) ───────────────────────────── */
export const METRIC_SHRINKAGE_ALPHA = 4;
export const RETENTION_GAP_DAYS = 3;
export const RT_OUTLIER_MS = 180_000;
export const ERROR_HALF_LIFE_DAYS = 7;
export const CONFUSION_SATURATION = 6;
export const SLOW_FACTOR = 2.5;
export const METRIC_WINDOW_DAYS = 21;
export const ERROR_WINDOW_DAYS = 14;
export const RECENT_ATTEMPTS_WINDOW = 12;
export const GUESS_WINDOW = 6;
export const STABILITY_WINDOW_DAYS = 7;
/** Sàn cửa sổ chỉ số khi gần thi (learning-engine §4.1). */
export const MIN_METRIC_WINDOW_DAYS = 7;
/** Hằng số trình bày, không phải hằng số học thuật. */
export const MS_PER_SECOND = 1000;
export const ONE_DECIMAL = 10;
/** Mốc "chưa từng ôn" khi tie-break — lớn hơn mọi số ngày có thật. */
export const NEVER_REVIEWED_SENTINEL = 100000;

export const CONFIDENCE_EXPECTED: Record<Confidence, number> = {
  GUESS: 0.25,
  UNSURE: 0.6,
  CONFIDENT: 0.9,
};

export const EVIDENCE_THRESHOLDS = {
  thinAttempts: 4,
  thinDistinctDays: 2,
  solidAttempts: 8,
  solidDistinctDays: 3,
} as const;

/* ── Ba chiều KNOW/COMPARE/DETECT (learning-engine §5.1) ────── */
export const SKILL_WEIGHTS: Record<SkillDimension, Record<string, number>> = {
  KNOW: { meaningAccuracy: 0.4, formAccuracy: 0.3, retention: 0.2, usageAccuracy: 0.1 },
  COMPARE: { comparisonAccuracy: 0.6, confusionFree: 0.25, usageAccuracy: 0.15 },
  DETECT: { examStyleAccuracy: 0.35, trapAccuracy: 0.25, timedAccuracy: 0.2, speedIndex: 0.2 },
};

/* ── Mastery (CLAUDE.md §5.1, §5.2) ─────────────────────────── */
export const MASTERY_RULES = {
  recognizeMinCorrect: 3,
  recognizeMinDistinctDays: 2,
  recognizeLastNAllCorrect: 2,
  compareWindow: 5,
  compareMinCorrect: 4,
  compareMinDistinctDays: 2,
  compareConfusionFreeDays: 7,
  examReadyWindow: 6,
  examReadyMinCorrect: 5,
  examReadyMinConfidentRatio: 0.7,
  examReadySurvivalGapDays: 3,
  confusionThreshold: 2,
  confusionWindowDays: 14,
  exitConfusedStrict: 3,
  exitConfusedWindow: 5,
  exitConfusedMinCorrect: 4,
  /** analytics-engine §4.3 — guessRate cao khoá thăng EXAM_READY. */
  guessRateExamReadyLock: 0.3,
} as const;

/* ── Review (CLAUDE.md §14) ─────────────────────────────────── */
export const PRIORITY_WEIGHTS = {
  stateWeight: 0.25,
  errorPressure: 0.2,
  confusionPressure: 0.15,
  decay: 0.15,
  speedPenalty: 0.1,
  guessPenalty: 0.1,
  examFrequencyWeight: 0.05,
  recencyPenalty: -0.1,
} as const;

/** CLAUDE.md §14.4 — tái cân bằng khi daysUntilExam ≤ 21. */
export const PRIORITY_WEIGHTS_NEAR_EXAM = {
  stateWeight: 0.25,
  errorPressure: 0.25,
  confusionPressure: 0.25,
  decay: 0.05,
  trapPressure: 0.2,
  speedPenalty: 0.1,
  guessPenalty: 0.1,
  examFrequencyWeight: 0.05,
  recencyPenalty: -0.1,
} as const;

export const NEAR_EXAM_DAYS = 21;

export const STATE_WEIGHT: Record<MasteryState, number> = {
  UNSEEN: 0.0,
  INTRODUCED: 0.6,
  RECOGNIZED: 0.5,
  SHAKY: 0.9,
  CONFUSED: 1.0,
  COMPARABLE: 0.3,
  EXAM_READY: 0.1,
};

export const EXAM_FREQUENCY_WEIGHT: Record<ExamFrequency, number> = {
  HIGH: 1.0,
  MEDIUM: 0.6,
  LOW: 0.2,
};

export const PHASE_FIT = {
  phase1Unrecognized: 1.3,
  phase2Confused: 1.4,
  phase3TrapHistory: 1.4,
  max: 1.4,
} as const;

export const ERROR_SATURATION = 3;
export const TRAP_SATURATION = 3;

/** CLAUDE.md §14.2 — interval cơ sở (ngày). G-02 bổ sung 3 dòng chặt hơn. */
export const BASE_INTERVAL_DAYS: Record<string, number> = {
  WRONG: 1,
  CORRECT_GUESS: 1,
  CORRECT_UNSURE: 2,
  CORRECT_CONFIDENT_INTRODUCED: 2,
  CORRECT_CONFIDENT_RECOGNIZED: 4,
  CORRECT_CONFIDENT_COMPARABLE: 7,
  CORRECT_CONFIDENT_EXAM_READY: 12,
  CORRECT_SHAKY: 1,
  CORRECT_CONFUSED: 1,
};

/** CLAUDE.md §14.3 */
export const COMPRESSION = {
  farThresholdDays: 21,
  nearThresholdDays: 7,
  farFactor: 1.0,
  midFactor: 0.6,
  nearFactor: 0.4,
  capRatio: 0.4,
} as const;

export const MIN_ENCOUNTERS_BEFORE_EXAM = 2;
/** Ràng buộc đa dạng khi xếp hàng đợi ôn (review-engine §7). */
export const REVIEW_FAMILY_DIVISOR = 2;
export const REVIEW_PAIR_DIVISOR = 3;
export const GUARANTEED_SECOND_RATIO = 0.25;

/* ── Session (learning-engine §8, §10, §12, §15) ─────────────── */
export const NEW_PER_DAY_HARD_CAP = 8;
export const BACKLOG_FREEZE_FACTOR = 1.5;
export const ANALYZE_MIN_MINUTES = 3;
export const ANALYZE_MIN_SESSION_MINUTES = 15;
export const LEARN_CARD_MS = 150_000;
export const OVERHEAD_MS = 4_000;
export const SESSION_MAX_MINUTES = 120;
export const SESSION_MIN_MINUTES = 10;
export const SESSION_OVERRUN_TOLERANCE = 1.15;
export const FINAL_7_LOAD_FACTOR = 0.75;
export const MAX_ADAPTATIONS_PER_DAY = 3;
export const MAX_BLOCK_RATIO = 0.55;
export const RECOVERY_GAP_DAYS = 3;
export const KNOW_DEBT_MAX_EXTRA_RATIO = 0.2;

export const RECOVERY_RATIOS = {
  REVIEW: 0.85,
  RECALL: 0.1,
  ANALYZE_ERROR: 0.05,
  LEARN: 0,
  COMPARE: 0,
  APPLY: 0,
} as const;

export const RECOVERY_WIN_QUESTIONS = 3;

/* ── Exercise (exercise-engine §3, §6, §9) ──────────────────── */
export const COOLDOWN_DAYS = 7;
/** exercise-engine §8 K5 — mock tránh câu đã gặp trong 14 ngày (chặt hơn cooldown thường). */
export const MOCK_COOLDOWN_DAYS = 14;
/** exercise-engine §8 K5 — sàn tỉ lệ câu nhắm grammar examFrequency = HIGH trong một đề mock. */
export const MOCK_MIN_HIGH_RATIO = 0.6;
export const DESIRED_SUCCESS_RATE = 0.75;
export const EXPOSURE_SATURATION = 4;
export const FAST_FLOOR_RATIO = 0.25;
export const EMPIRICAL_TRUST_N = 6;

export const SELECTION_WEIGHTS = {
  masteryFit: 0.3,
  errorTargeting: 0.2,
  confusionTargeting: 0.15,
  skillFit: 0.15,
  noveltyBonus: 0.1,
  examValue: 0.1,
  overExposurePenalty: -0.2,
  difficultyMismatch: -0.1,
} as const;

/* ── Analytics (analytics-engine) ───────────────────────────── */
export const LEARNED_EDGE_MIN = 2;
export const RESOLVE_STREAK = 3;
export const CONFUSION_PAIR_MIN = 2;
export const NOTEBOOK_MAX_LINES = 7;
export const NOTEBOOK_ERROR_TYPE_MIN_N = 5;
export const NOTEBOOK_ERROR_TYPE_MIN_RATIO = 0.2;
export const NOTEBOOK_NUANCE_MIN = 5;
export const SLOW_TYPE_RATIO_THRESHOLD = 1.15;
export const MAX_RECOMMENDATIONS = 3;

/** CLAUDE.md §23 — trọng số ERS. */
export const ERS_WEIGHTS = {
  coverage: 0.25,
  retention: 0.2,
  comparisonAccuracy: 0.2,
  trapDetection: 0.15,
  timedAccuracy: 0.1,
  speedIndex: 0.1,
} as const;

export const ERS_MIN_COVERAGE = 0.2;
export const ERS_STABILITY_FLOOR = 0.85;
export const ERS_STABILITY_CEIL = 1.0;

export const ERS_BANDS: ReadonlyArray<{ min: number; band: 'ALERT' | 'BUILDING' | 'ON_TRACK' | 'SOLID' | 'READY' }> = [
  { min: 90, band: 'READY' },
  { min: 75, band: 'SOLID' },
  { min: 60, band: 'ON_TRACK' },
  { min: 40, band: 'BUILDING' },
  { min: 0, band: 'ALERT' },
];

/* ── Adaptation (CLAUDE.md §15) ─────────────────────────────── */
export const ADAPTATION_THRESHOLDS = {
  meaningAccuracyLow: 0.7,
  confusionRateHigh: 0.25,
  accuracyHighForSpeed: 0.85,
  slowRtFactor: 1.5,
  guessRateHigh: 0.3,
  formErrorRateHigh: 0.2,
  contextErrorRateHigh: 0.2,
} as const;

/* ── Roadmap ────────────────────────────────────────────────── */
export const REPLAN_PROGRESS_DRIFT = 0.15;
export const KNOW_DEBT_CEILING_STREAK_DAYS = 5;

/* ── Ranh giới trạng thái ───────────────────────────────────── */
export const DEFAULT_DAY_BOUNDARY_HOUR = 4;
export const BACKUP_REMINDER_DAYS = 7;

export const BASE_RANK_FOR_STATE: Record<MasteryState, BaseRank | null> = {
  UNSEEN: null,
  INTRODUCED: 'INTRODUCED',
  RECOGNIZED: 'RECOGNIZED',
  COMPARABLE: 'COMPARABLE',
  EXAM_READY: 'EXAM_READY',
  SHAKY: null,
  CONFUSED: null,
};

/* ─────────────── Bài xếp lớp ở onboarding (P5) ─────────────── */

/** Số câu của bài xếp lớp. ~15s/câu ⇒ khoảng 10 phút. */
export const PLACEMENT_QUESTION_COUNT = 40;

/**
 * Chỉ tính là ĐÃ BIẾT khi đúng VÀ không phải đoán.
 * Đúng do đoán thì không phải bằng chứng (cùng tinh thần với CLAUDE.md §12).
 */
export const PLACEMENT_KNOWN_REQUIRES_NON_GUESS = true;
