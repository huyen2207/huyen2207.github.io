import type {
  ComparisonAxis,
  ExamFrequency,
  GrammarFamily,
  RelationType,
  Register,
  RestrictionKind,
  SourceKind,
  TrapType,
  TrustLevel,
  VerificationStatus,
  QuestionType,
} from './enums';

export interface ConnectionRule {
  pos: string;
  form: string;
  note?: string;
}

export interface Restriction {
  kind: RestrictionKind;
  ruleVi: string;
  counterExample?: string;
}

export interface Collocation {
  chunkJa: string;
  glossVi: string;
  strength: 'FIXED' | 'STRONG' | 'COMMON';
}

export interface WhyNot {
  grammarId: string;
  reasonVi: string;
  axis: ComparisonAxis;
}

export interface Example {
  ja: string;
  vi: string;
  highlight?: [number, number];
  register?: Register;
  targetGrammarId?: string;
  contextVi?: string;
  whyNaturalVi?: string;
  whyNotOthers?: WhyNot[];
  sourceReference?: string;
}

/** Hình dạng nằm trong JSON. KHÔNG chứa quan hệ (quan hệ sống ở relations.json — CLAUDE.md §6). */
export interface Grammar {
  id: string;
  pattern: string;
  reading?: string;
  aliases: string[];

  meaningVi: string;
  meaningsVi?: string[];
  coreImage: string;
  nuanceVi?: string;

  structure: ConnectionRule[];
  usage: string[];
  restrictions: Restriction[];
  register: Register;
  typicalContexts?: string[];
  collocations?: Collocation[];

  examples: Example[];
  commonMistakes: string[];
  keyClues: string[];
  families: GrammarFamily[];
  examFrequency: ExamFrequency;
  difficulty: 1 | 2 | 3;

  sourceId: string;
  sourcePage?: string;
  sourceSection?: string;
  sourceReference?: string;
  verificationStatus: VerificationStatus;
  conflictNote?: string;
}

/** Thứ UI nhận. Các trường DERIVED được repository tính khi đọc — CẤM lưu xuống JSON. */
export interface GrammarView extends Grammar {
  searchKey: string;
  similarGrammarIds: string[];
  contrastGrammarIds: string[];
  curatedConfusedIds: string[];
  prerequisiteIds: string[];
  registerVariantIds: string[];
  trapProneTypes: TrapType[];
  questionCountByType: Partial<Record<QuestionType, number>>;
}

export interface GrammarRelation {
  from: string;
  to: string;
  type: RelationType;
  differenceKey?: string;
  noteVi?: string;
  source: 'CURATED' | 'LEARNED';
  strength?: number;
}

export interface ComparisonRow {
  axis: ComparisonAxis;
  cells: Record<string, string>;
}

export interface ComparisonSet {
  id: string;
  grammarIds: string[];
  familyHint: GrammarFamily;
  rows: ComparisonRow[];
  decisiveDifferenceVi: string;
  sourceId: string;
  verificationStatus: VerificationStatus;
  minimalPairQuestionIds?: string[];
  whyNotQuestionIds?: string[];
  examPatternVi?: string;
  openerQuestionId?: string;
}

export interface Source {
  id: string;
  titleJa: string;
  publisher?: string;
  year?: number;
  kind: SourceKind;
  trustLevel: TrustLevel;
}
