import type { Choice, Question, SolvingStep, TrapAnnotation } from '@/domain/question';
import type {
  ClueKind,
  ComparisonAxis,
  Confidence,
  DeliveryMode,
  ErrorType,
  GradeFlag,
  GradeOutcome,
  MasteryState,
  TrapType,
} from '@/domain/enums';
import { FAST_FLOOR_RATIO, SLOW_FACTOR } from '@/config/learning.config';

export type Response =
  | { kind: 'CHOICE'; choiceId: string }
  | { kind: 'ORDER'; orderedFragmentIds: string[] }
  | { kind: 'CLUE'; clueKind: ClueKind }
  | { kind: 'TRAP'; trapType: TrapType }
  | { kind: 'NONE' };

export interface GradeContext {
  masteryState: MasteryState;
  personalMedianRtMs: number | null;
  knownConfusionPartners: string[];
  sameSessionAttemptCount: number;
}

export interface GradeInput {
  question: Question;
  response: Response;
  responseTimeMs: number;
  confidence: Confidence;
  delivery: DeliveryMode;
  context: GradeContext;
}

export interface FeedbackPayload {
  correctChoiceId: string | null;
  /** Nghĩa tiếng Việt của câu hoàn chỉnh. Chỉ có sau khi đã trả lời (không lộ đáp án). */
  stemVi: string | null;
  explanationVi: string | null;
  keyClueVi: string | null;
  choiceExplanations: Record<string, string> | null;
  trap: TrapAnnotation | null;
  solvingStrategy: SolvingStep[] | null;
  grammarLinks: string[] | null;
}

export interface GradeResult {
  isCorrect: boolean;
  outcome: GradeOutcome;
  flags: GradeFlag[];
  errorTypeAuto: ErrorType | null;
  needsSelfReport: boolean;
  confusedWith: string | null;
  violatedAxis: ComparisonAxis | null;
  score: number;
  feedback: FeedbackPayload;
  /** Lựa chọn cho câu hỏi "Vì sao bạn chọn?" khi không suy được errorType. */
  selfReportOptions: ErrorType[];
}

const EMPTY_FEEDBACK: FeedbackPayload = {
  correctChoiceId: null,
  stemVi: null,
  explanationVi: null,
  keyClueVi: null,
  choiceExplanations: null,
  trap: null,
  solvingStrategy: null,
  grammarLinks: null,
};

function chosenChoice(q: Question, r: Response): Choice | null {
  if (r.kind === 'CHOICE') return q.choices.find((c) => c.id === r.choiceId) ?? null;
  if (r.kind === 'TRAP') return q.choices.find((c) => c.id === r.trapType) ?? null;
  return null;
}

/** exercise-engine §6.8 — cổng chặn feedback theo DeliveryMode. UI KHÔNG được tự quyết. */
export function buildFeedback(q: Question, delivery: DeliveryMode): FeedbackPayload {
  if (delivery === 'MOCK') return { ...EMPTY_FEEDBACK };

  const choiceExplanations: Record<string, string> = {};
  for (const c of q.choices) {
    if (!c.isCorrect && c.whyWrongVi) choiceExplanations[c.id] = c.whyWrongVi;
  }

  if (delivery === 'TIMED') {
    // Rút gọn: đáp án + 1 dòng clue. Giải thích đầy đủ hiện sau khi hết block.
    return {
      ...EMPTY_FEEDBACK,
      correctChoiceId: q.correctChoiceId,
      // Bản dịch vẫn hiện ở chế độ bấm giờ: nó giúp nhớ, không phải lời giải.
      stemVi: q.stemVi ?? null,
      keyClueVi: q.keyClueVi,
    };
  }

  return {
    correctChoiceId: q.correctChoiceId,
    stemVi: q.stemVi ?? null,
    explanationVi: q.explanationVi,
    keyClueVi: q.keyClueVi,
    choiceExplanations,
    trap: q.trap ?? null,
    solvingStrategy: q.solvingStrategy,
    grammarLinks: q.targetGrammarIds,
  };
}

function scoreOf(q: Question, r: Response): { isCorrect: boolean; score: number; extraFlags: GradeFlag[] } {
  if (r.kind === 'NONE') return { isCorrect: false, score: 0, extraFlags: [] };

  if (q.type === 'SENTENCE_BUILD') {
    if (r.kind !== 'ORDER') {
      // Cho phép trả lời dạng chọn mảnh cho ô ★.
      if (r.kind === 'CHOICE') {
        const ok = r.choiceId === q.starFragmentId;
        return { isCorrect: ok, score: ok ? 1 : 0, extraFlags: [] };
      }
      return { isCorrect: false, score: 0, extraFlags: [] };
    }
    const idx = q.starSlotIndex ?? 0;
    const ok = r.orderedFragmentIds[idx] === q.starFragmentId;
    const fullOrderCorrect =
      Boolean(q.fragments) &&
      r.orderedFragmentIds.length === q.fragments!.length &&
      r.orderedFragmentIds.every((id, i) => id === q.fragments![i].id);
    // Chấm theo vị trí ★ như đề thật; cờ FULL_ORDER_CORRECT chỉ để chẩn đoán.
    return { isCorrect: ok, score: ok ? 1 : 0, extraFlags: fullOrderCorrect ? ['FULL_ORDER_CORRECT'] : [] };
  }

  if (q.type === 'TRAP_ID') {
    if (r.kind !== 'TRAP') return { isCorrect: false, score: 0, extraFlags: [] };
    const ok = Boolean(q.trap) && r.trapType === q.trap!.trapType;
    return { isCorrect: ok, score: ok ? 1 : 0, extraFlags: [] };
  }

  if (r.kind !== 'CHOICE') return { isCorrect: false, score: 0, extraFlags: [] };
  const ok = r.choiceId === q.correctChoiceId;
  return { isCorrect: ok, score: ok ? 1 : 0, extraFlags: [] };
}

