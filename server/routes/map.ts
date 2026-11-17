import { Router, Request, Response } from 'express';
import { sql, type SQL } from 'drizzle-orm';
import { db, factories } from '../db/index.js';
import { factoryInArea, factoryInBox, factoryInScope, isStateInScope } from '../lib/scope.js';
import { focusArea } from '../../shared/scope.js';
import { STATE_CODE_TO_NAME } from '../../shared/states.js';

const router = Router();

/** How many plants a place's panel is sent: enough to list a town's, not a city's. */
const PLACE_PLANT_LIMIT = 24;
/** How many open jobs a state's, focus area's or place's panel is sent. */
const REGION_JOB_LIMIT = 6;

// GET /api/map/state-counts - Factory counts keyed by state code.
// Only states in scope appear, so the choropleth shades nothing else.
router.get('/state-counts', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        state: factories.state,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(factories)
      .where(factoryInScope())
      .groupBy(factories.state);

    const out: Record<string, number> = {};
    for (const row of rows) {
      if (row.state) out[row.state] = row.count;
    }

    res.json(out);
  } catch (error) {
    console.error('Error fetching state counts:', error);
    res.status(500).json({ error: 'Failed to fetch state counts' });
  }
});

/**
 * Panel data for a set of factories: totals, the companies with the most
 * factories in the set, and its largest industries. `inSet` is given the name
 * the factories table goes by in each query.
 *
 * Companies are listed by how many factories they have in the set, so the
 * list reads as what it is: who is here, the largest presence first. Where
 * two have the same number, the featured employer and then the company with
 * more factories nationwide comes first, so ties open on names people know.
 */
async function buildOverview(inSet: (factoryTable: string) => SQL) {
  const [totalsRow] = await db
    .select({
      totalFactories: sql<number>`COUNT(*)::int`,
      totalWorkforce: sql<number>`COALESCE(SUM(${factories.workforceSize}), 0)::int`,
      totalCompanies: sql<number>`COUNT(DISTINCT ${factories.companyId})::int`,
    })
    .from(factories)
    .where(sql`${inSet('factories')} AND ${factoryInScope()}`);

  const topCompanies = await db.execute(sql`
    SELECT c.id, c.name, c.domain, c.featured, COUNT(*)::int AS count,
           (SELECT COUNT(*)::int FROM factories site WHERE site.company_id = c.id) AS sites
    FROM factories f
    INNER JOIN companies c ON c.id = f.company_id
    WHERE ${inSet('f')} AND ${factoryInScope('f')}
      AND c.name ~ '[A-Za-z]{2,}'
      AND c.name !~ '^[#(]'
      AND c.name !~ '^\\d+\\s'
      AND c.name !~ '^\\d+/\\d'
    GROUP BY c.id, c.name, c.domain, c.featured
    ORDER BY count DESC, c.featured DESC, sites DESC, c.name ASC
    LIMIT 12
  `);

  const topIndustries = await db.execute(sql`
    SELECT
      COALESCE(f.primary_naics_description, f.primary_naics, 'Unclassified') AS label,
      COUNT(*)::int AS count
    FROM factories f
    WHERE ${inSet('f')} AND ${factoryInScope('f')} AND f.primary_naics IS NOT NULL
    GROUP BY label
    ORDER BY count DESC
    LIMIT 8
  `);

  // Careers typical of the industries found here. Each factory counts toward
  // the careers of its industry, the industry's leading careers most (a
  // fabrication shop says "welder" louder than "receiving inspector"), so the
  // list reflects what this place mostly makes. Careers found in every
  // industry are left out: they would lead every list and say nothing about
  // the place.
  const careers = await db.execute(sql`
    SELECT o.id, o.title, COUNT(*)::int AS count, SUM(1.0 / io.rank) AS weight
    FROM factories f
    INNER JOIN industry_occupations io ON io.industry = f.primary_naics_description AND io.common = false
    INNER JOIN occupations o ON o.id = io.occupation_id
    WHERE ${inSet('f')} AND ${factoryInScope('f')}
    GROUP BY o.id, o.title
    ORDER BY weight DESC, o.title ASC
    LIMIT 8
  `);

  // Who is hiring here: the newest open jobs at these factories, and how many
  // there are in all. Empty where nobody is, and the panel then says nothing.
  const openJobs = await db.execute(sql`
    SELECT j.id, j.serial, j.title, j.pay_min, j.pay_max, j.pay_period,
           c.name AS company_name, f.name AS factory_name, f.city,
           COUNT(*) OVER ()::int AS total
    FROM jobs j
    INNER JOIN factories f ON f.id = j.factory_id
    INNER JOIN companies c ON c.id = j.company_id
    WHERE j.status = 'open' AND j.expires_at > now() AND ${inSet('f')} AND ${factoryInScope('f')}
    ORDER BY j.posted_at DESC
    LIMIT ${REGION_JOB_LIMIT}
  `);
  const jobRows = Array.from(openJobs as Iterable<Record<string, unknown>>);

  return {
    openJobs: jobRows.length > 0 ? Number(jobRows[0].total) : 0,
    jobs: jobRows.map((r) => ({
      id: r.id,
      serial: r.serial,
      title: r.title,
      payMin: r.pay_min,
      payMax: r.pay_max,
      payPeriod: r.pay_period,
      companyName: r.company_name,
      factoryName: r.factory_name,
      city: r.city ?? null,
    })),
    careers: Array.from(careers as Iterable<Record<string, unknown>>).map((r) => ({ id: r.id, title: r.title, count: r.count })),
    totalFactories: totalsRow?.totalFactories ?? 0,
    totalCompanies: totalsRow?.totalCompanies ?? 0,
    totalWorkforce: totalsRow?.totalWorkforce ?? 0,
    topCompanies: Array.from(topCompanies as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id,
      name: r.name,
      domain: r.domain ?? null,
      featured: Boolean(r.featured),
      count: r.count,
      sites: r.sites,
    })),
    topIndustries: Array.from(topIndustries as Iterable<Record<string, unknown>>).map((r) => ({
      label: r.label,
      count: r.count,
    })),
  };
}

