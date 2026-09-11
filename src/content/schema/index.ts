import { z } from 'zod';
import {
  CLUE_KINDS,
  COMPARISON_AXES,
  ERROR_TYPES,
  EXAM_FREQUENCIES,
  GRAMMAR_FAMILIES,
  PHASES,
  QUESTION_TYPES,
  REGISTERS,
  RELATION_TYPES,
  RESTRICTION_KINDS,
  SKILL_DIMENSIONS,
  SOURCE_KINDS,
  TRAP_TYPES,
  TRUST_LEVELS,
  VERIFICATION_STATUSES,
} from '@/domain/enums';

const enumOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

export const zVerificationStatus = enumOf(VERIFICATION_STATUSES as unknown as [string, ...string[]]);
export const zRegister = enumOf(REGISTERS as unknown as [string, ...string[]]);
export const zFamily = enumOf(GRAMMAR_FAMILIES as unknown as [string, ...string[]]);
export const zExamFrequency = enumOf(EXAM_FREQUENCIES as unknown as [string, ...string[]]);
export const zAxis = enumOf(COMPARISON_AXES as unknown as [string, ...string[]]);
export const zTrapType = enumOf(TRAP_TYPES as unknown as [string, ...string[]]);
export const zErrorType = enumOf(ERROR_TYPES as unknown as [string, ...string[]]);
export const zQuestionType = enumOf(QUESTION_TYPES as unknown as [string, ...string[]]);
export const zPhase = enumOf(PHASES as unknown as [string, ...string[]]);
export const zSkill = enumOf(SKILL_DIMENSIONS as unknown as [string, ...string[]]);
export const zClueKind = enumOf(CLUE_KINDS as unknown as [string, ...string[]]);
export const zRelationType = enumOf(RELATION_TYPES as unknown as [string, ...string[]]);

export const zConnectionRule = z.object({
  pos: z.string().min(1),
  form: z.string().min(1),
  note: z.string().optional(),
});

export const zRestriction = z.object({
  kind: enumOf(RESTRICTION_KINDS as unknown as [string, ...string[]]),
  ruleVi: z.string().min(1),
  counterExample: z.string().optional(),
});

export const zCollocation = z.object({
  chunkJa: z.string().min(1),
  glossVi: z.string().min(1),
  strength: z.enum(['FIXED', 'STRONG', 'COMMON']),
});

export const zWhyNot = z.object({
  grammarId: z.string().min(1),
  reasonVi: z.string().min(1),
  axis: zAxis,
});

export const zExample = z.object({
  ja: z.string().min(1),
  vi: z.string().min(1),
  highlight: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).optional(),
  register: zRegister.optional(),
  targetGrammarId: z.string().optional(),
  contextVi: z.string().optional(),
  whyNaturalVi: z.string().optional(),
  whyNotOthers: z.array(zWhyNot).optional(),
  sourceReference: z.string().optional(),
});

/** Trường DERIVED — CẤM xuất hiện trong JSON (grammar-schema §4.1). */
export const FORBIDDEN_GRAMMAR_KEYS = [
  'searchKey',
  'similarGrammarIds',
  'contrastGrammarIds',
  'curatedConfusedIds',
  'confusedGrammarIds',
  'trapProneTypes',
  'trapTags',
  'questionCountByType',
  'displayPattern',
  'examTips',
] as const;

export const zGrammar = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  pattern: z.string().min(1),
  reading: z.string().optional(),
  aliases: z.array(z.string()).default([]),

  meaningVi: z.string().min(1),
  meaningsVi: z.array(z.string()).max(3).optional(),
  coreImage: z.string().min(1),
  nuanceVi: z.string().optional(),

  structure: z.array(zConnectionRule).min(1),
  usage: z.array(z.string()).max(3),
  restrictions: z.array(zRestriction),
  register: zRegister,
  typicalContexts: z.array(z.string()).max(3).optional(),
  collocations: z.array(zCollocation).optional(),

  examples: z.array(zExample).min(2),
  commonMistakes: z.array(z.string()).max(3),
  keyClues: z.array(z.string()),
  families: z.array(zFamily).min(1),
  examFrequency: zExamFrequency,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),

  sourceId: z.string().min(1),
  sourcePage: z.string().optional(),
  sourceSection: z.string().optional(),
  sourceReference: z.string().optional(),
  verificationStatus: zVerificationStatus,
  conflictNote: z.string().optional(),
});

