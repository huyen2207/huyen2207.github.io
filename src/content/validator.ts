import type { ComparisonSet, Grammar, GrammarRelation, Source } from '@/domain/grammar';
import type { Question } from '@/domain/question';
import { targetRt } from '@/config/timing.config';
import {
  FORBIDDEN_GRAMMAR_KEYS,
  zComparisonSetArray,
  zGrammarArray,
  zQuestionArray,
  zRelationArray,
  zSourceArray,
} from './schema';

export type ValidationLevel = 'FAIL' | 'WARN';

export interface ValidationIssue {
  rule: string;
  level: ValidationLevel;
  entityId: string;
  messageVi: string;
}

export interface ValidationInput {
  grammar: Grammar[];
  questions: Question[];
  relations: GrammarRelation[];
  comparisonSets: ComparisonSet[];
  sources: Source[];
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  fails: ValidationIssue[];
  warns: ValidationIssue[];
  /** V10 auto-fix: id bị ép NEEDS_REVIEW vì thiếu nguồn hợp lệ. */
  forcedNeedsReview: string[];
}

const JA_EXAMPLE_MAX_LEN = 45;

function fail(rule: string, entityId: string, messageVi: string): ValidationIssue {
  return { rule, level: 'FAIL', entityId, messageVi };
}
function warn(rule: string, entityId: string, messageVi: string): ValidationIssue {
  return { rule, level: 'WARN', entityId, messageVi };
}

/** Phát hiện chu trình trong cạnh prerequisite (V6). */
export function hasPrerequisiteCycle(relations: GrammarRelation[]): string[] | null {
  const graph = new Map<string, string[]>();
  for (const r of relations.filter((x) => x.type === 'prerequisite')) {
    graph.set(r.from, [...(graph.get(r.from) ?? []), r.to]);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let cycle: string[] | null = null;

  const visit = (node: string): boolean => {
    if (state.get(node) === 1) {
      cycle = [...stack.slice(stack.indexOf(node)), node];
      return true;
    }
    if (state.get(node) === 2) return false;
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (visit(next)) return true;
    }
    stack.pop();
    state.set(node, 2);
    return false;
  };

  for (const node of graph.keys()) {
    if (visit(node)) break;
  }
  return cycle;
}

