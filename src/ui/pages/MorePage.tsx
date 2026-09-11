import { Link } from 'react-router-dom';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card } from '../components/primitives';

const LINKS = [
  { to: '/compare', labelKey: 'compare.title', jaKey: 'more.compare.ja' },
  { to: '/trap-lab', labelKey: 'trapLab.title', jaKey: 'more.trapLab.ja' },
  { to: '/practice', labelKey: 'practice.title', jaKey: 'more.practice.ja' },
  { to: '/mock', labelKey: 'mock.title', jaKey: 'more.mock.ja' },
  { to: '/grammar-map', labelKey: 'grammarMap.title', jaKey: 'more.grammarMap.ja' },
  { to: '/settings', labelKey: 'settings.title', jaKey: 'more.settings.ja' },
];

export default function MorePage() {
  return (
    <AppShell title={t('nav.more')} back>
      <ul className="space-y-2">
        {LINKS.map((l) => (
          <li key={l.to}>
            <Link to={l.to}>
              <Card className="flex items-center gap-3 px-4 py-3.5">
                <span className="ja text-[16px]" style={{ color: 'var(--ink-faint)' }}>
                  {t(l.jaKey)}
                </span>
                <span className="flex-1 text-[16px] font-medium">{t(l.labelKey)}</span>
                <span style={{ color: 'var(--ink-faint)' }}>›</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
