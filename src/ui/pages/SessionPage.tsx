import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DailySession, SessionItem } from '@/domain/session';
import type { SessionBlockType } from '@/domain/enums';
import type { GradeResult } from '@/engines/exercise';
import { useAppStore } from '@/app/stores/appStore';
import { markLearnCard } from '@/app/services/answerService';
import { completeSession, markSessionStarted, saveSession, refreshAnalyze } from '@/app/services/sessionService';
import { finalizeSession } from '@/app/services/analyticsService';
import { getComparisonSet, getGrammarView, getQuestion } from '@/content/repository';
import { attemptRepo } from '@/storage/repositories';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, PrimaryButton, SecondaryButton, ThumbBar } from '../components/primitives';
import { QuestionRunner } from '../components/QuestionRunner';
import { LearnCard } from '../components/LearnCard';
import { ComparisonTable } from '../components/ComparisonTable';

interface FlatItem {
  item: SessionItem;
  blockIndex: number;
  itemIndex: number;
  blockType: SessionBlockType;
}

export default function SessionPage() {
  const ctx = useAppStore((s) => s.ctx);
  const session = useAppStore((s) => s.session);
  const setSession = useAppStore((s) => s.setSession);
  const refresh = useAppStore((s) => s.refresh);
  const navigate = useNavigate();

  const [pos, setPos] = useState(0);
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState<GradeResult[]>([]);
  const [compareRevealed, setCompareRevealed] = useState(false);

  const flat = useMemo<FlatItem[]>(() => {
    if (!session) return [];
    const out: FlatItem[] = [];
    session.blocks.forEach((block, blockIndex) => {
      block.items.forEach((item, itemIndex) => {
        out.push({ item, blockIndex, itemIndex, blockType: block.type as FlatItem['blockType'] });
      });
    });
    return out;
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let start = 0;
    for (let i = 0; i < flat.length; i++) {
      if (
        flat[i].blockIndex > session.cursor.blockIndex ||
        (flat[i].blockIndex === session.cursor.blockIndex && flat[i].itemIndex >= session.cursor.itemIndex)
      ) {
        start = i;
        break;
      }
      start = i + 1;
    }
    setPos(Math.min(start, Math.max(0, flat.length - 1)));
    if (session.status === 'PLANNED') {
      void markSessionStarted(session, new Date()).then(setSession);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, flat.length]);

  const advance = useCallback(async () => {
    if (!session) return;
    const next = pos + 1;
    setCompareRevealed(false);
    if (next >= flat.length) {
      const done = await completeSession(session, new Date());
      setSession(done);
      if (ctx) await finalizeSession(ctx);
      setFinished(true);
      return;
    }
    const target = flat[next];
    let moved: DailySession = { ...session, cursor: { blockIndex: target.blockIndex, itemIndex: target.itemIndex } };
    await saveSession(moved);

    // Sắp bước vào khối "Chữa lỗi" → dựng lại nội dung theo các câu VỪA làm.
    // Buổi học sinh từ đầu ngày nên nếu không làm mới, nó vẫn báo "không có câu sai".
    if (ctx && target.blockType === 'ANALYZE_ERROR' && flat[pos]?.blockType !== 'ANALYZE_ERROR') {
      moved = await refreshAnalyze(ctx, moved);
      setSession(moved);
    }
    setPos(next);
  }, [ctx, flat, pos, session, setSession]);

  if (!ctx || !session) {
    return (
      <AppShell title={t('today.title')} back hideNav>
        <EmptyState titleKey="error.noSession" />
      </AppShell>
    );
  }

  if (finished) {
    return <SessionComplete results={results} onExit={() => void refresh().then(() => navigate('/today'))} />;
  }

  if (flat.length === 0) {
    return (
      <AppShell title={t('today.title')} back hideNav>
        <EmptyState titleKey="error.noSession" />
      </AppShell>
    );
  }

  const current = flat[Math.min(pos, flat.length - 1)];
  const blockLabel = t(`block.${current.blockType}`);

  return (
    <AppShell
      title={blockLabel}
      back
      hideNav
      action={
        <span className="tabular text-[13px]" style={{ color: 'var(--ink-faint)' }}>
          {pos + 1}/{flat.length}
        </span>
      }
    >
      <div
        className="mb-4 h-1 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={pos + 1}
        aria-valuemin={1}
        aria-valuemax={flat.length}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${((pos + 1) / flat.length) * 100}%`, background: 'var(--accent)' }}
        />
      </div>

      {current.item.kind === 'LEARN_CARD' && (
        <LearnCardStep grammarId={current.item.grammarId} onDone={() => void advance()} />
      )}

      {(current.item.kind === 'QUESTION' || current.item.kind === 'TRAP_DRILL') && (
        <QuestionStep
          questionId={current.item.questionId}
          delivery={current.item.delivery}
          blockType={current.blockType}
          onAnswered={(r) => setResults((prev) => [...prev, r])}
          onNext={() => void advance()}
        />
      )}

      {current.item.kind === 'COMPARE_SET' && (
        <CompareStep
          setId={current.item.comparisonSetId}
          revealed={compareRevealed}
          onReveal={() => setCompareRevealed(true)}
          onNext={() => void advance()}
        />
      )}

      {current.item.kind === 'ERROR_REVIEW' && (
        <ErrorReviewStep
          attemptIds={current.item.attemptIds}
          noteKey={current.item.noteKey}
          params={current.item.params}
          onNext={() => void advance()}
        />
      )}
    </AppShell>
  );
}

function LearnCardStep({ grammarId, onDone }: { grammarId: string; onDone: () => void }) {
  const ctx = useAppStore((s) => s.ctx);
  const grammar = getGrammarView(grammarId);
  if (!grammar) return <EmptyState titleKey="error.invalidData" />;
  return (
    <LearnCard
      grammar={grammar}
      doneLabelKey="learn.markDone"
      onDone={() => {
        if (ctx) void markLearnCard(ctx, grammarId, new Date());
        onDone();
      }}
      relatedPatterns={grammar.curatedConfusedIds
        .map((id) => getGrammarView(id))
        .filter(Boolean)
        .map((g) => ({ id: g!.id, pattern: g!.pattern }))}
    />
  );
}

function QuestionStep({
  questionId,
  delivery,
  blockType,
  onAnswered,
  onNext,
}: {
  questionId: string;
  delivery: 'STUDY' | 'PRACTICE' | 'TIMED' | 'MOCK';
  blockType: FlatItem['blockType'];
  onAnswered: (r: GradeResult) => void;
  onNext: () => void;
}) {
  const question = getQuestion(questionId);
  if (!question) return <EmptyState titleKey="error.invalidData" />;
  return (
    <QuestionRunner
      key={questionId}
      question={question}
      delivery={delivery}
      blockType={blockType}
      onAnswered={onAnswered}
      onNext={onNext}
    />
  );
}

/** Bảng so sánh chỉ hiện SAU khi người học thử phân biệt (CLAUDE.md §11). */
function CompareStep({
  setId,
  revealed,
  onReveal,
  onNext,
}: {
  setId: string;
  revealed: boolean;
  onReveal: () => void;
  onNext: () => void;
}) {
  const set = getComparisonSet(setId);
  const opener = set?.openerQuestionId ? getQuestion(set.openerQuestionId) : undefined;
  if (!set) return <EmptyState titleKey="error.invalidData" />;

  if (!revealed && opener) {
    return (
      <div>
        <Card className="mb-3 px-4 py-3">
          <p className="text-[14px]">{t('compare.tryFirstHint')}</p>
        </Card>
        <QuestionRunner
          key={opener.id}
          question={opener}
          delivery="STUDY"
          blockType="COMPARE"
          onNext={onReveal}
          nextLabelKey="compare.table"
        />
      </div>
    );
  }

  return (
    <div>
      <ComparisonTable set={set} />
      <ThumbBar>
        <PrimaryButton onClick={onNext}>{t('common.next')}</PrimaryButton>
      </ThumbBar>
    </div>
  );
}

function ErrorReviewStep({
  attemptIds,
  noteKey,
  params,
  onNext,
}: {
  attemptIds: string[];
  noteKey: string;
  params?: Record<string, string | number>;
  onNext: () => void;
}) {
  const [items, setItems] = useState<Array<{ id: string; stem: string; why: string }>>([]);

  useEffect(() => {
    let alive = true;
    void attemptRepo.byIds(attemptIds).then((attempts) => {
      if (!alive) return;
      setItems(
        attempts.map((a) => {
          const q = getQuestion(a.questionId);
          const chosen = q?.choices.find((c) => c.id === a.selectedAnswer);
          return {
            id: a.attemptId,
            stem: q?.stemJa ?? '',
            why: chosen?.whyWrongVi ?? q?.explanationVi ?? '',
          };
        }),
      );
    });
    return () => {
      alive = false;
    };
  }, [attemptIds]);

  return (
    <div>
      <Card className="mb-3 px-4 py-3">
        <p className="text-[15px] font-medium">{t(noteKey, params)}</p>
      </Card>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={i.id}>
            <Card className="px-4 py-3">
              <p className="ja ja-sentence">{i.stem}</p>
              {i.why && (
                <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
                  {i.why}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <ThumbBar>
        <PrimaryButton onClick={onNext}>{t('common.next')}</PrimaryButton>
      </ThumbBar>
    </div>
  );
}

function SessionComplete({ results, onExit }: { results: GradeResult[]; onExit: () => void }) {
  const navigate = useNavigate();
  const total = results.length;
  const correct = results.filter((r) => r.isCorrect).length;
  const lucky = results.filter((r) => r.flags.includes('LUCKY')).length;
  const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);

  return (
    <AppShell title={t('complete.title')} hideNav>
      <Card className="mb-4 px-4 py-5 text-center">
        <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
          {t('complete.accuracy')}
        </p>
        <p className="tabular mt-1 text-[40px] font-semibold leading-none">{accuracy}%</p>
        <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
          {correct}/{total}
        </p>
      </Card>

      {lucky > 0 && (
        <Card className="mb-3 px-4 py-3">
          <p className="text-[14px]">{t('complete.lucky', { count: lucky })}</p>
        </Card>
      )}

      <ThumbBar>
        <div className="space-y-2">
          <PrimaryButton onClick={onExit}>
            <span className="ja">{t('complete.finishJa')}</span>
          </PrimaryButton>
          <SecondaryButton onClick={() => navigate('/practice')} className="w-full">
            {t('complete.practiceMore')}
          </SecondaryButton>
        </div>
      </ThumbBar>
    </AppShell>
  );
}
