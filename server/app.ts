import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import companiesRouter from './routes/companies';
import factoriesRouter from './routes/factories';
import occupationsRouter from './routes/occupations';
import skillsRouter from './routes/skills';
import importRouter from './routes/import';
import statsRouter from './routes/stats';
import searchRouter from './routes/search';
import mapRouter from './routes/map';
import refsRouter from './routes/refs';
import schoolsRouter from './routes/schools';
import programsRouter from './routes/programs';
import personsRouter from './routes/persons';
import { requireAdmin, requireAdminForWrites, adminAuthRequired, isAuthorizedAdmin } from './middleware/adminAuth';

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
app.get('/api/import/status', (req: Request, res: Response) => {
  res.json({ authRequired: adminAuthRequired(), authorized: isAuthorizedAdmin(req) });
});

// Public reads, admin-gated writes
app.use('/api/companies', requireAdminForWrites, companiesRouter);
app.use('/api/factories', requireAdminForWrites, factoriesRouter);
app.use('/api/occupations', requireAdminForWrites, occupationsRouter);
app.use('/api/skills', requireAdminForWrites, skillsRouter);
app.use('/api/refs', requireAdminForWrites, refsRouter);
app.use('/api/schools', requireAdminForWrites, schoolsRouter);
app.use('/api/programs', requireAdminForWrites, programsRouter);
app.use('/api/persons', requireAdminForWrites, personsRouter);

// Read-only
app.use('/api/stats', statsRouter);
app.use('/api/search', searchRouter);
app.use('/api/map', mapRouter);

// Admin-only pipeline
app.use('/api/import', requireAdmin, importRouter);

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
