import { Router, type Request } from 'express';
import { and, eq, gt, inArray, ne, sql, type SQL } from 'drizzle-orm';
import {
  db,
  jobs,
  jobSkills,
  jobMakes,
  skillMakes,
  applications,
  companies,
  factories,
  occupations,
  skills,
} from '../db/index.js';
import { canManageCompany, cleanText, getSessionUser, handle, requireUser } from '../lib/auth.js';
import { isUuid } from '../lib/writes.js';
import { rowsOf } from '../lib/rows.js';
import { pageLimit, pageOffset } from '../lib/paging.js';
import { uuidParam } from '../middleware/validateUuid.js';
import { SCOPE } from '../../shared/scope.js';
import { factoryInScope, isStateInScope } from '../lib/scope.js';
import { applicationReceived, applicationStatusChanged } from '../lib/notices.js';
import { jobTextFilter, milesFromFactory, readNear } from '../lib/jobSearch.js';
import { countOpenJobs, jobIsOpen, jobsInOrder, listOpenJobs } from '../lib/openJobs.js';
import { hasVersionOf, readVersion, versionPathSkills } from '../lib/versions.js';
import { placeOf, placeSql, type SkillPlace } from '../lib/taxonomy.js';
import { jobPath, readJobNumber } from '../../shared/jobs.js';
import { routeOf, routeOrder } from '../lib/route.js';

/**
 * Jobs and applications.
 * A job is one opening for one career (occupation) at one factory. Anyone can
 * read open jobs; a company's active members post and manage them; a signed-in
 * person applies; members read applicants ranked by required skills held.
 */
const router = Router();
router.param('id', uuidParam);
router.param('applicationId', uuidParam);

const JOB_TTL_DAYS = 60;
const EMPLOYMENT_TYPES = new Set(['full-time', 'part-time', 'contract', 'apprenticeship']);
const PAY_PERIODS = new Set(['hour', 'year']);
/** Stages an employer can move an application through, in order. */
const PIPELINE = ['applied', 'reviewing', 'interview', 'offer', 'hired'];
const EMPLOYER_STATUSES = new Set([...PIPELINE, 'declined']);
/** Stages a company can move an application back to from Hired or Declined. */
const WORKING = new Set(['applied', 'reviewing', 'interview', 'offer']);
const MAX_JOB_SKILLS = 60;
/** How many jobs one person can post in an hour. */
const MAX_POSTS_PER_HOUR = 30;

/** Open, unexpired, and at a factory inside the app's region. */
const isOpenInScope: SQL = and(jobIsOpen(), factoryInScope()) as SQL;

const jobSummary = {
  id: jobs.id,
  serial: jobs.serial,
  title: jobs.title,
  employmentType: jobs.employmentType,
  shift: jobs.shift,
  payMin: jobs.payMin,
  payMax: jobs.payMax,
  payPeriod: jobs.payPeriod,
  status: jobs.status,
  postedAt: jobs.postedAt,
  // True where a posting from a careers site gives no date: postedAt is the day it was first seen.
  undated: jobs.undated,
  expiresAt: jobs.expiresAt,
  companyId: companies.id,
  companyName: companies.name,
  // For the job's address (shared/jobs.ts).
  companySlug: companies.slug,
  // For the company's logo.
  companyDomain: companies.domain,
  factoryId: factories.id,
  factoryName: factories.name,
  city: factories.city,
  state: factories.state,
  latitude: factories.latitude,
  longitude: factories.longitude,
  occupationId: occupations.id,
  occupationTitle: occupations.title,
};

/** What is said when someone tries to change a job that came from the company's own careers site. */
const FROM_SOURCE = 'This job comes from the company\'s careers site and is kept in step with it. It is changed there.';

/** Whole cents, zero or more. Accepts numbers only. */
function cents(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000_000 ? value : null;
}

