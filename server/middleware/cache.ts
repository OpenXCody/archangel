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

/**
 * Refuses a request that carries a query parameter the route does not take.
 *
 * The edge keys its cache on the whole address, so `?_=1`, `?_=2`, ... each
 * miss it and run the query again. On the two heaviest reads (every pin in
 * the country, every state's count) that is the cheapest way to make the
 * server work: there, an address the app would never ask for is answered 400
 * before the database is touched.
 *
 * `path` is always allowed: on Vercel every API request arrives through the
 * rewrite in vercel.json (`/api/:path*` to the one function), which adds the
 * matched path to the query under that name. Refusing it refuses every
 * request in production while passing every local test.
 */
export function onlyQuery(...names: string[]) {
  const known = new Set([...names, 'path']);
  return (req: Request, res: Response, next: NextFunction): void => {
    const unknown = Object.keys(req.query).find((name) => !known.has(name));
    if (unknown !== undefined) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(400).json({ error: `Unknown query parameter: ${unknown.slice(0, 40)}` });
      return;
    }
    next();
  };
}
