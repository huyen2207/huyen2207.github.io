import { useEffect, useState } from 'react';
import { useAppStore } from '@/app/stores/appStore';
import { buildFlashcardDrill, listFlashcards, toggleFlashcard, type Flashcard } from '@/app/services/flashcardService';
import { getComparisonSet, getGrammarView, getQuestion } from '@/content/repository';
import type { SessionItem } from '@/domain/session';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, PrimaryButton, SecondaryButton, ThumbBar } from '../components/primitives';
import { ComparisonTable } from '../components/ComparisonTable';
import { QuestionRunner, type AnswerSnapshot } from '../components/QuestionRunner';
import { StructureRecap } from '../components/answering';

type Mode = 'LIST' | 'BROWSE' | 'DRILL';

export default function FlashcardsPage() {
  const ctx = useAppStore((s) => s.ctx);
  const refresh = useAppStore((s) => s.refresh);
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [mode, setMode] = useState<Mode>('LIST');
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, AnswerSnapshot>>({});

  const reload = () => void listFlashcards().then(setCards);
  useEffect(reload, []);

  function backToList() {
    setMode('LIST');
    setPos(0);
    setRevealed(false);
    setSnapshots({});
    reload();
    void refresh();
  }

  if (cards === null) {
    return (
      <AppShell title={t('deck.title')} back>
        <span />
      </AppShell>
    );
  }

  /** Bộ so sánh không có tiêu đề riêng — đặt tên bằng chính các mẫu trong nhóm. */
  const setLabel = (id: string) => getComparisonSet(id)?.grammarIds.map((g) => getGrammarView(g)?.pattern ?? g).join(` ${t('deck.setSeparator')} `);

  /* ── Lật thẻ xem lại ── */
  if (mode === 'BROWSE' && cards.length > 0) {
    const card = cards[Math.min(pos, cards.length - 1)];
    const grammar = card.kind === 'GRAMMAR' ? getGrammarView(card.refId) : undefined;
    const set = card.kind === 'COMPARISON' ? getComparisonSet(card.refId) : undefined;
    const next = () => {
      setRevealed(false);
      if (pos + 1 >= cards.length) return backToList();
      setPos((p) => p + 1);
    };
    return (
      <AppShell
        title={t('deck.title')}
        back
        hideNav
        onBack={() => (pos <= 0 ? backToList() : (setRevealed(false), setPos((p) => p - 1)))}
        action={
          <span className="tabular text-[13px]" style={{ color: 'var(--ink-faint)' }}>
            {pos + 1}/{cards.length}
          </span>
        }
      >
        <Card className="mb-4 px-4 py-4">
          <p className="ja text-[22px] font-semibold">{grammar?.pattern ?? (set ? setLabel(card.refId) : card.refId)}</p>
          {/* Che nội dung cho tới khi người học tự nhớ (CLAUDE.md §11). */}
          {!revealed && (
            <p className="mt-2 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
              {card.kind === 'GRAMMAR' ? t('deck.promptGrammar') : t('deck.promptComparison')}
            </p>
          )}
        </Card>

        {revealed && grammar && <StructureRecap grammar={grammar} full />}
        {revealed && set && <ComparisonTable set={set} />}

        <ThumbBar>
          <div className="space-y-2">
            {revealed ? (
              <PrimaryButton onClick={next}>{t('deck.next')}</PrimaryButton>
            ) : (
              <PrimaryButton onClick={() => setRevealed(true)}>{t('deck.reveal')}</PrimaryButton>
            )}
            <button
              type="button"
              onClick={() => void toggleFlashcard(card.kind, card.refId, new Date()).then(reload)}
              className="tap w-full text-center text-[13px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              {t('deck.remove')}
            </button>
          </div>
        </ThumbBar>
      </AppShell>
    );
  }

  /* ── Luyện bằng câu hỏi thật ── */
  if (mode === 'DRILL') {
    const item = items[pos];
    if (!item || item.kind !== 'QUESTION') {
      return (
        <AppShell title={t('deck.title')} back hideNav>
          <EmptyState titleKey="practice.emptyTitle" bodyKey="practice.emptyBody" />
          <ThumbBar>
            <PrimaryButton onClick={backToList}>{t('common.finish')}</PrimaryButton>
          </ThumbBar>
        </AppShell>
      );
    }
    const q = getQuestion(item.questionId)!;
    return (
      <AppShell
        title={t('deck.title')}
        back
        hideNav
        onBack={() => (pos <= 0 ? backToList() : setPos((p) => p - 1))}
      >
        <QuestionRunner
          key={q.id}
          question={q}
          delivery={item.delivery}
          blockType="APPLY"
          index={pos}
          total={items.length}
          prior={snapshots[q.id]}
          onAnswered={(_r, qq, snap) => setSnapshots((prev) => ({ ...prev, [qq.id]: snap }))}
          onNext={() => (pos + 1 >= items.length ? backToList() : setPos((p) => p + 1))}
        />
      </AppShell>
    );
  }

  /* ── Danh sách ── */
  return (
    <AppShell title={t('deck.title')} back>
      {cards.length === 0 ? (
        <EmptyState titleKey="deck.empty" bodyKey="deck.emptyBody" />
      ) : (
        <>
          <Card className="mb-4 px-4 py-3">
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              {t('deck.note')}
            </p>
          </Card>
          <ul className="space-y-2">
            {cards.map((c) => {
              const grammar = c.kind === 'GRAMMAR' ? getGrammarView(c.refId) : undefined;
              const set = c.kind === 'COMPARISON' ? getComparisonSet(c.refId) : undefined;
              return (
                <li key={c.id}>
                  <Card className="px-4 py-3">
                    <span className="ja block text-[18px] font-semibold">
                      {grammar?.pattern ?? (set ? setLabel(c.refId) : c.refId)}
                    </span>
                    <span className="mt-0.5 block text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                      {t(`deck.kind.${c.kind}`)}
                    </span>
                  </Card>
                </li>
              );
            })}
          </ul>

          <ThumbBar>
            <div className="space-y-2">
              <PrimaryButton
                onClick={() => {
                  if (!ctx) return;
                  setItems(buildFlashcardDrill(ctx, cards, 10));
                  setPos(0);
                  setSnapshots({});
                  setMode('DRILL');
                }}
              >
                {t('deck.study')}
              </PrimaryButton>
              <SecondaryButton
                className="w-full"
                onClick={() => {
                  setPos(0);
                  setRevealed(false);
                  setMode('BROWSE');
                }}
              >
                {t('deck.browse')}
              </SecondaryButton>
            </div>
          </ThumbBar>
        </>
      )}
    </AppShell>
  );
}
