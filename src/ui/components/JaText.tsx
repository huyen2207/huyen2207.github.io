import type { ReactNode } from 'react';

/** Tách chuỗi Nhật và bôi đậm mẫu ngữ pháp. Chỉ là trình bày — không phải logic học tập. */
export function JaText({
  text,
  highlight,
  className = 'ja ja-sentence',
}: {
  text: string;
  highlight?: string | string[];
  className?: string;
}) {
  const needles = (Array.isArray(highlight) ? highlight : highlight ? [highlight] : [])
    .map((h) => h.replace(/[〜～]/g, '').trim())
    .filter((h) => h.length >= 2)
    .sort((a, b) => b.length - a.length);

  if (needles.length === 0) return <span className={className}>{text}</span>;

  const parts: ReactNode[] = [];
  let rest = text;
  let guard = 0;
  while (rest.length > 0 && guard++ < 40) {
    let bestIdx = -1;
    let bestNeedle = '';
    for (const n of needles) {
      const idx = rest.indexOf(n);
      if (idx >= 0 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
        bestNeedle = n;
      }
    }
    if (bestIdx === -1) {
      parts.push(rest);
      break;
    }
    if (bestIdx > 0) parts.push(rest.slice(0, bestIdx));
    parts.push(
      <mark
        key={`${bestNeedle}-${parts.length}`}
        className="rounded px-0.5"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        {bestNeedle}
      </mark>,
    );
    rest = rest.slice(bestIdx + bestNeedle.length);
  }

  return <span className={className}>{parts}</span>;
}

/** Ô trống trong câu cloze hiển thị rõ ràng hơn dấu gạch dưới thô. */
export function ClozeText({ text, filled }: { text: string; filled?: string }) {
  const segments = text.split('___');
  return (
    <span className="ja ja-sentence">
      {segments.map((seg, i) => (
        <span key={i}>
          {seg}
          {i < segments.length - 1 && (
            <span
              className="mx-1 inline-block min-w-[4.5rem] rounded border-b-2 px-2 text-center"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              {filled ?? '　'}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
