import { Router, Request, Response } from 'express';
import { and, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db, factories, companies, factoryOccupations, occupations, jobs } from '../db/index.js';
import { uuidParam, uuidQuery } from '../middleware/validateUuid.js';
import { factoryInScope } from '../lib/scope.js';
import { listOpenJobs } from '../lib/openJobs.js';
import { packPins } from '../../shared/pins.js';

/** A company with this many factories nationwide counts as established. */
const ESTABLISHED_MIN_SITES = 5;

const router = Router();
router.param('id', uuidParam);
router.use(uuidQuery('company'));

// GET /api/factories - List factories with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, state, company, industry, sort = 'name', order = 'asc' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Build where conditions. Public reads only ever see in-scope factories.
    const conditions: (SQL | undefined)[] = [factoryInScope()];

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(factories.name, searchTerm),
          ilike(factories.specialization, searchTerm),
          ilike(factories.description, searchTerm)
        )
      );
    }

    if (state) {
      conditions.push(eq(factories.state, state as string));
    }

    if (company) {
      conditions.push(eq(factories.companyId, company as string));
    }

    if (industry) {
      // Industry maps to specialization for factories
      conditions.push(eq(factories.specialization, industry as string));
    }

    // Get total count
    const whereClause = sql`${sql.join(conditions, sql` AND `)}`;
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(factories)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by clause
    let orderByClause;
    if (sort === 'workforceSize') {
      orderByClause = order === 'desc'
        ? sql`${factories.workforceSize} DESC NULLS LAST, ${factories.name} ASC`
        : sql`${factories.workforceSize} ASC NULLS LAST, ${factories.name} ASC`;
    } else {
      orderByClause = order === 'desc'
        ? sql`${factories.name} DESC`
        : sql`${factories.name} ASC`;
    }

    // Query with company name and occupation count
    const result = await db
      .select({
        id: factories.id,
        name: factories.name,
        companyId: factories.companyId,
        companyName: sql<string>`(SELECT name FROM companies WHERE companies.id = factories.company_id)`,
        specialization: factories.specialization,
        description: factories.description,
        latitude: factories.latitude,
        longitude: factories.longitude,
        state: factories.state,
        workforceSize: factories.workforceSize,
        openPositions: factories.openPositions,
        createdAt: factories.createdAt,
        occupationCount: sql<number>`(SELECT COUNT(*)::int FROM factory_occupations WHERE factory_occupations.factory_id = factories.id)`,
      })
      .from(factories)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limitNum)
      .offset(offsetNum);

    const hasMore = offsetNum + result.length < total;

    res.json({
      data: result,
      total,
      offset: offsetNum,
      limit: limitNum,
      hasMore,
    });
  } catch (error) {
    console.error('Error fetching factories:', error);
    res.status(500).json({ error: 'Failed to fetch factories' });
  }
});

// GET /api/factories/pins - every factory the filters allow, packed for the
// map (shared/pins.ts). The whole country is one response.
router.get('/pins', async (req: Request, res: Response) => {
  try {
    const { states, company, industry } = req.query;

    // Build where conditions. Public reads only ever see in-scope factories.
    const conditions: (SQL | undefined)[] = [factoryInScope()];

    // Support multiple states as comma-separated string
    if (states) {
      const stateList = (states as string).split(',').map(s => s.trim()).filter(Boolean);
      if (stateList.length === 1) {
        conditions.push(eq(factories.state, stateList[0]));
      } else if (stateList.length > 1) {
        conditions.push(sql`${factories.state} IN (${sql.join(stateList.map(s => sql`${s}`), sql`, `)})`);
      }
    }

    if (company) {
      conditions.push(eq(factories.companyId, company as string));
    }

    if (industry) {
      conditions.push(sql`${companies.industry} = ${industry}`);
    }

    // One row per factory, carrying everything a pin and its hover card show,
    // so hovering never has to fetch. `sites` is how many factories the
    // company has nationwide; with `featured` it gives each pin a tier.
    // Counted once per query, then joined: a count per row was a second per request.
    const siteCounts = db
      .select({ companyId: factories.companyId, sites: sql<number>`COUNT(*)::int`.as('sites') })
      .from(factories)
      .groupBy(factories.companyId)
      .as('site_counts');
    const openJobCounts = db
      .select({ factoryId: jobs.factoryId, openJobs: sql<number>`COUNT(*)::int`.as('open_jobs') })
      .from(jobs)
      .where(sql`${jobs.status} = 'open' AND ${jobs.expiresAt} > now()`)
      .groupBy(jobs.factoryId)
      .as('open_job_counts');

    const result = await db
      .select({
        id: factories.id,
        name: factories.name,
        companyId: factories.companyId,
        companyName: companies.name,
        featured: companies.featured,
        sites: siteCounts.sites,
        industry: sql<string | null>`COALESCE(${factories.primaryNaicsDescription}, ${factories.specialization})`,
        latitude: factories.latitude,
        longitude: factories.longitude,
        city: factories.city,
        state: factories.state,
        openJobs: openJobCounts.openJobs,
      })
      .from(factories)
      .leftJoin(companies, eq(factories.companyId, companies.id))
      .leftJoin(siteCounts, eq(siteCounts.companyId, factories.companyId))
      .leftJoin(openJobCounts, eq(openJobCounts.factoryId, factories.id))
      .where(and(...conditions));

    res.json(
      packPins(
        result.map((factory) => ({
          ...factory,
          // 2: a featured employer. 1: an established company (five or more
          // factories nationwide). 0: everything else.
          tier: factory.featured ? 2 : (factory.sites ?? 1) >= ESTABLISHED_MIN_SITES ? 1 : 0,
          openJobs: factory.openJobs ?? 0,
        })),
      ),
    );
  } catch (error) {
    console.error('Error fetching factory pins:', error);
    res.status(500).json({ error: 'Failed to fetch factory pins' });
  }
});

