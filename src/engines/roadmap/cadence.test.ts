import { describe, expect, it } from 'vitest';
import { observedCadence } from './index';
import { CADENCE_WINDOW_DAYS } from '@/config/learning.config';

const START = '2026-09-11T00:00:00+07:00';
const BH = 4;

/** Sinh dayKey cho `count` ngày học, cách đều nhau trong cửa sổ, tính lùi từ `now`. */
function keys(now: Date, count: number, spreadDays = CADENCE_WINDOW_DAYS): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getTime() - Math.floor((i * spreadDays) / Math.max(1, count)) * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
const at = (daysAfterStart: number) =>
  new Date(new Date(START).getTime() + daysAfterStart * 86_400_000 + 9 * 3_600_000);

describe('observedCadence — chưa đủ dữ liệu thì im lặng', () => {
  it('ngày thứ 3 không kết luận gì, dù mới học 1 buổi', () => {
    const now = at(3);
    const c = observedCadence(keys(now, 1), 7, START, now, BH);
    expect(c.hasEnoughData).toBe(false);
    expect(c.suggested).toBeNull();
    expect(c.direction).toBe('ON_TRACK');
  });
});

describe('observedCadence — phát hiện học ít hơn khai', () => {
  it('khai 7 nhưng thực tế học 8/14 ngày → gợi ý giảm', () => {
    const now = at(20);
    const c = observedCadence(keys(now, 8), 7, START, now, BH);
    expect(c.hasEnoughData).toBe(true);
    expect(c.direction).toBe('SLOWER');
    expect(c.studiedDays).toBe(8);
    expect(c.observed).toBeCloseTo(4, 0);
    expect(c.suggested).toBe(4);
  });

  it('làm tròn XUỐNG — kế hoạch dè dặt hơn là lạc quan', () => {
    const now = at(20);
    // 9/14 ngày ≈ 4.5 buổi/tuần → gợi ý 4, không phải 5.
    const c = observedCadence(keys(now, 9), 7, START, now, BH);
    expect(c.observed).toBeGreaterThan(4);
    expect(c.observed).toBeLessThan(5);
    expect(c.suggested).toBe(4);
  });
});

describe('observedCadence — không làm phiền khi sát nhau', () => {
  it('khai 7, thực tế 13/14 ngày (≈6.5) → lệch dưới 1 buổi/tuần, im lặng', () => {
    const now = at(20);
    const c = observedCadence(keys(now, 13), 7, START, now, BH);
    expect(c.direction).toBe('ON_TRACK');
    expect(c.suggested).toBeNull();
  });

  it('không gợi ý đúng bằng con số đang khai', () => {
    const now = at(20);
    const c = observedCadence(keys(now, 8), 4, START, now, BH);
    expect(c.suggested).toBeNull();
  });
});

describe('observedCadence — học nhiều hơn khai', () => {
  it('khai 3 nhưng thực tế học 12/14 ngày → gợi ý tăng', () => {
    const now = at(20);
    const c = observedCadence(keys(now, 12), 3, START, now, BH);
    expect(c.direction).toBe('FASTER');
    expect(c.suggested).toBeGreaterThan(3);
  });
});

describe('observedCadence — bất biến', () => {
  it('không bao giờ gợi ý ngoài khoảng 1–7', () => {
    const now = at(30);
    for (const n of [0, 1, 14, 28]) {
      const c = observedCadence(keys(now, n), 7, START, now, BH);
      if (c.suggested !== null) {
        expect(c.suggested).toBeGreaterThanOrEqual(1);
        expect(c.suggested).toBeLessThanOrEqual(7);
      }
    }
  });

  it('bỏ hẳn không học thì gợi ý 1, không phải 0', () => {
    const now = at(30);
    const c = observedCadence([], 7, START, now, BH);
    expect(c.studiedDays).toBe(0);
    expect(c.suggested).toBe(1);
  });

  it('chỉ đếm ngày trong cửa sổ, bỏ qua lịch sử cũ', () => {
    const now = at(40);
    const old = ['2026-09-12', '2026-09-13', '2026-09-14'];
    const c = observedCadence([...old, ...keys(now, 4)], 7, START, now, BH);
    expect(c.studiedDays).toBe(4);
  });
});