// GET /api/jobs?occupationId=&companyId=&factoryId=&skillId=&q=&state=&near=<lat>,<lng>&within=<miles>&limit=&offset=
// `q`: every word typed must be in the job's title, company, career, shift or
// place. `near`: only jobs whose factory is within `within` miles (50 unless
// said) of the point, nearest first, each with its distance as `miles`.
// A page of the list, newest first, with `total`: how many jobs match in all.
router.get(
  '/',
  handle(async (req, res) => {
    const filters: SQL[] = [isOpenInScope];
    const { occupationId, companyId, factoryId, q, state } = req.query;
    if (isUuid(occupationId)) filters.push(eq(jobs.occupationId, occupationId));
    if (isUuid(companyId)) filters.push(eq(jobs.companyId, companyId));
    if (isUuid(factoryId)) filters.push(eq(jobs.factoryId, factoryId));
    // The jobs that ask for a skill.
    if (isUuid(req.query.skillId)) {
      filters.push(sql`EXISTS (SELECT 1 FROM job_skills js WHERE js.job_id = ${jobs.id} AND js.skill_id = ${req.query.skillId})`);
    }
    const typed = jobTextFilter(q);
    if (typed) filters.push(typed);
    if (typeof state === 'string' && /^[A-Za-z]{2}$/.test(state)) filters.push(eq(factories.state, state.toUpperCase()));
    const near = readNear(req.query.near, req.query.within);
    if (near === 'invalid') {
      return res.status(400).json({ error: 'near is a latitude and a longitude, such as 30.27,-97.74; within is a number of miles.' });
    }
    const miles = near ? milesFromFactory(near) : null;
    if (near && miles) filters.push(sql`${miles} <= ${near.within}`);
    const limit = pageLimit(req.query.limit, 100, 500);
    const offset = pageOffset(req.query.offset);

    const [rows, [counted]] = await Promise.all([
      db
        .select(miles ? { ...jobSummary, miles } : jobSummary)
        .from(jobs)
        .innerJoin(companies, eq(companies.id, jobs.companyId))
        .innerJoin(factories, eq(factories.id, jobs.factoryId))
        .innerJoin(occupations, eq(occupations.id, jobs.occupationId))
        .where(and(...filters))
        // Nearest first where a place was given; then the newest day, the companies of a day in turn (jobsInOrder).
        .orderBy(...(miles ? [sql`${miles} ASC`] : []), jobsInOrder())
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(jobs)
        .innerJoin(companies, eq(companies.id, jobs.companyId))
        .innerJoin(factories, eq(factories.id, jobs.factoryId))
        .innerJoin(occupations, eq(occupations.id, jobs.occupationId))
        .where(and(...filters)),
    ]);
    res.json({ jobs: rows, total: counted?.total ?? 0, limit, offset });
  })
);

// GET /api/jobs/summary - what the Jobs page needs before anything is typed:
// how many jobs are open, and the states that have some, most jobs first.
router.get(
  '/summary',
  handle(async (_req, res) => {
    const states = await db
      .select({ state: factories.state, jobs: sql<number>`COUNT(*)::int` })
      .from(jobs)
      .innerJoin(factories, eq(factories.id, jobs.factoryId))
      .where(isOpenInScope)
      .groupBy(factories.state)
      .orderBy(sql`COUNT(*) DESC`, factories.state);
    res.json({
      total: states.reduce((sum, row) => sum + row.jobs, 0),
      states: states.filter((row): row is { state: string; jobs: number } => Boolean(row.state)),
    });
  })
);

/** A skill on a job's page: where it stands in the taxonomy, and what this job and this reader say of it. */
interface JobPathSkill extends SkillPlace {
  id: string;
  name: string;
  /** The job's own words name it: the posting's text was read to ask for it. Always false on a job posted here by hand. */
  named: boolean;
  /** On a job posted here by hand, a skill the company marked as good to have and not needed. False everywhere else. */
  optional: boolean;
  /** The company's version of the career adds it to the standard path. */
  added: boolean;
  /** The signed-in reader holds it; false when signed out. */
  held: boolean;
  /** The makes of the skill this job names (the machines or software it is run on). */
  makes: { id: string; name: string }[];
}

/**
 * The skills a job's page draws. A job is an opening for a career, so what it
 * takes is the career's path, not only the handful of skills a posting's text
 * happened to name.
 *
 * `of` says whose list `skills` is:
 * - `version`: the job came from the company's careers site and the company has its own version of
 *   the career. `skills` is that version's path (the standard's skills it keeps and the ones it adds).
 * - `career`: the job came from the company's careers site and the company has no version. `skills`
 *   is the career's standard path (`occupation_skills`).
 * - `job`: the company posted the job here by hand and chose its skills. `skills` is exactly that
 *   choice (`job_skills`); nothing is added from the career.
 *
 * `skills` is always in path order (level, domain, group, the skill's place in its group), each with
 * its level, group and domain, so the page lays it out as a career's path is laid out. On a job from
 * a careers site each skill says whether the posting names it (`named`).
 *
 * `alsoNamed` is what the posting names that is not on that path: skills in `job_skills` (or the
 * skill of a make in `job_makes`) that the career's path does not have. Empty for a job posted by hand.
 *
 * The response's older `skills` is untouched: the job's own `job_skills` rows, by name.
 */
interface JobPath {
  of: 'version' | 'career' | 'job';
  skills: JobPathSkill[];
  alsoNamed: JobPathSkill[];
}

