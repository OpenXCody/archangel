import { Router, Request, Response, NextFunction } from 'express';
import { and, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db, companies, factories, jobs } from '../db/index.js';
import { browsableCompanyFilter } from '../lib/companyFilters.js';
import { companyInScope, factoryInScope } from '../lib/scope.js';
import { listOpenJobs } from '../lib/openJobs.js';
import { pageLimit, pageOffset } from '../lib/paging.js';
import { answerDuplicate, answerWriteError, optionalText, requiredText } from '../lib/writes.js';
import { answerRefusal, changeRecord, recordAdded, removeRecord } from '../lib/records.js';
import { isUuid, refuseDeleteWithJobs } from '../lib/writes.js';

const router = Router();
// A company is addressed by its id, or, for reading, by its slug
// (/api/companies/tesla). A slug is swapped for the id here, so the handlers
// below only ever see ids.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
router.param('id', async (req: Request, res: Response, next: NextFunction, raw: string) => {
  const isId: boolean = isUuid(raw);
  if (isId) return next();
  const value = raw.toLowerCase();
  if (req.method !== 'GET' || !SLUG_RE.test(value)) {
    res.status(400).json({ error: 'Invalid id: expected a UUID' });
    return;
  }
  try {
    const [found] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, value)).limit(1);
    if (!found) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    req.params.id = found.id;
    next();
  } catch (error) {
    next(error);
  }
});

// GET /api/companies - List companies with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, industry, sort = 'name', order = 'asc' } = req.query;
    const limitNum = pageLimit(limit, 20, 100);
    const offsetNum = pageOffset(offset);

    // Build where conditions. Only companies with a factory in scope are listed,
    // and every per-company figure below counts in-scope factories only.
    const conditions: SQL[] = [browsableCompanyFilter, companyInScope()];

    if (search) {
      const searchTerm = `%${search}%`;
      const searchCondition = or(
        ilike(companies.name, searchTerm),
        ilike(companies.industry, searchTerm),
        ilike(companies.description, searchTerm)
      );
      if (searchCondition) conditions.push(searchCondition);
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
        ? sql`(SELECT COUNT(*) FROM factories WHERE factories.company_id = companies.id AND ${factoryInScope()}) DESC, ${companies.name} ASC`
        : sql`(SELECT COUNT(*) FROM factories WHERE factories.company_id = companies.id AND ${factoryInScope()}) ASC, ${companies.name} ASC`;
    } else {
      // By name, with featured employers first: the list opens on companies
      // people recognise instead of on whatever sorts first alphabetically.
      orderByClause = order === 'desc'
        ? sql`${companies.featured} DESC, ${companies.name} DESC`
        : sql`${companies.featured} DESC, ${companies.name} ASC`;
    }

    // Query with factory count
    const result = await db
      .select({
        id: companies.id,
        name: companies.name,
        industry: companies.industry,
        description: companies.description,
        domain: companies.domain,
        featured: companies.featured,
        slug: companies.slug,
        headquartersLat: companies.headquartersLat,
        headquartersLng: companies.headquartersLng,
        createdAt: companies.createdAt,
        factoryCount: sql<number>`(SELECT COUNT(*)::int FROM factories WHERE factories.company_id = companies.id AND ${factoryInScope()})`,
        totalWorkforce: sql<number>`(SELECT COALESCE(SUM(workforce_size), 0)::int FROM factories WHERE factories.company_id = companies.id AND ${factoryInScope()})`,
        occupationCount: sql<number>`(SELECT COUNT(DISTINCT fo.occupation_id)::int FROM factory_occupations fo INNER JOIN factories f ON f.id = fo.factory_id WHERE f.company_id = companies.id AND ${factoryInScope('f')})`,
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

    // Get company (hidden unless it has a factory in scope)
    const companyResult = await db.select().from(companies).where(and(eq(companies.id, id), companyInScope()));

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
        industry: factories.primaryNaicsDescription,
        city: factories.city,
        state: factories.state,
        workforceSize: factories.workforceSize,
        openPositions: factories.openPositions,
        latitude: factories.latitude,
        longitude: factories.longitude,
      })
      .from(factories)
      .where(and(eq(factories.companyId, id), factoryInScope()));

    // Occupations across all of this company's in-scope factories, with how many of
    // its factories employ each — what the explorer's "N occupations" tag
    // links to.
    const companyOccupations = await db.execute(sql`
      SELECT o.id, o.title, o.onet_code AS "onetCode",
             COUNT(DISTINCT fo.factory_id)::int AS "factoryCount",
             COALESCE(SUM(fo.headcount), 0)::int AS headcount
      FROM factory_occupations fo
      INNER JOIN factories f ON f.id = fo.factory_id
      INNER JOIN occupations o ON o.id = fo.occupation_id
      WHERE f.company_id = ${id} AND ${factoryInScope('f')}
      GROUP BY o.id, o.title, o.onet_code
      ORDER BY "factoryCount" DESC, o.title ASC
    `);

    res.json({
      ...company,
      factories: companyFactories,
      jobs: await listOpenJobs(eq(jobs.companyId, id)),
      occupations: Array.from(companyOccupations as Iterable<Record<string, unknown>>),
      factoryCount: companyFactories.length,
      occupationCount: (companyOccupations as unknown as { length?: number }).length ?? Array.from(companyOccupations as Iterable<unknown>).length,
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
    const { aliases, headquartersLat, headquartersLng } = req.body;
    const name = requiredText(req.body?.name);
    const industry = optionalText(req.body?.industry, 80);
    const description = optionalText(req.body?.description, 600);
    if (!name) {
      res.status(400).json({ error: 'A company needs a name of up to 200 characters.' });
      return;
    }
    if (industry === false || description === false) {
      res.status(400).json({ error: 'Industry is text of up to 80 characters and a description of up to 600.' });
      return;
    }

    // The same name in any letter case is the same company (compared as text, not as a pattern).
    const [existing] = await db.select({ id: companies.id, name: companies.name, slug: companies.slug })
      .from(companies)
      .where(sql`lower(${companies.name}) = lower(${name})`)
      .limit(1);
    if (existing) {
      answerDuplicate(res, 'company', existing);
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

    await recordAdded('company', result[0], req.user!);
    res.status(201).json(result[0]);
  } catch (error) {
    answerWriteError(res, error, 'company');
  }
});

// PUT /api/companies/:id - Change a company. Only the fields given change:
// name, industry, description, domain, featured, aliases, headquartersLat/Lng.
router.put('/:id', async (req: Request, res: Response) => {
  try {
    res.json(await changeRecord('company', req.params.id, req.body, req.user!));
  } catch (error) {
    answerRefusal(res, error, 'company');
  }
});

// DELETE /api/companies/:id - Delete a company. Its factories, jobs,
// applications, memberships and invites go with it; `removed` counts them.
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (await refuseDeleteWithJobs(res, 'company', req.params.id)) return;
    const gone = await removeRecord('company', req.params.id, req.user!);
    if (!gone) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }
    res.json({ message: 'Company deleted', id: gone.id, removed: gone.removed });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

export default router;
