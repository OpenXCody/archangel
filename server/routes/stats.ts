import { Router, Request, Response } from 'express';
import { and, sql } from 'drizzle-orm';
import { db, companies, factories, occupations, skills } from '../db/index.js';
import { browsableCompanyFilter } from '../lib/companyFilters.js';
import { companyInScope, factoryInScope } from '../lib/scope.js';
import { civilianCareer } from '../lib/military.js';

const router = Router();

// GET /api/stats/counts - How many companies, factories, careers and skills there are.
// Companies and factories are counted in scope only, so the headline numbers
// match what the lists show. Careers are the civilian ones, as the Careers list is.
router.get('/counts', async (_req: Request, res: Response) => {
  try {
    const one = sql<number>`COUNT(*)::int`;
    const [[companyRow], [factoryRow], [occupationRow], [skillRow]] = await Promise.all([
      db.select({ count: one }).from(companies).where(and(browsableCompanyFilter, companyInScope())),
      db.select({ count: one }).from(factories).where(factoryInScope()),
      db.select({ count: one }).from(occupations).where(civilianCareer()),
      db.select({ count: one }).from(skills),
    ]);

    res.json({
      companies: companyRow.count,
      factories: factoryRow.count,
      occupations: occupationRow.count,
      skills: skillRow.count,
      total: companyRow.count + factoryRow.count + occupationRow.count + skillRow.count,
    });
  } catch (error) {
    console.error('Error fetching counts:', error);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

export default router;
