import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { factoryInArea, factoryInScope } from './scope.js';
import type { FocusArea } from '../../shared/scope.js';
import { INDUSTRIES, MANUFACTURING_CODE, industryLabel } from '../../shared/industry.js';
import { int, rowsOf, text, type Row } from './rows.js';
import { jobIsOpen } from './openJobs.js';

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

/** A figure that may be unknown: null stays null, and so does a zero nobody would state. */
export const known = (value: unknown): number | null => (value === null || value === undefined || Number(value) <= 0 ? null : Number(value));

export type Place =
  | { kind: 'country'; name: string }
  | { kind: 'state'; code: string; name: string }
  | { kind: 'area'; id: string; name: string; area: FocusArea };

/** The 21 names as one SQL list (`x IN (${INDUSTRY_NAME_LIST})`). They are constants of the product, written into the statement. */
export const INDUSTRY_NAME_LIST = sql.raw(INDUSTRIES.map((industry) => `'${industry.name.replace(/'/g, "''")}'`).join(', '));

/** A plant's industry counts toward its company's only when it is one of the 21. */
const countedIndustry = (factoryTable: string): SQL =>
  sql`${sql.identifier(factoryTable)}.primary_naics_description IN (${INDUSTRY_NAME_LIST})`;

/**
 * A company's industry, as an expression for one company row: the industry
 * most of its plants are in, by the name a plant carries. Null when none of
 * its plants carries one of the 21. A tie goes to the name that sorts first,
 * as `leadingIndustry` in shared/industry.ts breaks it. The free text in
 * companies.industry is never read for this.
 */
export function companyIndustry(companyId: SQL): SQL<string | null> {
  return sql<string | null>`(
    SELECT mode() WITHIN GROUP (ORDER BY ci_f.primary_naics_description COLLATE "C")
    FROM factories ci_f
    WHERE ci_f.company_id = ${companyId} AND ${countedIndustry('ci_f')} AND ${factoryInScope('ci_f')}
  )`;
}

/**
 * Every company's industry in one pass over the plants: rows of
 * (company_id, industry). For a filter or a list of the industries in use,
 * where asking company by company would read the plants 28,000 times.
 */
export function companyIndustries(): SQL {
  return sql`
    SELECT ci_f.company_id, mode() WITHIN GROUP (ORDER BY ci_f.primary_naics_description COLLATE "C") AS industry
    FROM factories ci_f
    WHERE ci_f.company_id IS NOT NULL AND ${countedIndustry('ci_f')} AND ${factoryInScope('ci_f')}
    GROUP BY ci_f.company_id`;
}

/**
 * The one order a list of companies is shown in, wherever one is listed (the
 * map's panels, Explore's Companies list and overview, an industry's page,
 * and what settles equal matches in search): the company with the most
 * people first, then the most open jobs, then the most factories, then by
 * name. All three are counted over the same set of factories: the place or
 * industry the list is of, or every factory the company has.
 *
 * `companyStandings` is the figures, as rows of (company_id, factories,
 * counted, people, open_jobs): `people` is the sum of the headcounts recorded
 * at the company's factories in the set and null when none is recorded, never
 * zero; `counted` is how many of the factories it is summed over. `inSet`
 * narrows the factories and is given the name the factories table goes by;
 * `of` reads one company's row, for a LATERAL join over a few companies in
 * place of one pass over every factory. `byCompanyStanding` is the order,
 * given the name the figures go by in the query and the company's name.
 */
export function companyStandings({ inSet, of }: { inSet?: (factoryTable: string) => SQL; of?: SQL } = {}): SQL {
  // Open jobs by factory: looked up factory by factory for one company, counted once for all of them.
  const openJobs = of
    ? sql`(SELECT COUNT(*) FROM jobs cs_j WHERE cs_j.factory_id = cs_f.id AND ${jobIsOpen('cs_j')})`
    : sql`cs_open.n`;
  const openJobsJoin = of
    ? sql``
    : sql`LEFT JOIN (SELECT cs_j.factory_id, COUNT(*) AS n FROM jobs cs_j WHERE ${jobIsOpen('cs_j')} GROUP BY cs_j.factory_id) cs_open ON cs_open.factory_id = cs_f.id`;
  return sql`
    SELECT cs_f.company_id,
           COUNT(*)::int AS factories,
           COUNT(*) FILTER (WHERE cs_f.workforce_size > 0)::int AS counted,
           SUM(cs_f.workforce_size) FILTER (WHERE cs_f.workforce_size > 0)::int AS people,
           COALESCE(SUM(${openJobs}), 0)::int AS open_jobs
    FROM factories cs_f
    ${openJobsJoin}
    WHERE ${of ? sql`cs_f.company_id = ${of}` : sql`cs_f.company_id IS NOT NULL`}
      AND ${inSet ? inSet('cs_f') : sql`TRUE`} AND ${factoryInScope('cs_f')}
    GROUP BY cs_f.company_id`;
}

export function byCompanyStanding(standing: string, companyName: SQL): SQL {
  const s = sql.identifier(standing);
  return sql`${s}.people DESC NULLS LAST, COALESCE(${s}.open_jobs, 0) DESC, COALESCE(${s}.factories, 0) DESC, ${companyName} ASC`;
}

/** A company's standing as the API says it, from a row that carries the figures: an unknown headcount is null. */
export const standingOf = (row: Row) => ({
  people: known(row.people),
  openJobs: int(row.open_jobs),
  factories: int(row.factories),
});

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

/**
 * The county a plant stands in, with the official figures for manufacturing
 * as a whole there (industry_county_stats, the latest year). The county is
 * the one the plant's coordinates fall in (factories.county_fips, written by
 * scripts/geo/assign-keys.mjs). `county` is null for a plant that has not
 * been placed; `manufacturing` is null where nothing is published for the
 * county. Undefined when there is no such plant. These are figures about the
 * county, never about the plant.
 */
export async function plantCounty(factoryId: string) {
  const [row] = rowsOf(
    await db.execute(sql`
      SELECT c.fips, c.name, c.state, m.code AS metro_code, m.name AS metro_name, m.kind AS metro_kind,
             s.year, s.establishments, s.employment, s.avg_annual_pay, s.source, s.source_url
      FROM factories f
      LEFT JOIN counties c ON c.fips = f.county_fips
      LEFT JOIN metros m ON m.code = c.cbsa_code
      LEFT JOIN industry_county_stats s
        ON s.county_fips = c.fips AND s.industry_code = ${MANUFACTURING_CODE}
       AND s.year = (SELECT MAX(year) FROM industry_county_stats WHERE county_fips = c.fips AND industry_code = ${MANUFACTURING_CODE})
      WHERE f.id = ${factoryId} AND ${factoryInScope('f')}
    `)
  );
  if (!row) return undefined;
  if (!text(row.fips)) return { county: null, metro: null, manufacturing: null };
  return {
    county: { fips: String(row.fips), name: String(row.name), state: String(row.state) },
    metro: text(row.metro_code) ? { code: String(row.metro_code), name: String(row.metro_name), kind: String(row.metro_kind) } : null,
    manufacturing: row.year === null || row.year === undefined ? null : statsOf(row),
  };
}

/** Words in an industry's sentence that say nothing about which industry it is. */
const PLAIN_WORDS = new Set(['factories', 'factory', 'plants', 'plant', 'make', 'makes', 'that', 'turn', 'into', 'other', 'products', 'goods', 'from', 'them', 'work', 'shops', 'mills', 'parts']);

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
