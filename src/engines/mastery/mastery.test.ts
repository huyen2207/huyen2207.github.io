import { describe, expect, it } from 'vitest';
import {
  applyAttempt,
  applyDecay,
  atLeast,
  canPromoteToExamReady,
  createInitialMastery,
  markLearnCardDone,
} from './index';
import type { Attempt } from '@/domain/attempt';
import type { GrammarMastery } from '@/domain/mastery';
import type { Question } from '@/domain/question';
import type { Timeline } from '@/domain/learner';
import { MASTERY_STATES, type Confidence, type QuestionType } from '@/domain/enums';
import { dayKey } from '@/shared/date';
import { mulberry32 } from '@/shared/prng';

const GID = 'ni-itatte';

function q(over: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    type: 'MEANING_MC',
    phaseHint: ['PHASE_1_KNOW'],
    targetGrammarIds: [GID],
    stemJa: 'x',
    choices: [
      { id: 'a', textJa: 'a', isCorrect: true },
      { id: 'b', textJa: 'b', isCorrect: false, wrongBecause: 'MEANING_ERROR', whyWrongVi: 'x' },
    ],
    correctChoiceId: 'a',
    explanationVi: 'x',
    keyClueVi: 'x',
    solvingStrategy: [{ order: 1, labelJa: 'x', labelVi: 'x' }],
    targetTimeMs: 20000,
    sourceId: 's',
    verificationStatus: 'VERIFIED',
    testedSkill: 'KNOW',
    difficultyStatic: 2,
    ...over,
  };
}

let seq = 0;
function att(over: Partial<Attempt> & { day: string }): Attempt {
  const ts = `${over.day}T09:00:0${(seq++ % 9)}.000Z`;
  return {
    attemptId: `a${seq}`,
    sessionId: over.sessionId ?? `s-${over.day}`,
    questionId: over.questionId ?? 'q1',
    grammarId: GID,
    phase: 'PHASE_1_KNOW',
    blockType: 'RECALL',
    isTimed: over.isTimed ?? false,
    selectedAnswer: 'a',
    correctAnswer: 'a',
    isCorrect: over.isCorrect ?? true,
    responseTimeMs: over.responseTimeMs ?? 10000,
    confidence: over.confidence ?? 'CONFIDENT',
    timestamp: ts,
    questionType: over.questionType ?? 'MEANING_MC',
    delivery: over.delivery ?? 'STUDY',
    verified: over.verified ?? true,
    dayKey: over.day,
    ...over,
  } as Attempt;
}

/** Chạy một chuỗi attempt qua engine, trả về mastery cuối. */
function run(attempts: Attempt[], question = q(), start?: GrammarMastery): GrammarMastery {
  let m = start ?? markLearnCardDone(createInitialMastery(GID), new Date('2026-09-01T00:00:00Z'));
  const prior: Attempt[] = [];
  for (const a of attempts) {
    const res = applyAttempt(m, a, { ...question, type: a.questionType }, new Date(a.timestamp), {
      priorAttempts: [...prior],
    });
    m = res.mastery;
    prior.push({ ...a, verified: question.verificationStatus === 'VERIFIED' });
  }
  return m;
}

