import { Router, Request, Response } from 'express';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { browsableCompanyNameSql } from '../lib/companyFilters.js';
import { factoryInScope, isStateInScope } from '../lib/scope.js';
import { jobIsOpen, jobsInOrder } from '../lib/openJobs.js';
import { byCompanyStanding, companyStandings, inPlace, known, listIndustries, placeOut, statsKey, statsOf, type Place } from '../lib/industries.js';
import { int, rowsOf, text, type Row } from '../lib/rows.js';
import { SCOPE, focusArea } from '../../shared/scope.js';
import { STATE_CODE_TO_NAME } from '../../shared/states.js';
import { industryBySlug, type Industry } from '../../shared/industry.js';

/**
 * The industry pages' two reads: every industry in a place, and one industry
 * in a place. The place is the country, one state (?state=TX) or one focus
 * area (?area=austin). What the figures are, and how official ones are kept
 * apart from the product's own, is said in server/lib/industries.ts.
 */
const router = Router();

const EMPLOYER_LIMIT = 10;
const PLANT_LIMIT = 10;
const CITY_LIMIT = 12;
const JOB_LIMIT = 6;
const CAREER_LIMIT = 60;

/**
 * The place a request names, or the answer to give instead. No parameter is
 * the country. Anything else in the query (Vercel's rewrite adds `path`) is
 * not looked at.
 */
function readPlace(req: Request, res: Response): Place | null {
  const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
  const area = typeof req.query.area === 'string' ? req.query.area.trim() : '';
  if (state && area) {
    res.status(400).json({ error: 'Give a state or an area, not both' });
    return null;
  }
  if (area) {
    const found = focusArea(area);
    if (!found) {
      res.status(404).json({ error: 'Area not found' });
      return null;
    }
    return { kind: 'area', id: found.id, name: found.name, area: found };
  }
  if (state) {
    const code = state.toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      res.status(400).json({ error: 'Invalid state code' });
      return null;
    }
    const names: Record<string, string> = STATE_CODE_TO_NAME;
    if (!(code in names) || !isStateInScope(code)) {
      res.status(404).json({ error: 'State not found' });
      return null;
    }
    return { kind: 'state', code, name: names[code] };
  }
  return { kind: 'country', name: SCOPE.stateName };
}

// GET /api/industries?state=|area= - Every industry in a place, largest
// first: by people employed where the official figure is published, then by
// the plants the product lists. An industry with nothing in the place is left
// out. `manufacturing` is the official figure for all of them together.
router.get('/', async (req: Request, res: Response) => {
  const place = readPlace(req, res);
  if (!place) return;
  try {
    res.json(await listIndustries(place));
  } catch (error) {
    console.error('Error fetching industries:', error);
    res.status(500).json({ error: 'Failed to fetch industries' });
  }
});

/** A box around a city's plants, with a margin, as the map's address takes it; null when none can be placed. */
function boxOf(row: Row): [[number, number], [number, number]] | null {
  const edges = [row.west, row.south, row.east, row.north].map((value) => (value === null || value === undefined ? NaN : Number(value)));
  if (!edges.every(Number.isFinite)) return null;
  const [west, south, east, north] = edges;
  const margin = 0.04;
  const round = (n: number) => Math.round(n * 1e4) / 1e4;
  return [
    [round(Math.max(-180, west - margin)), round(Math.max(-90, south - margin))],
    [round(Math.min(180, east + margin)), round(Math.min(90, north + margin))],
  ];
}

