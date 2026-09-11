import type {
  ClueKind,
  ComparisonAxis,
  ErrorType,
  Phase,
  QuestionType,
  SkillDimension,
  TrapType,
  VerificationStatus,
} from './enums';

export interface Choice {
  id: string;
  textJa: string;
  isCorrect: boolean;
  /** BẮT BUỘC nếu !isCorrect — validator V2 chặn build nếu thiếu. */
  wrongBecause?: ErrorType;
  whyWrongVi?: string;
  confusedWithGrammarId?: string;
  violatedAxis?: ComparisonAxis;
}

export interface TrapAnnotation {
  trapType: TrapType;
  trapExplanationVi: string;
  fastestPathVi: string;
  strength?: 1 | 2 | 3;
}

export interface SolvingStep {
  order: number;
  labelJa: string;
  labelVi: string;
}

export interface Clue {
  kind: ClueKind;
  textJa?: string;
  span?: [number, number];
  noteVi: string;
}

/** Mảnh ghép cho 問題6 文の組み立て. Chấm theo ô ★ (exercise-engine §6.4). */
export interface BuildFragment {
  id: string;
  textJa: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  phaseHint: Phase[];
  targetGrammarIds: string[];
  stemJa: string;
  /**
   * Nghĩa tiếng Việt của CÂU HOÀN CHỈNH — tức câu đã điền đáp án đúng vào chỗ trống.
   * Chỉ hiện SAU khi người học đã trả lời, để không làm lộ đáp án (CLAUDE.md §11).
   * Câu hỏi siêu dữ liệu (MEANING_MC) không có câu thật nên bỏ trống.
   */
  stemVi?: string;
  contextJa?: string;
  choices: Choice[];
  correctChoiceId: string;

  explanationVi: string;
  keyClueVi: string;
  solvingStrategy: SolvingStep[];
  trap?: TrapAnnotation;

  targetTimeMs: number;
  sourceId: string;
  sourcePage?: string;
  verificationStatus: VerificationStatus;

  testedSkill: SkillDimension;
  decisiveClue?: Clue;
  difficultyStatic: 1 | 2 | 3 | 4 | 5;
  comparisonSetId?: string;

  /** SENTENCE_BUILD: mảnh ghép + id mảnh đúng ở ô ★. */
  fragments?: BuildFragment[];
  starFragmentId?: string;
  /** Vị trí ô ★ trong dãy mảnh ghép (0-based). Chấm chỉ so mảnh ở ô này. */
  starSlotIndex?: number;
  /** TEXT_GRAMMAR: nhóm câu dùng chung contextJa. */
  passageId?: string;
}
