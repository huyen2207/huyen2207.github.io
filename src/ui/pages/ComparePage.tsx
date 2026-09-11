import { useMemo, useState } from 'react';
import { useAppStore } from '@/app/stores/appStore';
import { confusionMatrix } from '@/app/services/analyticsService';
import { buildDrill } from '@/app/services/sessionService';
import { getComparisonSet, getGrammar, getQuestion, listComparisonSets } from '@/content/repository';
import type { SessionBlock } from '@/domain/session';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, Pill, PrimaryButton, SecondaryButton, ThumbBar } from '../components/primitives';
import { ComparisonTable } from '../components/ComparisonTable';
import { QuestionRunner } from '../components/QuestionRunner';

type Stage = 'PICK' | 'TRY' | 'TABLE' | 'DRILL' | 'DONE';

export default function ComparePage() {
  const ctx = useAppStore((s) => s.ctx);
  const [setId, setSetId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('PICK');
  const [drill, setDrill] = useState<SessionBlock | null>(null);
  const [drillPos, setDrillPos] = useState(0);

  const matrix = useMemo(() => (ctx ? confusionMatrix(ctx) : null), [ctx]);
  const sets = listComparisonSets();

  const confusedFirst = useMemo(() => {
    if (!ctx) return sets;
    const confusedIds = new Set(ctx.mastery.filter((m) => m.state === 'CONFUSED').map((m) => m.grammarId));
    return [...sets].sort(
      (a, b) =>
        b.grammarIds.filter((g) => confusedIds.has(g)).length - a.grammarIds.filter((g) => confusedIds.has(g)).length,
    );
  }, [ctx, sets]);

  const set = setId ? getComparisonSet(setId) : null;
  const opener = set?.openerQuestionId ? getQuestion(set.openerQuestionId) : undefined;

  function startSet(id: string) {
    setSetId(id);
    const s = getComparisonSet(id);
    setStage(s?.openerQuestionId ? 'TRY' : 'TABLE');
  }

  function startDrill() {
    if (!ctx || !set) return;
    const questionIds = [...(set.minimalPairQuestionIds ?? []), ...(set.whyNotQuestionIds ?? [])];
    const items = questionIds
      .map((qid) => getQuestion(qid))
      .filter(Boolean)
      .map((q) => ({
        kind: 'QUESTION' as const,
        questionId: q!.id,
        timed: false,
        delivery: 'STUDY' as const,
        grammarId: q!.targetGrammarIds[0],
      }));
    setDrill({ type: 'COMPARE', budgetMinutes: 6, items, completed: false });
    setDrillPos(0);
    setStage('DRILL');
  }

  function practicePair(from: string, to: string) {
    if (!ctx) return;
    const block = buildDrill(ctx, 'CONFUSION_PAIR', { from, to }, 4);
    setDrill(block);
    setDrillPos(0);
    setStage('DRILL');
  }

  if (stage === 'PICK') {
    return (
      <AppShell title={t('compare.title')}>
        {matrix && matrix.cells.length > 0 && (
          <section className="mb-5">
            <h2 className="ja mb-2 text-[15px] font-semibold">{t('compare.yourConfusions')}</h2>
            <ul className="space-y-2">
              {matrix.cells.slice(0, 5).map((pair) => (
                <li key={`${pair.from}-${pair.to}`}>
                  <Card className="flex items-center gap-3 px-4 py-3">
                    <span className="flex-1">
                      <span className="ja text-[16px]">{getGrammar(pair.from)?.pattern}</span>
                      <span className="mx-1.5" style={{ color: 'var(--ink-faint)' }}>
                        ↔
                      </span>
                      <span className="ja text-[16px]">{getGrammar(pair.to)?.pattern}</span>
                      <span className="ml-2 text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                        {t('compare.confusionCount', { n: pair.count })}
                      </span>
                    </span>
                    <SecondaryButton onClick={() => practicePair(pair.from, pair.to)}>
                      {t('common.practiceNow')}
                    </SecondaryButton>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('compare.pickSet')}
        </h2>
        {confusedFirst.length === 0 ? (
          <EmptyState titleKey="compare.noSets" />
        ) : (
          <ul className="space-y-2">
            {confusedFirst.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => startSet(s.id)} className="block w-full text-left">
                  <Card className="px-4 py-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      {s.grammarIds.map((gid, i) => (
                        <span key={gid} className="ja text-[17px] font-semibold">
                          {getGrammar(gid)?.pattern}
                          {i < s.grammarIds.length - 1 && (
                            <span className="mx-1 text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                              vs
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                    <Pill>{t(`family.${s.familyHint}`)}</Pill>
                  </Card>
                </button>
              </li>
            ))}
          </ul>
        )}
      </AppShell>
    );
  }

  if (stage === 'TRY' && opener) {
    return (
      <AppShell title={t('compare.tryFirst')} back hideNav>
        <Card className="mb-3 px-4 py-3">
          <p className="text-[14px]">{t('compare.tryFirstHint')}</p>
        </Card>
        <QuestionRunner
          question={opener}
          delivery="STUDY"
          blockType="COMPARE"
          onNext={() => setStage('TABLE')}
          nextLabelKey="compare.table"
        />
      </AppShell>
    );
  }

  if (stage === 'TABLE' && set) {
    return (
      <AppShell title={t('compare.table')} back hideNav>
        <ComparisonTable set={set} />
        <ThumbBar>
          <PrimaryButton onClick={startDrill}>{t('compare.minimalPair')}</PrimaryButton>
        </ThumbBar>
      </AppShell>
    );
  }

  if (stage === 'DRILL' && drill) {
    const item = drill.items[drillPos];
    if (!item || item.kind !== 'QUESTION') {
      return (
        <AppShell title={t('compare.title')} back hideNav>
          <EmptyState titleKey="common.empty" />
          <ThumbBar>
            <PrimaryButton onClick={() => setStage('PICK')}>{t('common.finish')}</PrimaryButton>
          </ThumbBar>
        </AppShell>
      );
    }
    const q = getQuestion(item.questionId)!;
    return (
      <AppShell title={t('compare.whyNot')} back hideNav>
        <QuestionRunner
          key={q.id}
          question={q}
          delivery="STUDY"
          blockType="COMPARE"
          index={drillPos}
          total={drill.items.length}
          onNext={() => {
            if (drillPos + 1 >= drill.items.length) setStage('DONE');
            else setDrillPos((p) => p + 1);
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={t('compare.title')} back hideNav>
      <EmptyState titleKey="complete.title" />
      <ThumbBar>
        <PrimaryButton
          onClick={() => {
            setStage('PICK');
            setSetId(null);
            setDrill(null);
          }}
        >
          {t('common.finish')}
        </PrimaryButton>
      </ThumbBar>
    </AppShell>
  );
}
