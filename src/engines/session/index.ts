import type { LearnerProfile, StudyPlan, Timeline } from '@/domain/learner';
import type { GrammarMastery } from '@/domain/mastery';
import type { WeaknessProfile } from '@/domain/analytics';
import type { ComparisonSet } from '@/domain/grammar';
import type { Question } from '@/domain/question';
import type {
  AdaptationNote,
  DailySession,
  SessionBlock,
  SessionItem,
} from '@/domain/session';
import type { DeliveryMode, QuestionType, SessionBlockType } from '@/domain/enums';
import { SESSION_BLOCK_ORDER } from '@/domain/enums';
import {
  ANALYZE_MIN_MINUTES,
  ANALYZE_MIN_SESSION_MINUTES,
  FINAL_7_LOAD_FACTOR,
  KNOW_DEBT_MAX_EXTRA_RATIO,
  LEARN_CARD_MS,
  MAX_BLOCK_RATIO,
  NEW_PER_DAY_HARD_CAP,
  OVERHEAD_MS,
  RECOVERY_WIN_QUESTIONS,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
  SESSION_OVERRUN_TOLERANCE,
} from '@/config/learning.config';
import { ratiosFor, type BlockRatios } from '@/config/phase.config';
import { targetRt } from '@/config/timing.config';
import { clamp } from '@/shared/math';
import { hashString } from '@/shared/prng';
import { atLeast } from '@/engines/mastery';
import { placementRank } from '@/engines/placement';
import type { Adaptation, BlockKey } from '@/engines/adaptation';
import type { ScoredItem } from '@/engines/review';
import type { PickCriteria, PickResult } from '@/engines/exercise';

export interface TodayErrorMaterial {
  /** Lỗi trong session hôm nay + top lỗi 7 ngày. */
  attemptIds: string[];
  noteKey: string;
  params?: Record<string, string | number>;
}

export interface SessionEnv {
  /** ReviewEngine.selectDueItems đã được gọi sẵn ở tầng app. */
  selectDue: (capacity: number) => ScoredItem[];
  pickQuestions: (criteria: Partial<PickCriteria> & { seedSalt: string }, count: number) => PickResult;
  comparisonSetsFor: (grammarIds: string[]) => ComparisonSet[];
  questionById: (id: string) => Question | undefined;
  /** Nguyên liệu cho ANALYZE_ERROR — do ErrorEngine cung cấp. */
  errorMaterials: TodayErrorMaterial[];
  /** Mẫu đã học 2 ngày gần đây, để gom LEARN theo family. */
  recentlyLearnedGrammarIds: string[];
  familiesOf: (grammarId: string) => string[];
}

export interface SessionInput {
  profile: LearnerProfile;
  timeline: Timeline;
  plan: StudyPlan;
  allMastery: GrammarMastery[];
  weakness: WeaknessProfile;
  adaptations: Adaptation[];
  env: SessionEnv;
  now: Date;
  seed?: number;
}

const BLOCK_KEYS: BlockKey[] = ['REVIEW', 'LEARN', 'RECALL', 'COMPARE', 'APPLY', 'ANALYZE_ERROR'];

const RECALL_TYPES: QuestionType[] = ['MEANING_MC', 'FORM_MC', 'GRAMMAR_RECOGNITION', 'VALID_OR_INVALID'];
const COMPARE_TYPES: QuestionType[] = ['MINIMAL_PAIR', 'WHY_NOT_OTHER', 'CONTEXT_MATCH'];
const APPLY_TYPES: QuestionType[] = ['CLOZE_MC', 'SENTENCE_BUILD', 'TEXT_GRAMMAR'];

/** learning-engine §8.5 — ước lượng sức chứa của một block. */
export function avgItemMs(block: BlockKey, timeline: Timeline): number {
  if (block === 'LEARN') return LEARN_CARD_MS;
  const types =
    block === 'RECALL' ? RECALL_TYPES : block === 'COMPARE' ? COMPARE_TYPES : block === 'APPLY' ? APPLY_TYPES : RECALL_TYPES;
  const avg = types.reduce((s, t) => s + targetRt(t, timeline.currentPhase), 0) / types.length;
  return avg + OVERHEAD_MS;
}

