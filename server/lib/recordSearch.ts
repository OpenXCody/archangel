import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import type { RecordKind } from './records.js';
import { rowsOf } from './rows.js';
import { containing, likeLiteral } from './like.js';

/**
 * Finding records for Admin Tools: by search, and the ones a name comes close
 * to, so a duplicate is seen before it is made.
 */

export interface FoundRecord {
  id: string;
  name: string;
  /** One line that tells it from its neighbours: a domain and plant count, a place, a category. */
  detail: string | null;
  href: string;
}

/** "3 factories", "1 skill". */
function counted(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function found(kind: RecordKind, row: Record<string, unknown>): FoundRecord {
  const id = String(row.id);
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  if (kind === 'company') {
    const detail = [text(row.domain), counted(Number(row.plants) || 0, 'factory', 'factories')].filter(Boolean).join(' · ');
    return { id, name: String(row.name), detail, href: `/companies/${text(row.slug) ?? id}` };
  }
  if (kind === 'factory') {
    const place = [text(row.city), text(row.state)].filter(Boolean).join(', ');
    return { id, name: String(row.name), detail: [text(row.company), place].filter(Boolean).join(' · ') || null, href: `/factories/${id}` };
  }
  if (kind === 'career') {
    const skillsOnPath = Number(row.skills) || 0;
    const detail = skillsOnPath > 0 ? `${counted(skillsOnPath, 'skill', 'skills')}${text(row.path_status) ? `, ${text(row.path_status)}` : ''}` : 'No path';
    return { id, name: String(row.name), detail, href: `/occupations/${id}` };
  }
  return { id, name: String(row.name), detail: text(row.category), href: `/skills/${id}` };
}

/** What each kind's search and near-match queries select, from the table aliased `r`. */
const FOUND_COLUMNS: Record<RecordKind, SQL> = {
  company: sql`r.id, r.name, r.slug, r.domain, (SELECT COUNT(*)::int FROM factories f WHERE f.company_id = r.id) AS plants`,
  factory: sql`r.id, r.name, r.city, r.state, (SELECT c.name FROM companies c WHERE c.id = r.company_id) AS company`,
  career: sql`r.id, r.title AS name, r.path_status, (SELECT COUNT(*)::int FROM occupation_skills os WHERE os.occupation_id = r.id) AS skills`,
  skill: sql`r.id, r.name, r.category`,
};
const FOUND_TABLE: Record<RecordKind, SQL> = {
  company: sql`companies r`,
  factory: sql`factories r`,
  career: sql`occupations r`,
  skill: sql`skills r`,
};
const FOUND_NAME: Record<RecordKind, SQL> = { company: sql`r.name`, factory: sql`r.name`, career: sql`r.title`, skill: sql`r.name` };

/** Whether a record is also known by exactly this name. */
function aliasIs(kind: RecordKind, term: string): SQL {
  if (kind === 'company') return sql`EXISTS (SELECT 1 FROM unnest(COALESCE(r.aliases, '{}')) a WHERE lower(a) = lower(${term}))`;
  if (kind === 'career') return sql`EXISTS (SELECT 1 FROM occupation_aliases a WHERE a.canonical_occupation_id = r.id AND lower(a.alias_text) = lower(${term}))`;
  if (kind === 'skill') return sql`EXISTS (SELECT 1 FROM skill_aliases a WHERE a.canonical_skill_id = r.id AND lower(a.alias_text) = lower(${term}))`;
  return sql`false`;
}

/** Records of one kind whose name, or other name, contains the term. Names that start with it come first. */
export async function searchRecords(kind: RecordKind, term: string, limit = 8): Promise<FoundRecord[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const contains = containing(q);
  const alias =
    kind === 'company'
      ? sql`EXISTS (SELECT 1 FROM unnest(COALESCE(r.aliases, '{}')) a WHERE a ILIKE ${contains})`
      : kind === 'career'
        ? sql`EXISTS (SELECT 1 FROM occupation_aliases a WHERE a.canonical_occupation_id = r.id AND a.alias_text ILIKE ${contains})`
        : kind === 'skill'
          ? sql`EXISTS (SELECT 1 FROM skill_aliases a WHERE a.canonical_skill_id = r.id AND a.alias_text ILIKE ${contains})`
          : sql`false`;
  const rows = rowsOf(
    await db.execute(sql`
      SELECT ${FOUND_COLUMNS[kind]}
      FROM ${FOUND_TABLE[kind]}
      WHERE ${FOUND_NAME[kind]} ILIKE ${contains} OR ${alias}
      ORDER BY (lower(${FOUND_NAME[kind]}) = lower(${q})) DESC, (${FOUND_NAME[kind]} ILIKE ${`${likeLiteral(q)}%`}) DESC, ${FOUND_NAME[kind]} ASC, r.id
      LIMIT ${limit}
    `)
  );
  return rows.map((row) => found(kind, row));
}

/** A name without case, punctuation or the endings companies carry ("Inc", "Corp", "LLC"). */
function plainName(column: SQL): SQL {
  return sql`btrim(regexp_replace(regexp_replace(regexp_replace(lower(${column}), '[^a-z0-9]+', ' ', 'g'), '\\m(the|inc|incorporated|corp|corporation|co|company|llc|ltd|lp|plc|holdings|group)\\M', ' ', 'g'), ' +', ' ', 'g'))`;
}

const NEAR = 0.5;
const NEAR_METRES = 150;

export interface SimilarQuery {
  name: string;
  /** A record to leave out: the one being edited. */
  excludeId?: string;
  /** Factories: the company the plant belongs to, and where it is. */
  companyId?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Records a name comes close to: the same name in another case or with
 * another ending, one it is also known by, or one that reads much the same.
 * For a factory: a like-named plant of the same company, or any plant within
 * 150 metres.
 */
export async function similarRecords(kind: RecordKind, query: SimilarQuery): Promise<FoundRecord[]> {
  const name = query.name.trim();
  if (name.length < 3 && kind !== 'factory') return [];
  const column = FOUND_NAME[kind];
  const score = sql`similarity(lower(${column}), lower(${name}))`;
  const exclude = query.excludeId ? sql`r.id <> ${query.excludeId}` : sql`true`;

  let where: SQL;
  if (kind === 'factory') {
    const tests: SQL[] = [];
    if (query.companyId && name.length >= 3) tests.push(sql`(r.company_id = ${query.companyId} AND ${score} >= ${NEAR})`);
    if (query.latitude !== undefined && query.longitude !== undefined) {
      const numeric = sql`'^-?[0-9]+([.][0-9]+)?$'`;
      // About 111 km per degree of latitude; longitude shrinks with the cosine.
      tests.push(sql`(r.latitude ~ ${numeric} AND r.longitude ~ ${numeric}
        AND abs(r.latitude::float8 - ${query.latitude}) < 0.01 AND abs(r.longitude::float8 - ${query.longitude}) < 0.01
        AND sqrt(power((r.latitude::float8 - ${query.latitude}) * 111320, 2) + power((r.longitude::float8 - ${query.longitude}) * 111320 * cos(radians(${query.latitude})), 2)) <= ${NEAR_METRES})`);
    }
    if (tests.length === 0) return [];
    where = sql`(${sql.join(tests, sql` OR `)})`;
  } else {
    const plain = kind === 'company' ? sql`OR ${plainName(column)} = ${plainName(sql`${name}`)}` : sql``;
    where = sql`(lower(${column}) = lower(${name}) OR ${score} >= ${NEAR} ${plain} OR ${aliasIs(kind, name)})`;
  }
  const rows = rowsOf(
    await db.execute(sql`
      SELECT ${FOUND_COLUMNS[kind]}
      FROM ${FOUND_TABLE[kind]}
      WHERE ${exclude} AND ${where}
      ORDER BY ${score} DESC, ${column} ASC
      LIMIT 5
    `)
  );
  return rows.map((row) => found(kind, row));
}
