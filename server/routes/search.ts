// Express wrapper for global search - thin adapter for dev/local server
import { Router, Request, Response } from 'express';
import { globalSearch } from '../lib/globalSearch';

const router = Router();

// GET /api/search - Global search across all entities (thin wrapper)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, types, limit = '5' } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const query = q.trim();
    const maxLimit = parseInt(limit as string) || 5;
    const typeFilter = types
      ? (types as string).split(',').map(t => t.trim())
      : undefined;

    const results = await globalSearch({
      query,
      types: typeFilter,
      limit: maxLimit,
    });

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
