import type { Phase } from '@/domain/enums';
import type { Timeline } from '@/domain/learner';
import { t } from '@/i18n/vi';

const PHASES: Phase[] = ['PHASE_1_KNOW', 'PHASE_2_COMPARE', 'PHASE_3_DETECT'];

/** Timeline toàn cục: người học luôn thấy mình đang ở đâu trong hành trình. */
export function PhaseTimeline({ timeline, compact = false }: { timeline: Timeline; compact?: boolean }) {
  const { phaseBoundaries: b, totalStudyDays } = timeline;
  const ranges: Record<Phase, [number, number]> = {
    PHASE_1_KNOW: [1, b.knowEndsDay],
    PHASE_2_COMPARE: [b.knowEndsDay + 1, b.compareEndsDay],
    PHASE_3_DETECT: [b.compareEndsDay + 1, totalStudyDays],
  };

  return (
    <ol className="flex gap-2" aria-label={t('analytics.currentPhase')}>
      {PHASES.map((p) => {
        const [from, to] = ranges[p];
        const active = timeline.currentPhase === p;
        const done = timeline.studyDayIndex > to;
        if (to < from) return null;
        return (
          <li
            key={p}
            aria-current={active ? 'step' : undefined}
            className="flex-1 rounded-lg border px-2.5 py-2 hairline"
            style={{
              background: active ? 'var(--accent-soft)' : 'var(--paper-raised)',
              borderColor: active ? 'var(--accent)' : 'var(--rule)',
              opacity: done && !active ? 0.6 : 1,
            }}
          >
            <p
              className="ja text-[14px] font-semibold leading-tight"
              style={{ color: active ? 'var(--accent)' : 'var(--ink-soft)' }}
            >
              {t(`phase.${p}`)}
            </p>
            {!compact && (
              <p className="mt-0.5 text-[11px] tabular" style={{ color: 'var(--ink-faint)' }}>
                {t('phase.range', { from, to })}
              </p>
            )}
            {active && (
              <p className="mt-0.5 text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
                {t('phase.current')}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function PhaseBadge({ phase }: { phase: Phase }) {
  return (
    <span className="inline-flex flex-col">
      <span className="ja text-[18px] font-semibold leading-tight">{t(`phase.${phase}`)}</span>
      <span className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
        {t(`phase.${phase}.vi`)}
      </span>
    </span>
  );
}