async function readJobPath(
  job: { id: string; companyId: string; occupationId: string; fromSource: boolean },
  own: { id: string; required: boolean }[],
  makesOf: (skillId: string) => { id: string; name: string }[],
  makeSkillIds: string[],
  userId: string | null
): Promise<JobPath> {
  const ownIds = new Set(own.map((skill) => skill.id));
  const optional = new Set(own.filter((skill) => !skill.required).map((skill) => skill.id));
  let of: JobPath['of'] = 'job';
  let onPath = ownIds;
  let added = new Set<string>();
  if (job.fromSource) {
    const version = await readVersion(db, job.companyId, job.occupationId);
    if (version) {
      of = 'version';
      onPath = new Set(version.skills.map((skill) => skill.id));
      added = new Set(version.skills.filter((skill) => skill.added).map((skill) => skill.id));
    } else {
      of = 'career';
      onPath = new Set((await routeOf(db, job.occupationId)).map((skill) => skill.id));
    }
  }
  // What the job's own words name: its skills, and the skill of every make it names.
  const namedIds = job.fromSource ? new Set([...ownIds, ...makeSkillIds]) : new Set<string>();
  const all = [...new Set([...onPath, ...namedIds])];
  if (all.length === 0) return { of, skills: [], alsoNamed: [] };

  const place = placeSql('s');
  const rows = rowsOf<{ id: string; name: string; held: boolean; level: unknown; group_slug: unknown; group_name: unknown; domain_slug: unknown; domain_name: unknown }>(
    await db.execute(sql`
      SELECT s.id, s.name, ${place.columns},
             ${userId ? sql`EXISTS (SELECT 1 FROM user_skills us WHERE us.skill_id = s.id AND us.user_id = ${userId} AND us.status = 'held')` : sql`false`} AS held
      FROM skills s
      ${place.joins}
      WHERE s.id IN (${sql.join(all.map((id) => sql`${id}`), sql`, `)})
      ORDER BY ${routeOrder()}
    `)
  );
  const skills: JobPathSkill[] = [];
  const alsoNamed: JobPathSkill[] = [];
  for (const row of rows) {
    const id = String(row.id);
    const skill: JobPathSkill = {
      id,
      name: String(row.name),
      ...placeOf(row),
      named: namedIds.has(id),
      optional: !job.fromSource && optional.has(id),
      added: added.has(id),
      held: Boolean(row.held),
      makes: makesOf(id),
    };
    (onPath.has(id) ? skills : alsoNamed).push(skill);
  }
  return { of, skills, alsoNamed };
}

/** How many other open jobs a job's page lists under each heading. */
const OTHER_JOBS_SHOWN = 5;

/**
 * One job as its page reads it, found by a condition over `jobs` (its id, or its number).
 * Null when there is none, or none this reader may see: a closed or expired job stays
 * visible only to its company and to people who applied.
 */
