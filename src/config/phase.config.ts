import type { Phase, SessionBlockType, StudyMode } from '@/domain/enums';

/** CLAUDE.md §4.1 — tỉ lệ phase theo tổng số ngày. Cấm hard-code `day <= 30`. */
export interface PhaseRatioRow {
  minDays: number;
  know: number;
  compare: number;
  detect: number;
}

export const PHASE_RATIO_TABLE: readonly PhaseRatioRow[] = [
  { minDays: 90, know: 0.33, compare: 0.33, detect: 0.34 },
  { minDays: 60, know: 0.35, compare: 0.32, detect: 0.33 },
  { minDays: 30, know: 0.4, compare: 0.3, detect: 0.3 },
  { minDays: 15, know: 0.45, compare: 0.25, detect: 0.3 },
  { minDays: 0, know: 0.0, compare: 0.3, detect: 0.7 },
];

/** Ràng buộc cứng CLAUDE.md §4.1 */
export const MIN_DETECT_DAYS = 7;
export const MIN_TOTAL_DAYS_FOR_DETECT_FLOOR = 14;
export const TRIAGE_THRESHOLD_DAYS = 30;
export const FINAL_14_THRESHOLD_DAYS = 14;
export const FINAL_7_THRESHOLD_DAYS = 7;
/** Dưới ngưỡng này chỉ dạy grammar HIGH (CLAUDE.md §4.1, dòng < 15). */
export const HIGH_ONLY_THRESHOLD_DAYS = 15;

/**
 * CLAUDE.md §8 — trọng số session theo phase/mode. Đây là bảng PHÂN BỔ (C-01 phương án A).
 * Bảng 3 nhóm của prompt chỉ dùng để HIỂN THỊ (learning-engine §8.4).
 */
export type BlockRatios = Record<Exclude<SessionBlockType, 'SCHEDULE'>, number>;

export const PHASE_BLOCK_RATIOS: Record<Phase | 'FINAL_14' | 'FINAL_7', BlockRatios> = {
  PHASE_1_KNOW: { REVIEW: 0.2, LEARN: 0.4, RECALL: 0.25, COMPARE: 0.0, APPLY: 0.1, ANALYZE_ERROR: 0.05 },
  PHASE_2_COMPARE: { REVIEW: 0.15, LEARN: 0.15, RECALL: 0.1, COMPARE: 0.35, APPLY: 0.15, ANALYZE_ERROR: 0.1 },
  PHASE_3_DETECT: { REVIEW: 0.1, LEARN: 0.05, RECALL: 0.05, COMPARE: 0.15, APPLY: 0.45, ANALYZE_ERROR: 0.2 },
  FINAL_14: { REVIEW: 0.15, LEARN: 0.05, RECALL: 0.05, COMPARE: 0.2, APPLY: 0.4, ANALYZE_ERROR: 0.15 },
  FINAL_7: { REVIEW: 0.2, LEARN: 0.0, RECALL: 0.1, COMPARE: 0.15, APPLY: 0.45, ANALYZE_ERROR: 0.1 },
};

export function ratiosFor(phase: Phase, mode: StudyMode): BlockRatios {
  if (mode === 'FINAL_7') return { ...PHASE_BLOCK_RATIOS.FINAL_7 };
  if (mode === 'FINAL_14') return { ...PHASE_BLOCK_RATIOS.FINAL_14 };
  return { ...PHASE_BLOCK_RATIOS[phase] };
}

/** CLAUDE.md §5.3 — ngưỡng stale theo phase/mode. */
export const STALE_THRESHOLD_DAYS: Record<Phase | 'FINAL_14' | 'FINAL_7', number> = {
  PHASE_1_KNOW: 10,
  PHASE_2_COMPARE: 7,
  PHASE_3_DETECT: 4,
  FINAL_14: 3,
  FINAL_7: 3,
};

export function staleThresholdDays(phase: Phase, mode: StudyMode): number {
  if (mode === 'FINAL_7' || mode === 'FINAL_14') return STALE_THRESHOLD_DAYS.FINAL_14;
  return STALE_THRESHOLD_DAYS[phase];
}
