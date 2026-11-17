import { Router } from 'express';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db, users, sessions, companies, companyMembers, invites, passwordResets } from '../db/index.js';
import {
  cleanText,
  currentSessionHash,
  endSession,
  getSessionUser,
  handle,
  hashPassword,
  normalizeEmail,
  passwordProblem,
  requireUser,
  startSession,
  tooManyAttempts,
  clearAttempts,
  verifyPassword,
  type SessionUser,
} from '../lib/auth.js';
import { MAX_INVITE_TOKEN_LENGTH, usableInvite } from '../lib/invites.js';
import { MAX_RESET_TOKEN_LENGTH, usableReset } from '../lib/passwordResets.js';

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
const INVALID_RESET = 'That reset link is not valid. Ask an admin for a new one.';
const TOO_MANY = 'Too many attempts. Try again in a few minutes.';
/** The throttle is keyed by address and email; a reset link is tried before any email is known. */
const RESET_ATTEMPTS = 'password-reset';

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
    const weak = passwordProblem(password);
    if (weak) return res.status(400).json({ error: weak });
    if (inviteToken !== null && (typeof inviteToken !== 'string' || !inviteToken || inviteToken.length > MAX_INVITE_TOKEN_LENGTH)) {
      return res.status(400).json({ error: INVALID_INVITE });
    }
    if (tooManyAttempts(req, email)) return res.status(429).json({ error: TOO_MANY });

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
      // Two sign-ups for one address sent together (a double click) both pass
      // the check above; the second must lose quietly, not fail.
      const [created] = await tx
        .insert(users)
        .values({ email, name, passwordHash, isAdmin })
        .onConflictDoNothing()
        .returning({ id: users.id });
      if (!created) return { problem: 'exists' as const };
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
    if (tooManyAttempts(req, email)) return res.status(429).json({ error: TOO_MANY });

    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!row || !(await verifyPassword(password, row.passwordHash))) return invalid();

    clearAttempts(req, email);
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

// POST /api/auth/password { current, next } - a signed-in person changes their
// own password. Every other session of theirs ends; this one carries on.
router.post(
  '/password',
  requireUser,
  handle(async (req, res) => {
    const user = req.user!;
    const current = typeof req.body?.current === 'string' ? req.body.current : '';
    const next = typeof req.body?.next === 'string' ? req.body.next : '';
    if (!current) return res.status(400).json({ error: 'Enter your current password.' });
    const weak = passwordProblem(next);
    if (weak) return res.status(400).json({ error: weak });
    // A guess at the current password counts like a guess at sign-in.
    if (tooManyAttempts(req, user.email)) return res.status(429).json({ error: TOO_MANY });

    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    if (!row || !(await verifyPassword(current, row.passwordHash))) {
      return res.status(400).json({ error: 'That is not your current password.' });
    }

    const passwordHash = await hashPassword(next);
    const keep = currentSessionHash(req);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));
      await tx.delete(sessions).where(keep ? and(eq(sessions.userId, user.id), ne(sessions.tokenHash, keep)) : eq(sessions.userId, user.id));
      // A reset link made before this change has nothing left to do.
      await tx.delete(passwordResets).where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));
    });
    clearAttempts(req, user.email);
    res.json({ ok: true });
  })
);

// GET /api/auth/reset/:token - whose password a reset link sets, for the
// page it opens. 404 for a link that is unknown, expired or already used,
// without saying which.
router.get(
  '/reset/:token',
  handle(async (req, res) => {
    const { token } = req.params;
    const [reset] =
      token.length <= MAX_RESET_TOKEN_LENGTH
        ? await db
            .select({ email: users.email })
            .from(passwordResets)
            .innerJoin(users, eq(users.id, passwordResets.userId))
            .where(usableReset(token))
            .limit(1)
        : [];
    if (!reset) return res.status(404).json({ error: INVALID_RESET });
    res.json(reset);
  })
);

// POST /api/auth/reset { token, password } - choose a new password through a
// reset link. The password, the link's use and the end of every session that
// person had are written together or not at all; then they are signed in.
router.post(
  '/reset',
  handle(async (req, res) => {
    const token: unknown = req.body?.token;
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (typeof token !== 'string' || !token || token.length > MAX_RESET_TOKEN_LENGTH) {
      return res.status(400).json({ error: INVALID_RESET });
    }
    const weak = passwordProblem(password);
    if (weak) return res.status(400).json({ error: weak });
    if (tooManyAttempts(req, RESET_ATTEMPTS)) return res.status(429).json({ error: TOO_MANY });

    const passwordHash = await hashPassword(password);
    const person = await db.transaction(async (tx) => {
      // Locked, so the same link cannot be used twice at once.
      const [reset] = await tx
        .select({ id: passwordResets.id, userId: passwordResets.userId })
        .from(passwordResets)
        .where(usableReset(token))
        .limit(1)
        .for('update');
      if (!reset) return null;
      const [updated] = await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, reset.userId))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          isAdmin: users.isAdmin,
          homeZip: users.homeZip,
          about: users.about,
        });
      await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));
      await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
      return updated ?? null;
    });
    if (!person) return res.status(400).json({ error: INVALID_RESET });

    clearAttempts(req, RESET_ATTEMPTS);
    // Whatever sign-in tries led to the reset are forgotten with it.
    clearAttempts(req, person.email);
    await startSession(res, person.id);
    res.json(await accountPayload(person));
  })
);

export default router;
