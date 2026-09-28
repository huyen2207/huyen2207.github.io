import { masteryRepo } from '@/storage/repositories';
import type { EngineContext } from './context';

/**
 * Người học tự đánh dấu "mẫu này cần gặp thêm" (CLAUDE.md §14.1 — learnerFlag).
 * Chỉ bật/tắt một cờ; việc xếp lịch vẫn do ReviewEngine lo như mọi tín hiệu khác.
 */
export async function toggleStar(ctx: EngineContext, grammarId: string, now: Date): Promise<boolean> {
  const m = ctx.mastery.find((x) => x.grammarId === grammarId);
  if (!m) return false;
  const next = { ...m };
  const on = !m.starredAt;
  if (on) next.starredAt = now.toISOString();
  else delete next.starredAt;
  await masteryRepo.put(next);
  ctx.mastery = ctx.mastery.map((x) => (x.grammarId === grammarId ? next : x));
  return on;
}

export function isStarred(ctx: EngineContext | null, grammarId: string): boolean {
  return Boolean(ctx?.mastery.find((x) => x.grammarId === grammarId)?.starredAt);
}
