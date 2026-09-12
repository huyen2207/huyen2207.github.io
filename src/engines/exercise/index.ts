import type { Grammar, ComparisonSet } from '@/domain/grammar';
import type { Question } from '@/domain/question';
import type {
  DeliveryMode,
  ExamFrequency,
  Phase,
  QuestionType,
  SkillDimension,
  StudyMode,
  TrapType,
} from '@/domain/enums';
import type { ConfusionPair } from '@/domain/analytics';
import {
  COOLDOWN_DAYS,
  MOCK_COOLDOWN_DAYS,
  DESIRED_SUCCESS_RATE,
  EMPIRICAL_TRUST_N,
  EXAM_FREQUENCY_WEIGHT,
  EXPOSURE_SATURATION,
  SELECTION_WEIGHTS,
} from '@/config/learning.config';
import { MOCK_STRUCTURE } from '@/config/timing.config';
import { accHat, clamp } from '@/shared/math';
import { daysAgo } from '@/shared/date';
import { hashString, mulberry32, seededShuffle } from '@/shared/prng';

export * from './grade';

export interface ExposureEntry {
  seenCount: number;
  lastSeenAt: string;
  wrongCount: number;
  lastWasWrong: boolean;
}

export interface ExposureHistory {
  byQuestion: Record<string, ExposureEntry>;
  recentQuestionIdsToday: string[];
}

export interface PickCriteria {
  grammarIds?: string[];
  types?: QuestionType[];
  phase: Phase;
  mode: StudyMode;
  delivery: DeliveryMode;
  skill?: SkillDimension;
  comparisonSetId?: string;
  trapTypes?: TrapType[];
  targetDifficulty?: number;
  excludeQuestionIds?: string[];
  daysUntilExam: number;
  seed: number;
  now: Date;
  /** Grammar đích nằm trong top-5 điểm yếu (errorTargeting). */
  weakGrammarIds?: string[];
  topConfusionPairs?: ConfusionPair[];
  requireTrap?: boolean;
  /**
   * Các mẫu người học ĐÃ được giới thiệu (state ≠ UNSEEN).
   * Khi có, câu hỏi chỉ hợp lệ nếu MỌI mẫu đích đều nằm trong danh sách này (H9).
   * Bỏ trống = không lọc, dùng cho bài xếp lớp và các luồng cố ý hỏi mẫu chưa học.
   */
  introducedGrammarIds?: string[];
  /**
   * Luyện thêm ngoài buổi học chính: bỏ H4 (không lặp trong ngày) và H5 (cooldown 7 ngày).
   *
   * Hai luật đó giữ cho BUỔI HỌC không lặp câu. Nhưng ở `/practice`, người học đã trả lời
   * hết câu của những mẫu mình biết trong ngày — áp nguyên hai luật thì mọi mục đều ra
   * màn trắng, tức là phần "luyện thêm" chết hẳn. Điểm mềm (`noveltyBonus`,
   * `overExposurePenalty`) vẫn đẩy câu vừa gặp xuống cuối, nên câu mới vẫn được ưu tiên.
   */
  relaxRecency?: boolean;
}

export interface PickResult {
  questions: Question[];
  shortfall: number;
  /** Câu bị loại và lý do — phục vụ cảnh báo "kho câu hỏi cạn". */
  rejected: number;
}

export interface QuestionEnv {
  grammarById: (id: string) => Grammar | undefined;
  /** Số lần đúng / tổng lần gặp của người học trên câu này (cho difficultyEmpirical). */
  statsByQuestion?: Record<string, { correct: number; total: number }>;
}

const MOCK_TYPES: QuestionType[] = ['CLOZE_MC', 'SENTENCE_BUILD', 'TEXT_GRAMMAR'];

/* ─────────────── Hard filter (§3.2) ─────────────── */

