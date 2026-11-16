import { Router, Request, Response } from 'express';
import { and, sql } from 'drizzle-orm';
import { db, companies, factories, occupations, skills, refs, schools, programs, persons } from '../db/index.js';
import { browsableCompanyFilter } from '../lib/companyFilters.js';
import { companyInScope, factoryInScope, programInScope, schoolInScope } from '../lib/scope.js';

const router = Router();

// GET /api/stats/counts - Get entity counts.
// Location-bound entities (companies, factories, schools, programs) are counted
// in scope only, so the headline numbers match what the lists show.
router.get('/counts', async (_req: Request, res: Response) => {
  try {
    const [companiesCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(companies)
      .where(and(browsableCompanyFilter, companyInScope()));

    const [factoriesCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(factories)
      .where(factoryInScope());

    const [occupationsCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(occupations);

    const [skillsCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(skills);

    const [refsCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(refs);

    const [schoolsCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(schools)
      .where(schoolInScope());

    const [programsCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(programs)
      .where(programInScope());

    const [personsCount] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(persons);

    const counts = {
      companies: companiesCount.count,
      factories: factoriesCount.count,
      occupations: occupationsCount.count,
      skills: skillsCount.count,
      refs: refsCount.count,
      schools: schoolsCount.count,
      programs: programsCount.count,
      persons: personsCount.count,
      total:
        companiesCount.count +
        factoriesCount.count +
        occupationsCount.count +
        skillsCount.count +
        refsCount.count +
        schoolsCount.count +
        programsCount.count,
      // Note: persons excluded from total as they're not browsable in the same way
    };

    res.json(counts);
  } catch (error) {
    console.error('Error fetching counts:', error);
    res.status(500).json({ error: 'Failed to fetch counts' });
  }
});

export default router;