async function readJobPage(req: Request, where: SQL) {
  const user = await getSessionUser(req);
  const [job] = await db
    .select({
      ...jobSummary,
      description: jobs.description,
      applyUrl: jobs.applyUrl,
      closedReason: jobs.closedReason,
      // The company has its own version of the job's career: the page links it.
      hasVersion: hasVersionOf(sql`${jobs.companyId}`, sql`${jobs.occupationId}`),
      // A job that came from the company's own careers site (migration 0054): kept in step with
      // it by the intake runner, read-only here. Its level, and what it asks for as facts.
      fromSource: sql<boolean>`${jobs.source} IS NOT NULL`,
      levelWord: jobs.levelWord,
      levelRank: jobs.levelRank,
      requirements: jobs.requirements,
      lastSeenAt: jobs.lastSeenAt,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(factories, eq(factories.id, jobs.factoryId))
    .innerJoin(occupations, eq(occupations.id, jobs.occupationId))
    .where(where)
    .limit(1);
  if (!job || !isStateInScope(job.state)) return null;

  const canManage = user ? await canManageCompany(user, job.companyId) : false;
  const isOpen = job.status === 'open' && job.expiresAt > new Date();
  let myApplication: { id: string; status: string; createdAt: Date } | null = null;
  if (user) {
    const [mine] = await db
      .select({ id: applications.id, status: applications.status, createdAt: applications.createdAt })
      .from(applications)
      .where(and(eq(applications.jobId, job.id), eq(applications.userId, user.id)))
      .limit(1);
    myApplication = mine ?? null;
  }
  if (!isOpen && !canManage && !myApplication) return null;

  // The job's own skills: what a posting's text was read to name, or what the company chose here.
  const skillRows = await db
    .select({
      id: skills.id,
      name: skills.name,
      required: jobSkills.required,
      held: user
        ? sql<boolean>`EXISTS (
            SELECT 1 FROM user_skills us
            WHERE us.skill_id = ${skills.id} AND us.user_id = ${user.id} AND us.status = 'held'
          )`
        : sql<boolean>`false`,
    })
    .from(jobSkills)
    .innerJoin(skills, eq(skills.id, jobSkills.skillId))
    .where(eq(jobSkills.jobId, job.id))
    .orderBy(sql`${jobSkills.required} DESC`, skills.name);
  // The makes the job names, under the skill each is a make of.
  const makeRows = await db
    .select({ skillId: jobMakes.skillId, id: skillMakes.id, name: skillMakes.name })
    .from(jobMakes)
    .innerJoin(skillMakes, eq(skillMakes.id, jobMakes.makeId))
    .where(eq(jobMakes.jobId, job.id))
    .orderBy(skillMakes.position, skillMakes.name);
  const makesOf = (skillId: string) => makeRows.filter((make) => make.skillId === skillId).map(({ id, name }) => ({ id, name }));

  const path = await readJobPath(job, skillRows, makesOf, makeRows.map((make) => make.skillId), user?.id ?? null);

  // Other open jobs: for this career at this company, and the rest at this factory.
  const sameCareer = and(eq(jobs.companyId, job.companyId), eq(jobs.occupationId, job.occupationId), ne(jobs.id, job.id)) as SQL;
  const sameFactory = and(eq(jobs.factoryId, job.factoryId), ne(jobs.occupationId, job.occupationId)) as SQL;
  const [careerJobs, careerTotal, factoryJobs, factoryTotal] = await Promise.all([
    listOpenJobs(sameCareer, OTHER_JOBS_SHOWN),
    countOpenJobs(sameCareer),
    listOpenJobs(sameFactory, OTHER_JOBS_SHOWN),
    countOpenJobs(sameFactory),
  ]);

  return {
    // `href` is the job's address as links are written today (shared/jobs.ts): the page puts it in place of an older one.
    job: { ...job, isOpen, href: jobPath(job) },
    // The job's own rows (`job_skills`), by name. The page draws `path`; this stays for other readers.
    skills: skillRows.map((skill) => ({ ...skill, makes: makesOf(skill.id) })),
    path,
    others: {
      // This career at this company, this job left out.
      career: { jobs: careerJobs, total: careerTotal },
      // Every other career's open jobs at this factory.
      factory: { jobs: factoryJobs, total: factoryTotal },
    },
    myApplication,
    canManage,
  };
}

// GET /api/jobs/by-number/:serial - the same answer as GET /api/jobs/:id, for the job with that
// number. A job's address ends in its number (/jobs/caterpillar/cnc-machine-operator/1140) and the
// number alone finds it: the words before it are never read.
router.get(
  '/by-number/:serial',
  handle(async (req, res) => {
    const serial = readJobNumber(req.params.serial);
    const page = serial === null ? null : await readJobPage(req, eq(jobs.serial, serial));
    if (!page) return res.status(404).json({ error: 'Job not found' });
    res.json(page);
  })
);

// GET /api/jobs/:id - one job as its page reads it: its facts, its own skills (`skills`), the path
// of its career with what the job names marked (`path`), other open jobs beside it (`others`). For a
// signed-in person each skill says whether they hold it and the response includes their application.
router.get(
  '/:id',
  handle(async (req, res) => {
    const page = await readJobPage(req, eq(jobs.id, req.params.id));
    if (!page) return res.status(404).json({ error: 'Job not found' });
    res.json(page);
  })
);

interface JobInput {
  title?: string;
  description?: string | null;
  employmentType?: string;
  shift?: string | null;
  payMin?: number;
  payMax?: number;
  payPeriod?: string;
  applyUrl?: string | null;
}

/** Validate the editable fields of a job. Returns an error message or the clean values. */
function readJobFields(body: Request['body'], requireAll: boolean): { error: string } | { values: JobInput } {
  const values: JobInput = {};
  if (body?.title !== undefined) {
    const title = cleanText(body.title, 120, 2);
    if (!title) return { error: 'Give the job a title of 2 to 120 characters.' };
    values.title = title;
  }
  if (body?.description !== undefined) {
    const description = cleanText(body.description ?? '', 8000);
    if (description === null) return { error: 'Keep the description under 8,000 characters.' };
    values.description = description || null;
  }
  if (body?.employmentType !== undefined) {
    if (typeof body.employmentType !== 'string' || !EMPLOYMENT_TYPES.has(body.employmentType)) {
      return { error: 'Choose full-time, part-time, contract or apprenticeship.' };
    }
    values.employmentType = body.employmentType;
  }
  if (body?.shift !== undefined) {
    const shift = cleanText(body.shift ?? '', 40);
    if (shift === null) return { error: 'Keep the shift under 40 characters.' };
    values.shift = shift || null;
  }
  if (body?.payPeriod !== undefined) {
    if (typeof body.payPeriod !== 'string' || !PAY_PERIODS.has(body.payPeriod)) {
      return { error: "Pay is per 'hour' or per 'year'." };
    }
    values.payPeriod = body.payPeriod;
  }
  if (body?.payMin !== undefined || body?.payMax !== undefined || requireAll) {
    const payMin = cents(body?.payMin);
    const payMax = cents(body?.payMax);
    if (payMin === null || payMax === null || payMin === 0) {
      return { error: 'Enter the lowest and the highest pay, in whole cents.' };
    }
    if (payMax < payMin) return { error: 'The lowest pay is above the highest.' };
    values.payMin = payMin;
    values.payMax = payMax;
  }
  if (body?.applyUrl !== undefined) {
    const applyUrl = readApplyUrl(body.applyUrl);
    if (applyUrl === undefined) {
      return { error: 'Enter a web address for the application link, such as careers.example.com/apply.' };
    }
    values.applyUrl = applyUrl;
  }
  return { values };
}

/**
 * The application link as stored: always https. An address typed without a
 * scheme gets one. Null for none; undefined when it is not a usable address.
 */
function readApplyUrl(value: unknown): string | null | undefined {
  const text = cleanText(value ?? '', 500);
  if (text === null) return undefined;
  if (!text) return null;
  if (/\s/.test(text)) return undefined;
  // http becomes https; any other scheme is not a web page.
  const bare = text.replace(/^https?:\/\//i, '');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(bare)) return undefined;
  const link = `https://${bare}`;
  if (link.length > 500) return undefined;
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && url.hostname.includes('.') && !url.username && !url.password ? link : undefined;
  } catch {
    return undefined;
  }
}

type JobSkillRow = { skillId: string; required: boolean };

/**
 * The skills sent with a job: `[{ skillId, required? }]`. Entries that are not
 * a skill id, and repeats, are dropped. An error when there are too many or
 * one does not exist.
 */
async function readJobSkills(list: unknown[]): Promise<{ error: string } | { rows: JobSkillRow[] }> {
  const seen = new Set<string>();
  const rows: JobSkillRow[] = [];
  for (const item of list as { skillId?: unknown; required?: unknown }[]) {
    if (!isUuid(item?.skillId) || seen.has(item.skillId)) continue;
    seen.add(item.skillId);
    rows.push({ skillId: item.skillId, required: item.required !== false });
  }
  if (rows.length > MAX_JOB_SKILLS) return { error: `Tag at most ${MAX_JOB_SKILLS} skills on a job.` };
  if (rows.length > 0) {
    const known = await db
      .select({ id: skills.id })
      .from(skills)
      .where(inArray(skills.id, rows.map((row) => row.skillId)));
    if (known.length !== rows.length) return { error: 'One of the tagged skills does not exist.' };
  }
  return { rows };
}

// POST /api/jobs { companyId, factoryId, occupationId, payMin, payMax, ...optional }
// Skills default to the career's: Fundamentals and Intermediate required, Advanced optional
// (a path row's stage is the skill's level). Where the company has its own version of the
// career, they default to that version's skills instead.
router.post(
  '/',
  requireUser,
  handle(async (req, res) => {
    const user = req.user!;
    const { companyId, factoryId, occupationId } = req.body ?? {};
    if (!isUuid(companyId) || !isUuid(factoryId) || !isUuid(occupationId)) {
      return res.status(400).json({ error: 'Choose a company, a factory and a career.' });
    }
    if (!(await canManageCompany(user, companyId))) {
      return res.status(403).json({ error: 'You can only post jobs for a company you belong to.' });
    }
    const [factory] = await db
      .select({ id: factories.id, companyId: factories.companyId, state: factories.state })
      .from(factories)
      .where(eq(factories.id, factoryId))
      .limit(1);
    if (!factory || factory.companyId !== companyId) {
      return res.status(400).json({ error: 'That factory does not belong to the company.' });
    }
    if (!isStateInScope(factory.state)) {
      return res.status(400).json({ error: `Jobs are limited to ${SCOPE.stateName} for now.` });
    }
    const [occupation] = await db
      .select({ id: occupations.id, title: occupations.title, service: occupations.serviceCompanyId })
      .from(occupations)
      .where(eq(occupations.id, occupationId))
      .limit(1);
    if (!occupation) return res.status(400).json({ error: 'That career does not exist.' });
    // A job is for a civilian career at a plant: the career picker offers no other.
    if (occupation.service) return res.status(400).json({ error: 'A job cannot be posted for a military career.' });

    const parsed = readJobFields(req.body, true);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    const explicit: unknown = req.body?.skills;
    let skillRows: JobSkillRow[];
    if (Array.isArray(explicit)) {
      const tagged = await readJobSkills(explicit);
      if ('error' in tagged) return res.status(400).json({ error: tagged.error });
      skillRows = tagged.rows;
    } else {
      const version = await versionPathSkills(companyId, occupationId);
      const defaults =
        version?.map((row) => ({ skillId: row.skillId, stage: row.level })) ??
        // In route order, so the cut below keeps the first skills of the path and not whichever came back first.
        (await routeOf(db, occupationId)).map((skill) => ({ skillId: skill.id, stage: skill.level }));
      skillRows = defaults.slice(0, MAX_JOB_SKILLS).map((row) => ({ skillId: row.skillId, required: row.stage !== 3 }));
    }

    const fields = {
      title: parsed.values.title ?? occupation.title,
      description: parsed.values.description ?? null,
      employmentType: parsed.values.employmentType ?? 'full-time',
      shift: parsed.values.shift ?? null,
      payMin: parsed.values.payMin as number,
      payMax: parsed.values.payMax as number,
      payPeriod: parsed.values.payPeriod ?? 'hour',
      applyUrl: parsed.values.applyUrl ?? null,
    };

    // The same post sent twice in a moment (a double click, a retry) is one
    // job. A copy that differs in any field ("post another like this") is not.
    const [twin] = await db
      .select({ id: jobs.id, serial: jobs.serial })
      .from(jobs)
      .where(
        and(
          eq(jobs.createdBy, user.id),
          eq(jobs.factoryId, factoryId),
          eq(jobs.occupationId, occupationId),
          eq(jobs.title, fields.title),
          eq(jobs.employmentType, fields.employmentType),
          eq(jobs.payMin, fields.payMin),
          eq(jobs.payMax, fields.payMax),
          eq(jobs.payPeriod, fields.payPeriod),
          sql`${jobs.description} IS NOT DISTINCT FROM ${fields.description}`,
          sql`${jobs.shift} IS NOT DISTINCT FROM ${fields.shift}`,
          sql`${jobs.applyUrl} IS NOT DISTINCT FROM ${fields.applyUrl}`,
          gt(jobs.createdAt, new Date(Date.now() - 15_000))
        )
      )
      .limit(1);
    if (twin) return res.status(200).json({ id: twin.id, serial: twin.serial });

    // Each job is public at once, so one person posts only so many in an hour:
    // a slip, a script or a stolen session cannot flood the jobs list.
    const [recent] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.createdBy, user.id), gt(jobs.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
    if ((recent?.count ?? 0) >= MAX_POSTS_PER_HOUR) {
      return res.status(429).json({ error: `You have posted ${MAX_POSTS_PER_HOUR} jobs in the last hour. Post the next one a little later.` });
    }

    const created = await db.transaction(async (tx) => {
      const [job] = await tx
        .insert(jobs)
        .values({
          companyId,
          factoryId,
          occupationId,
          ...fields,
          status: 'open',
          expiresAt: new Date(Date.now() + JOB_TTL_DAYS * 24 * 60 * 60 * 1000),
          createdBy: user.id,
        })
        .returning({ id: jobs.id, serial: jobs.serial });
      if (skillRows.length > 0) {
        await tx
          .insert(jobSkills)
          .values(skillRows.map((row) => ({ jobId: job.id, ...row })))
          .onConflictDoNothing();
      }
      return job;
    });
    res.status(201).json({ id: created.id, serial: created.serial });
  })
);

// PATCH /api/jobs/:id - edit fields, replace the skills ({ skills: [{ skillId, required }] }),
// close, or reopen (reopening renews the 60 days). Company, factory and career stay as posted.
router.patch(
  '/:id',
  requireUser,
  handle(async (req, res) => {
    const [job] = await db.select({ id: jobs.id, companyId: jobs.companyId, source: jobs.source }).from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!(await canManageCompany(req.user!, job.companyId))) return res.status(403).json({ error: 'Not your job to change.' });
    if (job.source) return res.status(409).json({ error: FROM_SOURCE });

    const parsed = readJobFields(req.body, false);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const patch: Partial<typeof jobs.$inferInsert> = { ...parsed.values, updatedAt: new Date() };

    const status: unknown = req.body?.status;
    if (status === 'closed') {
      patch.status = 'closed';
      patch.closedReason = cleanText(req.body?.closedReason ?? '', 120) || null;
    } else if (status === 'open') {
      patch.status = 'open';
      patch.closedReason = null;
      patch.expiresAt = new Date(Date.now() + JOB_TTL_DAYS * 24 * 60 * 60 * 1000);
    } else if (status !== undefined) {
      return res.status(400).json({ error: "status must be 'open' or 'closed'." });
    }

    const explicit: unknown = req.body?.skills;
    let skillRows: JobSkillRow[] | null = null;
    if (explicit !== undefined) {
      if (!Array.isArray(explicit)) return res.status(400).json({ error: 'skills must be a list.' });
      const tagged = await readJobSkills(explicit);
      if ('error' in tagged) return res.status(400).json({ error: tagged.error });
      skillRows = tagged.rows;
    }

    await db.transaction(async (tx) => {
      await tx.update(jobs).set(patch).where(eq(jobs.id, job.id));
      if (skillRows) {
        // The list sent is the whole list: what is not in it is no longer asked for.
        await tx.delete(jobSkills).where(eq(jobSkills.jobId, job.id));
        if (skillRows.length > 0) {
          await tx.insert(jobSkills).values(skillRows.map((row) => ({ jobId: job.id, ...row })));
        }
      }
    });
    res.json({ ok: true });
  })
);

// DELETE /api/jobs/:id - remove a job nobody has applied to. One with
// applications (withdrawn ones included) can only be closed: the people who
// applied keep it on their page.
router.delete(
  '/:id',
  requireUser,
  handle(async (req, res) => {
    const [job] = await db.select({ id: jobs.id, companyId: jobs.companyId, source: jobs.source }).from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!(await canManageCompany(req.user!, job.companyId))) return res.status(403).json({ error: 'Not your job to delete.' });
    if (job.source) return res.status(409).json({ error: FROM_SOURCE });
    // One statement, so an application arriving at the same moment is not lost.
    const [deleted] = await db
      .delete(jobs)
      .where(and(eq(jobs.id, job.id), sql`NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = ${jobs.id})`))
      .returning({ id: jobs.id });
    if (!deleted) {
      return res.status(409).json({ error: 'People have applied to this job, so it cannot be deleted. Close it instead.' });
    }
    res.json({ ok: true });
  })
);

