// Native Vercel handler - not bundled
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Extract the actual path from query param (set by rewrite) or URL
  const pathParam = req.query.path;
  const subPath = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam || '');
  const fullPath = `/api/${subPath}`.replace(/\/+$/, '') || '/api';

  // Simple routing
  if (fullPath === '/api/health') {
    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      hasDbUrl: !!process.env.DATABASE_URL,
      path: fullPath,
    });
  }

  if (fullPath === '/api/test') {
    return res.json({ message: 'test works', path: fullPath });
  }

  if (fullPath === '/api' || fullPath === '/api/') {
    return res.json({ message: 'API root', path: fullPath });
  }

  // For now, return 404 for other routes
  res.status(404).json({ error: 'not found', path: fullPath });
}
