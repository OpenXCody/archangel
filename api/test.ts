// Minimal test endpoint - no database
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.json({
    message: 'API is working',
    path: req.url,
    method: req.method,
    hasDbUrl: !!process.env.DATABASE_URL,
    timestamp: new Date().toISOString(),
  });
}
