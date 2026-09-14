import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/app/stores/appStore';
import { exposureHistoryFrom } from '@/app/services/sessionService';
import { gradeAnswer, persistAnswer } from '@/app/services/answerService';
import { buildMockSet, mockBudgetMs, type Response } from '@/engines/exercise';
import { getGrammar, listQuestions } from '@/content/repository';
import type { Question } from '@/domain/question';
import type { GradeResult } from '@/engines/exercise';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, Pill, PrimaryButton, SecondaryButton, ThumbBar } from '../components/primitives';
import { ClozeText, JaText } from '../components/JaText';
import { ChoiceButton } from '../components/answering';

type Stage = 'INTRO' | 'RUNNING' | 'RESULT';

interface Answer {
  question: Question;
  choiceId: string | null;
  responseTimeMs: number;
  flagged: boolean;
}

export default function MockPage() {
  const ctx = useAppStore((s) => s.ctx);
  const session = useAppStore((s) => s.session);
  const [stage, setStage] = useState<Stage>('INTRO');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [pos, setPos] = useState(0);
  const [remainingMs, setRemainingMs] = useState(mockBudgetMs());
  const [results, setResults] = useState<GradeResult[]>([]);
  const itemStart = useRef(Date.now());

  const questions = useMemo(() => {
    if (!ctx) return [];
    const history = exposureHistoryFrom(ctx.attempts, ctx.timeline.todayKey);
    return buildMockSet(
      listQuestions(),
      {
        phase: ctx.timeline.currentPhase,
        mode: ctx.timeline.mode,
        daysUntilExam: ctx.timeline.daysRemaining,
        seed: Date.now() % 100000,
        now: ctx.now,
      },
      history,
      { grammarById: getGrammar },
    ).questions;
  }, [ctx]);

  useEffect(() => {
    if (stage !== 'RUNNING') return;
    const id = window.setInterval(() => {
      setRemainingMs((ms) => {
        if (ms <= 1000) {
          window.clearInterval(id);
          finish();
          return 0;
        }
        return ms - 1000;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  function start() {
    setAnswers(questions.map((q) => ({ question: q, choiceId: null, responseTimeMs: 0, flagged: false })));
    setPos(0);
    setRemainingMs(mockBudgetMs());
    itemStart.current = Date.now();
    setStage('RUNNING');
  }

  function record(choiceId: string) {
    setAnswers((prev) =>
      prev.map((a, i) =>
        i === pos ? { ...a, choiceId, responseTimeMs: Math.max(300, Date.now() - itemStart.current) } : a,
      ),
    );
  }

  function goto(next: number) {
    setPos(next);
    itemStart.current = Date.now();
  }

  function finish() {
    if (!ctx || !session) return;
    const graded: GradeResult[] = [];
    for (const a of answers) {
      const response: Response =
        a.choiceId === null
          ? { kind: 'NONE' }
          : a.question.type === 'SENTENCE_BUILD'
            ? { kind: 'CHOICE', choiceId: a.choiceId }
            : { kind: 'CHOICE', choiceId: a.choiceId };
      const input = {
        ctx,
        session,
        question: a.question,
        response,
        responseTimeMs: a.responseTimeMs || 1000,
        confidence: 'UNSURE' as const,
        delivery: 'MOCK' as const,
        blockType: 'APPLY' as const,
        now: new Date(),
        confidenceImputed: true,
      };
      const r = gradeAnswer(input);
      graded.push(r);
      void persistAnswer(input, r);
    }
    setResults(graded);
    setStage('RESULT');
  }

  if (!ctx) return <AppShell title={t('mock.title')} back><EmptyState titleKey="common.loading" /></AppShell>;

  if (stage === 'INTRO') {
    return (
      <AppShell title={t('mock.title')} back>
        <Card className="mb-4 px-4 py-4">
          <p className="mb-2 text-[15px]">{t('mock.structure')}</p>
          <p className="text-[14px]" style={{ color: 'var(--ink-soft)' }}>
            {t('mock.rules')}
          </p>
        </Card>
        {questions.length < 20 && (
          <Card className="mb-4 px-4 py-3">
            <p className="text-[14px]">{t('mock.notEnoughQuestions', { n: questions.length })}</p>
          </Card>
        )}
        <ThumbBar>
          <PrimaryButton onClick={start} disabled={questions.length === 0}>
            {t('mock.start')}
          </PrimaryButton>
        </ThumbBar>
      </AppShell>
    );
  }

  if (stage === 'RUNNING') {
    const a = answers[pos];
    if (!a) return <AppShell title={t('mock.title')} hideNav><EmptyState titleKey="common.empty" /></AppShell>;
    const q = a.question;
    const mm = Math.floor(remainingMs / 60000);
    const ss = Math.floor((remainingMs % 60000) / 1000);

    return (
      <AppShell
        title={t('mock.title')}
        hideNav
        action={
          <span className="tabular text-[15px] font-semibold" style={{ color: remainingMs < 120000 ? 'var(--warn)' : 'var(--ink)' }}>
            {mm}:{String(ss).padStart(2, '0')}
          </span>
        }
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="tabular text-[13px]" style={{ color: 'var(--ink-faint)' }}>
            {pos + 1}/{answers.length}
          </span>
          <Pill>{t(`qtype.${q.type}`)}</Pill>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setAnswers((prev) => prev.map((x, i) => (i === pos ? { ...x, flagged: !x.flagged } : x)))}
            className="tap px-2 text-[13px]"
            style={{ color: a.flagged ? 'var(--seal)' : 'var(--ink-faint)' }}
          >
            {a.flagged ? t('question.flagOn') : t('question.flagOff')} {t('mock.flag')}
          </button>
        </div>

        {q.contextJa && (
          <Card className="mb-3 max-h-48 overflow-y-auto px-3.5 py-3">
            <p className="ja ja-sentence whitespace-pre-wrap">{q.contextJa}</p>
          </Card>
        )}

        <Card className="mb-4 px-3.5 py-4">
          {q.stemJa.includes('___') ? <ClozeText text={q.stemJa} /> : <JaText text={q.stemJa} />}
        </Card>

        <div className="space-y-2.5">
          {(q.type === 'SENTENCE_BUILD' ? q.fragments ?? [] : q.choices).map((c, i) => (
            <ChoiceButton
              key={c.id}
              index={i}
              label={c.textJa}
              selected={a.choiceId === c.id}
              onClick={() => record(c.id)}
            />
          ))}
        </div>

        <ThumbBar>
          <div className="flex gap-2">
            <SecondaryButton onClick={() => goto(Math.max(0, pos - 1))}>‹</SecondaryButton>
            <div className="flex-1">
              {pos + 1 >= answers.length ? (
                <PrimaryButton
                  onClick={() => {
                    if (confirm(t('mock.submitConfirm'))) finish();
                  }}
                >
                  {t('mock.submit')}
                </PrimaryButton>
              ) : (
                <PrimaryButton onClick={() => goto(pos + 1)}>{t('common.next')}</PrimaryButton>
              )}
            </div>
          </div>
        </ThumbBar>
      </AppShell>
    );
  }

  const correct = results.filter((r) => r.isCorrect).length;
  const avgMs = answers.length
    ? answers.reduce((s, a) => s + (a.responseTimeMs || 0), 0) / answers.length
    : 0;
  const byType = new Map<string, { correct: number; total: number }>();
  answers.forEach((a, i) => {
    const cur = byType.get(a.question.type) ?? { correct: 0, total: 0 };
    cur.total++;
    if (results[i]?.isCorrect) cur.correct++;
    byType.set(a.question.type, cur);
  });

  return (
    <AppShell title={t('mock.result')} back>
      <Card className="mb-4 px-4 py-5 text-center">
        <p className="tabular text-[40px] font-semibold leading-none">
          {correct}/{answers.length}
        </p>
        <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
          {t('mock.avgTime', { seconds: (avgMs / 1000).toFixed(1) })}
        </p>
      </Card>

      <Card className="mb-4 px-4 py-3">
        <ul className="space-y-1.5">
          {[...byType.entries()].map(([type, v]) => (
            <li key={type} className="flex items-center justify-between text-[14px]">
              <span>{t(`qtype.${type}`)}</span>
              <span className="tabular">
                {v.correct}/{v.total}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <ThumbBar>
        <PrimaryButton onClick={() => setStage('INTRO')}>{t('common.finish')}</PrimaryButton>
      </ThumbBar>
    </AppShell>
  );
}
