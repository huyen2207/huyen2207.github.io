/**
 * Thẻ ôn do NGƯỜI HỌC tự đánh dấu.
 *
 * Cố ý KHÔNG đụng vào `priority` của ReviewEngine (CLAUDE.md §14.1) và KHÔNG tạo ra một
 * thuật toán ôn song song — §19.1 cấm để người học chỉnh tay thuật toán review.
 * Đây chỉ là một LỐI VÀO nhanh: chọn sẵn nội dung, còn việc chấm điểm, lên trạng thái và
 * xếp lịch ôn vẫn đi qua đúng một engine như mọi câu khác.
 */
export type FlashcardKind = 'GRAMMAR' | 'COMPARISON';

export interface Flashcard {
  /** `${kind}:${refId}` — một nội dung chỉ nằm trong bộ thẻ một lần. */
  id: string;
  kind: FlashcardKind;
  /** grammarId hoặc comparisonSetId. */
  refId: string;
  addedAt: string;
}

export function flashcardId(kind: FlashcardKind, refId: string): string {
  return `${kind}:${refId}`;
}
