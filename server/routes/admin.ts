import { Router } from 'express';
import { and, desc, eq, gt, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db, users, companies, companyMembers, invites, occupations, passwordResets } from '../db/index.js';
import { cleanText, handle, newToken, hashToken, normalizeEmail } from '../lib/auth.js';
import { INVITE_DAYS, invitePath, isInviteRole } from '../lib/invites.js';
import { RESET_HOURS, resetPath } from '../lib/passwordResets.js';
import { uuidParam } from '../middleware/validateUuid.js';

/**
 * Admin Tools: people, company access, invites, password resets and data upkeep.
 * Mounted behind requireAdminUser, so `req.user` is always a signed-in admin.
 */
const router = Router();
router.param('id', uuidParam);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** A search term with its own LIKE wildcards made literal. */
function likeLiteral(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

function containsPattern(term: string): string {
  return `%${likeLiteral(term)}%`;
}

function pageNumber(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}

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

// ---------------------------------------------------------------------------
// Company access
// ---------------------------------------------------------------------------

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

// POST /api/admin/memberships { companyId, userId } - add a person to a company,
// active at once. A pending request for the same company becomes active.
router.post(
  '/memberships',
  handle(async (req, res) => {
    const { companyId, userId } = req.body ?? {};
    if (!isUuid(companyId) || !isUuid(userId)) return res.status(400).json({ error: 'companyId and userId are required.' });
    const [person] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!person) return res.status(404).json({ error: 'Person not found' });
    const [company] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    await db
      .insert(companyMembers)
      .values({ companyId, userId, role: 'member', status: 'active' })
      .onConflictDoUpdate({ target: [companyMembers.companyId, companyMembers.userId], set: { status: 'active' } });
    res.status(201).json({ companyId, companyName: company.name, userId, status: 'active' });
  })
);

// PATCH /api/admin/memberships { companyId, userId, decision: 'approve' | 'remove' }
router.patch(
  '/memberships',
  handle(async (req, res) => {
    const { companyId, userId, decision } = req.body ?? {};
    if (!isUuid(companyId) || !isUuid(userId)) {
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

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

interface UserMembership {
  companyId: string;
  companyName: string;
  status: string;
}

// GET /api/admin/users?q=&limit=&offset= - newest first; q matches name or email
router.get(
  '/users',
  handle(async (req, res) => {
    const term = cleanText(req.query.q, 100) ?? '';
    const limit = Math.max(1, pageNumber(req.query.limit, 100, 200));
    const offset = pageNumber(req.query.offset, 0, 1_000_000);
    const pattern = containsPattern(term);
    const where = term ? or(ilike(users.name, pattern), ilike(users.email, pattern)) : undefined;

    const [{ total }] = await db.select({ total: sql<number>`COUNT(*)::int` }).from(users).where(where);
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        createdAt: users.createdAt,
        // The outer table is named in full: Drizzle would render ${users.id} as a bare "id",
        // which inside the subquery means the company's.
        memberships: sql<UserMembership[]>`COALESCE((
          SELECT json_agg(json_build_object('companyId', c.id, 'companyName', c.name, 'status', m.status) ORDER BY c.name)
          FROM company_members m INNER JOIN companies c ON c.id = m.company_id
          WHERE m.user_id = users.id
        ), '[]'::json)`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), users.id)
      .limit(limit)
      .offset(offset);
    res.json({ users: rows, total, hasMore: offset + rows.length < total });
  })
);

const LAST_ADMIN = 'The last admin cannot be removed.';

// PATCH /api/admin/users/:id { isAdmin } - give or take the admin role.
// Nobody removes their own, and there is always at least one admin.
router.patch(
  '/users/:id',
  handle(async (req, res) => {
    const { id } = req.params;
    const isAdmin: unknown = req.body?.isAdmin;
    if (typeof isAdmin !== 'boolean') return res.status(400).json({ error: 'isAdmin must be true or false.' });

    const outcome = await db.transaction(async (tx) => {
      // Lock the admin rows, so two admins cannot each remove the other at once.
      const admins = await tx.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).for('update');
      const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
      if (!target) return 'missing';
      if (!isAdmin) {
        if (admins.some((admin) => admin.id === id) && admins.length === 1) return 'last';
        if (id === req.user!.id) return 'self';
      }
      await tx.update(users).set({ isAdmin, updatedAt: new Date() }).where(eq(users.id, id));
      return 'ok';
    });

    if (outcome === 'missing') return res.status(404).json({ error: 'Person not found' });
    if (outcome === 'last') return res.status(409).json({ error: LAST_ADMIN });
    if (outcome === 'self') return res.status(409).json({ error: 'An admin cannot remove their own admin role.' });
    res.json({ id, isAdmin });
  })
);

// DELETE /api/admin/users/:id - delete an account. Its sessions, memberships,
// applications, skills and goals go with it (ON DELETE CASCADE).
router.delete(
  '/users/:id',
  handle(async (req, res) => {
    const { id } = req.params;
    if (id === req.user!.id) return res.status(409).json({ error: 'An admin cannot delete their own account.' });

    const outcome = await db.transaction(async (tx) => {
      const admins = await tx.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).for('update');
      if (admins.some((admin) => admin.id === id) && admins.length === 1) return 'last';
      const deleted = await tx.delete(users).where(eq(users.id, id)).returning({ id: users.id });
      return deleted.length > 0 ? 'ok' : 'missing';
    });

    if (outcome === 'missing') return res.status(404).json({ error: 'Person not found' });
    if (outcome === 'last') return res.status(409).json({ error: LAST_ADMIN });
    res.json({ ok: true });
  })
);

