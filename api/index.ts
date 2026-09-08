// Vercel serverless entry. Hands every /api/* request to the same Express app
// that `npm run dev` runs, so production and local serve identical routes.
import type { IncomingMessage, ServerResponse } from 'http';
import { app } from '../server/app';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  // vercel.json rewrites /api/:path* -> /api and passes the matched segment
  // as ?path=... Rebuild the URL Express expects.
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathParam = url.searchParams.get('path');
  if (pathParam !== null) {
    url.searchParams.delete('path');
    const rest = url.searchParams.toString();
    req.url = `/api/${pathParam.replace(/^\/+/, '')}${rest ? `?${rest}` : ''}`;
  }
  app(req, res);
}
