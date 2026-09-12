import { useEffect, useState } from 'react';
import { useAppStore } from '@/app/stores/appStore';
import {
  buildDrill,
  buildExtraLearnBlocks,
  newGrammarToday,
} from '@/app/services/sessionService';
import { markLearnCard } from '@/app/services/answerService';
import { getGrammarView, getQuestion } from '@/content/repository';
import { NEW_PER_DAY_HARD_CAP } from '@/config/learning.config';
import type { SessionItem } from '@/domain/session';
import type { DrillKind } from '@/domain/enums';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, PrimaryButton, ThumbBar } from '../components/primitives';
import { QuestionRunner } from '../components/QuestionRunner';
import { LearnCard } from '../components/LearnCard';

const MODES: Array<{ key: DrillKind; labelKey: string; payload: Record<string, unknown> }> = [
  { key: 'REVIEW_TOP', labelKey: 'practice.quick', payload: {} },
  { key: 'ERROR_TYPE', labelKey: 'practice.weak', payload: {} },
  { key: 'FAMILY', labelKey: 'practice.family', payload: {} },
  { key: 'CONFUSION_PAIR', labelKey: 'practice.comparison', payload: {} },
  { key: 'TRAP_TYPE', labelKey: 'practice.trap', payload: {} },
  { key: 'SPEED', labelKey: 'practice.timed', payload: {} },
];

type Goal = 'NEW' | 'REVIEW';

