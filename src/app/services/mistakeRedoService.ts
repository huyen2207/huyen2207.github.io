import type { Attempt } from '@/domain/attempt';
import type { Question } from '@/domain/question';
import { getQuestion } from '@/content/repository';
import type { EngineContext } from './context';

export interface WrongQuestion {
  question: Question;
  /** Lần làm sai gần nhất. */
  lastWrong: Attempt;
  /** Đã sai bao nhiêu lần ở câu này. */
  wrongCount: number;
  /** Nhãn đáp án người học đã chọn và đáp án đúng — để nhìn lại lỗi. */
  chosenLabel?: string;
  correctLabel?: string;
}

function labelOf(q: Question, id: string | undefined): string | undefined {
  if (!id) return undefined;
  return q.choices.find((c) => c.id === id)?.textJa ?? q.fragments?.find((f) => f.id === id)?.textJa;
}

/**
 * Các câu người học đã làm SAI và lần gần nhất ở câu đó VẪN sai — tức là lỗi chưa sửa.
 * Làm lại đúng thì câu tự rời danh sách: đó chính là "khắc phục".
 *
 * Bỏ qua câu đã bị gỡ khỏi kho, và câu nhắm mẫu người học chưa được dạy (H9) — những câu
 * đó từng lọt vào buổi học do lỗi cũ, chữa chúng không dạy được gì.
 */
export function wrongQuestionsToRedo(ctx: EngineContext): WrongQuestion[] {
  const taught = new Set(ctx.mastery.filter((m) => m.state !== 'UNSEEN').map((m) => m.grammarId));
  const byQuestion = new Map<string, Attempt[]>();
  for (const a of ctx.attempts) byQuestion.set(a.questionId, [...(byQuestion.get(a.questionId) ?? []), a]);

  const out: WrongQuestion[] = [];
  for (const [qid, list] of byQuestion) {
    const q = getQuestion(qid);
    if (!q || !q.targetGrammarIds.every((g) => taught.has(g))) continue;
    const sorted = [...list].sort((x, y) => x.timestamp.localeCompare(y.timestamp));
    const last = sorted[sorted.length - 1];
    if (last.isCorrect) continue;
    out.push({
      question: q,
      lastWrong: last,
      wrongCount: sorted.filter((a) => !a.isCorrect).length,
      chosenLabel: labelOf(q, last.selectedAnswer),
      correctLabel: labelOf(q, q.type === 'SENTENCE_BUILD' ? (q.starFragmentId ?? q.correctChoiceId) : q.correctChoiceId),
    });
  }
  // Sai nhiều lần trước, rồi mới tới sai gần đây.
  return out.sort((x, y) => y.wrongCount - x.wrongCount || y.lastWrong.timestamp.localeCompare(x.lastWrong.timestamp));
}
