import { asc, eq, sql } from 'drizzle-orm';
import { db, occupationLinks, occupations, skillDomains } from '../db/index.js';
import type { Executor } from './audit.js';
import { rowsOf } from './rows.js';

/**
 * What a career has beyond its path: a home (the domain most of its work is
 * in) and a place on a ladder (the careers it leads to, one step at a time).
 * Both are curated in data/careers/catalogue.json and loaded by a generated
 * migration (scripts/build-careers-sql.mjs); an admin corrects them through
 * lib/records.ts.
 */

/** A domain, by the two things a link and a label need. */
export interface CareerHome {
  slug: string;
  name: string;
}

/** A career on a ladder. */
export interface CareerRef {
  id: string;
  title: string;
}

/** The most careers one career leads to. The catalogue's builder holds the file to the same number. */
export const MAX_LEADS_TO = 3;

/** One fixed key for pg_advisory_xact_lock: two changes to the ladder take turns, so they cannot close it between them. */
export const LADDER_LOCK = 4127046;

/** The domain with this slug; null when there is none. */
export async function findDomain(executor: Executor, slug: unknown): Promise<CareerHome | null> {
  if (typeof slug !== 'string' || slug.length === 0 || slug.length > 120) return null;
  const [row] = await executor.select({ slug: skillDomains.slug, name: skillDomains.name }).from(skillDomains).where(eq(skillDomains.slug, slug)).limit(1);
  return row ?? null;
}

/** A row's home, nested as the API gives it. */
export function homeOf(row: { homeSlug: string | null; homeName: string | null }): CareerHome | null {
  return row.homeSlug && row.homeName ? { slug: row.homeSlug, name: row.homeName } : null;
}

/** The careers this one leads to, in the order they are kept. */
export async function leadsTo(executor: Executor, id: string): Promise<CareerRef[]> {
  return executor
    .select({ id: occupations.id, title: occupations.title })
    .from(occupationLinks)
    .innerJoin(occupations, eq(occupations.id, occupationLinks.toOccupationId))
    .where(eq(occupationLinks.fromOccupationId, id))
    .orderBy(asc(occupationLinks.position), asc(occupations.title));
}

/**
 * The careers that lead to this one: first those for which it is the first
 * next step, then the second, and so on; among equals, by title.
 */
export async function comesFrom(executor: Executor, id: string): Promise<CareerRef[]> {
  return executor
    .select({ id: occupations.id, title: occupations.title })
    .from(occupationLinks)
    .innerJoin(occupations, eq(occupations.id, occupationLinks.fromOccupationId))
    .where(eq(occupationLinks.toOccupationId, id))
    .orderBy(asc(occupationLinks.position), asc(occupations.title));
}

/**
 * The steps from one career to another along the ladder, as titles, or null
 * when the first never leads to the second. A link from B to A would close a
 * ladder on itself exactly when A already leads to B.
 */
export async function ladderFrom(executor: Executor, fromId: string, toId: string): Promise<string[] | null> {
  const [row] = rowsOf<{ trail: string[] }>(
    await executor.execute(sql`
      WITH RECURSIVE walk (node, trail, seen) AS (
        SELECT o.id, ARRAY[o.title], ARRAY[o.id] FROM occupations o WHERE o.id = ${fromId}
        UNION ALL
        SELECT t.id, w.trail || t.title, w.seen || t.id
        FROM walk w
        INNER JOIN occupation_links l ON l.from_occupation_id = w.node
        INNER JOIN occupations t ON t.id = l.to_occupation_id
        WHERE t.id <> ALL (w.seen) AND array_length(w.seen, 1) < 60
      )
      SELECT trail FROM walk WHERE node = ${toId} ORDER BY array_length(trail, 1) LIMIT 1
    `)
  );
  return row?.trail ?? null;
}

/**
 * Sets the careers one career leads to, in the order given. The caller has
 * checked the list: each a career, none the career itself, none twice, and
 * no ladder closed on itself.
 */
export async function setLeadsTo(executor: Executor, id: string, wanted: string[]): Promise<void> {
  await executor.delete(occupationLinks).where(eq(occupationLinks.fromOccupationId, id));
  if (wanted.length > 0) {
    await executor.insert(occupationLinks).values(wanted.map((toOccupationId, index) => ({ fromOccupationId: id, toOccupationId, position: index + 1 })));
  }
}

/** The select columns and the join a list of careers reads each row's home with. */
export const homeColumns = { homeSlug: skillDomains.slug, homeName: skillDomains.name };

/** The domains that are some career's home, in the taxonomy's order. */
export async function careerDomains(): Promise<CareerHome[]> {
  return db
    .select({ slug: skillDomains.slug, name: skillDomains.name })
    .from(skillDomains)
    .where(sql`EXISTS (SELECT 1 FROM occupations o WHERE o.home_domain = ${skillDomains.slug})`)
    .orderBy(asc(skillDomains.position), asc(skillDomains.slug));
}
