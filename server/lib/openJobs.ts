import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db, jobs, factories, occupations } from '../db/index.js';
import { factoryInScope } from './scope.js';

/**
 * Open jobs matching a condition, newest first: the short form shown on a
 * career's, a factory's and a company's page. "Open" means status open, not
 * past its expiry date, and at a factory inside the app's region.
 */
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
    .where(and(where, eq(jobs.status, 'open'), sql`${jobs.expiresAt} > now()`, factoryInScope()))
    .orderBy(sql`${jobs.postedAt} DESC`)
    .limit(limit);
}
