import { useMemo, useState } from 'react';
import { useAppStore } from '@/app/stores/appStore';
import { reviewCapacityOf } from '@/app/services/analyticsService';
import { buildDrill } from '@/app/services/sessionService';
import { selectDueItems } from '@/engines/review';
import { getGrammar, getQuestion } from '@/content/repository';
import type { SessionBlock } from '@/domain/session';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, Pill, PrimaryButton, SecondaryButton, ThumbBar } from '../components/primitives';
import { StatePill } from '../components/StatePill';
import { QuestionRunner } from '../components/QuestionRunner';

export default function ReviewPage() {
  const ctx = useAppStore((s) => s.ctx);
  const [block, setBlock] = useState<SessionBlock | null>(null);
  const [pos, setPos] = useState(0);

  const capacity = ctx ? Math.max(1, reviewCapacityOf(ctx)) : 0;
  const due = useMemo(
    () => (ctx ? selectDueItems(ctx.mastery, ctx.priorityContext, capacity) : []),
    [ctx, capacity],
  );
  const backlog = ctx?.weakness.reviewDebt ?? 0;

  function startAll(rapid = false) {
    if (!ctx) return;
    setBlock(
      buildDrill(
        ctx,
        rapid ? 'SPEED' : 'REVIEW_TOP',
        { grammarIds: due.map((d) => d.grammarId) },
        Math.min(due.length || 5, 10),
      ),
    );
    setPos(0);
  }

  if (block) {
    const item = block.items[pos];
    if (!item || item.kind !== 'QUESTION') {
      return (
        <AppShell title={t('review.title')} back hideNav>
          <EmptyState titleKey="common.empty" />
          <ThumbBar>
            <PrimaryButton onClick={() => setBlock(null)}>{t('common.finish')}</PrimaryButton>
          </ThumbBar>
        </AppShell>
      );
    }
    const q = getQuestion(item.questionId)!;
    return (
      <AppShell title={t('review.title')} back hideNav>
        <QuestionRunner
          key={q.id}
          question={q}
          delivery={item.timed ? 'TIMED' : 'PRACTICE'}
          blockType="REVIEW"
          index={pos}
          total={block.items.length}
          onNext={() => (pos + 1 >= block.items.length ? setBlock(null) : setPos((p) => p + 1))}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={t('review.title')}>
      {backlog > 0 && (
        <Card className="mb-4 px-4 py-3">
          <p className="text-[15px] font-medium">{t('review.backlog', { n: backlog })}</p>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            {t('review.backlogNote', { n: Math.min(backlog, capacity) })}
          </p>
        </Card>
      )}

      {due.length === 0 ? (
        <EmptyState titleKey="review.empty" />
      ) : (
        <ul className="space-y-2">
          {due.map((item) => {
            const g = getGrammar(item.grammarId);
            const m = ctx?.mastery.find((x) => x.grammarId === item.grammarId);
            return (
              <li key={item.grammarId}>
                <Card className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="ja text-[18px] font-semibold">{g?.pattern ?? item.grammarId}</span>
                    {m && <StatePill state={m.state} />}
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {item.reasons.map((r, i) => (
                      <li key={i} className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                        · {t(r.key, { ...r.params, state: t(`state.${m?.state ?? 'UNSEEN'}`) })}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2">
                    <Pill tone="accent">{item.suggestedDelivery}</Pill>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ThumbBar>
        <div className="space-y-2">
          <PrimaryButton onClick={() => startAll(false)} disabled={due.length === 0}>
            {t('common.start')}
          </PrimaryButton>
          {ctx?.timeline.currentPhase === 'PHASE_3_DETECT' && (
            <SecondaryButton className="w-full" onClick={() => startAll(true)}>
              {t('review.rapid')}
            </SecondaryButton>
          )}
        </div>
      </ThumbBar>
    </AppShell>
  );
}