export function passesHardFilter(
  q: Question,
  criteria: PickCriteria,
  history: ExposureHistory,
  env: QuestionEnv,
): boolean {
  // H1 — DRAFT không bao giờ vào session.
  if (q.verificationStatus === 'DRAFT') return false;

  // H2 — không kiểm tra đúng điểm đang mâu thuẫn giữa hai nguồn.
  for (const gid of q.targetGrammarIds) {
    if (env.grammarById(gid)?.conflictNote) return false;
  }

  // H3
  if (criteria.excludeQuestionIds?.includes(q.id)) return false;

  // H4 — không lặp trong cùng ngày.
  if (!criteria.relaxRecency && history.recentQuestionIdsToday.includes(q.id)) return false;

  // H5 — cooldown 7 ngày, trừ ngoại lệ "câu đã sai".
  // K5: riêng MOCK dùng cửa sổ 14 ngày để đề thi thử không lặp lại câu vừa gặp.
  const seen = history.byQuestion[q.id];
  if (seen && !criteria.relaxRecency) {
    const since = daysAgo(seen.lastSeenAt, criteria.now);
    const cooldown = criteria.delivery === 'MOCK' ? MOCK_COOLDOWN_DAYS : COOLDOWN_DAYS;
    if (seen.lastWasWrong && criteria.delivery !== 'MOCK') {
      if (since < 1) return false;
    } else if (since < cooldown) {
      return false;
    }
  }

  // H6 — TRIAGE loại câu chỉ nhắm grammar LOW.
  if (criteria.mode !== 'NORMAL') {
    const freqs = q.targetGrammarIds
      .map((g) => env.grammarById(g)?.examFrequency)
      .filter(Boolean) as ExamFrequency[];
    if (freqs.length > 0 && freqs.every((f) => f === 'LOW')) return false;
  }

  // H9 — KHÔNG hỏi mẫu chưa được dạy.
  // CLAUDE.md §7: vòng học là LEARN → RECALL → COMPARE → APPLY; phần APPLY phải áp dụng
  // cái VỪA HỌC. Trước đây thiếu luật này nên buổi đầu có thể ra mẫu của lô sau.
  // Yêu cầu MỌI mẫu đích đều đã được giới thiệu: câu so sánh mà chỉ biết một nửa thì vô nghĩa.
  if (criteria.introducedGrammarIds) {
    const introduced = criteria.introducedGrammarIds;
    if (!q.targetGrammarIds.every((g) => introduced.includes(g))) return false;
  }

  // H7
  if (criteria.types?.length && !criteria.types.includes(q.type)) return false;

  // H8 — MOCK phải giống đề thật.
  if (criteria.delivery === 'MOCK' && !MOCK_TYPES.includes(q.type)) return false;

  // TRAP_ID chỉ dùng được trên câu CÓ trap.
  if (q.type === 'TRAP_ID' && !q.trap) return false;
  if (criteria.requireTrap && !q.trap) return false;
  if (criteria.trapTypes?.length && !(q.trap && criteria.trapTypes.includes(q.trap.trapType))) return false;
  if (criteria.comparisonSetId && q.comparisonSetId !== criteria.comparisonSetId) return false;
  if (criteria.grammarIds?.length && !q.targetGrammarIds.some((g) => criteria.grammarIds!.includes(g))) return false;

  return true;
}

/* ─────────────── Difficulty (§9) ─────────────── */

export function difficultyEmpirical(correct: number, total: number): number {
  return 1 + 4 * (1 - accHat(correct, total));
}

export function effectiveDifficulty(q: Question, env: QuestionEnv): number {
  const stats = env.statsByQuestion?.[q.id];
  if (!stats || stats.total === 0) return q.difficultyStatic;
  const w = clamp(stats.total / EMPIRICAL_TRUST_N, 0, 1);
  return (1 - w) * q.difficultyStatic + w * difficultyEmpirical(stats.correct, stats.total);
}