export function capacityOf(block: BlockKey, budgetMinutes: number, timeline: Timeline): number {
  if (budgetMinutes <= 0) return 0;
  return Math.max(0, Math.floor((budgetMinutes * 60_000) / avgItemMs(block, timeline)));
}

/** Sức chứa của block REVIEW theo M và tỉ lệ — dùng cả ở luật đóng băng LEARN. */
export function dailyReviewCapacity(minutes: number, reviewRatio: number, timeline: Timeline): number {
  return capacityOf('REVIEW', minutes * reviewRatio, timeline);
}

function normalize(ratios: BlockRatios): BlockRatios {
  const capped = { ...ratios };
  for (const k of BLOCK_KEYS) capped[k] = clamp(capped[k], 0, MAX_BLOCK_RATIO);
  const total = BLOCK_KEYS.reduce((s, k) => s + capped[k], 0);
  if (total <= 0) return { REVIEW: 1, LEARN: 0, RECALL: 0, COMPARE: 0, APPLY: 0, ANALYZE_ERROR: 0 };
  const out = { ...capped };
  for (const k of BLOCK_KEYS) out[k] = capped[k] / total;
  return out;
}

export interface RatioResult {
  ratios: BlockRatios;
  notes: AdaptationNote[];
  learnFrozen: boolean;
}

/** Bước 2–6 của learning-engine §8.2, tách riêng để test được. */
export function computeRatios(input: {
  timeline: Timeline;
  plan: StudyPlan;
  coverage: number;
  knowDebt: number;
  backlog: number;
  minutes: number;
  adaptations: Adaptation[];
}): RatioResult {
  const { timeline, coverage, knowDebt, backlog, minutes, adaptations } = input;
  let ratios = ratiosFor(timeline.currentPhase, timeline.mode);
  const notes: AdaptationNote[] = [];
  let learnFrozen = false;

  // Bước 3 — FINAL_14/FINAL_7 đã đủ coverage thì không nhồi mẫu mới.
  if ((timeline.mode === 'FINAL_14' || timeline.mode === 'FINAL_7') && coverage >= 1) {
    ratios = { ...ratios, APPLY: ratios.APPLY + ratios.LEARN, LEARN: 0 };
  }
  // FINAL_7: LEARN = 0 tuyệt đối.
  if (timeline.mode === 'FINAL_7') {
    ratios = { ...ratios, APPLY: ratios.APPLY + ratios.LEARN, LEARN: 0 };
  }

  // Bước 4 — backlog quá tải thì đóng băng LEARN, dồn sang REVIEW.
  const capacity = dailyReviewCapacity(minutes, ratios.REVIEW, timeline);
  if (capacity > 0 && backlog > 1.5 * capacity && ratios.LEARN > 0) {
    ratios = { ...ratios, REVIEW: ratios.REVIEW + ratios.LEARN, LEARN: 0 };
    learnFrozen = true;
    notes.push({
      ruleId: 'backlog_freeze',
      messageKey: 'adaptation.backlogFreeze',
      params: { backlog, capacity, threshold: Math.ceil(1.5 * capacity) },
    });
  }

  // Nợ KNOW khi đã sang Phase 2 (learning-engine §14.1) — trần 0.20.
  if (timeline.currentPhase === 'PHASE_2_COMPARE' && knowDebt > 0 && timeline.mode === 'NORMAL' && !learnFrozen) {
    const daysLeftInPhase2 = Math.max(1, timeline.phaseBoundaries.compareEndsDay - timeline.studyDayIndex + 1);
    const extra = clamp(knowDebt / (daysLeftInPhase2 * NEW_PER_DAY_HARD_CAP), 0, KNOW_DEBT_MAX_EXTRA_RATIO);
    if (extra > 0) {
      const fromApply = Math.min(extra, ratios.APPLY);
      const fromCompare = extra - fromApply;
      ratios = {
        ...ratios,
        LEARN: ratios.LEARN + extra,
        APPLY: ratios.APPLY - fromApply,
        COMPARE: Math.max(0, ratios.COMPARE - fromCompare),
      };
      notes.push({
        ruleId: 'know_debt',
        messageKey: 'adaptation.knowDebt',
        params: { count: knowDebt, perDay: Math.max(1, Math.round(extra * NEW_PER_DAY_HARD_CAP)) },
      });
    }
  }

  // Bước 5 — áp adaptations (đã giới hạn 3 ở AdaptationEngine).
  for (const a of adaptations) {
    if (a.replaceRatios) {
      ratios = { ...a.replaceRatios };
      learnFrozen = true;
    }
    if (a.blockDeltas) {
      for (const [k, v] of Object.entries(a.blockDeltas) as Array<[BlockKey, number]>) {
        ratios = { ...ratios, [k]: Math.max(0, ratios[k] + v) };
      }
    }
    if (a.blockMultipliers) {
      for (const [k, v] of Object.entries(a.blockMultipliers) as Array<[BlockKey, number]>) {
        ratios = { ...ratios, [k]: Math.max(0, ratios[k] * v) };
        if (k === 'LEARN' && v === 0) learnFrozen = true;
      }
    }
    notes.push({ ruleId: a.ruleId, messageKey: a.messageKey, params: a.params });
  }

  // FINAL_7 khoá LEARN sau MỌI adaptation (bất biến có test).
  if (timeline.mode === 'FINAL_7') {
    ratios = { ...ratios, APPLY: ratios.APPLY + ratios.LEARN, LEARN: 0 };
    learnFrozen = true;
  }

  return { ratios: normalize(ratios), notes, learnFrozen };
}

