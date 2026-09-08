import type { Request, Response, NextFunction } from 'express';

/**
 * Edge-cache public GET responses. On Vercel, `s-maxage` lets the CDN serve
 * repeats without invoking the function; `stale-while-revalidate` keeps the
 * app instant while a fresh copy is fetched behind the scenes. Browsers get
 * `max-age=0` so a hard refresh always revalidates.
 *
 * Data changes made through the admin UI can therefore take up to `seconds`
 * to appear for other visitors — a deliberate trade for a fast, cheap read
 * path on a dataset that changes a few times a day at most.
 */
export function publicCache(seconds: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' && !res.getHeader('Cache-Control')) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
      );
    }
    next();
  };
}
