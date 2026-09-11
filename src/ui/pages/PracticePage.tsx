import { useState } from 'react';
import { useAppStore } from '@/app/stores/appStore';
import { buildDrill } from '@/app/services/sessionService';
import { getQuestion } from '@/content/repository';
import type { SessionBlock } from '@/domain/session';
import type { DrillKind } from '@/domain/enums';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, PrimaryButton, ThumbBar } from '../components/primitives';
import { QuestionRunner } from '../components/QuestionRunner';

const MODES: Array<{ key: DrillKind; labelKey: string; payload: Record<string, unknown> }> = [
  { key: 'REVIEW_TOP', labelKey: 'practice.quick', payload: {} },
  { key: 'ERROR_TYPE', labelKey: 'practice.weak', payload: {} },
  { key: 'FAMILY', labelKey: 'practice.family', payload: {} },
  { key: 'CONFUSION_PAIR', labelKey: 'practice.comparison', payload: {} },
  { key: 'TRAP_TYPE', labelKey: 'practice.trap', payload: {} },
  { key: 'SPEED', labelKey: 'practice.timed', payload: {} },
];

export default function PracticePage() {
  const ctx = useAppStore((s) => s.ctx);
  const [count, setCount] = useState(5);
  const [block, setBlock] = useState<SessionBlock | null>(null);
  const [pos, setPos] = useState(0);

  function start(kind: DrillKind, payload: Record<string, unknown>) {
    if (!ctx) return;
    const enriched =
      kind === 'ERROR_TYPE'
        ? { grammarIds: ctx.weakness.errorGrammarIds.length ? ctx.weakness.errorGrammarIds : undefined }
        : kind === 'CONFUSION_PAIR' && ctx.weakness.topConfusionPairs[0]
          ? { from: ctx.weakness.topConfusionPairs[0].from, to: ctx.weakness.topConfusionPairs[0].to }
          : payload;
    setBlock(buildDrill(ctx, kind, enriched, count));
    setPos(0);
  }

  if (block) {
    const item = block.items[pos];
    if (!item || item.kind !== 'QUESTION') {
      return (
        <AppShell title={t('practice.title')} back hideNav>
          <EmptyState titleKey="common.empty" bodyKey="analytics.contentGaps" />
          <ThumbBar>
            <PrimaryButton onClick={() => setBlock(null)}>{t('common.finish')}</PrimaryButton>
          </ThumbBar>
        </AppShell>
      );
    }
    const q = getQuestion(item.questionId)!;
    return (
      <AppShell title={t('practice.title')} back hideNav>
        <QuestionRunner
          key={q.id}
          question={q}
          delivery={item.delivery}
          blockType="APPLY"
          index={pos}
          total={block.items.length}
          onNext={() => (pos + 1 >= block.items.length ? setBlock(null) : setPos((p) => p + 1))}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={t('practice.title')} back>
      <Card className="mb-4 px-4 py-3">
        <p className="text-[14px] leading-relaxed">{t('practice.note')}</p>
      </Card>

      <div className="mb-4 flex items-center gap-3">
        <span className="text-[14px]">{t('practice.count')}</span>
        <div className="flex gap-2">
          {[5, 10, 15].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              aria-pressed={count === n}
              className="tap rounded-lg border px-3.5 py-2 text-[14px] hairline"
              style={{
                background: count === n ? 'var(--accent-soft)' : 'var(--paper-raised)',
                color: count === n ? 'var(--accent)' : 'var(--ink-soft)',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-2">
        {MODES.map((m) => (
          <li key={m.labelKey}>
            <button type="button" onClick={() => start(m.key, m.payload)} className="block w-full text-left">
              <Card className="px-4 py-3.5">
                <span className="text-[16px] font-medium">{t(m.labelKey)}</span>
              </Card>
            </button>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
