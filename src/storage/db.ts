import Dexie, { type Table } from 'dexie';
import type { Attempt } from '@/domain/attempt';
import type { GrammarMastery } from '@/domain/mastery';
import type { LearnerProfile, StudyPlan } from '@/domain/learner';
import type { DailySession } from '@/domain/session';
import type { ReadinessSnapshot, WeeklyCheckpoint } from '@/domain/analytics';
import type { GrammarRelation, Grammar } from '@/domain/grammar';
import type { Question } from '@/domain/question';
import type { Flashcard } from '@/domain/flashcard';

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface ContentOverrideRow {
  id: string;
  type: 'grammar' | 'question';
  verificationStatus: string;
  payload: Grammar | Question;
  importedAt: string;
}

export interface LearnedRelationRow extends GrammarRelation {
  key: string;
}

export const SCHEMA_VERSION = 2;

export class AppDb extends Dexie {
  profile!: Table<LearnerProfile, string>;
  plans!: Table<StudyPlan, number>;
  mastery!: Table<GrammarMastery, string>;
  attempts!: Table<Attempt, string>;
  sessions!: Table<DailySession, string>;
  checkpoints!: Table<WeeklyCheckpoint, string>;
  readiness!: Table<ReadinessSnapshot, string>;
  learnedRelations!: Table<LearnedRelationRow, string>;
  contentOverrides!: Table<ContentOverrideRow, string>;
  meta!: Table<MetaRow, string>;
  flashcards!: Table<Flashcard, string>;

  constructor(name = 'n1-bunpou-90days') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      plans: 'version, generatedAt',
      mastery: 'grammarId, state, nextReviewAt, isStale, pinned, baseRank',
      attempts: 'attemptId, timestamp, grammarId, questionId, errorType, sessionId, dayKey',
      sessions: 'sessionId, date, status',
      checkpoints: 'id, weekIndex, createdAt',
      readiness: 'id, date',
      learnedRelations: 'key, strength, from, to',
      contentOverrides: 'id, type, verificationStatus',
      meta: 'key',
    });
    // v2 — bộ thẻ ôn do người học tự đánh dấu. Thêm bảng mới, không đụng dữ liệu cũ.
    this.version(2).stores({ flashcards: 'id, kind, refId, addedAt' });
  }
}

export const db = new AppDb();

/** Chỉ dùng trong test — tạo DB riêng cho từng ca kiểm thử. */
export function createTestDb(name: string): AppDb {
  return new AppDb(name);
}
