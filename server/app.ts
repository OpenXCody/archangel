import express, { Request, Response, NextFunction } from 'express';
import companiesRouter from './routes/companies.js';
import factoriesRouter from './routes/factories.js';
import occupationsRouter from './routes/occupations.js';
import skillsRouter from './routes/skills.js';
import statsRouter from './routes/stats.js';
import searchRouter from './routes/search.js';
import mapRouter from './routes/map.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import jobsRouter from './routes/jobs.js';
import employerRouter from './routes/employer.js';
import adminRouter from './routes/admin.js';
import exploreRouter from './routes/explore.js';
import { noStore } from './lib/auth.js';
import { requireAdminUser, requireAdminForWrites } from './middleware/adminAuth.js';
import { publicCache } from './middleware/cache.js';

/**
 * The one Express app. `server/index.ts` listens on it for local dev;
 * `api/index.ts` hands Vercel requests to it. Both environments therefore
 * serve exactly the same routes.
 */
export const app = express();

app.disable('x-powered-by');
// On Vercel every request arrives through its proxy, which sets
// X-Forwarded-For itself. Trusting it makes req.ip the visitor's address, so
// the sign-in throttle counts per visitor instead of lumping everyone together.
if (process.env.VERCEL) app.set('trust proxy', true);
// A repeated query parameter (?state=TX&state=CA) arrives as an array, and an
// object-shaped one (?state[a]=b) as an object. Every route reads single text
// values, so the last one given wins and anything else is dropped, rather
// than each route failing in its own way.
app.use((req: Request, _res: Response, next: NextFunction) => {
  for (const key of Object.keys(req.query)) {
    const value = req.query[key];
    if (Array.isArray(value)) {
      const last = value[value.length - 1];
      if (typeof last === 'string') req.query[key] = last;
      else delete req.query[key];
    } else if (typeof value !== 'string') {
      delete req.query[key];
    }
  }
  next();
});
app.use(express.json());

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Accounts and everything tied to a signed-in person. Never cached: these
// responses differ per person.
app.use('/api/auth', noStore, authRouter);
app.use('/api/me', noStore, meRouter);
app.use('/api/jobs', noStore, jobsRouter);
app.use('/api/employer', noStore, employerRouter);
// Admin Tools: a signed-in admin account only.
app.use('/api/admin', noStore, requireAdminUser, adminRouter);

// Edge caching. The two heaviest map payloads get 5 minutes; everything else
// public gets 1 minute. Admin writes are never cached (GET-only middleware).
app.get('/api/factories/pins', publicCache(300), (_req: Request, _res: Response, next: NextFunction) => next());
app.get('/api/map/state-counts', publicCache(300), (_req: Request, _res: Response, next: NextFunction) => next());

// Public reads (cached at the edge); writes take a signed-in admin.
app.use('/api/companies', publicCache(60), requireAdminForWrites, companiesRouter);
app.use('/api/factories', publicCache(60), requireAdminForWrites, factoriesRouter);
app.use('/api/occupations', publicCache(60), requireAdminForWrites, occupationsRouter);
app.use('/api/skills', publicCache(60), requireAdminForWrites, skillsRouter);

// Read-only
app.use('/api/stats', publicCache(60), statsRouter);
app.use('/api/search', publicCache(60), searchRouter);
app.use('/api/map', publicCache(60), mapRouter);
app.use('/api/explore', publicCache(300), exploreRouter);

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found', message: 'Route not found' });
});

// Errors: log the real thing, return a generic message.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // A body the JSON parser refused is the sender's to fix, not a server fault.
  const status = (err as { status?: unknown }).status;
  if (status === 413) {
    res.status(413).json({ error: 'That request is too large.' });
    return;
  }
  if (status === 400) {
    res.status(400).json({ error: 'That request could not be read as JSON.' });
    return;
  }
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});
