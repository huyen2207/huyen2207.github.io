import { useMemo, useState } from 'react';
import { useAppStore } from '@/app/stores/appStore';
import { buildDrill } from '@/app/services/sessionService';
import { getQuestion } from '@/content/repository';
import type { SessionBlock } from '@/domain/session';
import type { TrapType } from '@/domain/enums';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, PrimaryButton, SecondaryButton, ThumbBar } from '../components/primitives';
import { QuestionRunner } from '../components/QuestionRunner';

export default function TrapLabPage() {
  const ctx = useAppStore((s) => s.ctx);
  const [block, setBlock] = useState<SessionBlock | null>(null);
  const [pos, setPos] = useState(0);

  const trapStats = useMemo(() => {
    if (!ctx) return [];
    const counts = new Map<TrapType, number>();
    for (const a of ctx.attempts) {
      if (a.isCorrect) continue;
      const trap = getQuestion(a.questionId)?.trap?.trapType;
      if (trap) counts.set(trap, (counts.get(trap) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [ctx]);

  function start(trapType?: TrapType) {
    if (!ctx) return;
    setBlock(buildDrill(ctx, 'TRAP_TYPE', trapType ? { trapType } : {}, 5));
    setPos(0);
  }

  if (block) {
    const item = block.items[pos];
    if (!item || item.kind !== 'QUESTION') {
      return (
        <AppShell title={t('trapLab.title')} back hideNav>
          <EmptyState titleKey="common.empty" bodyKey="analytics.contentGaps" />
          <ThumbBar>
            <PrimaryButton onClick={() => setBlock(null)}>{t('common.finish')}</PrimaryButton>
          </ThumbBar>
        </AppShell>
      );
    }
    const q = getQuestion(item.questionId)!;
    return (
      <AppShell title={t('trapLab.title')} back hideNav>
        <QuestionRunner
          key={q.id}
          question={q}
          delivery="STUDY"
          blockType="APPLY"
          index={pos}
          total={block.items.length}
          onNext={() => (pos + 1 >= block.items.length ? setBlock(null) : setPos((p) => p + 1))}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={t('trapLab.title')} back>
      <p className="mb-4 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
        {t('trapLab.subtitle')}
      </p>

      {trapStats.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
            {t('trapLab.stats')}
          </h2>
          <ul className="space-y-2">
            {trapStats.slice(0, 5).map(([trap, count]) => (
              <li key={trap}>
                <Card className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-1 text-[15px]">{t(`trap.${trap}`)}</span>
                  <span className="tabular text-[14px]" style={{ color: 'var(--ink-faint)' }}>
                    {t('mistakes.times', { n: count })}
                  </span>
                  <SecondaryButton onClick={() => start(trap)}>{t('common.practiceNow')}</SecondaryButton>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ThumbBar>
        <PrimaryButton onClick={() => start()}>{t('common.start')}</PrimaryButton>
      </ThumbBar>
    </AppShell>
  );
}
