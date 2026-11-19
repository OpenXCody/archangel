import { Router } from 'express';
import { and, desc, eq, gt, ilike, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { db, users, companies, companyMembers, invites, occupations, passwordResets, sessions, auditLog } from '../db/index.js';
import { cleanText, currentSessionHash, handle, newToken, hashToken, normalizeEmail } from '../lib/auth.js';
import { changedFields, isAuditKind, recordAudit, type Executor } from '../lib/audit.js';
import { inviteDays, invitePath, isInviteRole } from '../lib/invites.js';
import { RecordRefusal, changeRecord, isRecordKind, readRecord } from '../lib/records.js';
import { mergeRecords } from '../lib/recordMerge.js';
import { searchRecords, similarRecords } from '../lib/recordSearch.js';
import { RESET_HOURS, resetPath } from '../lib/passwordResets.js';
import { accessDecided, emailAtDomain, sendAdminResetLink, sendInvite } from '../lib/notices.js';
import { uuidParam } from '../middleware/validateUuid.js';
import { jobIsOpen } from '../lib/openJobs.js';
import { isUuid } from '../lib/writes.js';
import { pageLimit, pageOffset } from '../lib/paging.js';
import { rowsOf } from '../lib/rows.js';
import { containing, likeLiteral } from '../lib/like.js';
import { decideReview, intakeSources, reviewQueue, waitingMatches } from '../lib/intake.js';

/**
 * Admin Tools: people, company access, invites, password resets and data upkeep.
 * Mounted behind requireAdminUser, so `req.user` is always a signed-in admin.
 */
const router = Router();
router.param('id', uuidParam);

// GET /api/admin/overview - the counts an admin checks first
router.get(
  '/overview',
  handle(async (_req, res) => {
    const [row] = await db
      .select({
        users: sql<number>`(SELECT COUNT(*)::int FROM users)`,
        pendingMemberships: sql<number>`(SELECT COUNT(*)::int FROM company_members WHERE status = 'requested')`,
        openJobs: sql<number>`(SELECT COUNT(*)::int FROM jobs WHERE ${jobIsOpen()})`,
        applications: sql<number>`(SELECT COUNT(*)::int FROM applications)`,
        // With pendingMemberships, what Admin Tools lists as waiting.
        draftPaths: sql<number>`(SELECT COUNT(*)::int FROM occupations WHERE path_status = 'draft')`,
      })
      .from(sql`(SELECT 1) AS one`);
    // Matches a source's run was not sure of: waiting for a person, under Data.
    res.json({ ...row, waitingMatches: await waitingMatches() });
  })
);

// ---------------------------------------------------------------------------
// Company access
// ---------------------------------------------------------------------------

/** How far back the list of declined requests goes. */
const DECLINED_LIST_DAYS = 30;

// GET /api/admin/memberships?status=requested|active|declined
// Requests oldest first; declined ones from the last 30 days, newest first.
// Each row carries what helps decide it: the company's domain, whether the
// person's address is at it, and how many active members the company has.
router.get(
  '/memberships',
  handle(async (req, res) => {
    const status = req.query.status === 'active' ? 'active' : req.query.status === 'declined' ? 'declined' : 'requested';
    const rows = await db
      .select({
        companyId: companies.id,
        companyName: companies.name,
        companyDomain: companies.domain,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        role: companyMembers.role,
        status: companyMembers.status,
        createdAt: companyMembers.createdAt,
        decidedAt: companyMembers.decidedAt,
        // When the person's account was made, and the other companies they already have access to.
        userCreatedAt: users.createdAt,
        otherCompanies: sql<string[]>`COALESCE((
          SELECT json_agg(c2.name ORDER BY c2.name)
          FROM company_members m2 INNER JOIN companies c2 ON c2.id = m2.company_id
          WHERE m2.user_id = ${users.id} AND m2.status = 'active' AND m2.company_id <> ${companies.id}
        ), '[]'::json)`,
        activeMembers: sql<number>`(
          SELECT COUNT(*)::int FROM company_members other
          WHERE other.company_id = ${companies.id} AND other.status = 'active'
        )`,
      })
      .from(companyMembers)
      .innerJoin(companies, eq(companies.id, companyMembers.companyId))
      .innerJoin(users, eq(users.id, companyMembers.userId))
      .where(
        status === 'declined'
          ? and(eq(companyMembers.status, status), gt(companyMembers.decidedAt, new Date(Date.now() - DECLINED_LIST_DAYS * 24 * 60 * 60 * 1000)))
          : eq(companyMembers.status, status)
      )
      .orderBy(status === 'declined' ? desc(companyMembers.decidedAt) : companyMembers.createdAt);
    res.json({
      memberships: rows.map((row) => ({
        ...row,
        emailDomain: row.userEmail.slice(row.userEmail.lastIndexOf('@') + 1),
        // Null when the company has no domain on record.
        domainMatches: emailAtDomain(row.userEmail, row.companyDomain),
      })),
    });
  })
);

/** The audit line for a change to one person's access to one company. */
async function accessAudit(actor: { id: string; name: string }, ids: { userId: string; companyId: string }, action: string): Promise<void> {
  const [row] = await db
    .select({ email: users.email, company: companies.name })
    .from(users)
    .innerJoin(companies, eq(companies.id, ids.companyId))
    .where(eq(users.id, ids.userId))
    .limit(1);
  if (!row) return;
  await recordAudit(db, {
    actor,
    kind: 'access',
    recordId: ids.userId,
    recordName: `${row.email} · ${row.company}`,
    action,
    detail: { companyId: ids.companyId },
  });
}

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
    const match = and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, userId));
    const [before] = await db.select({ status: companyMembers.status }).from(companyMembers).where(match).limit(1);
    const decidedAt = new Date();
    await db
      .insert(companyMembers)
      .values({ companyId, userId, role: 'member', status: 'active', decidedAt, decidedBy: req.user!.id })
      .onConflictDoUpdate({
        target: [companyMembers.companyId, companyMembers.userId],
        set: { status: 'active', decidedAt, decidedBy: req.user!.id },
      });
    // The person is told, unless they already had the access.
    if (before?.status !== 'active') {
      await accessAudit(req.user!, { userId, companyId }, 'added to company');
      await accessDecided({ userId, companyId, decision: 'approved', requested: before?.status === 'requested', decidedAt, byUserId: req.user!.id });
    }
    res.status(201).json({ companyId, companyName: company.name, userId, status: 'active' });
  })
);

