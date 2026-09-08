import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

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

/**
 * Gate a whole router behind the admin secret.
 * - ADMIN_SECRET set: header must match.
 * - ADMIN_SECRET unset, local dev: allowed (so `npm run dev` just works).
 * - ADMIN_SECRET unset, production: refused with a clear setup hint.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!process.env.ADMIN_SECRET && isProductionLike()) {
    res.status(503).json({
      error: 'Admin access is not configured',
      hint: 'Set ADMIN_SECRET in the deployment environment to enable data changes.',
    });
    return;
  }
  if (isAuthorizedAdmin(req)) {
    next();
    return;
  }
  res.status(401).json({ error: 'Admin secret required', header: ADMIN_HEADER });
}

/** Same gate, applied only to mutating methods so public reads stay open. */
export function requireAdminForWrites(req: Request, res: Response, next: NextFunction): void {
  if (MUTATING_METHODS.has(req.method)) {
    requireAdmin(req, res, next);
    return;
  }
  next();
}
