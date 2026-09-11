import { useState } from 'react';
import type { GrammarView } from '@/domain/grammar';
import { t } from '@/i18n/vi';
import { Card, NeedsReviewBadge, Pill, PrimaryButton, SecondaryButton } from './primitives';
import { JaText } from './JaText';

/**
 * Micro lesson — thứ tự 10 mục CHỐT theo arch §9 (/grammar/:id).
 * Restrictions đứng TRƯỚC Examples: đọc ví dụ trước khi biết ràng buộc
 * sẽ khiến người học khái quát hoá sai (spec-consistency-check C-05).
 */
export function LearnCard({
  grammar,
  onDone,
  doneLabelKey = 'learn.markDone',
  relatedPatterns,
  onOpenCompare,
}: {
  grammar: GrammarView;
  onDone?: () => void;
  doneLabelKey?: string;
  relatedPatterns?: Array<{ id: string; pattern: string }>;
  onOpenCompare?: (id: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const highlights = [grammar.pattern, ...grammar.aliases];

  return (
    <article>
      {/* 1. Pattern */}
      <header className="mb-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="ja ja-pattern font-semibold">{grammar.pattern}</h2>
          {grammar.verificationStatus !== 'VERIFIED' && <NeedsReviewBadge />}
        </div>
        {grammar.reading && (
          <p className="ja mt-0.5 text-[13px]" style={{ color: 'var(--ink-faint)' }}>
            {grammar.reading}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {grammar.families.map((f) => (
            <Pill key={f}>{t(`family.${f}`)}</Pill>
          ))}
          <Pill tone="accent">{t(`grammar.frequency.${grammar.examFrequency}`)}</Pill>
        </div>
      </header>

      {/* 2. Nghĩa — che trước, tự nhớ rồi mới hiện (CLAUDE.md §11) */}
      <Card className="mb-3 px-4 py-3">
        <h3 className="ja mb-1 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
          {t('learn.meaning')}
        </h3>
        {revealed ? (
          <p className="text-[16px] leading-relaxed">{grammar.meaningVi}</p>
        ) : (
          <div>
            <p className="mb-2 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
              {t('learn.recallPrompt')}
            </p>
            <SecondaryButton onClick={() => setRevealed(true)}>{t('learn.recallReveal')}</SecondaryButton>
          </div>
        )}
      </Card>

      {revealed && (
        <>
          {/* 3. Core image */}
          <Card className="mb-3 px-4 py-3">
            <h3 className="ja mb-1 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
              {t('learn.coreImage')}
            </h3>
            <p className="text-[15px] leading-relaxed">{grammar.coreImage}</p>
            {grammar.nuanceVi && (
              <p className="mt-1.5 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
                {grammar.nuanceVi}
              </p>
            )}
          </Card>

          {/* 4. Cách nối */}
          <Card className="mb-3 px-4 py-3">
            <h3 className="ja mb-1.5 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
              {t('learn.structure')}
            </h3>
            <ul className="space-y-1">
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
          </Card>

          {/* 5 + 7. Usage + Register gộp một dòng "dùng ở đâu" */}
          <Card className="mb-3 px-4 py-3">
            <h3 className="ja mb-1.5 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
              {t('learn.usage')}
            </h3>
            <ul className="mb-2 list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
              {grammar.usage.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
            <Pill>{t(`register.${grammar.register}`)}</Pill>
            {grammar.typicalContexts?.map((c) => (
              <span key={c} className="ja ml-1.5 text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                {c}
              </span>
            ))}
          </Card>

          {/* 6. Restrictions — hộp cảnh báo NGAY TRÊN ví dụ */}
          {grammar.restrictions.length > 0 && (
            <Card className="mb-3 px-4 py-3" >
              <h3 className="ja mb-1.5 text-[13px] font-semibold" style={{ color: 'var(--warn)' }}>
                {t('learn.restrictions')}
              </h3>
              <ul className="space-y-2">
                {grammar.restrictions.map((r, i) => (
                  <li key={i} className="text-[14px] leading-relaxed">
                    {r.ruleVi}
                    {r.counterExample && (
                      <span className="ja mt-1 block text-[14px]" style={{ color: 'var(--ink-faint)' }}>
                        {r.counterExample}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* 8. Examples */}
          <Card className="mb-3 px-4 py-3">
            <h3 className="ja mb-2 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
              {t('learn.examples')}
            </h3>
            <ul className="space-y-3">
              {grammar.examples.slice(0, showMore ? undefined : 2).map((ex, i) => (
                <li key={i}>
                  <JaText text={ex.ja} highlight={highlights} />
                  <p className="mt-0.5 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
                    {ex.vi}
                  </p>
                  {showMore && ex.whyNaturalVi && (
                    <p className="mt-1 text-[13px]" style={{ color: 'var(--accent)' }}>
                      {ex.whyNaturalVi}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {/* 9. Common mistake + dấu hiệu trong đề */}
          {(grammar.commonMistakes.length > 0 || grammar.keyClues.length > 0) && (
            <Card className="mb-3 px-4 py-3">
              {grammar.keyClues.length > 0 && (
                <>
                  <h3 className="mb-1 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
                    {t('learn.keyClues')}
                  </h3>
                  <ul className="mb-2 list-disc space-y-1 pl-5 text-[14px]">
                    {grammar.keyClues.map((c, i) => (
                      <li key={i} className="ja">
                        {c}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {grammar.commonMistakes.length > 0 && (
                <>
                  <h3 className="mb-1 text-[13px] font-semibold" style={{ color: 'var(--warn)' }}>
                    {t('learn.commonMistakes')}
                  </h3>
                  <ul className="list-disc space-y-1 pl-5 text-[14px]">
                    {grammar.commonMistakes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          )}

          {relatedPatterns && relatedPatterns.length > 0 && (
            <Card className="mb-3 px-4 py-3">
              <h3 className="mb-1.5 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
                {t('learn.confusedWith')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {relatedPatterns.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onOpenCompare?.(r.id)}
                    className="ja tap rounded-lg border px-3 py-2 text-[15px] hairline"
                    style={{ background: 'var(--paper-raised)' }}
                  >
                    {r.pattern}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="tap mb-3 w-full text-center text-[13px]"
            style={{ color: 'var(--ink-faint)' }}
            aria-expanded={showMore}
          >
            {t('learn.moreDetail')}
          </button>

          {onDone && (
            <div className="mt-2">
              <PrimaryButton onClick={onDone}>{t(doneLabelKey)}</PrimaryButton>
            </div>
          )}
        </>
      )}
    </article>
  );
}