// POST /api/admin/users/:id/reset-link - a one-time link through which that
// person chooses a new password. It replaces any link of theirs not yet used.
// The token is in this response and nowhere else. `link` is a path on this
// site, like an invite's `path`: the page showing it knows its own origin.
router.post(
  '/users/:id/reset-link',
  handle(async (req, res) => {
    const { id } = req.params;
    const token = newToken();
    const expiresAt = new Date(Date.now() + RESET_HOURS * 60 * 60 * 1000);
    const created = await db.transaction(async (tx) => {
      // Locked, so the person cannot be deleted, nor a second link made, in between.
      const [person] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1).for('update');
      if (!person) return false;
      await tx.delete(passwordResets).where(and(eq(passwordResets.userId, id), isNull(passwordResets.usedAt)));
      await tx.insert(passwordResets).values({ userId: id, tokenHash: hashToken(token), createdBy: req.user!.id, expiresAt });
      return true;
    });
    if (!created) return res.status(404).json({ error: 'Person not found' });
    res.status(201).json({ link: resetPath(token), expiresAt });
  })
);

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

// GET /api/admin/invites - invites that can still be used, newest first, and
// how many have been accepted.
router.get(
  '/invites',
  handle(async (_req, res) => {
    const rows = await db
      .select({
        id: invites.id,
        email: invites.email,
        role: invites.role,
        companyId: invites.companyId,
        companyName: companies.name,
        createdAt: invites.createdAt,
        expiresAt: invites.expiresAt,
      })
      .from(invites)
      .leftJoin(companies, eq(companies.id, invites.companyId))
      .where(and(isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
      .orderBy(desc(invites.createdAt));
    const [{ accepted }] = await db
      .select({ accepted: sql<number>`COUNT(*)::int` })
      .from(invites)
      .where(isNotNull(invites.acceptedAt));
    res.json({ invites: rows, accepted });
  })
);

// POST /api/admin/invites { email, role, companyId? } - create an invite and
// return its link. The token is in this response and nowhere else.
router.post(
  '/invites',
  handle(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const role: unknown = req.body?.role;
    if (!email) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!isInviteRole(role)) return res.status(400).json({ error: 'Role must be user, employer or admin.' });

    let company: { id: string; name: string } | null = null;
    if (role === 'employer') {
      const companyId: unknown = req.body?.companyId;
      if (!isUuid(companyId)) return res.status(400).json({ error: 'Choose a company.' });
      const [row] = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (!row) return res.status(404).json({ error: 'Company not found' });
      company = row;
    }

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return res.status(409).json({ error: 'An account with that email exists. Change it under People.' });

    const token = newToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
    const created = await db.transaction(async (tx) => {
      // One invite per address at a time: a new one replaces any not yet accepted.
      await tx.delete(invites).where(and(eq(invites.email, email), isNull(invites.acceptedAt)));
      const [row] = await tx
        .insert(invites)
        .values({ email, role, companyId: company?.id ?? null, tokenHash: hashToken(token), createdBy: req.user!.id, expiresAt })
        .returning({ id: invites.id, createdAt: invites.createdAt });
      return row;
    });

    res.status(201).json({
      invite: {
        id: created.id,
        email,
        role,
        companyId: company?.id ?? null,
        companyName: company?.name ?? null,
        createdAt: created.createdAt,
        expiresAt,
      },
      token,
      path: invitePath(token),
    });
  })
);

