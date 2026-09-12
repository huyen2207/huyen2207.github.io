import type { DailySession, SessionBlock } from '@/domain/session';
import type { Attempt } from '@/domain/attempt';
import type { DrillKind } from '@/domain/enums';
import {
  buildAdHocDrill,
  buildDailySession,
  dailyReviewCapacity,
  type SessionEnv,
  type TodayErrorMaterial,
  refreshAnalyzeBlock,
  buildExtraLearn,
} from '@/engines/session';
import { evaluate } from '@/engines/adaptation';
import { selectDueItems } from '@/engines/review';
import { pickQuestions, type ExposureHistory, type PickCriteria } from '@/engines/exercise';
import { buildErrorRecords } from '@/engines/error';
import {
  getGrammar,
  getQuestion,
  listComparisonSets,
  listQuestions,
} from '@/content/repository';
import { attemptRepo, sessionRepo } from '@/storage/repositories';
import { ratiosFor } from '@/config/phase.config';
import { NEW_PER_DAY_HARD_CAP } from '@/config/learning.config';
import { accHat } from '@/shared/math';
import { hashString } from '@/shared/prng';
import { daysAgo, dayKey } from '@/shared/date';
import type { EngineContext } from './context';

export function exposureHistoryFrom(attempts: Attempt[], todayKey: string): ExposureHistory {
  const byQuestion: ExposureHistory['byQuestion'] = {};
  for (const a of attempts) {
    const prev = byQuestion[a.questionId];
    byQuestion[a.questionId] = {
      seenCount: (prev?.seenCount ?? 0) + 1,
      lastSeenAt: !prev || a.timestamp > prev.lastSeenAt ? a.timestamp : prev.lastSeenAt,
      wrongCount: (prev?.wrongCount ?? 0) + (a.isCorrect ? 0 : 1),
      lastWasWrong: !prev || a.timestamp >= prev.lastSeenAt ? !a.isCorrect : prev.lastWasWrong,
    };
  }
  return {
    byQuestion,
    recentQuestionIdsToday: attempts.filter((a) => a.dayKey === todayKey).map((a) => a.questionId),
  };
}

/**
 * Nguyên liệu cho block ANALYZE_ERROR: lỗi hôm nay + top lỗi 7 ngày.
 *
 * Chỉ nhận lỗi thuộc mẫu ĐÃ ĐƯỢC DẠY (H9). Chữa lỗi một mẫu người học chưa từng
 * học không dạy được gì — nó chỉ bày ra mẫu lạ ở đúng lúc người học đang mệt.
 * Lỗi loại này vẫn nằm trong lịch sử, chỉ không được đưa lên màn chữa lỗi.
 */
export function buildErrorMaterials(ctx: EngineContext): TodayErrorMaterial[] {
  const introduced = new Set(ctx.mastery.filter((m) => m.state !== 'UNSEEN').map((m) => m.grammarId));
  const onTaughtGrammar = (a: Attempt): boolean => {
    const q = getQuestion(a.questionId);
    if (!q) return introduced.has(a.grammarId);
    return q.targetGrammarIds.every((g) => introduced.has(g));
  };

  const today = ctx.attempts.filter((a) => a.dayKey === ctx.timeline.todayKey && onTaughtGrammar(a));
  const out: TodayErrorMaterial[] = [];

  const todayWrong = today.filter((a) => !a.isCorrect);
  if (todayWrong.length) {
    out.push({ attemptIds: todayWrong.map((a) => a.attemptId), noteKey: 'analyze.todayErrors' });
  }

  const week = ctx.attempts.filter(
    (a) => daysAgo(a.timestamp, ctx.now) <= 7 && !a.isCorrect && onTaughtGrammar(a),
  );
  const records = buildErrorRecords(week);
  const recurring = records.filter((r) => r.recurrenceCount >= 2).slice(0, 2);
  for (const r of recurring) {
    out.push({ attemptIds: r.attemptIds, noteKey: 'analyze.weekErrors' });
  }

  if (out.length === 0) {
    const slowest = [...today].sort((a, b) => b.responseTimeMs - a.responseTimeMs)[0];
    if (slowest) {
      out.push({
        attemptIds: [slowest.attemptId],
        noteKey: 'analyze.slowest',
        params: { seconds: Math.round(slowest.responseTimeMs / 1000) },
      });
    }
    const lucky = today.find((a) => a.isCorrect && a.confidence === 'GUESS');
    if (lucky) out.push({ attemptIds: [lucky.attemptId], noteKey: 'analyze.lucky' });
  }

  return out;
}

