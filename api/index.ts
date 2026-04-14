// Native Vercel handler with lazy-loaded Express
import type { VercelRequest, VercelResponse } from '@vercel/node';

let app: any = null;
let initError: string | null = null;

async function getApp() {
  if (initError) throw new Error(initError);
  if (app) return app;

  try {
    const express = (await import('express')).default;
    const cors = (await import('cors')).default;

    app = express();
    app.use(cors());
    app.use(express.json());

    // Try to load database and routes
    try {
      const { db } = await import('../server/db/index.js');
      const companiesRouter = (await import('../server/routes/companies.js')).default;
      const factoriesRouter = (await import('../server/routes/factories.js')).default;
      const occupationsRouter = (await import('../server/routes/occupations.js')).default;
      const skillsRouter = (await import('../server/routes/skills.js')).default;
      const importRouter = (await import('../server/routes/import.js')).default;
      const statsRouter = (await import('../server/routes/stats.js')).default;
      const searchRouter = (await import('../server/routes/search.js')).default;
      const mapRouter = (await import('../server/routes/map.js')).default;

      // Mount routes
      app.use('/api/companies', companiesRouter);
      app.use('/api/factories', factoriesRouter);
      app.use('/api/occupations', occupationsRouter);
      app.use('/api/skills', skillsRouter);
      app.use('/api/import', importRouter);
      app.use('/api/stats', statsRouter);
      app.use('/api/search', searchRouter);
      app.use('/api/map', mapRouter);

      // Health check with DB
      app.get('/api/health', (req: any, res: any) => {
        res.json({
          status: 'ok',
          timestamp: new Date().toISOString(),
          dbConnected: !!db,
        });
      });
    } catch (dbError: any) {
      // Database/routes failed to load - return error in health check
      app.get('/api/health', (req: any, res: any) => {
        res.status(500).json({
          status: 'error',
          error: 'Database initialization failed',
          message: dbError.message,
        });
      });

      app.use('/api', (req: any, res: any) => {
        res.status(500).json({
          error: 'Database not available',
          message: dbError.message,
        });
      });
    }

    // 404
    app.use((req: any, res: any) => {
      res.status(404).json({ error: 'not found', path: req.path });
    });

    return app;
  } catch (err: any) {
    initError = err.message;
    throw err;
  }
}

// Vercel handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const expressApp = await getApp();

    // Extract the actual path from query param (set by rewrite)
    const pathParam = req.query.path;
    const subPath = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam || '');

    // Reconstruct the URL for Express
    const queryString = req.url?.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    req.url = `/api/${subPath}${queryString}`;

    // Remove the path param so it doesn't interfere
    delete req.query.path;

    return expressApp(req, res);
  } catch (err: any) {
    res.status(500).json({
      error: 'API initialization failed',
      message: err.message,
    });
  }
}