// PATCH /api/admin/memberships { companyId, userId, decision: 'approve' | 'decline' | 'reopen' | 'remove' }
// - approve: a request, or one declined earlier, becomes an active membership.
// - decline: a request is refused. The row stays as 'declined', with when and
//   by whom, so the person is told and cannot ask again for a week.
// - reopen: an approval or a decline made by mistake is taken back; the row
//   is a waiting request again. Nobody is emailed.
// - remove: the row is deleted, whatever its state (take a member's access
//   away, or clear a declined request so the person can ask again).
// The person is emailed about an approval or a decline.
router.patch(
  '/memberships',
  handle(async (req, res) => {
    const { companyId, userId, decision } = req.body ?? {};
    if (!isUuid(companyId) || !isUuid(userId)) {
      return res.status(400).json({ error: 'companyId and userId are required.' });
    }
    const match = and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, userId));
    const decidedAt = new Date();
    if (decision === 'approve') {
      const [before] = await db.select({ status: companyMembers.status }).from(companyMembers).where(match).limit(1);
      if (!before) return res.status(404).json({ error: 'Request not found' });
      // Only a row that is not yet active changes, so two approvals send one email.
      const updated = await db
        .update(companyMembers)
        .set({ status: 'active', decidedAt, decidedBy: req.user!.id })
        .where(and(match, inArray(companyMembers.status, ['requested', 'declined'])))
        .returning({ userId: companyMembers.userId });
      if (updated.length > 0) {
        await accessAudit(req.user!, { userId, companyId }, 'approved');
        await accessDecided({ userId, companyId, decision: 'approved', requested: true, decidedAt, byUserId: req.user!.id });
      }
      return res.json({ status: 'active' });
    }
    if (decision === 'decline') {
      const updated = await db
        .update(companyMembers)
        .set({ status: 'declined', decidedAt, decidedBy: req.user!.id })
        .where(and(match, eq(companyMembers.status, 'requested')))
        .returning({ userId: companyMembers.userId });
      if (updated.length === 0) return res.status(404).json({ error: 'Request not found' });
      await accessAudit(req.user!, { userId, companyId }, 'declined');
      await accessDecided({ userId, companyId, decision: 'declined', requested: true, decidedAt, byUserId: req.user!.id });
      return res.json({ status: 'declined' });
    }
    if (decision === 'reopen') {
      const updated = await db
        .update(companyMembers)
        .set({ status: 'requested', decidedAt: null, decidedBy: null })
        .where(and(match, inArray(companyMembers.status, ['active', 'declined'])))
        .returning({ userId: companyMembers.userId });
      if (updated.length === 0) return res.status(404).json({ error: 'Nothing to take back: that request is still waiting, or gone.' });
      await accessAudit(req.user!, { userId, companyId }, 'decision taken back');
      return res.json({ status: 'requested' });
    }
    if (decision === 'remove') {
      // The line is written first: it names the person and the company, which the row holds together.
      const [before] = await db.select({ status: companyMembers.status }).from(companyMembers).where(match).limit(1);
      if (before) await accessAudit(req.user!, { userId, companyId }, before.status === 'active' ? 'removed from company' : 'request cleared');
      await db.delete(companyMembers).where(match);
      return res.json({ status: 'removed' });
    }
    res.status(400).json({ error: "decision must be 'approve', 'decline', 'reopen' or 'remove'." });
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

const PEOPLE_ROLES = ['admin', 'employer', 'waiting', 'user'] as const;
type PeopleRole = (typeof PEOPLE_ROLES)[number];

/** People in one role: admins, employers (access to a company), people waiting on a request, or none of these. */
function inRole(role: PeopleRole): SQL {
  const member = (status: string) =>
    sql`EXISTS (SELECT 1 FROM company_members m WHERE m.user_id = users.id AND m.status = ${status})`;
  if (role === 'admin') return sql`${users.isAdmin}`;
  if (role === 'employer') return member('active');
  if (role === 'waiting') return member('requested');
  return sql`(NOT ${users.isAdmin} AND NOT ${member('active')})`;
}

/**
 * The first admin: the one who has had the role longest. Another admin can
 * neither take that role away nor delete the account, so one admin cannot
 * lock the owner out. An admin with no date on record counts as earliest.
 */
async function firstAdminId(executor: Executor): Promise<string | null> {
  const [row] = await executor
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isAdmin, true))
    .orderBy(sql`${users.adminSince} ASC NULLS FIRST`, users.createdAt, users.id)
    .limit(1);
  return row?.id ?? null;
}