// DELETE /api/admin/invites/:id - revoke an invite that has not been accepted
router.delete(
  '/invites/:id',
  handle(async (req, res) => {
    const deleted = await db
      .delete(invites)
      .where(and(eq(invites.id, req.params.id), isNull(invites.acceptedAt)))
      .returning({ id: invites.id });
    if (deleted.length === 0) return res.status(404).json({ error: 'Invite not found' });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// GET /api/admin/paths?status=draft|approved - careers by the state of their path
router.get(
  '/paths',
  handle(async (req, res) => {
    const status = req.query.status === 'approved' ? 'approved' : 'draft';
    const rows = await db
      .select({
        id: occupations.id,
        title: occupations.title,
        pathStatus: occupations.pathStatus,
        skillCount: sql<number>`(SELECT COUNT(*)::int FROM occupation_skills os WHERE os.occupation_id = occupations.id)`,
      })
      .from(occupations)
      .where(eq(occupations.pathStatus, status))
      .orderBy(occupations.title);
    res.json({ paths: rows });
  })
);

const companyProfile = {
  id: companies.id,
  name: companies.name,
  slug: companies.slug,
  domain: companies.domain,
  featured: companies.featured,
  industry: companies.industry,
  description: companies.description,
};

// GET /api/admin/companies?q= - company type-ahead with the profile fields,
// never cached (the public list is). Names that start with the term come first.
router.get(
  '/companies',
  handle(async (req, res) => {
    const term = cleanText(req.query.q, 100) ?? '';
    if (term.length < 2) return res.json({ companies: [] });
    const rows = await db
      .select(companyProfile)
      .from(companies)
      .where(ilike(companies.name, containsPattern(term)))
      .orderBy(sql`(${companies.name} ILIKE ${`${likeLiteral(term)}%`}) DESC`, desc(companies.featured), companies.name)
      .limit(8);
    res.json({ companies: rows });
  })
);

/** A bare hostname: labels of letters, digits and hyphens, then a letters-only ending. */
const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// PATCH /api/admin/companies/:id { domain?, featured?, industry?, description? }
// The logo is looked up from the domain; a featured company is listed and drawn
// first; industry and description are the one line that introduces it.
router.patch(
  '/companies/:id',
  handle(async (req, res) => {
    const body: { domain?: unknown; featured?: unknown; industry?: unknown; description?: unknown } = req.body ?? {};
    const change: {
      domain?: string | null;
      featured?: boolean;
      industry?: string | null;
      description?: string | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    if (body.domain !== undefined) {
      if (body.domain === null || body.domain === '') {
        change.domain = null;
      } else {
        const domain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : '';
        if (!HOSTNAME.test(domain)) {
          return res.status(400).json({ error: 'Enter a bare domain such as tesla.com, without a scheme or path.' });
        }
        change.domain = domain;
      }
    }
    if (body.featured !== undefined) {
      if (typeof body.featured !== 'boolean') return res.status(400).json({ error: 'featured must be true or false.' });
      change.featured = body.featured;
    }
    // Free text: trimmed, single-spaced, null when emptied.
    for (const [field, max] of [['industry', 80], ['description', 600]] as const) {
      const value = body[field];
      if (value === undefined) continue;
      if (value !== null && typeof value !== 'string') return res.status(400).json({ error: `${field} must be text.` });
      const text = (value ?? '').replace(/\s+/g, ' ').trim();
      if (text.length > max) return res.status(400).json({ error: `${field} is limited to ${max} characters.` });
      change[field] = text || null;
    }
    if (
      change.domain === undefined &&
      change.featured === undefined &&
      change.industry === undefined &&
      change.description === undefined
    ) {
      return res.status(400).json({ error: 'Nothing to change.' });
    }

    const [updated] = await db.update(companies).set(change).where(eq(companies.id, req.params.id)).returning(companyProfile);
    if (!updated) return res.status(404).json({ error: 'Company not found' });
    res.json(updated);
  })
);

export default router;
