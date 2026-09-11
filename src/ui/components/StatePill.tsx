import type { MasteryState } from '@/domain/enums';
import { t } from '@/i18n/vi';

const TONE: Record<MasteryState, { bg: string; fg: string }> = {
  UNSEEN: { bg: 'var(--rule)', fg: 'var(--ink-faint)' },
  INTRODUCED: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  RECOGNIZED: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  SHAKY: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  CONFUSED: { bg: 'var(--warn-soft)', fg: 'var(--seal)' },
  COMPARABLE: { bg: 'var(--ok-soft)', fg: 'var(--ok)' },
  EXAM_READY: { bg: 'var(--ok-soft)', fg: 'var(--ok)' },
};

/** Không chỉ dựa vào màu: mỗi trạng thái có nhãn chữ riêng (accessibility). */
export function StatePill({ state }: { state: MasteryState }) {
  const tone = TONE[state];
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {t(`state.${state}`)}
    </span>
  );
}

export function ProgressRing({
  value,
  size = 56,
  label,
}: {
  value: number | null;
  size?: number;
  label?: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} role="img" aria-label={label ?? `${pct}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth="6" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="tabular"
        fontSize="14"
        fontWeight="700"
        fill="var(--ink)"
      >
        {value === null ? '—' : pct}
      </text>
    </svg>
  );
}
