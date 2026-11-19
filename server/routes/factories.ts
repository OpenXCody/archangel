import { Router, Request, Response } from 'express';
import { and, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db, factories, companies, factoryOccupations, occupations, jobs } from '../db/index.js';
import { uuidParam, uuidQuery } from '../middleware/validateUuid.js';
import { factoryInScope } from '../lib/scope.js';
import { jobIsOpen, listOpenJobs } from '../lib/openJobs.js';
import { packPins } from '../../shared/pins.js';
import { pageLimit, pageOffset } from '../lib/paging.js';
import { answerDuplicate, answerWriteError, coordinate, count, isUuid, optionalText, requiredText, stateCode } from '../lib/writes.js';
import { answerRefusal, changeRecord, recordAdded, removeRecord } from '../lib/records.js';
import { rowsOf } from '../lib/rows.js';
import { sourcesOf } from '../lib/sources.js';
import { adminSetFacts } from '../lib/provenance.js';
import { refuseDeleteWithJobs } from '../lib/writes.js';

/** A company with this many factories nationwide counts as established. */
const ESTABLISHED_MIN_SITES = 5;

const router = Router();
router.param('id', uuidParam);
router.use(uuidQuery('company'));

// GET /api/factories - List factories with offset-based pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offset = '0', limit = '20', search, state, company, industry, sort = 'name', order = 'asc' } = req.query;
    const limitNum = pageLimit(limit, 20, 100);
    const offsetNum = pageOffset(offset);

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
      // A factory's industry is its NAICS description; older rows carry it as a specialization.
      conditions.push(or(eq(factories.primaryNaicsDescription, industry as string), eq(factories.specialization, industry as string)));
    }

    // Get total count
    const whereClause = sql`${sql.join(conditions, sql` AND `)}`;
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(factories)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by clause
    // The name as it is shown: without the registry number some rows carry
    // in front ("105123 - Caterpillar"), and whatever its case.
    const shownName = sql`lower(regexp_replace(${factories.name}, '^#?[0-9]+ +[-–] *', ''))`;
    let orderByClause;
    if (sort === 'workforceSize') {
      // Plants with a known headcount first, largest first (or smallest
      // first); the rest after them, by name.
      orderByClause = order === 'desc'
        ? sql`${factories.workforceSize} DESC NULLS LAST, ${shownName} ASC, ${factories.id}`
        : sql`${factories.workforceSize} ASC NULLS LAST, ${shownName} ASC, ${factories.id}`;
    } else {
      orderByClause = order === 'desc' ? sql`${shownName} DESC, ${factories.id}` : sql`${shownName} ASC, ${factories.id}`;
    }

    // Query with company name and occupation count
    const result = await db
      .select({
        id: factories.id,
        name: factories.name,
        companyId: factories.companyId,
        companyName: sql<string>`(SELECT name FROM companies WHERE companies.id = factories.company_id)`,
        companyDomain: sql<string | null>`(SELECT domain FROM companies WHERE companies.id = factories.company_id)`,
        specialization: factories.specialization,
        industry: factories.primaryNaicsDescription,
        city: factories.city,
        description: factories.description,
        latitude: factories.latitude,
        longitude: factories.longitude,
        state: factories.state,
        workforceSize: factories.workforceSize,
        workforceYear: factories.workforceYear,
        workforceSource: factories.workforceSource,
        workforceNote: factories.workforceNote,
        products: factories.products,
        openedYear: factories.openedYear,
        status: factories.status,
        curated: factories.curated,
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
    const { states, company } = req.query;

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
      .where(jobIsOpen())
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
        address: factories.address,
        city: factories.city,
        state: factories.state,
        industry: factories.primaryNaicsDescription,
        workforceSize: factories.workforceSize,
        workforceYear: factories.workforceYear,
        workforceSource: factories.workforceSource,
        workforceNote: factories.workforceNote,
        products: factories.products,
        openedYear: factories.openedYear,
        status: factories.status,
        curated: factories.curated,
        openPositions: factories.openPositions,
        createdAt: factories.createdAt,
      })
      .from(factories)
      .where(and(eq(factories.id, id), factoryInScope()));

    if (factoryResult.length === 0) {
      // A plant that was merged into another: its old address leads to the one kept (record_merges).
      const [now] = rowsOf<{ id: string }>(
        await db.execute(sql`
          SELECT f.id FROM record_merges m JOIN factories f ON f.id = record_now('factory', m.from_id)
          WHERE m.kind = 'factory' AND m.from_id = ${id} AND ${factoryInScope('f')}`)
      );
      if (now) {
        res.redirect(301, `/api/factories/${now.id}`);
        return;
      }
      res.status(404).json({ error: 'Plant not found' });
      return;
    }

    const factory = factoryResult[0];

    // The company behind this site, with enough of its profile that the
    // factory's panel can introduce it: logo, description, how big it is.
    // `nearby` is its other sites, closest first.
    let company = null;
    let nearby: { id: string; name: string; city: string | null; state: string | null; latitude: string; longitude: string }[] = [];
    if (factory.companyId) {
      const [companyRow] = await db
        .select({
          id: companies.id,
          name: companies.name,
          slug: companies.slug,
          domain: companies.domain,
          featured: companies.featured,
          industry: companies.industry,
          description: companies.description,
        })
        .from(companies)
        .where(eq(companies.id, factory.companyId));
      if (companyRow) {
        const [footprint] = await db
          .select({
            siteCount: sql<number>`COUNT(*)::int`,
            stateCount: sql<number>`COUNT(DISTINCT ${factories.state})::int`,
          })
          .from(factories)
          .where(and(eq(factories.companyId, companyRow.id), factoryInScope()));
        company = { ...companyRow, siteCount: footprint?.siteCount ?? 1, stateCount: footprint?.stateCount ?? 1 };

        const lat = parseFloat(factory.latitude);
        const lng = parseFloat(factory.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng) && company.siteCount > 1) {
          // Coordinates are stored as text; only well-formed ones are cast.
          const numeric = sql`'^-?[0-9]+(\\.[0-9]+)?$'`;
          nearby = await db
            .select({
              id: factories.id,
              name: factories.name,
              city: factories.city,
              state: factories.state,
              latitude: factories.latitude,
              longitude: factories.longitude,
            })
            .from(factories)
            .where(
              and(
                eq(factories.companyId, companyRow.id),
                sql`${factories.id} <> ${id}`,
                sql`${factories.latitude} ~ ${numeric} AND ${factories.longitude} ~ ${numeric}`,
                factoryInScope()
              )
            )
            .orderBy(
              sql`POWER(${factories.latitude}::float8 - ${lat}, 2) + POWER((${factories.longitude}::float8 - ${lng}) * COS(RADIANS(${lat})), 2)`
            )
            .limit(5);
        }
      }
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

    // With no careers recorded for this plant, the careers typical of its
    // industry: what kind of work a plant like this has, not a claim about it.
    const industryName = factory.industry;
    const typicalCareers =
      factoryOccupationsResult.length === 0 && industryName
        ? rowsOf(
            await db.execute(sql`
              SELECT o.id, o.title
              FROM industry_occupations io
              INNER JOIN occupations o ON o.id = io.occupation_id
              WHERE io.industry = ${industryName}
              ORDER BY io.rank ASC
              LIMIT 10
            `)
          ).map((r) => ({ id: String(r.id), title: String(r.title) }))
        : [];

    res.json({
      ...factory,
      company,
      // Where its facts came from, for the foot of the page.
      sources: await sourcesOf('factories', id),
      nearby,
      typicalCareers,
      occupations: factoryOccupationsResult,
      jobs: await listOpenJobs(eq(jobs.factoryId, id)),
    });
  } catch (error) {
    console.error('Error fetching factory:', error);
    res.status(500).json({ error: 'Failed to fetch factory' });
  }
});

