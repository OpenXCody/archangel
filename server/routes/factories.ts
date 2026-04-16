import { Router, Request, Response } from 'express';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { db, factories, companies, factoryOccupations, occupations } from '../db';

const router = Router();

// GET /api/factories - List factories with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, state, company, industry, sort = 'name', order = 'asc' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Build where conditions
    const conditions = [];

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
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
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

// GET /api/factories/geojson - Get factories as GeoJSON with optional filters
// Supports viewport-based filtering for performance at scale
router.get('/geojson', async (req: Request, res: Response) => {
  try {
    const { states, company, industry, bounds } = req.query;

    // Build where conditions
    const conditions = [];

    // Viewport bounds filtering: bounds=minLng,minLat,maxLng,maxLat
    if (bounds) {
      const [minLng, minLat, maxLng, maxLat] = (bounds as string).split(',').map(parseFloat);
      if (!isNaN(minLng) && !isNaN(minLat) && !isNaN(maxLng) && !isNaN(maxLat)) {
        conditions.push(
          sql`CAST(${factories.longitude} AS DECIMAL) >= ${minLng} AND
              CAST(${factories.longitude} AS DECIMAL) <= ${maxLng} AND
              CAST(${factories.latitude} AS DECIMAL) >= ${minLat} AND
              CAST(${factories.latitude} AS DECIMAL) <= ${maxLat}`
        );
      }
    }

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

    // For industry filter, we need to join with companies
    let result;
    if (industry) {
      result = await db
        .select({
          id: factories.id,
          name: factories.name,
          companyId: factories.companyId,
          companyName: companies.name,
          companyIndustry: companies.industry,
          specialization: factories.specialization,
          latitude: factories.latitude,
          longitude: factories.longitude,
          state: factories.state,
          workforceSize: factories.workforceSize,
          openPositions: factories.openPositions,
        })
        .from(factories)
        .leftJoin(companies, eq(factories.companyId, companies.id))
        .where(
          conditions.length > 0
            ? sql`${sql.join(conditions, sql` AND `)} AND ${companies.industry} = ${industry}`
            : eq(companies.industry, industry as string)
        );
    } else {
      result = await db
        .select({
          id: factories.id,
          name: factories.name,
          companyId: factories.companyId,
          specialization: factories.specialization,
          latitude: factories.latitude,
          longitude: factories.longitude,
          state: factories.state,
          workforceSize: factories.workforceSize,
          openPositions: factories.openPositions,
        })
        .from(factories)
        .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined);
    }

    // Filter out factories without valid coordinates
    const validFactories = result.filter(
      (f) => f.latitude && f.longitude && !isNaN(parseFloat(f.latitude)) && !isNaN(parseFloat(f.longitude))
    );

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: validFactories.map((factory) => ({
        type: 'Feature',
        id: factory.id,
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(factory.longitude), parseFloat(factory.latitude)],
        },
        properties: {
          id: factory.id,
          name: factory.name,
          companyId: factory.companyId,
          specialization: factory.specialization,
          state: factory.state,
          workforceSize: factory.workforceSize,
          openPositions: factory.openPositions,
        },
      })),
    };

    res.json(geojson);
  } catch (error) {
    console.error('Error fetching factories geojson:', error);
    res.status(500).json({ error: 'Failed to fetch factories geojson' });
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
      .where(eq(factories.id, id));

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
