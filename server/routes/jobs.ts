import { Router, type Request } from 'express';
import { and, eq, gt, ilike, sql, type SQL } from 'drizzle-orm';
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
const TERMINAL = new Set(['hired', 'declined', 'withdrawn']);

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
    if (payMin === null || payMax === null || payMin === 0 || payMax < payMin) {
      return { error: 'Enter a pay range: a lowest and a highest amount, lowest first.' };
    }
    values.payMin = payMin;
    values.payMax = payMax;
  }
  if (body?.applyUrl !== undefined) {
    const applyUrl = cleanText(body.applyUrl ?? '', 500);
    if (applyUrl === null || (applyUrl && !/^https:\/\/[^\s]+$/i.test(applyUrl))) {
      return { error: 'The application link must start with https://' };
    }
    values.applyUrl = applyUrl || null;
  }
  return { values };
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
    let skillRows: { skillId: string; required: boolean }[];
    if (Array.isArray(explicit)) {
      const seen = new Set<string>();
      skillRows = [];
      for (const item of explicit as { skillId?: unknown; required?: unknown }[]) {
        if (!isUuid(item?.skillId) || seen.has(item.skillId)) continue;
        seen.add(item.skillId);
        skillRows.push({ skillId: item.skillId, required: item.required !== false });
      }
    } else {
      const defaults = await db
        .select({ skillId: occupationSkills.skillId, stage: occupationSkills.stage })
        .from(occupationSkills)
        .where(eq(occupationSkills.occupationId, occupationId));
      skillRows = defaults.map((row) => ({ skillId: row.skillId, required: row.stage !== 3 }));
    }

    const created = await db.transaction(async (tx) => {
      const [job] = await tx
        .insert(jobs)
        .values({
          companyId,
          factoryId,
          occupationId,
          title: parsed.values.title ?? occupation.title,
          description: parsed.values.description ?? null,
          employmentType: parsed.values.employmentType ?? 'full-time',
          shift: parsed.values.shift ?? null,
          payMin: parsed.values.payMin,
          payMax: parsed.values.payMax,
          payPeriod: parsed.values.payPeriod ?? 'hour',
          applyUrl: parsed.values.applyUrl ?? null,
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

// PATCH /api/jobs/:id - edit fields, close, or reopen (reopening renews the 60 days)
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
    await db.update(jobs).set(patch).where(eq(jobs.id, job.id));
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
    if (!created) return res.status(409).json({ error: 'You have already applied to this job.' });
    res.status(201).json({ id: created.id, status: 'applied' });
  })
);

interface ApplicantRow {
  id: string;
  status: string;
  note: string | null;
  employer_note: string | null;
  created_at: Date;
  user_id: string;
  name: string;
  email: string;
  home_zip: string | null;
  held_required: number;
  total_required: number;
  held_optional: number;
}

// GET /api/jobs/:id/applications - applicants, ranked: most required skills
// held first, then optional skills held, then who applied first.
router.get(
  '/:id/applications',
  requireUser,
  handle(async (req, res) => {
    const [job] = await db.select({ id: jobs.id, companyId: jobs.companyId }).from(jobs).where(eq(jobs.id, req.params.id)).limit(1);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!(await canManageCompany(req.user!, job.companyId))) {
      return res.status(403).json({ error: 'Only the company can read its applicants.' });
    }
    const rows = (await db.execute(sql`
      SELECT a.id, a.status, a.note, a.employer_note, a.created_at,
             u.id AS user_id, u.name, u.email, u.home_zip,
             (SELECT COUNT(*)::int FROM job_skills js
                JOIN user_skills us ON us.skill_id = js.skill_id AND us.user_id = a.user_id AND us.status = 'held'
               WHERE js.job_id = a.job_id AND js.required) AS held_required,
             (SELECT COUNT(*)::int FROM job_skills js WHERE js.job_id = a.job_id AND js.required) AS total_required,
             (SELECT COUNT(*)::int FROM job_skills js
                JOIN user_skills us ON us.skill_id = js.skill_id AND us.user_id = a.user_id AND us.status = 'held'
               WHERE js.job_id = a.job_id AND NOT js.required) AS held_optional
        FROM applications a
        JOIN users u ON u.id = a.user_id
       WHERE a.job_id = ${job.id}
    `)) as unknown as ApplicantRow[];

    const score = (r: ApplicantRow) => (r.total_required > 0 ? r.held_required / r.total_required : 0);
    const ranked = [...rows].sort(
      (a, b) =>
        score(b) - score(a) ||
        b.held_optional - a.held_optional ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    res.json({
      // Skills are self-reported by applicants; nothing here is verified.
      skillsAreSelfReported: true,
      applications: ranked.map((r) => ({
        id: r.id,
        status: r.status,
        note: r.note,
        employerNote: r.employer_note,
        createdAt: r.created_at,
        applicant: { id: r.user_id, name: r.name, email: r.email, homeZip: r.home_zip },
        heldRequired: r.held_required,
        totalRequired: r.total_required,
        heldOptional: r.held_optional,
      })),
    });
  })
);

// PATCH /api/jobs/applications/:applicationId { status?, employerNote? }
// The company moves an application through its stages or declines it.
// The applicant can only withdraw.
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
    const patch: Partial<typeof applications.$inferInsert> = {};

    if (status !== undefined) {
      if (TERMINAL.has(row.status)) return res.status(409).json({ error: `This application is already ${row.status}.` });
      if (status === 'withdrawn' && row.userId === user.id) {
        patch.status = 'withdrawn';
      } else if (manages && typeof status === 'string' && EMPLOYER_STATUSES.has(status)) {
        patch.status = status;
      } else {
        return res.status(403).json({ error: 'You cannot make that change to this application.' });
      }
      patch.statusChangedAt = new Date();
    }
    if (req.body?.employerNote !== undefined) {
      if (!manages) return res.status(403).json({ error: 'Only the company can add notes.' });
      const employerNote = cleanText(req.body.employerNote ?? '', 2000);
      if (employerNote === null) return res.status(400).json({ error: 'Keep the note under 2,000 characters.' });
      patch.employerNote = employerNote || null;
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to change.' });
    await db.update(applications).set(patch).where(eq(applications.id, row.id));
    res.json({ id: row.id, status: patch.status ?? row.status });
  })
);

export default router;
