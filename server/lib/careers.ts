import { asc, eq, sql } from 'drizzle-orm';
import { db, occupationLinks, occupations, skillDomains } from '../db/index.js';
import type { Executor } from './audit.js';
import { rowsOf } from './rows.js';
import { civilianCareer } from './military.js';
import { jobIsOpen } from './openJobs.js';
import { factoryInScope } from './scope.js';

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

/** The domains that are some civilian career's home (the Careers list is of those), in the taxonomy's order. */
export async function careerDomains(): Promise<CareerHome[]> {
  return db
    .select({ slug: skillDomains.slug, name: skillDomains.name })
    .from(skillDomains)
    .where(sql`EXISTS (SELECT 1 FROM occupations o WHERE o.home_domain = ${skillDomains.slug} AND ${civilianCareer('o')})`)
    .orderBy(asc(skillDomains.position), asc(skillDomains.slug));
}

/**
 * The same for the military careers, for the list when it was asked for them:
 * each home with the services that have a career in it (`services`, by key),
 * so that a list narrowed to one service offers only that service's homes.
 */
export async function militaryCareerDomains(): Promise<(CareerHome & { services: string[] })[]> {
  const rows = rowsOf(
    await db.execute(sql`
      SELECT d.slug, d.name, array_agg(DISTINCT c.service ORDER BY c.service) AS services
      FROM skill_domains d
      INNER JOIN occupations o ON o.home_domain = d.slug
      INNER JOIN companies c ON c.id = o.service_company_id AND c.service IS NOT NULL
      GROUP BY d.slug, d.name, d.position
      ORDER BY d.position ASC, d.slug ASC
    `)
  );
  return rows.map((row) => ({ slug: String(row.slug), name: String(row.name), services: Array.isArray(row.services) ? row.services.map(String) : [] }));
}

/**
 * The careers a company, or one of its factories, has: what its page and its
 * panel on the map list under Careers. Only what is known of the subject
 * itself, in this order:
 *
 * 1. the careers of its open jobs, the one with the most open first, each
 *    with how many are open (`openJobs`);
 * 2. the careers the company has its own version of (`version`);
 * 3. the careers recorded for the factory, or across the company's factories
 *    (factory_occupations: `factories`, `people`).
 *
 * A career that is several of these stands once, where it first belongs. The
 * careers typical of the subject's industry are never among them: they say
 * what kind of work an industry has, and belong on the industry's page and on
 * a state's or an area's panel. A subject with none of its own has no careers
 * to list, and its surfaces draw no Careers section.
 */
export interface OwnCareer {
  id: string;
  title: string;
  /** Open jobs for it here; 0 when it is listed for another reason. */
  openJobs: number;
  /** The company has its own version of it. */
  version: boolean;
  /** Recorded at this many of the subject's factories, with this many people; null when not recorded. */
  factories: number | null;
  people: number | null;
}

export async function ownCareers(subject: { companyId: string } | { factoryId: string; companyId: string | null }): Promise<OwnCareer[]> {
  const factoryId = 'factoryId' in subject ? subject.factoryId : null;
  const companyId = subject.companyId;
  // The subject's factories: the one, or every factory of the company.
  const here = factoryId ? sql`oc_f.id = ${factoryId}` : sql`oc_f.company_id = ${companyId}`;
  const rows = rowsOf(
    await db.execute(sql`
      WITH open AS (
        SELECT j.occupation_id, COUNT(*)::int AS n
        FROM jobs j
        INNER JOIN factories oc_f ON oc_f.id = j.factory_id
        WHERE ${jobIsOpen('j')} AND ${here} AND ${factoryInScope('oc_f')}
        GROUP BY j.occupation_id
      ), versioned AS (
        SELECT cc.occupation_id FROM company_careers cc WHERE cc.company_id = ${companyId}
      ), recorded AS (
        SELECT fo.occupation_id, COUNT(DISTINCT fo.factory_id)::int AS factories, NULLIF(COALESCE(SUM(fo.headcount), 0), 0)::int AS people
        FROM factory_occupations fo
        INNER JOIN factories oc_f ON oc_f.id = fo.factory_id
        WHERE ${here} AND ${factoryInScope('oc_f')}
        GROUP BY fo.occupation_id
      )
      SELECT o.id, o.title, COALESCE(open.n, 0) AS open_jobs, (versioned.occupation_id IS NOT NULL) AS version,
             recorded.factories, recorded.people
      FROM occupations o
      LEFT JOIN open ON open.occupation_id = o.id
      LEFT JOIN versioned ON versioned.occupation_id = o.id
      LEFT JOIN recorded ON recorded.occupation_id = o.id
      WHERE open.occupation_id IS NOT NULL OR versioned.occupation_id IS NOT NULL OR recorded.occupation_id IS NOT NULL
      ORDER BY (open.occupation_id IS NULL), open.n DESC NULLS LAST, (versioned.occupation_id IS NULL), lower(o.title), o.id
    `)
  );
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    openJobs: Number(row.open_jobs) || 0,
    version: Boolean(row.version),
    factories: row.factories === null || row.factories === undefined ? null : Number(row.factories),
    people: row.people === null || row.people === undefined ? null : Number(row.people),
  }));
}