export function validateContent(input: ValidationInput): ValidationReport {
  const issues: ValidationIssue[] = [];
  const forcedNeedsReview: string[] = [];

  // Schema (Zod) — sai schema là FAIL ngay.
  const schemaChecks: Array<[string, () => { success: boolean; error?: unknown }]> = [
    ['SCHEMA_GRAMMAR', () => zGrammarArray.safeParse(input.grammar)],
    ['SCHEMA_QUESTION', () => zQuestionArray.safeParse(input.questions)],
    ['SCHEMA_RELATION', () => zRelationArray.safeParse(input.relations)],
    ['SCHEMA_COMPARISON', () => zComparisonSetArray.safeParse(input.comparisonSets)],
    ['SCHEMA_SOURCE', () => zSourceArray.safeParse(input.sources)],
  ];
  for (const [rule, check] of schemaChecks) {
    const res = check();
    if (!res.success) {
      const err = res.error as { issues?: Array<{ path: (string | number)[]; message: string }> };
      const first = err.issues?.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ');
      issues.push(fail(rule, '-', `Sai schema: ${first ?? 'không rõ'}`));
    }
  }

  const grammarIds = new Set(input.grammar.map((g) => g.id));
  const sourceIds = new Set(input.sources.map((s) => s.id));
  const questionIds = new Set(input.questions.map((q) => q.id));
  const untrustedSources = new Set(
    input.sources.filter((s) => s.kind === 'AI_GENERATED' || s.trustLevel === 'UNVERIFIED').map((s) => s.id),
  );

  /* ── Grammar ── */
  for (const g of input.grammar) {
    if (g.families.length < 1) issues.push(fail('V1', g.id, 'Thiếu family.'));
    if (g.examples.length < 2) issues.push(fail('V1', g.id, 'Cần ít nhất 2 ví dụ.'));
    if (g.structure.length < 1) issues.push(fail('V1', g.id, 'Thiếu quy tắc 接続.'));

    for (const key of FORBIDDEN_GRAMMAR_KEYS) {
      if (key in (g as unknown as Record<string, unknown>)) {
        issues.push(fail('V_DERIVED', g.id, `Trường DERIVED "${key}" không được lưu trong JSON.`));
      }
    }

    for (const [i, ex] of g.examples.entries()) {
      if (ex.highlight) {
        const [s, e] = ex.highlight;
        if (s > e || e > ex.ja.length) {
          issues.push(fail('V15', g.id, `Ví dụ ${i + 1}: highlight nằm ngoài độ dài câu.`));
        }
      }
      if (ex.ja.length > JA_EXAMPLE_MAX_LEN) {
        issues.push(warn('V_LEN', g.id, `Ví dụ ${i + 1} dài ${ex.ja.length} ký tự (> ${JA_EXAMPLE_MAX_LEN}), khó đọc trên điện thoại.`));
      }
    }

    // V10 — thiếu nguồn hợp lệ ⇒ ép NEEDS_REVIEW.
    if (!sourceIds.has(g.sourceId) || untrustedSources.has(g.sourceId) || g.conflictNote) {
      if (g.verificationStatus === 'VERIFIED') {
        issues.push(warn('V10', g.id, 'Nguồn không đủ tin cậy — bị ép về NEEDS_REVIEW.'));
        forcedNeedsReview.push(g.id);
      }
    }
  }

  /* ── Question ── */
  const grammarQuestionCount = new Map<string, number>();
  const grammarClozeCount = new Map<string, number>();

  for (const q of input.questions) {
    const correct = q.choices.filter((c) => c.isCorrect);
    if (correct.length !== 1) {
      issues.push(fail('V9', q.id, `Phải có đúng 1 đáp án đúng, đang có ${correct.length}.`));
    } else if (correct[0].id !== q.correctChoiceId) {
      issues.push(fail('V9', q.id, 'correctChoiceId không trỏ vào đáp án đúng.'));
    }

    for (const c of q.choices.filter((x) => !x.isCorrect)) {
      if (!c.wrongBecause) issues.push(fail('V2', q.id, `Đáp án "${c.id}" thiếu wrongBecause.`));
      if (!c.whyWrongVi) issues.push(fail('V2', q.id, `Đáp án "${c.id}" thiếu whyWrongVi.`));
      if (c.wrongBecause === 'SIMILAR_GRAMMAR_CONFUSION') {
        if (!c.confusedWithGrammarId) {
          issues.push(fail('V3', q.id, `Đáp án "${c.id}" khai SIMILAR_GRAMMAR_CONFUSION nhưng thiếu confusedWithGrammarId.`));
        } else if (!grammarIds.has(c.confusedWithGrammarId)) {
          issues.push(fail('V3', q.id, `confusedWithGrammarId "${c.confusedWithGrammarId}" không tồn tại.`));
        }
      }
    }

    if (!q.keyClueVi.trim()) issues.push(fail('V4', q.id, 'Thiếu keyClueVi.'));
    if (q.solvingStrategy.length < 1) issues.push(fail('V4', q.id, 'Thiếu solvingStrategy.'));

    for (const gid of q.targetGrammarIds) {
      if (!grammarIds.has(gid)) issues.push(fail('V5', q.id, `targetGrammarIds trỏ tới "${gid}" không tồn tại.`));
      grammarQuestionCount.set(gid, (grammarQuestionCount.get(gid) ?? 0) + 1);
      if (q.type === 'CLOZE_MC') grammarClozeCount.set(gid, (grammarClozeCount.get(gid) ?? 0) + 1);
    }

    if (q.type === 'TRAP_ID' && !q.trap) {
      issues.push(fail('V_TRAPID', q.id, 'Câu TRAP_ID bắt buộc phải có trap.'));
    }
    if (q.type === 'SENTENCE_BUILD') {
      if (!q.fragments || q.fragments.length < 3) issues.push(fail('V_BUILD', q.id, 'SENTENCE_BUILD cần ≥ 3 mảnh ghép.'));
      if (!q.starFragmentId) issues.push(fail('V_BUILD', q.id, 'SENTENCE_BUILD thiếu starFragmentId.'));
      if (q.starSlotIndex === undefined) issues.push(fail('V_BUILD', q.id, 'SENTENCE_BUILD thiếu starSlotIndex.'));
    }

    const expected = targetRt(q.type, 'PHASE_2_COMPARE');
    if (q.targetTimeMs > expected * 1.5 || q.targetTimeMs < expected * 0.5) {
      issues.push(warn('V14', q.id, `targetTimeMs ${q.targetTimeMs}ms lệch > 50% so với mốc ${expected}ms của loại ${q.type}.`));
    }

    if (!sourceIds.has(q.sourceId) || untrustedSources.has(q.sourceId)) {
      if (q.verificationStatus === 'VERIFIED') {
        issues.push(warn('V10', q.id, 'Nguồn không đủ tin cậy — bị ép về NEEDS_REVIEW.'));
        forcedNeedsReview.push(q.id);
      }
    }
  }

  /* ── Relations ── */
  for (const r of input.relations) {
    if (!grammarIds.has(r.from)) issues.push(fail('V5', `${r.from}->${r.to}`, `Quan hệ trỏ tới "${r.from}" không tồn tại.`));
    if (!grammarIds.has(r.to)) issues.push(fail('V5', `${r.from}->${r.to}`, `Quan hệ trỏ tới "${r.to}" không tồn tại.`));
    if (r.type === 'oftenConfusedWith' && r.source === 'CURATED' && !r.noteVi) {
      issues.push(warn('G5', `${r.from}->${r.to}`, 'Cạnh oftenConfusedWith CURATED nên có noteVi nói nhầm ở điểm nào.'));
    }
    if (r.source === 'LEARNED') {
      issues.push(fail('G1', `${r.from}->${r.to}`, 'relations.json chỉ được chứa cạnh CURATED.'));
    }
  }

  const cycle = hasPrerequisiteCycle(input.relations);
  if (cycle) issues.push(fail('V6', cycle.join('→'), 'Cạnh prerequisite tạo thành chu trình.'));

  /* ── ComparisonSet ── */
  const edgeSet = new Set<string>();
  for (const r of input.relations) {
    edgeSet.add(`${r.from}|${r.to}`);
    edgeSet.add(`${r.to}|${r.from}`);
  }

  for (const s of input.comparisonSets) {
    for (const gid of s.grammarIds) {
      if (!grammarIds.has(gid)) issues.push(fail('V5', s.id, `ComparisonSet trỏ tới grammar "${gid}" không tồn tại.`));
    }
    for (let i = 0; i < s.grammarIds.length; i++) {
      for (let j = i + 1; j < s.grammarIds.length; j++) {
        if (!edgeSet.has(`${s.grammarIds[i]}|${s.grammarIds[j]}`)) {
          issues.push(fail('V7', s.id, `Cặp ${s.grammarIds[i]} / ${s.grammarIds[j]} không có cạnh trong graph.`));
        }
      }
    }
    for (const row of s.rows) {
      for (const gid of s.grammarIds) {
        if (!row.cells[gid]?.trim()) {
          issues.push(fail('V8', s.id, `Trục ${row.axis} thiếu ô cho "${gid}".`));
        }
      }
    }
    if (s.rows.length < 3) issues.push(fail('C2', s.id, 'ComparisonSet cần ≥ 3 trục.'));
    if (s.decisiveDifferenceVi.length > 120) issues.push(fail('C4', s.id, 'decisiveDifferenceVi vượt 120 ký tự.'));
    for (const qid of [...(s.minimalPairQuestionIds ?? []), ...(s.whyNotQuestionIds ?? [])]) {
      if (!questionIds.has(qid)) issues.push(fail('V5', s.id, `Trỏ tới câu hỏi "${qid}" không tồn tại.`));
    }
    if (!s.openerQuestionId) {
      issues.push(warn('C5', s.id, 'Thiếu câu mở màn — bảng so sánh không được hiện trước khi người học thử phân biệt.'));
    }
  }

  /* ── Cảnh báo dữ liệu luyện tập ── */
  for (const g of input.grammar) {
    const count = grammarQuestionCount.get(g.id) ?? 0;
    if (count <= 1) issues.push(warn('V11', g.id, `Chỉ có ${count} câu hỏi — chưa đủ để luyện tập.`));
    if (g.examFrequency === 'HIGH' && (grammarClozeCount.get(g.id) ?? 0) === 0) {
      issues.push(warn('V12', g.id, 'Mẫu tần suất HIGH nhưng chưa có câu CLOZE_MC (問題5).'));
    }
    const confused = input.relations.filter((r) => r.from === g.id && r.type === 'oftenConfusedWith');
    const inSet = input.comparisonSets.some((s) => s.grammarIds.includes(g.id));
    if (confused.length > 0 && !inSet) {
      issues.push(warn('V13', g.id, 'Có cạnh oftenConfusedWith nhưng chưa nằm trong ComparisonSet nào.'));
    }
  }

  const fails = issues.filter((i) => i.level === 'FAIL');
  const warns = issues.filter((i) => i.level === 'WARN');
  return { ok: fails.length === 0, issues, fails, warns, forcedNeedsReview };
}
