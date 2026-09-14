import { db, type ContentOverrideRow, type LearnedRelationRow } from '../db';
import type { Attempt } from '@/domain/attempt';
import type { GrammarMastery } from '@/domain/mastery';
import type { LearnerProfile, StudyPlan } from '@/domain/learner';
import type { DailySession } from '@/domain/session';
import type { ReadinessSnapshot, WeeklyCheckpoint } from '@/domain/analytics';
import type { GrammarRelation } from '@/domain/grammar';
import type { Flashcard } from '@/domain/flashcard';

/* ── profile ── */
export const profileRepo = {
  async get(): Promise<LearnerProfile | undefined> {
    return db.profile.get('me');
  },
  async save(profile: LearnerProfile): Promise<void> {
    await db.profile.put(profile);
  },
};

/* ── plans (giữ lịch sử, không ghi đè) ── */
export const planRepo = {
  async latest(): Promise<StudyPlan | undefined> {
    return db.plans.orderBy('version').last();
  },
  async add(plan: StudyPlan): Promise<void> {
    await db.plans.put(plan);
  },
  async all(): Promise<StudyPlan[]> {
    return db.plans.orderBy('version').toArray();
  },
};

/* ── mastery ── */
export const masteryRepo = {
  /** Chỉ dùng khi gộp mẫu trùng — xoá bản ghi của id đã bị gộp. */
  async remove(grammarId: string): Promise<void> {
    await db.mastery.delete(grammarId);
  },
  async getAll(): Promise<GrammarMastery[]> {
    return db.mastery.toArray();
  },
  async get(grammarId: string): Promise<GrammarMastery | undefined> {
    return db.mastery.get(grammarId);
  },
  async put(m: GrammarMastery): Promise<void> {
    await db.mastery.put(m);
  },
  async putMany(list: GrammarMastery[]): Promise<void> {
    await db.mastery.bulkPut(list);
  },
};

/* ── attempts: CHỈ APPEND (arch §5.2) ── */
export const attemptRepo = {
  async add(attempt: Attempt): Promise<void> {
    await db.attempts.add(attempt);
  },
  async all(): Promise<Attempt[]> {
    return db.attempts.orderBy('timestamp').toArray();
  },
  async since(iso: string): Promise<Attempt[]> {
    return db.attempts.where('timestamp').aboveOrEqual(iso).toArray();
  },
  async forGrammar(grammarId: string): Promise<Attempt[]> {
    const list = await db.attempts.where('grammarId').equals(grammarId).toArray();
    return list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },
  async forSession(sessionId: string): Promise<Attempt[]> {
    return db.attempts.where('sessionId').equals(sessionId).toArray();
  },
  async byIds(ids: string[]): Promise<Attempt[]> {
    return db.attempts.bulkGet(ids).then((l) => l.filter(Boolean) as Attempt[]);
  },
  async count(): Promise<number> {
    return db.attempts.count();
  },
};

/* ── sessions ── */
export const sessionRepo = {
  async getByDate(date: string): Promise<DailySession | undefined> {
    return db.sessions.where('date').equals(date).first();
  },
  async get(id: string): Promise<DailySession | undefined> {
    return db.sessions.get(id);
  },
  async put(session: DailySession): Promise<void> {
    await db.sessions.put(session);
  },
  async recent(limit = 30): Promise<DailySession[]> {
    const all = await db.sessions.orderBy('date').reverse().limit(limit).toArray();
    return all;
  },
  async all(): Promise<DailySession[]> {
    return db.sessions.orderBy('date').toArray();
  },
};

/* ── checkpoints / readiness ── */
export const checkpointRepo = {
  async put(c: WeeklyCheckpoint): Promise<void> {
    await db.checkpoints.put(c);
  },
  async all(): Promise<WeeklyCheckpoint[]> {
    return db.checkpoints.orderBy('weekIndex').toArray();
  },
  async latest(): Promise<WeeklyCheckpoint | undefined> {
    return db.checkpoints.orderBy('weekIndex').last();
  },
};

export const readinessRepo = {
  async put(r: ReadinessSnapshot): Promise<void> {
    await db.readiness.put(r);
  },
  async all(): Promise<ReadinessSnapshot[]> {
    return db.readiness.orderBy('date').toArray();
  },
  async latest(): Promise<ReadinessSnapshot | undefined> {
    return db.readiness.orderBy('date').last();
  },
};

/* ── learned relations (source: LEARNED) ── */
export const learnedRelationRepo = {
  async putMany(relations: GrammarRelation[]): Promise<void> {
    const rows: LearnedRelationRow[] = relations.map((r) => ({ ...r, key: `${r.from}|${r.to}` }));
    await db.learnedRelations.bulkPut(rows);
  },
  async all(): Promise<GrammarRelation[]> {
    return db.learnedRelations.toArray();
  },
};

/* ── content overrides ── */
export const contentOverrideRepo = {
  async putMany(rows: ContentOverrideRow[]): Promise<void> {
    await db.contentOverrides.bulkPut(rows);
  },
  async all(): Promise<ContentOverrideRow[]> {
    return db.contentOverrides.toArray();
  },
  async clear(): Promise<void> {
    await db.contentOverrides.clear();
  },
};

/* ── meta ── */
export const metaRepo = {
  async get<T>(key: string): Promise<T | undefined> {
    const row = await db.meta.get(key);
    return row?.value as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await db.meta.put({ key, value });
  },
};

/* ── flashcards ── */
export const flashcardRepo = {
  async all(): Promise<Flashcard[]> {
    return db.flashcards.orderBy('addedAt').reverse().toArray();
  },
  async put(card: Flashcard): Promise<void> {
    await db.flashcards.put(card);
  },
  async remove(id: string): Promise<void> {
    await db.flashcards.delete(id);
  },
  async has(id: string): Promise<boolean> {
    return (await db.flashcards.get(id)) !== undefined;
  },
  /** Nội dung đổi id (gộp mẫu trùng) → thẻ đi theo, không bị mồ côi. */
  async renameRef(kind: Flashcard['kind'], fromRef: string, toRef: string): Promise<void> {
    const old = await db.flashcards.get(`${kind}:${fromRef}`);
    if (!old) return;
    await db.flashcards.delete(old.id);
    await db.flashcards.put({ ...old, id: `${kind}:${toRef}`, refId: toRef });
  },
};

/** Reset toàn bộ dữ liệu học (xác nhận hai bước ở UI). */
export async function resetAllData(): Promise<void> {
  await Promise.all([
    db.profile.clear(),
    db.plans.clear(),
    db.mastery.clear(),
    db.attempts.clear(),
    db.sessions.clear(),
    db.checkpoints.clear(),
    db.readiness.clear(),
    db.learnedRelations.clear(),
    db.contentOverrides.clear(),
    db.meta.clear(),
    db.flashcards.clear(),
  ]);
}
