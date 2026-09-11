import type {
  Confidence,
  DrillKind,
  ErrorType,
  EvidenceLevel,
  GrammarFamily,
  Phase,
  QuestionType,
  ReadinessBand,
  SkillDimension,
  StudyMode,
  TrapType,
} from './enums';

export interface ConfusionPair {
  from: string;
  to: string;
  count: number;
  weighted: number;
  lastAt: string;
}

export interface FamilyScore {
  family: GrammarFamily;
  accuracy: number;
  n: number;
  evidence: EvidenceLevel;
}

export interface SlowType {
  type: QuestionType;
  medianMs: number;
  targetMs: number;
  ratio: number;
}

export interface ErrorRecord {
  errorId: string;
  groupKey: string;
  attemptIds: string[];
  questionIds: string[];
  grammarIds: string[];
  selectedChoice: string;
  correctChoice: string;
  errorType: ErrorType;
  confusedWithGrammarId: string | null;
  confidence: Confidence;
  responseTimeMs: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  recurrenceCount: number;
  resolved: boolean;
  relapsed: boolean;
  pinned: boolean;
}

export interface WeaknessProfile {
  errorTypeDistribution: Partial<Record<ErrorType, number>>;
  topConfusionPairs: ConfusionPair[];
  weakFamilies: FamilyScore[];
  slowQuestionTypes: SlowType[];
  guessRate: number;
  accuracyByPhaseSkill: Record<SkillDimension, number | null>;
  reviewDebt: number;

  misconceptionItems: string[];
  relapseItems: string[];
  trapDistribution: Partial<Record<TrapType, number>>;
  calibration: number | null;
  bottleneckDimension: SkillDimension | null;
  errorGrammarIds: string[];
  windowDays: number;
  computedAt: string;
  totalAttempts: number;
  daysSinceLastSession: number;
}

export interface ConfusionMatrix {
  cells: ConfusionPair[];
  byGrammar: Record<string, { outgoing: ConfusionPair[]; incoming: ConfusionPair[] }>;
  symmetricPairs: Array<{ a: string; b: string; total: number }>;
  computedAt: string;
}

export interface DrillSpec {
  kind: DrillKind;
  payload: Record<string, unknown>;
}

export interface NotebookLineVi {
  id: string;
  kind: 'CONFUSION' | 'ERROR_TYPE' | 'NUANCE' | 'SPEED' | 'MISCONCEPTION' | 'RELAPSE' | 'RESOLVED';
  severity: 1 | 2 | 3;
  messageKey: string;
  params: Record<string, string | number>;
  drill: DrillSpec | null;
  pinned: boolean;
  weighted: number;
}

export interface ReadinessComponents {
  coverage: number | null;
  retention: number | null;
  comparisonAccuracy: number | null;
  trapDetection: number | null;
  timedAccuracy: number | null;
  speedIndex: number | null;
}

export interface ReadinessSnapshot {
  id: string;
  date: string;
  ers: number | null;
  band: ReadinessBand | null;
  components: ReadinessComponents;
  stabilityFactor: number;
  weakestComponent: keyof ReadinessComponents | null;
  evidence: EvidenceLevel;
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface CoverageAudit {
  ok: boolean;
  atRisk: string[];
  requiredSlots: number;
  availableSlots: number;
  messageKey: string;
  params: Record<string, string | number>;
}

export interface MetricCard {
  metricKey: string;
  value: number | null;
  evidence: EvidenceLevel;
  trend: 'UP' | 'DOWN' | 'FLAT' | 'NEW';
  action: { labelKey: string; drill: DrillSpec } | null;
}

export interface DashboardMetrics {
  daysRemaining: number;
  currentPhase: Phase;
  mode: StudyMode;
  coverage: number;
  recognitionAccuracy: number | null;
  comparisonAccuracy: number | null;
  trapAccuracy: number | null;
  averageResponseTimeMs: Partial<Record<QuestionType, number>>;
  reviewBacklog: number;
  weakestFamilies: FamilyScore[];
  strongestFamilies: FamilyScore[];
  readiness: ReadinessSnapshot | null;

  timedAccuracy: number | null;
  retention: number | null;
  speedTrend: TrendPoint[];
  accuracyByQuestionType: Partial<Record<QuestionType, number>>;
  calibration: number | null;
  recurringErrorCount: number;
  contentGaps: string[];
  coverageAudit: CoverageAudit;
  masteryCounts: Record<string, number>;
  skillScores: Record<SkillDimension, number | null>;
  skillEvidence: Record<SkillDimension, EvidenceLevel>;
}

export interface PlanChange {
  key: string;
  params: Record<string, string | number>;
}

export interface WeeklyCheckpoint {
  id: string;
  weekIndex: number;
  createdAt: string;
  grammarLearned: string[];
  grammarWeak: string[];
  confusionPairs: ConfusionPair[];
  errorDistribution: Partial<Record<ErrorType, number>>;
  accuracy: number;
  medianRtByType: Partial<Record<QuestionType, number>>;
  reviewDebt: number;
  deltaVsPrev: {
    accuracy: number;
    speed: number;
    coverage: number;
    confusionCount: number;
  } | null;
  planChanges: PlanChange[];
  coverage: number;
  biggestImprovementKey: string | null;
  biggestWeaknessKey: string | null;
}

export interface PhaseTransitionSummary {
  fromPhase: Phase;
  toPhase: Phase;
  knownCount: number;
  shakyCount: number;
  needsReviewCount: number;
  confusionMap: Array<{ a: string; b: string; total: number }>;
}

export interface Recommendation {
  id: string;
  priority: 1 | 2 | 3;
  targetKey: string;
  targetParams: { grammarIds?: string[]; pair?: [string, string]; type?: QuestionType };
  reasonKey: string;
  reasonParams: Record<string, string | number>;
  drill: DrillSpec;
  estimatedMinutes: number;
}
