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
