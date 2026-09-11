/**
 * normalizeForSearch — CHỈ dùng để index tìm kiếm (grammar-schema §7).
 * KHÔNG dùng để chấm bài: chấm bài dùng exercise-engine §7.2 (khắt khe hơn).
 */
// eslint-disable-next-line no-irregular-whitespace -- U+3000 là ký tự phải loại bỏ theo grammar-schema §7
const DECORATIONS = /[〜～・「」『』（）()\s　]/g;

export function normalizeForSearch(s: string): string {
  let out = s.normalize('NFKC');
  out = out.replace(DECORATIONS, '');
  out = out.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  return out.toLowerCase();
}
