import { useMemo, useState } from 'react';
import { cn, focusRing } from '@/lib/utils';
import { useDataQuality, type QualityRow } from '../../lib/admin';
import { stateName } from '../../lib/places';
import { LoadError, RowsSkeleton, SegmentedChoice, cardClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import { Link } from 'react-router-dom';
import { pairsPath } from './PlantPairs';

/**
 * How complete the plant data is, state by state and in all: the owner's
 * instrument for "how clear is the database". One table, one request
 * (`GET /api/admin/quality`), counted when the tab is opened. Every cell is
 * an exact count or the share it makes of the state's plants; what each
 * column counts is written under the table, in the words of
 * server/lib/quality.ts.
 */

type Column = Exclude<keyof QualityRow, 'state' | 'duplicateGroups'>;
type SortKey = Column | 'state';

/** The columns, in the order read. `share`: the count is a part of the state's plants and can be shown as a percentage. */
const COLUMNS: readonly { key: Column; label: string; share: boolean }[] = [
  { key: 'plants', label: 'Plants', share: false },
  { key: 'industry', label: 'Industry', share: true },
  { key: 'code', label: 'Code', share: true },
  { key: 'county', label: 'County', share: true },
  { key: 'people', label: 'People', share: true },
  { key: 'address', label: 'Address', share: true },
  { key: 'outsideId', label: 'Outside id', share: true },
  { key: 'onePlantCompanies', label: 'One-plant companies', share: false },
  { key: 'duplicates', label: 'Duplicates', share: false },
];

type Shown = 'share' | 'count';
const SHOWN: readonly { value: Shown; label: string }[] = [
  { value: 'share', label: 'Shares' },
  { value: 'count', label: 'Counts' },
];

const count = (value: number) => value.toLocaleString('en-US');

/**
 * A part of a whole as a percentage, to one decimal place and never rounded
 * into saying something untrue: all is "100%" only when it is all, none is
 * "0%" only when it is none.
 */
export function shareOf(part: number, whole: number): string {
  if (whole <= 0) return '';
  if (part <= 0) return '0%';
  if (part >= whole) return '100%';
  const tenths = Math.min(999, Math.max(1, Math.round((part / whole) * 1000)));
  return `${(tenths / 10).toFixed(1)}%`;
}

function cellText(row: QualityRow, column: (typeof COLUMNS)[number], shown: Shown): string {
  return column.share && shown === 'share' ? shareOf(row[column.key], row.plants) : count(row[column.key]);
}

/** What a column is ordered by: a share where shares are shown, else the count. */
function sortValue(row: QualityRow, key: Column, shown: Shown): number {
  const column = COLUMNS.find((entry) => entry.key === key);
  return column?.share && shown === 'share' ? (row.plants > 0 ? row[key] / row.plants : 0) : row[key];
}

export default function QualityTable() {
  const quality = useDataQuality();
  const [shown, setShown] = useState<Shown>('share');
  const [sort, setSort] = useState<{ key: SortKey; down: boolean }>({ key: 'plants', down: true });

  const rows = useMemo(() => {
    const list = [...(quality.data?.states ?? [])];
    const name = (row: QualityRow) => (row.state ? stateName(row.state) : '');
    list.sort((a, b) => {
      const order =
        sort.key === 'state' ? name(a).localeCompare(name(b)) : sortValue(a, sort.key, shown) - sortValue(b, sort.key, shown);
      return (sort.down ? -order : order) || b.plants - a.plants || name(a).localeCompare(name(b));
    });
    return list;
  }, [quality.data, sort, shown]);

  const choose = (key: SortKey) => setSort((now) => (now.key === key ? { key, down: !now.down } : { key, down: key !== 'state' }));
  const total = quality.data?.total;

  const heading = (key: SortKey, label: string, className?: string) => (
    <th key={key} scope="col" aria-sort={sort.key === key ? (sort.down ? 'descending' : 'ascending') : 'none'} className={cn('p-0 font-normal', className)}>
      <button
        type="button"
        onClick={() => choose(key)}
        className={cn(
          'flex min-h-11 w-full items-end whitespace-normal px-2.5 pb-2 pt-3 text-[11px] uppercase leading-tight tracking-wider transition-colors hover:text-fg-default sm:min-h-9 sm:whitespace-nowrap',
          key === 'state' ? 'justify-start text-left' : 'justify-end text-right',
          sort.key === key ? 'text-fg-default' : 'text-fg-muted',
          focusRing
        )}
      >
        {label}
      </button>
    </th>
  );

  return (
    <PageSection
      title="Data quality"
      description="How complete the plant data is, by state. Counted now, from the database."
    >
      {quality.isPending ? (
        <RowsSkeleton rows={4} />
      ) : quality.isError || !total ? (
        <LoadError error={quality.error} onRetry={() => void quality.refetch()} retrying={quality.isFetching} />
      ) : (
        <>
          <div className="mb-3 flex">
            <SegmentedChoice label="Figures shown" options={SHOWN} value={shown} onChange={setShown} className="grid-cols-2" optionClassName="px-4" />
          </div>
          <div className={cn(cardClass, 'overflow-x-auto')} data-quality-table>
            <table className="w-full min-w-[40rem] border-collapse whitespace-nowrap text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border-subtle">
                  {heading('state', 'State', 'sticky left-0 z-10 bg-bg-surface')}
                  {COLUMNS.map((column) => heading(column.key, column.label))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-strong font-medium text-fg-default" data-quality-total>
                  <th scope="row" className="sticky left-0 z-10 bg-bg-surface px-2.5 py-2.5 text-left font-medium">
                    <span className="sm:hidden">All</span>
                    <span className="hidden sm:inline">All states</span>
                  </th>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className="px-2.5 py-2.5 text-right" data-quality={column.key}>
                      {column.key === 'duplicates' && total.duplicates > 0 ? (
                        <Link to={pairsPath('spot')} className={cn('underline underline-offset-4', focusRing)} aria-label="Plants on one spot, every state">
                          {cellText(total, column, shown)}
                        </Link>
                      ) : (
                        cellText(total, column, shown)
                      )}
                    </td>
                  ))}
                </tr>
                {rows.map((row) => (
                  <tr key={row.state ?? 'none'} className="border-b border-border-subtle last:border-b-0" data-quality-row={row.state ?? ''}>
                    <th scope="row" className="sticky left-0 z-10 max-w-[9rem] truncate bg-bg-surface px-2.5 py-2 text-left font-normal text-fg-default">
                      {row.state ? (
                        <>
                          <span className="sm:hidden">{row.state}</span>
                          <span className="hidden sm:inline">{stateName(row.state)}</span>
                        </>
                      ) : (
                        'No state'
                      )}
                    </th>
                    {COLUMNS.map((column) => {
                      const value = row[column.key];
                      // Nothing there reads quieter than something; the plant count leads.
                      const tone = column.key === 'plants' ? 'text-fg-default' : value === 0 ? 'text-fg-soft' : 'text-fg-muted';
                      return (
                        <td key={column.key} className={cn('px-2.5 py-2 text-right', tone)}>
                          {/* The count opens the plants it counts, so they can be worked through. */}
                          {column.key === 'duplicates' && value > 0 ? (
                            <Link
                              to={pairsPath('spot', row.state ?? 'none')}
                              className={cn('underline underline-offset-4 hover:text-fg-default', focusRing)}
                              aria-label={`Plants on one spot in ${row.state ? stateName(row.state) : 'no state'}`}
                              data-quality-duplicates={row.state ?? ''}
                            >
                              {cellText(row, column, shown)}
                            </Link>
                          ) : (
                            cellText(row, column, shown)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-xs leading-relaxed text-fg-muted sm:grid-cols-2" data-quality-definitions>
            {definitions(total).map(([term, meaning]) => (
              <div key={term} className="min-w-0">
                <dt className="inline text-fg-default">{term}: </dt>
                <dd className="inline">{meaning}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </PageSection>
  );
}

/** What each column counts. The same definitions as server/lib/quality.ts: change one, change the other. */
function definitions(total: QualityRow & { companies: number }): [string, string][] {
  return [
    ['Plants', 'every plant in the database, under the state it is filed in.'],
    ['Industry', 'plants whose industry is one of the 21.'],
    ['Code', 'plants whose stored NAICS code means exactly one 2022 national industry (six digits).'],
    ['County', 'plants placed in a county from their coordinates. A plant whose coordinates fall in another state than the one it is filed under is not placed.'],
    ['People', 'plants with a recorded headcount.'],
    ['Address', 'plants with a street address: one that is not blank and is not just the city again.'],
    ['Outside id', "plants that carry an outside register's id for the site (today the EPA registry id)."],
    [
      'One-plant companies',
      `companies with one plant in the whole country, counted in that plant's state: ${count(total.onePlantCompanies)} of ${count(total.companies)} companies.`,
    ],
    [
      'Duplicates',
      `plants that share their company and their spot (coordinates equal to three decimal places, about a hundred metres) with another plant, unless an admin has said the two are separate plants: ${count(total.duplicates)} plants at ${count(total.duplicateGroups)} ${total.duplicateGroups === 1 ? 'spot' : 'spots'}. A count opens them.`,
    ],
    ['Shares', 'a part of the state’s plants, to one decimal place. 100% means every plant, 0% none.'],
  ];
}