function budgetsFrom(ratios: BlockRatios, minutes: number): Record<BlockKey, number> {
  const out = {} as Record<BlockKey, number>;
  for (const k of BLOCK_KEYS) out[k] = Math.round(minutes * ratios[k]);

  // Sàn ANALYZE_ERROR — không bao giờ bị bỏ (CLAUDE.md §7, §8.2).
  if (minutes >= ANALYZE_MIN_SESSION_MINUTES && out.ANALYZE_ERROR < ANALYZE_MIN_MINUTES) {
    const deficit = ANALYZE_MIN_MINUTES - out.ANALYZE_ERROR;
    out.ANALYZE_ERROR = ANALYZE_MIN_MINUTES;
    const donors: BlockKey[] = ['APPLY', 'COMPARE', 'LEARN', 'RECALL', 'REVIEW'];
    let left = deficit;
    for (const d of donors) {
      if (left <= 0) break;
      const take = Math.min(left, Math.max(0, out[d] - 1));
      out[d] -= take;
      left -= take;
    }
  }
  return out;
}

function estimateMs(items: SessionItem[], env: SessionEnv, timeline: Timeline): number {
  let total = 0;
  for (const item of items) {
    if (item.kind === 'LEARN_CARD') total += LEARN_CARD_MS;
    else if (item.kind === 'COMPARE_SET') total += avgItemMs('COMPARE', timeline) * 2;
    else if (item.kind === 'ERROR_REVIEW') total += 45_000;
    else {
      const q = env.questionById(item.questionId);
      total += (q?.targetTimeMs ?? avgItemMs('APPLY', timeline)) + OVERHEAD_MS;
    }
  }
  return total;
}

function deliveryFor(block: BlockKey, timeline: Timeline): DeliveryMode {
  if (block === 'APPLY') return timeline.currentPhase === 'PHASE_3_DETECT' || timeline.mode === 'FINAL_7' ? 'TIMED' : 'PRACTICE';
  if (block === 'REVIEW') return 'PRACTICE';
  return 'STUDY';
}

/**
 * SessionEngine.buildDailySession — deterministic với cùng (input, seed).
 * Thứ tự block CỐ ĐỊNH: REVIEW → LEARN → RECALL → COMPARE → APPLY → ANALYZE_ERROR → SCHEDULE.
 */