export const zRelation = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: zRelationType,
  differenceKey: z.string().optional(),
  noteVi: z.string().optional(),
  source: z.enum(['CURATED', 'LEARNED']),
  strength: z.number().optional(),
});

export const zComparisonRow = z.object({
  axis: zAxis,
  cells: z.record(z.string(), z.string()),
});

export const zComparisonSet = z.object({
  id: z.string().min(1),
  grammarIds: z.array(z.string()).min(2).max(4),
  familyHint: zFamily,
  rows: z.array(zComparisonRow).min(3),
  decisiveDifferenceVi: z.string().min(1).max(120),
  sourceId: z.string().min(1),
  verificationStatus: zVerificationStatus,
  minimalPairQuestionIds: z.array(z.string()).optional(),
  whyNotQuestionIds: z.array(z.string()).optional(),
  examPatternVi: z.string().optional(),
  openerQuestionId: z.string().optional(),
});

export const zChoice = z.object({
  id: z.string().min(1),
  textJa: z.string().min(1),
  isCorrect: z.boolean(),
  wrongBecause: zErrorType.optional(),
  whyWrongVi: z.string().optional(),
  confusedWithGrammarId: z.string().optional(),
  violatedAxis: zAxis.optional(),
});

export const zTrap = z.object({
  trapType: zTrapType,
  trapExplanationVi: z.string().min(1),
  fastestPathVi: z.string().min(1),
  strength: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

export const zSolvingStep = z.object({
  order: z.number().int().positive(),
  labelJa: z.string().min(1),
  labelVi: z.string().min(1),
});

export const zClue = z.object({
  kind: zClueKind,
  textJa: z.string().optional(),
  span: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).optional(),
  noteVi: z.string().min(1),
});

export const zFragment = z.object({ id: z.string().min(1), textJa: z.string().min(1) });

export const zQuestion = z.object({
  id: z.string().min(1),
  type: zQuestionType,
  phaseHint: z.array(zPhase).min(1),
  targetGrammarIds: z.array(z.string()).min(1),
  stemJa: z.string().min(1),
  contextJa: z.string().optional(),
  choices: z.array(zChoice).min(2),
  correctChoiceId: z.string().min(1),

  explanationVi: z.string().min(1),
  keyClueVi: z.string().min(1),
  solvingStrategy: z.array(zSolvingStep).min(1),
  trap: zTrap.optional(),

  targetTimeMs: z.number().int().positive(),
  sourceId: z.string().min(1),
  sourcePage: z.string().optional(),
  verificationStatus: zVerificationStatus,

  testedSkill: zSkill,
  decisiveClue: zClue.optional(),
  difficultyStatic: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  comparisonSetId: z.string().optional(),
  fragments: z.array(zFragment).optional(),
  starFragmentId: z.string().optional(),
  starSlotIndex: z.number().int().nonnegative().optional(),
  passageId: z.string().optional(),
});

export const zSource = z.object({
  id: z.string().min(1),
  titleJa: z.string().min(1),
  publisher: z.string().optional(),
  year: z.number().int().optional(),
  kind: enumOf(SOURCE_KINDS as unknown as [string, ...string[]]),
  trustLevel: enumOf(TRUST_LEVELS as unknown as [string, ...string[]]),
});

export const zGrammarArray = z.array(zGrammar);
export const zQuestionArray = z.array(zQuestion);
export const zRelationArray = z.array(zRelation);
export const zComparisonSetArray = z.array(zComparisonSet);
export const zSourceArray = z.array(zSource);
