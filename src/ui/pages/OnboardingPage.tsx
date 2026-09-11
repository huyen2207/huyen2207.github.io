import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeOnboarding, previewRoadmap, type OnboardingAnswers } from '@/app/services/onboardingService';
import { useAppStore } from '@/app/stores/appStore';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, PrimaryButton, SecondaryButton, ThumbBar } from '../components/primitives';
import { PhaseTimeline } from '../components/PhaseTimeline';
import { formatDateVi } from '@/shared/date';

const TOTAL_STEPS = 7;

function defaultExamDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const bootstrap = useAppStore((s) => s.bootstrap);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    examDate: defaultExamDate(),
    selfAssessedLevel: 'N2_SOLID',
    grammarAlreadyStudiedCount: 0,
    availableMinutesPerDay: 45,
    daysPerWeek: 7,
    targetScoreBand: 'COMFORTABLE',
    initialConfidence: 3,
  });

  const set = <K extends keyof OnboardingAnswers>(k: K, v: OnboardingAnswers[K]) =>
    setAnswers((a) => ({ ...a, [k]: v }));

  const isReview = step === TOTAL_STEPS;
  const preview = isReview ? previewRoadmap({ ...answers, examDate: new Date(answers.examDate).toISOString() }, new Date()) : null;

  async function finish() {
    await completeOnboarding({ ...answers, examDate: new Date(answers.examDate).toISOString() }, new Date());
    await bootstrap();
    // Xếp lớp chạy TRƯỚC ngày học đầu tiên; trang đó tự điều hướng sang /today.
    navigate('/placement', { replace: true });
  }

  return (
    <AppShell title={t('onboarding.title')} hideNav>
      {!isReview && (
        <p className="mb-4 text-[13px] tabular" style={{ color: 'var(--ink-faint)' }}>
          {t('onboarding.step', { current: step + 1, total: TOTAL_STEPS })}
        </p>
      )}

      {step === 0 && (
        <QuestionBlock titleKey="onboarding.examDate.q" hintKey="onboarding.examDate.hint">
          <input
            type="date"
            value={answers.examDate}
            onChange={(e) => set('examDate', e.target.value)}
            className="tap w-full rounded-xl border px-3 py-3 text-[16px] hairline"
            style={{ background: 'var(--paper-raised)', color: 'var(--ink)' }}
          />
        </QuestionBlock>
      )}

      {step === 1 && (
        <QuestionBlock titleKey="onboarding.level.q">
          <Options
            value={answers.selfAssessedLevel}
            options={['N2_JUST', 'N2_SOLID', 'N2_PLUS'] as const}
            labelKey={(v) => `onboarding.level.${v}`}
            onChange={(v) => set('selfAssessedLevel', v)}
          />
        </QuestionBlock>
      )}

      {step === 2 && (
        <QuestionBlock titleKey="onboarding.studied.q" hintKey="onboarding.studied.hint">
          <NumberStepper
            value={answers.grammarAlreadyStudiedCount}
            min={0}
            max={200}
            step={5}
            onChange={(v) => set('grammarAlreadyStudiedCount', v)}
          />
        </QuestionBlock>
      )}

      {step === 3 && (
        <QuestionBlock titleKey="onboarding.minutes.q" hintKey="onboarding.minutes.hint">
          <NumberStepper
            value={answers.availableMinutesPerDay}
            min={10}
            max={120}
            step={5}
            onChange={(v) => set('availableMinutesPerDay', v)}
            suffix={t('common.minutes', { n: '' }).trim()}
          />
        </QuestionBlock>
      )}

      {step === 4 && (
        <QuestionBlock titleKey="onboarding.daysPerWeek.q">
          <NumberStepper
            value={answers.daysPerWeek}
            min={1}
            max={7}
            step={1}
            onChange={(v) => set('daysPerWeek', v)}
          />
        </QuestionBlock>
      )}

      {step === 5 && (
        <QuestionBlock titleKey="onboarding.target.q">
          <Options
            value={answers.targetScoreBand}
            options={['PASS', 'COMFORTABLE', 'HIGH'] as const}
            labelKey={(v) => `onboarding.target.${v}`}
            onChange={(v) => set('targetScoreBand', v)}
          />
        </QuestionBlock>
      )}

      {step === 6 && (
        <QuestionBlock titleKey="onboarding.confidence.q">
          <div className="flex items-center gap-3">
            <span className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
              {t('onboarding.confidence.low')}
            </span>
            <input
              type="range"
              min={1}
              max={5}
              value={answers.initialConfidence}
              onChange={(e) => set('initialConfidence', Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
              className="flex-1"
              aria-label={t('onboarding.confidence.q')}
            />
            <span className="text-[12px]" style={{ color: 'var(--ink-faint)' }}>
              {t('onboarding.confidence.high')}
            </span>
          </div>
        </QuestionBlock>
      )}

      {isReview && preview && (
        <div>
          <h2 className="mb-3 text-[20px] font-semibold">{t('onboarding.roadmap.title')}</h2>
          <Card className="mb-4 px-4 py-4">
            <p className="text-[15px] font-medium">
              {t('onboarding.roadmap.days', {
                days: preview.timeline.daysRemaining,
                studyDays: preview.timeline.totalStudyDays,
              })}
            </p>
            <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
              {t('onboarding.roadmap.coverage', { n: preview.plan.coverageTarget })} ·{' '}
              {t('onboarding.roadmap.perDay', { n: preview.plan.newPerDay })}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-faint)' }}>
              {formatDateVi(preview.profile.examDate)}
            </p>
          </Card>

          <div className="mb-4">
            <PhaseTimeline timeline={preview.timeline} />
          </div>

          {preview.timeline.totalStudyDays < 90 && (
            <Card className="mb-4 px-4 py-3">
              <p className="text-[14px] leading-relaxed">{t('onboarding.roadmap.compressed')}</p>
            </Card>
          )}

          <Card className="px-4 py-3">
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              {t('onboarding.dataWarning')}
            </p>
          </Card>
        </div>
      )}

      <ThumbBar>
        <div className="flex gap-2">
          {step > 0 && <SecondaryButton onClick={() => setStep((s) => s - 1)}>{t('common.back')}</SecondaryButton>}
          <div className="flex-1">
            {isReview ? (
              <PrimaryButton onClick={() => void finish()}>{t('onboarding.roadmap.confirm')}</PrimaryButton>
            ) : (
              <PrimaryButton onClick={() => setStep((s) => s + 1)}>{t('common.continue')}</PrimaryButton>
            )}
          </div>
        </div>
      </ThumbBar>
    </AppShell>
  );
}