export function buildDailySession(input: SessionInput): DailySession {
  const { profile, timeline, plan, allMastery, weakness, adaptations, env } = input;
  const seed = input.seed ?? hashString(`${timeline.todayKey}|${plan.version}`);

  let minutes = clamp(profile.availableMinutesPerDay, 1, SESSION_MAX_MINUTES);
  if (timeline.mode === 'FINAL_7') minutes = Math.round(minutes * FINAL_7_LOAD_FACTOR);

  const byId = new Map(allMastery.map((m) => [m.grammarId, m]));
  const requiredSet = new Set(plan.requiredGrammarIds);
  const covered = plan.requiredGrammarIds.filter((id) => {
    const m = byId.get(id);
    return m && atLeast(m, 'RECOGNIZED');
  }).length;
  const coverage = plan.coverageTarget === 0 ? 0 : covered / plan.coverageTarget;
  const knowDebt = plan.requiredGrammarIds.filter((id) => {
    const m = byId.get(id);
    return !m || !atLeast(m, 'RECOGNIZED');
  }).length;

  /* Ngân sách rất nhỏ — session tối thiểu (learning-engine §15). */
  if (minutes < SESSION_MIN_MINUTES) {
    const due = env.selectDue(3);
    const reviewItems = buildReviewItems(due, env, seed);
    const blocks = emptyBlocks();
    setBlock(blocks, 'REVIEW', Math.max(1, minutes - 2), reviewItems);
    setBlock(blocks, 'ANALYZE_ERROR', Math.min(2, minutes), buildAnalyzeItems(env, 1));
    return finish(blocks, [{ ruleId: 'tiny_session', messageKey: 'adaptation.tinySession', params: { minutes } }], input, seed, minutes);
  }

  const backlog = weakness.reviewDebt;
  const { ratios, notes } = computeRatios({
    timeline,
    plan,
    coverage,
    knowDebt,
    backlog,
    minutes,
    adaptations,
  });
  const budgets = budgetsFrom(ratios, minutes);

  const blocks = emptyBlocks();

  /* REVIEW */
  const reviewCapacity = capacityOf('REVIEW', budgets.REVIEW, timeline);
  const due = env.selectDue(reviewCapacity);
  setBlock(blocks, 'REVIEW', budgets.REVIEW, buildReviewItems(due, env, seed));

  /* LEARN — ưu tiên cùng family với mẫu vừa học 2 ngày qua */
  const recentFamilies = new Set(input.env.recentlyLearnedGrammarIds.flatMap((id) => env.familiesOf(id)));
  const unseen = plan.requiredGrammarIds.filter((id) => {
    const m = byId.get(id);
    return !m || m.state === 'UNSEEN';
  });
  const learnOrder = [...unseen].sort((a, b) => {
    // Mẫu đã chứng minh là biết ở bài xếp lớp thì học sau (P5).
    // Vẫn nằm trong hàng đợi — xếp lớp KHÔNG bỏ qua mẫu nào.
    const pa = placementRank(byId.get(a));
    const pb = placementRank(byId.get(b));
    if (pa !== pb) return pa - pb;
    const fa = env.familiesOf(a).some((f) => recentFamilies.has(f)) ? 0 : 1;
    const fb = env.familiesOf(b).some((f) => recentFamilies.has(f)) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return plan.requiredGrammarIds.indexOf(a) - plan.requiredGrammarIds.indexOf(b);
  });
  const learnCount = Math.min(
    capacityOf('LEARN', budgets.LEARN, timeline),
    plan.newPerDay,
    NEW_PER_DAY_HARD_CAP,
    learnOrder.length,
  );
  const learnIds = budgets.LEARN > 0 ? learnOrder.slice(0, learnCount) : [];
  setBlock(
    blocks,
    'LEARN',
    budgets.LEARN,
    learnIds.map((grammarId) => ({ kind: 'LEARN_CARD', grammarId }) as SessionItem),
  );

  /**
   * Mẫu được phép xuất hiện trong câu hỏi hôm nay (H9):
   * đã học từ trước (state ≠ UNSEEN) CỘNG các mẫu học ngay trong buổi này.
   * Thiếu vế thứ hai thì RECALL sẽ không có câu cho mẫu vừa dạy.
   */
  const introducedGrammarIds = [
    ...plan.requiredGrammarIds.filter((id) => {
      const m = byId.get(id);
      return m && m.state !== 'UNSEEN';
    }),
    ...learnIds,
  ];

  /* RECALL — mỗi mẫu vừa học phải có ≥ 1 câu recall */
  const recallTarget = Math.max(learnIds.length, capacityOf('RECALL', budgets.RECALL, timeline));
  const recallPick = env.pickQuestions(
    {
      seedSalt: 'recall',
      introducedGrammarIds,
      grammarIds: learnIds.length ? learnIds : recentReviewIds(due),
      types: RECALL_TYPES,
      delivery: 'STUDY',
      skill: 'KNOW',
    },
    recallTarget,
  );
  setBlock(
    blocks,
    'RECALL',
    budgets.RECALL,
    questionItems(recallPick, 'STUDY', env),
    recallPick.shortfall,
  );

  /* COMPARE — ưu tiên set chứa mẫu đang CONFUSED, sau đó mẫu vừa lên RECOGNIZED */
  const confusedIds = allMastery.filter((m) => m.state === 'CONFUSED').map((m) => m.grammarId);
  const recognizedIds = allMastery
    .filter((m) => m.state === 'RECOGNIZED' && requiredSet.has(m.grammarId))
    .map((m) => m.grammarId);
  const compareSets = budgets.COMPARE > 0 ? env.comparisonSetsFor([...confusedIds, ...recognizedIds, ...learnIds]) : [];
  const compareItems: SessionItem[] = [];
  const compareCapacity = capacityOf('COMPARE', budgets.COMPARE, timeline);
  if (compareSets.length > 0 && compareCapacity >= 2) {
    const set = compareSets[0];
    compareItems.push({ kind: 'COMPARE_SET', comparisonSetId: set.id });
    const comparePick = env.pickQuestions(
      {
        seedSalt: `compare-${set.id}`,
        introducedGrammarIds,
        comparisonSetId: set.id,
        types: COMPARE_TYPES,
        delivery: 'STUDY',
        skill: 'COMPARE',
      },
      Math.max(1, compareCapacity - 1),
    );
    compareItems.push(...questionItems(comparePick, 'STUDY', env));
  }
  setBlock(blocks, 'COMPARE', budgets.COMPARE, compareItems);

  /* APPLY — dạng đề; timed ở Phase 3 */
  const applyDelivery = deliveryFor('APPLY', timeline);
  const applyPick = env.pickQuestions(
    {
      seedSalt: 'apply',
      introducedGrammarIds,
      types: APPLY_TYPES,
      delivery: applyDelivery,
      skill: 'DETECT',
      weakGrammarIds: weakness.errorGrammarIds,
      topConfusionPairs: weakness.topConfusionPairs,
    },
    capacityOf('APPLY', budgets.APPLY, timeline),
  );
  setBlock(
    blocks,
    'APPLY',
    budgets.APPLY,
    questionItems(applyPick, applyDelivery, env),
    applyPick.shortfall,
  );

  /* ANALYZE_ERROR — không bao giờ bị cắt */
  setBlock(
    blocks,
    'ANALYZE_ERROR',
    budgets.ANALYZE_ERROR,
    buildAnalyzeItems(env, Math.max(1, capacityOf('ANALYZE_ERROR', budgets.ANALYZE_ERROR, timeline))),
  );

  /* Recovery: chèn "win nhỏ" */
  const recovery = adaptations.find((a) => a.ruleId === 'recovery_return');
  if (recovery?.focus?.kind === 'RECOVERY_WIN' && recovery.focus.grammarIds.length) {
    const win = env.pickQuestions(
      { seedSalt: 'recovery-win', introducedGrammarIds, grammarIds: recovery.focus.grammarIds, delivery: 'PRACTICE' },
      RECOVERY_WIN_QUESTIONS,
    );
    const block = blocks.find((b) => b.type === 'RECALL')!;
    block.items = [...block.items, ...questionItems(win, 'PRACTICE', env)];
  }

  /* Bước 8 — cắt cho vừa M × 1.15 */
  trimToBudget(blocks, env, timeline, minutes);

  return finish(blocks, notes, input, seed, minutes);
}