/**
 * grade — PURE. Không ghi DB, không Date.now(), không Math.random() (P1).
 * Cây quyết định outcome cố định theo exercise-engine §6.5.
 */
export function grade(input: GradeInput): GradeResult {
  const { question: q, response: r, responseTimeMs, confidence, delivery, context: ctx } = input;
  const { isCorrect, score, extraFlags } = scoreOf(q, r);
  const chosen = chosenChoice(q, r);
  const flags: GradeFlag[] = [...extraFlags];

  const timeout = r.kind === 'NONE';
  const timed = delivery === 'TIMED' || delivery === 'MOCK';

  if (!isCorrect && confidence === 'CONFIDENT' && !timeout) flags.push('MISCONCEPTION');
  if (isCorrect && confidence === 'GUESS') flags.push('LUCKY');
  if (ctx.personalMedianRtMs && responseTimeMs > SLOW_FACTOR * ctx.personalMedianRtMs) flags.push('TOO_SLOW');
  if (responseTimeMs < FAST_FLOOR_RATIO * q.targetTimeMs) flags.push('SUSPICIOUSLY_FAST');
  if (chosen?.confusedWithGrammarId && ctx.knownConfusionPartners.includes(chosen.confusedWithGrammarId)) {
    flags.push('KNOWN_CONFUSION');
  }
  if (!isCorrect && q.trap && chosen && !chosen.isCorrect) flags.push('TRAP_HIT');
  if (q.verificationStatus !== 'VERIFIED') flags.push('UNVERIFIED_CONTENT');
  if (ctx.sameSessionAttemptCount > 0) flags.push('SAME_SESSION_REPEAT');

  let outcome: GradeOutcome;
  if (timeout) {
    outcome = 'TIMEOUT';
  } else if (isCorrect) {
    outcome =
      confidence === 'CONFIDENT' ? 'CORRECT_CONFIDENT' : confidence === 'UNSURE' ? 'CORRECT_UNSURE' : 'CORRECT_GUESS';
  } else if (confidence === 'CONFIDENT') {
    outcome = 'INCORRECT_MISCONCEPTION';
  } else if (
    chosen?.confusedWithGrammarId &&
    ctx.knownConfusionPartners.includes(chosen.confusedWithGrammarId)
  ) {
    outcome = 'INCORRECT_KNOWN_CONFUSION';
  } else if (chosen?.wrongBecause === 'SIMILAR_GRAMMAR_CONFUSION') {
    outcome = 'INCORRECT_NEW_CONFUSION';
  } else {
    outcome = 'INCORRECT_OTHER';
  }

  /* Suy errorType tự động (exercise-engine §6.7) */
  let errorTypeAuto: ErrorType | null = null;
  let needsSelfReport = false;

  if (!isCorrect) {
    if (chosen?.wrongBecause) {
      errorTypeAuto = chosen.wrongBecause;
    } else if (timeout && timed) {
      errorTypeAuto = 'TIME_PRESSURE_ERROR';
    } else if (flags.includes('TRAP_HIT')) {
      errorTypeAuto = 'TRAP_ERROR';
    } else if (
      delivery !== 'MOCK' &&
      (ctx.masteryState === 'COMPARABLE' || ctx.masteryState === 'EXAM_READY') &&
      flags.includes('SUSPICIOUSLY_FAST')
    ) {
      // K8: MOCK không bao giờ tự gán CARELESS_ERROR.
      errorTypeAuto = 'CARELESS_ERROR';
    } else {
      needsSelfReport = true;
    }
  }

  const selfReportOptions = needsSelfReport
    ? [
        ...new Set(
          q.choices
            .filter((c) => !c.isCorrect && c.wrongBecause)
            .map((c) => c.wrongBecause as ErrorType),
        ),
      ].slice(0, 3)
    : [];

  return {
    isCorrect,
    outcome,
    flags,
    errorTypeAuto,
    needsSelfReport,
    confusedWith: chosen?.confusedWithGrammarId ?? null,
    violatedAxis: chosen?.violatedAxis ?? null,
    score,
    feedback: buildFeedback(q, delivery),
    selfReportOptions,
  };
}

/**
 * exercise-engine §7.2 — CHƯA được gọi ở đâu (không có QuestionType nhập text ở MVP).
 * Đặc tả sẵn để nếu MINI_SENTENCE_COMPLETION được duyệt thì không ai phải ứng biến.
 */
export function normalizeForGrading(s: string): string {
  return s
    .normalize('NFKC')
    // eslint-disable-next-line no-irregular-whitespace -- U+3000 nằm trong đặc tả exercise-engine §7.2
    .replace(/[\s　]/g, '')
    .replace(/[。．.]+$/g, '')
    .replace(/[〜～・「」『』（）()]/g, '');
}