const FACTORY_NEEDS =
  'A plant needs a company, a name, a state, a latitude from -90 to 90 and a longitude from -180 to 180.';

// POST /api/factories - Create factory
router.post('/', async (req: Request, res: Response) => {
  try {
    const { companyId, name, specialization, description, latitude, longitude, workforceSize, openPositions } = req.body;

    const cleanName = requiredText(name, 300);
    const lat = coordinate(latitude, 'latitude');
    const lng = coordinate(longitude, 'longitude');
    const state = stateCode(req.body?.state);
    const city = optionalText(req.body?.city, 120);
    const address = optionalText(req.body?.address, 300);
    const workforce = count(workforceSize);
    const openings = count(openPositions);
    if (!isUuid(companyId) || !cleanName || !state || lat === null || lng === null) {
      res.status(400).json({ error: FACTORY_NEEDS });
      return;
    }
    if (city === false || address === false) {
      res.status(400).json({ error: 'A city is text of up to 120 characters and an address of up to 300.' });
      return;
    }
    if (workforce === false || openings === false) {
      res.status(400).json({ error: 'Workforce and open positions are whole numbers from 0 up.' });
      return;
    }

    // One company does not have two plants of the same name in one state.
    const [existing] = await db
      .select({ id: factories.id, name: factories.name })
      .from(factories)
      .where(and(eq(factories.companyId, companyId), eq(factories.state, state), sql`lower(${factories.name}) = lower(${cleanName})`))
      .limit(1);
    if (existing) {
      answerDuplicate(res, 'factory', existing, 'That company already has a plant with that name in that state.');
      return;
    }

    const result = await db.insert(factories).values({
      companyId,
      name: cleanName,
      specialization,
      description,
      latitude: lat,
      longitude: lng,
      address,
      city,
      state,
      workforceSize: workforce,
      openPositions: openings,
    }).returning();

    await recordAdded('factory', result[0], req.user!);
    // What an admin typed is the admin's: no source replaces it (server/lib/provenance.ts).
    await adminSetFacts(
      db,
      result[0].id,
      ['coordinates' as const, ...(city ? ['city' as const] : []), ...(address ? ['address' as const] : []), ...(workforce !== null && workforce !== undefined ? ['headcount' as const] : [])],
      req.user!.id
    );
    res.status(201).json(result[0]);
  } catch (error) {
    answerWriteError(res, error, 'factory');
  }
});

// PUT /api/factories/:id - Change a factory. A value that is left out stays
// as it is; one that is given must be usable: name, companyId, state,
// latitude, longitude, city, address, industry, and the older specialization,
// description, workforceSize and openPositions.
router.put('/:id', async (req: Request, res: Response) => {
  try {
    res.json(await changeRecord('factory', req.params.id, req.body, req.user!));
  } catch (error) {
    answerRefusal(res, error, 'factory');
  }
});

// DELETE /api/factories/:id - Delete a factory. Its jobs and their
// applications go with it; `removed` counts them.
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (await refuseDeleteWithJobs(res, 'factory', req.params.id)) return;
    const gone = await removeRecord('factory', req.params.id, req.user!);
    if (!gone) {
      res.status(404).json({ error: 'Plant not found' });
      return;
    }
    res.json({ message: 'Plant deleted', id: gone.id, removed: gone.removed });
  } catch (error) {
    console.error('Error deleting factory:', error);
    res.status(500).json({ error: 'Failed to delete factory' });
  }
});

export default router;
