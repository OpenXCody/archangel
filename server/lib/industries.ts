import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { factoryInArea, factoryInScope } from './scope.js';
import type { FocusArea } from '../../shared/scope.js';
import { INDUSTRIES, MANUFACTURING_CODE, industryLabel } from '../../shared/industry.js';

/**
 * The industry as a level of the product: what the industry routes, the
 * Explore overview and search share.
 *
 * Two kinds of figure are kept apart everywhere:
 * - official statistics (industry_stats: people employed, establishments and
 *   pay, published per state and for the nation), and
 * - what the product lists (plants, their companies, and people at a plant
 *   where a headcount is recorded).
 * A figure that is not known is null, never zero.
 */

export type Row = Record<string, unknown>;
export const rowsOf = (result: unknown): Row[] => Array.from(result as Iterable<Row>);
export const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
export const int = (value: unknown): number => Number(value) || 0;
/** A figure that may be unknown: null stays null, and so does a zero nobody would state. */
export const known = (value: unknown): number | null => (value === null || value === undefined || Number(value) <= 0 ? null : Number(value));

export type Place =
  | { kind: 'country'; name: string }
  | { kind: 'state'; code: string; name: string }
  | { kind: 'area'; id: string; name: string; area: FocusArea };

/** The plants of a place, by the name the factories table goes by in the query. */
export function inPlace(place: Place, table: string): SQL {
  if (place.kind === 'state') return sql`${sql.identifier(table)}.state = ${place.code}`;
  if (place.kind === 'area') return factoryInArea(place.area, table);
  return sql`TRUE`;
}

export const placeOut = (place: Place) =>
  place.kind === 'state'
    ? { kind: place.kind, code: place.code, name: place.name }
    : place.kind === 'area'
      ? { kind: place.kind, id: place.id, name: place.name }
      : { kind: place.kind, name: place.name };

/** The key official statistics are published under for a place, or null where there are none (a focus area). */
export const statsKey = (place: Place): string | null => (place.kind === 'country' ? 'US' : place.kind === 'state' ? place.code : null);

export interface Stats {
  year: number;
  establishments: number | null;
  employment: number | null;
  avgAnnualPay: number | null;
  source: string;
  sourceUrl: string | null;
}

/** A statistics row as the API says it, or null when it has nothing to say. */
export function statsOf(row: Row | undefined): Stats | null {
  if (!row) return null;
  const stats: Stats = {
    year: int(row.year),
    establishments: known(row.establishments),
    employment: known(row.employment),
    avgAnnualPay: known(row.avg_annual_pay),
    source: String(row.source),
    sourceUrl: text(row.source_url),
  };
  return stats.establishments === null && stats.employment === null ? null : stats;
}

/**
 * Every industry in a place, largest first: by people employed where the
 * official figure is published, then by the plants the product lists. An
 * industry with nothing in the place is left out. `manufacturing` is the
 * official figure for all of them together; `plants` is every plant listed in
 * the place, whether or not its industry is known.
 */
export async function listIndustries(place: Place) {
  const key = statsKey(place);
  const [plantRows, statRows] = await Promise.all([
    db.execute(sql`
      SELECT f.primary_naics_description AS name, COUNT(*)::int AS plants
      FROM factories f
      WHERE ${inPlace(place, 'f')} AND ${factoryInScope('f')}
      GROUP BY f.primary_naics_description
    `),
    key
      ? db.execute(sql`
          SELECT s.industry_code, s.year, s.establishments, s.employment, s.avg_annual_pay, s.source, s.source_url
          FROM industry_stats s
          WHERE s.state = ${key} AND s.year = (SELECT MAX(year) FROM industry_stats WHERE state = ${key})
        `)
      : Promise.resolve([]),
  ]);

  const plants = new Map<string | null, Row>();
  for (const row of rowsOf(plantRows)) plants.set(text(row.name), row);
  const stats = new Map<string, Row>();
  for (const row of rowsOf(statRows)) stats.set(String(row.industry_code), row);

  const industries = INDUSTRIES.map((industry) => {
    const listed = plants.get(industry.name);
    const official = statsOf(stats.get(industry.code));
    return {
      slug: industry.slug,
      code: industry.code,
      name: industry.name,
      plants: int(listed?.plants),
      employment: official?.employment ?? null,
      establishments: official?.establishments ?? null,
    };
  })
    .filter((industry) => industry.plants > 0 || industry.employment !== null || industry.establishments !== null)
    .sort(
      (a, b) =>
        (b.employment ?? -1) - (a.employment ?? -1) || b.plants - a.plants || a.name.localeCompare(b.name)
    );

  return {
    place: placeOut(place),
    // Every plant listed in the place, whether or not its industry is known.
    plants: rowsOf(plantRows).reduce((sum, row) => sum + int(row.plants), 0),
    manufacturing: statsOf(stats.get(MANUFACTURING_CODE)),
    industries,
  };
}

/** Words in an industry's sentence that say nothing about which industry it is. */
const PLAIN_WORDS = new Set(['plants', 'plant', 'make', 'makes', 'that', 'turn', 'into', 'other', 'products', 'goods', 'from', 'them', 'work', 'shops', 'mills', 'parts']);

/**
 * Industries a search term names, best first: by the name it goes by on
 * screen ("chem" finds Chemicals), by its NAICS code or full title, and then
 * by what it makes ("cement", "semiconductors"), read from the sentence in
 * industry_profiles. What it makes is matched from the start of a word, four
 * letters or more, so "ants" does not find every sentence with "plants" in it.
 */
export async function searchIndustries(query: string, limit: number) {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  // Search must not fail for want of the sentences: without them an industry is still found by name.
  const profiles = rowsOf(await db.execute(sql`SELECT code, summary FROM industry_profiles`).catch(() => []));
  const summaries = new Map(profiles.map((row) => [String(row.code), text(row.summary)]));
  const scored: { slug: string; name: string; summary: string | null; score: number }[] = [];
  for (const industry of INDUSTRIES) {
    const name = industryLabel(industry.name);
    const label = name.toLowerCase();
    const summary = summaries.get(industry.code) ?? null;
    const words = (summary ?? '').toLowerCase().split(/[^a-z]+/).filter((word) => word && !PLAIN_WORDS.has(word));
    const score =
      label === term || industry.name.toLowerCase() === term || industry.code === term
        ? 0
        : label.startsWith(term)
          ? 1
          : label.split(/[^a-z]+/).some((word) => word.startsWith(term))
            ? 2
            : term.length >= 3 && label.includes(term)
              ? 3
              : term.length >= 4 && words.some((word) => word.startsWith(term))
                ? 4
                : -1;
    if (score >= 0) scored.push({ slug: industry.slug, name, summary, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, limit);
}
