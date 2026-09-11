/**
 * domain/enums.ts — NƠI DUY NHẤT khai báo enum của domain (CLAUDE.md §26).
 * Cấm khai báo lại các union này ở bất kỳ file nào khác.
 *
 * Nguồn: project-architecture.md §4.1 (LOCKED)
 *      + spec-consistency-check.md A-01..A-05, C-02, C-03 (đã duyệt theo phương án A).
 */

/* ─────────────── LOCKED — project-architecture.md §4.1 ─────────────── */

export const PHASES = ['PHASE_1_KNOW', 'PHASE_2_COMPARE', 'PHASE_3_DETECT'] as const;
export type Phase = (typeof PHASES)[number];

export const MASTERY_STATES = [
  'UNSEEN',
  'INTRODUCED',
  'RECOGNIZED',
  'SHAKY',
  'CONFUSED',
  'COMPARABLE',
  'EXAM_READY',
] as const;
export type MasteryState = (typeof MASTERY_STATES)[number];

/** Bậc nền của thang thăng/tụt cấp. SHAKY và CONFUSED là CỜ, không nằm trên thang. */
export const BASE_RANKS = ['INTRODUCED', 'RECOGNIZED', 'COMPARABLE', 'EXAM_READY'] as const;
export type BaseRank = (typeof BASE_RANKS)[number];

