import { sql, type SQL } from 'drizzle-orm';

/**
 * Finding a career by the words a plant uses for it.
 *
 * Titles, the other names a career goes by (`occupation_aliases`) and the
 * term are all read the same way: lower case, "&" as "and", punctuation and
 * runs of spaces as one space. A career matches when
 * - its title contains the term, or has every word of the term at the start
 *   of one of its words, in any order ("maint tech", "technician
 *   maintenance", "welders");
 * - one of its other names is the term, starts with it, or has every word of
 *   it ("QA", "production associate");
 * - for a term of four letters or more, its description mentions the term.
 * One or two letters only ever mean the start of a word, or a whole name.
 *
 * The route tries the term as typed, then without the words that say a level
 * or a shift ("welder II", "2nd shift machinist"), then the closest titles by
 * trigram similarity ("machinst").
 *
 * The SQL here names the `occupations` table in full, so it only works in a
 * query that selects from it without an alias.
 */

/** The text of a title or a name, as it is compared. */
const read = (column: string): SQL =>
  sql.raw(`btrim(regexp_replace(replace(lower(${column}), '&', ' and '), '[^a-z0-9]+', ' ', 'g'))`);
const TITLE = read('occupations.title');
const ALIAS = read('a.alias_text');

/** Read what a person typed the way titles are read. Empty when there is nothing to search for. */
export function readCareerTerm(raw: unknown): string {
  return String(raw ?? '')
    .slice(0, 80)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Words that say a level, a shift or the terms of a job, not the work. */
const LEVEL_WORDS = new Set([
  'i', 'ii', 'iii', 'iv', 'v', '1', '2', '3', '4', '5',
  'sr', 'jr', 'senior', 'junior', 'lead', 'level', 'entry', 'apprentice', 'journeyman', 'trainee',
  '1st', '2nd', '3rd', 'first', 'second', 'third', 'shift', 'night', 'nights', 'day', 'days', 'weekend', 'weekends',
  'temp', 'temporary', 'full', 'part', 'time',
]);

/** The term without its level and shift words, or null when that changes nothing or leaves nothing. */
export function withoutLevel(term: string): string | null {
  const kept = term.split(' ').filter((word) => !LEVEL_WORDS.has(word));
  const text = kept.join(' ');
  return text && text !== term ? text : null;
}

/** A term with its own LIKE wildcards made literal. (A read term has none; this guards the callers that pass other text.) */
function literal(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

/** A plural matches its singular: "welders" is looked for as "welder". */
function stem(word: string): string {
  return word.length >= 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

export interface CareerMatch {
  /** Which careers match. */
  where: SQL;
  /** How well, lower first. */
  relevance: SQL;
}

/** The careers that match a read term, and how well each does. */
export function careerMatch(term: string): CareerMatch {
  const like = literal(term);
  const words = term.split(' ').slice(0, 6).map(stem).map(literal);
  const short = term.length <= 2;
  const everyWord = (text: SQL): SQL =>
    sql.join(
      words.map((word) => sql`(' ' || ${text}) LIKE ${`% ${word}%`}`),
      sql` AND `
    );
  // The words in the order typed, each the start of the next word of the title.
  const inOrder = `${words.join('% ')}%`;

  const titleMatches = short
    ? sql`(${TITLE} = ${term} OR ${TITLE} LIKE ${`${like}%`} OR ${TITLE} LIKE ${`% ${like}%`})`
    : sql`(${TITLE} LIKE ${`%${like}%`} OR (${everyWord(TITLE)}))`;
  const aliasMatches = short
    ? sql`${ALIAS} = ${term}`
    : sql`(${ALIAS} = ${term} OR ${ALIAS} LIKE ${`${like}%`} OR (${everyWord(ALIAS)}))`;
  const byAlias = sql`EXISTS (SELECT 1 FROM occupation_aliases a WHERE a.canonical_occupation_id = occupations.id AND ${aliasMatches})`;
  // A short term is found inside unrelated words ("hr" in "chromate").
  const byDescription = term.length >= 4 ? sql` OR occupations.description ILIKE ${`%${like}%`}` : sql``;

  // 0 the title itself, 5 another name for it, 8 the title starts with the
  // term as whole words, 10 the title has it as whole words ("mechanic" is
  // "Aircraft Mechanic" before "Mechanical Engineer"), 12 the title starts
  // with it, 15 its words start the title's words in order, 20 a word of the
  // title starts with it, 22 another name starts with it, 25 every word in
  // any order, 27 the same in another name, 30 the title contains it, 40 only
  // the description mentions it.
  const relevance = sql`LEAST(
    CASE
      WHEN ${TITLE} = ${term} THEN 0
      WHEN ${TITLE} LIKE ${`${like} %`} THEN 8
      WHEN (' ' || ${TITLE} || ' ') LIKE ${`% ${like} %`} THEN 10
      WHEN ${TITLE} LIKE ${`${like}%`} THEN 12
      WHEN ${TITLE} LIKE ${inOrder} THEN 15
      WHEN (' ' || ${TITLE}) LIKE ${`% ${like}%`} THEN 20
      WHEN ${everyWord(TITLE)} THEN 25
      WHEN ${short ? sql`FALSE` : sql`${TITLE} LIKE ${`%${like}%`}`} THEN 30
      ELSE 40
    END,
    COALESCE((
      SELECT MIN(CASE WHEN ${ALIAS} = ${term} THEN 5 WHEN ${ALIAS} LIKE ${`${like}%`} THEN 22 ELSE 27 END)
        FROM occupation_aliases a
       WHERE a.canonical_occupation_id = occupations.id AND ${aliasMatches}
    ), 40)
  )`;

  return { where: sql`(${titleMatches} OR ${byAlias}${byDescription})`, relevance };
}

/** How close a title must be to count as a near miss. */
const CLOSE_ENOUGH = 0.55;

/** The careers whose title, or another name, is nearly the term: a wrong or missing letter. */
export function careerNearMiss(term: string): CareerMatch {
  const closeness = sql`GREATEST(
    similarity(${TITLE}, ${term}),
    word_similarity(${term}, ${TITLE}),
    COALESCE((SELECT MAX(similarity(${ALIAS}, ${term})) FROM occupation_aliases a WHERE a.canonical_occupation_id = occupations.id), 0)
  )`;
  return { where: sql`${closeness} >= ${CLOSE_ENOUGH}`, relevance: sql`(1 - ${closeness})` };
}
