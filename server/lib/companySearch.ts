import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { browsableCompanyNameSql } from './companyFilters.js';
import { companyInScope, factoryInScope } from './scope.js';

/**
 * Finding one company by its name, as a person types it.
 *
 * The name and the term are read the same way: lower case, "&" as "and",
 * punctuation and runs of spaces as one space, and the legal form at the end
 * (Inc, Corp, LLC) left out. So "Atlantic  Precision", "atlantic precision
 * tools inc" and "Johnson and Johnson" all find the company they mean.
 *
 * A name match is ranked: the name itself; a name that starts with the term,
 * or has it as its initials ("J&J", "GM"); a word in the name that starts
 * with it; every word of the term in any order; then, for a term of four
 * letters or more, the term anywhere in the name (three letters are found
 * inside unrelated words). Industry and description are not searched: this is
 * a search for one company, not for a kind of company.
 *
 * When nothing matches, the closest names by trigram similarity come back
 * instead and the answer says so (`close`): a wrong letter still finds the
 * company ("caterpiller"), and so does a name it no longer goes by
 * ("Tesla Motors").
 */

/** Legal forms at the end of a name, which people leave off or get wrong. */
const LEGAL_FORMS = 'inc|incorporated|corp|corporation|co|company|llc|ltd|limited|lp|plc';
const LEGAL_TAIL = new RegExp(`( (${LEGAL_FORMS}))+$`);
/** Words that carry no weight in a name. */
const FILLER = new Set(['and', 'the', 'of']);

/** How close a name must be to count as a near miss. */
const CLOSE_ENOUGH = 0.5;

export interface CompanyTerm {
  /** The term as names are compared: "johnson and johnson". */
  core: string;
  /** Its words, without "and", "the" and "of". */
  words: string[];
  /** Its letters and digits alone when it could be initials ("jj", "gm"); otherwise null. */
  initials: string | null;
}

/** Read what a person typed the way company names are read. Null when there is nothing to search for. */
export function readCompanyTerm(raw: unknown): CompanyTerm | null {
  if (typeof raw !== 'string') return null;
  const spaced = raw
    .slice(0, 100)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const core = spaced.replace(LEGAL_TAIL, '') || spaced;
  if (core.length < 2) return null;
  const words = core.split(' ').filter((word) => !FILLER.has(word));
  // "J&J", "GM", "3M": a short term written without spaces between its letters.
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const initials = compact.length >= 2 && compact.length <= 6 && !/\s/.test(raw.trim()) ? compact : null;
  return { core, words: words.length > 0 ? words : core.split(' '), initials };
}