/* ─────────────── helpers ─────────────── */

function emptyBlocks(): SessionBlock[] {
  return SESSION_BLOCK_ORDER.map((type) => ({
    type: type as SessionBlockType,
    budgetMinutes: 0,
    items: [],
    completed: false,
  }));
}

function setBlock(
  blocks: SessionBlock[],
  type: SessionBlockType,
  budgetMinutes: number,
  items: SessionItem[],
  shortfall?: number,
): void {
  const b = blocks.find((x) => x.type === type)!;
  b.budgetMinutes = Math.max(0, budgetMinutes);
  b.items = items;
  if (shortfall && shortfall > 0) b.shortfall = shortfall;
}

function recentReviewIds(due: ScoredItem[]): string[] {
  return due.slice(0, 3).map((d) => d.grammarId);
}

function buildReviewItems(due: ScoredItem[], env: SessionEnv, seed: number): SessionItem[] {
  const items: SessionItem[] = [];
  for (const [i, item] of due.entries()) {
    if (item.mixedOnly) continue; // EXAM_READY chỉ vào mixed set khi gần thi
    const pick = env.pickQuestions(
      {
        // REVIEW đã khoá vào đúng một mẫu đang đến hạn ôn, nên mẫu đó chắc chắn đã học.
        seedSalt: `review-${item.grammarId}-${seed + i}`,
        grammarIds: [item.grammarId],
        delivery: item.suggestedDelivery,
      },
      1,
    );
    items.push(...questionItems(pick, item.suggestedDelivery, env));
  }
  return items;
}

