import { Router } from 'express';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, companies, companyMembers, factories, jobs } from '../db/index.js';
import { isService, notAnEmployerHere } from '../lib/military.js';
import { handle, requireUser } from '../lib/auth.js';
import { uuidParam } from '../middleware/validateUuid.js';
import { isUuid } from '../lib/writes.js';
import { factoryInScope } from '../lib/scope.js';
import { DECLINED_WAIT_DAYS, accessRequested, askAgainAt } from '../lib/notices.js';
import { readCompanyTerm, searchCompanies } from '../lib/companySearch.js';
import { pageLimit } from '../lib/paging.js';
import { companyRequestsRouter } from './companyRequests.js';
import { recordAudit } from '../lib/audit.js';
import { jobIsOpen } from '../lib/openJobs.js';

/**
 * The employer area. An employer is a signed-in person with an active
 * membership in a company. Joining is a request that an admin approves;
 * an admin's own request is active at once. A declined request stays on
 * record: the person sees it, and can ask the same company again after a week.
 */
const router = Router();
router.use(requireUser);
router.param('companyId', uuidParam);
// Asking for a company, or a plant of one, that is not in the data.
router.use('/company-requests', companyRequestsRouter);

// GET /api/employer - the person's companies, each with its factories in the
// region and the jobs its members posted, with applicant counts. Jobs that came
// from the company's own careers site are kept in step with it and are not
// managed here: each company carries how many of those are open (`listedJobs`).
router.get(
  '/',
  handle(async (req, res) => {
    const memberships = await db
      .select({
        companyId: companies.id,
        companyName: companies.name,
        role: companyMembers.role,
        status: companyMembers.status,
        decidedAt: companyMembers.decidedAt,
      })
      .from(companyMembers)
      .innerJoin(companies, eq(companies.id, companyMembers.companyId))
      .where(eq(companyMembers.userId, req.user!.id))
      .orderBy(companies.name);

    const activeIds = memberships.filter((m) => m.status === 'active').map((m) => m.companyId);
    const factoryRows = activeIds.length
      ? await db
          .select({
            id: factories.id,
            companyId: factories.companyId,
            name: factories.name,
            // The street tells apart two plants of one company in one city.
            address: factories.address,
            city: factories.city,
            state: factories.state,
          })
          .from(factories)
          .where(and(inArray(factories.companyId, activeIds), factoryInScope()))
          .orderBy(factories.name)
      : [];
    const jobRows = activeIds.length
      ? await db
          .select({
            id: jobs.id,
            serial: jobs.serial,
            companyId: jobs.companyId,
            title: jobs.title,
            status: jobs.status,
            postedAt: jobs.postedAt,
            expiresAt: jobs.expiresAt,
            factoryName: factories.name,
            city: factories.city,
            // With the number, what the job's address is written from (shared/jobs.ts).
            companyName: sql<string>`(SELECT c.name FROM companies c WHERE c.id = ${jobs.companyId})`,
            companySlug: sql<string | null>`(SELECT c.slug FROM companies c WHERE c.id = ${jobs.companyId})`,
            occupationTitle: sql<string>`(SELECT o.title FROM occupations o WHERE o.id = ${jobs.occupationId})`,
            applicants: sql<number>`(SELECT COUNT(*)::int FROM applications a WHERE a.job_id = ${jobs.id})`,
            newApplicants: sql<number>`(
              SELECT COUNT(*)::int FROM applications a WHERE a.job_id = ${jobs.id} AND a.status = 'applied'
            )`,
          })
          .from(jobs)
          .innerJoin(factories, eq(factories.id, jobs.factoryId))
          .where(and(inArray(jobs.companyId, activeIds), sql`${jobs.source} IS NULL`))
          .orderBy(sql`${jobs.postedAt} DESC`)
      : [];
    const listed = activeIds.length
      ? await db
          .select({ companyId: jobs.companyId, open: sql<number>`COUNT(*)::int` })
          .from(jobs)
          .where(and(inArray(jobs.companyId, activeIds), sql`${jobs.source} IS NOT NULL`, jobIsOpen()))
          .groupBy(jobs.companyId)
      : [];

    res.json({
      companies: memberships.map((m) => ({
        ...m,
        // For a declined request: when the person can ask again.
        askAgainAt: m.status === 'declined' && m.decidedAt ? askAgainAt(m.decidedAt) : null,
        factories: factoryRows.filter((f) => f.companyId === m.companyId),
        jobs: jobRows.filter((j) => j.companyId === m.companyId),
        listedJobs: listed.find((row) => row.companyId === m.companyId)?.open ?? 0,
      })),
    });
  })
);

