import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db, users, companies, companyMembers } from '../db/index.js';
import { handle } from '../lib/auth.js';

/** Admin-only: people, and requests to join companies. Mounted behind requireAdmin. */
const router = Router();

// GET /api/admin/overview - the counts an admin checks first
router.get(
  '/overview',
  handle(async (_req, res) => {
    const [row] = await db
      .select({
        users: sql<number>`(SELECT COUNT(*)::int FROM users)`,
        pendingMemberships: sql<number>`(SELECT COUNT(*)::int FROM company_members WHERE status = 'requested')`,
        openJobs: sql<number>`(SELECT COUNT(*)::int FROM jobs WHERE status = 'open' AND expires_at > now())`,
        applications: sql<number>`(SELECT COUNT(*)::int FROM applications)`,
      })
      .from(sql`(SELECT 1) AS one`);
    res.json(row);
  })
);

// GET /api/admin/memberships?status=requested|active
router.get(
  '/memberships',
  handle(async (req, res) => {
    const status = req.query.status === 'active' ? 'active' : 'requested';
    const rows = await db
      .select({
        companyId: companies.id,
        companyName: companies.name,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        role: companyMembers.role,
        status: companyMembers.status,
        createdAt: companyMembers.createdAt,
      })
      .from(companyMembers)
      .innerJoin(companies, eq(companies.id, companyMembers.companyId))
      .innerJoin(users, eq(users.id, companyMembers.userId))
      .where(eq(companyMembers.status, status))
      .orderBy(companyMembers.createdAt);
    res.json({ memberships: rows });
  })
);

// PATCH /api/admin/memberships { companyId, userId, decision: 'approve' | 'remove' }
router.patch(
  '/memberships',
  handle(async (req, res) => {
    const { companyId, userId, decision } = req.body ?? {};
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof companyId !== 'string' || typeof userId !== 'string' || !UUID.test(companyId) || !UUID.test(userId)) {
      return res.status(400).json({ error: 'companyId and userId are required.' });
    }
    const match = and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, userId));
    if (decision === 'approve') {
      const updated = await db.update(companyMembers).set({ status: 'active' }).where(match).returning();
      if (updated.length === 0) return res.status(404).json({ error: 'Request not found' });
      return res.json({ status: 'active' });
    }
    if (decision === 'remove') {
      await db.delete(companyMembers).where(match);
      return res.json({ status: 'removed' });
    }
    res.status(400).json({ error: "decision must be 'approve' or 'remove'." });
  })
);

// GET /api/admin/users
router.get(
  '/users',
  handle(async (_req, res) => {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        companies: sql<number>`(
          SELECT COUNT(*)::int FROM company_members m WHERE m.user_id = ${users.id} AND m.status = 'active'
        )`,
        applications: sql<number>`(SELECT COUNT(*)::int FROM applications a WHERE a.user_id = ${users.id})`,
      })
      .from(users)
      .orderBy(sql`${users.createdAt} DESC`)
      .limit(500);
    res.json({ users: rows });
  })
);

export default router;