// POST /api/jobs/:id/apply { note? }
router.post(
  '/:id/apply',
  requireUser,
  handle(async (req, res) => {
    const [job] = await db
      .select({ id: jobs.id, applyUrl: jobs.applyUrl })
      .from(jobs)
      .innerJoin(factories, eq(factories.id, jobs.factoryId))
      .where(and(eq(jobs.id, req.params.id), isOpenInScope))
      .limit(1);
    if (!job) return res.status(404).json({ error: 'This job is no longer open.' });
    if (job.applyUrl) return res.status(400).json({ error: "Apply on the company's own site for this job." });
    const note = cleanText(req.body?.note ?? '', 2000);
    if (note === null) return res.status(400).json({ error: 'Keep the note under 2,000 characters.' });

    const [created] = await db
      .insert(applications)
      .values({ jobId: job.id, userId: req.user!.id, note: note || null })
      .onConflictDoNothing()
      .returning({ id: applications.id });
    if (created) {
      // The application's history starts, and the company is told.
      await applicationReceived({ applicationId: created.id, jobId: job.id, applicantId: req.user!.id });
      return res.status(201).json({ id: created.id, status: 'applied' });
    }

    // One application per person per job. A withdrawn one is taken up again
    // (the same row, back at the start); anything else stands.
    const now = new Date();
    const [reopened] = await db
      .update(applications)
      .set({ status: 'applied', note: note || null, createdAt: now, statusChangedAt: now })
      .where(and(eq(applications.jobId, job.id), eq(applications.userId, req.user!.id), eq(applications.status, 'withdrawn')))
      .returning({ id: applications.id });
    if (!reopened) return res.status(409).json({ error: 'You have already applied to this job.' });
    await applicationReceived({ applicationId: reopened.id, jobId: job.id, applicantId: req.user!.id });
    res.status(201).json({ id: reopened.id, status: 'applied' });
  })
);

