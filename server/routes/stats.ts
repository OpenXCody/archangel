import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db, companies, factories, occupations, skills } from '../db';

const router = Router();

// GET /api/stats/counts - Get entity counts
router.get('/counts', async (_req: Request, res: Response) => {
  try {
    const [companiesCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(companies);

    const [factoriesCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(factories);

    const [occupationsCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(occupations);

    const [skillsCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(skills);

    const counts = {
      companies: companiesCount.count,
      factories: factoriesCount.count,
      occupations: occupationsCount.count,
      skills: skillsCount.count,
      total:
        companiesCount.count +
        factoriesCount.count +
        occupationsCount.count +
        skillsCount.count,
    };

    res.json(counts);
  } catch (error) {
    console.error('Error fetching counts:', error);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

export default router;
