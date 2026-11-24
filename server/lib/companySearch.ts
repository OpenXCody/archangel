import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { browsableCompanyNameSql } from './companyFilters.js';
import { companyInScope, factoryInScope } from './scope.js';
import { byCompanyStanding, companyStandings } from './industries.js';
import { rowsOf } from './rows.js';
import { likeLiteral } from './like.js';

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

export interface FoundCompany {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  factoryCount: number;
  /** People at its factories where a headcount is recorded (null when none is), and its open jobs. */
  people: number | null;
  openJobs: number;
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
  people: number | null;
  open_jobs: number | null;
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
  const like = likeLiteral(core);
  // Each name read as the term is: see the note at the top of the file.
  const norm = sql`btrim(regexp_replace(replace(lower(c.name), '&', ' and '), '[^a-z0-9]+', ' ', 'g'))`;
  const coreOf = sql`regexp_replace(n.norm, ${`( (${LEGAL_FORMS}))+$`}, '')`;
  // The first letter of each word that carries weight: "johnson and johnson" is "jj".
  const initialsOf = sql`regexp_replace(regexp_replace(k.core, '\\m(and|of|the)\\M ?', '', 'g'), '\\m([a-z0-9])[a-z0-9]* ?', '\\1', 'g')`;
  const everyWord: SQL = sql.join(
    term.words.slice(0, 6).map((word) => sql`(' ' || k.core) LIKE ${`% ${likeLiteral(word)}%`}`),
    sql` AND `
  );

  // Reading a name is slow work across tens of thousands of companies, so it
  // is done only for `candidates`: a cheap test on the name as stored, served
  // by its trigram index, that every company that can match passes. Each
  // candidate is then read once (MATERIALIZED): left to itself the planner
  // would repeat the reading for every test below.
  const keyedFrom = (candidates: SQL) => sql`
    WITH named AS MATERIALIZED (
      SELECT c.id, c.name, c.slug, c.industry, c.featured, ${norm} AS norm
        FROM companies c
       WHERE (${candidates}) AND ${sql.raw(browsableCompanyNameSql('c.name'))} AND c.service IS NULL AND ${companyInScope('c')}
    ), keyed AS MATERIALIZED (
      SELECT n.*, ${coreOf} AS core FROM named n
    )`;
  const nameHas = (word: string): SQL => sql`c.name ILIKE ${`%${likeLiteral(word)}%`}`;
  // A name that matches the term has each of its words somewhere in it; one
  // that has the term as its initials starts with the same letter.
  const hasEveryWord = sql.join(term.words.slice(0, 6).map(nameHas), sql` AND `);
  const couldMatch =
    term.initials === null ? hasEveryWord : sql`(${hasEveryWord}) OR lower(c.name) LIKE ${`${likeLiteral(term.initials.charAt(0))}%`}`;
  // A near miss shares enough trigrams with the term, or holds one of its longer words whole.
  const longWords = term.words.filter((word) => word.length >= 4).slice(0, 6);
  const couldBeNear = sql.join([sql`c.name % ${core}`, sql`c.name %> ${core}`, ...longWords.map(nameHas)], sql` OR `);
  // Plants are counted for the companies that matched, and where they are is
  // looked up for the few that are returned.
  const withPlaces = (candidates: SQL, matched: SQL, order: SQL) => sql`
    ${keyedFrom(candidates)}, matched AS MATERIALIZED (${matched}),
    counted AS (
      SELECT m.*, COUNT(*) OVER ()::int AS total,
             COALESCE(cs.factories, 0) AS factory_count, cs.factories, cs.people, cs.open_jobs
        FROM matched m
        LEFT JOIN LATERAL (${companyStandings({ of: sql`m.id` })}) cs ON TRUE
    ), shown AS (
      SELECT * FROM counted m ORDER BY ${order} LIMIT ${limit}
    )
    SELECT m.id, m.name, m.slug, m.industry, m.total, m.factory_count, m.people, m.open_jobs,
           (SELECT f.city FROM factories f WHERE f.company_id = m.id AND ${factoryInScope('f')} ORDER BY f.id LIMIT 1) AS city,
           (SELECT array_agg(s.state ORDER BY s.n DESC, s.state)
              FROM (SELECT f.state, COUNT(*) AS n FROM factories f
                     WHERE f.company_id = m.id AND ${factoryInScope('f')} AND f.state ~ '^[A-Z]{2}$'
                     GROUP BY f.state) s) AS states
      FROM shown m
     ORDER BY ${order}`;

  const ranked = sql`
    SELECT * FROM (
      SELECT k.*, CASE
               WHEN k.core = ${core} OR k.norm = ${core} THEN 0
               WHEN k.core LIKE ${`${like}%`} THEN 1
               ${term.initials === null ? sql`` : sql`WHEN ${initialsOf} = ${term.initials} THEN 1`}
               WHEN (' ' || k.core) LIKE ${`% ${like}%`} THEN 2
               WHEN ${everyWord} THEN 3
               ${core.length < 4 ? sql`` : sql`WHEN k.core LIKE ${`%${like}%`} THEN 4`}
             END AS rank
        FROM keyed k
    ) r
    WHERE r.rank IS NOT NULL`;
  const found = rowsOf<Row>(
    await db.execute(withPlaces(couldMatch, ranked, sql`m.rank, ${byCompanyStanding('m', sql`m.name`)}`))
  );
  if (found.length > 0) {
    return { companies: found.map(toCompany), total: found[0].total, close: false };
  }

  // Nothing matched. The closest names: the whole name against the term, the
  // term inside the name ("atlantik"), or the name inside the term ("tesla motors").
  const near = sql`
    SELECT * FROM (
      SELECT k.*, GREATEST(
               similarity(k.core, ${core}),
               word_similarity(${core}, k.core),
               CASE WHEN length(k.core) >= 4 THEN word_similarity(k.core, ${core}) * 0.9 ELSE 0 END
             ) AS sim
        FROM keyed k
    ) s
    WHERE s.sim >= ${CLOSE_ENOUGH}
    ORDER BY s.sim DESC, s.featured DESC, length(s.name), s.name
    LIMIT 3`;
  try {
    const close = rowsOf<Row>(await db.execute(withPlaces(couldBeNear, near, sql`m.sim DESC, ${byCompanyStanding('m', sql`m.name`)}`)));
    return { companies: close.map(toCompany), total: close.length, close: close.length > 0 };
  } catch (error) {
    // The closest names need the pg_trgm extension. Without it the answer is
    // the plain one: nothing matched.
    console.error(`company search: closest names failed (${error instanceof Error ? error.name : 'error'})`);
    return { companies: [], total: 0, close: false };
  }
}

function toCompany(row: Row): FoundCompany {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    industry: row.industry,
    factoryCount: row.factory_count,
    people: row.people === null || Number(row.people) <= 0 ? null : Number(row.people),
    openJobs: Number(row.open_jobs) || 0,
    where: whereOf(row),
  };
}