function questionItems(pick: PickResult, delivery: DeliveryMode, _env: SessionEnv): SessionItem[] {
  return pick.questions.map((q) => ({
    kind: 'QUESTION' as const,
    questionId: q.id,
    timed: delivery === 'TIMED' || delivery === 'MOCK',
    delivery,
    grammarId: q.targetGrammarIds[0],
  }));
}

function buildAnalyzeItems(env: SessionEnv, capacity: number): SessionItem[] {
  const materials = env.errorMaterials.slice(0, Math.max(1, capacity));
  if (materials.length === 0) {
    // Không có lỗi nào → block vẫn chạy (CLAUDE.md §7).
    return [{ kind: 'ERROR_REVIEW', attemptIds: [], noteKey: 'analyze.noErrors' }];
  }
  return materials.map((m) => ({
    kind: 'ERROR_REVIEW' as const,
    attemptIds: m.attemptIds,
    noteKey: m.noteKey,
    params: m.params,
  }));
}

/** learning-engine §10 — thứ tự cắt; KHÔNG BAO GIỜ cắt ANALYZE_ERROR. */
function trimToBudget(blocks: SessionBlock[], env: SessionEnv, timeline: Timeline, minutes: number): void {
  const limitMs = minutes * SESSION_OVERRUN_TOLERANCE * 60_000;
  const order: SessionBlockType[] = ['APPLY', 'LEARN', 'COMPARE', 'RECALL', 'REVIEW'];

  const total = () => blocks.reduce((s, b) => s + estimateMs(b.items, env, timeline), 0);

  let guard = 0;
  while (total() > limitMs && guard++ < 500) {
    let cut = false;
    for (const type of order) {
      const block = blocks.find((b) => b.type === type)!;
      if (block.items.length === 0) continue;

      if (type === 'LEARN') {
        // Cắt một mẫu mới thì phải cắt luôn câu RECALL đi kèm.
        const removed = block.items.pop();
        if (removed?.kind === 'LEARN_CARD') {
          const recall = blocks.find((b) => b.type === 'RECALL')!;
          const idx = recall.items.findIndex((i) => i.kind === 'QUESTION' && i.grammarId === removed.grammarId);
          if (idx >= 0) recall.items.splice(idx, 1);
        }
        cut = true;
        break;
      }

      if (type === 'RECALL') {
        // Mỗi mẫu trong LEARN phải giữ ≥ 1 item RECALL.
        const learnIds = new Set(
          blocks
            .find((b) => b.type === 'LEARN')!
            .items.filter((i) => i.kind === 'LEARN_CARD')
            .map((i) => (i as { grammarId: string }).grammarId),
        );
        const counts = new Map<string, number>();
        for (const i of block.items) {
          if (i.kind === 'QUESTION') counts.set(i.grammarId, (counts.get(i.grammarId) ?? 0) + 1);
        }
        const idx = block.items.findIndex(
          (i) => i.kind === 'QUESTION' && (!learnIds.has(i.grammarId) || (counts.get(i.grammarId) ?? 0) > 1),
        );
        if (idx >= 0) {
          block.items.splice(idx, 1);
          cut = true;
          break;
        }
        continue;
      }

      if (type === 'COMPARE') {
        // Bỏ cả set, không bỏ nửa set.
        block.items = [];
        cut = true;
        break;
      }

      block.items.pop();
      cut = true;
      break;
    }
    if (!cut) break;
  }
}

