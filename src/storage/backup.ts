import { db, SCHEMA_VERSION } from './db';
import { metaRepo } from './repositories';

export interface BackupFile {
  format: 'n1-bunpou-90days-backup';
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

const TABLES = [
  'profile',
  'plans',
  'mastery',
  'attempts',
  'sessions',
  'checkpoints',
  'readiness',
  'learnedRelations',
  'contentOverrides',
  'meta',
] as const;

/** Export toàn bộ dữ liệu học ra JSON (bắt buộc ở MVP — CLAUDE.md §25). */
export async function exportBackup(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  for (const name of TABLES) {
    data[name] = await db.table(name).toArray();
  }
  return {
    format: 'n1-bunpou-90days-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export interface ImportResult {
  ok: boolean;
  messageKey: string;
  counts: Record<string, number>;
}

/** Import có XÁC NHẬN ghi đè. Không merge — thay toàn bộ, để tránh trạng thái lai. */
export async function importBackup(file: unknown): Promise<ImportResult> {
  const f = file as BackupFile;
  if (!f || f.format !== 'n1-bunpou-90days-backup') {
    return { ok: false, messageKey: 'backup.invalidFormat', counts: {} };
  }
  if (f.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, messageKey: 'backup.newerVersion', counts: {} };
  }

  const counts: Record<string, number> = {};
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const name of TABLES) {
      const rows = f.data[name] ?? [];
      await db.table(name).clear();
      if (rows.length) await db.table(name).bulkPut(rows);
      counts[name] = rows.length;
    }
  });
  await metaRepo.set('lastImportAt', new Date().toISOString());
  return { ok: true, messageKey: 'backup.imported', counts };
}

export async function markBackupDone(now: Date): Promise<void> {
  await metaRepo.set('lastBackupAt', now.toISOString());
}

export async function lastBackupAt(): Promise<string | undefined> {
  return metaRepo.get<string>('lastBackupAt');
}
