import type { Attempt } from '@/domain/attempt';
import type { GrammarMastery } from '@/domain/mastery';
import type { LearnerProfile, StudyPlan, Timeline } from '@/domain/learner';
import type { WeaknessProfile } from '@/domain/analytics';
import type { Confidence, QuestionType } from '@/domain/enums';
import { computeTimeline } from '@/engines/phase';
import { createInitialMastery, applyDecay, repairUntaught } from '@/engines/mastery';
import { buildWeaknessProfile, emptyWeaknessProfile } from '@/engines/error';
import { generatePlan, shouldReplan } from '@/engines/roadmap';
import { weightedErrorScore, type GrammarPrioritySignals, type PriorityContext } from '@/engines/review';
import { getGrammar, listRawGrammar, getQuestion } from '@/content/repository';
import { attemptRepo, flashcardRepo, masteryRepo, planRepo, profileRepo, sessionRepo } from '@/storage/repositories';

/** Id mẫu đã gộp → id còn giữ. */
const MERGED_GRAMMAR_IDS: Record<string, string> = { 'nara-dewa': 'narade-wa' };

function normalizeMergedIds(a: Attempt): Attempt {
  const g = MERGED_GRAMMAR_IDS[a.grammarId];
  const c = a.confusedWith ? MERGED_GRAMMAR_IDS[a.confusedWith] : undefined;
  if (!g && !c) return a;
  return { ...a, ...(g ? { grammarId: g } : {}), ...(c ? { confusedWith: c } : {}) };
}
import { daysAgo, dayKey } from '@/shared/date';
import { median } from '@/shared/math';
import { GUESS_WINDOW, ERROR_WINDOW_DAYS } from '@/config/learning.config';
import { errorEnv } from './env';

export interface EngineContext {
  profile: LearnerProfile;
  timeline: Timeline;
  plan: StudyPlan;
  mastery: GrammarMastery[];
  attempts: Attempt[];
  weakness: WeaknessProfile;
  priorityContext: PriorityContext;
  now: Date;
}

/** Bảo đảm mọi grammar trong content đều có bản ghi mastery (mặc định UNSEEN). */
export async function ensureMasteryRows(): Promise<GrammarMastery[]> {
  const existing = await masteryRepo.getAll();
  const known = new Set(existing.map((m) => m.grammarId));
  const missing = listRawGrammar()
    .filter((g) => !known.has(g.id))
    .map((g) => createInitialMastery(g.id));
  if (missing.length) await masteryRepo.putMany(missing);

  // Mẫu trùng đã gộp (implementation-decisions D-03): chuyển tiến độ sang id còn lại.
  // Không làm thế thì người học đã học 〜ならでは dưới id cũ sẽ bị dạy lại từ đầu.
  for (const [oldId, newId] of Object.entries(MERGED_GRAMMAR_IDS)) {
    const from = existing.find((m) => m.grammarId === oldId);
    const toIdx = existing.findIndex((m) => m.grammarId === newId);
    if (!from) continue;
    if (from.state !== 'UNSEEN' && (toIdx < 0 || existing[toIdx].state === 'UNSEEN')) {
      const moved = { ...from, grammarId: newId };
      await masteryRepo.putMany([moved]);
      if (toIdx >= 0) existing[toIdx] = moved;
      else existing.push(moved);
    }
    await masteryRepo.remove(oldId);
    existing.splice(existing.indexOf(from), 1);
    await flashcardRepo.renameRef('GRAMMAR', oldId, newId);
  }

  // Trả về hàng chờ những mẫu bị đánh dấu "đã dạy" mà chưa hề có learn card.
  const repaired = repairUntaught(existing, new Date());
  const changed = repaired.filter((m, i) => m !== existing[i]);
  if (changed.length) await masteryRepo.putMany(changed);

  return [...repaired, ...missing];
}