export function makeSessionEnv(ctx: EngineContext, seedBase: number): SessionEnv {
  const history = exposureHistoryFrom(ctx.attempts, ctx.timeline.todayKey);
  const pool = listQuestions();
  const usedInThisBuild = new Set<string>();

  return {
    selectDue: (capacity) => selectDueItems(ctx.mastery, ctx.priorityContext, capacity),
    pickQuestions: (criteria, count) => {
      const full: PickCriteria = {
        phase: ctx.timeline.currentPhase,
        mode: ctx.timeline.mode,
        delivery: 'PRACTICE',
        daysUntilExam: ctx.timeline.daysRemaining,
        seed: seedBase + hashString(criteria.seedSalt),
        now: ctx.now,
        weakGrammarIds: ctx.weakness.errorGrammarIds,
        topConfusionPairs: ctx.weakness.topConfusionPairs,
        ...criteria,
        excludeQuestionIds: [...usedInThisBuild, ...(criteria.excludeQuestionIds ?? [])],
      };
      const res = pickQuestions(pool, full, history, count, { grammarById: getGrammar });
      for (const q of res.questions) usedInThisBuild.add(q.id);
      return res;
    },
    comparisonSetsFor: (ids) => {
      const wanted = new Set(ids);
      return listComparisonSets()
        .filter((s) => s.grammarIds.some((g) => wanted.has(g)))
        .sort((a, b) => {
          const score = (set: typeof a) =>
            set.grammarIds.filter((g) => {
              const m = ctx.mastery.find((x) => x.grammarId === g);
              return m?.state === 'CONFUSED';
            }).length;
          return score(b) - score(a);
        });
    },
    questionById: getQuestion,
    errorMaterials: buildErrorMaterials(ctx),
    recentlyLearnedGrammarIds: ctx.mastery
      .filter((m) => m.firstSeenAt && daysAgo(m.firstSeenAt, ctx.now) <= 2)
      .map((m) => m.grammarId),
    familiesOf: (id) => getGrammar(id)?.families ?? [],
  };
}

export function buildAdaptations(ctx: EngineContext) {
  const ratios = ratiosFor(ctx.timeline.currentPhase, ctx.timeline.mode);
  const capacity = dailyReviewCapacity(ctx.profile.availableMinutesPerDay, ratios.REVIEW, ctx.timeline);
  const recent = ctx.attempts.filter((a) => daysAgo(a.timestamp, ctx.now) <= 14);
  const overallAccuracy = recent.length
    ? accHat(recent.filter((a) => a.isCorrect).length, recent.length)
    : null;

  return evaluate({
    weakness: ctx.weakness,
    timeline: ctx.timeline,
    mastery: ctx.mastery,
    reviewCapacity: capacity,
    overallAccuracy,
  });
}

/** Session của một ngày sinh MỘT LẦN và được lưu (arch §8.2). */
/**
 * Buổi học đã lưu có đang hỏi mẫu CHƯA được dạy không? (H9)
 *
 * Buổi học là ảnh chụp lúc đầu ngày. Khi luật lọc đổi, hoặc khi `repairUntaught` trả một
 * mẫu về hàng chờ, ảnh chụp cũ vẫn còn nguyên câu hỏi sai luật — và người học không có
 * cách nào biết ngoài việc gặp lại mẫu lạ. Phát hiện được thì dựng lại, không bắt người
 * học tự đi tìm nút.
 *
 * Mẫu nằm trong khối HỌC MỚI hôm nay được tính là hợp lệ: đó chính là mẫu sắp được dạy.
 */
function usesUntaughtGrammar(session: DailySession, ctx: EngineContext): boolean {
  const allowed = new Set(ctx.mastery.filter((m) => m.state !== 'UNSEEN').map((m) => m.grammarId));
  for (const b of session.blocks) {
    for (const it of b.items) if (it.kind === 'LEARN_CARD') allowed.add(it.grammarId);
  }
  for (const b of session.blocks) {
    for (const it of b.items) {
      if (it.kind !== 'QUESTION' && it.kind !== 'TRAP_DRILL') continue;
      const q = getQuestion(it.questionId);
      if (q && !q.targetGrammarIds.every((g) => allowed.has(g))) return true;
    }
  }
  return false;
}

export async function getOrCreateTodaySession(ctx: EngineContext, force = false): Promise<DailySession> {
  const existing = await sessionRepo.getByDate(ctx.timeline.todayKey);
  if (existing && !force && !usesUntaughtGrammar(existing, ctx)) return existing;

  const seedBase = hashString(`${ctx.timeline.todayKey}|${ctx.plan.version}`);
  const session = buildDailySession({
    profile: ctx.profile,
    timeline: ctx.timeline,
    plan: ctx.plan,
    allMastery: ctx.mastery,
    weakness: ctx.weakness,
    adaptations: buildAdaptations(ctx),
    env: makeSessionEnv(ctx, seedBase),
    now: ctx.now,
    seed: seedBase,
  });

  if (existing) {
    session.sessionId = existing.sessionId;
  }
  await sessionRepo.put(session);
  return session;
}

