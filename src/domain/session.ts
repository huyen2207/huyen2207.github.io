import type { DeliveryMode, Phase, SessionBlockType, StudyMode } from './enums';

export type SessionItem =
  | { kind: 'LEARN_CARD'; grammarId: string }
  | { kind: 'QUESTION'; questionId: string; timed: boolean; delivery: DeliveryMode; grammarId: string }
  | { kind: 'COMPARE_SET'; comparisonSetId: string }
  | { kind: 'TRAP_DRILL'; questionId: string; delivery: DeliveryMode; grammarId: string }
  | { kind: 'ERROR_REVIEW'; attemptIds: string[]; noteKey: string; params?: Record<string, string | number> };

export interface SessionBlock {
  type: SessionBlockType;
  budgetMinutes: number;
  items: SessionItem[];
  completed: boolean;
  /** Số item ước lượng bị thiếu do kho câu hỏi cạn (exercise-engine D5). */
  shortfall?: number;
}

export interface AdaptationNote {
  ruleId: string;
  messageKey: string;
  params?: Record<string, string | number>;
}

export interface DailySession {
  sessionId: string;
  date: string;
  phase: Phase;
  mode: StudyMode;
  plannedMinutes: number;
  blocks: SessionBlock[];
  adaptationNotes: AdaptationNote[];
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  startedAt?: string;
  completedAt?: string;
  /** Con trỏ tiến độ để tiếp tục giữa chừng (arch §9 /today). */
  cursor: { blockIndex: number; itemIndex: number };
  /** Câu đã sai trong ngày, chờ chèn vào cuối ANALYZE_ERROR (learning-engine §11). */
  redoQueue: string[];
  seed: number;
}