// GET /api/admin/users?q=&role=&limit=&offset= - newest first. q matches a
// name, an email, or the name of a company the person belongs to or has asked
// to join; role is admin | employer | waiting | user.
router.get(
  '/users',
  handle(async (req, res) => {
    const term = cleanText(req.query.q, 100) ?? '';
    const role = PEOPLE_ROLES.find((value) => value === req.query.role);
    const limit = pageLimit(req.query.limit, 100, 200);
    const offset = pageOffset(req.query.offset);
    const pattern = containing(term);
    const conditions: SQL[] = [];
    if (term) {
      conditions.push(
        sql`(${users.name} ILIKE ${pattern} OR ${users.email} ILIKE ${pattern} OR EXISTS (
          SELECT 1 FROM company_members m INNER JOIN companies c ON c.id = m.company_id
          WHERE m.user_id = users.id AND c.name ILIKE ${pattern}
        ))`
      );
    }
    if (role) conditions.push(inRole(role));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

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
        // What a deletion takes with it, and whether there is a session to end.
        applications: sql<number>`(SELECT COUNT(*)::int FROM applications a WHERE a.user_id = users.id)`,
        jobsPosted: sql<number>`(SELECT COUNT(*)::int FROM jobs j WHERE j.created_by = users.id)`,
        sessions: sql<number>`(SELECT COUNT(*)::int FROM sessions s WHERE s.user_id = users.id AND s.expires_at > now())`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), users.id)
      .limit(limit)
      .offset(offset);
    const first = await firstAdminId(db);
    res.json({ users: rows.map((row) => ({ ...row, isFirstAdmin: row.id === first })), total, hasMore: offset + rows.length < total });
  })
);

