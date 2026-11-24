import { Router, Request, Response, NextFunction } from 'express';
import { and, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db, companies, factories, jobs, occupations } from '../db/index.js';
import { browsableCompanyFilter } from '../lib/companyFilters.js';
import { companyInScope, factoryInScope } from '../lib/scope.js';
import { OPEN_JOBS_SHOWN, countOpenJobs, listOpenJobs } from '../lib/openJobs.js';
import { pageLimit, pageOffset } from '../lib/paging.js';
import { isUuid, refuseDeleteWithJobs } from '../lib/writes.js';
import { answerRefusal, changeRecord, removeRecord } from '../lib/records.js';
import { sourcesOf } from '../lib/sources.js';
import { rowsOf } from '../lib/rows.js';
import { companyIndustries, companyIndustry } from '../lib/industries.js';
import { industryByName, industryBySlug } from '../../shared/industry.js';
import { versionsOfCompany } from '../lib/versions.js';
import { careersOfService } from '../lib/military.js';
import { addCompany } from '../lib/companyAdd.js';
import { clearMark, listMarks, readMark, setMark } from '../lib/marks.js';

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
        ilike(companies.description, searchTerm)
      );
      if (searchCondition) conditions.push(searchCondition);
    }

    // An industry is one of the 21, named as a plant carries it or by its page's slug.
    // A company is listed under the industry most of its plants are in.
    if (typeof industry === 'string' && industry) {
      const asked = industryByName(industry) ?? industryBySlug(industry);
      conditions.push(
        asked
          ? sql`${companies.id} IN (SELECT ci.company_id FROM (${companyIndustries()}) ci WHERE ci.industry = ${asked.name})`
          : sql`FALSE`
      );
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
        // The industry most of its plants are in (one of the 21, or null), not the free text on the row.
        industry: companyIndustry(sql`${companies.id}`),
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

// GET /api/companies/marks - The companies whose mark was set by hand, each
// with the version its image is served under. Few rows; CompanyLogo reads it once.
router.get('/marks', async (_req: Request, res: Response) => {
  try {
    // No stale answer while a fresh one is fetched: the admin who set a mark sees it at once.
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate, s-maxage=30');
    res.json({ marks: await listMarks() });
  } catch (error) {
    console.error('Error listing marks:', error);
    res.status(500).json({ error: 'Failed to list marks' });
  }
});

// GET /api/companies/:id/mark - The image of a mark set by hand. Asked for
// with `?v=<version>`, it is the same bytes for good and is cached as such.
router.get('/:id/mark', async (req: Request, res: Response) => {
  try {
    const mark = await readMark(req.params.id);
    if (!mark) {
      res.status(404).json({ error: 'This company has no mark set by hand.' });
      return;
    }
    res.setHeader('Content-Type', mark.mime);
    res.setHeader(
      'Cache-Control',
      req.query.v === mark.version ? 'public, max-age=31536000, s-maxage=31536000, immutable' : 'public, max-age=0, s-maxage=60, stale-while-revalidate=60'
    );
    res.send(mark.bytes);
  } catch (error) {
    console.error('Error reading a mark:', error);
    res.status(500).json({ error: 'Failed to read the mark' });
  }
});

// PUT /api/companies/:id/mark { image: <base64> } - Set a company's mark by
// hand (PNG, SVG or JPEG, at most 200 KB). DELETE goes back to the automatic one.
router.put('/:id/mark', async (req: Request, res: Response) => {
  try {
    res.json(await setMark(req.params.id, req.body, req.user!));
  } catch (error) {
    answerRefusal(res, error, 'mark');
  }
});

router.delete('/:id/mark', async (req: Request, res: Response) => {
  try {
    res.json({ cleared: await clearMark(req.params.id, req.user!) });
  } catch (error) {
    answerRefusal(res, error, 'mark');
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
        workforceYear: factories.workforceYear,
        products: factories.products,
        status: factories.status,
        openPositions: factories.openPositions,
        latitude: factories.latitude,
        longitude: factories.longitude,
        // For the page of a company with one plant, which leads with that plant's own facts.
        address: factories.address,
        workforceSource: factories.workforceSource,
        workforceNote: factories.workforceNote,
        openedYear: factories.openedYear,
        curated: factories.curated,
      })
      .from(factories)
      .where(and(eq(factories.companyId, id), factoryInScope()));

    // The company it is part of, and the companies that are part of it.
    const [parent] = company.parentCompanyId
      ? await db
          .select({ id: companies.id, name: companies.name, slug: companies.slug, domain: companies.domain })
          .from(companies)
          .where(eq(companies.id, company.parentCompanyId))
      : [];
    const subsidiaries = await db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        domain: companies.domain,
        industry: companies.industry,
        factoryCount: sql<number>`(SELECT COUNT(*)::int FROM factories WHERE factories.company_id = companies.id AND ${factoryInScope()})`,
      })
      .from(companies)
      .where(eq(companies.parentCompanyId, id))
      .orderBy(sql`6 DESC`, companies.name);

    // People in a state, where a source says how many.
    const peopleByState = rowsOf<{ state: string; people: number; year: number | null; source: string | null; note: string | null }>(
      await db.execute(sql`
        SELECT state, people, year, source, note FROM company_state_headcounts WHERE company_id = ${id} ORDER BY people DESC, state ASC
      `)
    );

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

    const occupationRows = rowsOf(companyOccupations);
    // A company with one plant and no careers recorded there: the careers
    // typical of that plant's industry, as the plant's own page lists them.
    const onlyIndustry = companyFactories.length === 1 ? companyFactories[0].industry : null;
    const typicalCareers =
      occupationRows.length === 0 && onlyIndustry
        ? rowsOf(
            await db.execute(sql`
              SELECT o.id, o.title
              FROM industry_occupations io
              INNER JOIN occupations o ON o.id = io.occupation_id
              WHERE io.industry = ${onlyIndustry}
              ORDER BY io.rank ASC
              LIMIT 10
            `)
          ).map((r) => ({ id: String(r.id), title: String(r.title) }))
        : [];

    res.json({
      ...company,
      parent: parent ?? null,
      subsidiaries,
      headquarters: company.headquartersCity
        ? { city: company.headquartersCity, state: company.headquartersState, country: company.headquartersCountry }
        : null,
      peopleByState,
      sources: await sourcesOf('companies', id),
      factories: companyFactories,
      jobs: await listOpenJobs(eq(jobs.companyId, id), OPEN_JOBS_SHOWN),
      // How many are open in all: the page lists the newest few and links to the rest.
      openJobCount: await countOpenJobs(eq(jobs.companyId, id)),
      occupations: occupationRows,
      typicalCareers,
      // The careers the company has its own version of.
      versions: await versionsOfCompany(id),
      // A military service has no plants: its page lists its careers. Empty for every other company.
      serviceCareers: company.service ? await careersOfService(id) : [],
      factoryCount: companyFactories.length,
      occupationCount: occupationRows.length,
      totalWorkforce: companyFactories.reduce((sum, f) => sum + (f.workforceSize || 0), 0),
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// POST /api/companies - Add a company, and with `factory` its first factory in
// the same write: { name, domain?, description?, factory?: { name?, address?,
// city?, state, zip?, latitude, longitude } }. Either both are added or
// neither. The answer is the company's row, with `factory` (the row added, or
// null). A refusal names its field; a factory's is `factory.<field>`.
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
    const { company, factory } = await addCompany(body, req.user!);
    res.status(201).json({ ...company, factory });
  } catch (error) {
    answerRefusal(res, error, 'company');
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
    // A military service is the employer of its careers: they are moved or deleted first.
    const [{ count: careers }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(occupations)
      .where(eq(occupations.serviceCompanyId, req.params.id));
    if (careers > 0) {
      res.status(409).json({ error: `This is the employer of ${careers === 1 ? 'a military career' : `${careers} military careers`}. Delete or move ${careers === 1 ? 'it' : 'them'} first.`, careers });
      return;
    }
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
