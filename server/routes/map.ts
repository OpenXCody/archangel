import { Router, Request, Response } from 'express';
import { sql, type SQL } from 'drizzle-orm';
import { db, factories } from '../db/index.js';
import { factoryInArea, factoryInScope, isStateInScope } from '../lib/scope.js';
import { FOCUS_AREAS, focusArea } from '../../shared/scope.js';

const router = Router();

// US state codes to full names mapping
const STATE_CODE_TO_NAME: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
  PR: 'Puerto Rico',
};

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

// GET /api/map/states/summary - Get aggregated statistics for the states in scope
router.get('/states/summary', async (_req: Request, res: Response) => {
  try {
    const result = await db
      .select({
        code: factories.state,
        factoryCount: sql<number>`COUNT(*)::int`,
        totalWorkforce: sql<number>`COALESCE(SUM(${factories.workforceSize}), 0)::int`,
        totalOpenPositions: sql<number>`COALESCE(SUM(${factories.openPositions}), 0)::int`,
      })
      .from(factories)
      .where(factoryInScope())
      .groupBy(factories.state)
      .orderBy(sql`COUNT(*) DESC`);

    const states = result.map((row) => ({
      code: row.code,
      name: STATE_CODE_TO_NAME[row.code as string] || row.code,
      factoryCount: row.factoryCount,
      totalWorkforce: row.totalWorkforce,
      totalOpenPositions: row.totalOpenPositions,
    }));

    res.json({ states });
  } catch (error) {
    console.error('Error fetching states summary:', error);
    res.status(500).json({ error: 'Failed to fetch states summary' });
  }
});

/**
 * Panel data for a set of factories: totals, the companies with the most
 * factories in the set, and its largest industries. `inSet` is given the name
 * the factories table goes by in each query.
 *
 * Top companies put featured employers first, then established companies
 * (those with several factories nationwide), then by factories in the set, so
 * the list opens on names people recognise rather than on whoever has the
 * most registry entries.
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
    ORDER BY c.featured DESC, count DESC, sites DESC, c.name ASC
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

  return {
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
  if (!isStateInScope(code)) {
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

// GET /api/map/areas - The focus areas: regions being filled out in depth.
router.get('/areas', (_req: Request, res: Response) => {
  res.json({ areas: FOCUS_AREAS });
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

// GET /api/map/states/:code - Get detailed summary for a single state
router.get('/states/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const upperCode = code.toUpperCase();

    if (!isStateInScope(upperCode)) {
      res.status(404).json({ error: 'State not found or has no factories' });
      return;
    }

    // Get aggregates
    const aggregateResult = await db
      .select({
        factoryCount: sql<number>`COUNT(*)::int`,
        totalWorkforce: sql<number>`COALESCE(SUM(${factories.workforceSize}), 0)::int`,
        totalOpenPositions: sql<number>`COALESCE(SUM(${factories.openPositions}), 0)::int`,
      })
      .from(factories)
      .where(sql`UPPER(${factories.state}) = ${upperCode} AND ${factoryInScope()}`);

    if (aggregateResult[0].factoryCount === 0) {
      res.status(404).json({ error: 'State not found or has no factories' });
      return;
    }

    // Get top factories by workforce
    const topFactories = await db
      .select({
        id: factories.id,
        name: factories.name,
        companyName: sql<string>`(SELECT name FROM companies WHERE companies.id = factories.company_id)`,
        workforceSize: factories.workforceSize,
        specialization: factories.specialization,
      })
      .from(factories)
      .where(sql`UPPER(${factories.state}) = ${upperCode} AND ${factoryInScope()}`)
      .orderBy(sql`${factories.workforceSize} DESC NULLS LAST`)
      .limit(5);

    res.json({
      code: upperCode,
      name: STATE_CODE_TO_NAME[upperCode] || upperCode,
      factoryCount: aggregateResult[0].factoryCount,
      totalWorkforce: aggregateResult[0].totalWorkforce,
      totalOpenPositions: aggregateResult[0].totalOpenPositions,
      topFactories,
    });
  } catch (error) {
    console.error('Error fetching state detail:', error);
    res.status(500).json({ error: 'Failed to fetch state detail' });
  }
});

export default router;
