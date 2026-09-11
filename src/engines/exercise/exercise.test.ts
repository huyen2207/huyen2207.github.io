import { describe, expect, it } from 'vitest';
import {
  buildMinimalPair,
  buildMockSet,
  grade,
  mockBudgetMs,
  normalizeForGrading,
  passesHardFilter,
  pickQuestions,
  shuffleChoices,
  type ExposureHistory,
  type GradeInput,
  type PickCriteria,
  type QuestionEnv,
} from './index';
import type { Question } from '@/domain/question';
import type { GradeOutcome } from '@/domain/enums';
import {
  getGrammar,
  getQuestion,
  getQuestionsForGrammar,
  hasEdge,
  listQuestions,
  listComparisonSets,
} from '@/content/repository';
import { MOCK_TOTAL_MS } from '@/config/timing.config';

const NOW = new Date('2026-10-01T09:00:00.000Z');
const env: QuestionEnv = { grammarById: getGrammar };
const emptyHistory: ExposureHistory = { byQuestion: {}, recentQuestionIdsToday: [] };

function criteria(over: Partial<PickCriteria> = {}): PickCriteria {
  return {
    phase: 'PHASE_2_COMPARE',
    mode: 'NORMAL',
    delivery: 'PRACTICE',
    daysUntilExam: 40,
    seed: 1234,
    now: NOW,
    ...over,
  };
}

function gradeInput(over: Partial<GradeInput> = {}): GradeInput {
  const q = getQuestion('q-ni-itatte-cloze-01')!;
  return {
    question: q,
    response: { kind: 'CHOICE', choiceId: 'a' },
    responseTimeMs: 20000,
    confidence: 'CONFIDENT',
    delivery: 'STUDY',
    context: { masteryState: 'RECOGNIZED', personalMedianRtMs: 20000, knownConfusionPartners: [], sameSessionAttemptCount: 0 },
    ...over,
  };
}

describe('ExerciseEngine — grade: 8 GradeOutcome', () => {
  const cases: Array<[GradeOutcome, Partial<GradeInput>]> = [
    ['CORRECT_CONFIDENT', {}],
    ['CORRECT_UNSURE', { confidence: 'UNSURE' }],
    ['CORRECT_GUESS', { confidence: 'GUESS' }],
    ['INCORRECT_MISCONCEPTION', { response: { kind: 'CHOICE', choiceId: 'b' }, confidence: 'CONFIDENT' }],
    [
      'INCORRECT_KNOWN_CONFUSION',
      {
        response: { kind: 'CHOICE', choiceId: 'b' },
        confidence: 'UNSURE',
        context: { masteryState: 'RECOGNIZED', personalMedianRtMs: 20000, knownConfusionPartners: ['ni-itatte-wa'], sameSessionAttemptCount: 0 },
      },
    ],
    ['INCORRECT_NEW_CONFUSION', { response: { kind: 'CHOICE', choiceId: 'b' }, confidence: 'UNSURE' }],
    ['INCORRECT_OTHER', { response: { kind: 'CHOICE', choiceId: 'd' }, confidence: 'UNSURE' }],
    ['TIMEOUT', { response: { kind: 'NONE' }, delivery: 'MOCK', confidence: 'UNSURE' }],
  ];

  it.each(cases)('outcome %s', (expected, over) => {
    expect(grade(gradeInput(over)).outcome).toBe(expected);
  });

  it('sai + CONFIDENT được xét TRƯỚC mọi phân loại confusion', () => {
    const r = grade(
      gradeInput({
        response: { kind: 'CHOICE', choiceId: 'b' },
        confidence: 'CONFIDENT',
        context: { masteryState: 'COMPARABLE', personalMedianRtMs: 24000, knownConfusionPartners: ['ni-itatte-wa'], sameSessionAttemptCount: 0 },
      }),
    );
    expect(r.outcome).toBe('INCORRECT_MISCONCEPTION');
    // Thông tin confusion không mất — nằm ở flags và confusedWith.
    expect(r.flags).toContain('KNOWN_CONFUSION');
    expect(r.flags).toContain('TRAP_HIT');
    expect(r.confusedWith).toBe('ni-itatte-wa');
    expect(r.errorTypeAuto).toBe('SIMILAR_GRAMMAR_CONFUSION');
    expect(r.violatedAxis).toBe('MEANING');
  });

  it('đúng + GUESS → cờ LUCKY', () => {
    expect(grade(gradeInput({ confidence: 'GUESS' })).flags).toContain('LUCKY');
  });

  it('P2 — cùng input cho cùng output', () => {
    expect(grade(gradeInput())).toEqual(grade(gradeInput()));
  });
});

