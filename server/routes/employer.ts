import { Router } from 'express';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, companies, companyMembers, factories, jobs } from '../db/index.js';
import { handle, requireUser } from '../lib/auth.js';
import { uuidParam } from '../middleware/validateUuid.js';
import { factoryInScope } from '../lib/scope.js';
import { DECLINED_WAIT_DAYS, accessRequested, askAgainAt } from '../lib/notices.js';

/**
 * The employer area. An employer is a signed-in person with an active
 * membership in a company. Joining is a request that an admin approves;
 * an admin's own request is active at once. A declined request stays on
 * record: the person sees it, and can ask the same company again after a week.
 */
const router = Router();
router.use(requireUser);
router.param('companyId', uuidParam);

// GET /api/employer - the person's companies, each with its factories in the
// region and its jobs with applicant counts.
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
            applicants: sql<number>`(SELECT COUNT(*)::int FROM applications a WHERE a.job_id = ${jobs.id})`,
            newApplicants: sql<number>`(
              SELECT COUNT(*)::int FROM applications a WHERE a.job_id = ${jobs.id} AND a.status = 'applied'
            )`,
          })
          .from(jobs)
          .innerJoin(factories, eq(factories.id, jobs.factoryId))
          .where(inArray(jobs.companyId, activeIds))
          .orderBy(sql`${jobs.postedAt} DESC`)
      : [];

    res.json({
      companies: memberships.map((m) => ({
        ...m,
        // For a declined request: when the person can ask again.
        askAgainAt: m.status === 'declined' && m.decidedAt ? askAgainAt(m.decidedAt) : null,
        factories: factoryRows.filter((f) => f.companyId === m.companyId),
        jobs: jobRows.filter((j) => j.companyId === m.companyId),
      })),
    });
  })
);

// POST /api/employer/memberships { companyId } - ask to join a company
router.post(
  '/memberships',
  handle(async (req, res) => {
    const user = req.user!;
    const companyId: unknown = req.body?.companyId;
    if (typeof companyId !== 'string' || !/^[0-9a-f-]{36}$/i.test(companyId)) {
      return res.status(400).json({ error: 'Choose a company.' });
    }
    const [company] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const mine = and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, user.id));
    const status = user.isAdmin ? 'active' : 'requested';
    const created = await db
      .insert(companyMembers)
      .values({ companyId, userId: user.id, role: user.isAdmin ? 'owner' : 'member', status })
      .onConflictDoNothing()
      .returning({ status: companyMembers.status });
    let asked = created.length > 0 && status === 'requested';
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
          .set({ status, role: user.isAdmin ? 'owner' : 'member', createdAt: new Date(), decidedAt: null, decidedBy: null })
          .where(and(mine, eq(companyMembers.status, 'declined')))
          .returning({ status: companyMembers.status });
        asked = reopened.length > 0 && status === 'requested';
      }
    }
    const [row] = await db.select({ status: companyMembers.status, role: companyMembers.role }).from(companyMembers).where(mine).limit(1);
    // The admins are told of a request that was made just now, not of one already waiting.
    if (asked) await accessRequested({ requesterId: user.id, companyId });
    res.status(201).json({ companyId, status: row.status, role: row.role });
  })
);

// DELETE /api/employer/memberships/:companyId - leave a company, or cancel a
// request. A declined request is not the person's to remove: it is the record
// that keeps them from asking again at once.
router.delete(
  '/memberships/:companyId',
  handle(async (req, res) => {
    await db
      .delete(companyMembers)
      .where(
        and(
          eq(companyMembers.companyId, req.params.companyId),
          eq(companyMembers.userId, req.user!.id),
          inArray(companyMembers.status, ['requested', 'active'])
        )
      );
    res.json({ ok: true });
  })
);

export default router;
