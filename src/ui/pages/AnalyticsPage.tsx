import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/app/stores/appStore';
import { cards, checkpoints, dashboardForDisplay, recommendations } from '@/app/services/analyticsService';
import type { WeeklyCheckpoint } from '@/domain/analytics';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, LoadingState, Pill, SecondaryButton } from '../components/primitives';
import { ProgressRing } from '../components/StatePill';
import { PhaseTimeline } from '../components/PhaseTimeline';

const COMPONENT_LABELS: Record<string, string> = {
  coverage: 'analytics.coverage',
  retention: 'analytics.retention',
  comparisonAccuracy: 'analytics.comparisonAccuracy',
  trapDetection: 'analytics.trapAccuracy',
  timedAccuracy: 'analytics.timedAccuracy',
  speedIndex: 'analytics.speed',
};

export default function AnalyticsPage() {
  const ctx = useAppStore((s) => s.ctx);
  const navigate = useNavigate();
  const [weekly, setWeekly] = useState<WeeklyCheckpoint[]>([]);

  useEffect(() => {
    void checkpoints().then(setWeekly);
  }, []);

  const metrics = useMemo(() => (ctx ? dashboardForDisplay(ctx) : null), [ctx]);
  const metricCards = useMemo(() => (ctx ? cards(ctx) : []), [ctx]);
  const recs = useMemo(() => (ctx ? recommendations(ctx) : []), [ctx]);

  if (!ctx || !metrics) {
    return (
      <AppShell title={t('analytics.title')}>
        <LoadingState />
      </AppShell>
    );
  }

  const readiness = metrics.readiness;
  const isFinal7 = ctx.timeline.mode === 'FINAL_7';

  return (
    <AppShell title={t('analytics.title')}>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Card className="px-3.5 py-3">
          <p className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
            {t('analytics.daysRemaining')}
          </p>
          <p className="tabular mt-0.5 text-[24px] font-semibold">{metrics.daysRemaining}</p>
        </Card>
        <Card className="px-3.5 py-3">
          <p className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
            {t('analytics.currentPhase')}
          </p>
          <p className="ja mt-0.5 text-[17px] font-semibold">{t(`phase.${metrics.currentPhase}`)}</p>
        </Card>
      </div>

      <div className="mb-5">
        <PhaseTimeline timeline={ctx.timeline} compact />
      </div>

      {isFinal7 && (
        <Card className="mb-4 px-4 py-3">
          <p className="text-[14px] font-medium">
            {t('analytics.final7.solid', {
              ready: metrics.masteryCounts.EXAM_READY ?? 0,
              comparable: metrics.masteryCounts.COMPARABLE ?? 0,
            })}
          </p>
        </Card>
      )}

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('analytics.readiness')}
        </h2>
        <Card className="px-4 py-4">
          {readiness?.ers === null || readiness === null ? (
            <p className="text-[14px]" style={{ color: 'var(--ink-soft)' }}>
              {t('analytics.notEnoughData')}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <ProgressRing value={readiness.ers} size={72} label={t('analytics.readiness')} />
                <div>
                  <Pill tone="accent">{readiness.band}</Pill>
                  {readiness.weakestComponent && (
                    <p className="mt-1.5 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                      {t('analytics.ersPulledDownBy', {
                        component: t(COMPONENT_LABELS[readiness.weakestComponent] ?? readiness.weakestComponent),
                      })}
                    </p>
                  )}
                </div>
              </div>

              {/* E2 — luôn hiển thị đủ 6 thành phần con */}
              <dl className="mt-4 grid grid-cols-3 gap-2">
                {Object.entries(readiness.components).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                      {t(COMPONENT_LABELS[key] ?? key)}
                    </dt>
                    <dd className="tabular text-[17px] font-semibold">
                      {value === null ? '—' : Math.round(value * 100)}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* E3 — dòng bắt buộc */}
              <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                {t('analytics.ersDisclaimer')}
              </p>
            </>
          )}
        </Card>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('analytics.threeSkills')}
        </h2>
        <Card className="px-4 py-3">
          {(['KNOW', 'COMPARE', 'DETECT'] as const).map((dim) => (
            <div key={dim} className="mb-2 flex items-center gap-3 last:mb-0">
              <span className="w-20 text-[13px] font-medium">{dim}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--rule)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${metrics.skillScores[dim] ?? 0}%`, background: 'var(--accent)' }}
                />
              </div>
              <span className="tabular w-10 text-right text-[14px]">
                {metrics.skillScores[dim] === null ? '—' : metrics.skillScores[dim]}
              </span>
            </div>
          ))}
        </Card>
      </section>

      {metricCards.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
            {t('analytics.title')}
          </h2>
          <ul className="space-y-2">
            {metricCards.map((c) => (
              <li key={c.metricKey}>
                <Card className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-1">
                    <span className="block text-[14px] font-medium">{t(c.metricKey)}</span>
                    <span className="tabular block text-[20px] font-semibold">{c.value ?? '—'}</span>
                  </span>
                  {c.action && (
                    <SecondaryButton onClick={() => navigate(routeForDrill(c.action!.drill.kind))}>
                      {t(c.action.labelKey)}
                    </SecondaryButton>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!metrics.coverageAudit.ok && (
        <Card className="mb-5 px-4 py-3">
          <p className="text-[14px] leading-relaxed">
            {t(metrics.coverageAudit.messageKey, metrics.coverageAudit.params)}
          </p>
          <div className="mt-2 flex gap-2">
            <SecondaryButton onClick={() => navigate('/settings')}>{t('analytics.coverage.fixTime')}</SecondaryButton>
          </div>
        </Card>
      )}

      {recs.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
            {t('rec.title')}
          </h2>
          <ul className="space-y-2">
            {recs.map((r) => (
              <li key={r.id}>
                <Card className="px-4 py-3">
                  <p className="text-[15px] font-medium">{t(r.targetKey, { type: r.targetParams.type ?? '' })}</p>
                  <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                    {t(r.reasonKey, r.reasonParams)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                      {t('rec.estimated', { n: r.estimatedMinutes })}
                    </span>
                    <span className="flex-1" />
                    <SecondaryButton onClick={() => navigate(routeForDrill(r.drill.kind))}>
                      {t('common.practiceNow')}
                    </SecondaryButton>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-5">
        <h2 className="ja mb-2 text-[15px] font-semibold">{t('checkpoint.title')}</h2>
        {weekly.length === 0 ? (
          <EmptyState titleKey="checkpoint.firstWeek" />
        ) : (
          <ul className="space-y-2">
            {[...weekly].reverse().map((c) => (
              <li key={c.id}>
                <Card className="px-4 py-3">
                  <p className="text-[14px] font-medium">{t('checkpoint.week', { n: c.weekIndex })}</p>
                  <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                    {t('checkpoint.learned', { count: c.grammarLearned.length })} ·{' '}
                    {t('checkpoint.accuracy', { value: Math.round(c.accuracy * 100) })}
                  </p>
                  {c.biggestWeaknessKey && (
                    <p className="mt-1 text-[13px]" style={{ color: 'var(--warn)' }}>
                      {t(c.biggestWeaknessKey)}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {metrics.contentGaps.length > 0 && (
        <Card className="mb-4 px-4 py-3">
          <p className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            {t('analytics.contentGaps', { count: metrics.contentGaps.length })}
          </p>
        </Card>
      )}
    </AppShell>
  );
}

function routeForDrill(kind: string): string {
  switch (kind) {
    case 'CONFUSION_PAIR':
      return '/compare';
    case 'TRAP_TYPE':
      return '/trap-lab';
    case 'REVIEW_TOP':
      return '/review';
    case 'LEARN':
      return '/today';
    default:
      return '/practice';
  }
}
