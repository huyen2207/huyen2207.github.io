import type { ReactNode } from 'react';
import type { Confidence, ErrorType, GradeFlag } from '@/domain/enums';
import type { FeedbackPayload } from '@/engines/exercise';
import type { GrammarView } from '@/domain/grammar';
import { CONFIDENCES } from '@/domain/enums';
import { t } from '@/i18n/vi';
import { Card, Pill } from './primitives';

export type ChoiceStatus = 'IDLE' | 'CORRECT' | 'WRONG' | 'MISSED';

export function ChoiceButton({
  label,
  index,
  selected,
  status = 'IDLE',
  disabled,
  onClick,
}: {
  label: string;
  index: number;
  selected: boolean;
  status?: ChoiceStatus;
  disabled?: boolean;
  onClick: () => void;
}) {
  const marker = status === 'CORRECT' ? '✓' : status === 'WRONG' ? '✕' : status === 'MISSED' ? '→' : String(index + 1);
  const cls =
    status === 'CORRECT' || status === 'MISSED' ? 'mark-correct' : status === 'WRONG' ? 'mark-wrong' : '';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`choice-tap flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left hairline ${cls}`}
      style={{
        background: cls ? undefined : 'var(--paper-raised)',
        borderColor: selected && !cls ? 'var(--accent)' : undefined,
        borderWidth: selected && !cls ? 2 : 1,
      }}
    >
      <span
        className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] font-bold"
        style={{ background: 'var(--rule)', color: 'var(--ink-soft)' }}
        aria-hidden="true"
      >
        {marker}
      </span>
      <span className="ja ja-choice flex-1">{label}</span>
    </button>
  );
}

