import { DEFAULT_DAY_BOUNDARY_HOUR } from '@/config/learning.config';

export const MS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;

/**
 * "Ngày học" theo dayBoundaryHour ĐỊA PHƯƠNG (CLAUDE.md §26, mặc định 04:00).
 * Trả về khoá 'YYYY-MM-DD'. Lưu ISO UTC, hiển thị/nhóm theo giờ địa phương.
 */
export function dayKey(at: Date | string, boundaryHour = DEFAULT_DAY_BOUNDARY_HOUR): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  const shifted = new Date(d.getTime() - boundaryHour * 3_600_000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Mốc bắt đầu (dayBoundaryHour) của một ngày học, trả về Date tuyệt đối. */
export function startOfLearningDay(key: string, boundaryHour = DEFAULT_DAY_BOUNDARY_HOUR): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, boundaryHour, 0, 0, 0);
}

export function dayKeyToUtcIso(key: string, boundaryHour = DEFAULT_DAY_BOUNDARY_HOUR): string {
  return startOfLearningDay(key, boundaryHour).toISOString();
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function daysBetweenKeys(from: string, to: string): number {
  const a = startOfLearningDay(from, 0).getTime();
  const b = startOfLearningDay(to, 0).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/** Số ngày lịch giữa hai mốc, làm tròn xuống theo ranh giới ngày học. */
export function calendarDaysBetween(
  from: Date | string,
  to: Date | string,
  boundaryHour = DEFAULT_DAY_BOUNDARY_HOUR,
): number {
  return daysBetweenKeys(dayKey(from, boundaryHour), dayKey(to, boundaryHour));
}

export function daysAgo(at: string, now: Date, boundaryHour = DEFAULT_DAY_BOUNDARY_HOUR): number {
  return calendarDaysBetween(at, now, boundaryHour);
}

/**
 * Số NGÀY HỌC giữa hai mốc khi người học chỉ học `daysPerWeek` ngày/tuần.
 * Xấp xỉ tuyến tính, deterministic: floor(calendarDays × daysPerWeek / 7), sàn 0.
 */
export function studyDaysBetween(
  from: Date | string,
  to: Date | string,
  daysPerWeek: number,
  boundaryHour = DEFAULT_DAY_BOUNDARY_HOUR,
): number {
  const cal = calendarDaysBetween(from, to, boundaryHour);
  if (cal <= 0) return 0;
  const ratio = Math.min(Math.max(daysPerWeek, 1), 7) / 7;
  return Math.floor(cal * ratio);
}

/** Lấy phần ngày 'YYYY-MM-DD' từ một chuỗi ISO. */
export function isoToDayKey(iso: string): string {
  return iso.slice(0, ISO_DATE_LENGTH);
}

export function addDays(at: Date | string, days: number): Date {
  const d = typeof at === 'string' ? new Date(at) : at;
  return new Date(d.getTime() + days * MS_PER_DAY);
}

export function isoNow(now: Date): string {
  return now.toISOString();
}

/** Định dạng hiển thị ngày kiểu Việt Nam (dd/MM/yyyy) — dùng ở UI. */
export function formatDateVi(at: Date | string): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function formatMinutes(min: number): string {
  return `${Math.max(0, Math.round(min))}`;
}

export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}
