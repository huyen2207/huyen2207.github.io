import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/app/stores/appStore';
import { displayGroups } from '@/engines/session';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, EmptyState, LoadingState, Pill, PrimaryButton, SecondaryButton, ThumbBar } from '../components/primitives';
import { PhaseTimeline } from '../components/PhaseTimeline';

export default function TodayPage() {
  const ctx = useAppStore((s) => s.ctx);
  const session = useAppStore((s) => s.session);
  const regenerate = useAppStore((s) => s.regenerateSession);
  const navigate = useNavigate();

  const totalItems = useMemo(
    () => session?.blocks.reduce((s, b) => s + b.items.length, 0) ?? 0,
    [session],
  );
  const doneItems = useMemo(() => {
    if (!session) return 0;
    let n = 0;
    for (let i = 0; i < session.cursor.blockIndex; i++) n += session.blocks[i]?.items.length ?? 0;
    return n + session.cursor.itemIndex;
  }, [session]);

  if (!ctx || !session) {
    return (
      <AppShell title={t('today.title')}>
        <LoadingState />
      </AppShell>
    );
  }

  const { timeline } = ctx;
  const groups = displayGroups(session);
  const inProgress = session.status === 'IN_PROGRESS';
  const completed = session.status === 'COMPLETED';
  const examOver = timeline.isExamOver;

  return (
    <AppShell
      title={t('today.title')}
      action={
        <button
          type="button"
          onClick={() => navigate('/more')}
          aria-label={t('nav.more')}
          className="tap px-2 text-[18px]"
          style={{ color: 'var(--ink-faint)' }}
        >
          ⋯
        </button>
      }
    >
      <header className="mb-5">
        <p className="tabular text-[13px] font-semibold tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('today.dayCounter', { day: timeline.studyDayIndex, total: timeline.totalStudyDays })}
        </p>
        <h2 className="ja mt-1 text-[30px] font-semibold leading-tight">{t(`phase.${timeline.currentPhase}`)}</h2>
        <p className="mt-0.5 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
          {t(`phase.${timeline.currentPhase}.question`)}
        </p>
        <p className="mt-2 text-[15px] font-medium" style={{ color: 'var(--accent)' }}>
          {examOver ? t('today.afterExam') : t('today.daysLeft', { days: timeline.daysRemaining })}
        </p>
      </header>

      <div className="mb-5">
        <PhaseTimeline timeline={timeline} />
      </div>

      {timeline.mode !== 'NORMAL' && (
        <Card className="mb-4 px-4 py-3">
          <div className="mb-1 flex items-center gap-2">
            <Pill tone="warn">{t(`mode.${timeline.mode}`)}</Pill>
          </div>
          <p className="text-[14px] leading-relaxed">{t(`mode.${timeline.mode}.note`)}</p>
        </Card>
      )}

      {timeline.isPhaseTransitionDay && (
        <Card className="mb-4 px-4 py-3">
          <p className="text-[14px]">{t('transition.complete')}</p>
          <div className="mt-2">
            <SecondaryButton onClick={() => navigate('/transition')}>{t('transition.continue')}</SecondaryButton>
          </div>
        </Card>
      )}

      <section className="mb-5">
        <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('today.mission')}
        </h3>
        {groups.length === 0 ? (
          <EmptyState titleKey="error.noSession" />
        ) : (
          <ol className="space-y-2">
            {groups.map((g, i) => (
              <li key={g.key}>
                <Card className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="tabular flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[16px] font-medium">{t(g.key)}</span>
                    <span className="block text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                      {t('common.items', { n: g.items })}
                    </span>
                  </span>
                  <span className="tabular text-[15px] font-semibold" style={{ color: 'var(--ink-soft)' }}>
                    {t('common.minutes', { n: g.minutes })}
                  </span>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      {session.adaptationNotes.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
            {t('today.whyThis')}
          </h3>
          <Card className="space-y-2 px-4 py-3">
            {session.adaptationNotes.map((n) => (
              <p key={n.ruleId} className="text-[14px] leading-relaxed">
                {t(n.messageKey, n.params)}
              </p>
            ))}
          </Card>
        </section>
      )}

      {inProgress && (
        <p className="mb-2 text-[13px] tabular" style={{ color: 'var(--ink-faint)' }}>
          {t('today.progress', { done: doneItems, total: totalItems })}
        </p>
      )}

      <ThumbBar>
        {completed ? (
          <div className="space-y-2">
            <p className="text-center text-[14px]" style={{ color: 'var(--ink-soft)' }}>
              {t('today.done')}
            </p>
            <PrimaryButton onClick={() => navigate('/practice')}>{t('today.doneCta')}</PrimaryButton>
          </div>
        ) : (
          <div className="space-y-2">
            <PrimaryButton onClick={() => navigate('/session')}>
              {/* "Học tiếp" là tiếng Việt — gán font tiếng Nhật thì dấu thanh bị vỡ. */}
              <span className={inProgress ? undefined : 'ja'}>
                {inProgress ? t('today.resumeSession') : t('today.startSession')}
              </span>
            </PrimaryButton>
            {/* Hiện cả khi đang học dở: lúc cần dựng lại buổi học nhất chính là lúc
                đang học mà thấy nội dung không ổn. Hộp xác nhận đã báo rõ mất tiến độ. */}
            <button
              type="button"
              onClick={() => {
                if (confirm(t('today.regenerateConfirm'))) void regenerate();
              }}
              className="tap w-full text-center text-[13px]"
              style={{ color: 'var(--ink-faint)' }}
            >
              {t('today.regenerate')}
            </button>
          </div>
        )}
      </ThumbBar>
    </AppShell>
  );
}