const LAST_ADMIN = 'The last admin cannot be removed.';
const FIRST_ADMIN = 'The first admin’s role and account cannot be removed by another admin.';

// PATCH /api/admin/users/:id { isAdmin?, name?, email? } - give or take the
// admin role, or correct the person's name or email address.
// Nobody removes their own admin role, there is always at least one admin,
// and the first admin's role is not another admin's to remove.
router.patch(
  '/users/:id',
  handle(async (req, res) => {
    const { id } = req.params;
    const isAdmin: unknown = req.body?.isAdmin;
    const correcting = req.body?.name !== undefined || req.body?.email !== undefined;
    if (isAdmin === undefined ? !correcting : typeof isAdmin !== 'boolean') {
      return res.status(400).json({ error: 'isAdmin must be true or false.' });
    }
    const name = req.body?.name === undefined ? undefined : cleanText(req.body.name, 80, 1);
    if (name === null) return res.status(400).json({ error: 'A name is 1 to 80 characters.', field: 'name' });
    const email = req.body?.email === undefined ? undefined : normalizeEmail(req.body.email);
    if (email === null) return res.status(400).json({ error: 'Enter a valid email address.', field: 'email' });

    const outcome = await db.transaction(async (tx) => {
      // Lock the admin rows, so two admins cannot each remove the other at once.
      const admins = await tx.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).for('update');
      const [target] = await tx
        .select({ id: users.id, name: users.name, email: users.email, isAdmin: users.isAdmin })
        .from(users)
        .where(eq(users.id, id))
        .limit(1)
        .for('update');
      if (!target) return 'missing' as const;
      if (isAdmin === false && target.isAdmin) {
        if (admins.length === 1) return 'last' as const;
        if (id === req.user!.id) return 'self' as const;
        if (id === (await firstAdminId(tx))) return 'first' as const;
      }
      if (email !== undefined && email !== target.email) {
        const [taken] = await tx.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, id))).limit(1);
        if (taken) return 'taken' as const;
      }
      const after = { name: name ?? target.name, email: email ?? target.email, isAdmin: typeof isAdmin === 'boolean' ? isAdmin : target.isAdmin };
      const roleChanged = after.isAdmin !== target.isAdmin;
      const changes = changedFields(target, { name: after.name, email: after.email }, ['name', 'email']);
      if (!roleChanged && !changes) return after;
      await tx
        .update(users)
        .set({ ...after, ...(roleChanged ? { adminSince: after.isAdmin ? new Date() : null } : {}), updatedAt: new Date() })
        .where(eq(users.id, id));
      if (roleChanged) {
        await recordAudit(tx, { actor: req.user!, kind: 'person', recordId: id, recordName: after.email, action: after.isAdmin ? 'made admin' : 'admin role removed' });
      }
      if (changes) {
        await recordAudit(tx, { actor: req.user!, kind: 'person', recordId: id, recordName: after.email, action: 'edited', detail: { changes } });
      }
      return after;
    });

    if (outcome === 'missing') return res.status(404).json({ error: 'Person not found' });
    if (outcome === 'last') return res.status(409).json({ error: LAST_ADMIN });
    if (outcome === 'self') return res.status(409).json({ error: 'An admin cannot remove their own admin role.' });
    if (outcome === 'first') return res.status(409).json({ error: FIRST_ADMIN });
    if (outcome === 'taken') return res.status(409).json({ error: 'Another account has that email address.', field: 'email' });
    res.json({ id, isAdmin: outcome.isAdmin, name: outcome.name, email: outcome.email });
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
      if (admins.some((admin) => admin.id === id)) {
        if (admins.length === 1) return 'last';
        if (id === (await firstAdminId(tx))) return 'first';
      }
      const [counts] = rowsOf<Record<string, number>>(
        await tx.execute(sql`SELECT
          (SELECT COUNT(*)::int FROM applications WHERE user_id = ${id}) AS applications,
          (SELECT COUNT(*)::int FROM company_members WHERE user_id = ${id}) AS memberships`)
      );
      const deleted = await tx.delete(users).where(eq(users.id, id)).returning({ email: users.email, name: users.name });
      if (deleted.length === 0) return 'missing';
      const removed = Object.fromEntries(Object.entries(counts ?? {}).filter(([, value]) => Number(value) > 0));
      await recordAudit(tx, {
        actor: req.user!,
        kind: 'person',
        recordId: id,
        recordName: deleted[0].email,
        action: 'deleted',
        detail: { name: deleted[0].name, ...(Object.keys(removed).length > 0 ? { removed } : {}) },
      });
      return 'ok';
    });

    if (outcome === 'missing') return res.status(404).json({ error: 'Person not found' });
    if (outcome === 'last') return res.status(409).json({ error: LAST_ADMIN });
    if (outcome === 'first') return res.status(409).json({ error: FIRST_ADMIN });
    res.json({ ok: true });
  })
);

