// Native Vercel handler - not bundled
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.url || '/';

  // Simple routing
  if (path === '/api/health' || path === '/api/health/') {
    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      hasDbUrl: !!process.env.DATABASE_URL,
    });
  }

  if (path === '/api/test' || path === '/api/test/') {
    return res.json({ message: 'test works' });
  }

  // For now, return 404 for other routes
  res.status(404).json({ error: 'not found', path });
}