describe('ExerciseEngine — cổng feedback theo DeliveryMode', () => {
  it('P6 — MOCK: FeedbackPayload toàn null với cả 8 outcome', () => {
    const responses: GradeInput['response'][] = [
      { kind: 'CHOICE', choiceId: 'a' },
      { kind: 'CHOICE', choiceId: 'b' },
      { kind: 'CHOICE', choiceId: 'd' },
      { kind: 'NONE' },
    ];
    for (const response of responses) {
      for (const confidence of ['GUESS', 'UNSURE', 'CONFIDENT'] as const) {
        const fb = grade(gradeInput({ response, confidence, delivery: 'MOCK' })).feedback;
        expect(Object.values(fb).every((v) => v === null)).toBe(true);
      }
    }
  });

  it('TIMED: chỉ đáp án + 1 dòng clue, KHÔNG lộ trap', () => {
    const fb = grade(gradeInput({ delivery: 'TIMED' })).feedback;
    expect(fb.correctChoiceId).toBe('a');
    expect(fb.keyClueVi).toBeTruthy();
    expect(fb.trap).toBeNull();
    expect(fb.explanationVi).toBeNull();
  });

  it('STUDY: đầy đủ, có giải thích từng distractor', () => {
    const fb = grade(gradeInput()).feedback;
    expect(fb.explanationVi).toBeTruthy();
    expect(fb.trap).not.toBeNull();
    expect(Object.keys(fb.choiceExplanations!)).toContain('b');
    expect(fb.solvingStrategy!.length).toBeGreaterThan(0);
  });
});

describe('ExerciseEngine — luật gán errorType', () => {
  it('CARELESS_ERROR không được gán khi mastery < COMPARABLE', () => {
    const q = getQuestion('q-narade-wa-form-01')!;
    const r = grade({
      question: q,
      response: { kind: 'CHOICE', choiceId: 'b' },
      responseTimeMs: 1000,
      confidence: 'UNSURE',
      delivery: 'PRACTICE',
      context: { masteryState: 'SHAKY', personalMedianRtMs: 20000, knownConfusionPartners: [], sameSessionAttemptCount: 0 },
    });
    expect(r.errorTypeAuto).not.toBe('CARELESS_ERROR');
  });

  it('TIME_PRESSURE_ERROR không được gán ở STUDY/PRACTICE', () => {
    for (const delivery of ['STUDY', 'PRACTICE'] as const) {
      const r = grade(gradeInput({ response: { kind: 'NONE' }, delivery }));
      expect(r.errorTypeAuto).not.toBe('TIME_PRESSURE_ERROR');
    }
    expect(grade(gradeInput({ response: { kind: 'NONE' }, delivery: 'TIMED' })).errorTypeAuto).toBe('TIME_PRESSURE_ERROR');
  });

  it('MOCK không tự gán CARELESS_ERROR (K8)', () => {
    const q = getQuestion('q-ni-itatte-cloze-01')!;
    const r = grade({
      question: q,
      response: { kind: 'CHOICE', choiceId: 'd' },
      responseTimeMs: 500,
      confidence: 'UNSURE',
      delivery: 'MOCK',
      context: { masteryState: 'EXAM_READY', personalMedianRtMs: 30000, knownConfusionPartners: [], sameSessionAttemptCount: 0 },
    });
    expect(r.errorTypeAuto).not.toBe('CARELESS_ERROR');
  });

  it('nội dung chưa xác minh luôn gắn cờ UNVERIFIED_CONTENT', () => {
    expect(grade(gradeInput()).flags).toContain('UNVERIFIED_CONTENT');
  });
});

