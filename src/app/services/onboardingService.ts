import type { LearnerProfile } from '@/domain/learner';
import { computeTimeline } from '@/engines/phase';
import { generatePlan } from '@/engines/roadmap';
import { listRawGrammar } from '@/content/repository';
import { planRepo, profileRepo } from '@/storage/repositories';
import { DEFAULT_DAY_BOUNDARY_HOUR } from '@/config/learning.config';
import { ensureMasteryRows } from './context';

export interface OnboardingAnswers {
  examDate: string;
  selfAssessedLevel: LearnerProfile['selfAssessedLevel'];
  grammarAlreadyStudiedCount: number;
  availableMinutesPerDay: number;
  daysPerWeek: number;
  targetScoreBand: LearnerProfile['targetScoreBand'];
  initialConfidence: LearnerProfile['initialConfidence'];
}

export function previewRoadmap(answers: OnboardingAnswers, now: Date) {
  const profile = toProfile(answers, now);
  const timeline = computeTimeline(profile, now);
  const mastery = listRawGrammar().map((g) => ({ grammarId: g.id, state: 'UNSEEN' as const }));
  const plan = generatePlan({
    profile,
    timeline,
    allGrammar: listRawGrammar(),
    mastery: mastery as never,
    now,
  });
  return { profile, timeline, plan };
}

export function toProfile(answers: OnboardingAnswers, now: Date): LearnerProfile {
  return {
    id: 'me',
    examDate: answers.examDate,
    studyStartDate: now.toISOString(),
    availableMinutesPerDay: answers.availableMinutesPerDay,
    daysPerWeek: answers.daysPerWeek,
    selfAssessedLevel: answers.selfAssessedLevel,
    grammarAlreadyStudiedCount: answers.grammarAlreadyStudiedCount,
    targetScoreBand: answers.targetScoreBand,
    initialConfidence: answers.initialConfidence,
    dayBoundaryHour: DEFAULT_DAY_BOUNDARY_HOUR,
    furiganaEnabled: false,
    createdAt: now.toISOString(),
  };
}

export async function completeOnboarding(answers: OnboardingAnswers, now: Date): Promise<void> {
  const { profile, timeline } = previewRoadmap(answers, now);
  await profileRepo.save(profile);
  const mastery = await ensureMasteryRows();
  const plan = generatePlan({ profile, timeline, allGrammar: listRawGrammar(), mastery, now });
  await planRepo.add(plan);
}