/** A term with its own LIKE wildcards made literal. */
function literal(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

export interface FoundCompany {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  factoryCount: number;
  /** Where its plants are: "Austin, TX" for one, the states with the most for several. */
  where: string | null;
}

export interface CompanySearchResult {
  companies: FoundCompany[];
  /** How many companies match, not only the ones returned. */
  total: number;
  /** True when no name matched and these are the closest names instead. */
  close: boolean;
}

interface Row {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  factory_count: number;
  city: string | null;
  states: string[] | null;
  total: number;
}

function whereOf(row: Row): string | null {
  const states = row.states ?? [];
  if (row.factory_count === 1) return [row.city, states[0]].filter(Boolean).join(', ') || null;
  if (states.length === 0) return null;
  const shown = states.slice(0, 3).join(', ');
  const more = states.length - 3;
  return more > 0 ? `${shown} and ${more} more ${more === 1 ? 'state' : 'states'}` : shown;
}

/** Search companies by name. `limit` is how many to return; `total` counts them all. */
export async function searchCompanies(term: CompanyTerm, limit: number): Promise<CompanySearchResult> {
  const core = term.core;
  const like = literal(core);
  // Each name read as the term is: see the note at the top of the file.
  const norm = sql`btrim(regexp_replace(replace(lower(c.name), '&', ' and '), '[^a-z0-9]+', ' ', 'g'))`;
  const coreOf = sql`regexp_replace(n.norm, ${`( (${LEGAL_FORMS}))+$`}, '')`;
  // The first letter of each word that carries weight: "johnson and johnson" is "jj".
  const initialsOf = sql`regexp_replace(regexp_replace(k.core, '\\m(and|of|the)\\M ?', '', 'g'), '\\m([a-z0-9])[a-z0-9]* ?', '\\1', 'g')`;
  const everyWord: SQL = sql.join(
    term.words.slice(0, 6).map((word) => sql`(' ' || k.core) LIKE ${`% ${literal(word)}%`}`),
    sql` AND `
  );

  const keyed = sql`
    WITH named AS (
      SELECT c.id, c.name, c.slug, c.industry, c.featured, ${norm} AS norm
        FROM companies c
       WHERE ${sql.raw(browsableCompanyNameSql('c.name'))} AND ${companyInScope('c')}
    ), keyed AS (
      SELECT n.*, ${coreOf} AS core FROM named n
    )`;
  const withPlaces = (matched: SQL, order: SQL) => sql`
    ${keyed}, matched AS (${matched})
    SELECT m.id, m.name, m.slug, m.industry, m.total,
           (SELECT COUNT(*)::int FROM factories f WHERE f.company_id = m.id AND ${factoryInScope('f')}) AS factory_count,
           (SELECT f.city FROM factories f WHERE f.company_id = m.id AND ${factoryInScope('f')} ORDER BY f.id LIMIT 1) AS city,
           (SELECT array_agg(s.state ORDER BY s.n DESC, s.state)
              FROM (SELECT f.state, COUNT(*) AS n FROM factories f
                     WHERE f.company_id = m.id AND ${factoryInScope('f')} AND f.state ~ '^[A-Z]{2}$'
                     GROUP BY f.state) s) AS states
      FROM matched m
     ORDER BY ${order}`;

  const ranked = sql`
    SELECT r.*, COUNT(*) OVER ()::int AS total FROM (
      SELECT k.*, CASE
               WHEN k.core = ${core} OR k.norm = ${core} THEN 0
               WHEN k.core LIKE ${`${like}%`} THEN 1
               ${term.initials === null ? sql`` : sql`WHEN ${initialsOf} = ${term.initials} THEN 1`}
               WHEN (' ' || k.core) LIKE ${`% ${like}%`} THEN 2
               WHEN ${everyWord} THEN 3
               ${core.length < 4 ? sql`` : sql`WHEN k.core LIKE ${`%${like}%`} THEN 4`}
             END AS rank,
             (SELECT COUNT(*) FROM factories f WHERE f.company_id = k.id AND ${factoryInScope('f')}) AS plants
        FROM keyed k
    ) r
    WHERE r.rank IS NOT NULL
    ORDER BY r.rank, r.featured DESC, r.plants DESC, length(r.name), r.name
    LIMIT ${limit}`;
  const found = (await db.execute(
    withPlaces(ranked, sql`m.rank, m.featured DESC, m.plants DESC, length(m.name), m.name`)
  )) as unknown as Row[];
  if (found.length > 0) {
    return { companies: found.map(toCompany), total: found[0].total, close: false };
  }

  // Nothing matched. The closest names: the whole name against the term, the
  // term inside the name ("atlantik"), or the name inside the term ("tesla motors").
  const near = sql`
    SELECT s.*, COUNT(*) OVER ()::int AS total FROM (
      SELECT k.*, GREATEST(
               similarity(k.core, ${core}),
               word_similarity(${core}, k.core),
               CASE WHEN length(k.core) >= 4 THEN word_similarity(k.core, ${core}) * 0.9 ELSE 0 END
             ) AS sim
        FROM keyed k
    ) s
    WHERE s.sim >= ${CLOSE_ENOUGH}
    ORDER BY s.sim DESC, s.featured DESC, length(s.name), s.name
    LIMIT ${Math.min(limit, 3)}`;
  const close = (await db.execute(withPlaces(near, sql`m.sim DESC, m.featured DESC, length(m.name), m.name`))) as unknown as Row[];
  return { companies: close.map(toCompany), total: close[0]?.total ?? 0, close: close.length > 0 };
}

function toCompany(row: Row): FoundCompany {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    industry: row.industry,
    factoryCount: row.factory_count,
    where: whereOf(row),
  };
}