export function predictedSuccess(q: Question, env: QuestionEnv): number {
  return clamp(1 - (effectiveDifficulty(q, env) - 1) / 4, 0, 1);
}

/* ─────────────── Soft score (§3.3) ─────────────── */

export function selectionScore(
  q: Question,
  criteria: PickCriteria,
  history: ExposureHistory,
  env: QuestionEnv,
): number {
  const w = SELECTION_WEIGHTS;
  const seen = history.byQuestion[q.id];

  const masteryFit = 1 - Math.abs(predictedSuccess(q, env) - DESIRED_SUCCESS_RATE);
  const errorTargeting = q.targetGrammarIds.some((g) => criteria.weakGrammarIds?.includes(g)) ? 1 : 0;
  const confusionTargeting = q.choices.some(
    (c) =>
      c.confusedWithGrammarId &&
      criteria.topConfusionPairs?.some(
        (p) =>
          (p.to === c.confusedWithGrammarId && q.targetGrammarIds.includes(p.from)) ||
          (p.from === c.confusedWithGrammarId && q.targetGrammarIds.includes(p.to)),
      ),
  )
    ? 1
    : 0;
  const skillFit = !criteria.skill ? 0.5 : q.testedSkill === criteria.skill ? 1 : 0;
  const noveltyBonus = seen ? clamp(daysAgo(seen.lastSeenAt, criteria.now) / 14, 0, 1) : 1;
  const examValue = Math.max(
    ...q.targetGrammarIds.map((g) => EXAM_FREQUENCY_WEIGHT[env.grammarById(g)?.examFrequency ?? 'MEDIUM']),
  );
  const overExposure = seen ? clamp(seen.seenCount / EXPOSURE_SATURATION, 0, 1) : 0;
  const difficultyMismatch = criteria.targetDifficulty
    ? Math.abs(effectiveDifficulty(q, env) - criteria.targetDifficulty) / 4
    : 0;

  return (
    w.masteryFit * masteryFit +
    w.errorTargeting * errorTargeting +
    w.confusionTargeting * confusionTargeting +
    w.skillFit * skillFit +
    w.noveltyBonus * noveltyBonus +
    w.examValue * examValue +
    w.overExposurePenalty * overExposure +
    w.difficultyMismatch * difficultyMismatch
  );
}

/* ─────────────── pickQuestions (§3.4) ─────────────── */

export function pickQuestions(
  pool: Question[],
  criteria: PickCriteria,
  history: ExposureHistory,
  count: number,
  env: QuestionEnv,
): PickResult {
  if (count <= 0) return { questions: [], shortfall: 0, rejected: 0 };

  const eligible = pool.filter((q) => passesHardFilter(q, criteria, history, env));
  const rejected = pool.length - eligible.length;

  const rnd = mulberry32(criteria.seed >>> 0);
  const ranked = eligible
    .map((q) => ({ q, s: selectionScore(q, criteria, history, env) + rnd() * 1e-6 }))
    .sort((a, b) => (b.s === a.s ? a.q.id.localeCompare(b.q.id) : b.s - a.s));

  if (criteria.delivery === 'MOCK') {
    // D4 — MOCK có tỉ lệ type cố định, D1/D2 không áp dụng.
    // K5 — ưu tiên câu nhắm grammar examFrequency = HIGH để đạt sàn MOCK_MIN_HIGH_RATIO.
    const isHigh = (q: Question) =>
      q.targetGrammarIds.some((g) => env.grammarById(g)?.examFrequency === 'HIGH');
    const out: Question[] = [];
    for (const part of MOCK_STRUCTURE) {
      const ofType = ranked.filter((x) => x.q.type === part.type).map((x) => x.q);
      const ordered = [...ofType.filter(isHigh), ...ofType.filter((q) => !isHigh(q))];
      out.push(...ordered.slice(0, part.count));
    }
    return { questions: out, shortfall: Math.max(0, count - out.length), rejected };
  }

  const perGrammarCap = Math.ceil(count / 2);
  const perTypeCap = criteria.types?.length === 1 ? count : Math.ceil(count / 2);
  const grammarCount = new Map<string, number>();
  const typeCount = new Map<QuestionType, number>();
  const out: Question[] = [];
  let lastTrap: TrapType | null = null;

  for (const { q } of ranked) {
    if (out.length >= count) break;
    const primary = q.targetGrammarIds[0];
    if ((grammarCount.get(primary) ?? 0) >= perGrammarCap) continue; // D1
    if ((typeCount.get(q.type) ?? 0) >= perTypeCap) continue; // D2
    if (q.trap && lastTrap && q.trap.trapType === lastTrap) continue; // D3
    out.push(q);
    grammarCount.set(primary, (grammarCount.get(primary) ?? 0) + 1);
    typeCount.set(q.type, (typeCount.get(q.type) ?? 0) + 1);
    lastTrap = q.trap?.trapType ?? null;
  }

  // D5 — thiếu thì trả ít hơn, KHÔNG nới hard filter.
  return { questions: out, shortfall: Math.max(0, count - out.length), rejected };
}

