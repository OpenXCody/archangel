import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { INDUSTRY_NAME_LIST } from './industries.js';
import { int, rowsOf, text } from './rows.js';

/**
 * How complete the factory data is, state by state: one pass over the factories,
 * computed when asked. Every figure is a count of rows, so the states add up
 * to the total and a share is worked out from two exact numbers. What each
 * count means is written here once and said under the table in Admin Tools
 * (`components/admin/QualityTable.tsx`): change one, change the other.
 *
 * - plants (on screen, Factories): every row in factories, filed under its `state` (null when it has none).
 * - industry: its industry is one of the 21 (`primary_naics_description`).
 * - code: it has a clean NAICS code (`naics`: the stored code means one 2022 national industry).
 * - county: it has been placed in a county (`county_fips`).
 * - people: a headcount is recorded (`workforce_size` above zero).
 * - address: it has a street address: `address` is not blank and is not just the city again.
 * - outsideId: an outside register's id is kept for it (a row in `external_references`
 *   that is not a source address; today that is the EPA registry id).
 * - onePlantCompanies: factories that are their company's only factory in the country,
 *   which is also the number of such companies.
 * - duplicates: factories that share their company and their spot (coordinates equal
 *   to three decimal places, about a hundred metres) with another factory, unless an
 *   admin has said the two are separate factories (`plants_apart`); duplicateGroups
 *   is how many spots that is. Admin Tools lists them pair by pair
 *   (`GET /api/admin/plants/pairs?list=spot`, server/lib/plantPairs.ts): when
 *   that list is empty this is zero.
 */
export interface QualityRow {
  state: string | null;
  plants: number;
  industry: number;
  code: number;
  county: number;
  people: number;
  address: number;
  outsideId: number;
  onePlantCompanies: number;
  duplicates: number;
  duplicateGroups: number;
}

const COUNTS = ['plants', 'industry', 'code', 'county', 'people', 'address', 'outsideId', 'onePlantCompanies', 'duplicates', 'duplicateGroups'] as const;

export async function dataQuality(): Promise<{ total: QualityRow & { companies: number }; states: QualityRow[] }> {
  const result = await db.execute(sql`
    WITH placed AS (
      SELECT id, company_id, round(lat::numeric, 3) AS rlat, round(lng::numeric, 3) AS rlng,
             COUNT(*) OVER (PARTITION BY company_id, round(lat::numeric, 3), round(lng::numeric, 3)) AS same
      FROM factories
      WHERE company_id IS NOT NULL AND lat IS NOT NULL AND lng IS NOT NULL
    ), shared AS (
      SELECT id, company_id, rlat, rlng FROM placed WHERE same > 1
    ), spots AS (
      -- Of the rows that share a spot, the ones beside a row nobody has said is a separate plant.
      SELECT a.id, 2 AS same, ROW_NUMBER() OVER (PARTITION BY a.company_id, a.rlat, a.rlng ORDER BY a.id) AS nth
      FROM shared a
      WHERE EXISTS (
        SELECT 1 FROM shared b
        WHERE b.company_id = a.company_id AND b.rlat = a.rlat AND b.rlng = a.rlng AND b.id <> a.id
          AND NOT EXISTS (SELECT 1 FROM plants_apart p WHERE p.a_id = least(a.id, b.id) AND p.b_id = greatest(a.id, b.id)))
    ), outside AS (
      SELECT DISTINCT entity_id FROM external_references WHERE entity_type = 'factories' AND source <> 'CURATED'
    ), sites AS (
      SELECT company_id, COUNT(*) AS plants FROM factories WHERE company_id IS NOT NULL GROUP BY company_id
    )
    SELECT f.state,
           COUNT(*)::int AS plants,
           COUNT(*) FILTER (WHERE f.primary_naics_description IN (${INDUSTRY_NAME_LIST}))::int AS industry,
           COUNT(f.naics)::int AS code,
           COUNT(f.county_fips)::int AS county,
           COUNT(*) FILTER (WHERE f.workforce_size > 0)::int AS people,
           COUNT(*) FILTER (WHERE btrim(COALESCE(f.address, '')) <> '' AND lower(btrim(f.address)) <> lower(btrim(COALESCE(f.city, ''))))::int AS address,
           COUNT(outside.entity_id)::int AS outside_id,
           COUNT(*) FILTER (WHERE sites.plants = 1)::int AS one_plant_companies,
           COUNT(*) FILTER (WHERE spots.same > 1)::int AS duplicates,
           COUNT(*) FILTER (WHERE spots.same > 1 AND spots.nth = 1)::int AS duplicate_groups,
           (SELECT COUNT(*)::int FROM sites) AS companies
    FROM factories f
    LEFT JOIN spots ON spots.id = f.id
    LEFT JOIN outside ON outside.entity_id = f.id
    LEFT JOIN sites ON sites.company_id = f.company_id
    GROUP BY f.state
    ORDER BY plants DESC, f.state ASC NULLS LAST
  `);
  const rows = rowsOf(result);
  const states: QualityRow[] = rows.map((row) => ({
    state: text(row.state),
    plants: int(row.plants),
    industry: int(row.industry),
    code: int(row.code),
    county: int(row.county),
    people: int(row.people),
    address: int(row.address),
    outsideId: int(row.outside_id),
    onePlantCompanies: int(row.one_plant_companies),
    duplicates: int(row.duplicates),
    duplicateGroups: int(row.duplicate_groups),
  }));
  const total: QualityRow & { companies: number } = { state: null, plants: 0, industry: 0, code: 0, county: 0, people: 0, address: 0, outsideId: 0, onePlantCompanies: 0, duplicates: 0, duplicateGroups: 0, companies: int(rows[0]?.companies) };
  for (const state of states) for (const key of COUNTS) total[key] += state[key];
  return { total, states };
}
