import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { t } from '@/i18n/vi';

const NAV = [
  { to: '/today', key: 'nav.today' },
  { to: '/review', key: 'nav.review' },
  { to: '/grammar', key: 'nav.grammar' },
  { to: '/mistakes', key: 'nav.mistakes' },
  { to: '/analytics', key: 'nav.analytics' },
];

export function AppShell({
  children,
  title,
  back,
  action,
  hideNav,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  action?: ReactNode;
  hideNav?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-full max-w-phone flex-col">
      {(title || back || action) && (
        <header
          className="sticky top-0 z-20 flex items-center gap-2 border-b px-4 py-3 hairline"
          style={{ background: 'var(--paper)' }}
        >
          {back && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label={t('common.back')}
              className="tap -ml-2 flex items-center justify-center rounded-lg px-2"
            >
              ‹
            </button>
          )}
          {title && <h1 className="flex-1 truncate text-[17px] font-semibold">{title}</h1>}
          {action}
        </header>
      )}

      <main className="flex flex-1 flex-col px-4 pb-6 pt-4">{children}</main>

      {!hideNav && (
        <nav
          className="sticky bottom-0 z-20 grid grid-cols-5 border-t pb-[max(0.25rem,env(safe-area-inset-bottom))] hairline"
          style={{ background: 'var(--paper-raised)' }}
          aria-label={t('app.name')}
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="tap flex flex-col items-center justify-center gap-0.5 py-2 text-[11px]"
              style={({ isActive }) => ({ color: isActive ? 'var(--accent)' : 'var(--ink-faint)' })}
            >
              <span className="ja text-[17px] leading-none" aria-hidden="true">
                {t(`${item.key}.icon`)}
              </span>
              <span>{t(item.key)}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
