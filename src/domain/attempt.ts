import type {
  Confidence,
  DeliveryMode,
  ErrorType,
  Phase,
  QuestionType,
  SessionBlockType,
} from './enums';

/** IMMUTABLE, APPEND-ONLY (arch §4.4, A6). Không sửa, không xoá. */
export interface Attempt {
  attemptId: string;
  sessionId: string;
  questionId: string;
  grammarId: string;
  phase: Phase;
  blockType: SessionBlockType;
  isTimed: boolean;

  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;

  errorType?: ErrorType;
  errorSource?: 'AUTO' | 'SELF_REPORTED';
  confusedWith?: string;

  responseTimeMs: number;
  confidence: Confidence;
  timestamp: string;

  /** Trường phụ trợ — không phá bất biến append-only. */
  questionType: QuestionType;
  delivery: DeliveryMode;
  verified: boolean;
  confidenceImputed?: boolean;
  subKind?: 'AXIS_ID' | 'CLUE_ID' | 'TRAP_ID';
  dayKey: string;
}
