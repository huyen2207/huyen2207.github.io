import type { WeaknessProfile } from '@/domain/analytics';
import type { Timeline } from '@/domain/learner';
import type { GrammarMastery } from '@/domain/mastery';
import type { SessionBlockType } from '@/domain/enums';
import type { BlockRatios } from '@/config/phase.config';
import {
  ADAPTATION_THRESHOLDS,
  BACKLOG_FREEZE_FACTOR,
  MAX_ADAPTATIONS_PER_DAY,
  RECOVERY_GAP_DAYS,
} from '@/config/learning.config';
import { confusionRateOf } from '@/engines/error';

export type BlockKey = Exclude<SessionBlockType, 'SCHEDULE'>;

export interface Adaptation {
  ruleId: string;
  priority: number;
  /** Cộng thêm (tuyệt đối) vào tỉ lệ block, trước khi chuẩn hoá. */
  blockDeltas?: Partial<Record<BlockKey, number>>;
  /** Nhân tỉ lệ block (áp sau deltas). */
  blockMultipliers?: Partial<Record<BlockKey, number>>;
  /** Thay toàn bộ tỉ lệ (chỉ dùng cho recovery). */
  replaceRatios?: BlockRatios;
  messageKey: string;
  params: Record<string, string | number>;
  /** Gợi ý nội dung cần chèn — SessionEngine quyết định cách chèn. */
  focus?:
    | { kind: 'CONFUSION_PAIR'; pairs: Array<[string, string]> }
    | { kind: 'ERROR_TYPE'; errorType: string }
    | { kind: 'SPEED' }
    | { kind: 'PRODUCTION_RECALL' }
    | { kind: 'TEXT_GRAMMAR' }
    | { kind: 'RECOVERY_WIN'; grammarIds: string[] };
  /** Khoá thăng EXAM_READY toàn cục (analytics-engine §4.3). */
  locksExamReady?: boolean;
}

export interface AdaptationInput {
  weakness: WeaknessProfile;
  timeline: Timeline;
  mastery: GrammarMastery[];
  reviewCapacity: number;
  /** accuracy tổng thể 14 ngày, dùng cho luật "chính xác nhưng chậm". */
  overallAccuracy: number | null;
}

/**
 * AdaptationEngine — bảng luật CLAUDE.md §15. Rule-based, MINH BẠCH, giải thích được.
 * Tối đa 3 điều chỉnh/ngày; xung đột thì lấy priority cao hơn.
 */
