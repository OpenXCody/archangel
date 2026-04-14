import type { VercelRequest, VercelResponse } from '@vercel/node';

// Lazy load Express app to catch initialization errors
let app: any = null;
let initError: Error | null = null;

async function getApp() {
  if (initError) throw initError;
  if (app) return app;

  try {
    const express = (await import('express')).default;
    const cors = (await import('cors')).default;

    // Dynamically import routes
    const { db } = await import('../server/db');
    const companiesRouter = (await import('../server/routes/companies')).default;
    const factoriesRouter = (await import('../server/routes/factories')).default;
    const occupationsRouter = (await import('../server/routes/occupations')).default;
    const skillsRouter = (await import('../server/routes/skills')).default;
    const importRouter = (await import('../server/routes/import')).default;
    const statsRouter = (await import('../server/routes/stats')).default;
    const searchRouter = (await import('../server/routes/search')).default;
    const mapRouter = (await import('../server/routes/map')).default;

    app = express();
    app.use(cors());
    app.use(express.json());

    // Mount routes
    app.use('/api/companies', companiesRouter);
    app.use('/api/factories', factoriesRouter);
    app.use('/api/occupations', occupationsRouter);
    app.use('/api/skills', skillsRouter);
    app.use('/api/import', importRouter);
    app.use('/api/stats', statsRouter);
    app.use('/api/search', searchRouter);
    app.use('/api/map', mapRouter);

    // Health check
    app.get('/api/health', (_req: any, res: any) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        dbConnected: !!db,
      });
    });

    // 404 handler
    app.use((_req: any, res: any) => {
      res.status(404).json({ error: 'Not Found' });
    });

    return app;
  } catch (err) {
    initError = err as Error;
    throw err;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const expressApp = await getApp();
    return expressApp(req, res);
  } catch (err: any) {
    console.error('API initialization error:', err);
    res.status(500).json({
      error: 'API initialization failed',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
}
