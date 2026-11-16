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

/** True when the deployment requires an admin secret for writes. */
export function adminAuthRequired(): boolean {
  return Boolean(process.env.ADMIN_SECRET) || isProductionLike();
}

/** True when this request carries a valid admin secret. */
export function isAuthorizedAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return !isProductionLike(); // dev convenience: no secret configured = open locally
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
 * - ADMIN_SECRET unset, local dev: allowed (so `npm run dev` just works).
 * - ADMIN_SECRET unset, production, no admin account: refused with a setup hint.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  isAdminRequest(req).then((ok) => {
    if (ok) {
      next();
      return;
    }
    if (!process.env.ADMIN_SECRET && isProductionLike()) {
      res.status(503).json({
        error: 'Admin access is not configured',
        hint: 'Set ADMIN_SECRET in the deployment environment to enable data changes.',
      });
      return;
    }
    res.status(401).json({ error: 'Admin access required', header: ADMIN_HEADER });
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
