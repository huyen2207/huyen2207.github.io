import { describe, expect, it } from 'vitest';
import { validateContent, hasPrerequisiteCycle } from '../validator';
import {
  allRelations,
  contentStats,
  listComparisonSets,
  listRawGrammar,
  listQuestions,
  listSources,
  getGrammarView,
} from '../repository';
import type { GrammarRelation } from '@/domain/grammar';
import grammarSeedRaw from '../data/grammar/n1-seed.json';

function seedInput() {
  return {
    grammar: listRawGrammar(),
    questions: listQuestions(),
    relations: allRelations(),
    comparisonSets: listComparisonSets(),
    sources: listSources(),
  };
}

describe('content validator — seed data', () => {
  it('seed không có lỗi FAIL nào', () => {
    const report = validateContent(seedInput());
    if (!report.ok) console.error(report.fails);
    expect(report.fails).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('mọi WARN đều được liệt kê rõ', () => {
    const report = validateContent(seedInput());
    for (const w of report.warns) {
      expect(w.messageVi.length).toBeGreaterThan(5);
      expect(w.entityId).toBeTruthy();
    }
  });

  it('V2: distractor thiếu whyWrongVi → FAIL', () => {
    const input = seedInput();
    const q = structuredClone(input.questions[0]);
    const wrong = q.choices.find((c) => !c.isCorrect)!;
    delete wrong.whyWrongVi;
    const report = validateContent({ ...input, questions: [q] });
    expect(report.fails.some((f) => f.rule === 'V2')).toBe(true);
  });

  it('V7: ComparisonSet ghép hai grammar không có cạnh → FAIL', () => {
    const input = seedInput();
    const set = structuredClone(input.comparisonSets[0]);
    set.grammarIds = ['ni-itatte', 'kirai-ga-aru'];
    set.rows = set.rows.map((r) => ({ ...r, cells: { 'ni-itatte': 'x', 'kirai-ga-aru': 'y' } }));
    const report = validateContent({ ...input, comparisonSets: [set] });
    expect(report.fails.some((f) => f.rule === 'V7')).toBe(true);
  });

  it('V6: prerequisite tạo chu trình A→B→A → FAIL', () => {
    const cyclic: GrammarRelation[] = [
      { from: 'a', to: 'b', type: 'prerequisite', source: 'CURATED' },
      { from: 'b', to: 'a', type: 'prerequisite', source: 'CURATED' },
    ];
    expect(hasPrerequisiteCycle(cyclic)).not.toBeNull();
  });

  it('V9: hai đáp án đúng → FAIL', () => {
    const input = seedInput();
    const q = structuredClone(input.questions[0]);
    q.choices[1].isCorrect = true;
    const report = validateContent({ ...input, questions: [q] });
    expect(report.fails.some((f) => f.rule === 'V9')).toBe(true);
  });

  it('V15: highlight ngoài phạm vi → FAIL', () => {
    const input = seedInput();
    const g = structuredClone(input.grammar[0]);
    g.examples[0].highlight = [0, 9999];
    const report = validateContent({ ...input, grammar: [g] });
    expect(report.fails.some((f) => f.rule === 'V15')).toBe(true);
  });

  it('V10: nội dung khai VERIFIED trên nguồn AI_GENERATED bị ép NEEDS_REVIEW', () => {
    const input = seedInput();
    const g = structuredClone(input.grammar[0]);
    g.verificationStatus = 'VERIFIED';
    const report = validateContent({ ...input, grammar: [g] });
    expect(report.forcedNeedsReview).toContain(g.id);
  });
});

describe('content repository — trường DERIVED', () => {
  it('không trường DERIVED nào bị lưu trong JSON', () => {
    const raw = grammarSeedRaw as unknown as Array<Record<string, unknown>>;
    for (const g of raw) {
      for (const key of ['searchKey', 'similarGrammarIds', 'contrastGrammarIds', 'trapProneTypes', 'questionCountByType']) {
        expect(key in g).toBe(false);
      }
    }
  });

  it('getGrammarView tính được quan hệ và trapProneTypes', () => {
    const v = getGrammarView('ni-itatte')!;
    expect(v.curatedConfusedIds).toContain('ni-itatte-wa');
    expect(v.searchKey.length).toBeGreaterThan(0);
    expect(v.trapProneTypes.length).toBeGreaterThan(0);
    expect((v.questionCountByType.CLOZE_MC ?? 0)).toBeGreaterThan(0);
  });

  it('cạnh đối xứng được sinh chiều ngược', () => {
    const v = getGrammarView('ni-itatte-wa')!;
    expect(v.curatedConfusedIds).toContain('ni-itatte');
  });

  it('kho nội dung đủ quy mô để chạy', () => {
    const s = contentStats();
    expect(s.grammar).toBeGreaterThanOrEqual(50);
    expect(s.questions).toBeGreaterThanOrEqual(200);
    expect(s.comparisonSets).toBeGreaterThanOrEqual(88);
    // Nội dung do AI sinh vẫn phải NEEDS_REVIEW; chỉ nội dung trích sách mới VERIFIED.
    expect(s.verifiedGrammar).toBe(182);
  });
});
