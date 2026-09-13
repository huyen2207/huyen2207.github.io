import { useEffect, useMemo, useRef, useState } from 'react';
import type { Question } from '@/domain/question';
import type { Confidence, DeliveryMode, ErrorType, SessionBlockType, TrapType } from '@/domain/enums';
import { TRAP_TYPES } from '@/domain/enums';
import type { GradeResult, Response } from '@/engines/exercise';
import { shuffleChoices, shuffleFragments } from '@/engines/exercise';
import { gradeAnswer, persistAnswer } from '@/app/services/answerService';
import { useAppStore } from '@/app/stores/appStore';
import { t } from '@/i18n/vi';
import { Card, NeedsReviewBadge, PrimaryButton, SecondaryButton, ThumbBar } from './primitives';
import { ChoiceButton, ConfidenceSelector, ExplanationPanel, ResultBanner, SelfReportPrompt } from './answering';
import { ClozeText, JaText } from './JaText';
import { getGrammarView } from '@/content/repository';

/**
 * Ảnh chụp một lần trả lời, để khi người học bấm QUAY LẠI thì hiện nguyên kết quả cũ
 * thay vì bắt làm lại — làm lại sẽ ghi thêm một Attempt nữa cho cùng một lần suy nghĩ,
 * làm sai thống kê và làm lệch mastery.
 */
export interface AnswerSnapshot {
  selected: string;
  confidence: Confidence;
  order: string[];
  result: GradeResult;
}

export interface QuestionRunnerProps {
  question: Question;
  delivery: DeliveryMode;
  blockType: SessionBlockType;
  /** MOCK: không hiện feedback, chỉ ghi nhận rồi sang câu sau. */
  onAnswered?: (result: GradeResult, question: Question, snapshot: AnswerSnapshot) => void;
  /** Câu này đã trả lời rồi trong lượt hiện tại — hiện lại kết quả cũ. */
  prior?: AnswerSnapshot;
  onNext: () => void;
  index?: number;
  total?: number;
  nextLabelKey?: string;
}

const LETTERS = ['1', '2', '3', '4', '5', '6'];


