import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/app/stores/appStore';
import { errorRecords, notebook } from '@/app/services/analyticsService';
import { buildDrill } from '@/app/services/sessionService';
import { wrongQuestionsToRedo } from '@/app/services/mistakeRedoService';
import { getGrammar, getQuestion } from '@/content/repository';
import type { SessionBlock } from '@/domain/session';
import type { DrillKind } from '@/domain/enums';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, Pill, PrimaryButton, SecondaryButton, ThumbBar } from '../components/primitives';
import { QuestionRunner, type AnswerSnapshot } from '../components/QuestionRunner';

const TABS = [
  { key: 'recent', labelKey: 'mistakes.tab.recent' },
  { key: 'recurring', labelKey: 'mistakes.tab.recurring' },
  { key: 'confusion', labelKey: 'mistakes.tab.confusion' },
  { key: 'trap', labelKey: 'mistakes.tab.trap' },
  { key: 'careless', labelKey: 'mistakes.tab.careless' },
  { key: 'resolved', labelKey: 'mistakes.tab.resolved' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function MistakesPage() {
  const ctx = useAppStore((s) => s.ctx);
  const refresh = useAppStore((s) => s.refresh);
  const [tab, setTab] = useState<TabKey>('recent');
  const [block, setBlock] = useState<SessionBlock | null>(null);
  const [pos, setPos] = useState(0);
  // Làm lại ĐÚNG những câu đã sai (không phải drill mới sinh ra).
  const [redo, setRedo] = useState<string[] | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, AnswerSnapshot>>({});

  // Đọc lại trạng thái: vừa học xong buổi chính rồi sang đây thì ảnh chụp lúc mở app đã cũ.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrong = useMemo(() => (ctx ? wrongQuestionsToRedo(ctx) : []), [ctx]);

  function startRedo(ids: string[]) {
    setRedo(ids);
    setPos(0);
    setSnapshots({});
  }
  function endRedo() {
    setRedo(null);
    void refresh();
  }

  const lines = useMemo(() => (ctx ? notebook(ctx) : []), [ctx]);
  const records = useMemo(() => (ctx ? errorRecords(ctx) : []), [ctx]);

  const filtered = useMemo(() => {
    switch (tab) {
      case 'recurring':
        return records.filter((r) => r.recurrenceCount >= 2 && !r.resolved);
      case 'confusion':
        return records.filter((r) => r.errorType === 'SIMILAR_GRAMMAR_CONFUSION' && !r.resolved);
      case 'trap':
        return records.filter((r) => r.errorType === 'TRAP_ERROR' && !r.resolved);
      case 'careless':
        return records.filter((r) => r.errorType === 'CARELESS_ERROR' && !r.resolved);
      case 'resolved':
        return records.filter((r) => r.resolved);
      default:
        return records.filter((r) => !r.resolved).slice(0, 20);
    }
  }, [records, tab]);

  function practice(kind: DrillKind, payload: Record<string, unknown>) {
    if (!ctx) return;
    setBlock(buildDrill(ctx, kind, payload, 5));
    setPos(0);
  }

  if (redo) {
    const q = getQuestion(redo[pos]);
    if (!q) {
      endRedo();
      return null;
    }
    return (
      <AppShell
        title={t('mistakes.redoTitle')}
        back
        hideNav
        onBack={() => (pos <= 0 ? endRedo() : setPos((p) => p - 1))}
      >
        <QuestionRunner
          key={q.id}
          question={q}
          delivery="PRACTICE"
          blockType="ANALYZE_ERROR"
          index={pos}
          total={redo.length}
          prior={snapshots[q.id]}
          onAnswered={(_r, qq, snap) => setSnapshots((prev) => ({ ...prev, [qq.id]: snap }))}
          onNext={() => (pos + 1 >= redo.length ? endRedo() : setPos((p) => p + 1))}
        />
      </AppShell>
    );
  }

  if (block) {
    const item = block.items[pos];
    if (!item || item.kind !== 'QUESTION') {
      return (
        <AppShell title={t('mistakes.title')} back hideNav>
          <EmptyState titleKey="common.empty" />
          <ThumbBar>
            <PrimaryButton onClick={() => setBlock(null)}>{t('common.finish')}</PrimaryButton>
          </ThumbBar>
        </AppShell>
      );
    }
    const q = getQuestion(item.questionId)!;
    return (
      <AppShell title={t('mistakes.title')} back hideNav>
        <QuestionRunner
          key={q.id}
          question={q}
          delivery={item.delivery}
          blockType="ANALYZE_ERROR"
          index={pos}
          total={block.items.length}
          onNext={() => (pos + 1 >= block.items.length ? setBlock(null) : setPos((p) => p + 1))}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={t('mistakes.title')}>
      {lines.length === 0 ? (
        <EmptyState titleKey="mistakes.empty" bodyKey="mistakes.emptyHint" ja={t('mistakes.emptyJa')} />
      ) : (
        <section className="mb-5">
          <ul className="space-y-2">
            {lines.map((line) => (
              <li key={line.id}>
                <Card className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    {line.severity === 3 && <span aria-label="cờ đỏ">🔴</span>}
                    <p className="flex-1 text-[15px] leading-relaxed">{t(line.messageKey, translateParams(line.params))}</p>
                  </div>
                  {line.drill && (
                    <div className="mt-2">
                      <SecondaryButton
                        onClick={() => practice(line.drill!.kind, line.drill!.payload as Record<string, unknown>)}
                      >
                        {t('common.practiceNow')}
                      </SecondaryButton>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('mistakes.redoTitle')}
        </h2>
        {wrong.length === 0 ? (
          <Card className="px-4 py-3">
            <p className="text-[14px]">{t('mistakes.redoEmpty')}</p>
          </Card>
        ) : (
          <>
            <p className="mb-2 text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              {t('mistakes.redoNote')}
            </p>
            <div className="mb-3">
              <PrimaryButton onClick={() => startRedo(wrong.map((w) => w.question.id))}>
                {t('mistakes.redoAll', { n: wrong.length })}
              </PrimaryButton>
            </div>
            <ul className="space-y-2">
              {wrong.map((w) => (
                <li key={w.question.id}>
                  <Card className="px-4 py-3">
                    <p className="ja ja-sentence mb-2">{w.question.stemJa}</p>
                    <dl className="space-y-1 text-[13px]">
                      {w.chosenLabel && (
                        <div className="flex gap-2">
                          <dt style={{ color: 'var(--ink-faint)' }}>{t('mistakes.youChose')}</dt>
                          <dd className="ja" style={{ color: 'var(--seal)' }}>{w.chosenLabel}</dd>
                        </div>
                      )}
                      {w.correctLabel && (
                        <div className="flex gap-2">
                          <dt style={{ color: 'var(--ink-faint)' }}>{t('mistakes.correctWas')}</dt>
                          <dd className="ja" style={{ color: 'var(--accent)' }}>{w.correctLabel}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="mt-2 flex items-center gap-2">
                      <Pill tone="warn">{t('mistakes.wrongTimes', { n: w.wrongCount })}</Pill>
                      <span className="flex-1" />
                      <SecondaryButton onClick={() => startRedo([w.question.id])}>{t('mistakes.redoOne')}</SecondaryButton>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="scroll-x -mx-4 mb-3 px-4">
        <div className="flex w-max gap-2">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              aria-pressed={tab === tb.key}
              className="tap rounded-lg border px-3 py-2 text-[13px] hairline"
              style={{
                background: tab === tb.key ? 'var(--accent-soft)' : 'var(--paper-raised)',
                color: tab === tb.key ? 'var(--accent)' : 'var(--ink-soft)',
              }}
            >
              {t(tb.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState titleKey="common.empty" />
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const q = getQuestion(r.questionIds[0]);
            return (
              <li key={r.errorId}>
                <Card className="px-4 py-3">
                  {q && <p className="ja ja-sentence mb-2">{q.stemJa}</p>}
                  <dl className="space-y-1 text-[13px]">
                    <div className="flex gap-2">
                      <dt style={{ color: 'var(--ink-faint)' }}>{t('mistakes.errorType')}</dt>
                      <dd>{t(`errorType.${r.errorType}`)}</dd>
                    </div>
                    {r.confusedWithGrammarId && (
                      <div className="flex gap-2">
                        <dt style={{ color: 'var(--ink-faint)' }}>{t('mistakes.confusedWith')}</dt>
                        <dd className="ja">{getGrammar(r.confusedWithGrammarId)?.pattern}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-2 flex items-center gap-2">
                    <Pill tone={r.resolved ? 'ok' : 'warn'}>{t('mistakes.times', { n: r.recurrenceCount })}</Pill>
                    {r.relapsed && <Pill tone="warn">RELAPSE</Pill>}
                    <span className="flex-1" />
                    {!r.resolved && (
                      <SecondaryButton onClick={() => practice('ERROR_TYPE', { grammarIds: r.grammarIds })}>
                        {t('common.practiceNow')}
                      </SecondaryButton>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}

function translateParams(params: Record<string, string | number>): Record<string, string | number> {
  const out = { ...params };
  if (typeof out.type === 'string' && out.type.includes('_')) {
    out.type = t(`errorType.${out.type}`) !== `errorType.${out.type}` ? t(`errorType.${out.type}`) : t(`qtype.${out.type}`);
  }
  return out;
}