/* ─────────────── shuffleChoices (§3.5) ─────────────── */

export function shuffleChoices(question: Question, seedKey: string): Question {
  if (question.type === 'SENTENCE_BUILD') return question; // thứ tự mảnh là một phần của bài
  const seed = hashString(seedKey);
  return { ...question, choices: seededShuffle(question.choices, seed) };
}

export function shuffleFragments(question: Question, seedKey: string): Question {
  if (!question.fragments) return question;
  return { ...question, fragments: seededShuffle(question.fragments, hashString(seedKey)) };
}

/* ─────────────── buildMinimalPair (§4.1) ─────────────── */

export interface MinimalPairEnv {
  hasEdge: (a: string, b: string) => boolean;
  setsContainingBoth: (a: string, b: string) => ComparisonSet[];
  questionsFor: (grammarId: string) => Question[];
}

/**
 * Ghép tự động CHỈ là fallback. Kết quả luôn mang NEEDS_REVIEW (CLAUDE.md §16.3)
 * ⇒ không dùng làm bằng chứng EXAM_READY.
 */
export function buildMinimalPair(a: Grammar, b: Grammar, env: MinimalPairEnv): Question | null {
  if (!env.hasEdge(a.id, b.id)) return null;
  const sets = env.setsContainingBoth(a.id, b.id);
  if (sets.length === 0) return null;

  const decisiveRow = sets[0].rows.find((r) => r.cells[a.id] && r.cells[b.id] && r.cells[a.id] !== r.cells[b.id]);
  if (!decisiveRow) return null;

  const qa = env.questionsFor(a.id).find((q) => q.targetGrammarIds.includes(b.id));
  const qb = env.questionsFor(b.id).find((q) => q.targetGrammarIds.includes(a.id));
  if (!qa || !qb) return null;

  return {
    ...qa,
    id: `mp-auto-${a.id}-${b.id}`,
    type: 'MINIMAL_PAIR',
    comparisonSetId: sets[0].id,
    targetGrammarIds: [a.id, b.id],
    verificationStatus: 'NEEDS_REVIEW',
    testedSkill: 'COMPARE',
  };
}

/* ─────────────── Mock (§8) ─────────────── */

export function buildMockSet(
  pool: Question[],
  criteria: Omit<PickCriteria, 'delivery' | 'types'>,
  history: ExposureHistory,
  env: QuestionEnv,
): PickResult {
  const total = MOCK_STRUCTURE.reduce((s, p) => s + p.count, 0);
  return pickQuestions(pool, { ...criteria, delivery: 'MOCK' }, history, total, env);
}

export function mockBudgetMs(): number {
  return MOCK_STRUCTURE.reduce((s, p) => s + p.count * p.perQuestionMs, 0);
}
