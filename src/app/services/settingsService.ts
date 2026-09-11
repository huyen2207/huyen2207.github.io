import type { LearnerProfile } from '@/domain/learner';
import { computeTimeline } from '@/engines/phase';
import { generatePlan } from '@/engines/roadmap';
import { recompressAll } from '@/engines/review';
import { importGrammarJson, importQuestionJson } from '@/content/importer';
import { registerOverrides } from '@/content/repository';
import { listRawGrammar } from '@/content/repository';
import { contentOverrideRepo, masteryRepo, planRepo, profileRepo } from '@/storage/repositories';
import type { ContentOverrideRow } from '@/storage/db';
import type { Grammar } from '@/domain/grammar';
import type { Question } from '@/domain/question';
import { ensureMasteryRows } from './context';

export interface ProfileUpdate {
  examDate?: string;
  availableMinutesPerDay?: number;
  daysPerWeek?: number;
  furiganaEnabled?: boolean;
  dayBoundaryHour?: number;
}

/** Đổi lịch → replan có xác nhận, GIỮ lịch sử (arch §9 /settings). */
export async function updateProfile(
  current: LearnerProfile,
  update: ProfileUpdate,
  now: Date,
): Promise<LearnerProfile> {
  const next: LearnerProfile = { ...current, ...update };
  await profileRepo.save(next);

  const scheduleChanged =
    update.examDate !== undefined ||
    update.availableMinutesPerDay !== undefined ||
    update.daysPerWeek !== undefined;

  if (scheduleChanged) {
    const timeline = computeTimeline(next, now);
    const mastery = await ensureMasteryRows();

    // Ngoại lệ DUY NHẤT được phép sửa hàng loạt nextReviewAt: ngày thi gần hơn.
    if (update.examDate && new Date(update.examDate) < new Date(current.examDate)) {
      const recompressed = recompressAll(mastery, timeline, next.dayBoundaryHour);
      await masteryRepo.putMany(recompressed);
    }

    const prev = await planRepo.latest();
    const plan = generatePlan({
      profile: next,
      timeline,
      allGrammar: listRawGrammar(),
      mastery,
      now,
      previousVersion: prev?.version,
    });
    await planRepo.add(plan);
  }

  return next;
}

export async function loadContentOverrides(): Promise<void> {
  const rows = await contentOverrideRepo.all();
  registerOverrides({
    grammar: rows.filter((r) => r.type === 'grammar').map((r) => r.payload as Grammar),
    questions: rows.filter((r) => r.type === 'question').map((r) => r.payload as Question),
  });
}

export async function importContent(raw: unknown, kind: 'grammar' | 'question', now: Date) {
  const report = kind === 'grammar' ? importGrammarJson(raw, 'imported') : importQuestionJson(raw, 'imported');
  const rows: ContentOverrideRow[] = report.items.map((item) => ({
    id: (item as { id: string }).id,
    type: kind,
    verificationStatus: 'NEEDS_REVIEW',
    payload: item as Grammar | Question,
    importedAt: now.toISOString(),
  }));
  if (rows.length) await contentOverrideRepo.putMany(rows);
  await loadContentOverrides();
  await ensureMasteryRows();
  return report;
}
