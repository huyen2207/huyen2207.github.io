import type { ComparisonSet } from '@/domain/grammar';
import { getGrammar } from '@/content/repository';
import { t } from '@/i18n/vi';
import { Card } from './primitives';

/** Bảng so sánh — cuộn ngang được trên 375px (arch §9 /compare). */
export function ComparisonTable({ set }: { set: ComparisonSet }) {
  const patterns = set.grammarIds.map((id) => ({ id, pattern: getGrammar(id)?.pattern ?? id }));

  return (
    <div>
      <Card className="mb-3 px-4 py-3">
        <h3 className="mb-1 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
          {t('compare.decisive')}
        </h3>
        <p className="text-[15px] font-medium leading-relaxed">{set.decisiveDifferenceVi}</p>
      </Card>

      <div className="scroll-x -mx-4 px-4">
        <table className="w-max min-w-full border-collapse text-left">
          <caption className="sr-only">{t('compare.table')}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 border-b px-2 py-2 text-[12px] font-semibold hairline"
                style={{ background: 'var(--paper)', color: 'var(--ink-faint)' }}
              >
                {t('compare.table')}
              </th>
              {patterns.map((p) => (
                <th
                  key={p.id}
                  scope="col"
                  className="ja border-b px-3 py-2 text-[15px] font-semibold hairline"
                  style={{ minWidth: '9rem' }}
                >
                  {p.pattern}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {set.rows.map((row) => (
              <tr key={row.axis}>
                <th
                  scope="row"
                  className="sticky left-0 border-b px-2 py-2.5 align-top text-[12px] font-medium hairline"
                  style={{ background: 'var(--paper)', color: 'var(--ink-faint)' }}
                >
                  {t(`axis.${row.axis}`)}
                </th>
                {patterns.map((p) => (
                  <td key={p.id} className="border-b px-3 py-2.5 align-top text-[14px] leading-relaxed hairline">
                    {row.cells[p.id]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {set.examPatternVi && (
        <Card className="mt-3 px-4 py-3">
          <h3 className="mb-1 text-[13px] font-semibold" style={{ color: 'var(--ink-faint)' }}>
            {t('compare.examPattern')}
          </h3>
          <p className="text-[14px] leading-relaxed">{set.examPatternVi}</p>
        </Card>
      )}
    </div>
  );
}
