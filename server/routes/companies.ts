import { Router, Request, Response } from 'express';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { db, companies, factories, companyIndustries, industries } from '../db';

const router = Router();

// GET /api/companies - List companies with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, industry, sort = 'name', order = 'asc' } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    // Build where conditions
    const conditions = [];

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(companies.name, searchTerm),
          ilike(companies.industry, searchTerm),
          ilike(companies.description, searchTerm)
        )
      );
    }

    if (industry) {
      conditions.push(eq(companies.industry, industry as string));
    }

    // Get total count
    const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(companies)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by clause
    let orderByClause;
    if (sort === 'factoryCount') {
      orderByClause = order === 'desc'
        ? sql`(SELECT COUNT(*) FROM factories WHERE factories.company_id = companies.id) DESC, ${companies.name} ASC`
        : sql`(SELECT COUNT(*) FROM factories WHERE factories.company_id = companies.id) ASC, ${companies.name} ASC`;
    } else {
      orderByClause = order === 'desc'
        ? sql`${companies.name} DESC`
        : sql`${companies.name} ASC`;
    }

    // Query with factory count
    const result = await db
      .select({
        id: companies.id,
        name: companies.name,
        industry: companies.industry,
        description: companies.description,
        headquartersLat: companies.headquartersLat,
        headquartersLng: companies.headquartersLng,
        createdAt: companies.createdAt,
        factoryCount: sql<number>`(SELECT COUNT(*)::int FROM factories WHERE factories.company_id = companies.id)`,
        totalWorkforce: sql<number>`(SELECT COALESCE(SUM(workforce_size), 0)::int FROM factories WHERE factories.company_id = companies.id)`,
      })
      .from(companies)
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
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// GET /api/companies/:id - Get single company with relationships
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get company
    const companyResult = await db.select().from(companies).where(eq(companies.id, id));

    if (companyResult.length === 0) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    const company = companyResult[0];

    // Get factories for this company (include coordinates for map fly-to)
    const companyFactories = await db
      .select({
        id: factories.id,
        name: factories.name,
        specialization: factories.specialization,
        state: factories.state,
        workforceSize: factories.workforceSize,
        openPositions: factories.openPositions,
        latitude: factories.latitude,
        longitude: factories.longitude,
      })
      .from(factories)
      .where(eq(factories.companyId, id));

    // Get industries for this company (via junction table)
    const companyIndustriesResult = await db
      .select({
        id: industries.id,
        name: industries.name,
      })
      .from(companyIndustries)
      .innerJoin(industries, eq(companyIndustries.industryId, industries.id))
      .where(eq(companyIndustries.companyId, id));

    res.json({
      ...company,
      factories: companyFactories,
      industries: companyIndustriesResult,
      factoryCount: companyFactories.length,
      totalWorkforce: companyFactories.reduce((sum, f) => sum + (f.workforceSize || 0), 0),
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// POST /api/companies - Create company
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, aliases, industry, description, headquartersLat, headquartersLng } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    // Check if company with this name already exists
    const existing = await db.select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(ilike(companies.name, name))
      .limit(1);

    if (existing.length > 0) {
      // Return existing company instead of error (upsert behavior for import flow)
      res.status(200).json(existing[0]);
      return;
    }

    const result = await db.insert(companies).values({
      name,
      aliases: aliases || null,
      industry,
      description,
      headquartersLat,
      headquartersLng,
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// PUT /api/companies/:id - Update company
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, industry, description, headquartersLat, headquartersLng } = req.body;

    const result = await db.update(companies)
      .set({
        name,
        industry,
        description,
        headquartersLat,
        headquartersLng,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, id))
      .returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// DELETE /api/companies/:id - Delete company
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.delete(companies).where(eq(companies.id, id)).returning();

    if (result.length === 0) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.json({ message: 'Company deleted', id });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

export default router;