function QuestionBlock({
  titleKey,
  hintKey,
  children,
}: {
  titleKey: string;
  hintKey?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-1 text-[20px] font-semibold leading-snug">{t(titleKey)}</h2>
      {hintKey && (
        <p className="mb-4 text-[14px]" style={{ color: 'var(--ink-soft)' }}>
          {t(hintKey)}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Options<T extends string>({
  value,
  options,
  labelKey,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labelKey: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className="choice-tap w-full rounded-xl border px-4 py-3 text-left text-[16px] hairline"
          style={{
            background: value === o ? 'var(--accent-soft)' : 'var(--paper-raised)',
            borderColor: value === o ? 'var(--accent)' : 'var(--rule)',
            borderWidth: value === o ? 2 : 1,
          }}
        >
          {t(labelKey(o))}
        </button>
      ))}
    </div>
  );
}

function NumberStepper({
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        aria-label="-"
        onClick={() => onChange(Math.max(min, value - step))}
        className="tap rounded-xl border px-5 py-3 text-[20px] hairline"
        style={{ background: 'var(--paper-raised)' }}
      >
        −
      </button>
      <span className="tabular min-w-[5rem] text-center text-[32px] font-semibold">
        {value}
        {suffix && <span className="ml-1 text-[15px]">{suffix}</span>}
      </span>
      <button
        type="button"
        aria-label="+"
        onClick={() => onChange(Math.min(max, value + step))}
        className="tap rounded-xl border px-5 py-3 text-[20px] hairline"
        style={{ background: 'var(--paper-raised)' }}
      >
        +
      </button>
    </div>
  );
}
