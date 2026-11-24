import { Fragment, useMemo, useState } from 'react';
import { cn, focusRing } from '@/lib/utils';
import { useDataQuality, type QualityRow } from '../../lib/admin';
import { stateName } from '../../lib/places';
import { LoadError, RowsSkeleton, SegmentedChoice, cardClass } from '../account/parts';
import Panel from './Panel';
import { Link } from 'react-router-dom';
import { pairsPath } from './PlantPairs';

/**
 * How complete the factory data is, state by state and in all: the owner's
 * instrument for "how clear is the database". One table, one request
 * (`GET /api/admin/quality`), counted when the tab is opened. Every cell is
 * an exact count or the share it makes of the state's factories; what each
 * column counts is written under the table, in the words of
 * server/lib/quality.ts.
 */

type Column = Exclude<keyof QualityRow, 'state' | 'duplicateGroups'>;
type SortKey = Column | 'state';

/** The columns, in the order read. `share`: the count is a part of the state's factories and can be shown as a percentage. */
const COLUMNS: readonly { key: Column; label: string; share: boolean }[] = [
  { key: 'plants', label: 'Factories', share: false },
  { key: 'industry', label: 'Industry', share: true },
  { key: 'code', label: 'Code', share: true },
  { key: 'county', label: 'County', share: true },
  { key: 'people', label: 'People', share: true },
  { key: 'address', label: 'Address', share: true },
  { key: 'outsideId', label: 'Outside id', share: true },
  { key: 'onePlantCompanies', label: 'One-factory companies', share: false },
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
          'flex min-h-11 w-full items-end whitespace-normal px-2.5 pb-2 pt-3 text-[11px] font-medium uppercase leading-tight tracking-[0.08em] transition-colors hover:text-text-1 sm:min-h-9 sm:whitespace-nowrap',
          key === 'state' ? 'justify-start text-left' : 'justify-end text-right',
          sort.key === key ? 'text-text-1' : 'text-text-2',
          focusRing
        )}
      >
        {/* On a phone a heading breaks between its words, never at a hyphen: "One-factory" stays whole. */}
        <span>
          {label.split(' ').map((word, index) => (
            <Fragment key={word}>
              {index > 0 && ' '}
              <span className="whitespace-nowrap">{word}</span>
            </Fragment>
          ))}
        </span>
      </button>
    </th>
  );

  return (
    <Panel
      title="Data quality"
      description="How complete the factory data is, by state. Counted now, from the database."
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
                <tr className="border-b border-line">
                  {heading('state', 'State', 'sticky left-0 z-10 bg-bg')}
                  {COLUMNS.map((column) => heading(column.key, column.label))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line-strong font-medium text-text-1" data-quality-total>
                  <th scope="row" className="sticky left-0 z-10 bg-bg px-2.5 py-2.5 text-left font-medium">
                    <span className="sm:hidden">All</span>
                    <span className="hidden sm:inline">All states</span>
                  </th>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className="px-2.5 py-2.5 text-right" data-quality={column.key}>
                      {column.key === 'duplicates' && total.duplicates > 0 ? (
                        <Link to={pairsPath('spot')} className={cn('underline', focusRing)} aria-label="Factories on one spot, every state">
                          {cellText(total, column, shown)}
                        </Link>
                      ) : (
                        cellText(total, column, shown)
                      )}
                    </td>
                  ))}
                </tr>
                {rows.map((row) => (
                  <tr key={row.state ?? 'none'} className="border-b border-line last:border-b-0" data-quality-row={row.state ?? ''}>
                    <th scope="row" className="sticky left-0 z-10 max-w-[9rem] truncate bg-bg px-2.5 py-2 text-left font-normal text-text-1">
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
                      // Nothing there reads quieter than something; the factory count leads.
                      const tone = column.key === 'plants' ? 'text-text-1' : value === 0 ? 'text-text-3' : 'text-text-2';
                      return (
                        <td key={column.key} className={cn('px-2.5 py-2 text-right', tone)}>
                          {/* The count opens the factories it counts, so they can be worked through. */}
                          {column.key === 'duplicates' && value > 0 ? (
                            <Link
                              to={pairsPath('spot', row.state ?? 'none')}
                              className={cn('underline hover:text-text-1', focusRing)}
                              aria-label={`Factories on one spot in ${row.state ? stateName(row.state) : 'no state'}`}
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
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-xs leading-relaxed text-text-3 sm:grid-cols-2" data-quality-definitions>
            {definitions(total).map(([term, meaning]) => (
              <div key={term} className="min-w-0">
                <dt className="inline text-text-1">{term}: </dt>
                <dd className="inline">{meaning}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Panel>
  );
}

/** What each column counts. The same definitions as server/lib/quality.ts: change one, change the other. */
function definitions(total: QualityRow & { companies: number }): [string, string][] {
  return [
    ['Factories', 'every factory in the database, under the state it is filed in.'],
    ['Industry', 'factories whose industry is one of the 21.'],
    ['Code', 'factories whose stored NAICS code means exactly one 2022 national industry (six digits).'],
    ['County', 'factories placed in a county from their coordinates. A factory whose coordinates fall in another state than the one it is filed under is not placed.'],
    ['People', 'factories with a recorded headcount.'],
    ['Address', 'factories with a street address: one that is not blank and is not just the city again.'],
    ['Outside id', "factories that carry an outside register's id for the site (today the EPA registry id)."],
    [
      'One-factory companies',
      `companies with one factory in the whole country, counted in that factory's state: ${count(total.onePlantCompanies)} of ${count(total.companies)} companies.`,
    ],
    [
      'Duplicates',
      `factories that share their company and their spot (coordinates equal to three decimal places, about a hundred metres) with another factory, unless an admin has said the two are separate factories: ${count(total.duplicates)} factories at ${count(total.duplicateGroups)} ${total.duplicateGroups === 1 ? 'spot' : 'spots'}. A count opens them.`,
    ],
    ['Shares', 'a part of the state’s factories, to one decimal place. 100% means every factory, 0% none.'],
  ];
}
