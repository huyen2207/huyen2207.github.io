import { METRIC_SHRINKAGE_ALPHA } from '@/config/learning.config';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Accuracy có GIẢM CHẤN (learning-engine §4.2). 1 câu đúng KHÔNG phải 100%.
 * accHat(c, n, p0) = (c + ALPHA·p0) / (n + ALPHA)
 */
export function accHat(correct: number, total: number, p0 = 0.25, alpha = METRIC_SHRINKAGE_ALPHA): number {
  if (total <= 0) return p0;
  return (correct + alpha * p0) / (total + alpha);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

export function weightedMean(pairs: Array<[value: number, weight: number]>): number {
  const wSum = pairs.reduce((s, [, w]) => s + w, 0);
  if (wSum === 0) return 0;
  return pairs.reduce((s, [v, w]) => s + v * w, 0) / wSum;
}

/** Xác suất đoán trúng theo số đáp án. */
export function guessBaseline(choiceCount: number): number {
  return choiceCount > 0 ? 1 / choiceCount : 0.25;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function pct(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100);
}
