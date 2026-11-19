import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db, jobs, factories, occupations } from '../db/index.js';
import { factoryInScope } from './scope.js';

/**
 * A job is open: its status says so and its expiry date has not passed. Takes
 * the name the jobs table goes by in the query, as the scope helpers do
 * (`jobIsOpen()` in a Drizzle builder, `jobIsOpen('j')` in hand-written SQL).
 */
export function jobIsOpen(jobTable = 'jobs'): SQL {
  const job = sql.identifier(jobTable);
  return sql`(${job}.status = 'open' AND ${job}.expires_at > now())`;
}

/** How many open jobs a company's, a plant's or a career's page lists: the newest. The rest are a link away, on Jobs. */
export const OPEN_JOBS_SHOWN = 12;

/**
 * Open jobs matching a condition, newest first: the short form shown on a
 * career's, a factory's and a company's page. "Open" here also means at a
 * factory inside the app's region.
 */
/** How many open jobs match a condition: what a page says beside the few it lists. */
export async function countOpenJobs(where: SQL): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(jobs)
    .innerJoin(factories, eq(jobs.factoryId, factories.id))
    .where(and(where, jobIsOpen(), factoryInScope()));
  return row?.total ?? 0;
}

export async function listOpenJobs(where: SQL, limit = 50) {
  return db
    .select({
      id: jobs.id,
      serial: jobs.serial,
      title: jobs.title,
      payMin: jobs.payMin,
      payMax: jobs.payMax,
      payPeriod: jobs.payPeriod,
      companyName: sql<string>`(SELECT name FROM companies WHERE companies.id = ${jobs.companyId})`,
      factoryName: factories.name,
      city: factories.city,
      occupationId: occupations.id,
      occupationTitle: occupations.title,
    })
    .from(jobs)
    .innerJoin(factories, eq(jobs.factoryId, factories.id))
    .innerJoin(occupations, eq(jobs.occupationId, occupations.id))
    .where(and(where, jobIsOpen(), factoryInScope()))
    .orderBy(sql`${jobs.postedAt} DESC`)
    .limit(limit);
}