// GET /api/factories/:id - Get single factory with relationships
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get factory with company info
    const factoryResult = await db
      .select({
        id: factories.id,
        name: factories.name,
        companyId: factories.companyId,
        specialization: factories.specialization,
        description: factories.description,
        latitude: factories.latitude,
        longitude: factories.longitude,
        state: factories.state,
        workforceSize: factories.workforceSize,
        openPositions: factories.openPositions,
        createdAt: factories.createdAt,
      })
      .from(factories)
      .where(and(eq(factories.id, id), factoryInScope()));

    if (factoryResult.length === 0) {
      res.status(404).json({ error: 'Factory not found' });
      return;
    }

    const factory = factoryResult[0];

    // Get parent company
    let company = null;
    if (factory.companyId) {
      const companyResult = await db
        .select({
          id: companies.id,
          name: companies.name,
          industry: companies.industry,
        })
        .from(companies)
        .where(eq(companies.id, factory.companyId));
      company = companyResult[0] || null;
    }

    // Get occupations at this factory with headcount
    const factoryOccupationsResult = await db
      .select({
        id: occupations.id,
        title: occupations.title,
        onetCode: occupations.onetCode,
        headcount: factoryOccupations.headcount,
        avgSalaryMin: factoryOccupations.avgSalaryMin,
        avgSalaryMax: factoryOccupations.avgSalaryMax,
      })
      .from(factoryOccupations)
      .innerJoin(occupations, eq(factoryOccupations.occupationId, occupations.id))
      .where(eq(factoryOccupations.factoryId, id));

    res.json({
      ...factory,
      company,
      occupations: factoryOccupationsResult,
      jobs: await listOpenJobs(eq(jobs.factoryId, id)),
    });
  } catch (error) {
    console.error('Error fetching factory:', error);
    res.status(500).json({ error: 'Failed to fetch factory' });
  }
});

// POST /api/factories - Create factory
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      companyId,
      name,
      specialization,
      description,
      latitude,
      longitude,
      state,
      workforceSize,
      openPositions,
    } = req.body;

    if (!name || !latitude || !longitude) {
      res.status(400).json({ error: 'Name, latitude, and longitude are required' });
      return;
    }

    const result = await db.insert(factories).values({
      companyId,
      name,
      specialization,
      description,
      latitude,
      longitude,
      state,
      workforceSize,
      openPositions,
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating factory:', error);
    res.status(500).json({ error: 'Failed to create factory' });
  }
});

// PUT /api/factories/:id - Update factory
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      companyId,
      name,
      specialization,
      description,
      latitude,
      longitude,
      state,
      workforceSize,
      openPositions,
    } = req.body;

    const result = await db.update(factories)
      .set({
        companyId,
        name,
        specialization,
        description,
        latitude,
        longitude,
        state,
        workforceSize,
        openPositions,
        updatedAt: new Date(),
      })
      .where(eq(factories.id, id))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Factory not found' });
      return;
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating factory:', error);
    res.status(500).json({ error: 'Failed to update factory' });
  }
});

// DELETE /api/factories/:id - Delete factory
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.delete(factories).where(eq(factories.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Factory not found' });
      return;
    }

    res.json({ message: 'Factory deleted', id });
  } catch (error) {
    console.error('Error deleting factory:', error);
    res.status(500).json({ error: 'Failed to delete factory' });
  }
});

export default router;