interface ApplicantRow {
  id: string;
  status: string;
  note: string | null;
  employer_note: string | null;
  created_at: Date;
  status_changed_at: Date;
  user_id: string;
  name: string;
  email: string;
  home_zip: string | null;
  /** Ids of the job's skills this person holds, and is learning. */
  held: string[];
  learning: string[];
}

// GET /api/jobs/:id/applications - applicants, ranked: most required skills
// held first, then optional skills held, then who applied first. `skills` is
// the job's own list; each applicant carries the ids of those they hold and
// of those they are learning, so the rest are the ones they lack.
router.get(
  '/:id/applications',
  requireUser,
  handle(async (req, res) => {
    const [job] = await db.select({ id: jobs.id, companyId: jobs.companyId }).from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!(await canManageCompany(req.user!, job.companyId))) {
      return res.status(403).json({ error: 'Only the company can read its applicants.' });
    }
    const skillRows = await db
      .select({ id: skills.id, name: skills.name, required: jobSkills.required })
      .from(jobSkills)
      .innerJoin(skills, eq(skills.id, jobSkills.skillId))
      .where(eq(jobSkills.jobId, job.id))
      .orderBy(sql`${jobSkills.required} DESC`, skills.name);
    // Every applicant's standing on the job's skills in one pass, not one query each.
    const rows = rowsOf<ApplicantRow>(await db.execute(sql`
      SELECT a.id, a.status, a.note, a.employer_note, a.created_at, a.status_changed_at,
             u.id AS user_id, u.name, u.email, u.home_zip,
             COALESCE(s.held, '[]'::json) AS held,
             COALESCE(s.learning, '[]'::json) AS learning
        FROM applications a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN (
          SELECT us.user_id,
                 json_agg(us.skill_id) FILTER (WHERE us.status = 'held') AS held,
                 json_agg(us.skill_id) FILTER (WHERE us.status = 'learning') AS learning
            FROM user_skills us
            JOIN job_skills js ON js.skill_id = us.skill_id AND js.job_id = ${job.id}
           WHERE us.user_id IN (SELECT user_id FROM applications WHERE job_id = ${job.id})
           GROUP BY us.user_id
        ) s ON s.user_id = a.user_id
       WHERE a.job_id = ${job.id}
    `));

    const requiredIds = new Set(skillRows.filter((skill) => skill.required).map((skill) => skill.id));
    const totalRequired = requiredIds.size;
    const counted = rows.map((row) => {
      const heldRequired = row.held.filter((id) => requiredIds.has(id)).length;
      return { row, heldRequired, heldOptional: row.held.length - heldRequired };
    });
    const score = (r: { heldRequired: number }) => (totalRequired > 0 ? r.heldRequired / totalRequired : 0);
    const ranked = counted.sort(
      (a, b) =>
        score(b) - score(a) ||
        b.heldOptional - a.heldOptional ||
        new Date(a.row.created_at).getTime() - new Date(b.row.created_at).getTime()
    );
    res.json({
      // Skills are self-reported by applicants; nothing here is verified.
      skillsAreSelfReported: true,
      skills: skillRows,
      applications: ranked.map(({ row: r, heldRequired, heldOptional }) => ({
        id: r.id,
        status: r.status,
        note: r.note,
        employerNote: r.employer_note,
        createdAt: r.created_at,
        statusChangedAt: r.status_changed_at,
        applicant: { id: r.user_id, name: r.name, email: r.email, homeZip: r.home_zip },
        heldRequired,
        totalRequired,
        heldOptional,
        heldSkillIds: r.held,
        learningSkillIds: r.learning,
      })),
    });
  })
);

