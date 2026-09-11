import type { Phase, QuestionType } from '@/domain/enums';

/**
 * Mục tiêu responseTime theo dạng câu — CLAUDE.md §13 (chốt cứng).
 * Ba loại duyệt thêm (C-02) lấy mốc theo bản chất nhận diện, cùng nhóm với MEANING_MC.
 */
export const TARGET_RT_MS: Record<QuestionType, { phase2: number; phase3: number }> = {
  MEANING_MC: { phase2: 20_000, phase3: 12_000 },
  FORM_MC: { phase2: 20_000, phase3: 12_000 },
  GRAMMAR_RECOGNITION: { phase2: 20_000, phase3: 12_000 },
  VALID_OR_INVALID: { phase2: 20_000, phase3: 12_000 },
  CONTEXT_MATCH: { phase2: 25_000, phase3: 15_000 },
  MINIMAL_PAIR: { phase2: 30_000, phase3: 20_000 },
  WHY_NOT_OTHER: { phase2: 30_000, phase3: 20_000 },
  TRAP_ID: { phase2: 30_000, phase3: 20_000 },
  CLOZE_MC: { phase2: 50_000, phase3: 35_000 },
  SENTENCE_BUILD: { phase2: 90_000, phase3: 60_000 },
  TEXT_GRAMMAR: { phase2: 90_000, phase3: 60_000 },
};

export function targetRt(type: QuestionType, phase: Phase): number {
  const row = TARGET_RT_MS[type];
  return phase === 'PHASE_3_DETECT' ? row.phase3 : row.phase2;
}

/**
 * Ngân sách phần 文法 của đề thật: 10×問題5 + 5×問題6 + 5×問題7 = ĐÚNG 20 phút (CLAUDE.md §13).
 * Lưu ý: đây là ngân sách CHO PHÉP trong phòng thi, khác với MỤC TIÊU tốc độ Phase 3 ở
 * TARGET_RT_MS (35s/60s/60s) — mục tiêu luyện tập luôn chặt hơn ngân sách thi.
 */
export const MOCK_STRUCTURE: ReadonlyArray<{ type: QuestionType; count: number; perQuestionMs: number }> = [
  { type: 'CLOZE_MC', count: 10, perQuestionMs: 40_000 },
  { type: 'SENTENCE_BUILD', count: 5, perQuestionMs: 80_000 },
  { type: 'TEXT_GRAMMAR', count: 5, perQuestionMs: 80_000 },
];

export const MOCK_TOTAL_MS = MOCK_STRUCTURE.reduce((s, p) => s + p.count * p.perQuestionMs, 0);

/** Rapid review (review-engine §8): chỉ nhận diện, ≤ 10s/câu, chỉ Phase 3. */
export const RAPID_REVIEW_MS = 10_000;
