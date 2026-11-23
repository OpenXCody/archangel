import { Router, Request, Response, NextFunction } from 'express';
import { and, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db, companies, factories, jobs, occupations } from '../db/index.js';
import { browsableCompanyFilter } from '../lib/companyFilters.js';
import { companyInScope, factoryInScope } from '../lib/scope.js';
import { OPEN_JOBS_SHOWN, countOpenJobs, listOpenJobs } from '../lib/openJobs.js';
import { pageLimit, pageOffset } from '../lib/paging.js';
import { answerDuplicate, answerWriteError, isUuid, optionalText, refuseDeleteWithJobs, requiredText } from '../lib/writes.js';
import { answerRefusal, changeRecord, recordAdded, removeRecord } from '../lib/records.js';
import { sourcesOf } from '../lib/sources.js';
import { int, rowsOf, text, type Row } from '../lib/rows.js';
import { byCompanyStanding, companyIndustries, companyIndustry, companyStandings, standingOf } from '../lib/industries.js';
import { industryByName, industryBySlug, leadingIndustry } from '../../shared/industry.js';
import { versionsOfCompany } from '../lib/versions.js';
import { careersOfService } from '../lib/military.js';

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
    const { offset = '0', limit = '20', search, industry, sort, order = 'asc' } = req.query;
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

    // The order: the one every list of companies has (most people, then most open jobs, then most
    // factories, then name), unless the list was asked for by name.
    const orderByClause =
      sort === 'name'
        ? order === 'desc' ? sql`${companies.name} DESC` : sql`${companies.name} ASC`
        : byCompanyStanding('cs', sql`${companies.name}`);

    // Each company with its figures over all of its in-scope factories.
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
        factoryCount: sql<number>`COALESCE(cs.factories, 0)::int`,
        totalWorkforce: sql<number>`COALESCE(cs.people, 0)::int`,
        // People is null where no factory of the company has a recorded headcount: unknown, never zero.
        people: sql<number | null>`cs.people`,
        openJobCount: sql<number>`COALESCE(cs.open_jobs, 0)::int`,
        occupationCount: sql<number>`(SELECT COUNT(DISTINCT fo.occupation_id)::int FROM factory_occupations fo INNER JOIN factories f ON f.id = fo.factory_id WHERE f.company_id = companies.id AND ${factoryInScope('f')})`,
      })
      .from(companies)
      .leftJoin(sql`(${companyStandings()}) cs`, sql`cs.company_id = ${companies.id}`)
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
    // In the order every list of companies has.
    const subsidiaries = rowsOf<Row>(
      await db.execute(sql`
        SELECT c.id, c.name, c.slug, c.domain, c.industry, cs.factories, cs.people, cs.open_jobs
        FROM companies c
        LEFT JOIN LATERAL (${companyStandings({ of: sql`c.id` })}) cs ON TRUE
        WHERE c.parent_company_id = ${id}
        ORDER BY ${byCompanyStanding('cs', sql`c.name`)}
      `)
    ).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slug: text(r.slug),
      domain: text(r.domain),
      industry: text(r.industry),
      factoryCount: int(r.factories),
      people: standingOf(r).people,
      openJobCount: int(r.open_jobs),
    }));

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
    // The careers typical of the company's industry (the one most of its
    // factories are in), in the industry's own order: what kind of work a
    // company like this has, never a claim about it. The page lists them
    // after the company's own careers, leaving out any it already lists.
    const industry = leadingIndustry(companyFactories.map((factory) => factory.industry));
    const typicalCareers = industry
      ? rowsOf(
          await db.execute(sql`
            SELECT o.id, o.title
            FROM industry_occupations io
            INNER JOIN occupations o ON o.id = io.occupation_id
            WHERE io.industry = ${industry}
            ORDER BY io.rank ASC, o.title ASC
            LIMIT 24
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
