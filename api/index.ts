import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import companiesRouter from '../server/routes/companies';
import factoriesRouter from '../server/routes/factories';
import occupationsRouter from '../server/routes/occupations';
import skillsRouter from '../server/routes/skills';
import importRouter from '../server/routes/import';
import statsRouter from '../server/routes/stats';
import searchRouter from '../server/routes/search';
import mapRouter from '../server/routes/map';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes - mounted at /api in vercel.json rewrites
app.use('/api/companies', companiesRouter);
app.use('/api/factories', factoriesRouter);
app.use('/api/occupations', occupationsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/import', importRouter);
app.use('/api/stats', statsRouter);
app.use('/api/search', searchRouter);
app.use('/api/map', mapRouter);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasDbUrl: !!process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found', message: 'Route not found' });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// Export for Vercel serverless
export default app;