// POST /api/admin/users/:id/sign-out - end a person's sessions: they are
// signed out everywhere and sign in again with their password. For the admin's
// own account, every session but the one making this request.
router.post(
  '/users/:id/sign-out',
  handle(async (req, res) => {
    const { id } = req.params;
    const [person] = await db.select({ email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    if (!person) return res.status(404).json({ error: 'Person not found' });
    const own = id === req.user!.id ? currentSessionHash(req) : null;
    const ended = await db
      .delete(sessions)
      .where(own ? and(eq(sessions.userId, id), ne(sessions.tokenHash, own)) : eq(sessions.userId, id))
      .returning({ userId: sessions.userId });
    if (ended.length > 0) {
      await recordAudit(db, { actor: req.user!, kind: 'person', recordId: id, recordName: person.email, action: 'sessions ended', detail: { ended: ended.length } });
    }
    res.json({ ended: ended.length });
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
      const [person] = await tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, id)).limit(1).for('update');
      if (!person) return null;
      await tx.delete(passwordResets).where(and(eq(passwordResets.userId, id), isNull(passwordResets.usedAt)));
      await tx.insert(passwordResets).values({ userId: id, tokenHash: hashToken(token), createdBy: req.user!.id, expiresAt });
      await recordAudit(tx, { actor: req.user!, kind: 'person', recordId: id, recordName: person.email, action: 'password reset link' });
      return person;
    });
    if (!created) return res.status(404).json({ error: 'Person not found' });
    // When mail is on the link also goes to the person; `emailed` says whether it did.
    const emailed = await sendAdminResetLink({ email: created.email, token });
    res.status(201).json({ link: resetPath(token), expiresAt, emailed });
  })
);

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

const inviteColumns = {
  id: invites.id,
  email: invites.email,
  role: invites.role,
  companyId: invites.companyId,
  companyName: companies.name,
  createdAt: invites.createdAt,
  expiresAt: invites.expiresAt,
  acceptedAt: invites.acceptedAt,
  // Who made it; null when that account is gone.
  invitedBy: sql<string | null>`(SELECT u.name FROM users u WHERE u.id = ${invites.createdBy})`,
};