export function buildSignals(
  mastery: GrammarMastery[],
  attempts: Attempt[],
  now: Date,
): Record<string, GrammarPrioritySignals> {
  const byGrammar = new Map<string, Attempt[]>();
  for (const a of attempts) byGrammar.set(a.grammarId, [...(byGrammar.get(a.grammarId) ?? []), a]);

  const out: Record<string, GrammarPrioritySignals> = {};
  for (const m of mastery) {
    const g = getGrammar(m.grammarId);
    const list = (byGrammar.get(m.grammarId) ?? []).filter((a) => daysAgo(a.timestamp, now) <= ERROR_WINDOW_DAYS);
    const typeCount = new Map<QuestionType, number>();
    for (const a of list) typeCount.set(a.questionType, (typeCount.get(a.questionType) ?? 0) + 1);
    const dominantType = [...typeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    out[m.grammarId] = {
      examFrequency: g?.examFrequency ?? 'MEDIUM',
      family: g?.families[0] ?? 'EVALUATION',
      weightedErrors: weightedErrorScore(list, now),
      trapMisses: list.filter((a) => !a.isCorrect && getQuestion(a.questionId)?.trap).length,
      medianRtMs: list.length ? median(list.map((a) => a.responseTimeMs)) : undefined,
      dominantType,
      recentConfidences: list.slice(-GUESS_WINDOW).map((a) => a.confidence as Confidence),
      hasTrapHistory: list.some((a) => !a.isCorrect && getQuestion(a.questionId)?.trap),
    };
  }
  return out;
}

export async function daysSinceLastSession(now: Date, boundaryHour: number): Promise<number> {
  const sessions = await sessionRepo.recent(5);
  const done = sessions.filter((s) => s.status === 'COMPLETED' || s.status === 'IN_PROGRESS');
  if (done.length === 0) return 0;
  const lastKey = done[0].date;
  const todayKey = dayKey(now, boundaryHour);
  const diff = Math.round(
    (new Date(`${todayKey}T00:00:00`).getTime() - new Date(`${lastKey}T00:00:00`).getTime()) / 86_400_000,
  );
  return Math.max(0, diff);
}

/** Dựng toàn bộ ngữ cảnh engine từ storage. Đây là nơi DUY NHẤT có side effect đọc DB. */
export async function loadContext(now: Date): Promise<EngineContext | null> {
  const profile = await profileRepo.get();
  if (!profile) return null;

  const timeline = computeTimeline(profile, now);
  let mastery = await ensureMasteryRows();
  mastery = mastery.map((m) => applyDecay(m, timeline, now));

  let plan = await planRepo.latest();
  const gap = await daysSinceLastSession(now, profile.dayBoundaryHour);

  if (!plan) {
    plan = generatePlan({ profile, timeline, allGrammar: listRawGrammar(), mastery, now });
    await planRepo.add(plan);
  } else {
    const check = shouldReplan(plan, timeline, mastery, gap);
    if (check.need) {
      plan = generatePlan({
        profile,
        timeline,
        allGrammar: listRawGrammar(),
        mastery,
        now,
        previousVersion: plan.version,
      });
      plan.reasonVi = check.reasonKey;
      await planRepo.add(plan);
    }
  }

  // Attempt ghi dưới id mẫu đã gộp vẫn nằm nguyên trong DB (append-only, §9). Chuẩn hoá
  // lúc ĐỌC, nếu không sổ lỗi hiện một mẫu thành hai dòng và lộ cả mã nội bộ "nara-dewa".
  const attempts = (await attemptRepo.all()).map(normalizeMergedIds);
  const weakness =
    attempts.length === 0
      ? { ...emptyWeaknessProfile(now), daysSinceLastSession: gap, reviewDebt: countDue(mastery, now) }
      : {
          ...buildWeaknessProfile(attempts, mastery, timeline, now, errorEnv),
          daysSinceLastSession: gap,
        };

  const priorityContext: PriorityContext = {
    timeline,
    weakness,
    now,
    seenTodayGrammarIds: attempts.filter((a) => a.dayKey === timeline.todayKey).map((a) => a.grammarId),
    signals: buildSignals(mastery, attempts, now),
  };

  return { profile, timeline, plan, mastery, attempts, weakness, priorityContext, now };
}

export function countDue(mastery: GrammarMastery[], now: Date): number {
  const iso = now.toISOString();
  return mastery.filter((m) => m.nextReviewAt && m.nextReviewAt < iso).length;
}
