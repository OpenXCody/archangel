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

/**
 * Reject a malformed UUID in the named query parameters with a 400, for list
 * filters such as `?company=<id>`. Absent or empty parameters pass through.
 * Use with `router.use(uuidQuery('company'))`.
 */
export function uuidQuery(...names: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of names) {
      const value = req.query[name];
      if (value === undefined || value === '') continue;
      if (typeof value !== 'string' || !UUID_RE.test(value)) {
        res.status(400).json({ error: `Invalid ${name}: expected a UUID` });
        return;
      }
    }
    next();
  };
}