// GET /api/map/states/:code/overview - Panel data for a selected state.
// A state outside the scope is a 404, the same as one that does not exist.
router.get('/states/:code/overview', async (req: Request, res: Response) => {
  const code = String(req.params.code).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    res.status(400).json({ error: 'Invalid state code' });
    return;
  }
  if (!(code in STATE_CODE_TO_NAME) || !isStateInScope(code)) {
    res.status(404).json({ error: 'State not found' });
    return;
  }
  try {
    const overview = await buildOverview((t) => sql`${sql.identifier(t)}.state = ${code}`);
    res.json({ code, ...overview });
  } catch (error) {
    console.error('Error fetching state overview:', error);
    res.status(500).json({ error: 'Failed to fetch state overview' });
  }
});

// GET /api/map/areas/:id/overview - Panel data for a focus area, the same
// shape as a state's. Factories are those inside the area's drawn boundary.
router.get('/areas/:id/overview', async (req: Request, res: Response) => {
  const area = focusArea(String(req.params.id));
  if (!area) {
    res.status(404).json({ error: 'Area not found' });
    return;
  }
  try {
    const overview = await buildOverview((t) => factoryInArea(area, t));
    res.json({ id: area.id, name: area.name, description: area.description, bounds: area.bounds, ...overview });
  } catch (error) {
    console.error('Error fetching area overview:', error);
    res.status(500).json({ error: 'Failed to fetch area overview' });
  }
});

// GET /api/map/bounds/overview?west=&south=&east=&north= - Panel data for
// any box on the map: what a place found by search holds. The same overview a
// state or focus area has, plus the plants themselves when there are few
// enough to list (the best-known companies' first).
router.get('/bounds/overview', async (req: Request, res: Response) => {
  const edge = (name: string): number => {
    const raw = req.query[name];
    return typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  };
  const west = edge('west');
  const south = edge('south');
  const east = edge('east');
  const north = edge('north');
  const valid =
    [west, south, east, north].every(Number.isFinite) &&
    west >= -180 && east <= 180 && south >= -90 && north <= 90 &&
    west < east && south < north;
  if (!valid) {
    res.status(400).json({ error: 'Give west, south, east and north as degrees, west of east and south of north' });
    return;
  }
  const bounds: [[number, number], [number, number]] = [[west, south], [east, north]];
  try {
    const overview = await buildOverview((t) => factoryInBox(bounds, t));
    const plants = await db.execute(sql`
      SELECT f.id, f.name, f.city, f.state, f.latitude, f.longitude,
             c.id AS company_id, c.name AS company_name, c.domain AS company_domain
      FROM factories f
      LEFT JOIN companies c ON c.id = f.company_id
      WHERE ${factoryInBox(bounds, 'f')} AND ${factoryInScope('f')}
      ORDER BY COALESCE(c.featured, false) DESC,
               (SELECT COUNT(*) FROM factories site WHERE site.company_id = f.company_id) DESC,
               f.name ASC
      LIMIT ${PLACE_PLANT_LIMIT}
    `);
    res.json({
      bounds,
      ...overview,
      plants: Array.from(plants as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city ?? null,
        state: r.state ?? null,
        latitude: r.latitude,
        longitude: r.longitude,
        companyId: r.company_id ?? null,
        companyName: r.company_name ?? null,
        companyDomain: r.company_domain ?? null,
      })),
    });
  } catch (error) {
    console.error('Error fetching bounds overview:', error);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

export default router;