describe('ExerciseEngine — SENTENCE_BUILD chấm theo ô ★', () => {
  const q = getQuestion('q-build-01')!;

  it('đúng cả chuỗi → có cờ FULL_ORDER_CORRECT (chỉ để chẩn đoán)', () => {
    const r = grade({
      question: q,
      response: { kind: 'ORDER', orderedFragmentIds: q.fragments!.map((f) => f.id) },
      responseTimeMs: 60000,
      confidence: 'CONFIDENT',
      delivery: 'PRACTICE',
      context: { masteryState: 'RECOGNIZED', personalMedianRtMs: null, knownConfusionPartners: [], sameSessionAttemptCount: 0 },
    });
    expect(r.isCorrect).toBe(true);
    expect(r.flags).toContain('FULL_ORDER_CORRECT');
  });

  it('đúng ô ★ nhưng sai thứ tự tổng → vẫn đúng, không có FULL_ORDER_CORRECT', () => {
    const r = grade({
      question: q,
      response: { kind: 'ORDER', orderedFragmentIds: ['f3', 'f2', 'f1', 'f4'] },
      responseTimeMs: 60000,
      confidence: 'CONFIDENT',
      delivery: 'PRACTICE',
      context: { masteryState: 'RECOGNIZED', personalMedianRtMs: null, knownConfusionPartners: [], sameSessionAttemptCount: 0 },
    });
    expect(r.isCorrect).toBe(true);
    expect(r.score).toBe(1);
    expect(r.flags).not.toContain('FULL_ORDER_CORRECT');
  });

  it('sai ô ★ → sai', () => {
    const r = grade({
      question: q,
      response: { kind: 'ORDER', orderedFragmentIds: ['f2', 'f1', 'f3', 'f4'] },
      responseTimeMs: 60000,
      confidence: 'UNSURE',
      delivery: 'PRACTICE',
      context: { masteryState: 'RECOGNIZED', personalMedianRtMs: null, knownConfusionPartners: [], sameSessionAttemptCount: 0 },
    });
    expect(r.isCorrect).toBe(false);
  });

  it('không xáo mảnh ghép qua shuffleChoices', () => {
    expect(shuffleChoices(q, 'seed').choices).toEqual(q.choices);
  });
});

describe('ExerciseEngine — TRAP_ID', () => {
  it('chọn đúng loại bẫy', () => {
    const q = getQuestion('q-trapid-01')!;
    const r = grade({
      question: q,
      response: { kind: 'TRAP', trapType: 'LOOKALIKE_FORM' },
      responseTimeMs: 20000,
      confidence: 'CONFIDENT',
      delivery: 'STUDY',
      context: { masteryState: 'COMPARABLE', personalMedianRtMs: null, knownConfusionPartners: [], sameSessionAttemptCount: 0 },
    });
    expect(r.isCorrect).toBe(true);
  });

  it('chọn sai loại bẫy → TRAP_ERROR', () => {
    const q = getQuestion('q-trapid-01')!;
    const r = grade({
      question: q,
      response: { kind: 'TRAP', trapType: 'REGISTER_MISMATCH' },
      responseTimeMs: 20000,
      confidence: 'UNSURE',
      delivery: 'STUDY',
      context: { masteryState: 'COMPARABLE', personalMedianRtMs: null, knownConfusionPartners: [], sameSessionAttemptCount: 0 },
    });
    expect(r.isCorrect).toBe(false);
    expect(r.errorTypeAuto).toBe('TRAP_ERROR');
  });
});

