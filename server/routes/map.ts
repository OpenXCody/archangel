import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { db, factories } from '../db';

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
// Mirrors the production handler in api/index.ts so the local dev server
// serves the same shape the map choropleth expects.
router.get('/state-counts', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        state: factories.state,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(factories)
      .where(sql`${factories.state} IS NOT NULL`)
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

// GET /api/map/states/summary - Get aggregated statistics for all states
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
      .where(sql`${factories.state} IS NOT NULL`)
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

// GET /api/map/states/:code/overview - Panel data for a selected state.
// Mirrors the production handler in api/index.ts.
router.get('/states/:code/overview', async (req: Request, res: Response) => {
  const code = String(req.params.code).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    res.status(400).json({ error: 'Invalid state code' });
    return;
  }

  try {
    const [totalsRow] = await db
      .select({
        totalFactories: sql<number>`COUNT(*)::int`,
        totalWorkforce: sql<number>`COALESCE(SUM(${factories.workforceSize}), 0)::int`,
        totalCompanies: sql<number>`COUNT(DISTINCT ${factories.companyId})::int`,
      })
      .from(factories)
      .where(sql`${factories.state} = ${code}`);

    const topCompanies = await db.execute(sql`
      SELECT c.id, c.name, COUNT(*)::int AS count
      FROM factories f
      INNER JOIN companies c ON c.id = f.company_id
      WHERE f.state = ${code}
        AND c.name ~ '[A-Za-z]{2,}'
        AND c.name !~ '^[#(]'
        AND c.name !~ '^\\d+\\s'
        AND c.name !~ '^\\d+/\\d'
      GROUP BY c.id, c.name
      ORDER BY count DESC, c.name ASC
      LIMIT 10
    `);

    const topIndustries = await db.execute(sql`
      SELECT
        COALESCE(primary_naics_description, primary_naics, 'Unclassified') AS label,
        COUNT(*)::int AS count
      FROM factories
      WHERE state = ${code} AND primary_naics IS NOT NULL
      GROUP BY label
      ORDER BY count DESC
      LIMIT 8
    `);

    res.json({
      code,
      totalFactories: totalsRow?.totalFactories ?? 0,
      totalCompanies: totalsRow?.totalCompanies ?? 0,
      totalWorkforce: totalsRow?.totalWorkforce ?? 0,
      topCompanies: Array.from(topCompanies as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id,
        name: r.name,
        count: r.count,
      })),
      topIndustries: Array.from(topIndustries as Iterable<Record<string, unknown>>).map((r) => ({
        label: r.label,
        count: r.count,
      })),
    });
  } catch (error) {
    console.error('Error fetching state overview:', error);
    res.status(500).json({ error: 'Failed to fetch state overview' });
  }
});

// GET /api/map/states/:code - Get detailed summary for a single state
router.get('/states/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const upperCode = code.toUpperCase();

    // Get aggregates
    const aggregateResult = await db
      .select({
        factoryCount: sql<number>`COUNT(*)::int`,
        totalWorkforce: sql<number>`COALESCE(SUM(${factories.workforceSize}), 0)::int`,
        totalOpenPositions: sql<number>`COALESCE(SUM(${factories.openPositions}), 0)::int`,
      })
      .from(factories)
      .where(sql`UPPER(${factories.state}) = ${upperCode}`);

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
      .where(sql`UPPER(${factories.state}) = ${upperCode}`)
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
