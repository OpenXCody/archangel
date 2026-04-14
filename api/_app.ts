// Minimal Express app for Vercel - no database
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Health check - no database needed
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasDbUrl: !!process.env.DATABASE_URL,
  });
});

// Minimal test
app.get('/api/test', (req, res) => {
  res.json({ message: 'API works!' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'not found', path: req.path });
});

export default app;