export function evaluate(input: AdaptationInput): Adaptation[] {
  const { weakness: w, timeline, mastery, reviewCapacity } = input;
  const out: Adaptation[] = [];

  // Bỏ học ≥ 3 ngày → session "quay lại" (ưu tiên cao nhất, thay toàn bộ tỉ lệ).
  if (w.daysSinceLastSession >= RECOVERY_GAP_DAYS && w.totalAttempts >= 0 && mastery.some((m) => m.state !== 'UNSEEN')) {
    const strongest = [...mastery]
      .filter((m) => m.state === 'EXAM_READY' || m.state === 'COMPARABLE' || m.state === 'RECOGNIZED')
      .sort((a, b) => b.correctCount - a.correctCount)
      .slice(0, 3)
      .map((m) => m.grammarId);
    out.push({
      ruleId: 'recovery_return',
      priority: 100,
      replaceRatios: { REVIEW: 0.85, LEARN: 0, RECALL: 0.1, COMPARE: 0, APPLY: 0, ANALYZE_ERROR: 0.05 },
      messageKey: 'adaptation.recovery',
      params: { days: w.daysSinceLastSession },
      focus: { kind: 'RECOVERY_WIN', grammarIds: strongest },
    });
  }

  // Backlog quá tải → đóng băng LEARN.
  if (reviewCapacity > 0 && w.reviewDebt > BACKLOG_FREEZE_FACTOR * reviewCapacity) {
    out.push({
      ruleId: 'backlog_freeze',
      priority: 90,
      blockMultipliers: { LEARN: 0 },
      messageKey: 'adaptation.backlogFreeze',
      params: {
        backlog: w.reviewDebt,
        capacity: reviewCapacity,
        threshold: Math.ceil(BACKLOG_FREEZE_FACTOR * reviewCapacity),
      },
    });
  }

  // Yếu nghĩa → tăng meaning recall, giảm một nửa COMPARE.
  const knowAcc = w.accuracyByPhaseSkill.KNOW;
  if (knowAcc !== null && knowAcc < ADAPTATION_THRESHOLDS.meaningAccuracyLow) {
    out.push({
      ruleId: 'weak_meaning',
      priority: 80,
      blockDeltas: { RECALL: 0.1 },
      blockMultipliers: { COMPARE: 0.5 },
      messageKey: 'adaptation.weakMeaning',
      params: { accuracy: Math.round(knowAcc * 100) },
      focus: { kind: 'PRODUCTION_RECALL' },
    });
  }

  // Hay nhầm mẫu gần nghĩa → compare drill top-3 cặp.
  const confusionRate = confusionRateOf(w);
  if (confusionRate > ADAPTATION_THRESHOLDS.confusionRateHigh && w.topConfusionPairs.length > 0) {
    out.push({
      ruleId: 'high_confusion',
      priority: 75,
      blockDeltas: { COMPARE: 0.1 },
      messageKey: 'adaptation.highConfusion',
      params: { percent: Math.round(confusionRate * 100), pairs: w.topConfusionPairs.length },
      focus: {
        kind: 'CONFUSION_PAIR',
        pairs: w.topConfusionPairs.slice(0, 3).map((p) => [p.from, p.to] as [string, string]),
      },
    });
  }

  // Đoán nhiều → active recall dạng sản sinh + KHOÁ thăng EXAM_READY.
  if (w.guessRate > ADAPTATION_THRESHOLDS.guessRateHigh) {
    out.push({
      ruleId: 'high_guess',
      priority: 70,
      blockDeltas: { RECALL: 0.08 },
      messageKey: 'adaptation.highGuess',
      params: { percent: Math.round(w.guessRate * 100) },
      focus: { kind: 'PRODUCTION_RECALL' },
      locksExamReady: true,
    });
  }

  // Chính xác nhưng chậm → tăng timed recognition.
  const slowest = w.slowQuestionTypes[0];
  if (
    input.overallAccuracy !== null &&
    input.overallAccuracy >= ADAPTATION_THRESHOLDS.accuracyHighForSpeed &&
    slowest &&
    slowest.ratio > ADAPTATION_THRESHOLDS.slowRtFactor
  ) {
    out.push({
      ruleId: 'accurate_but_slow',
      priority: 65,
      blockDeltas: { APPLY: 0.1 },
      blockMultipliers: { COMPARE: 0.8 },
      messageKey: 'adaptation.accurateButSlow',
      params: {
        type: slowest.type,
        actual: Math.round(slowest.medianMs / 1000),
        target: Math.round(slowest.targetMs / 1000),
      },
      focus: { kind: 'SPEED' },
    });
  }

  // Sai 接続 nhiều → drill cấu trúc riêng.
  const formRate = w.errorTypeDistribution.FORM_ERROR ?? 0;
  if (formRate > ADAPTATION_THRESHOLDS.formErrorRateHigh) {
    out.push({
      ruleId: 'form_errors',
      priority: 60,
      blockDeltas: { RECALL: 0.07 },
      messageKey: 'adaptation.formErrors',
      params: { percent: Math.round(formRate * 100) },
      focus: { kind: 'ERROR_TYPE', errorType: 'FORM_ERROR' },
    });
  }

  // Sai ngữ cảnh nhiều → tăng 問題7.
  const contextRate = w.errorTypeDistribution.CONTEXT_ERROR ?? 0;
  if (contextRate > ADAPTATION_THRESHOLDS.contextErrorRateHigh) {
    out.push({
      ruleId: 'context_errors',
      priority: 55,
      blockDeltas: { APPLY: 0.07 },
      messageKey: 'adaptation.contextErrors',
      params: { percent: Math.round(contextRate * 100) },
      focus: { kind: 'TEXT_GRAMMAR' },
    });
  }

  const selected = out.sort((a, b) => b.priority - a.priority).slice(0, MAX_ADAPTATIONS_PER_DAY);

  // FINAL_7: KHÔNG adaptation nào được nâng LEARN (bất biến có test).
  if (timeline.mode === 'FINAL_7') {
    return selected.map((a) => ({
      ...a,
      blockDeltas: a.blockDeltas ? { ...a.blockDeltas, LEARN: 0 } : a.blockDeltas,
      replaceRatios: a.replaceRatios ? { ...a.replaceRatios, LEARN: 0 } : a.replaceRatios,
    }));
  }
  return selected;
}

export function examReadyLocked(adaptations: Adaptation[]): boolean {
  return adaptations.some((a) => a.locksExamReady);
}
