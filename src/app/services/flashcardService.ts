import type { Flashcard, FlashcardKind } from '@/domain/flashcard';
import { flashcardId } from '@/domain/flashcard';
import type { SessionItem } from '@/domain/session';
import { flashcardRepo } from '@/storage/repositories';
import { getComparisonSet, getGrammar } from '@/content/repository';
import { buildAdHocDrill } from '@/engines/session';
import { hashString } from '@/shared/prng';
import { makeSessionEnv } from './sessionService';
import type { EngineContext } from './context';

export type { Flashcard, FlashcardKind };
export { flashcardId };

export async function listFlashcards(): Promise<Flashcard[]> {
  // Nội dung có thể bị gỡ khỏi kho (import đè, sửa dữ liệu) — bỏ thẻ mồ côi.
  const rows = await flashcardRepo.all();
  return rows.filter((c) => (c.kind === 'GRAMMAR' ? getGrammar(c.refId) : getComparisonSet(c.refId)));
}

/** Bật/tắt một thẻ. Trả về trạng thái SAU khi đổi. */
export async function toggleFlashcard(kind: FlashcardKind, refId: string, now: Date): Promise<boolean> {
  const id = flashcardId(kind, refId);
  if (await flashcardRepo.has(id)) {
    await flashcardRepo.remove(id);
    return false;
  }
  await flashcardRepo.put({ id, kind, refId, addedAt: now.toISOString() });
  return true;
}

/**
 * Luyện trên bộ thẻ đã đánh dấu.
 *
 * Vẫn đi qua `buildAdHocDrill` như mọi drill khác — nghĩa là vẫn chịu H9 (không hỏi mẫu
 * chưa dạy) và câu trả lời vẫn được chấm, ghi `Attempt`, cập nhật mastery theo đúng một
 * engine. Bộ thẻ chỉ quyết định LẤY NỘI DUNG NÀO, không quyết định cách đánh giá.
 */
export function buildFlashcardDrill(ctx: EngineContext, cards: Flashcard[], count: number): SessionItem[] {
  const grammarIds = new Set<string>();
  for (const c of cards) {
    if (c.kind === 'GRAMMAR') grammarIds.add(c.refId);
    else getComparisonSet(c.refId)?.grammarIds.forEach((g) => grammarIds.add(g));
  }
  if (grammarIds.size === 0) return [];

  const introduced = ctx.mastery.filter((m) => m.state !== 'UNSEEN').map((m) => m.grammarId);
  const env = makeSessionEnv(ctx, hashString(`flashcards|${ctx.timeline.todayKey}|${cards.length}`));
  return buildAdHocDrill('REVIEW_TOP', { grammarIds: [...grammarIds] }, env, count, introduced).items;
}
