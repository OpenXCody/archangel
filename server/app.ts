import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import companiesRouter from './routes/companies.js';
import factoriesRouter from './routes/factories.js';
import occupationsRouter from './routes/occupations.js';
import skillsRouter from './routes/skills.js';
import importRouter from './routes/import.js';
import statsRouter from './routes/stats.js';
import searchRouter from './routes/search.js';
import mapRouter from './routes/map.js';
import refsRouter from './routes/refs.js';
import schoolsRouter from './routes/schools.js';
import programsRouter from './routes/programs.js';
import personsRouter from './routes/persons.js';
import reviewRouter from './routes/review.js';
import authRouter from './routes/auth.js';
import meRouter from './routes/me.js';
import jobsRouter from './routes/jobs.js';
import employerRouter from './routes/employer.js';
import adminRouter from './routes/admin.js';
import { noStore } from './lib/auth.js';
import { requireAdmin, requireAdminUser, requireAdminForWrites, adminAuthRequired, isAdminRequest } from './middleware/adminAuth.js';
import { publicCache } from './middleware/cache.js';

/**
 * The one Express app. `server/index.ts` listens on it for local dev;
 * `api/index.ts` hands Vercel requests to it. Both environments therefore
 * serve exactly the same routes.
 */
export const app = express();

app.use(cors());
// Import payloads (transformed rows for validate/execute) exceed the 100kb default.
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), hasDbUrl: Boolean(process.env.DATABASE_URL) });
});

// Lets the admin UI know whether it needs to ask for a key (public, read-only).
// A signed-in admin account counts as authorized, so it is never asked.
app.get('/api/import/status', noStore, (req: Request, res: Response, next: NextFunction) => {
  isAdminRequest(req).then(
    (authorized) => res.json({ authRequired: adminAuthRequired(), authorized }),
    next
  );
});

// Accounts and everything tied to a signed-in person. Never cached: these
// responses differ per person.
app.use('/api/auth', noStore, authRouter);
app.use('/api/me', noStore, meRouter);
app.use('/api/jobs', noStore, jobsRouter);
app.use('/api/employer', noStore, employerRouter);
// Admin Tools: a signed-in admin account only (not the admin key, not open in local dev).
app.use('/api/admin', noStore, requireAdminUser, adminRouter);

// Edge caching. The two heaviest map payloads get 5 minutes; everything else
// public gets 1 minute. Admin writes are never cached (GET-only middleware).
app.get('/api/factories/pins', publicCache(300), (_req: Request, _res: Response, next: NextFunction) => next());
app.get('/api/map/state-counts', publicCache(300), (_req: Request, _res: Response, next: NextFunction) => next());

// Public reads, admin-gated writes
app.use('/api/companies', publicCache(60), requireAdminForWrites, companiesRouter);
app.use('/api/factories', publicCache(60), requireAdminForWrites, factoriesRouter);
app.use('/api/occupations', publicCache(60), requireAdminForWrites, occupationsRouter);
app.use('/api/skills', publicCache(60), requireAdminForWrites, skillsRouter);
app.use('/api/refs', publicCache(60), requireAdminForWrites, refsRouter);
app.use('/api/schools', publicCache(60), requireAdminForWrites, schoolsRouter);
app.use('/api/programs', publicCache(60), requireAdminForWrites, programsRouter);
// People records can hold email addresses and profile links, so they are admin-only.
app.use('/api/persons', noStore, requireAdmin, personsRouter);

// Read-only
app.use('/api/stats', publicCache(60), statsRouter);
app.use('/api/search', publicCache(60), searchRouter);
app.use('/api/map', publicCache(60), mapRouter);

// Admin-only pipeline + data review queue
app.use('/api/import', requireAdmin, importRouter);
app.use('/api/review', requireAdmin, reviewRouter);

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found', message: 'Route not found' });
});

// Errors: log the real thing, return a generic message.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});
