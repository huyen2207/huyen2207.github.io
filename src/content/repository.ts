import type {
  ComparisonSet,
  Grammar,
  GrammarRelation,
  GrammarView,
  Source,
} from '@/domain/grammar';
import type { Question } from '@/domain/question';
import type {
  ExamFrequency,
  GrammarFamily,
  Phase,
  QuestionType,
  RelationType,
  TrapType,
  VerificationStatus,
} from '@/domain/enums';
import { SYMMETRIC_RELATION_TYPES } from '@/domain/enums';
import { normalizeForSearch } from './normalize';

import grammarSeed from './data/grammar/n1-seed.json';
import grammarLo1A from './data/grammar/lo1-a.json';
import grammarLo1B from './data/grammar/lo1-b.json';
import grammarLo2A from './data/grammar/lo2-a.json';
import grammarLo2B from './data/grammar/lo2-b.json';
import grammarLo3A from './data/grammar/lo3-a.json';
import grammarLo3B from './data/grammar/lo3-b.json';
import grammarLo3C from './data/grammar/lo3-c.json';
import grammarLo3bA from './data/grammar/lo3b-a.json';
import grammarLo3bB from './data/grammar/lo3b-b.json';
import grammarLo3bC from './data/grammar/lo3b-c.json';
import grammarLo3bD from './data/grammar/lo3b-d.json';
import relationSeed from './data/relations.json';
import relationLo1 from './data/relations-lo1.json';
import relationLo2 from './data/relations-lo2.json';
import relationLo3 from './data/relations-lo3.json';
import relationLo3b from './data/relations-lo3b.json';
import relationP3 from './data/relations-p3.json';
import comparisonSeed from './data/comparison-sets.json';
import comparisonLo1 from './data/comparison-sets-lo1.json';
import comparisonLo2 from './data/comparison-sets-lo2.json';
import comparisonLo3 from './data/comparison-sets-lo3.json';
import comparisonLo3b from './data/comparison-sets-lo3b.json';
import comparisonP3 from './data/comparison-sets-p3.json';
import sourceSeed from './data/sources.json';
import passageSeed from './data/passages.json';
import recallQuestions from './data/questions/recall.json';
import recallExtraQuestions from './data/questions/recall-extra.json';
import compareQuestions from './data/questions/compare.json';
import applyQuestions from './data/questions/apply.json';
import applyExtraQuestions from './data/questions/apply-extra.json';
import lo1MeaningA from './data/questions/lo1-meaning-a.json';
import lo1MeaningB from './data/questions/lo1-meaning-b.json';
import lo1FormA from './data/questions/lo1-form-a.json';
import lo1FormB from './data/questions/lo1-form-b.json';
import lo1MinimalPair from './data/questions/lo1-minimalpair.json';
import lo1Cloze from './data/questions/lo1-cloze.json';
import lo2MeaningA from './data/questions/lo2-meaning-a.json';
import lo2MeaningB from './data/questions/lo2-meaning-b.json';
import lo2FormA from './data/questions/lo2-form-a.json';
import lo2FormB from './data/questions/lo2-form-b.json';
import lo2MinimalPair from './data/questions/lo2-minimalpair.json';
import lo2Cloze from './data/questions/lo2-cloze.json';
import lo3MeaningA from './data/questions/lo3-meaning-a.json';
import lo3MeaningB from './data/questions/lo3-meaning-b.json';
import lo3MeaningC from './data/questions/lo3-meaning-c.json';
import lo3FormA from './data/questions/lo3-form-a.json';
import lo3FormB from './data/questions/lo3-form-b.json';
import lo3FormC from './data/questions/lo3-form-c.json';
import lo3MinimalPairA from './data/questions/lo3-minimalpair-a.json';
import lo3MinimalPairB from './data/questions/lo3-minimalpair-b.json';
import lo3ClozeA from './data/questions/lo3-cloze-a.json';
import lo3ClozeB from './data/questions/lo3-cloze-b.json';
import lo3ClozeC from './data/questions/lo3-cloze-c.json';
import lo3bMeaningA from './data/questions/lo3b-meaning-a.json';
import lo3bMeaningB from './data/questions/lo3b-meaning-b.json';
import lo3bMeaningC from './data/questions/lo3b-meaning-c.json';
import lo3bMeaningD from './data/questions/lo3b-meaning-d.json';
import lo3bFormA from './data/questions/lo3b-form-a.json';
import lo3bFormB from './data/questions/lo3b-form-b.json';
import lo3bFormC from './data/questions/lo3b-form-c.json';
import lo3bFormD from './data/questions/lo3b-form-d.json';
import lo3bMinimalPairA from './data/questions/lo3b-minimalpair-a.json';
import lo3bMinimalPairB from './data/questions/lo3b-minimalpair-b.json';
import lo3bMinimalPairC from './data/questions/lo3b-minimalpair-c.json';
import p1ClozeA from './data/questions/p1-cloze-a.json';
import p1ClozeB from './data/questions/p1-cloze-b.json';
import p1ClozeC from './data/questions/p1-cloze-c.json';
import p1ClozeD from './data/questions/p1-cloze-d.json';
import p1ClozeE from './data/questions/p1-cloze-e.json';
import p1ClozeF from './data/questions/p1-cloze-f.json';
import p2Build from './data/questions/p2-build.json';
import p2Text from './data/questions/p2-text.json';
import p3MinimalPair from './data/questions/p3-minimalpair.json';
import p4ValidA from './data/questions/p4-valid-a.json';
import p4ValidB from './data/questions/p4-valid-b.json';
import p4ValidC from './data/questions/p4-valid-c.json';
import p4ValidD from './data/questions/p4-valid-d.json';
import p4ValidE from './data/questions/p4-valid-e.json';
import p4ValidF from './data/questions/p4-valid-f.json';