// GET /api/employer/companies?q=&limit= - find a company to join, by name.
// Tolerant of spelling, spacing, "&" and the legal form; name matches only,
// the closest first. `total` is how many match; `close` says that no name
// matched and these are the nearest ones instead (see lib/companySearch.ts).
router.get(
  '/companies',
  handle(async (req, res) => {
    const term = readCompanyTerm(req.query.q);
    if (!term) return res.json({ companies: [], total: 0, close: false });
    res.json(await searchCompanies(term, pageLimit(req.query.limit, 8, 20)));
  })
);

// POST /api/employer/memberships { companyId } - ask to join a company
router.post(
  '/memberships',
  handle(async (req, res) => {
    const user = req.user!;
    const companyId: unknown = req.body?.companyId;
    if (!isUuid(companyId)) {
      return res.status(400).json({ error: 'Choose a company.' });
    }
    const [company] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    // A military service is not joined: it posts no jobs here.
    if (await isService(db, company.id)) return res.status(400).json({ error: notAnEmployerHere(company.name) });

    const mine = and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, user.id));
    const status = user.isAdmin ? 'active' : 'requested';
    const created = await db
      .insert(companyMembers)
      .values({ companyId, userId: user.id, role: 'member', status })
      .onConflictDoNothing()
      .returning({ status: companyMembers.status });
    let asked = created.length > 0 && status === 'requested';
    // An admin who joins a company has given themselves access: that goes in the audit log.
    let joined = created.length > 0 && status === 'active';
    if (created.length === 0) {
      const [existing] = await db.select({ status: companyMembers.status, decidedAt: companyMembers.decidedAt }).from(companyMembers).where(mine).limit(1);
      if (existing?.status === 'declined') {
        // A declined request stands for a week (an admin joins regardless).
        const again = existing.decidedAt ? askAgainAt(existing.decidedAt) : null;
        if (!user.isAdmin && again && again > new Date()) {
          const on = again.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
          return res.status(409).json({
            error: `Your request to join ${company.name} was declined. You can ask again from ${on}, ${DECLINED_WAIT_DAYS} days after it.`,
          });
        }
        // The same row, asked afresh. Only if it is still declined: two presses make one request.
        const reopened = await db
          .update(companyMembers)
          .set({ status, role: 'member', createdAt: new Date(), decidedAt: null, decidedBy: null })
          .where(and(mine, eq(companyMembers.status, 'declined')))
          .returning({ status: companyMembers.status });
        asked = reopened.length > 0 && status === 'requested';
        joined = reopened.length > 0 && status === 'active';
      }
    }
    const [row] = await db.select({ status: companyMembers.status, role: companyMembers.role }).from(companyMembers).where(mine).limit(1);
    // The admins are told of a request that was made just now, not of one already waiting.
    if (asked) await accessRequested({ requesterId: user.id, companyId });
    if (joined) {
      await recordAudit(db, { actor: user, kind: 'access', recordId: user.id, recordName: `${user.email} · ${company.name}`, action: 'added to company', detail: { companyId } });
    }
    res.status(201).json({ companyId, status: row.status, role: row.role });
  })
);

// DELETE /api/employer/memberships/:companyId - leave a company, or cancel a
// request: a person's own access is theirs to give up, an admin's included.
// A declined request is not the person's to remove: it is the record that
// keeps them from asking again at once. An admin who leaves a company has
// changed their own access, as joining did: that goes in the audit log.
router.delete(
  '/memberships/:companyId',
  handle(async (req, res) => {
    const user = req.user!;
    const removed = await db
      .delete(companyMembers)
      .where(
        and(
          eq(companyMembers.companyId, req.params.companyId),
          eq(companyMembers.userId, user.id),
          inArray(companyMembers.status, ['requested', 'active'])
        )
      )
      .returning({ status: companyMembers.status });
    if (user.isAdmin && removed.some((row) => row.status === 'active')) {
      const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, req.params.companyId)).limit(1);
      await recordAudit(db, {
        actor: user,
        kind: 'access',
        recordId: user.id,
        recordName: `${user.email} · ${company?.name ?? 'a company'}`,
        action: 'removed from company',
        detail: { companyId: req.params.companyId, by: 'themselves' },
      });
    }
    res.json({ ok: true, left: removed.length > 0 });
  })
);

export default router;