export function QuestionRunner({
  question,
  delivery,
  blockType,
  onAnswered,
  prior,
  onNext,
  index,
  total,
  nextLabelKey = 'common.next',
}: QuestionRunnerProps) {
  const ctx = useAppStore((s) => s.ctx);
  const session = useAppStore((s) => s.session);

  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  // Chỉ ôn lại cấu trúc khi câu hỏi nhắm ĐÚNG MỘT mẫu. Câu so sánh nhiều mẫu
  // đã có bảng riêng ở Compare Lab, nhồi 3–4 cấu trúc vào đây sẽ quá dài.
  const recapGrammar =
    question.targetGrammarIds.length === 1 ? getGrammarView(question.targetGrammarIds[0]) : undefined;
  // Câu so sánh nhiều mẫu: gom tất cả vào một khối THU GỌN để không thành tường chữ.
  const recapAll =
    question.targetGrammarIds.length > 1
      ? question.targetGrammarIds.map(getGrammarView).filter((g): g is NonNullable<typeof g> => Boolean(g))
      : undefined;
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [selfReported, setSelfReported] = useState(false);
  const startedAt = useRef<number>(Date.now());

  const isMock = delivery === 'MOCK';
  const isBuild = question.type === 'SENTENCE_BUILD';
  const isTrapId = question.type === 'TRAP_ID';

  const view = useMemo(() => {
    const seedKey = `${question.id}|${session?.sessionId ?? 'x'}`;
    return isBuild ? shuffleFragments(question, seedKey) : shuffleChoices(question, seedKey);
  }, [question, session?.sessionId, isBuild]);

  useEffect(() => {
    startedAt.current = Date.now();
    setSelected(prior?.selected ?? null);
    setConfidence(prior?.confidence ?? (isMock ? 'UNSURE' : null));
    setResult(prior?.result ?? null);
    setSelfReported(false);
    setOrder(prior?.order ?? (isBuild ? (view.fragments ?? []).map((f) => f.id) : []));
  }, [question.id, isMock, isBuild, view.fragments, prior]);

  const trapOptions = useMemo<TrapType[]>(() => {
    if (!isTrapId) return [];
    const declared = view.choices.map((c) => c.id).filter((id) => (TRAP_TYPES as readonly string[]).includes(id));
    return declared.length ? (declared as TrapType[]) : (TRAP_TYPES.slice(0, 4) as TrapType[]);
  }, [isTrapId, view.choices]);

  const choiceLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of question.choices) map[c.id] = c.textJa;
    return map;
  }, [question]);

  const canSubmit = Boolean(selected) && Boolean(confidence);

  function buildResponse(): Response {
    if (isBuild) {
      return selected ? { kind: 'ORDER', orderedFragmentIds: withStar(order, selected, question) } : { kind: 'NONE' };
    }
    if (isTrapId) return selected ? { kind: 'TRAP', trapType: selected as TrapType } : { kind: 'NONE' };
    return selected ? { kind: 'CHOICE', choiceId: selected } : { kind: 'NONE' };
  }

  function submit() {
    if (!ctx || !session || !confidence || !selected) return;
    if (prior) return; // đã trả lời rồi — không chấm lại, không ghi thêm
    const responseTimeMs = Math.max(300, Date.now() - startedAt.current);
    const input = {
      ctx,
      session,
      question,
      response: buildResponse(),
      responseTimeMs,
      confidence,
      delivery,
      blockType,
      now: new Date(),
      ...(isMock ? { confidenceImputed: true } : {}),
    };
    // Chấm đồng bộ → hiện feedback ngay; ghi DB chạy nền (arch §8.3).
    const graded = gradeAnswer(input);
    setResult(graded);
    onAnswered?.(graded, question, { selected, confidence, order, result: graded });
    void persistAnswer(input, graded);
    if (isMock) onNext();
  }

  function reportError(errorType: ErrorType) {
    if (!ctx || !session || !confidence || !result || !selected) return;
    setSelfReported(true);
    void persistAnswer(
      {
        ctx,
        session,
        question,
        response: buildResponse(),
        responseTimeMs: 0,
        confidence,
        delivery,
        blockType,
        now: new Date(),
      },
      result,
      errorType,
    );
  }

  const answered = result !== null && !isMock;

  return (
    <div>
      {(index !== undefined || question.verificationStatus !== 'VERIFIED') && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {index !== undefined && total !== undefined ? (
            <span className="tabular text-[13px]" style={{ color: 'var(--ink-faint)' }}>
              {index + 1} / {total}
            </span>
          ) : (
            <span />
          )}
          {question.verificationStatus !== 'VERIFIED' && !isMock && <NeedsReviewBadge />}
        </div>
      )}

      {question.contextJa && (
        <Card className="mb-3 max-h-56 overflow-y-auto px-3.5 py-3">
          <p className="ja ja-sentence whitespace-pre-wrap">{question.contextJa}</p>
        </Card>
      )}

      <Card className="mb-4 px-3.5 py-4">
        {question.stemJa.includes('___') ? (
          <ClozeText text={question.stemJa} filled={answered ? choiceLabels[question.correctChoiceId] : undefined} />
        ) : (
          <JaText text={question.stemJa} />
        )}
      </Card>

      {isBuild && (
        <div className="mb-3">
          <p className="mb-2 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            {t('question.buildInstruction')}
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {order.map((id, i) => {
              const frag = view.fragments?.find((f) => f.id === id);
              const isStar = i === (question.starSlotIndex ?? 0);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={answered}
                  onClick={() => setOrder(moveLeft(order, i))}
                  className="tap rounded-lg border px-3 py-2 hairline"
                  style={{
                    background: isStar ? 'var(--accent-soft)' : 'var(--paper-raised)',
                    borderColor: isStar ? 'var(--accent)' : 'var(--rule)',
                  }}
                >
                  <span className="ja text-[16px]">{frag?.textJa}</span>
                  {isStar && <span className="ml-1 text-[12px]">{t('question.starMark')}</span>}
                </button>
              );
            })}
          </div>
          <p className="mb-1.5 text-[13px] font-medium">{t('question.starSlot')}</p>
        </div>
      )}

      <div className="space-y-2.5" role="group" aria-label={t('question.submit')}>
        {isTrapId
          ? trapOptions.map((tt, i) => (
              <ChoiceButton
                key={tt}
                index={i}
                label={t(`trap.${tt}`)}
                selected={selected === tt}
                disabled={answered}
                status={
                  !answered
                    ? 'IDLE'
                    : tt === question.trap?.trapType
                      ? 'CORRECT'
                      : selected === tt
                        ? 'WRONG'
                        : 'IDLE'
                }
                onClick={() => !answered && setSelected(tt)}
              />
            ))
          : (isBuild
              ? (view.fragments ?? []).map((f) => ({ id: f.id, textJa: f.textJa }))
              : view.choices.map((c) => ({ id: c.id, textJa: c.textJa }))
            ).map((c, i) => {
              const id = c.id;
              const label = c.textJa;
              const correctId = isBuild ? question.starFragmentId : question.correctChoiceId;
              return (
                <ChoiceButton
                  key={id}
                  index={i}
                  label={label}
                  selected={selected === id}
                  disabled={answered}
                  status={
                    !answered ? 'IDLE' : id === correctId ? 'CORRECT' : selected === id ? 'WRONG' : 'IDLE'
                  }
                  onClick={() => !answered && setSelected(id)}
                />
              );
            })}
      </div>

      {!answered && !isMock && (
        <ConfidenceSelector value={confidence} onChange={setConfidence} />
      )}

      {answered && result && (
        <div className="mt-4">
          <ResultBanner isCorrect={result.isCorrect} flags={result.flags} />
          {delivery === 'TIMED' && (
            <p className="mt-2 text-[13px]" style={{ color: 'var(--ink-faint)' }}>
              {t('question.timedHint')}
            </p>
          )}
          <ExplanationPanel feedback={result.feedback} choiceLabels={choiceLabels} grammar={recapGrammar} otherGrammars={recapAll} teachFully={!result.isCorrect} />
          {result.needsSelfReport && !selfReported && result.selfReportOptions.length > 0 && (
            <SelfReportPrompt
              options={result.selfReportOptions}
              onPick={reportError}
              onSkip={() => setSelfReported(true)}
            />
          )}
        </div>
      )}

      <ThumbBar>
        {!answered ? (
          <>
            {!confidence && selected && !isMock && (
              <p className="mb-2 text-center text-[13px]" style={{ color: 'var(--warn)' }}>
                {t('confidence.required')}
              </p>
            )}
            <PrimaryButton onClick={submit} disabled={!canSubmit}>
              {t('question.submit')}
            </PrimaryButton>
          </>
        ) : (
          <PrimaryButton onClick={onNext}>{t(nextLabelKey)}</PrimaryButton>
        )}
      </ThumbBar>

      {/* Phím tắt trên desktop */}
      <KeyboardShortcuts
        enabled={!answered}
        count={isTrapId ? trapOptions.length : isBuild ? (view.fragments?.length ?? 0) : view.choices.length}
        onPick={(i) => {
          const list = isTrapId ? trapOptions : isBuild ? (view.fragments ?? []).map((f) => f.id) : view.choices.map((c) => c.id);
          const id = list[i];
          if (id) setSelected(id as string);
        }}
        onSubmit={() => (canSubmit ? submit() : undefined)}
      />
    </div>
  );
}

function moveLeft(order: string[], index: number): string[] {
  if (index === 0) return order;
  const next = [...order];
  const tmp = next[index - 1];
  next[index - 1] = next[index];
  next[index] = tmp;
  return next;
}

/** Đặt mảnh đã chọn vào đúng ô sao (star slot) để engine chấm theo vị trí đó. */
function withStar(order: string[], starChoice: string, question: Question): string[] {
  const idx = question.starSlotIndex ?? 0;
  const rest = order.filter((id) => id !== starChoice);
  const next = [...rest];
  next.splice(idx, 0, starChoice);
  return next;
}

function KeyboardShortcuts({
  enabled,
  count,
  onPick,
  onSubmit,
}: {
  enabled: boolean;
  count: number;
  onPick: (i: number) => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        onSubmit();
        return;
      }
      const idx = LETTERS.indexOf(e.key);
      if (idx >= 0 && idx < count) onPick(idx);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, count, onPick, onSubmit]);
  return null;
}

export { SecondaryButton };
