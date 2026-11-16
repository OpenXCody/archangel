import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db, users, companies, companyMembers } from '../db/index.js';
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

// POST /api/auth/sign-up { email, password, name }
router.post(
  '/sign-up',
  handle(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const name = cleanText(req.body?.name, 80, 1);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!name) return res.status(400).json({ error: 'Enter your name.' });
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
    }
    if (tooManyAttempts(req, email)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.' });

    const [created] = await db
      .insert(users)
      .values({ email, name, passwordHash: await hashPassword(password) })
      .returning({ id: users.id });
    await startSession(res, created.id);
    const user: SessionUser = { id: created.id, email, name, isAdmin: false, homeZip: null, about: null };
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
