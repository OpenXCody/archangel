import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { US_STATES } from '@shared/states';
import { FOCUS_AREAS, SCOPE, focusArea } from '@shared/scope';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn, focusRing } from '@/lib/utils';
import type { IndustryStats } from '../../lib/api';

/*
 * Pieces the industry pages share. Words, as everywhere: people (how many
 * work somewhere), plants (what the product lists), establishments (what the
 * official statistics count). Every number sits under or beside a label, and
 * a figure nobody knows is left out, never shown as 0.
 */

// ─── The place in the address ──────────────────────────────────────────────

/** What ?state= or ?area= says: a place, the country when neither is given, or `unknown` for one that does not exist. */
export type PagePlace =
  | { kind: 'country'; name: string }
  | { kind: 'state'; code: string; name: string }
  | { kind: 'area'; id: string; name: string }
  | { kind: 'unknown'; asked: string };

export function readPlace(params: URLSearchParams): PagePlace {
  const area = params.get('area')?.trim();
  if (area) {
    const found = focusArea(area);
    return found ? { kind: 'area', id: found.id, name: found.name } : { kind: 'unknown', asked: area };
  }
  const state = params.get('state')?.trim();
  if (state) {
    const found = US_STATES.find((s) => s.code === state.toUpperCase());
    return found ? { kind: 'state', code: found.code, name: found.name } : { kind: 'unknown', asked: state };
  }
  return { kind: 'country', name: SCOPE.stateName };
}

/** The place as the API's query and as a page address's query string. */
export function placeQuery(place: PagePlace): { state?: string; area?: string } {
  return place.kind === 'state' ? { state: place.code } : place.kind === 'area' ? { area: place.id } : {};
}
export function placeSearch(place: PagePlace): string {
  const query = new URLSearchParams(placeQuery(place)).toString();
  return query ? `?${query}` : '';
}

const COUNTRY = '__country__';

/**
 * Where the page is about, as text with a chevron: the country, a focus
 * area or a state. Choosing one changes the address (a new history entry, so
 * Back returns to the place before); the first entry clears it.
 */
