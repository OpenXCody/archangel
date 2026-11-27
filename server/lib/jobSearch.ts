import { sql, type SQL } from 'drizzle-orm';
import { US_STATES } from '../../shared/states.js';
import { containing } from './like.js';

/**
 * Narrowing the open jobs list: by what a person typed, and by distance from
 * a place.
 */

/** Words that say "I am looking for a job" and nothing about which. */
const NOISE = new Set(['job', 'jobs', 'work', 'in', 'near', 'at', 'the', 'a', 'an', 'for', 'and', 'of']);
const MAX_WORDS = 6;

const STATE_BY_NAME = new Map(US_STATES.map((state) => [state.name.toLowerCase(), state.code]));

/** "welding" and "welders" both find "Welder": the end of a longer word is dropped. */
function stem(word: string): string {
  for (const ending of ['ing', 'ers', 'er', 's']) {
    if (word.endsWith(ending) && word.length - ending.length >= 4) return word.slice(0, -ending.length);
  }
  return word;
}

/**
 * What was typed, as a condition on the jobs list. Every word must be found
 * somewhere in the job: its title, its company, its career, its shift, or the
 * city or state of its factory. Null when nothing usable was typed.
 *
 * A job from a careers site is named for its career, and the title its
 * employer posted it under is kept beside it (`jobs.posted_as`, migration
 * 0088): a word the employer wrote ("nuclear", "Starship", "senior", a
 * requisition number) still finds the job. It is matched here and nowhere
 * given: a row says the opening's own name, read from it (`ownName`,
 * server/lib/jobRows.ts), which shows most of the words it was found by.
 *
 * The condition names the tables as the list query joins them: jobs,
 * companies, occupations, factories.
 */
export function jobTextFilter(raw: unknown): SQL | null {
  return typedCondition(raw, true);
}

/**
 * For the order of a list narrowed by what was typed: 0 for a job whose
 * standard name, company, career, shift or place says every typed word, 1 for
 * one found only by the title its employer posted it under (the row's own name
 * usually says the word; a requisition number or a note it cut is said nowhere).
 * The jobs that are what was typed come first ("welder" lists welders before
 * a quality engineer posted under "... - Weld"). Null when
 * nothing usable was typed. It is a function of the row alone, so a page of
 * the list still never repeats or skips a job.
 */
export function jobTextRank(raw: unknown): SQL | null {
  const shown = typedCondition(raw, false);
  return shown ? sql`(CASE WHEN ${shown} THEN 0 ELSE 1 END)` : null;
}

/** Every typed word found in the job: in what its row says, and, with `posted`, in the title it was posted under. */
function typedCondition(raw: unknown, posted: boolean): SQL | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().toLowerCase().slice(0, 80);
  if (!text) return null;
  // A state named in full ("new york") is taken out whole, before the words are split.
  const states: string[] = [];
  let rest = text;
  for (const [name, code] of STATE_BY_NAME) {
    const found = new RegExp(`(^|\\s)${name}(\\s|$)`).exec(rest);
    if (found) {
      states.push(code);
      rest = `${rest.slice(0, found.index)} ${rest.slice(found.index + found[0].length)}`;
    }
  }
  const typed = rest.split(/[\s,]+/).filter(Boolean);
  const words = typed.filter((word) => !NOISE.has(word)).slice(0, MAX_WORDS);
  // Only noise ("jobs") is no filter at all, unless that is all there was to go on.
  if (words.length === 0 && states.length === 0) {
    if (typed.length === 0) return null;
    words.push(...typed.slice(0, MAX_WORDS));
  }

  const parts: SQL[] = states.map((code) => sql`factories.state = ${code}`);
  for (const word of words) {
    const like = containing(stem(word));
    const shown = sql`jobs.title ILIKE ${like} OR companies.name ILIKE ${like} OR occupations.title ILIKE ${like}
      OR factories.city ILIKE ${like} OR jobs.shift ILIKE ${like}`;
    parts.push(posted ? sql`(${shown} OR jobs.posted_as ILIKE ${like})` : sql`(${shown})`);
  }
  return sql.join(parts, sql` AND `);
}

export interface Near {
  lat: number;
  lng: number;
  /** Miles. */
  within: number;
}

const DEFAULT_WITHIN_MILES = 50;
const MAX_WITHIN_MILES = 500;

/**
 * `?near=<lat>,<lng>&within=<miles>`. Null when no place was given;
 * 'invalid' when what was given is not a point on the earth.
 */
export function readNear(near: unknown, within: unknown): Near | null | 'invalid' {
  if (near === undefined || near === '') return null;
  if (typeof near !== 'string') return 'invalid';
  const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(near);
  if (!match) return 'invalid';
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return 'invalid';
  let miles = DEFAULT_WITHIN_MILES;
  if (within !== undefined && within !== '') {
    miles = typeof within === 'string' ? Number(within) : NaN;
    if (!Number.isFinite(miles) || miles <= 0) return 'invalid';
    miles = Math.min(miles, MAX_WITHIN_MILES);
  }
  return { lat, lng, within: miles };
}

/**
 * Miles from a point to the job's factory, to one decimal place; NULL when the
 * factory's coordinates are not usable (they are stored as text). Great-circle
 * distance, the same sum as `milesBetween` in shared/scope.ts.
 */
export function milesFromFactory({ lat, lng }: Pick<Near, 'lat' | 'lng'>): SQL<number | null> {
  return sql<number | null>`(CASE
    WHEN factories.latitude ~ '^-?[0-9]+(\\.[0-9]+)?$' AND factories.longitude ~ '^-?[0-9]+(\\.[0-9]+)?$'
    THEN round((3958.8 * 2 * asin(sqrt(least(1.0,
      power(sin(radians(factories.latitude::float8 - ${lat}) / 2), 2)
      + cos(radians(${lat})) * cos(radians(factories.latitude::float8))
        * power(sin(radians(factories.longitude::float8 - ${lng}) / 2), 2)
    ))))::numeric, 1)::float8
  END)`;
}
