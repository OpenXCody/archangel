import { sql, type SQL } from 'drizzle-orm';
import { jobOwnName } from '../../shared/jobOwnName.js';
import { int, text, type Row } from './rows.js';

/**
 * A job row as the API gives it.
 *
 * A job from a careers site is named for its career ("Welder"), and the title
 * its employer posted it under is kept beside that name (`jobs.posted_as`,
 * migration 0088). The posted title is given to nobody. What is given is the
 * opening's OWN NAME: that title with everything a page states elsewhere cut
 * out (`jobOwnName` in shared/jobOwnName.ts), or null where it says nothing
 * beyond the career's title. It is derived here on every read and stored
 * nowhere, so a change to the rule needs no back-fill.
 *
 * Every statement that gives job rows selects what a name is read from
 * (`JobNameSource`: the posted title, and the job's career, company and
 * factory as stored) and hands each row to `jobAsGiven`, which adds `ownName`
 * and drops the posted title. The same job therefore has the same own name in
 * every list. A job posted here by hand has no posted title and so no own name:
 * its `title` is what its poster wrote.
 */
export interface JobNameSource {
  /** `jobs.posted_as`: read for the own name, never given. */
  postedAs: string | null;
  /** The career's title: the job's standard name. */
  occupationTitle: string | null;
  companyName: string | null;
  /** The factory's name as stored. */
  factoryName: string | null;
  city: string | null;
  state: string | null;
}

/** The opening's own name beside its standard name, or null where it has none. */
export function ownNameOf(job: JobNameSource): string | null {
  if (!job.postedAs) return null;
  return jobOwnName(job.postedAs, {
    career: job.occupationTitle ?? '',
    company: job.companyName ?? '',
    factory: job.factoryName,
    city: job.city,
    state: job.state,
  });
}

/** The row as it is given: with its own name, without the title it was posted under. */
export function jobAsGiven<Job extends JobNameSource>(row: Job): Omit<Job, 'postedAs'> & { ownName: string | null } {
  const { postedAs: _never, ...given } = row;
  return { ...given, ownName: ownNameOf(row) };
}

/**
 * For a hand-written statement that lists jobs (a region's and an industry's): what it selects of each job, with the
 * tables under the names the statement joins them by (`jobs j`, `factories f`, `companies c`). `jobRowGiven` reads it.
 */
export function jobRowColumns(job = 'j', factory = 'f', company = 'c'): SQL {
  const j = sql.identifier(job);
  const f = sql.identifier(factory);
  const c = sql.identifier(company);
  return sql`${j}.id, ${j}.serial, ${j}.title, ${j}.posted_as, ${j}.employment_type, ${j}.shift,
    ${j}.pay_min, ${j}.pay_max, ${j}.pay_period, ${j}.posted_at, ${j}.undated,
    ${c}.name AS company_name, ${c}.slug AS company_slug, ${c}.domain AS company_domain,
    ${f}.name AS factory_name, ${f}.city, ${f}.state, ${j}.occupation_id,
    (SELECT o.title FROM occupations o WHERE o.id = ${j}.occupation_id) AS occupation_title`;
}

/** A row of such a statement as the API gives it: the shape `listOpenJobs` gives (server/lib/openJobs.ts). */
export function jobRowGiven(row: Row) {
  return jobAsGiven({
    id: String(row.id),
    serial: int(row.serial),
    title: String(row.title),
    postedAs: text(row.posted_as),
    employmentType: text(row.employment_type),
    shift: text(row.shift),
    payMin: (row.pay_min as number | null) ?? null,
    payMax: (row.pay_max as number | null) ?? null,
    payPeriod: String(row.pay_period),
    postedAt: row.posted_at as Date,
    undated: row.undated === true,
    companyName: text(row.company_name),
    companySlug: text(row.company_slug),
    companyDomain: text(row.company_domain),
    factoryName: text(row.factory_name),
    city: text(row.city),
    state: text(row.state),
    occupationId: String(row.occupation_id),
    occupationTitle: text(row.occupation_title),
  });
}