/** 3 nút hiện CÙNG LÚC với đáp án, không phải màn hình thứ hai (arch §11). */
export function ConfidenceSelector({
  value,
  onChange,
  disabled,
}: {
  value: Confidence | null;
  onChange: (c: Confidence) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="mt-4" disabled={disabled}>
      <legend className="mb-1.5 text-[13px] font-medium" style={{ color: 'var(--ink-soft)' }}>
        {t('confidence.prompt')}
      </legend>
      <div className="flex gap-2" role="radiogroup" aria-label={t('confidence.prompt')}>
        {CONFIDENCES.map((c) => {
          const active = value === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(c)}
              className="tap flex-1 rounded-lg border px-2 py-2 text-[14px] font-medium hairline"
              style={{
                background: active ? 'var(--accent-soft)' : 'var(--paper-raised)',
                color: active ? 'var(--accent)' : 'var(--ink-soft)',
                borderColor: active ? 'var(--accent)' : 'var(--rule)',
              }}
            >
              {t(`confidence.${c}`)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ResultBanner({ isCorrect, flags }: { isCorrect: boolean; flags: GradeFlag[] }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3.5 py-3 ${isCorrect ? 'mark-correct' : 'mark-wrong'}`}
    >
      <span aria-hidden="true" className="text-[18px]">
        {isCorrect ? '✓' : '✕'}
      </span>
      <span className="text-[15px] font-semibold">
        {isCorrect ? t('question.correct') : t('question.incorrect')}
      </span>
      <span className="ml-auto flex gap-1.5">
        {flags.includes('LUCKY') && <Pill tone="warn">{t('confidence.GUESS')}</Pill>}
        {flags.includes('TOO_SLOW') && <Pill tone="warn">⏱</Pill>}
        {flags.includes('TRAP_HIT') && <Pill tone="warn">{t('question.trapType')}</Pill>}
      </span>
    </div>
  );
}

export function ExplanationPanel({
  feedback,
  choiceLabels,
  grammar,
  otherGrammars,
  children,
}: {
  feedback: FeedbackPayload;
  choiceLabels: Record<string, string>;
  /** Mẫu để ôn lại cấu trúc; chỉ truyền khi câu hỏi nhắm đúng một mẫu. */
  grammar?: GrammarView;
  /** Các mẫu còn lại của câu so sánh — hiện thu gọn, bấm mới mở. */
  otherGrammars?: GrammarView[];
  children?: ReactNode;
}) {
  const hasAny =
    feedback.explanationVi || feedback.keyClueVi || feedback.trap || feedback.solvingStrategy || feedback.stemVi || grammar || otherGrammars?.length;
  if (!hasAny) return <>{children}</>;

  return (
    <div className="mt-3 space-y-3">
      {feedback.stemVi && (
        <Card className="px-3.5 py-3">
          <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
            {t('question.meaningOfSentence')}
          </h3>
          <p className="text-[15px] leading-relaxed">{feedback.stemVi}</p>
        </Card>
      )}

      {feedback.explanationVi && (
        <Card className="px-3.5 py-3">
          <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
            {t('question.whyCorrect')}
          </h3>
          <p className="text-[14px] leading-relaxed">{feedback.explanationVi}</p>
        </Card>
      )}

      {feedback.keyClueVi && (
        <Card className="px-3.5 py-3" >
          <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
            {t('question.keyClue')}
          </h3>
          <p className="ja text-[16px]">{feedback.keyClueVi}</p>
        </Card>
      )}

      {feedback.choiceExplanations && Object.keys(feedback.choiceExplanations).length > 0 && (
        <Card className="px-3.5 py-3">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
            {t('question.whyWrong')}
          </h3>
          <ul className="space-y-2">
            {Object.entries(feedback.choiceExplanations).map(([id, why]) => (
              <li key={id} className="text-[14px] leading-relaxed">
                <span className="ja font-semibold">{choiceLabels[id] ?? id}</span>
                <span style={{ color: 'var(--ink-soft)' }}> — {why}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {feedback.trap && (
        <Card className="px-3.5 py-3" >
          <div className="mb-1 flex items-center gap-2">
            <Pill tone="warn">{t(`trap.${feedback.trap.trapType}`)}</Pill>
          </div>
          <p className="text-[14px] leading-relaxed">{feedback.trap.trapExplanationVi}</p>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--accent)' }}>
            → {feedback.trap.fastestPathVi}
          </p>
        </Card>
      )}

      {feedback.solvingStrategy && feedback.solvingStrategy.length > 0 && (
        <Card className="px-3.5 py-3">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
            {t('question.solvingStrategy')}
          </h3>
          <ol className="space-y-1.5">
            {feedback.solvingStrategy.map((s) => (
              <li key={s.order} className="flex gap-2 text-[14px]">
                <span className="tabular font-semibold" style={{ color: 'var(--accent)' }}>
                  {s.order}
                </span>
                <span>
                  <span className="ja">{s.labelJa}</span>
                  <span style={{ color: 'var(--ink-soft)' }}> — {s.labelVi}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {grammar && <StructureRecap grammar={grammar} />}

      {otherGrammars && otherGrammars.length > 0 && (
        <Card className="px-3.5 py-3">
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
              {t('question.reviewStructureAll', { n: otherGrammars.length })}
            </summary>
            <div className="mt-3 space-y-4">
              {otherGrammars.map((g) => (
                <div key={g.id}>
                  <p className="ja text-[18px] font-semibold leading-tight">{g.pattern}</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed">{g.meaningVi}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {g.structure.map((st, i) => (
                      <li key={i} className="ja text-[15px]">
                        {st.form}
                      </li>
                    ))}
                  </ul>
                  {g.restrictions[0] && (
                    <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                      {g.restrictions[0].ruleVi}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </details>
        </Card>
      )}

      {children}
    </div>
  );
}

/**
 * Ôn lại cấu trúc ngay sau khi trả lời — lúc người học đang chú ý nhất.
 * Chỉ hiện khi câu hỏi nhắm ĐÚNG MỘT mẫu; câu so sánh nhiều mẫu đã có bảng riêng
 * ở Compare Lab, nhồi 3–4 cấu trúc vào đây sẽ thành bức tường chữ trên điện thoại.
 */
function StructureRecap({ grammar }: { grammar: GrammarView }) {
  return (
    <Card className="px-3.5 py-3">
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
        {t('question.reviewStructure')}
      </h3>

      <p className="ja text-[20px] font-semibold leading-tight">{grammar.pattern}</p>
      <p className="mt-1 text-[14px] leading-relaxed">{grammar.meaningVi}</p>

      <h4 className="ja mt-3 text-[12px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
        {t('learn.structure')}
      </h4>
      <ul className="mt-1 space-y-1">
        {grammar.structure.map((s, i) => (
          <li key={i} className="ja text-[16px]">
            {s.form}
            {s.note && (
              <span className="ml-2 text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                {s.note}
              </span>
            )}
          </li>
        ))}
      </ul>

      {grammar.restrictions.length > 0 && (
        <>
          <h4 className="ja mt-3 text-[12px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
            {t('learn.restrictions')}
          </h4>
          <ul className="mt-1 space-y-1">
            {grammar.restrictions.map((r, i) => (
              <li key={i} className="text-[14px] leading-relaxed">
                {r.ruleVi}
                {r.counterExample && (
                  <span className="ja ml-1" style={{ color: 'var(--ink-faint)' }}>
                    {r.counterExample}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function SelfReportPrompt({
  options,
  onPick,
  onSkip,
}: {
  options: ErrorType[];
  onPick: (e: ErrorType) => void;
  onSkip: () => void;
}) {
  return (
    <Card className="mt-3 px-3.5 py-3">
      <p className="mb-2 text-[14px] font-medium">{t('question.selfReport')}</p>
      <div className="flex flex-wrap gap-2">
        {options.slice(0, 3).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onPick(o)}
            className="tap rounded-lg border px-3 py-2 text-[13px] hairline"
            style={{ background: 'var(--paper-raised)' }}
          >
            {t(`errorType.${o}`)}
          </button>
        ))}
        <button
          type="button"
          onClick={onSkip}
          className="tap rounded-lg px-3 py-2 text-[13px]"
          style={{ color: 'var(--ink-faint)' }}
        >
          {t('question.selfReport.skip')}
        </button>
      </div>
    </Card>
  );
}
