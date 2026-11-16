import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db, users, companies, companyMembers, invites } from '../db/index.js';
import {
  cleanText,
  endSession,
  getSessionUser,
  handle,
  hashPassword,
  normalizeEmail,
  requireUser,
  startSession,
  tooManyAttempts,
  verifyPassword,
  type SessionUser,
} from '../lib/auth.js';
import { MAX_INVITE_TOKEN_LENGTH, usableInvite } from '../lib/invites.js';
import { hasValidAdminSecret } from '../middleware/adminAuth.js';

const router = Router();

/** What the client receives about the signed-in person. */
async function accountPayload(user: SessionUser) {
  const memberships = await db
    .select({
      companyId: companyMembers.companyId,
      companyName: companies.name,
      role: companyMembers.role,
      status: companyMembers.status,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(eq(companyMembers.userId, user.id));
  return {
    user,
    memberships,
    isEmployer: memberships.some((m) => m.status === 'active'),
  };
}

// GET /api/auth/me - who is signed in (user is null when nobody is)
router.get(
  '/me',
  handle(async (req, res) => {
    const user = await getSessionUser(req);
    res.json(user ? await accountPayload(user) : { user: null, memberships: [], isEmployer: false });
  })
);

const INVALID_INVITE = 'That invite link is not valid. Ask an admin for a new one.';

// GET /api/auth/invite/:token - what an invite link grants, for the sign-up
// form. 404 for a link that is unknown, expired or already used, without
// saying which.
router.get(
  '/invite/:token',
  handle(async (req, res) => {
    const { token } = req.params;
    const [invite] =
      token.length <= MAX_INVITE_TOKEN_LENGTH
        ? await db
            .select({ email: invites.email, role: invites.role, companyName: companies.name })
            .from(invites)
            .leftJoin(companies, eq(companies.id, invites.companyId))
            .where(usableInvite(token))
            .limit(1)
        : [];
    if (!invite) return res.status(404).json({ error: INVALID_INVITE });
    res.json(invite);
  })
);

// POST /api/auth/sign-up { email, password, name, invite? }
// With an invite token, the email must be the invited one; the account, its
// invited role and the invite's acceptance are written together or not at all.
router.post(
  '/sign-up',
  handle(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const name = cleanText(req.body?.name, 80, 1);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const inviteToken: unknown = req.body?.invite ?? null;
    if (!email) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!name) return res.status(400).json({ error: 'Enter your name.' });
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
    }
    if (inviteToken !== null && (typeof inviteToken !== 'string' || !inviteToken || inviteToken.length > MAX_INVITE_TOKEN_LENGTH)) {
      return res.status(400).json({ error: INVALID_INVITE });
    }
    if (tooManyAttempts(req, email)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });

    const passwordHash = await hashPassword(password);
    // Nothing is written before every check has passed, so an early return leaves no trace.
    const outcome = await db.transaction(async (tx) => {
      let invite: { id: string; email: string; role: string; companyId: string | null } | null = null;
      if (inviteToken !== null) {
        // Locked, so the same link cannot be accepted twice at once.
        const [row] = await tx
          .select({ id: invites.id, email: invites.email, role: invites.role, companyId: invites.companyId })
          .from(invites)
          .where(usableInvite(inviteToken))
          .limit(1)
          .for('update');
        if (!row) return { problem: 'invite' as const };
        if (row.email !== email) return { problem: 'invite-email' as const };
        invite = row;
      }

      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) return { problem: 'exists' as const };

      const isAdmin = invite?.role === 'admin';
      const [created] = await tx.insert(users).values({ email, name, passwordHash, isAdmin }).returning({ id: users.id });
      if (invite) {
        if (invite.role === 'employer' && invite.companyId) {
          await tx.insert(companyMembers).values({ companyId: invite.companyId, userId: created.id, role: 'member', status: 'active' });
        }
        await tx.update(invites).set({ acceptedAt: new Date(), acceptedBy: created.id }).where(eq(invites.id, invite.id));
      }
      return { problem: null, id: created.id, isAdmin };
    });

    if (outcome.problem === 'invite') return res.status(400).json({ error: INVALID_INVITE });
    if (outcome.problem === 'invite-email') {
      return res.status(400).json({ error: 'That invite is for a different email address.' });
    }
    if (outcome.problem === 'exists') {
      return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.' });
    }

    await startSession(res, outcome.id);
    const user: SessionUser = { id: outcome.id, email, name, isAdmin: outcome.isAdmin, homeZip: null, about: null };
    res.status(201).json(await accountPayload(user));
  })
);

// POST /api/auth/sign-in { email, password }
router.post(
  '/sign-in',
  handle(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const invalid = () => res.status(401).json({ error: 'That email and password do not match an account.' });
    if (!email || !password) return invalid();
    if (tooManyAttempts(req, email)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });

    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!row || !(await verifyPassword(password, row.passwordHash))) return invalid();

    await startSession(res, row.id);
    res.json(
      await accountPayload({
        id: row.id,
        email: row.email,
        name: row.name,
        isAdmin: row.isAdmin,
        homeZip: row.homeZip,
        about: row.about,
      })
    );
  })
);

// POST /api/auth/sign-out
router.post(
  '/sign-out',
  handle(async (req, res) => {
    await endSession(req, res);
    res.json({ ok: true });
  })
);

// POST /api/auth/claim-admin - a signed-in person who presents the deployment's
// admin key (x-admin-secret) becomes an admin. This is how the first admin exists.
router.post(
  '/claim-admin',
  requireUser,
  handle(async (req, res) => {
    const user = req.user!;
    if (!hasValidAdminSecret(req)) return res.status(403).json({ error: 'That admin key is not valid.' });
    await db.update(users).set({ isAdmin: true, updatedAt: new Date() }).where(and(eq(users.id, user.id)));
    res.json(await accountPayload({ ...user, isAdmin: true }));
  })
);

export default router;