export interface Passage {
  id: string;
  textJa: string;
  sourceId: string;
}

export interface GrammarFilter {
  families?: GrammarFamily[];
  examFrequencies?: ExamFrequency[];
  verificationStatuses?: VerificationStatus[];
  search?: string;
  ids?: string[];
}

export interface QuestionFilter {
  grammarIds?: string[];
  types?: QuestionType[];
  phase?: Phase;
  excludeIds?: string[];
  comparisonSetId?: string;
  hasTrap?: boolean;
  trapTypes?: TrapType[];
  examFrequencies?: ExamFrequency[];
}

interface ContentIndex {
  grammar: Map<string, Grammar>;
  grammarView: Map<string, GrammarView>;
  questions: Map<string, Question>;
  questionsByGrammar: Map<string, Question[]>;
  relationsFrom: Map<string, GrammarRelation[]>;
  comparisonSets: Map<string, ComparisonSet>;
  setsByGrammar: Map<string, ComparisonSet[]>;
  sources: Map<string, Source>;
  passages: Map<string, Passage>;
}

/** Content override do người học import (arch §6.4). Tiêm từ tầng app — content KHÔNG đọc storage. */
export interface ContentOverrides {
  grammar?: Grammar[];
  questions?: Question[];
}

let overrides: ContentOverrides = {};
let cache: ContentIndex | null = null;

export function registerOverrides(next: ContentOverrides): void {
  overrides = next;
  cache = null;
}

function baseGrammar(): Grammar[] {
  const map = new Map<string, Grammar>();
  const base = [
    ...(grammarSeed as unknown as Grammar[]),
    ...(grammarLo1A as unknown as Grammar[]),
    ...(grammarLo1B as unknown as Grammar[]),
    ...(grammarLo2A as unknown as Grammar[]),
    ...(grammarLo2B as unknown as Grammar[]),
    ...(grammarLo3A as unknown as Grammar[]),
    ...(grammarLo3B as unknown as Grammar[]),
    ...(grammarLo3C as unknown as Grammar[]),
    ...(grammarLo3bA as unknown as Grammar[]),
    ...(grammarLo3bB as unknown as Grammar[]),
    ...(grammarLo3bC as unknown as Grammar[]),
    ...(grammarLo3bD as unknown as Grammar[]),
  ];
  for (const g of base) map.set(g.id, g);
  for (const g of overrides.grammar ?? []) map.set(g.id, g);
  return [...map.values()];
}

