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
import { cn } from '@/lib/utils';
import type { IndustryStats } from '../../lib/api';
import { BackLink, detailActionClass } from '../layout/Page';

/*
 * Pieces the industry pages share. Words, as everywhere: people (how many
 * work somewhere), plants (what the product lists), establishments (what the
 * official statistics count). Every number sits under or beside a label, and
 * a figure nobody knows is left out, never shown as 0.
 */

export const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';

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
            place.kind === 'country' || place.kind === 'unknown' ? 'text-fg-muted hover:text-fg-default' : 'font-medium text-fg-default',
            FOCUS
          )}
        >
          <span className="min-w-0 truncate">{current}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-soft" aria-hidden="true" />
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

// ─── Page furniture ────────────────────────────────────────────────────────
// The heading block, sections and record rows are the detail page's own
// (`components/layout/Page.tsx`). These two names are kept for the list of
// industries, which still asks for them here.

/** Returns to wherever the person came from; with no history (a link opened cold), to `fallback`. */
export function BackButton({ fallback }: { fallback: string }) {
  return <BackLink fallback={fallback} />;
}

export const OUTLINE_LINK = detailActionClass;

// ─── Figures ───────────────────────────────────────────────────────────────

export interface Figure {
  label: string;
  value: string;
  /** A quiet word after the value ("a year"). */
  unit?: string;
}

/** Labelled figures, two across on a phone. Give it only figures that have something to say. */
export function Figures({ items }: { items: Figure[] }) {
  if (items.length === 0) return null;
  return (
    <dl
      className={cn(
        'mt-6 grid gap-2 sm:gap-3',
        items.length === 1 ? 'grid-cols-1 sm:max-w-xs' : 'grid-cols-2',
        items.length === 3 && 'sm:grid-cols-3',
        items.length >= 4 && 'sm:grid-cols-4'
      )}
      data-figures
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 rounded-xl border border-border-subtle bg-bg-surface px-4 py-3">
          <dt className="truncate text-[11px] uppercase tracking-wider text-fg-muted">{item.label}</dt>
          <dd className="mt-1 truncate text-xl font-semibold tabular-nums tracking-tight text-fg-default">
            {item.value}
            {item.unit && <span className="ml-1 text-xs font-normal tracking-normal text-fg-soft">{item.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "People, establishments and average pay": the official figures a place has, as a phrase. */
function officialWords(stats: IndustryStats): string {
  const words = officialFigures(stats).map((figure) => figure.label.toLowerCase());
  const phrase = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : (words[0] ?? '');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** Who counted the official figures, and when: one quiet line, the publisher a link to its own page. */
export function SourceLine({ stats }: { stats: IndustryStats }) {
  if (officialFigures(stats).length === 0) return null;
  return (
    <p className="mt-2.5 text-xs leading-relaxed text-fg-soft" data-source>
      {officialWords(stats)}:{' '}
      {stats.sourceUrl ? (
        <a href={stats.sourceUrl} target="_blank" rel="noreferrer" className={cn('underline decoration-dotted underline-offset-4 hover:text-fg-muted', FOCUS)}>
          {stats.source}
        </a>
      ) : (
        stats.source
      )}
      , {stats.year}.
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

export interface FigureRow {
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
      <div aria-hidden="true" className={cn(columns, 'border-b border-border-subtle pb-2 text-right text-[11px] uppercase tracking-wider text-fg-soft')}>
        <span />
        {withPeople && <span>People</span>}
        {withPlants && <span>Plants</span>}
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className="border-b border-border-subtle">
            <Link to={row.to} state={navState} className={cn(columns, 'group min-h-11 py-3 text-[15px] leading-snug sm:py-2.5', FOCUS)}>
              <span className="min-w-0 text-fg-default underline-offset-4 group-hover:underline">{row.label}</span>
              {withPeople && (
                <span className="text-right text-sm tabular-nums text-fg-default">
                  {row.people != null && (
                    <>
                      {row.people.toLocaleString()}
                      <span className="sr-only"> people</span>
                    </>
                  )}
                </span>
              )}
              {withPlants && (
                <span className={cn('text-right text-sm tabular-nums', withPeople ? 'text-fg-muted' : 'text-fg-default')}>
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
