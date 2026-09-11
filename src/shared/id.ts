/** Sinh id. Chỉ dùng ở tầng app/storage — engine pure không được gọi. */
export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
