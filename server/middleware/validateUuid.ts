import type { Request, Response, NextFunction } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reject malformed UUIDs with a 400 before they reach Postgres, where an
 * invalid cast surfaces as a 500. Use with `router.param('id', uuidParam)`.
 */
export function uuidParam(_req: Request, res: Response, next: NextFunction, value: string): void {
  if (!UUID_RE.test(value)) {
    res.status(400).json({ error: 'Invalid id: expected a UUID' });
    return;
  }
  next();
}
