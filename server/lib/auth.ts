import { scrypt, randomBytes, timingSafeEqual, createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db, users, sessions } from '../db/index.js';

/**
 * Accounts and sessions.
 *
 * - Passwords are hashed with scrypt and a per-user salt.
 * - A session is a random token in an HttpOnly cookie; only its SHA-256 is stored.
 * - Roles are relationships: an employer is a user with an active company
 *   membership (see routes/employer.ts); an admin has `isAdmin`.
 */

export const SESSION_COOKIE = 'archangel_session';
const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  homeZip: string | null;
  about: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `getSessionUser`: the signed-in user, or null. Undefined until loaded. */
    user?: SessionUser | null;
  }
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

/**
 * A hash no password matches. Sign-in checks against it when the email has no
 * account, so "no such account" takes as long to answer as "wrong password".
 */
export const NO_ACCOUNT_HASH = ['scrypt', Buffer.alloc(16).toString('base64'), Buffer.alloc(SCRYPT_KEYLEN).toString('base64')].join('$');

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Why a password cannot be used, in words for the person, or null when it can. One rule everywhere. */
export function passwordProblem(password: string): string | null {
  // Eight spaces are eight characters and no password at all.
  if (password.length < 8 || password.length > 200 || !password.trim()) return 'Use a password of at least 8 characters.';
  return COMMON_PASSWORDS.has(password.toLowerCase()) ? 'That password is one of the most common. Choose another.' : null;
}

/** The passwords of eight characters or more that are tried first by anyone guessing. */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'passw0rd',
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  '00000000',
  '87654321',
  'qwertyui',
  'qwertyuiop',
  'qwerty123',
  '1q2w3e4r',
  'iloveyou',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'trustno1',
  'superman',
  'letmein1',
  'welcome1',
  'admin123',
  'abc12345',
  'changeme',
  'archangel',
]);

/** What is stored for a secret token (a session, an invite, a password reset): its SHA-256, never the token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A new secret token: 32 random bytes, base64url. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function isSecureDeployment(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function cookieAttributes(maxAgeSeconds: number): string {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isSecureDeployment() ? '; Secure' : ''}`;
}

function readSessionToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eqAt = part.indexOf('=');
    if (eqAt === -1) continue;
    if (part.slice(0, eqAt).trim() === SESSION_COOKIE) return decodeURIComponent(part.slice(eqAt + 1).trim());
  }
  return null;
}

/** Start a session for a user and set its cookie on the response. */
export async function startSession(res: Response, userId: string): Promise<void> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  // Sessions that have run out are of no use to anyone: clear them as new ones start.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; ${cookieAttributes(SESSION_DAYS * 24 * 60 * 60)}`);
}

/** End the current session, if any, and clear the cookie. */
export async function endSession(req: Request, res: Response): Promise<void> {
  const token = readSessionToken(req);
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${cookieAttributes(0)}`);
}

/** The stored hash of this request's session token, or null without one. For ending every session but this one. */
export function currentSessionHash(req: Request): string | null {
  const token = readSessionToken(req);
  return token ? hashToken(token) : null;
}

/** The signed-in user for this request, or null. Cached on the request. */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  if (req.user !== undefined) return req.user;
  const token = readSessionToken(req);
  if (!token) {
    req.user = null;
    return null;
  }
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isAdmin: users.isAdmin,
      homeZip: users.homeZip,
      about: users.about,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  req.user = row ?? null;
  return req.user;
}

/** Responses on signed-in routes must never be stored by a shared cache. */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
}

/** Continue only for a signed-in user; otherwise 401. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  getSessionUser(req).then((user) => {
    if (user) next();
    else res.status(401).json({ error: 'Sign in required' });
  }, next);
}

/** Wrap an async handler so a rejected promise reaches Express's error handler. */
export function handle(
  fn: (req: Request, res: Response) => Promise<unknown>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

// --- Input helpers -----------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/** A trimmed string within length bounds, or null. */
export function cleanText(value: unknown, max: number, min = 0): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length >= min && text.length <= max ? text : null;
}

// --- Sign-in throttle --------------------------------------------------------
// Per server instance, so it slows guessing rather than stopping a distributed
// attempt. Ten tries per address-and-email pair every ten minutes. Where no
// email is known yet (a password reset link), a fixed word takes its place.

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

export function tooManyAttempts(req: Request, email: string): boolean {
  const key = attemptKey(req, email);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 5000) for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

/** A sign-in that succeeded is not a guess: forget the tries that led to it. */
export function clearAttempts(req: Request, email: string): void {
  attempts.delete(attemptKey(req, email));
}

function attemptKey(req: Request, email: string): string {
  return `${req.ip ?? 'unknown'}|${email}`;
}
