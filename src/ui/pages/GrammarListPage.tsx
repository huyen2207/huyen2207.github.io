import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GrammarFamily, MasteryState } from '@/domain/enums';
import { GRAMMAR_FAMILIES } from '@/domain/enums';
import { listGrammar } from '@/content/repository';
import { useAppStore } from '@/app/stores/appStore';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, NeedsReviewBadge } from '../components/primitives';
import { StatePill } from '../components/StatePill';

export default function GrammarListPage() {
  const ctx = useAppStore((s) => s.ctx);
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState<GrammarFamily | 'ALL'>('ALL');
  const [state, setState] = useState<MasteryState | 'ALL'>('ALL');

  const stateById = useMemo(() => {
    const map = new Map<string, MasteryState>();
    for (const m of ctx?.mastery ?? []) map.set(m.grammarId, m.state);
    return map;
  }, [ctx?.mastery]);

  const items = useMemo(() => {
    const list = listGrammar({
      search: search || undefined,
      families: family === 'ALL' ? undefined : [family],
    });
    return list.filter((g) => (state === 'ALL' ? true : (stateById.get(g.id) ?? 'UNSEEN') === state));
  }, [search, family, state, stateById]);

  return (
    <AppShell title={t('grammar.title')}>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('grammar.search')}
        aria-label={t('grammar.search')}
        className="tap mb-3 w-full rounded-xl border px-3.5 py-3 text-[16px] hairline"
        style={{ background: 'var(--paper-raised)', color: 'var(--ink)' }}
      />

      <div className="mb-3 flex gap-2">
        <select
          value={family}
          onChange={(e) => setFamily(e.target.value as GrammarFamily | 'ALL')}
          aria-label={t('grammar.filter.family')}
          className="tap flex-1 rounded-lg border px-2 py-2 text-[14px] hairline"
          style={{ background: 'var(--paper-raised)', color: 'var(--ink)' }}
        >
          <option value="ALL">{t('grammar.filter.family')}</option>
          {GRAMMAR_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {t(`family.${f}`)}
            </option>
          ))}
        </select>
        <select
          value={state}
          onChange={(e) => setState(e.target.value as MasteryState | 'ALL')}
          aria-label={t('grammar.filter.state')}
          className="tap flex-1 rounded-lg border px-2 py-2 text-[14px] hairline"
          style={{ background: 'var(--paper-raised)', color: 'var(--ink)' }}
        >
          <option value="ALL">{t('grammar.filter.state')}</option>
          {(['UNSEEN', 'INTRODUCED', 'RECOGNIZED', 'SHAKY', 'CONFUSED', 'COMPARABLE', 'EXAM_READY'] as MasteryState[]).map(
            (s) => (
              <option key={s} value={s}>
                {t(`state.${s}`)}
              </option>
            ),
          )}
        </select>
      </div>

      {items.length === 0 ? (
        <EmptyState titleKey="grammar.empty" />
      ) : (
        <ul className="space-y-2">
          {items.map((g) => (
            <li key={g.id}>
              <Link to={`/grammar/${g.id}`} className="block">
                <Card className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="ja text-[19px] font-semibold">{g.pattern}</span>
                    <StatePill state={stateById.get(g.id) ?? 'UNSEEN'} />
                  </div>
                  <p className="mt-1 text-[14px] leading-snug" style={{ color: 'var(--ink-soft)' }}>
                    {g.meaningVi}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]" style={{ color: 'var(--ink-faint)' }}>
                    <span>{t(`grammar.frequency.${g.examFrequency}`)}</span>
                    <span>·</span>
                    <span>{g.families.map((f) => t(`family.${f}`)).join(' / ')}</span>
                    {g.verificationStatus !== 'VERIFIED' && <NeedsReviewBadge />}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
