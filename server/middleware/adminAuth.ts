import type { Request, Response, NextFunction } from 'express';
import { getSessionUser } from '../lib/auth.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * There is one way to be an admin: a signed-in account with `users.is_admin`.
 * No key, no header and no setting opens a write. The first admin is made on
 * the command line (`node scripts/make-admin.mjs <email>`); after that, admins
 * make admins from Admin Tools.
 *
 * 401 signed out, 403 signed in without the role.
 */
export function requireAdminUser(req: Request, res: Response, next: NextFunction): void {
  getSessionUser(req).then((user) => {
    if (!user) res.status(401).json({ error: 'Sign in required' });
    else if (!user.isAdmin) res.status(403).json({ error: 'Admin access required' });
    else next();
  }, next);
}

/** The same gate on methods that change data, so public reads stay open. */
export function requireAdminForWrites(req: Request, res: Response, next: NextFunction): void {
  if (MUTATING_METHODS.has(req.method)) {
    requireAdminUser(req, res, next);
    return;
  }
  next();
}
