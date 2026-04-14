// Native Vercel handler with Express
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import { db } from '../server/db/index';
import companiesRouter from '../server/routes/companies';
import factoriesRouter from '../server/routes/factories';
import occupationsRouter from '../server/routes/occupations';
import skillsRouter from '../server/routes/skills';
import importRouter from '../server/routes/import';
import statsRouter from '../server/routes/stats';
import searchRouter from '../server/routes/search';
import mapRouter from '../server/routes/map';

const app = express();
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
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    dbConnected: !!db,
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'not found', path: req.path });
});

// Vercel handler - fix URL from rewrite
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Extract the actual path from query param (set by rewrite)
  const pathParam = req.query.path;
  const subPath = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam || '');

  // Reconstruct the URL for Express
  req.url = `/api/${subPath}${req.url?.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;

  // Remove the path param so it doesn't interfere with route params
  delete req.query.path;

  return app(req, res);
}