function baseQuestions(): Question[] {
  const map = new Map<string, Question>();
  const all = [
    ...(recallQuestions as unknown as Question[]),
    ...(recallExtraQuestions as unknown as Question[]),
    ...(compareQuestions as unknown as Question[]),
    ...(applyQuestions as unknown as Question[]),
    ...(applyExtraQuestions as unknown as Question[]),
    ...(lo1MeaningA as unknown as Question[]),
    ...(lo1MeaningB as unknown as Question[]),
    ...(lo1FormA as unknown as Question[]),
    ...(lo1FormB as unknown as Question[]),
    ...(lo1MinimalPair as unknown as Question[]),
    ...(lo1Cloze as unknown as Question[]),
    ...(lo2MeaningA as unknown as Question[]),
    ...(lo2MeaningB as unknown as Question[]),
    ...(lo2FormA as unknown as Question[]),
    ...(lo2FormB as unknown as Question[]),
    ...(lo2MinimalPair as unknown as Question[]),
    ...(lo2Cloze as unknown as Question[]),
    ...(lo3MeaningA as unknown as Question[]),
    ...(lo3MeaningB as unknown as Question[]),
    ...(lo3MeaningC as unknown as Question[]),
    ...(lo3FormA as unknown as Question[]),
    ...(lo3FormB as unknown as Question[]),
    ...(lo3FormC as unknown as Question[]),
    ...(lo3MinimalPairA as unknown as Question[]),
    ...(lo3MinimalPairB as unknown as Question[]),
    ...(lo3ClozeA as unknown as Question[]),
    ...(lo3ClozeB as unknown as Question[]),
    ...(lo3ClozeC as unknown as Question[]),
    ...(lo3bMeaningA as unknown as Question[]),
    ...(lo3bMeaningB as unknown as Question[]),
    ...(lo3bMeaningC as unknown as Question[]),
    ...(lo3bMeaningD as unknown as Question[]),
    ...(lo3bFormA as unknown as Question[]),
    ...(lo3bFormB as unknown as Question[]),
    ...(lo3bFormC as unknown as Question[]),
    ...(lo3bFormD as unknown as Question[]),
    ...(lo3bMinimalPairA as unknown as Question[]),
    ...(lo3bMinimalPairB as unknown as Question[]),
    ...(lo3bMinimalPairC as unknown as Question[]),
    ...(p1ClozeA as unknown as Question[]),
    ...(p1ClozeB as unknown as Question[]),
    ...(p1ClozeC as unknown as Question[]),
    ...(p1ClozeD as unknown as Question[]),
    ...(p1ClozeE as unknown as Question[]),
    ...(p1ClozeF as unknown as Question[]),
    ...(p2Build as unknown as Question[]),
    ...(p2Text as unknown as Question[]),
    ...(p3MinimalPair as unknown as Question[]),
    ...(p4ValidA as unknown as Question[]),
    ...(p4ValidB as unknown as Question[]),
    ...(p4ValidC as unknown as Question[]),
    ...(p4ValidD as unknown as Question[]),
    ...(p4ValidE as unknown as Question[]),
    ...(p4ValidF as unknown as Question[]),
  ];
  for (const q of all) map.set(q.id, q);
  for (const q of overrides.questions ?? []) map.set(q.id, q);
  return [...map.values()];
}