// GET /api/industries/:slug?state=|area= - One industry in a place: what it
// is, how big it is (official figures, and what the product lists), its
// leading employers and largest plants, its careers and open jobs, and where
// it is (the states for the country; the cities for a state or an area).
router.get('/:slug', async (req: Request, res: Response) => {
  const industry: Industry | undefined = industryBySlug(String(req.params.slug));
  if (!industry) {
    res.status(404).json({ error: 'Industry not found' });
    return;
  }
  const place = readPlace(req, res);
  if (!place) return;
  try {
    // A plant of this industry, in this place.
    const here = (table: string): SQL =>
      sql`${sql.identifier(table)}.primary_naics_description = ${industry.name} AND ${inPlace(place, table)} AND ${factoryInScope(table)}`;
    // Latitude and longitude are text: cast only what is a number.
    const coordinate = (column: string): SQL =>
      sql`CASE WHEN f.${sql.identifier(column)} ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN f.${sql.identifier(column)}::float8 END`;

    // One side of the box around a city's plants. The tenth and ninetieth
    // percentiles, not the extremes: one plant filed under the wrong city
    // would otherwise stretch the box across the state.
    const edge = (column: string, fraction: number): SQL =>
      sql`percentile_disc(${fraction}::float8) WITHIN GROUP (ORDER BY ${coordinate(column)})`;

    const [profileRows, totalRows, statRows, employerRows, plantRows, careerRows, jobRows, whereRows] = await Promise.all([
      db.execute(sql`SELECT summary FROM industry_profiles WHERE code = ${industry.code}`),

      db.execute(sql`
        SELECT COUNT(*)::int AS plants, COUNT(DISTINCT f.company_id)::int AS companies
        FROM factories f
        WHERE ${here('f')}
      `),

      // Every place's official figure for this industry, the latest year: the
      // place's own row is the page's headline, and the states' rows rank them.
      db.execute(sql`
        SELECT s.state, s.year, s.establishments, s.employment, s.avg_annual_pay, s.source, s.source_url
        FROM industry_stats s
        WHERE s.industry_code = ${industry.code}
          AND s.year = (SELECT MAX(year) FROM industry_stats WHERE industry_code = ${industry.code})
      `),

      // Leading employers, in the order every list of companies has, counted
      // over their plants of this industry here: most people (where a
      // headcount is recorded), then most open jobs, then most plants, then
      // name. `counted` is how many of those plants the people are summed
      // over, so the page can say when a figure covers only some of them.
      db.execute(sql`
        WITH named AS (
          -- OFFSET 0 keeps the name test below to these companies; without it
          -- the planner runs it over every company in the table first.
          SELECT c.id, c.name, c.slug, c.domain, here.factories, here.counted, here.people, here.open_jobs
          FROM (${companyStandings({ inSet: here })}) here
          INNER JOIN companies c ON c.id = here.company_id
          OFFSET 0
        )
        SELECT c.id, c.name, c.slug, c.domain, c.factories AS plants, c.counted, c.people, c.open_jobs
        FROM named c
        WHERE ${sql.raw(browsableCompanyNameSql('c.name'))}
        ORDER BY ${byCompanyStanding('c', sql`c.name`)}
        LIMIT ${EMPLOYER_LIMIT}
      `),

      // Largest plants: only plants whose headcount is recorded can be ranked.
      db.execute(sql`
        SELECT f.id, f.name, f.city, f.state, f.workforce_size AS people,
               c.name AS company_name, c.domain AS company_domain
        FROM factories f
        LEFT JOIN companies c ON c.id = f.company_id
        WHERE ${here('f')} AND f.workforce_size > 0
        ORDER BY f.workforce_size DESC, f.name ASC
        LIMIT ${PLANT_LIMIT}
      `),

      // The industry's own careers, in their curated order. Careers found in
      // plants of every industry are left out, as on the map: they would be
      // on every industry's page and say nothing about this one.
      db.execute(sql`
        SELECT o.id, o.title
        FROM industry_occupations io
        INNER JOIN occupations o ON o.id = io.occupation_id
        WHERE io.industry = ${industry.name} AND io.common = false
        ORDER BY io.rank ASC, o.title ASC
        LIMIT ${CAREER_LIMIT}
      `),

      db.execute(sql`
        SELECT j.id, j.serial, j.title, j.pay_min, j.pay_max, j.pay_period,
               c.name AS company_name, c.slug AS company_slug, f.name AS factory_name, f.city,
               (SELECT o.title FROM occupations o WHERE o.id = j.occupation_id) AS occupation_title,
               COUNT(*) OVER ()::int AS total
        FROM jobs j
        INNER JOIN factories f ON f.id = j.factory_id
        INNER JOIN companies c ON c.id = j.company_id
        WHERE ${jobIsOpen('j')} AND ${here('f')}
        ORDER BY ${jobsInOrder('j')}
        LIMIT ${JOB_LIMIT}
      `),

      place.kind === 'country'
        ? db.execute(sql`
            SELECT f.state AS code, COUNT(*)::int AS plants
            FROM factories f
            WHERE ${here('f')} AND f.state IS NOT NULL
            GROUP BY f.state
          `)
        : db.execute(sql`
            SELECT MIN(btrim(f.city)) AS city, MIN(f.state) AS state, COUNT(*)::int AS plants,
                   ${edge('longitude', 0.1)} AS west, ${edge('latitude', 0.1)} AS south,
                   ${edge('longitude', 0.9)} AS east, ${edge('latitude', 0.9)} AS north
            FROM factories f
            WHERE ${here('f')} AND btrim(COALESCE(f.city, '')) <> ''
            GROUP BY upper(btrim(f.city))
            ORDER BY plants DESC, city ASC
            LIMIT ${CITY_LIMIT}
          `),
    ]);

    const totals = rowsOf(totalRows)[0];
    const official = rowsOf(statRows);
    const key = statsKey(place);
    const jobs = rowsOf(jobRows);
    const names: Record<string, string> = STATE_CODE_TO_NAME;

    // The states where the industry is largest: by people employed where the
    // figure is published, then by the plants listed.
    let states: { code: string; name: string; plants: number; employment: number | null }[] | undefined;
    let cities: { name: string; state: string | null; plants: number; box: [[number, number], [number, number]] | null }[] | undefined;
    if (place.kind === 'country') {
      const listed = new Map(rowsOf(whereRows).map((row) => [String(row.code).toUpperCase(), int(row.plants)]));
      const employed = new Map(official.map((row) => [String(row.state), known(row.employment)]));
      states = Object.keys(names)
        .filter((code) => isStateInScope(code))
        .map((code) => ({ code, name: names[code], plants: listed.get(code) ?? 0, employment: employed.get(code) ?? null }))
        .filter((state) => state.plants > 0 || state.employment !== null)
        .sort((a, b) => (b.employment ?? -1) - (a.employment ?? -1) || b.plants - a.plants || a.name.localeCompare(b.name));
    } else {
      cities = rowsOf(whereRows).map((row) => ({
        name: String(row.city),
        state: text(row.state),
        plants: int(row.plants),
        box: boxOf(row),
      }));
    }

    res.json({
      industry: { slug: industry.slug, code: industry.code, name: industry.name, summary: text(rowsOf(profileRows)[0]?.summary) },
      place: placeOut(place),
      // Official figures for the place, when there are any.
      stats: key ? statsOf(official.find((row) => row.state === key)) : null,
      // What the product lists.
      plants: int(totals?.plants),
      companies: int(totals?.companies),
      employers: rowsOf(employerRows).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        slug: text(r.slug),
        domain: text(r.domain),
        plants: int(r.plants),
        // People at the plants whose headcount is recorded, and how many plants that is.
        people: known(r.people),
        counted: int(r.counted),
        openJobs: int(r.open_jobs),
      })),
      largestPlants: rowsOf(plantRows).map((r) => ({
        id: String(r.id),
        name: String(r.name),
        city: text(r.city),
        state: text(r.state),
        people: int(r.people),
        companyName: text(r.company_name),
        companyDomain: text(r.company_domain),
      })),
      careers: rowsOf(careerRows).map((r) => ({ id: String(r.id), title: String(r.title) })),
      openJobs: jobs.length > 0 ? int(jobs[0].total) : 0,
      jobs: jobs.map((r) => ({
        id: String(r.id),
        serial: int(r.serial),
        title: String(r.title),
        payMin: r.pay_min ?? null,
        payMax: r.pay_max ?? null,
        payPeriod: r.pay_period,
        companyName: String(r.company_name),
        companySlug: text(r.company_slug),
        occupationTitle: text(r.occupation_title) ?? undefined,
        factoryName: String(r.factory_name),
        city: text(r.city),
      })),
      ...(states ? { states } : {}),
      ...(cities ? { cities } : {}),
    });
  } catch (error) {
    console.error('Error fetching industry:', error);
    res.status(500).json({ error: 'Failed to fetch industry' });
  }
});

export default router;
