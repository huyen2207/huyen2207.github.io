import { observedCadence, type CadenceCheck } from '@/engines/roadmap';
import type { DashboardMetrics, NotebookLineVi, WeeklyCheckpoint } from '@/domain/analytics';
import type { GrammarMetrics, SkillProfile } from '@/domain/mastery';
import {
  buildMetricCards,
  buildPhaseTransitionSummary,
  buildRecommendations,
  buildWeeklyCheckpoint,
  computeMetrics,
  filterForFinal7,
} from '@/engines/analytics';
import {
  buildConfusionMatrix,
  buildErrorRecords,
  deriveLearnedRelations,
  summarizeForNotebook,
} from '@/engines/error';
import { computeGrammarMetrics, computeSkillProfile } from '@/engines/mastery';
import { auditExamCoverage, pinForGuaranteedEncounters } from '@/engines/review';
import { dailyReviewCapacity } from '@/engines/session';
import { ratiosFor } from '@/config/phase.config';
import {
  checkpointRepo,
  learnedRelationRepo,
  masteryRepo,
  metaRepo,
  readinessRepo,
} from '@/storage/repositories';
import { previousPhase } from '@/engines/phase';
import type { EngineContext } from './context';
import { analyticsEnv, errorEnv } from './env';

export function reviewCapacityOf(ctx: EngineContext): number {
  const ratios = ratiosFor(ctx.timeline.currentPhase, ctx.timeline.mode);
  return dailyReviewCapacity(ctx.profile.availableMinutesPerDay, ratios.REVIEW, ctx.timeline);
}

export function dashboard(ctx: EngineContext): DashboardMetrics {
  const capacity = Math.max(1, reviewCapacityOf(ctx));
  const coverageAudit = auditExamCoverage(ctx.mastery, ctx.timeline, capacity, ctx.priorityContext);
  const metrics = computeMetrics({
    attempts: ctx.attempts,
    mastery: ctx.mastery,
    timeline: ctx.timeline,
    plan: ctx.plan,
    weakness: ctx.weakness,
    coverageAudit,
    env: analyticsEnv,
    now: ctx.now,
  });
  return metrics;
}

export function dashboardForDisplay(ctx: EngineContext): DashboardMetrics {
  return filterForFinal7(dashboard(ctx));
}

export function cards(ctx: EngineContext) {
  return buildMetricCards(dashboardForDisplay(ctx), ctx.weakness);
}

export function recommendations(ctx: EngineContext) {
  return buildRecommendations(dashboard(ctx), ctx.weakness, analyticsEnv);
}

export function notebook(ctx: EngineContext, pinnedIds: string[] = []): NotebookLineVi[] {
  const matrix = buildConfusionMatrix(ctx.attempts, ctx.now);
  const records = buildErrorRecords(ctx.attempts, pinnedIds);
  return summarizeForNotebook(ctx.weakness, matrix, records, errorEnv, ctx.now);
}

export function errorRecords(ctx: EngineContext, pinnedIds: string[] = []) {
  return buildErrorRecords(ctx.attempts, pinnedIds);
}

export function confusionMatrix(ctx: EngineContext) {
  return buildConfusionMatrix(ctx.attempts, ctx.now);
}

export function grammarInsight(
  ctx: EngineContext,
  grammarId: string,
): { metrics: GrammarMetrics; skills: SkillProfile } {
  const metrics = computeGrammarMetrics(grammarId, ctx.attempts, {
    now: ctx.now,
    phase: ctx.timeline.currentPhase,
    daysRemaining: ctx.timeline.daysRemaining,
  });
  const mastery = ctx.mastery.find((m) => m.grammarId === grammarId);
  const confusedTotal = Object.values(mastery?.confusedWith ?? {}).reduce((s, v) => s + v, 0);
  const skills = computeSkillProfile(
    metrics,
    ctx.attempts.filter((a) => a.grammarId === grammarId),
    confusedTotal,
  );
  return { metrics, skills };
}

/** Chạy sau khi kết thúc session (arch §8.4). */
export async function finalizeSession(ctx: EngineContext): Promise<{
  checkpoint: WeeklyCheckpoint | null;
  transitionPending: boolean;
}> {
  const metrics = dashboard(ctx);

  const learned = deriveLearnedRelations(ctx.attempts, ctx.now);
  if (learned.length) await learnedRelationRepo.putMany(learned);

  if (metrics.readiness) await readinessRepo.put(metrics.readiness);

  // Ghim để bảo đảm mọi mẫu đã học được gặp ≥ 2 lần trước ngày thi.
  const pinned = pinForGuaranteedEncounters(ctx.mastery, ctx.timeline, ctx.profile.dayBoundaryHour);
  await masteryRepo.putMany(pinned);
  ctx.mastery = pinned;

  let checkpoint: WeeklyCheckpoint | null = null;
  if (ctx.timeline.studyDayIndex > 0 && ctx.timeline.studyDayIndex % 7 === 0) {
    const weekIndex = Math.floor(ctx.timeline.studyDayIndex / 7);
    const existing = await checkpointRepo.all();
    if (!existing.some((c) => c.weekIndex === weekIndex)) {
      const prev = existing.length ? existing[existing.length - 1] : null;
      checkpoint = buildWeeklyCheckpoint(
        weekIndex,
        ctx.attempts,
        ctx.mastery,
        metrics,
        ctx.weakness,
        prev,
        ctx.now,
      );
      if (ctx.plan.reasonVi) {
        checkpoint.planChanges = [{ key: ctx.plan.reasonVi, params: {} }];
      }
      await checkpointRepo.put(checkpoint);
    }
  }

  const seen = await metaRepo.get<string[]>('phaseTransitionSeen');
  const transitionPending =
    ctx.timeline.isPhaseTransitionDay && !(seen ?? []).includes(ctx.timeline.currentPhase);

  return { checkpoint, transitionPending };
}

export async function phaseTransition(ctx: EngineContext) {
  const from = previousPhase(ctx.timeline.currentPhase);
  if (!from) return null;
  return buildPhaseTransitionSummary(from, ctx.timeline.currentPhase, ctx.mastery, confusionMatrix(ctx));
}

export async function markTransitionSeen(phase: string): Promise<void> {
  const seen = (await metaRepo.get<string[]>('phaseTransitionSeen')) ?? [];
  if (!seen.includes(phase)) await metaRepo.set('phaseTransitionSeen', [...seen, phase]);
}

export async function checkpoints(): Promise<WeeklyCheckpoint[]> {
  return checkpointRepo.all();
}

export async function readinessHistory() {
  return readinessRepo.all();
}

/**
 * Nhịp học thực tế so với `daysPerWeek` đã khai.
 * Tách ra khỏi UI để `/analytics` không phải tự đụng vào engine (arch §3).
 */
export function cadenceCheck(ctx: EngineContext, now: Date): CadenceCheck {
  return observedCadence(
    ctx.attempts.map((a) => a.dayKey),
    ctx.profile.daysPerWeek,
    ctx.profile.studyStartDate,
    now,
    ctx.profile.dayBoundaryHour,
  );
}

export type { CadenceCheck };
