import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getGrammarView } from '@/content/repository';
import { useAppStore } from '@/app/stores/appStore';
import { grammarInsight } from '@/app/services/analyticsService';
import { canPromoteToExamReady } from '@/engines/mastery';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState } from '../components/primitives';
import { LearnCard } from '../components/LearnCard';
import { StatePill } from '../components/StatePill';

export default function GrammarDetailPage() {
  const { id = '' } = useParams();
  const ctx = useAppStore((s) => s.ctx);
  const navigate = useNavigate();
  const grammar = getGrammarView(id);

  const mastery = ctx?.mastery.find((m) => m.grammarId === id);
  const insight = useMemo(() => (ctx && grammar ? grammarInsight(ctx, id) : null), [ctx, grammar, id]);
  const missing = useMemo(() => {
    if (!ctx || !mastery) return [];
    const prior = ctx.attempts.filter((a) => a.grammarId === id);
    return canPromoteToExamReady(mastery, { priorAttempts: prior, globalGuessRate: ctx.weakness.guessRate }).missingVi;
  }, [ctx, mastery, id]);

  if (!grammar) {
    return (
      <AppShell title={t('grammar.title')} back>
        <EmptyState titleKey="error.invalidData" />
      </AppShell>
    );
  }

  const confusedEntries = Object.entries(mastery?.confusedWith ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <AppShell title={grammar.pattern} back>
      {mastery && (
        <div className="mb-3">
          <StatePill state={mastery.state} />
        </div>
      )}

      <LearnCard
        grammar={grammar}
        relatedPatterns={grammar.curatedConfusedIds
          .map((cid) => getGrammarView(cid))
          .filter(Boolean)
          .map((g) => ({ id: g!.id, pattern: g!.pattern }))}
        onOpenCompare={() => navigate('/compare')}
      />

      {insight && (
        <Card className="mt-4 px-4 py-3">
          <h3 className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
            {t('grammarDetail.skills')}
          </h3>
          <dl className="space-y-2">
            {(['know', 'compare', 'detect'] as const).map((dim) => {
              const value = insight.skills[dim];
              const evidence = insight.skills.evidence[dim.toUpperCase() as 'KNOW' | 'COMPARE' | 'DETECT'];
              return (
                <div key={dim} className="flex items-center gap-3">
                  <dt className="w-20 text-[13px] font-medium uppercase" style={{ color: 'var(--ink-soft)' }}>
                    {dim}
                  </dt>
                  <dd className="flex flex-1 items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--rule)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${value ?? 0}%`, background: 'var(--accent)' }}
                      />
                    </div>
                    <span className="tabular w-14 text-right text-[13px]">
                      {value === null ? '—' : value}
                      {evidence === 'THIN' && <span className="ml-1 text-[10px]">·</span>}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
          {(insight.skills.evidence.KNOW === 'THIN' ||
            insight.skills.evidence.COMPARE === 'THIN' ||
            insight.skills.evidence.DETECT === 'THIN') && (
            <p className="mt-2 text-[12px]" style={{ color: 'var(--ink-faint)' }}>
              · {t('grammarDetail.notEnough')}
            </p>
          )}
        </Card>
      )}

      {confusedEntries.length > 0 && (
        <Card className="mt-3 px-4 py-3">
          <h3 className="mb-1.5 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
            {t('grammarDetail.confusedWithYou')}
          </h3>
          <ul className="space-y-1">
            {confusedEntries.map(([pid, count]) => (
              <li key={pid} className="flex items-center justify-between text-[14px]">
                <span className="ja">{getGrammarView(pid)?.pattern ?? pid}</span>
                <span className="tabular" style={{ color: 'var(--ink-faint)' }}>
                  {t('mistakes.times', { n: count })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {missing.length > 0 && mastery && mastery.state !== 'EXAM_READY' && (
        <Card className="mt-3 px-4 py-3">
          <h3 className="mb-1.5 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
            {t('grammarDetail.missingForExamReady')}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-[14px]">
            {missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
