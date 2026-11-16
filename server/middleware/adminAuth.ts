import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getSessionUser } from '../lib/auth.js';

export const ADMIN_HEADER = 'x-admin-secret';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isProductionLike(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Writes are open to everyone only when a developer asks for it in so many
 * words (ALLOW_OPEN_WRITES=1) on a machine that is not a deployment. Without
 * it the gate is closed: forgetting a setting must never open the database.
 */
function openWritesAllowed(): boolean {
  return process.env.ALLOW_OPEN_WRITES === '1' && !isProductionLike() && !process.env.ADMIN_SECRET;
}

/** True when the deployment requires an admin secret or account for writes. */
export function adminAuthRequired(): boolean {
  return !openWritesAllowed();
}

/** True when this request carries a valid admin secret (or writes are explicitly open). */
export function isAuthorizedAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return openWritesAllowed();
  const provided = req.header(ADMIN_HEADER);
  return typeof provided === 'string' && secretsMatch(provided, expected);
}

/** True when the request carries the deployment's admin key. Never true without one configured. */
export function hasValidAdminSecret(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET;
  const provided = req.header(ADMIN_HEADER);
  return Boolean(expected) && typeof provided === 'string' && secretsMatch(provided, expected as string);
}

/** True for the admin key (or open local dev) or a signed-in admin account. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  if (isAuthorizedAdmin(req)) return true;
  const user = await getSessionUser(req).catch(() => null);
  return Boolean(user?.isAdmin);
}

/**
 * Gate a whole router behind admin access.
 * - A signed-in admin account passes.
 * - ADMIN_SECRET set: a matching x-admin-secret header passes.
 * - ALLOW_OPEN_WRITES=1 on a developer's machine: allowed.
 * - Otherwise refused.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  isAdminRequest(req).then((ok) => {
    if (ok) {
      next();
      return;
    }
    res.status(401).json({ error: 'Admin access required. Sign in with an admin account.' });
  }, next);
}

/**
 * Gate a router behind a signed-in admin account, and nothing else: no admin
 * key and no local-dev opening. For /api/admin, where every action is a
 * person's (who may not demote or delete themselves) and manages other people.
 * 401 signed out, 403 signed in without the role.
 */
export function requireAdminUser(req: Request, res: Response, next: NextFunction): void {
  getSessionUser(req).then((user) => {
    if (!user) res.status(401).json({ error: 'Sign in required' });
    else if (!user.isAdmin) res.status(403).json({ error: 'Admin access required' });
    else next();
  }, next);
}

/** Same gate, applied only to mutating methods so public reads stay open. */
export function requireAdminForWrites(req: Request, res: Response, next: NextFunction): void {
  if (MUTATING_METHODS.has(req.method)) {
    requireAdmin(req, res, next);
    return;
  }
  next();
}
