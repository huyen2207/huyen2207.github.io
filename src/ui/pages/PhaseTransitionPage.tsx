import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/app/stores/appStore';
import { markTransitionSeen, phaseTransition } from '@/app/services/analyticsService';
import type { PhaseTransitionSummary } from '@/domain/analytics';
import { getGrammar } from '@/content/repository';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, PrimaryButton, ThumbBar } from '../components/primitives';

export default function PhaseTransitionPage() {
  const ctx = useAppStore((s) => s.ctx);
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PhaseTransitionSummary | null>(null);

  useEffect(() => {
    if (!ctx) return;
    void phaseTransition(ctx).then(setSummary);
  }, [ctx]);

  if (!ctx || !summary) {
    return (
      <AppShell title={t('transition.complete')} hideNav>
        <EmptyState titleKey="common.empty" />
      </AppShell>
    );
  }

  const toCompare = summary.toPhase === 'PHASE_2_COMPARE';

  return (
    <AppShell hideNav>
      <div className="pt-8 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>
          {t('transition.complete')}
        </p>
        <p className="ja mt-4 text-[26px] font-semibold">{t(`phase.${summary.fromPhase}`)}</p>
        <p className="my-2 text-[22px]" style={{ color: 'var(--ink-faint)' }}>
          ↓
        </p>
        <p className="ja text-[30px] font-semibold" style={{ color: 'var(--accent)' }}>
          {t(`phase.${summary.toPhase}`)}
        </p>
      </div>

      <Card className="mt-8 space-y-1.5 px-4 py-4">
        <p className="text-[15px]">{t('transition.known', { count: summary.knownCount })}</p>
        <p className="text-[15px]">{t('transition.shaky', { count: summary.shakyCount })}</p>
        <p className="text-[15px]">{t('transition.needsReview', { count: summary.needsReviewCount })}</p>
      </Card>

      <Card className="mt-3 px-4 py-4">
        <p className="text-[15px] leading-relaxed">
          {toCompare ? t('transition.toCompare') : t('transition.toDetect')}
        </p>
      </Card>

      {summary.confusionMap.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
            {t('transition.confusionMap')}
          </h2>
          <Card className="px-4 py-3">
            <ul className="space-y-1.5">
              {summary.confusionMap.map((p) => (
                <li key={`${p.a}-${p.b}`} className="flex items-center justify-between text-[14px]">
                  <span className="ja">
                    {getGrammar(p.a)?.pattern} ↔ {getGrammar(p.b)?.pattern}
                  </span>
                  <span className="tabular" style={{ color: 'var(--ink-faint)' }}>
                    {p.total}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <ThumbBar>
        <PrimaryButton
          onClick={async () => {
            await markTransitionSeen(ctx.timeline.currentPhase);
            navigate('/today');
          }}
        >
          {t('transition.continue')}
        </PrimaryButton>
      </ThumbBar>
    </AppShell>
  );
}
