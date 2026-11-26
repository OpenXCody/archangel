import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db, jobs, factories, occupations } from '../db/index.js';
import { factoryInScope } from './scope.js';
import { INDUSTRIES } from '../../shared/industry.js';

/**
 * A job is open: its status says so and its expiry date has not passed. Takes
 * the name the jobs table goes by in the query, as the scope helpers do
 * (`jobIsOpen()` in a Drizzle builder, `jobIsOpen('j')` in hand-written SQL).
 */
export function jobIsOpen(jobTable = 'jobs'): SQL {
  const job = sql.identifier(jobTable);
  return sql`(${job}.status = 'open' AND ${job}.expires_at > now())`;
}

/**
 * The industries a factory carries (factories.primary_naics_description) that
 * are food and drink: NAICS 311 and 312, by the names shared/industry.ts
 * gives them.
 */
const FOOD_AND_DRINK: string[] = INDUSTRIES.filter((industry) => industry.code === '311' || industry.code === '312').map((industry) => industry.name);

/** A job is at a food or drink factory: the factory's own industry says so. One with no industry is not. */
function atFoodOrDrink(job: ReturnType<typeof sql.identifier>): SQL {
  const names = sql.join(FOOD_AND_DRINK.map((name) => sql`${name}`), sql`, `);
  return sql`(EXISTS (SELECT 1 FROM factories at_factory WHERE at_factory.id = ${job}.factory_id AND at_factory.primary_naics_description IN (${names})))`;
}

/**
 * The order a list of jobs is shown in, wherever one is listed: the newest
 * day first; within a day the jobs at a food or drink factory after every
 * other job of that day (the owner's priority is machines, transportation and
 * industrial equipment, and food comes last); and within each of those, one
 * job of each company in turn (each company's newest first), then the next of
 * each. `posted_at` is the day the employer's feed says, or the moment a job
 * was first seen where the feed says none, so a board that came in at once
 * would otherwise stand as one company's block. The order is a function of
 * the rows alone (the id settles what is left), so a page never repeats or
 * skips a job.
 */
export function jobsInOrder(jobTable = 'jobs'): SQL {
  const job = sql.identifier(jobTable);
  const food = atFoodOrDrink(job);
  return sql`(${job}.posted_at)::date DESC, ${food}, row_number() OVER (PARTITION BY (${job}.posted_at)::date, ${food}, ${job}.company_id ORDER BY ${job}.posted_at DESC, ${job}.id), ${job}.posted_at DESC, ${job}.id`;
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
      // With the number and the career's title, what a job's address is written from (shared/jobs.ts).
      companySlug: sql<string | null>`(SELECT slug FROM companies WHERE companies.id = ${jobs.companyId})`,
      factoryName: factories.name,
      city: factories.city,
      occupationId: occupations.id,
      occupationTitle: occupations.title,
    })
    .from(jobs)
    .innerJoin(factories, eq(jobs.factoryId, factories.id))
    .innerJoin(occupations, eq(jobs.occupationId, occupations.id))
    .where(and(where, jobIsOpen(), factoryInScope()))
    .orderBy(jobsInOrder())
    .limit(limit);
}
