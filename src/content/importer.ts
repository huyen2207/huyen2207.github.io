import type { Grammar } from '@/domain/grammar';
import type { Question } from '@/domain/question';
import { zGrammarArray, zQuestionArray } from './schema';

export interface ImportReport {
  kind: 'grammar' | 'question';
  accepted: number;
  rejected: number;
  needsReview: number;
  errors: string[];
  items: Array<Grammar | Question>;
}

/**
 * Importer (arch §6.4): mọi bản ghi import LUÔN bị ép NEEDS_REVIEW,
 * kể cả khi file nguồn tự khai VERIFIED (CLAUDE.md §16.3).
 */
export function importGrammarJson(raw: unknown, sourceId: string): ImportReport {
  const errors: string[] = [];
  const items: Grammar[] = [];
  const list = Array.isArray(raw) ? raw : [raw];
  let rejected = 0;

  for (const [i, entry] of list.entries()) {
    const parsed = zGrammarArray.safeParse([entry]);
    if (!parsed.success) {
      rejected++;
      errors.push(`#${i + 1}: ${parsed.error.issues.slice(0, 2).map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
      continue;
    }
    const g = parsed.data[0] as unknown as Grammar;
    items.push({ ...g, sourceId: g.sourceId || sourceId, verificationStatus: 'NEEDS_REVIEW' });
  }

  return { kind: 'grammar', accepted: items.length, rejected, needsReview: items.length, errors, items };
}

export function importQuestionJson(raw: unknown, sourceId: string): ImportReport {
  const errors: string[] = [];
  const items: Question[] = [];
  const list = Array.isArray(raw) ? raw : [raw];
  let rejected = 0;

  for (const [i, entry] of list.entries()) {
    const parsed = zQuestionArray.safeParse([entry]);
    if (!parsed.success) {
      rejected++;
      errors.push(`#${i + 1}: ${parsed.error.issues.slice(0, 2).map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
      continue;
    }
    const q = parsed.data[0] as unknown as Question;
    items.push({ ...q, sourceId: q.sourceId || sourceId, verificationStatus: 'NEEDS_REVIEW' });
  }

  return { kind: 'question', accepted: items.length, rejected, needsReview: items.length, errors, items };
}
