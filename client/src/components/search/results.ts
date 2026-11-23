import { US_STATES } from '@shared/states';
import { FOCUS_AREAS, type FocusArea } from '@shared/scope';
import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import type { SearchResults } from '../../lib/api';
import type { Place } from '../../lib/geocode';

/*
 * One search vocabulary. The header's search and the map's search list what
 * they find under the same words, in the same order, each row with the same
 * two lines, so a query reads the same wherever it was typed. Only what a row
 * does when chosen differs: the header opens its page, the map shows it.
 */

type SearchGroupId = 'regions' | 'industries' | 'companies' | 'factories' | 'occupations' | 'skills' | 'jobs' | 'places';

/**
 * The groups, widest thing first: a state, an industry, a company, a factory,
 * a career, a skill, then one open job. Places are towns, counties and ZIP
 * codes from the geocoder, which only the map asks: they arrive a moment
 * after everything else, so they come last.
 */
const SEARCH_GROUPS: { id: SearchGroupId; heading: string }[] = [
  { id: 'regions', heading: 'States and areas' },
  { id: 'industries', heading: 'Industries' },
  { id: 'companies', heading: 'Companies' },
  { id: 'factories', heading: 'Factories' },
  { id: 'occupations', heading: 'Careers' },
  { id: 'skills', heading: 'Skills' },
  { id: 'jobs', heading: 'Jobs' },
  { id: 'places', heading: 'Places' },
];

export const groupHeading = (id: SearchGroupId): string => SEARCH_GROUPS.find((group) => group.id === id)?.heading ?? '';

/** How many rows a group shows. */
export const ROWS_PER_GROUP = 5;

/** One row of results. `score` is how well its name answers what was typed (see `matchScore`). */
export type SearchRow = { key: string; title: string; subtitle?: string; score: number } & (
  | { kind: 'area'; area: FocusArea }
  | { kind: 'state'; code: string }
  | { kind: 'industry'; slug: string }
  | { kind: 'company'; id: string; domain: string | null }
  | { kind: 'factory' | 'occupation' | 'skill'; id: string }
  /** A job opens at its own address, which the search gives (`jobPath` in shared/jobs.ts). */
  | { kind: 'job'; id: string; href?: string }
  | { kind: 'place'; place: Place }
);

export interface SearchGroup {
  id: SearchGroupId;
  rows: SearchRow[];
}

/** A name as it is said: "Tesla Inc." is "tesla", "Austin, TX" is "austin". */
function spoken(name: string): string {
  return name
    .replace(/,.*$/, '')
    .replace(/\s+(inc|incorporated|corp|corporation|co|company|llc|ltd|lp|plc)\.?$/i, '')
    .trim();
}

/** What a military career the query named scores at least: with the names that begin with what was typed. */
const NAMED = 3;

/** How well a name answers what was typed: 4 it is the name, 3 it starts it, 2 it starts a word, 1 it is inside. */
export function matchScore(name: string, query: string): number {
  const n = name.toLowerCase();
  if (n === query || spoken(n) === query) return 4;
  if (n.startsWith(query)) return 3;
  if (n.split(/[\s,./&()-]+/).some((word) => word.startsWith(query))) return 2;
  if (n.includes(query)) return 1;
  return 0;
}

/**
 * States and focus areas the typed text names. Both are short fixed lists
 * the page already has, so they need no request: a state by the start of
 * its name or by its whole two-letter code, a focus area by any word of its name.
 */
export function regionRows(query: string): SearchRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rows: SearchRow[] = [];
  for (const area of FOCUS_AREAS) {
    const score = matchScore(area.name, q);
    if (score > 0) rows.push({ kind: 'area', key: `area-${area.id}`, area, title: area.name, subtitle: `Focus area · ${area.description}`, score });
  }
  for (const state of US_STATES) {
    const score = state.code.toLowerCase() === q ? 4 : state.name.toLowerCase().startsWith(q) ? matchScore(state.name, q) : 0;
    if (score > 0) rows.push({ kind: 'state', key: `state-${state.code}`, code: state.code, title: state.name, subtitle: 'State', score });
  }
  return rows;
}

/** The records the API found, as rows: each kind under its group, names as they are shown everywhere else. */
export function recordRows(results: SearchResults | undefined, query: string): Partial<Record<SearchGroupId, SearchRow[]>> {
  const q = query.trim().toLowerCase();
  const found = results?.results;
  if (!found) return {};
  const scored = (title: string) => matchScore(title, q);
  return {
    industries: (found.industries?.items ?? []).map((item) => ({
      kind: 'industry',
      key: `industry-${item.id}`,
      slug: item.id,
      title: item.name,
      subtitle: item.subtitle || undefined,
      score: scored(item.name),
    })),
    companies: found.companies.items.map((item) => {
      const title = formatCompanyName(item.name);
      // A service is listed only when the query is its name ("navy" is the U.S. Navy): the name typed whole.
      const score = item.service ? 4 : scored(title);
      return { kind: 'company', key: `company-${item.id}`, id: item.id, domain: item.domain ?? null, title, subtitle: item.subtitle || undefined, score };
    }),
    factories: found.factories.items.map((item) => {
      const title = formatFactoryName(item.name);
      return { kind: 'factory', key: `factory-${item.id}`, id: item.id, title, subtitle: item.subtitle || undefined, score: scored(title) };
    }),
    occupations: found.occupations.items.map((item) => ({
      kind: 'occupation',
      key: `occupation-${item.id}`,
      id: item.id,
      title: item.name,
      subtitle: item.subtitle || undefined,
      // A military career is listed only when the query named it. One the query can be nothing but (`leads`: its
      // code with a digit, or beside its service or its system's word) answers as a name typed whole does. Any
      // other stays first among the careers and leads nothing: letters alone also begin companies' names.
      score: item.leads ? 4 : item.named ? Math.max(NAMED, scored(item.name)) : scored(item.name),
    })),
    skills: found.skills.items.map((item) => ({
      kind: 'skill',
      key: `skill-${item.id}`,
      id: item.id,
      title: item.name,
      subtitle: item.subtitle || undefined,
      score: scored(item.name),
    })),
    jobs: (found.jobs?.items ?? []).map((item) => ({
      kind: 'job',
      key: `job-${item.id}`,
      id: item.id,
      href: item.href,
      title: item.name,
      subtitle: item.subtitle || undefined,
      score: scored(item.name),
    })),
  };
}

/**
 * Rows into the groups that are drawn: within a group the closest names
 * first (rows that match equally keep the order they came in), five at
 * most; the groups in the one order, except that a group holding exactly
 * what was typed leads ("texas" is the state, "welder" the career). The
 * first row is what Enter takes.
 */
export function groupRows(rows: Partial<Record<SearchGroupId, SearchRow[]>>): SearchGroup[] {
  return SEARCH_GROUPS.map(({ id }, order) => {
    const ranked = (rows[id] ?? [])
      .map((row, i) => ({ row, i }))
      .sort((a, b) => b.row.score - a.row.score || a.i - b.i)
      .map(({ row }) => row)
      .slice(0, ROWS_PER_GROUP);
    return { id, rows: ranked, exact: ranked[0]?.score === 4, order };
  })
    .filter((group) => group.rows.length > 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.order - b.order)
    .map(({ id, rows: groupRows }) => ({ id, rows: groupRows }));
}

/** The one sentence for a search that found nothing. */
export const noResults = (query: string): string => `No results for “${query}”.`;