export const CONFIDENCES = ['GUESS', 'UNSURE', 'CONFIDENT'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const ERROR_TYPES = [
  'MEANING_ERROR',
  'FORM_ERROR',
  'NUANCE_ERROR',
  'CONSTRAINT_ERROR',
  'SIMILAR_GRAMMAR_CONFUSION',
  'CONTEXT_ERROR',
  'COLLOCATION_ERROR',
  'CARELESS_ERROR',
  'TIME_PRESSURE_ERROR',
  'TRAP_ERROR',
] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

/**
 * 8 giá trị LOCKED + 3 giá trị duyệt theo spec-consistency-check C-02 phương án A.
 * MINI_SENTENCE_COMPLETION bị HOÃN sau MVP (kéo theo input tiếng Nhật + normalizeForGrading).
 */
export const QUESTION_TYPES = [
  'MEANING_MC',
  'FORM_MC',
  'MINIMAL_PAIR',
  'WHY_NOT_OTHER',
  'CLOZE_MC',
  'SENTENCE_BUILD',
  'TEXT_GRAMMAR',
  'TRAP_ID',
  'GRAMMAR_RECOGNITION',
  'VALID_OR_INVALID',
  'CONTEXT_MATCH',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const GRAMMAR_FAMILIES = [
  'LIMITATION',
  'CONCESSION',
  'CAUSE',
  'CONDITION',
  'DEGREE',
  'EMPHASIS',
  'TIME',
  'EVALUATION',
  'ASSUMPTION',
  'NEGATION',
  'PURPOSE',
  'ADDITION',
  'STANCE',
  'INEVITABILITY',
] as const;
export type GrammarFamily = (typeof GRAMMAR_FAMILIES)[number];

export const RELATION_TYPES = [
  'similarTo',
  'contrastsWith',
  'oftenConfusedWith',
  'sameFunctionGroup',
  'prerequisite',
  'registerVariantOf',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

/** Quan hệ đối xứng: khai một chiều, repository tự sinh chiều ngược (grammar-schema G2). */
export const SYMMETRIC_RELATION_TYPES: readonly RelationType[] = [
  'similarTo',
  'contrastsWith',
  'oftenConfusedWith',
  'sameFunctionGroup',
  'registerVariantOf',
];

/** 9 giá trị LOCKED + 3 duyệt theo C-03 phương án A → 12. */
export const TRAP_TYPES = [
  'LOOKALIKE_FORM',
  'MEANING_OVERLAP',
  'CONNECTION_MISMATCH',
  'SUBJECT_MISMATCH',
  'REGISTER_MISMATCH',
  'POLARITY_TRAP',
  'VOLITION_TRAP',
  'CONTEXT_REVERSAL',
  'COLLOCATION_TRAP',
  'PART_OF_SPEECH_TRAP',
  'FAMILIAR_WORD_TRAP',
  'NUANCE_TRAP',
] as const;
export type TrapType = (typeof TRAP_TYPES)[number];

export const SESSION_BLOCK_TYPES = [
  'REVIEW',
  'LEARN',
  'RECALL',
  'COMPARE',
  'APPLY',
  'ANALYZE_ERROR',
  'SCHEDULE',
] as const;
export type SessionBlockType = (typeof SESSION_BLOCK_TYPES)[number];

/** Thứ tự block trong ngày — CỐ ĐỊNH, không phụ thuộc phase (learning-engine §8.3). */
export const SESSION_BLOCK_ORDER: readonly SessionBlockType[] = SESSION_BLOCK_TYPES;

export const VERIFICATION_STATUSES = ['VERIFIED', 'NEEDS_REVIEW', 'DRAFT'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const EXAM_FREQUENCIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type ExamFrequency = (typeof EXAM_FREQUENCIES)[number];

/** Kết quả bài xếp lớp. KHÔNG phải MasteryState — chỉ là tín hiệu xếp thứ tự LEARN (P5). */
export const PLACEMENT_RESULTS = ['KNOWN', 'UNKNOWN'] as const;
export type PlacementResult = (typeof PLACEMENT_RESULTS)[number];

export const REGISTERS = ['FORMAL_WRITTEN', 'NEUTRAL', 'SPOKEN', 'LITERARY', 'ARCHAIC'] as const;
export type Register = (typeof REGISTERS)[number];

/** Chế độ theo LỊCH THI. Khác hoàn toàn DeliveryMode (C-04). */
export const STUDY_MODES = ['NORMAL', 'TRIAGE', 'FINAL_14', 'FINAL_7'] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

/* ─────────────── PROPOSED — duyệt theo spec-consistency-check §3 ─────────────── */

/** A-01 */
export const SKILL_DIMENSIONS = ['KNOW', 'COMPARE', 'DETECT'] as const;
export type SkillDimension = (typeof SKILL_DIMENSIONS)[number];

/** A-02 — 12 trục so sánh */
export const COMPARISON_AXES = [
  'MEANING',
  'NUANCE',
  'CONNECTION',
  'SUBJECT',
  'REGISTER',
  'RESTRICTION',
  'TYPICAL_CONTEXT',
  'KEY_CLUE',
  'SPEAKER_INTENT',
  'STRENGTH',
  'TIME_RELATION',
  'POLARITY_TENDENCY',
] as const;
export type ComparisonAxis = (typeof COMPARISON_AXES)[number];

/** A-03 — 8 loại manh mối, dùng cho câu 「決め手は？」 */
export const CLUE_KINDS = [
  'MEANING',
  'CONNECTION',
  'RESTRICTION',
  'CONTEXT',
  'NUANCE',
  'REGISTER',
  'COLLOCATION',
  'POSITION',
] as const;
export type ClueKind = (typeof CLUE_KINDS)[number];

/** A-04 — mức feedback + áp lực thời gian khi GIAO bài. Không phải StudyMode. */
export const DELIVERY_MODES = ['STUDY', 'PRACTICE', 'TIMED', 'MOCK'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

/** A-05 — 8 mã, bảo toàn đủ ma trận 3 confidence × 2 kết quả + TIMEOUT (C-06). */
export const GRADE_OUTCOMES = [
  'CORRECT_CONFIDENT',
  'CORRECT_UNSURE',
  'CORRECT_GUESS',
  'INCORRECT_MISCONCEPTION',
  'INCORRECT_KNOWN_CONFUSION',
  'INCORRECT_NEW_CONFUSION',
  'INCORRECT_OTHER',
  'TIMEOUT',
] as const;
export type GradeOutcome = (typeof GRADE_OUTCOMES)[number];

export const GRADE_FLAGS = [
  'MISCONCEPTION',
  'LUCKY',
  'TOO_SLOW',
  'SUSPICIOUSLY_FAST',
  'KNOWN_CONFUSION',
  'CLUE_MISS',
  'TRAP_HIT',
  'FULL_ORDER_CORRECT',
  'UNVERIFIED_CONTENT',
  'SAME_SESSION_REPEAT',
] as const;
export type GradeFlag = (typeof GRADE_FLAGS)[number];

export const EVIDENCE_LEVELS = ['NONE', 'THIN', 'OK', 'SOLID'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const READINESS_BANDS = ['ALERT', 'BUILDING', 'ON_TRACK', 'SOLID', 'READY'] as const;
export type ReadinessBand = (typeof READINESS_BANDS)[number];

export const DRILL_KINDS = [
  'CONFUSION_PAIR',
  'ERROR_TYPE',
  'FAMILY',
  'SPEED',
  'TRAP_TYPE',
  'REVIEW_TOP',
  'LEARN',
  'CALIBRATION',
] as const;
export type DrillKind = (typeof DRILL_KINDS)[number];

export const RESTRICTION_KINDS = [
  'SUBJECT',
  'POLARITY',
  'VOLITION',
  'TENSE',
  'ANIMACY',
  'SCOPE',
  'OTHER',
] as const;
export type RestrictionKind = (typeof RESTRICTION_KINDS)[number];

export const SOURCE_KINDS = [
  'TEXTBOOK',
  'WORKBOOK',
  'PAST_EXAM',
  'DICTIONARY',
  'AI_GENERATED',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const TRUST_LEVELS = ['PRIMARY', 'SECONDARY', 'UNVERIFIED'] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

/* ─────────────── Thang bậc & tiện ích thứ tự ─────────────── */

/** Thứ hạng dùng để so sánh "state ≥ RECOGNIZED". SHAKY/CONFUSED lấy theo baseRank. */
export const BASE_RANK_ORDER: Record<BaseRank, number> = {
  INTRODUCED: 1,
  RECOGNIZED: 2,
  COMPARABLE: 3,
  EXAM_READY: 4,
};

export function rankOf(baseRank: BaseRank): number {
  return BASE_RANK_ORDER[baseRank];
}