describe('MasteryEngine — transitions CLAUDE.md §5.1', () => {
  it('UNSEEN → INTRODUCED sau learn card + mini recall (đúng hay sai đều tính)', () => {
    const m = run([att({ day: '2026-09-01', isCorrect: false })]);
    expect(m.state).toBe('INTRODUCED');
    expect(m.stateHistory[0].reason).not.toBe('');
  });

  it('INTRODUCED → RECOGNIZED cần 3 lần đúng trải ≥ 2 ngày', () => {
    const sameDay = run([
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-01' }),
    ]);
    expect(sameDay.state).toBe('INTRODUCED');

    const twoDays = run([
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-02' }),
      att({ day: '2026-09-02', questionType: 'FORM_MC' }),
    ]);
    expect(twoDays.state).toBe('RECOGNIZED');
  });

  it('M1 — đúng + GUESS không bao giờ thăng cấp', () => {
    // Lượt thứ ba hội đủ điều kiện RECOGNIZED, nhưng vì là "đoán" nên không được thăng.
    const guessed = run([
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-02', confidence: 'GUESS' }),
    ]);
    expect(guessed.state).toBe('INTRODUCED');

    // Cùng chuỗi đó nhưng chắc chắn → thăng cấp bình thường.
    const confident = run([
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-02' }),
    ]);
    expect(confident.state).toBe('RECOGNIZED');
  });

  it('đúng + GUESS ở mức ≥ RECOGNIZED → gắn SHAKY, không tụt bậc nền', () => {
    const m = run([
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-02' }),
      att({ day: '2026-09-02', questionType: 'FORM_MC' }),
    ]);
    expect(m.state).toBe('RECOGNIZED');
    const res = applyAttempt(m, att({ day: '2026-09-03', confidence: 'GUESS' }), q(), new Date('2026-09-03'), {
      priorAttempts: [],
    });
    expect(res.mastery.state).toBe('SHAKY');
    expect(res.mastery.baseRank).toBe('RECOGNIZED');
  });

  it('M3 — 6 câu đúng liên tiếp trong CÙNG một session không lên EXAM_READY', () => {
    const attempts: Attempt[] = [];
    for (let i = 0; i < 6; i++) {
      attempts.push(att({ day: '2026-09-01', sessionId: 'same', questionType: 'CLOZE_MC', isTimed: true }));
    }
    const m = run(attempts);
    expect(m.state).not.toBe('EXAM_READY');
  });

  it('M4 — không có attempt isTimed thì không thể EXAM_READY', () => {
    const evidence = Array.from({ length: 6 }, (_, i) =>
      att({ day: `2026-09-0${i + 1}`, questionType: 'CLOZE_MC', isTimed: false, responseTimeMs: 20000 }),
    );
    const m: GrammarMastery = { ...createInitialMastery(GID), state: 'COMPARABLE', baseRank: 'COMPARABLE' };
    const check = canPromoteToExamReady(m, { priorAttempts: evidence });
    expect(check.ok).toBe(false);
    expect(check.missingVi.join(' ')).toContain('giới hạn thời gian');
  });

  it('M5 — bằng chứng NEEDS_REVIEW không đủ để thăng EXAM_READY', () => {
    const days = ['2026-09-01', '2026-09-05', '2026-09-09', '2026-09-13', '2026-09-17', '2026-09-21'];
    const evidence = days.map((d) =>
      att({ day: d, questionType: 'CLOZE_MC', isTimed: true, responseTimeMs: 20000, verified: false, sessionId: `s-${d}` }),
    );
    const m: GrammarMastery = { ...createInitialMastery(GID), state: 'COMPARABLE', baseRank: 'COMPARABLE' };
    const check = canPromoteToExamReady(m, { priorAttempts: evidence });
    expect(check.ok).toBe(false);
    expect(check.missingVi.join(' ')).toContain('chưa được xác minh');
  });

  it('EXAM_READY đạt được khi đủ mọi điều kiện, kể cả khoảng nghỉ ≥ 3 ngày', () => {
    const days = ['2026-09-01', '2026-09-05', '2026-09-09', '2026-09-13', '2026-09-17', '2026-09-21'];
    const evidence = days.map((d) =>
      att({ day: d, questionType: 'CLOZE_MC', isTimed: true, responseTimeMs: 20000, sessionId: `s-${d}` }),
    );
    const m: GrammarMastery = { ...createInitialMastery(GID), state: 'COMPARABLE', baseRank: 'COMPARABLE' };
    const check = canPromoteToExamReady(m, { priorAttempts: evidence, globalGuessRate: 0.1 });
    expect(check.missingVi).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it('guessRate toàn cục > 0.30 khoá thăng EXAM_READY', () => {
    const days = ['2026-09-01', '2026-09-05', '2026-09-09', '2026-09-13', '2026-09-17', '2026-09-21'];
    const evidence = days.map((d) =>
      att({ day: d, questionType: 'CLOZE_MC', isTimed: true, responseTimeMs: 20000, sessionId: `s-${d}` }),
    );
    const m: GrammarMastery = { ...createInitialMastery(GID), state: 'COMPARABLE', baseRank: 'COMPARABLE' };
    const check = canPromoteToExamReady(m, { priorAttempts: evidence, globalGuessRate: 0.45 });
    expect(check.ok).toBe(false);
  });
});

describe('MasteryEngine — tụt cấp CLAUDE.md §5.2', () => {
  it('kịch bản 4: EXAM_READY sai 1 câu → COMPARABLE + SHAKY, KHÔNG về UNSEEN', () => {
    const m: GrammarMastery = {
      ...createInitialMastery(GID),
      state: 'EXAM_READY',
      baseRank: 'EXAM_READY',
    };
    const res = applyAttempt(m, att({ day: '2026-10-01', isCorrect: false }), q(), new Date('2026-10-01'), {
      priorAttempts: [],
    });
    expect(res.mastery.state).toBe('SHAKY');
    expect(res.mastery.baseRank).toBe('COMPARABLE');
    expect(res.mastery.state).not.toBe('UNSEEN');
  });

  it('sai ≥ 2 lần với cùng confusedWith trong 14 ngày → CONFUSED', () => {
    const m = run([
      att({ day: '2026-09-01' }),
      att({ day: '2026-09-02', isCorrect: false, confusedWith: 'ni-itatte-wa', errorType: 'SIMILAR_GRAMMAR_CONFUSION' }),
      att({ day: '2026-09-04', isCorrect: false, confusedWith: 'ni-itatte-wa', errorType: 'SIMILAR_GRAMMAR_CONFUSION' }),
    ]);
    expect(m.state).toBe('CONFUSED');
    expect(m.confusedPair).toBe('ni-itatte-wa');
    expect(m.confusedWith['ni-itatte-wa']).toBe(2);
  });

  it('M9 — thoát CONFUSED chỉ bằng contrast drill của đúng cặp đó', () => {
    const base: GrammarMastery = {
      ...createInitialMastery(GID),
      state: 'CONFUSED',
      baseRank: 'RECOGNIZED',
      confusedPair: 'ni-itatte-wa',
    };
    const plain = applyAttempt(base, att({ day: '2026-09-10' }), q(), new Date('2026-09-10'), { priorAttempts: [] });
    expect(plain.mastery.state).toBe('CONFUSED');

    const wrongPair = applyAttempt(base, att({ day: '2026-09-10' }), q(), new Date('2026-09-10'), {
      priorAttempts: [],
      contrastDrillWin: { partnerId: 'nari-ni', correct: 3, total: 3 },
    });
    expect(wrongPair.mastery.state).toBe('CONFUSED');

    const won = applyAttempt(base, att({ day: '2026-09-10' }), q(), new Date('2026-09-10'), {
      priorAttempts: [],
      contrastDrillWin: { partnerId: 'ni-itatte-wa', correct: 3, total: 3 },
    });
    expect(won.mastery.state).toBe('RECOGNIZED');
  });

  it('trả lời chậm bất thường → SHAKY kể cả khi đúng', () => {
    const prior = [
      att({ day: '2026-09-01', responseTimeMs: 8000 }),
      att({ day: '2026-09-02', responseTimeMs: 9000 }),
    ];
    const m: GrammarMastery = { ...createInitialMastery(GID), state: 'RECOGNIZED', baseRank: 'RECOGNIZED' };
    const res = applyAttempt(m, att({ day: '2026-09-03', responseTimeMs: 60000 }), q(), new Date('2026-09-03'), {
      priorAttempts: prior,
    });
    expect(res.mastery.state).toBe('SHAKY');
  });
});

describe('MasteryEngine — bất biến', () => {
  it('M6 — pure: gọi hai lần cùng input cho cùng output', () => {
    const m = createInitialMastery(GID);
    const a = att({ day: '2026-09-01' });
    const now = new Date('2026-09-01');
    expect(applyAttempt(m, a, q(), now)).toEqual(applyAttempt(m, a, q(), now));
  });

  it('M7 — mọi lần đổi state đều sinh đúng 1 event có reason', () => {
    const m = createInitialMastery(GID);
    const res = applyAttempt(m, att({ day: '2026-09-01' }), q(), new Date('2026-09-01'));
    expect(res.event).toBeDefined();
    expect(res.event!.reason.length).toBeGreaterThan(0);
    expect(res.mastery.stateHistory).toHaveLength(1);
  });

  it('M2 + M8 — property-based: 500 chuỗi ngẫu nhiên, state luôn hợp lệ và không về UNSEEN', () => {
    const rnd = mulberry32(20260910);
    const types: QuestionType[] = ['MEANING_MC', 'FORM_MC', 'MINIMAL_PAIR', 'WHY_NOT_OTHER', 'CLOZE_MC', 'SENTENCE_BUILD'];
    const confs: Confidence[] = ['GUESS', 'UNSURE', 'CONFIDENT'];

    for (let run = 0; run < 500; run++) {
      let m = createInitialMastery(GID);
      const prior: Attempt[] = [];
      const len = 3 + Math.floor(rnd() * 20);
      for (let i = 0; i < len; i++) {
        const day = `2026-09-${String(1 + Math.floor(rnd() * 27)).padStart(2, '0')}`;
        const a = att({
          day,
          isCorrect: rnd() > 0.4,
          confidence: confs[Math.floor(rnd() * confs.length)],
          questionType: types[Math.floor(rnd() * types.length)],
          isTimed: rnd() > 0.6,
          responseTimeMs: 3000 + Math.floor(rnd() * 60000),
          confusedWith: rnd() > 0.7 ? 'ni-itatte-wa' : undefined,
        });
        const res = applyAttempt(m, a, q(), new Date(a.timestamp), { priorAttempts: [...prior] });
        m = res.mastery;
        prior.push(a);
        expect(MASTERY_STATES).toContain(m.state);
        expect(m.state).not.toBe('UNSEEN');
        if (m.baseRank) expect(['INTRODUCED', 'RECOGNIZED', 'COMPARABLE', 'EXAM_READY']).toContain(m.baseRank);
      }
    }
  });

  it('applyDecay chỉ đặt isStale, không đổi state', () => {
    const timeline = { currentPhase: 'PHASE_1_KNOW', mode: 'NORMAL' } as Timeline;
    const m: GrammarMastery = {
      ...createInitialMastery(GID),
      state: 'RECOGNIZED',
      baseRank: 'RECOGNIZED',
      lastReviewedAt: '2026-09-01T09:00:00.000Z',
    };
    const after = applyDecay(m, timeline, new Date('2026-09-20T09:00:00.000Z'));
    expect(after.isStale).toBe(true);
    expect(after.state).toBe('RECOGNIZED');
  });

  it('atLeast đọc đúng bậc nền khi state là cờ SHAKY', () => {
    const m: GrammarMastery = { ...createInitialMastery(GID), state: 'SHAKY', baseRank: 'COMPARABLE' };
    expect(atLeast(m, 'RECOGNIZED')).toBe(true);
    expect(atLeast(m, 'EXAM_READY')).toBe(false);
  });

  it('dayKey theo ranh giới 04:00 địa phương', () => {
    expect(dayKey(new Date(2026, 8, 10, 3, 0), 4)).toBe('2026-09-09');
    expect(dayKey(new Date(2026, 8, 10, 5, 0), 4)).toBe('2026-09-10');
  });
});