/** Cạnh đối xứng khai một chiều, repository tự sinh chiều ngược (grammar-schema G2). */
export function expandRelations(input: GrammarRelation[]): GrammarRelation[] {
  const seen = new Set<string>();
  const out: GrammarRelation[] = [];
  const push = (r: GrammarRelation) => {
    const key = `${r.from}|${r.to}|${r.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };
  for (const r of input) {
    push(r);
    if (SYMMETRIC_RELATION_TYPES.includes(r.type)) {
      push({ ...r, from: r.to, to: r.from });
    }
  }
  return out;
}

function buildIndex(): ContentIndex {
  const grammarList = baseGrammar();
  const questionList = baseQuestions();
  const relations = expandRelations([
    ...(relationSeed as unknown as GrammarRelation[]),
    ...(relationLo1 as unknown as GrammarRelation[]),
    ...(relationLo2 as unknown as GrammarRelation[]),
    ...(relationLo3 as unknown as GrammarRelation[]),
    ...(relationLo3b as unknown as GrammarRelation[]),
    ...(relationP3 as unknown as GrammarRelation[]),
  ]);
  const sets = [
    ...(comparisonSeed as unknown as ComparisonSet[]),
    ...(comparisonLo1 as unknown as ComparisonSet[]),
    ...(comparisonLo2 as unknown as ComparisonSet[]),
    ...(comparisonLo3 as unknown as ComparisonSet[]),
    ...(comparisonLo3b as unknown as ComparisonSet[]),
    ...(comparisonP3 as unknown as ComparisonSet[]),
  ];
  const sources = sourceSeed as unknown as Source[];
  const passages = passageSeed as unknown as Passage[];

  const relationsFrom = new Map<string, GrammarRelation[]>();
  for (const r of relations) {
    const list = relationsFrom.get(r.from) ?? [];
    list.push(r);
    relationsFrom.set(r.from, list);
  }

  const questionsByGrammar = new Map<string, Question[]>();
  const passageMap = new Map(passages.map((p) => [p.id, p]));
  const questions = new Map<string, Question>();
  for (const raw of questionList) {
    const q: Question =
      raw.passageId && !raw.contextJa
        ? { ...raw, contextJa: passageMap.get(raw.passageId)?.textJa }
        : raw;
    questions.set(q.id, q);
    for (const gid of q.targetGrammarIds) {
      const list = questionsByGrammar.get(gid) ?? [];
      list.push(q);
      questionsByGrammar.set(gid, list);
    }
  }

  const setsByGrammar = new Map<string, ComparisonSet[]>();
  for (const s of sets) {
    for (const gid of s.grammarIds) {
      const list = setsByGrammar.get(gid) ?? [];
      list.push(s);
      setsByGrammar.set(gid, list);
    }
  }

  const grammar = new Map(grammarList.map((g) => [g.id, g]));
  const grammarView = new Map<string, GrammarView>();
  for (const g of grammarList) {
    const edges = relationsFrom.get(g.id) ?? [];
    const byType = (t: RelationType) => edges.filter((e) => e.type === t).map((e) => e.to);
    const qs = questionsByGrammar.get(g.id) ?? [];
    const questionCountByType: Partial<Record<QuestionType, number>> = {};
    const trapProneTypes = new Set<TrapType>();
    for (const q of qs) {
      questionCountByType[q.type] = (questionCountByType[q.type] ?? 0) + 1;
      if (q.trap) trapProneTypes.add(q.trap.trapType);
    }
    grammarView.set(g.id, {
      ...g,
      searchKey: normalizeForSearch(
        [g.pattern, g.reading ?? '', ...g.aliases, g.meaningVi].join(' '),
      ),
      similarGrammarIds: byType('similarTo'),
      contrastGrammarIds: byType('contrastsWith'),
      curatedConfusedIds: edges.filter((e) => e.type === 'oftenConfusedWith' && e.source === 'CURATED').map((e) => e.to),
      prerequisiteIds: byType('prerequisite'),
      registerVariantIds: byType('registerVariantOf'),
      trapProneTypes: [...trapProneTypes],
      questionCountByType,
    });
  }

  return {
    grammar,
    grammarView,
    questions,
    questionsByGrammar,
    relationsFrom,
    comparisonSets: new Map(sets.map((s) => [s.id, s])),
    setsByGrammar,
    sources: new Map(sources.map((s) => [s.id, s])),
    passages: passageMap,
  };
}

function index(): ContentIndex {
  if (!cache) cache = buildIndex();
  return cache;
}

/* ─────────────── Public API (arch §6.2) ─────────────── */

export function getGrammar(id: string): Grammar | undefined {
  return index().grammar.get(id);
}

export function getGrammarView(id: string): GrammarView | undefined {
  return index().grammarView.get(id);
}

/** Grammar THÔ đúng như trong JSON — dùng cho validator (không kèm trường DERIVED). */
export function listRawGrammar(): Grammar[] {
  return [...index().grammar.values()];
}

export function listGrammar(filter: GrammarFilter = {}): GrammarView[] {
  let out = [...index().grammarView.values()];
  if (filter.ids) {
    const set = new Set(filter.ids);
    out = out.filter((g) => set.has(g.id));
  }
  if (filter.families?.length) {
    out = out.filter((g) => g.families.some((f) => filter.families!.includes(f)));
  }
  if (filter.examFrequencies?.length) {
    out = out.filter((g) => filter.examFrequencies!.includes(g.examFrequency));
  }
  if (filter.verificationStatuses?.length) {
    out = out.filter((g) => filter.verificationStatuses!.includes(g.verificationStatus));
  }
  if (filter.search?.trim()) {
    const key = normalizeForSearch(filter.search);
    out = out.filter((g) => g.searchKey.includes(key) || g.meaningVi.toLowerCase().includes(filter.search!.toLowerCase()));
  }
  return out;
}

export function getFamily(family: GrammarFamily): GrammarView[] {
  return listGrammar({ families: [family] });
}

export function getRelations(grammarId: string, types?: RelationType[]): GrammarRelation[] {
  const edges = index().relationsFrom.get(grammarId) ?? [];
  return types?.length ? edges.filter((e) => types.includes(e.type)) : edges;
}

export function hasEdge(a: string, b: string, types?: RelationType[]): boolean {
  return getRelations(a, types).some((e) => e.to === b);
}

export function getComparisonSet(id: string): ComparisonSet | undefined {
  return index().comparisonSets.get(id);
}

export function getComparisonSetsFor(grammarId: string): ComparisonSet[] {
  return index().setsByGrammar.get(grammarId) ?? [];
}

export function listComparisonSets(): ComparisonSet[] {
  return [...index().comparisonSets.values()];
}

export function getQuestion(id: string): Question | undefined {
  return index().questions.get(id);
}

export function listQuestions(): Question[] {
  return [...index().questions.values()];
}

export function getQuestions(filter: QuestionFilter = {}): Question[] {
  let out = listQuestions();
  if (filter.grammarIds?.length) {
    const set = new Set(filter.grammarIds);
    out = out.filter((q) => q.targetGrammarIds.some((g) => set.has(g)));
  }
  if (filter.types?.length) out = out.filter((q) => filter.types!.includes(q.type));
  if (filter.phase) out = out.filter((q) => q.phaseHint.includes(filter.phase!));
  if (filter.comparisonSetId) out = out.filter((q) => q.comparisonSetId === filter.comparisonSetId);
  if (filter.hasTrap !== undefined) out = out.filter((q) => Boolean(q.trap) === filter.hasTrap);
  if (filter.trapTypes?.length) out = out.filter((q) => q.trap && filter.trapTypes!.includes(q.trap.trapType));
  if (filter.excludeIds?.length) {
    const set = new Set(filter.excludeIds);
    out = out.filter((q) => !set.has(q.id));
  }
  if (filter.examFrequencies?.length) {
    out = out.filter((q) =>
      q.targetGrammarIds.some((gid) => {
        const g = getGrammar(gid);
        return g ? filter.examFrequencies!.includes(g.examFrequency) : false;
      }),
    );
  }
  return out;
}

export function getQuestionsForGrammar(grammarId: string): Question[] {
  return index().questionsByGrammar.get(grammarId) ?? [];
}

export function getSource(sourceId: string): Source | undefined {
  return index().sources.get(sourceId);
}

export function listSources(): Source[] {
  return [...index().sources.values()];
}

export function getPassage(id: string): Passage | undefined {
  return index().passages.get(id);
}

export function allRelations(): GrammarRelation[] {
  return [...index().relationsFrom.values()].flat();
}

export function contentStats(): {
  grammar: number;
  questions: number;
  comparisonSets: number;
  verifiedGrammar: number;
  verifiedQuestions: number;
} {
  const g = [...index().grammar.values()];
  const q = listQuestions();
  return {
    grammar: g.length,
    questions: q.length,
    comparisonSets: index().comparisonSets.size,
    verifiedGrammar: g.filter((x) => x.verificationStatus === 'VERIFIED').length,
    verifiedQuestions: q.filter((x) => x.verificationStatus === 'VERIFIED').length,
  };
}

/** Chỉ dùng trong test. */
export function resetContentCache(): void {
  cache = null;
}