// PATCH /api/jobs/applications/:applicationId { status?, employerNote? }
// The company moves an application through its stages or declines it, and can
// take a Hired or Declined back to a working stage. The applicant can only
// withdraw, and a withdrawal is theirs: the company cannot change it.
router.patch(
  '/applications/:applicationId',
  requireUser,
  handle(async (req, res) => {
    const user = req.user!;
    const [row] = await db
      .select({ id: applications.id, userId: applications.userId, status: applications.status, companyId: jobs.companyId })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(eq(applications.id, req.params.applicationId))
      .limit(1);
    if (!row) return res.status(404).json({ error: 'Application not found' });

    const status: unknown = req.body?.status;
    const manages = await canManageCompany(user, row.companyId);
    const isApplicant = row.userId === user.id;
    if (!manages && !isApplicant) {
      return res.status(403).json({ error: 'You cannot make that change to this application.' });
    }
    const patch: Partial<typeof applications.$inferInsert> = {};

    if (status !== undefined) {
      if (row.status === 'withdrawn') return res.status(409).json({ error: 'This application is already withdrawn.' });
      const decided = row.status === 'hired' || row.status === 'declined';
      if (status === 'withdrawn' && isApplicant) {
        if (decided) return res.status(409).json({ error: `This application is already ${row.status}.` });
        patch.status = 'withdrawn';
      } else if (manages && typeof status === 'string' && EMPLOYER_STATUSES.has(status)) {
        // Hired and Declined can be undone, but only back into the pipeline.
        if (decided && status !== row.status && !WORKING.has(status)) {
          return res.status(409).json({ error: `This application is ${row.status}. Move it back to an earlier stage first.` });
        }
        if (status !== row.status) patch.status = status;
      } else {
        return res.status(403).json({ error: 'You cannot make that change to this application.' });
      }
      if (patch.status) patch.statusChangedAt = new Date();
    }
    if (req.body?.employerNote !== undefined) {
      if (!manages) return res.status(403).json({ error: 'Only the company can add notes.' });
      const employerNote = cleanText(req.body.employerNote ?? '', 2000);
      if (employerNote === null) return res.status(400).json({ error: 'Keep the note under 2,000 characters.' });
      patch.employerNote = employerNote || null;
    }
    if (Object.keys(patch).length === 0) {
      // Setting the stage it already has is not an error.
      if (status === row.status) return res.json({ id: row.id, status: row.status });
      return res.status(400).json({ error: 'Nothing to change.' });
    }
    // Only if the application is still as it was read: a withdrawal and a
    // company's change sent at the same moment must not both succeed.
    const [changed] = await db
      .update(applications)
      .set(patch)
      .where(and(eq(applications.id, row.id), eq(applications.status, row.status)))
      .returning({ id: applications.id });
    if (!changed) return res.status(409).json({ error: 'This application changed a moment ago. Reload and try again.' });
    // A new stage (or a withdrawal) goes into the history; the applicant is told of the company's.
    if (patch.status) await applicationStatusChanged({ applicationId: row.id, status: patch.status, byUserId: user.id });
    res.json({ id: row.id, status: patch.status ?? row.status });
  })
);

export default router;
