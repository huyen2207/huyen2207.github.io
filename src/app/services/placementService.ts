import type { Question } from '@/domain/question';
import type { EngineContext } from './context';
import { buildPlacementQuiz, applyPlacement, type PlacementAnswer } from '@/engines/placement';

export type { PlacementAnswer };
import { listRawGrammar, listQuestions } from '@/content/repository';
import { masteryRepo, metaRepo } from '@/storage/repositories';
import { gradeAnswer, persistAnswer } from './answerService';
import type { Confidence } from '@/domain/enums';
import type { DailySession } from '@/domain/session';

/** Khoá meta đánh dấu người học đã làm (hoặc đã bỏ qua) bài xếp lớp. */
export const PLACEMENT_DONE_KEY = 'placementDoneAt';

export function placementQuestions(): Question[] {
  return buildPlacementQuiz({ grammars: listRawGrammar(), questions: listQuestions() });
}

export async function isPlacementDone(): Promise<boolean> {
  return Boolean(await metaRepo.get(PLACEMENT_DONE_KEY));
}

export async function markPlacementDone(now: Date): Promise<void> {
  await metaRepo.set(PLACEMENT_DONE_KEY, now.toISOString());
}

/**
 * Bài xếp lớp diễn ra TRƯỚC ngày học đầu tiên nên chưa có `DailySession` nào.
 * Ta dựng một phiên rỗng chỉ để `Attempt` có `sessionId` hợp lệ — phiên này KHÔNG
 * được lưu xuống DB, và `persistAnswer` xử lý đúng trường hợp không tìm thấy phiên.
 */
function placementSession(now: Date, phase: DailySession['phase']): DailySession {
  return {
    sessionId: `placement-${now.toISOString().slice(0, 10)}`,
    date: now.toISOString(),
    phase,
    mode: 'NORMAL',
    plannedMinutes: 0,
    blocks: [],
    adaptationNotes: [],
    status: 'IN_PROGRESS',
    cursor: { blockIndex: 0, itemIndex: 0 },
    redoQueue: [],
    seed: 0,
  };
}

/**
 * Ghi một câu trả lời của bài xếp lớp.
 * Vẫn đi qua `persistAnswer` để `Attempt` được ghi đầy đủ theo CLAUDE.md §9 —
 * MasteryEngine sẽ tự xử lý và KHÔNG thăng cấp, vì mẫu chưa có learn card (§5.1).
 */
export async function recordPlacementAnswer(
  ctx: EngineContext,
  question: Question,
  choiceId: string,
  confidence: Confidence,
  responseTimeMs: number,
  now: Date,
): Promise<PlacementAnswer> {
  const input = {
    ctx,
    session: placementSession(now, ctx.timeline.currentPhase),
    question,
    response: { kind: 'CHOICE' as const, choiceId },
    responseTimeMs,
    confidence,
    delivery: 'PRACTICE' as const,
    blockType: 'RECALL' as const,
    now,
  };
  const result = gradeAnswer(input);
  await persistAnswer(input, result);
  return {
    grammarId: question.targetGrammarIds[0],
    isCorrect: result.isCorrect,
    confidence,
  };
}

/** Chốt kết quả: ghi `placementResult` vào mastery. KHÔNG đụng `state`. */
export async function finalizePlacement(answers: PlacementAnswer[], now: Date): Promise<number> {
  const all = await masteryRepo.getAll();
  const updated = applyPlacement(all, answers);
  const changed = updated.filter((m, i) => m !== all[i]);
  if (changed.length > 0) await masteryRepo.putMany(changed);
  await markPlacementDone(now);
  return changed.filter((m) => m.placementResult === 'KNOWN').length;
}
