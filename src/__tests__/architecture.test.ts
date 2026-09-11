import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

const all = walk(SRC, (p) => p.endsWith('.ts') || p.endsWith('.tsx'));
const isTest = (p: string) => p.includes('.test.') || p.includes('__tests__') || p.endsWith('test-setup.ts');
const source = all.filter((p) => !isTest(p));
const read = (p: string) => readFileSync(p, 'utf8');

/** Bỏ comment trước khi kiểm — luật nhắm vào MÃ, không nhắm vào chú thích. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function importsOf(content: string): string[] {
  const out: string[] = [];
  const re = /from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push(m[1]);
  return out;
}

describe('Luật phụ thuộc (project-architecture §3)', () => {
  it('engines/** KHÔNG import ui/**, app/**, storage/**', () => {
    const offenders: string[] = [];
    for (const file of source.filter((p) => p.includes('/engines/'))) {
      for (const imp of importsOf(read(file))) {
        if (/@\/(ui|app|storage)\//.test(imp)) offenders.push(`${file} → ${imp}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('ui/** chỉ được import engines/** ở dạng thuần (kiểu + hàm không trạng thái)', () => {
    const allowedPureImports = ['@/engines/exercise', '@/engines/session', '@/engines/review', '@/engines/mastery'];
    const offenders: string[] = [];
    for (const file of source.filter((p) => p.includes('/ui/'))) {
      for (const imp of importsOf(read(file))) {
        if (imp.startsWith('@/engines/') && !allowedPureImports.includes(imp)) {
          offenders.push(`${file} → ${imp}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('content/** KHÔNG import storage/**', () => {
    const offenders: string[] = [];
    for (const file of source.filter((p) => p.includes('/content/'))) {
      for (const imp of importsOf(read(file))) {
        if (imp.startsWith('@/storage')) offenders.push(`${file} → ${imp}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('domain/** không import tầng nào khác', () => {
    const offenders: string[] = [];
    for (const file of source.filter((p) => p.includes('/domain/'))) {
      for (const imp of importsOf(read(file))) {
        if (/@\/(config|content|storage|app|ui|engines)\//.test(imp)) offenders.push(`${file} → ${imp}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('Luật nội dung & UI (CLAUDE.md §17, §26; exercise-engine P4)', () => {
  it('P4 — UI không chứa bất kỳ so sánh đúng/sai nào', () => {
    const offenders: string[] = [];
    for (const file of source.filter((p) => p.includes('/ui/'))) {
      const content = read(file);
      const code = stripComments(content);
      if (/===\s*\w*\.?correctChoiceId/.test(code)) offenders.push(`${file}: correctChoiceId`);
      // Cho phép truyền prop `isCorrect={...}`; cấm TỰ TÍNH đúng/sai trong UI.
      if (/\bisCorrect\s*=\s*(?!\{)/.test(code)) offenders.push(`${file}: tự tính isCorrect`);
    }
    expect(offenders).toEqual([]);
  });

  it('không chuỗi tiếng Nhật nào nằm trong file .tsx (grammar-schema §10)', () => {
    const jaRe = /[぀-ゟ゠-ヿ一-龯ｦ-ﾟ★☆]/;
    const offenders: string[] = [];
    for (const file of source.filter((p) => p.endsWith('.tsx'))) {
      for (const [i, line] of read(file).split('\n').entries()) {
        if (jaRe.test(line)) offenders.push(`${file}:${i + 1} ${line.trim().slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('cấm `any` trong engines/** và content/**', () => {
    const offenders: string[] = [];
    for (const file of source.filter((p) => p.includes('/engines/') || p.includes('/content/'))) {
      if (/(:|<)\s*any(\s|>|,|\)|;|\[)/.test(read(file))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('engine không gọi Date.now() hay Math.random() (pure — M6, P1, R7)', () => {
    const offenders: string[] = [];
    for (const file of source.filter((p) => p.includes('/engines/'))) {
      const code = stripComments(read(file));
      if (/Date\.now\(\)/.test(code)) offenders.push(`${file}: Date.now()`);
      if (/Math\.random\(\)/.test(code)) offenders.push(`${file}: Math.random()`);
    }
    expect(offenders).toEqual([]);
  });

  it('CẤM hard-code ngưỡng ngày kiểu `daysRemaining <= 14` ngoài PhaseEngine/config', () => {
    const offenders: string[] = [];
    for (const file of source) {
      if (file.includes('/engines/phase/') || file.includes('/config/')) continue;
      const code = stripComments(read(file));
      if (/daysRemaining\s*[<>]=?\s*(7|14|21|30)\b/.test(code)) offenders.push(file);
      if (/daysUntilExam\s*[<>]=?\s*(7|14|30)\b/.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('không magic number trong engines/review/** (mọi hằng số đọc từ config)', () => {
    const content = read(join(SRC, 'engines/review/index.ts'));
    const body = stripComments(content);
    const numbers = [...body.matchAll(/(?<![\w.'"$])(\d+(?:\.\d+)?)(?![\w])/g)].map((m) => Number(m[1]));
    const suspicious = numbers.filter((n) => n > 2);
    expect(suspicious).toEqual([]);
  });
});

describe('Cấu trúc nội dung', () => {
  it('mọi khoá i18n dùng trong ui đều tồn tại', async () => {
    const vi = (await import('@/i18n/vi')).default;
    const missing: string[] = [];
    for (const file of source.filter((p) => p.includes('/ui/'))) {
      const keys = [...read(file).matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
      for (const k of keys) if (!(k in vi)) missing.push(`${file} → ${k}`);
    }
    expect(missing).toEqual([]);
  });

  it('nội dung ngữ pháp chỉ nằm trong content/data/**.json (i18n chỉ chứa nhãn giao diện)', () => {
    const offenders: string[] = [];
    const skip = (p: string) => p.includes('/content/data/') || p.endsWith('i18n/vi.ts');
    for (const file of source.filter((p) => !skip(p))) {
      for (const line of read(file).split('\n')) {
        const matches = line.match(/["'`][^"'`\n]{8,}["'`]/g) ?? [];
        for (const m of matches) {
          if (/[぀-ヿ一-龯]{4,}/.test(m)) offenders.push(`${file} ${m.slice(0, 40)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