function finish(
  blocks: SessionBlock[],
  notes: AdaptationNote[],
  input: SessionInput,
  seed: number,
  minutes: number,
): DailySession {
  // Block rỗng bị ẩn khỏi UI bằng cách đặt budget 0 (learning-engine §8.3).
  for (const b of blocks) {
    if (b.items.length === 0 && b.type !== 'SCHEDULE' && b.type !== 'ANALYZE_ERROR') b.budgetMinutes = 0;
  }
  const schedule = blocks.find((b) => b.type === 'SCHEDULE')!;
  schedule.budgetMinutes = 0;
  schedule.items = [];

  return {
    sessionId: `sess-${input.timeline.todayKey}-${seed}`,
    date: input.timeline.todayKey,
    phase: input.timeline.currentPhase,
    mode: input.timeline.mode,
    plannedMinutes: minutes,
    blocks,
    adaptationNotes: notes,
    status: 'PLANNED',
    cursor: { blockIndex: 0, itemIndex: 0 },
    redoQueue: [],
    seed,
  };
}

/** Tổng thời lượng ước tính (phút) — dùng cho hiển thị và cho test ngân sách. */
export function estimatedMinutes(session: DailySession, env: SessionEnv, timeline: Timeline): number {
  return (
    session.blocks.reduce((s, b) => s + estimateMs(b.items, env, timeline), 0) / 60_000
  );
}

/** Nhóm hiển thị 3–5 mục cho /today (learning-engine §8.4). Chỉ để HIỂN THỊ. */
export function displayGroups(session: DailySession): Array<{ key: string; minutes: number; items: number }> {
  const get = (t: SessionBlockType) => session.blocks.find((b) => b.type === t)!;
  const groups = [
    { key: 'group.review', minutes: get('REVIEW').budgetMinutes, items: get('REVIEW').items.length },
    {
      key: 'group.learn',
      minutes: get('LEARN').budgetMinutes + get('RECALL').budgetMinutes,
      items: get('LEARN').items.length + get('RECALL').items.length,
    },
    { key: 'group.compare', minutes: get('COMPARE').budgetMinutes, items: get('COMPARE').items.length },
    { key: 'group.apply', minutes: get('APPLY').budgetMinutes, items: get('APPLY').items.length },
    { key: 'group.analyze', minutes: get('ANALYZE_ERROR').budgetMinutes, items: get('ANALYZE_ERROR').items.length },
  ];
  return groups.filter((g) => g.minutes > 0 || g.items > 0);
}

/** SessionEngine.buildAdHocDrill — nút "Luyện ngay" ở /mistakes và /analytics. */
export function buildAdHocDrill(
  kind: 'CONFUSION_PAIR' | 'ERROR_TYPE' | 'FAMILY' | 'SPEED' | 'TRAP_TYPE' | 'REVIEW_TOP',
  payload: Record<string, unknown>,
  env: SessionEnv,
  count = 5,
  /** H9 — không lôi mẫu chưa dạy vào Trap Lab hay /practice. */
  introducedGrammarIds?: string[],
): SessionBlock {
  const criteria: Partial<PickCriteria> & { seedSalt: string } = { seedSalt: `drill-${kind}` };
  if (introducedGrammarIds) criteria.introducedGrammarIds = introducedGrammarIds;
  let delivery: DeliveryMode = 'PRACTICE';

  switch (kind) {
    case 'CONFUSION_PAIR':
      criteria.grammarIds = [payload.from as string, payload.to as string].filter(Boolean);
      criteria.types = COMPARE_TYPES;
      delivery = 'STUDY';
      break;
    case 'ERROR_TYPE':
      criteria.grammarIds = (payload.grammarIds as string[]) ?? undefined;
      break;
    case 'FAMILY':
      criteria.grammarIds = (payload.grammarIds as string[]) ?? undefined;
      break;
    case 'SPEED':
      criteria.types = payload.type ? [payload.type as QuestionType] : RECALL_TYPES;
      delivery = 'TIMED';
      break;
    case 'TRAP_TYPE':
      criteria.trapTypes = payload.trapType ? [payload.trapType as never] : undefined;
      criteria.requireTrap = true;
      break;
    case 'REVIEW_TOP':
      criteria.grammarIds = (payload.grammarIds as string[]) ?? undefined;
      break;
  }

  criteria.delivery = delivery;
  const pick = env.pickQuestions(criteria, count);
  return {
    type: kind === 'CONFUSION_PAIR' ? 'COMPARE' : 'APPLY',
    budgetMinutes: Math.max(1, Math.round((count * 45_000) / 60_000)),
    items: questionItems(pick, delivery, env),
    completed: false,
    ...(pick.shortfall > 0 ? { shortfall: pick.shortfall } : {}),
  };
}