// GET /api/admin/invites - invites that can still be used, newest first, and
// how many have been accepted.
router.get(
  '/invites',
  handle(async (_req, res) => {
    const rows = await db
      .select(inviteColumns)
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

/** How many earlier invites the list goes back. */
const PAST_INVITES = 50;

// GET /api/admin/invites/past - invites that were accepted, or ran out unused,
// newest first. A revoked invite is deleted; the audit log keeps that.
router.get(
  '/invites/past',
  handle(async (_req, res) => {
    const rows = await db
      .select(inviteColumns)
      .from(invites)
      .leftJoin(companies, eq(companies.id, invites.companyId))
      .where(or(isNotNull(invites.acceptedAt), lte(invites.expiresAt, new Date())))
      .orderBy(desc(sql`COALESCE(${invites.acceptedAt}, ${invites.expiresAt})`))
      .limit(PAST_INVITES);
    res.json({ invites: rows.map((row) => ({ ...row, state: row.acceptedAt ? 'accepted' : 'expired' })) });
  })
);

// POST /api/admin/invites { email, role, companyId? } - create an invite and
// return its link. The token is in this response and nowhere else.
router.post(
  '/invites',
  handle(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const role: unknown = req.body?.role;
    if (!email) return res.status(400).json({ error: 'Enter a valid email address.', field: 'email' });
    if (!isInviteRole(role)) return res.status(400).json({ error: 'Role must be user, employer or admin.' });

    let company: { id: string; name: string } | null = null;
    if (role === 'employer') {
      const companyId: unknown = req.body?.companyId;
      if (!isUuid(companyId)) return res.status(400).json({ error: 'Choose a company.', field: 'company' });
      const [row] = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (!row) return res.status(404).json({ error: 'Company not found' });
      company = row;
    }

    const [existing] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
    // `existing` lets the page link straight to the person.
    if (existing) return res.status(409).json({ error: 'An account with that email exists. Change it under People.', field: 'email', existing });

    const token = newToken();
    const days = inviteDays(role);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const created = await db.transaction(async (tx) => {
      // One invite per address at a time: a new one replaces any not yet accepted.
      const replaced = await tx.delete(invites).where(and(eq(invites.email, email), isNull(invites.acceptedAt))).returning({ id: invites.id });
      const [row] = await tx
        .insert(invites)
        .values({ email, role, companyId: company?.id ?? null, tokenHash: hashToken(token), createdBy: req.user!.id, expiresAt })
        .returning({ id: invites.id, createdAt: invites.createdAt });
      await recordAudit(tx, {
        actor: req.user!,
        kind: 'invite',
        recordId: row.id,
        recordName: email,
        action: 'invited',
        detail: { role, ...(company ? { company: company.name } : {}), ...(replaced.length > 0 ? { replacedEarlier: true } : {}) },
      });
      return { ...row, replaced: replaced.length > 0 };
    });
    const emailed = await sendInvite({ email, role, companyName: company?.name ?? null, token, days });

    res.status(201).json({
      invite: {
        id: created.id,
        email,
        role,
        companyId: company?.id ?? null,
        companyName: company?.name ?? null,
        createdAt: created.createdAt,
        expiresAt,
        acceptedAt: null,
        invitedBy: req.user!.name,
      },
      token,
      path: invitePath(token),
      // When mail is on the link also goes to the invited address; this says whether it did.
      emailed,
      // An earlier invite for the address was still open: its link no longer works.
      replaced: created.replaced,
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
      .returning({ id: invites.id, email: invites.email, role: invites.role });
    if (deleted.length === 0) return res.status(404).json({ error: 'Invite not found' });
    await recordAudit(db, { actor: req.user!, kind: 'invite', recordId: deleted[0].id, recordName: deleted[0].email, action: 'invite revoked', detail: { role: deleted[0].role } });
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
// never cached (the public list is). Names that start with the term come
// first. `factoryCount` tells companies with near-identical names apart.
router.get(
  '/companies',
  handle(async (req, res) => {
    const term = cleanText(req.query.q, 100) ?? '';
    if (term.length < 2) return res.json({ companies: [] });
    const rows = await db
      .select({
        ...companyProfile,
        factoryCount: sql<number>`(SELECT COUNT(*)::int FROM factories f WHERE f.company_id = companies.id)`,
      })
      .from(companies)
      .where(ilike(companies.name, containing(term)))
      .orderBy(sql`(${companies.name} ILIKE ${`${likeLiteral(term)}%`}) DESC`, desc(companies.featured), companies.name)
      .limit(8);
    res.json({ companies: rows });
  })
);

// PATCH /api/admin/companies/:id { domain?, featured?, industry?, description? }
// The logo is looked up from the domain; a featured company is listed and drawn
// first; industry and description are the one line that introduces it. The
// same change, with the rest of a company's fields, as PUT /api/companies/:id.
router.patch(
  '/companies/:id',
  handle(async (req, res) => {
    const body: Record<string, unknown> = req.body && typeof req.body === 'object' ? req.body : {};
    const given = Object.fromEntries(['domain', 'featured', 'industry', 'description'].filter((field) => body[field] !== undefined).map((field) => [field, body[field]]));
    if (Object.keys(given).length === 0) return res.status(400).json({ error: 'Nothing to change.' });
    try {
      await changeRecord('company', req.params.id, given, req.user!);
    } catch (error) {
      if (error instanceof RecordRefusal) return res.status(error.status).json({ error: error.message, ...error.extra });
      throw error;
    }
    const [updated] = await db.select(companyProfile).from(companies).where(eq(companies.id, req.params.id)).limit(1);
    res.json(updated);
  })
);

// ---------------------------------------------------------------------------
// Intake: the sources that come in through scripts/ingest/run.mjs, and the
// matches their runs were not sure of
// ---------------------------------------------------------------------------

// GET /api/admin/intake/sources - every source that has been staged, with its
// latest runs: when, how many records matched a plant, how many plants were
// added and changed, how many matches went to the queue.
router.get(
  '/intake/sources',
  handle(async (_req, res) => {
    res.json({ sources: await intakeSources() });
  })
);

// GET /api/admin/intake/review?limit=&offset= - matches waiting for a person:
// the source's record beside our candidate plants, with the distance and why
// the run was not sure. The ones nobody has looked at come first.
router.get(
  '/intake/review',
  handle(async (req, res) => {
    const limit = pageLimit(req.query.limit, 10, 50);
    const offset = pageOffset(req.query.offset);
    res.json({ ...(await reviewQueue(limit, offset)), limit, offset });
  })
);

// POST /api/admin/intake/review/:match { decision: 'same' | 'different' | 'skip', plantId? }
// - same: the record is the plant `plantId` (one of the candidates). The
//   source's id is written to the crosswalk and the record's facts applied.
// - different: it is none of them. The record is added as a new plant or
//   held, as its source says, and those plants are not proposed for it again.
// - skip: it stays waiting, after the ones nobody has looked at.
router.post(
  '/intake/review/:match',
  handle(async (req, res) => {
    if (!/^\d{1,15}$/.test(req.params.match)) return res.status(404).json({ error: 'Match not found' });
    const { decision, plantId } = req.body ?? {};
    if (decision !== 'same' && decision !== 'different' && decision !== 'skip') {
      return res.status(400).json({ error: 'decision is same, different or skip.' });
    }
    if (decision === 'same' && !isUuid(plantId)) return res.status(400).json({ error: 'Choose one of the plants shown.' });
    try {
      res.json(await decideReview(Number(req.params.match), decision, decision === 'same' ? plantId : null, req.user!));
    } catch (error) {
      if (error instanceof RecordRefusal) return res.status(error.status).json({ error: error.message, ...error.extra });
      throw error;
    }
  })
);

// ---------------------------------------------------------------------------
// Records: finding one to correct, what it carries, merging, near-duplicates
// ---------------------------------------------------------------------------

/** The kind in the path, or a 404 when it is not one. */
function kindParam(value: string): 'company' | 'factory' | 'career' | 'skill' | null {
  return isRecordKind(value) ? value : null;
}

// GET /api/admin/records/:kind?q= - records of one kind by name, or by another
// name they are known by. kind is company | factory | career | skill.
router.get(
  '/records/:kind',
  handle(async (req, res) => {
    const kind = kindParam(req.params.kind);
    if (!kind) return res.status(404).json({ error: 'Not Found' });
    res.json({ records: await searchRecords(kind, cleanText(req.query.q, 100) ?? '') });
  })
);

// GET /api/admin/records/:kind/similar?name=&exclude=&company=&lat=&lng= -
// records a name comes close to, so a duplicate is seen before it is made.
router.get(
  '/records/:kind/similar',
  handle(async (req, res) => {
    const kind = kindParam(req.params.kind);
    if (!kind) return res.status(404).json({ error: 'Not Found' });
    const number = (value: unknown) => (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined);
    const records = await similarRecords(kind, {
      name: cleanText(req.query.name, 300) ?? '',
      excludeId: isUuid(req.query.exclude) ? req.query.exclude : undefined,
      companyId: isUuid(req.query.company) ? req.query.company : undefined,
      latitude: number(req.query.lat),
      longitude: number(req.query.lng),
    });
    res.json({ records });
  })
);

// GET /api/admin/records/:kind/:id - one record as its editor needs it: the
// fields, its other names, and what hangs from it (what a merge would move
// and a deletion would take).
router.get(
  '/records/:kind/:id',
  handle(async (req, res) => {
    const kind = kindParam(req.params.kind);
    if (!kind) return res.status(404).json({ error: 'Not Found' });
    const record = await readRecord(kind, req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(record);
  })
);

// POST /api/admin/records/:kind/:id/merge { into } - merge this record into
// another of its kind. Everything that pointed here points there, this
// record's name is kept as another name for that one, and this one is deleted.
router.post(
  '/records/:kind/:id/merge',
  handle(async (req, res) => {
    const kind = kindParam(req.params.kind);
    if (!kind) return res.status(404).json({ error: 'Not Found' });
    const into: unknown = req.body?.into;
    if (!isUuid(into)) return res.status(400).json({ error: 'Choose the record to merge into.' });
    try {
      res.json(await mergeRecords(kind, req.params.id, into, req.user!));
    } catch (error) {
      if (error instanceof RecordRefusal) return res.status(error.status).json({ error: error.message, ...error.extra });
      throw error;
    }
  })
);

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

// GET /api/admin/audit?kind=&record=&limit=&offset= - what admins changed,
// newest first. `kind` narrows it to one kind of record, `record` to one.
router.get(
  '/audit',
  handle(async (req, res) => {
    const limit = pageLimit(req.query.limit, 50, 200);
    const offset = pageOffset(req.query.offset);
    const conditions: SQL[] = [];
    if (isAuditKind(req.query.kind)) conditions.push(eq(auditLog.kind, req.query.kind));
    if (isUuid(req.query.record)) conditions.push(eq(auditLog.recordId, req.query.record));
    const rows = await db
      .select({
        id: auditLog.id,
        at: auditLog.at,
        actorName: auditLog.actorName,
        kind: auditLog.kind,
        recordId: auditLog.recordId,
        recordName: auditLog.recordName,
        action: auditLog.action,
        detail: auditLog.detail,
      })
      .from(auditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(limit + 1)
      .offset(offset);
    res.json({ entries: rows.slice(0, limit), hasMore: rows.length > limit });
  })
);

export default router;
