import { Router, type Request } from 'express';
import { and, eq, gt, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import {
  db,
  jobs,
  jobSkills,
  applications,
  companies,
  factories,
  occupations,
  occupationSkills,
  skills,
  companyMembers,
} from '../db/index.js';
import { cleanText, getSessionUser, handle, requireUser, type SessionUser } from '../lib/auth.js';
import { uuidParam } from '../middleware/validateUuid.js';
import { SCOPE } from '../../shared/scope.js';
import { factoryInScope, isStateInScope } from '../lib/scope.js';
import { applicationReceived, applicationStatusChanged } from '../lib/notices.js';

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

/** Open, unexpired, and at a factory inside the app's region. */
const isOpenInScope: SQL = and(
  eq(jobs.status, 'open'),
  gt(jobs.expiresAt, sql`now()`),
  factoryInScope()
) as SQL;

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
  expiresAt: jobs.expiresAt,
  companyId: companies.id,
  companyName: companies.name,
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

async function canManageCompany(user: SessionUser, companyId: string): Promise<boolean> {
  if (user.isAdmin) return true;
  const [row] = await db
    .select({ status: companyMembers.status })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, user.id)))
    .limit(1);
  return row?.status === 'active';
}

/** Whole cents, zero or more. Accepts numbers only. */
function cents(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000_000 ? value : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// GET /api/jobs?occupationId=&companyId=&factoryId=&q=&limit=
router.get(
  '/',
  handle(async (req, res) => {
    const filters: SQL[] = [isOpenInScope];
    const { occupationId, companyId, factoryId, q, state } = req.query;
    if (isUuid(occupationId)) filters.push(eq(jobs.occupationId, occupationId));
    if (isUuid(companyId)) filters.push(eq(jobs.companyId, companyId));
    if (isUuid(factoryId)) filters.push(eq(jobs.factoryId, factoryId));
    if (typeof q === 'string' && q.trim()) filters.push(ilike(jobs.title, `%${q.trim().slice(0, 80)}%`));
    if (typeof state === 'string' && /^[A-Za-z]{2}$/.test(state)) filters.push(eq(factories.state, state.toUpperCase()));
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

    const rows = await db
      .select(jobSummary)
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .innerJoin(factories, eq(factories.id, jobs.factoryId))
      .innerJoin(occupations, eq(occupations.id, jobs.occupationId))
      .where(and(...filters))
      .orderBy(sql`${jobs.postedAt} DESC`)
      .limit(limit);
    res.json({ jobs: rows });
  })
);

// GET /api/jobs/:id - one job with its skills. For a signed-in person, each
// skill says whether they hold it and the response includes their application.
router.get(
  '/:id',
  handle(async (req, res) => {
    const user = await getSessionUser(req);
    const [job] = await db
      .select({ ...jobSummary, description: jobs.description, applyUrl: jobs.applyUrl, closedReason: jobs.closedReason })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .innerJoin(factories, eq(factories.id, jobs.factoryId))
      .innerJoin(occupations, eq(occupations.id, jobs.occupationId))
      .where(eq(jobs.id, req.params.id))
      .limit(1);
    if (!job || !isStateInScope(job.state)) return res.status(404).json({ error: 'Job not found' });

    const canManage = user ? await canManageCompany(user, job.companyId) : false;
    const isOpen = job.status === 'open' && job.expiresAt > new Date();
    // A closed or expired job stays visible to its company and to people who applied.
    let myApplication: { id: string; status: string; createdAt: Date } | null = null;
    if (user) {
      const [mine] = await db
        .select({ id: applications.id, status: applications.status, createdAt: applications.createdAt })
        .from(applications)
        .where(and(eq(applications.jobId, job.id), eq(applications.userId, user.id)))
        .limit(1);
      myApplication = mine ?? null;
    }
    if (!isOpen && !canManage && !myApplication) return res.status(404).json({ error: 'Job not found' });

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

    res.json({ job: { ...job, isOpen }, skills: skillRows, myApplication, canManage });
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
// Skills default to the career's: stages 1 and 2 (or unstaged) required, stage 3 optional.
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
      .select({ id: occupations.id, title: occupations.title })
      .from(occupations)
      .where(eq(occupations.id, occupationId))
      .limit(1);
    if (!occupation) return res.status(400).json({ error: 'That career does not exist.' });

    const parsed = readJobFields(req.body, true);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    const explicit: unknown = req.body?.skills;
    let skillRows: JobSkillRow[];
    if (Array.isArray(explicit)) {
      const tagged = await readJobSkills(explicit);
      if ('error' in tagged) return res.status(400).json({ error: tagged.error });
      skillRows = tagged.rows;
    } else {
      const defaults = await db
        .select({ skillId: occupationSkills.skillId, stage: occupationSkills.stage })
        .from(occupationSkills)
        .where(eq(occupationSkills.occupationId, occupationId));
      skillRows = defaults.map((row) => ({ skillId: row.skillId, required: row.stage !== 3 }));
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
    const [job] = await db.select({ id: jobs.id, companyId: jobs.companyId }).from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!(await canManageCompany(req.user!, job.companyId))) return res.status(403).json({ error: 'Not your job to change.' });

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
    const [job] = await db.select({ id: jobs.id, companyId: jobs.companyId }).from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!(await canManageCompany(req.user!, job.companyId))) return res.status(403).json({ error: 'Not your job to delete.' });
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
    const rows = (await db.execute(sql`
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
    `)) as unknown as ApplicantRow[];

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
