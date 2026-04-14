// Vercel serverless handler wrapping Express
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasDbUrl: !!process.env.DATABASE_URL,
  });
});

// Test
app.get('/api/test', (req, res) => {
  res.json({ message: 'API works!' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'not found', path: req.path });
});

// Export handler function for Vercel
export default function handler(req: Request, res: Response) {
  return app(req, res);
}
