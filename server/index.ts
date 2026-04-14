import 'dotenv/config';
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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
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
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
