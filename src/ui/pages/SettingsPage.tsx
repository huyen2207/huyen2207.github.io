import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/app/stores/appStore';
import { useUiStore } from '@/app/stores/uiStore';
import { importContent, updateProfile } from '@/app/services/settingsService';
import { exportBackup, importBackup, lastBackupAt, markBackupDone } from '@/storage/backup';
import { resetAllData } from '@/storage/repositories';
import { contentStats } from '@/content/repository';
import { BACKUP_REMINDER_DAYS } from '@/config/learning.config';
import { daysAgo, formatDateVi } from '@/shared/date';
import { t } from '@/i18n/vi';
import { forceUpdate } from '@/app/pwa';

/** Đóng dấu lúc build để người học xác nhận mình đang chạy bản nào. */
const BUILD_VERSION = __BUILD_VERSION__;
import { AppShell } from '../AppShell';
import { Card, PrimaryButton, SecondaryButton } from '../components/primitives';

export default function SettingsPage() {
  const ctx = useAppStore((s) => s.ctx);
  const refresh = useAppStore((s) => s.refresh);
  const bootstrap = useAppStore((s) => s.bootstrap);
  const { theme, toggleTheme, furigana, setFurigana } = useUiStore();
  const navigate = useNavigate();

  const [backupAt, setBackupAt] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLInputElement>(null);

  const stats = contentStats();

  useEffect(() => {
    void lastBackupAt().then(setBackupAt);
  }, []);

  async function change(update: Parameters<typeof updateProfile>[1]) {
    if (!ctx) return;
    if (!confirm(t('settings.replanWarning'))) return;
    await updateProfile(ctx.profile, update, new Date());
    await refresh();
    setMessage(t('roadmap.replanned'));
  }

  async function doExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `n1-bunpou-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await markBackupDone(new Date());
    setBackupAt(new Date().toISOString());
  }

  async function doImport(file: File) {
    if (!confirm(t('settings.importConfirm'))) return;
    const text = await file.text();
    const result = await importBackup(JSON.parse(text));
    setMessage(t(result.messageKey));
    await bootstrap();
  }

  async function doImportContent(file: File, kind: 'grammar' | 'question') {
    const text = await file.text();
    const report = await importContent(JSON.parse(text), kind, new Date());
    setMessage(
      t('settings.importReport', {
        accepted: report.accepted,
        rejected: report.rejected,
        needsReview: report.needsReview,
      }),
    );
    await bootstrap();
  }

  const daysSinceBackup = backupAt ? daysAgo(backupAt, new Date()) : null;

  return (
    <AppShell title={t('settings.title')} back>
      {message && (
        <Card className="mb-4 px-4 py-3">
          <p className="text-[14px]">{message}</p>
        </Card>
      )}

      {stats.verifiedGrammar === 0 && (
        <Card className="mb-4 px-4 py-3">
          <p className="text-[14px] leading-relaxed">{t('settings.contentUnverifiedWarning')}</p>
        </Card>
      )}

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('settings.updateSection')}
        </h2>
        <Card className="px-4 py-3">
          <p className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            {t('settings.appVersion', { version: BUILD_VERSION })}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
            {t('settings.forceUpdateNote')}
          </p>
          <button
            type="button"
            onClick={() => void forceUpdate()}
            className="tap mt-2 w-full rounded-lg border py-2.5 text-center text-[14px] hairline"
            style={{ background: 'var(--paper-raised)', color: 'var(--accent)' }}
          >
            {t('settings.forceUpdate')}
          </button>
        </Card>
      </section>
      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('onboarding.roadmap.title')}
        </h2>
        <Card className="divide-y px-4 hairline">
          <Row label={t('settings.examDate')}>
            <input
              type="date"
              defaultValue={ctx?.profile.examDate.slice(0, 10)}
              onChange={(e) => void change({ examDate: new Date(e.target.value).toISOString() })}
              className="tap rounded-lg border px-2 py-1.5 text-[14px] hairline"
              style={{ background: 'var(--paper)', color: 'var(--ink)' }}
            />
          </Row>
          <Row label={t('settings.minutes')}>
            <input
              type="number"
              min={10}
              max={120}
              step={5}
              defaultValue={ctx?.profile.availableMinutesPerDay}
              onBlur={(e) => void change({ availableMinutesPerDay: Number(e.target.value) })}
              className="tabular tap w-20 rounded-lg border px-2 py-1.5 text-right text-[14px] hairline"
              style={{ background: 'var(--paper)', color: 'var(--ink)' }}
            />
          </Row>
          <Row label={t('settings.daysPerWeek')}>
            <input
              type="number"
              min={1}
              max={7}
              defaultValue={ctx?.profile.daysPerWeek}
              onBlur={(e) => void change({ daysPerWeek: Number(e.target.value) })}
              className="tabular tap w-20 rounded-lg border px-2 py-1.5 text-right text-[14px] hairline"
              style={{ background: 'var(--paper)', color: 'var(--ink)' }}
            />
          </Row>
        </Card>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('nav.more')}
        </h2>
        <Card className="divide-y px-4 hairline">
          <Row label={t('settings.furigana')}>
            <Toggle checked={furigana} onChange={setFurigana} label={t('settings.furigana')} />
          </Row>
          <Row label={t('settings.darkMode')}>
            <Toggle checked={theme === 'dark'} onChange={toggleTheme} label={t('settings.darkMode')} />
          </Row>
        </Card>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('settings.backup')}
        </h2>
        <Card className="px-4 py-3">
          <p className="mb-2 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            {backupAt ? t('settings.lastBackup', { when: formatDateVi(backupAt) }) : t('settings.neverBackedUp')}
          </p>
          {daysSinceBackup !== null && daysSinceBackup >= BACKUP_REMINDER_DAYS && (
            <p className="mb-2 text-[13px]" style={{ color: 'var(--warn)' }}>
              {t('settings.backupReminder', { days: daysSinceBackup })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => void doExport()}>{t('settings.export')}</SecondaryButton>
            <SecondaryButton onClick={() => fileRef.current?.click()}>{t('settings.import')}</SecondaryButton>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])}
          />
        </Card>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-faint)' }}>
          {t('settings.importContent')}
        </h2>
        <Card className="px-4 py-3">
          <p className="mb-1 text-[13px]">
            {t('settings.contentStatus', {
              grammar: stats.grammar,
              questions: stats.questions,
              verified: stats.verifiedGrammar + stats.verifiedQuestions,
            })}
          </p>
          <p className="mb-2 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            {t('settings.importContentHint')}
          </p>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => contentRef.current?.click()}>{t('settings.importGrammarJson')}</SecondaryButton>
          </div>
          <input
            ref={contentRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void doImportContent(e.target.files[0], 'grammar')}
          />
        </Card>
      </section>

      <section className="mb-8">
        <Card className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => navigate('/onboarding')}>{t('settings.redoOnboarding')}</SecondaryButton>
          </div>
          <div className="mt-3">
            <PrimaryButton
              onClick={async () => {
                if (!confirm(t('settings.resetStep1'))) return;
                if (!confirm(t('settings.resetStep2'))) return;
                await resetAllData();
                await bootstrap();
                navigate('/onboarding', { replace: true });
              }}
              className="!bg-transparent"
            >
              <span style={{ color: 'var(--seal)' }}>{t('settings.reset')}</span>
            </PrimaryButton>
          </div>
        </Card>
      </section>

    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-[15px]">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="tap relative h-7 w-12 rounded-full"
      style={{ background: checked ? 'var(--accent)' : 'var(--rule-strong)' }}
    >
      <span
        className="absolute top-1 h-5 w-5 rounded-full"
        style={{ background: 'var(--paper-raised)', left: checked ? 26 : 4 }}
      />
    </button>
  );
}
