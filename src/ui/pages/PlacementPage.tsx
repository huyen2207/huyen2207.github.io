import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/app/stores/appStore';
import {
  placementQuestions,
  recordPlacementAnswer,
  finalizePlacement,
  markPlacementDone,
  type PlacementAnswer,
} from '@/app/services/placementService';
import { PLACEMENT_QUESTION_COUNT } from '@/config/learning.config';
import { t } from '@/i18n/vi';
import { AppShell } from '../AppShell';
import { Card, PrimaryButton, SecondaryButton, ThumbBar } from '../components/primitives';
import { ChoiceButton, ConfidenceSelector } from '../components/answering';
import { shuffleChoices } from '@/engines/exercise';
import { JaText } from '../components/JaText';
import type { Confidence } from '@/domain/enums';

type Stage = 'INTRO' | 'RUNNING' | 'DONE';

const APPROX_MINUTES = Math.max(1, Math.round((PLACEMENT_QUESTION_COUNT * 15) / 60));

export default function PlacementPage() {
  const navigate = useNavigate();
  const ctx = useAppStore((s) => s.ctx);
  const bootstrap = useAppStore((s) => s.bootstrap);

  const questions = useMemo(() => placementQuestions(), []);
  const [stage, setStage] = useState<Stage>('INTRO');
  const [pos, setPos] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [knownCount, setKnownCount] = useState(0);
  const answers = useRef<PlacementAnswer[]>([]);
  const startedAt = useRef<number>(Date.now());

  // Dữ liệu luôn đặt đáp án đúng ở vị trí đầu, nên MỌI màn hình hiển thị lựa chọn
  // đều BẮT BUỘC xáo trộn. Thiếu bước này thì đáp án luôn là nút số 1.
  const current = useMemo(
    () => (questions[pos] ? shuffleChoices(questions[pos], `placement-${questions[pos].id}`) : undefined),
    [questions, pos],
  );

  async function skip() {
    await markPlacementDone(new Date());
    navigate('/today', { replace: true });
  }

  async function submit() {
    if (!ctx || !current || !selected || !confidence) return;
    const answer = await recordPlacementAnswer(
      ctx,
      current,
      selected,
      confidence,
      Date.now() - startedAt.current,
      new Date(),
    );
    answers.current = [...answers.current, answer];
    setSelected(null);
    setConfidence(null);
    startedAt.current = Date.now();

    if (pos + 1 >= questions.length) {
      const known = await finalizePlacement(answers.current, new Date());
      setKnownCount(known);
      await bootstrap();
      setStage('DONE');
    } else {
      setPos(pos + 1);
    }
  }

  if (stage === 'INTRO') {
    return (
      <AppShell title={t('placement.title')} hideNav>
        <Card>
          <h2 className="mb-2 text-[17px] font-semibold">{t('placement.intro.heading')}</h2>
          <p className="mb-3 text-[14px]">{t('placement.intro.body', { n: questions.length })}</p>
          <p className="mb-3 text-[13px]" style={{ color: 'var(--ink-faint)' }}>
            {t('placement.intro.honest', { n: questions.length })}
          </p>
          <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
            {t('placement.intro.time', { minutes: APPROX_MINUTES })}
          </p>
        </Card>
        <ThumbBar>
          <SecondaryButton onClick={() => void skip()}>{t('placement.skip')}</SecondaryButton>
          <PrimaryButton onClick={() => setStage('RUNNING')}>{t('placement.start')}</PrimaryButton>
        </ThumbBar>
      </AppShell>
    );
  }

  if (stage === 'DONE') {
    return (
      <AppShell title={t('placement.title')} hideNav>
        <Card>
          <h2 className="mb-2 text-[17px] font-semibold">{t('placement.done.title')}</h2>
          <p className="text-[14px]">
            {knownCount > 0
              ? t('placement.done.known', { n: knownCount })
              : t('placement.done.none')}
          </p>
        </Card>
        <ThumbBar>
          <PrimaryButton onClick={() => navigate('/today', { replace: true })}>
            {t('placement.done.continue')}
          </PrimaryButton>
        </ThumbBar>
      </AppShell>
    );
  }

  if (!current) return null;

  return (
    <AppShell title={t('placement.title')} hideNav>
      <p className="mb-3 text-[13px] tabular" style={{ color: 'var(--ink-faint)' }}>
        {t('placement.progress', { current: pos + 1, total: questions.length })}
      </p>
      <Card>
        <JaText text={current.stemJa} className="mb-4 block text-[18px]" />
        <div className="flex flex-col gap-2">
          {current.choices.map((c, i) => (
            <ChoiceButton
              key={c.id}
              label={c.textJa}
              index={i}
              status="IDLE"
              selected={selected === c.id}
              onClick={() => setSelected(c.id)}
            />
          ))}
        </div>
      </Card>
      <ConfidenceSelector value={confidence} onChange={setConfidence} />
      <ThumbBar>
        <PrimaryButton disabled={!selected || !confidence} onClick={() => void submit()}>
          {t('question.submit')}
        </PrimaryButton>
      </ThumbBar>
    </AppShell>
  );
}