export function PlaceChoice({ place }: { place: PagePlace }) {
  const [params, setParams] = useSearchParams();
  const value = place.kind === 'state' ? place.code : place.kind === 'area' ? `area:${place.id}` : COUNTRY;
  const current = place.kind === 'unknown' ? SCOPE.stateName : place.name;
  const choose = (next: string) => {
    const query = new URLSearchParams(params);
    query.delete('state');
    query.delete('area');
    if (next.startsWith('area:')) query.set('area', next.slice(5));
    else if (next !== COUNTRY) query.set('state', next);
    setParams(query);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Place: ${current}`}
          data-place-choice
          className={cn(
            '-my-1 inline-flex h-11 min-w-0 items-center gap-1.5 text-base transition-colors sm:h-9',
            place.kind === 'country' || place.kind === 'unknown' ? 'text-text-2 hover:text-text-1' : 'font-medium text-text-1',
            focusRing
          )}
        >
          <span className="min-w-0 truncate">{current}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-3" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] min-w-[13rem] overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={choose}>
          <DropdownMenuRadioItem value={COUNTRY} className="min-h-11 sm:min-h-9">
            {SCOPE.stateName}
          </DropdownMenuRadioItem>
          {FOCUS_AREAS.map((area) => (
            <DropdownMenuRadioItem key={area.id} value={`area:${area.id}`} className="min-h-11 sm:min-h-9">
              {area.name}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          {US_STATES.map((state) => (
            <DropdownMenuRadioItem key={state.code} value={state.code} className="min-h-11 sm:min-h-9">
              {state.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Figures ───────────────────────────────────────────────────────────────

interface Figure {
  label: string;
  value: string;
  /** A quiet word after the value ("a year"). */
  unit?: string;
}

/**
 * Labelled figures in one row, two across on a phone, with a hairline between
 * neighbours and no box around any. Give it only figures that have something
 * to say.
 */
export function Figures({ items }: { items: Figure[] }) {
  if (items.length === 0) return null;
  return (
    // Every figure carries a hairline on its left; the row is drawn a gutter to the left and clipped, so a row's first shows none.
    <div className="mt-6 overflow-hidden">
      <dl
        className={cn(
          '-ml-4 grid gap-y-5 sm:-ml-5',
          items.length === 1 ? 'grid-cols-1 sm:max-w-xs' : 'grid-cols-2',
          items.length === 3 && 'sm:grid-cols-3',
          items.length >= 4 && 'sm:grid-cols-4'
        )}
        data-figures
      >
        {items.map((item) => (
          <div key={item.label} className="min-w-0 border-l border-line pl-4 sm:pl-5">
            <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-text-2">{item.label}</dt>
            <dd className="mt-1 truncate text-[28px] font-semibold leading-9 tabular-nums tracking-tight text-text-1">
              {item.value}
              {item.unit && <span className="ml-1 text-xs font-normal tracking-normal text-text-3">{item.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "People, establishments and average pay": the official figures a place has, as a phrase. */
function officialWords(stats: IndustryStats): string {
  const words = officialFigures(stats).map((figure) => figure.label.toLowerCase());
  const phrase = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : (words[0] ?? '');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * Which of a place's figures are official, and their year: one quiet line that
 * keeps them apart from what the product lists. Who published them is not
 * shown (no public page names a source).
 */
export function SourceLine({ stats }: { stats: IndustryStats }) {
  if (officialFigures(stats).length === 0) return null;
  return (
    <p className="mt-2.5 text-xs leading-relaxed text-text-3" data-official-year={stats.year}>
      {officialWords(stats)}: official figures, {stats.year}.
    </p>
  );
}

/** The official figures of a place as boxes: people, establishments, average pay. */
export function officialFigures(stats: IndustryStats | null): Figure[] {
  if (!stats) return [];
  return [
    ...(stats.employment !== null ? [{ label: 'People', value: stats.employment.toLocaleString() }] : []),
    ...(stats.establishments !== null ? [{ label: 'Establishments', value: stats.establishments.toLocaleString() }] : []),
    ...(stats.avgAnnualPay !== null ? [{ label: 'Average pay', value: `$${stats.avgAnnualPay.toLocaleString()}`, unit: 'a year' }] : []),
  ];
}

// ─── A list with figures down its right edge ───────────────────────────────

interface FigureRow {
  key: string;
  to: string;
  label: string;
  /** Official: people employed. Null when not published. */
  people?: number | null;
  /** Plants the product lists. Zero is left blank. */
  plants?: number;
}

/**
 * Rows that lead somewhere, each with its figures in columns: people
 * (official) and plants (listed). A column nobody has a figure for is not
 * drawn; a figure one row lacks is left blank.
 */
export function FigureList({ rows, state: navState }: { rows: FigureRow[]; state?: unknown }) {
  const withPeople = rows.some((row) => (row.people ?? null) !== null);
  const withPlants = rows.some((row) => (row.plants ?? 0) > 0);
  const columns = cn('grid items-baseline gap-x-3', withPeople && withPlants ? 'grid-cols-[minmax(0,1fr)_5.75rem_3.5rem]' : 'grid-cols-[minmax(0,1fr)_5.75rem]');
  return (
    <div data-figure-list>
      <div aria-hidden="true" className={cn(columns, 'border-b border-line pb-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-text-2')}>
        <span />
        {withPeople && <span>People</span>}
        {withPlants && <span>Plants</span>}
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className="border-b border-line">
            <Link to={row.to} state={navState} className={cn(columns, 'group min-h-11 py-3 text-[15px] leading-snug sm:py-2.5', focusRing)}>
              <span className="min-w-0 text-text-1 group-hover:underline">{row.label}</span>
              {withPeople && (
                <span className="text-right text-sm tabular-nums text-text-1">
                  {row.people != null && (
                    <>
                      {row.people.toLocaleString()}
                      <span className="sr-only"> people</span>
                    </>
                  )}
                </span>
              )}
              {withPlants && (
                <span className={cn('text-right text-sm tabular-nums', withPeople ? 'text-text-2' : 'text-text-1')}>
                  {(row.plants ?? 0) > 0 && (
                    <>
                      {row.plants?.toLocaleString()}
                      <span className="sr-only"> plants</span>
                    </>
                  )}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