/**
 * Làm mới khối "Chữa lỗi" theo các câu đã trả lời tới thời điểm này.
 * Gọi ngay trước khi người học bước vào khối đó — nếu không, nội dung vẫn là
 * ảnh chụp lúc đầu ngày (khi chưa ai trả lời câu nào).
 */
export async function refreshAnalyze(ctx: EngineContext, session: DailySession): Promise<DailySession> {
  // ĐỌC LẠI attempt từ DB: ctx trong store có thể chưa kịp cập nhật các câu vừa trả lời,
  // mà đó chính là những câu cần đưa vào phần chữa lỗi.
  const attempts = await attemptRepo.all();
  const fresh: EngineContext = { ...ctx, attempts };
  const seedBase = hashString(`${fresh.timeline.todayKey}|${fresh.plan.version}`);
  const next = refreshAnalyzeBlock(session, makeSessionEnv(fresh, seedBase), fresh.timeline);
  await sessionRepo.put(next);
  return next;
}

export async function saveSession(session: DailySession): Promise<void> {
  await sessionRepo.put(session);
}

export async function markSessionStarted(session: DailySession, now: Date): Promise<DailySession> {
  if (session.status !== 'PLANNED') return session;
  const next: DailySession = { ...session, status: 'IN_PROGRESS', startedAt: now.toISOString() };
  await sessionRepo.put(next);
  return next;
}

export async function completeSession(session: DailySession, now: Date): Promise<DailySession> {
  const next: DailySession = { ...session, status: 'COMPLETED', completedAt: now.toISOString() };
  await sessionRepo.put(next);
  return next;
}

export function buildDrill(ctx: EngineContext, kind: DrillKind, payload: Record<string, unknown>, count = 5): SessionBlock {
  const env = makeSessionEnv(ctx, hashString(`drill|${kind}|${JSON.stringify(payload)}`));
  const supported = ['CONFUSION_PAIR', 'ERROR_TYPE', 'FAMILY', 'SPEED', 'TRAP_TYPE', 'REVIEW_TOP'] as const;
  const k = (supported as readonly string[]).includes(kind) ? (kind as (typeof supported)[number]) : 'ERROR_TYPE';
  // Chỉ luyện trên mẫu đã được dạy (H9) — Trap Lab và /practice cũng phải theo luật này.
  const introduced = ctx.mastery.filter((m) => m.state !== 'UNSEEN').map((m) => m.grammarId);
  return buildAdHocDrill(k, payload, env, count, introduced);
}

/** Số mẫu mới đã học thẻ trong ngày hôm nay — dùng để trừ vào trần 8 mẫu/ngày. */
export function newGrammarLearnedToday(ctx: EngineContext): number {
  return ctx.mastery.filter(
    (m) => m.learnCardDoneAt && dayKey(new Date(m.learnCardDoneAt), ctx.profile.dayBoundaryHour) === ctx.timeline.todayKey,
  ).length;
}

export interface NewGrammarToday {
  /** Số mẫu mới đã học thẻ hôm nay. */
  learnedToday: number;
  /** Mục tiêu hôm nay theo lộ trình — học trước thì hôm sau mục tiêu tự tụt. */
  target: number;
  /** Còn thiếu bao nhiêu mẫu nữa mới đạt mục tiêu hôm nay. */
  remainingToTarget: number;
  /** Đã vượt mốc 8 mẫu/ngày — UI phải nhắc một lần, nhưng KHÔNG được chặn. */
  beyondCap: boolean;
  /** Lộ trình còn mẫu nào chưa học không. */
  unseenLeft: number;
}

/** Tình hình học mẫu mới hôm nay (CLAUDE.md §8.2 sau sửa — trần chỉ ràng buộc hệ thống). */
export function newGrammarToday(ctx: EngineContext): NewGrammarToday {
  const learnedToday = newGrammarLearnedToday(ctx);
  const byId = new Map(ctx.mastery.map((m) => [m.grammarId, m]));
  return {
    learnedToday,
    target: ctx.plan.newPerDay,
    remainingToTarget: Math.max(0, ctx.plan.newPerDay - learnedToday),
    beyondCap: learnedToday >= NEW_PER_DAY_HARD_CAP,
    unseenLeft: ctx.plan.requiredGrammarIds.filter((id) => (byId.get(id)?.state ?? 'UNSEEN') === 'UNSEEN').length,
  };
}

/** "Học thêm mẫu mới" ở /practice — đi trước lộ trình, không lệch lộ trình. */
export function buildExtraLearnBlocks(ctx: EngineContext, requested: number): SessionBlock[] {
  const env = makeSessionEnv(ctx, hashString(`extra-learn|${ctx.timeline.todayKey}|${requested}`));
  return buildExtraLearn(ctx.plan, ctx.mastery, env, requested);
}

export async function sessionAttempts(sessionId: string): Promise<Attempt[]> {
  return attemptRepo.forSession(sessionId);
}
