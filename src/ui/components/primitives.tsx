import type { ReactNode } from 'react';
import { t } from '@/i18n/vi';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`surface rounded-xl ${className}`}>{children}</div>;
}

export function Section({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-5 ${className}`}>
      {(title || action) && (
        <header className="mb-2 flex items-baseline justify-between gap-3">
          {title && <h2 className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`tap w-full rounded-xl px-4 py-3.5 text-[16px] font-semibold disabled:opacity-40 ${className}`}
      style={{ background: 'var(--accent)', color: 'var(--paper)' }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  className = '',
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`tap rounded-xl border px-4 py-2.5 text-[15px] font-medium hairline ${className}`}
      style={{ background: 'var(--paper-raised)', color: 'var(--ink)' }}
    >
      {children}
    </button>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'ok' | 'warn';
}) {
  const styles: Record<string, { background: string; color: string }> = {
    neutral: { background: 'var(--rule)', color: 'var(--ink-soft)' },
    accent: { background: 'var(--accent-soft)', color: 'var(--accent)' },
    ok: { background: 'var(--ok-soft)', color: 'var(--ok)' },
    warn: { background: 'var(--warn-soft)', color: 'var(--warn)' },
  };
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold" style={styles[tone]}>
      {children}
    </span>
  );
}

export function EmptyState({ titleKey, bodyKey, ja }: { titleKey: string; bodyKey?: string; ja?: string }) {
  return (
    <Card className="px-5 py-8 text-center">
      {ja && <p className="ja ja-sentence mb-2">{ja}</p>}
      <p className="text-[15px] font-medium">{t(titleKey)}</p>
      {bodyKey && (
        <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
          {t(bodyKey)}
        </p>
      )}
    </Card>
  );
}

export function LoadingState() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="h-20 animate-pulse rounded-xl" style={{ background: 'var(--rule)' }} />
      <div className="h-32 animate-pulse rounded-xl" style={{ background: 'var(--rule)' }} />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Card className="px-5 py-6">
      <p className="text-[15px] font-medium">{t('error.boundary')}</p>
      {message && (
        <p className="mt-1 break-words text-[13px]" style={{ color: 'var(--ink-faint)' }}>
          {message}
        </p>
      )}
      {onRetry && (
        <div className="mt-4">
          <SecondaryButton onClick={onRetry}>{t('common.retry')}</SecondaryButton>
        </div>
      )}
    </Card>
  );
}

export function NeedsReviewBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
      title={t('common.needsReviewHint')}
    >
      ⚠ {t('common.needsReview')}
    </span>
  );
}

/** Thanh hành động dính đáy — mọi hành động chính nằm ở nửa dưới màn hình (CLAUDE.md §18). */
export function ThumbBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-0 z-20 -mx-4 mt-auto border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 hairline"
      style={{ background: 'var(--paper)' }}
    >
      {children}
    </div>
  );
}
