import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '@/app/stores/appStore';
import { listGrammar } from '@/content/repository';
import type { GrammarFamily, MasteryState } from '@/domain/enums';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState } from '../components/primitives';

type Filter = 'ALL' | 'UNSEEN' | 'WEAK' | 'CONFUSED' | 'READY' | 'NEEDS_REVIEW';

const STATE_COLOR: Record<MasteryState, string> = {
  UNSEEN: 'var(--rule)',
  INTRODUCED: 'var(--accent-soft)',
  RECOGNIZED: 'var(--accent-soft)',
  SHAKY: 'var(--warn-soft)',
  CONFUSED: 'var(--warn-soft)',
  COMPARABLE: 'var(--ok-soft)',
  EXAM_READY: 'var(--ok)',
};

export default function GrammarMapPage() {
  const ctx = useAppStore((s) => s.ctx);
  const [filter, setFilter] = useState<Filter>('ALL');

  const stateById = useMemo(() => {
    const map = new Map<string, MasteryState>();
    for (const m of ctx?.mastery ?? []) map.set(m.grammarId, m.state);
    return map;
  }, [ctx?.mastery]);

  const all = listGrammar();
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of all) {
      const s = stateById.get(g.id) ?? 'UNSEEN';
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [all, stateById]);

  const byFamily = useMemo(() => {
    const map = new Map<GrammarFamily, typeof all>();
    for (const g of all) {
      const s = stateById.get(g.id) ?? 'UNSEEN';
      const keep =
        filter === 'ALL' ||
        (filter === 'UNSEEN' && s === 'UNSEEN') ||
        (filter === 'WEAK' && (s === 'SHAKY' || s === 'INTRODUCED')) ||
        (filter === 'CONFUSED' && s === 'CONFUSED') ||
        (filter === 'READY' && (s === 'EXAM_READY' || s === 'COMPARABLE')) ||
        (filter === 'NEEDS_REVIEW' && g.verificationStatus !== 'VERIFIED');
      if (!keep) continue;
      for (const f of g.families) map.set(f, [...(map.get(f) ?? []), g]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [all, filter, stateById]);

  const FILTERS: Filter[] = ['ALL', 'UNSEEN', 'WEAK', 'CONFUSED', 'READY', 'NEEDS_REVIEW'];

  return (
    <AppShell title={t('grammarMap.title')} back>
      <Card className="mb-4 px-4 py-3">
        <p className="text-[14px] leading-relaxed">
          {t('grammarMap.summary', {
            total: all.length,
            ready: counts.EXAM_READY ?? 0,
            comparable: counts.COMPARABLE ?? 0,
            recognized: counts.RECOGNIZED ?? 0,
            shaky: (counts.SHAKY ?? 0) + (counts.CONFUSED ?? 0),
            unseen: counts.UNSEEN ?? 0,
          })}
        </p>
      </Card>

      <div className="scroll-x -mx-4 mb-4 px-4">
        <div className="flex w-max gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className="tap rounded-lg border px-3 py-2 text-[13px] hairline"
              style={{
                background: filter === f ? 'var(--accent-soft)' : 'var(--paper-raised)',
                color: filter === f ? 'var(--accent)' : 'var(--ink-soft)',
              }}
            >
              {f === 'ALL'
                ? t('common.all')
                : f === 'WEAK'
                  ? t('state.SHAKY')
                  : f === 'READY'
                    ? t('state.EXAM_READY')
                    : f === 'NEEDS_REVIEW'
                      ? t('common.needsReview')
                      : t(`state.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {byFamily.length === 0 ? (
        <EmptyState titleKey="grammar.empty" />
      ) : (
        <div className="space-y-4">
          {byFamily.map(([family, items]) => (
            <section key={family}>
              <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
                {t(`family.${family}`)} · {items.length}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {items.map((g) => {
                  const s = stateById.get(g.id) ?? 'UNSEEN';
                  return (
                    <Link key={g.id} to={`/grammar/${g.id}`}>
                      <div
                        className="rounded-lg border px-2.5 py-2 hairline"
                        style={{ background: STATE_COLOR[s] }}
                        title={t(`state.${s}`)}
                      >
                        <span className="ja block truncate text-[15px] font-medium">{g.pattern}</span>
                        <span className="block text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                          {t(`state.${s}`)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