describe('ExerciseEngine — pickQuestions', () => {
  const pool = listQuestions();

  it('không bao giờ trả câu đã gặp hôm nay', () => {
    const seen = pool[0].id;
    const res = pickQuestions(pool, criteria(), { byQuestion: {}, recentQuestionIdsToday: [seen] }, 10, env);
    expect(res.questions.map((q) => q.id)).not.toContain(seen);
  });

  it('cooldown 7 ngày, trừ ngoại lệ "câu đã sai"', () => {
    const correctRecent = pool[0];
    const wrongRecent = pool[1];
    const history: ExposureHistory = {
      byQuestion: {
        [correctRecent.id]: { seenCount: 1, lastSeenAt: '2026-09-29T09:00:00.000Z', wrongCount: 0, lastWasWrong: false },
        [wrongRecent.id]: { seenCount: 1, lastSeenAt: '2026-09-29T09:00:00.000Z', wrongCount: 1, lastWasWrong: true },
      },
      recentQuestionIdsToday: [],
    };
    expect(passesHardFilter(correctRecent, criteria(), history, env)).toBe(false);
    expect(passesHardFilter(wrongRecent, criteria(), history, env)).toBe(true);
  });

  it('TRIAGE → không câu nào chỉ nhắm grammar LOW', () => {
    const res = pickQuestions(pool, criteria({ mode: 'TRIAGE' }), emptyHistory, 30, env);
    for (const q of res.questions) {
      const freqs = q.targetGrammarIds.map((g) => getGrammar(g)!.examFrequency);
      expect(freqs.every((f) => f === 'LOW')).toBe(false);
    }
  });

  it('deterministic với cùng seed', () => {
    const a = pickQuestions(pool, criteria(), emptyHistory, 8, env).questions.map((q) => q.id);
    const b = pickQuestions(pool, criteria(), emptyHistory, 8, env).questions.map((q) => q.id);
    expect(a).toEqual(b);
  });

  it('D1 — không quá ceil(n/2) câu cùng một grammar chính', () => {
    const res = pickQuestions(pool, criteria(), emptyHistory, 6, env);
    const counts = new Map<string, number>();
    for (const q of res.questions) {
      counts.set(q.targetGrammarIds[0], (counts.get(q.targetGrammarIds[0]) ?? 0) + 1);
    }
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(3);
  });

  it('D5 — thiếu câu thì báo shortfall, KHÔNG nới hard filter', () => {
    const res = pickQuestions(pool, criteria({ grammarIds: ['kirai-ga-aru'] }), emptyHistory, 50, env);
    expect(res.shortfall).toBeGreaterThan(0);
    for (const q of res.questions) expect(q.targetGrammarIds).toContain('kirai-ga-aru');
  });

  it('câu DRAFT không bao giờ được chọn', () => {
    const draft: Question = { ...pool[0], id: 'draft-1', verificationStatus: 'DRAFT' };
    expect(passesHardFilter(draft, criteria(), emptyHistory, env)).toBe(false);
  });

  it('grammar có conflictNote bị loại (H2)', () => {
    const conflicted = { ...getGrammar('ni-itatte')!, conflictNote: 'Hai nguồn mâu thuẫn.' };
    const localEnv: QuestionEnv = { grammarById: (id) => (id === 'ni-itatte' ? conflicted : getGrammar(id)) };
    expect(passesHardFilter(getQuestion('q-ni-itatte-cloze-01')!, criteria(), emptyHistory, localEnv)).toBe(false);
  });
});

describe('ExerciseEngine — mock', () => {
  it('đúng cấu trúc 10/5/5 và ngân sách ≈ 20 phút', () => {
    const res = buildMockSet(listQuestions(), criteria(), emptyHistory, env);
    const counts = { CLOZE_MC: 0, SENTENCE_BUILD: 0, TEXT_GRAMMAR: 0 } as Record<string, number>;
    for (const q of res.questions) counts[q.type]++;
    expect(counts.SENTENCE_BUILD).toBe(5);
    expect(counts.TEXT_GRAMMAR).toBe(5);
    expect(counts.CLOZE_MC).toBe(10);
    expect(mockBudgetMs()).toBe(MOCK_TOTAL_MS);
    expect(Math.abs(MOCK_TOTAL_MS - 20 * 60 * 1000) / (20 * 60 * 1000)).toBeLessThanOrEqual(0.1);
  });

  it('MOCK loại mọi câu không thuộc 3 dạng đề thật', () => {
    const res = buildMockSet(listQuestions(), criteria(), emptyHistory, env);
    for (const q of res.questions) {
      expect(['CLOZE_MC', 'SENTENCE_BUILD', 'TEXT_GRAMMAR']).toContain(q.type);
    }
  });
});

describe('ExerciseEngine — buildMinimalPair', () => {
  const mpEnv = {
    hasEdge: (a: string, b: string) => hasEdge(a, b),
    setsContainingBoth: (a: string, b: string) =>
      listComparisonSets().filter((s) => s.grammarIds.includes(a) && s.grammarIds.includes(b)),
    questionsFor: getQuestionsForGrammar,
  };

  it('trả null khi hai grammar không có cạnh trong graph', () => {
    expect(buildMinimalPair(getGrammar('ni-itatte')!, getGrammar('wo-yoso-ni')!, mpEnv)).toBeNull();
  });

  it('kết quả ghép tự động luôn mang NEEDS_REVIEW', () => {
    const pair = buildMinimalPair(getGrammar('ni-itatte')!, getGrammar('ni-itatte-wa')!, mpEnv);
    expect(pair).not.toBeNull();
    expect(pair!.verificationStatus).toBe('NEEDS_REVIEW');
    expect(pair!.type).toBe('MINIMAL_PAIR');
  });
});

describe('ExerciseEngine — normalizeForGrading', () => {
  it('KHÔNG gộp カタカナ với ひらがな', () => {
    expect(normalizeForGrading('かった')).not.toBe(normalizeForGrading('カッタ'));
  });
  it('bỏ khoảng trắng và dấu câu cuối', () => {
    expect(normalizeForGrading('　行った 。')).toBe('行った');
  });
});