export default function PracticePage() {
  const ctx = useAppStore((s) => s.ctx);
  const refresh = useAppStore((s) => s.refresh);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [count, setCount] = useState(5);
  const [newCount, setNewCount] = useState(2);
  const [items, setItems] = useState<SessionItem[] | null>(null);
  const [pos, setPos] = useState(0);

  const [capAck, setCapAck] = useState(false);
  // Ảnh chụp trạng thái học (`ctx`) chỉ được dựng lúc mở app. Học xong buổi chính rồi
  // sang đây thì ảnh chụp vẫn là của lúc sáng — những mẫu vừa học hôm nay chưa có trong
  // danh sách "đã dạy", nên H9 loại sạch câu hỏi và màn hình trống trơn. Phải đọc lại.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = ctx ? newGrammarToday(ctx) : null;
  const canLearnNew = (status?.unseenLeft ?? 0) > 0;
  const learnedCount = ctx ? ctx.mastery.filter((m) => m.state !== 'UNSEEN').length : 0;

  function run(next: SessionItem[]) {
    setItems(next);
    setPos(0);
  }

  function startDrill(kind: DrillKind, payload: Record<string, unknown>) {
    if (!ctx) return;
    const enriched =
      kind === 'ERROR_TYPE'
        ? { grammarIds: ctx.weakness.errorGrammarIds.length ? ctx.weakness.errorGrammarIds : undefined }
        : kind === 'CONFUSION_PAIR' && ctx.weakness.topConfusionPairs[0]
          ? { from: ctx.weakness.topConfusionPairs[0].from, to: ctx.weakness.topConfusionPairs[0].to }
          : payload;
    run(buildDrill(ctx, kind, enriched, count).items);
  }

  function startNewLearning() {
    if (!ctx) return;
    run(buildExtraLearnBlocks(ctx, newCount).flatMap((b) => b.items));
  }

  /* ── Đang chạy ── */
  if (items) {
    const item = items[pos];
    const finish = () => {
      setItems(null);
      void refresh();
    };
    const advance = () => (pos + 1 >= items.length ? finish() : setPos((p) => p + 1));

    if (!item) {
      return (
        <AppShell title={t('practice.title')} back hideNav>
          {/* Màn trắng không nói gì là tệ nhất: nói rõ VÌ SAO trống và làm gì tiếp. */}
          <EmptyState
            titleKey={learnedCount === 0 ? 'practice.nothingLearnedTitle' : 'practice.emptyTitle'}
            bodyKey={learnedCount === 0 ? 'practice.nothingLearnedBody' : 'practice.emptyBody'}
          />
          <ThumbBar>
            <div className="space-y-2">
              {canLearnNew && (
                <PrimaryButton
                  onClick={() => {
                    setItems(null);
                    setGoal('NEW');
                  }}
                >
                  {t('practice.goalNew')}
                </PrimaryButton>
              )}
              <button
                type="button"
                onClick={finish}
                className="tap w-full text-center text-[13px]"
                style={{ color: 'var(--ink-faint)' }}
              >
                {t('common.finish')}
              </button>
            </div>
          </ThumbBar>
        </AppShell>
      );
    }

    if (item.kind === 'LEARN_CARD') {
      const grammar = getGrammarView(item.grammarId);
      if (!grammar) return <EmptyState titleKey="error.invalidData" />;
      return (
        <AppShell title={t('practice.title')} back hideNav>
          <LearnCard
            key={grammar.id}
            grammar={grammar}
            doneLabelKey="learn.markDone"
            onDone={() => {
              if (ctx) void markLearnCard(ctx, grammar.id, new Date());
              advance();
            }}
            relatedPatterns={grammar.curatedConfusedIds
              .map((id) => getGrammarView(id))
              .filter(Boolean)
              .map((g) => ({ id: g!.id, pattern: g!.pattern }))}
          />
        </AppShell>
      );
    }

    if (item.kind !== 'QUESTION') {
      advance();
      return null;
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
          total={items.length}
          onNext={advance}
        />
      </AppShell>
    );
  }

  /* ── Chọn mục tiêu ── */
  if (goal === null) {
    return (
      <AppShell title={t('practice.title')} back>
        <Card className="mb-4 px-4 py-3">
          <p className="text-[14px] leading-relaxed">{t('practice.note')}</p>
        </Card>
        <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('practice.chooseGoal')}
        </h3>
        <ul className="space-y-2">
          {(
            [
              { g: 'NEW' as const, label: 'practice.goalNew', note: 'practice.goalNewNote' },
              { g: 'REVIEW' as const, label: 'practice.goalReview', note: 'practice.goalReviewNote' },
            ]
          ).map(({ g, label, note }) => (
            <li key={g}>
              <button type="button" onClick={() => setGoal(g)} className="block w-full text-left">
                <Card className="px-4 py-3.5">
                  <span className="block text-[16px] font-medium">{t(label)}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
                    {t(note)}
                  </span>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      </AppShell>
    );
  }

  /* ── Học thêm mẫu mới ── */
  if (goal === 'NEW' && status) {
    // Vượt mốc 8 thì NHẮC một lần rồi vẫn cho đi tiếp — trần chỉ ràng buộc hệ thống,
    // không ràng buộc người học (CLAUDE.md §8.2 sau khi sửa).
    const mustWarn = status.beyondCap && !capAck;
    return (
      <AppShell title={t('practice.title')} back>
        <Card className="mb-3 px-4 py-3">
          <p className="text-[14px] leading-relaxed">
            {t('practice.newToday', {
              done: status.learnedToday,
              target: status.target,
              left: status.unseenLeft,
            })}
          </p>
        </Card>

        {!canLearnNew && (
          <Card className="mb-4 px-4 py-3">
            <p className="text-[14px] leading-relaxed">{t('practice.noNewLeft')}</p>
          </Card>
        )}

        {canLearnNew && mustWarn && (
          <Card className="mb-4 px-4 py-3">
            <p className="text-[14px] leading-relaxed">
              {t('practice.beyondCap', { done: status.learnedToday, cap: NEW_PER_DAY_HARD_CAP })}
            </p>
          </Card>
        )}

        {canLearnNew && !mustWarn && status.remainingToTarget === 0 && (
          <Card className="mb-4 px-4 py-3">
            <p className="text-[14px] leading-relaxed">{t('practice.newAhead')}</p>
          </Card>
        )}

        {canLearnNew && !mustWarn && (
          <div className="mb-4 flex items-center gap-3">
            <span className="text-[14px]">{t('practice.newCount')}</span>
            <div className="flex gap-2">
              {[1, 2, 3, 5].filter((n) => n <= status.unseenLeft).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNewCount(n)}
                  aria-pressed={newCount === n}
                  className="tap rounded-lg border px-3.5 py-2 text-[14px] hairline"
                  style={{
                    background: newCount === n ? 'var(--accent-soft)' : 'var(--paper-raised)',
                    color: newCount === n ? 'var(--accent)' : 'var(--ink-soft)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <ThumbBar>
          <div className="space-y-2">
            {canLearnNew &&
              (mustWarn ? (
                <PrimaryButton onClick={() => setCapAck(true)}>{t('practice.beyondCapGo')}</PrimaryButton>
              ) : (
                <PrimaryButton onClick={startNewLearning}>{t('practice.goalNew')}</PrimaryButton>
              ))}
            <button
              type="button"
              onClick={() => setGoal('REVIEW')}
              className="tap w-full text-center text-[13px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              {t('practice.goalReview')}
            </button>
          </div>
        </ThumbBar>
      </AppShell>
    );
  }

  /* ── Ôn lại ── */
  return (
    <AppShell title={t('practice.title')} back>
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
            <button type="button" onClick={() => startDrill(m.key, m.payload)} className="block w-full text-left">
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
