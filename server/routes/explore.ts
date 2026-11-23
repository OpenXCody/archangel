import { Router, Request, Response } from 'express';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { browsableCompanyNameSql } from '../lib/companyFilters.js';
import { factoryInArea, factoryInScope } from '../lib/scope.js';
import { FOCUS_AREAS } from '../../shared/scope.js';
import { STATE_CODE_TO_NAME } from '../../shared/states.js';
import { INDUSTRY_NAME_LIST, companyIndustries, listIndustries } from '../lib/industries.js';
import { industryByName, industryLabel } from '../../shared/industry.js';
import { int, rowsOf, text } from '../lib/rows.js';
import { SKILL_LEVELS } from '../../shared/skillLevels.js';
import { careerDomains } from '../lib/careers.js';
import { civilianCareer, civilianPathLine } from '../lib/military.js';

const router = Router();

const EMPLOYER_COUNT = 12;
const CAREER_COUNT = 9;
const SKILL_DOMAIN_COUNT = 6;
const SKILLS_PER_DOMAIN = 6;
const LEVEL_SKILL_NAMES = 3;
const FULL_PATH_SKILLS = 10;
const STATE_COUNT = 10;
const INDUSTRY_COUNT = 10;
/** The kind of a career whose skills have no domain (a database no taxonomy was loaded into). */
const UNPLACED = '';

/** FNV-1a: a stable order for a given day, with no state to keep. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface CareerCandidate {
  id: string;
  title: string;
  description: string | null;
  /** Its home domain, by slug; for a career with none, the domain most of its path's skills are in. */
  domain: string;
  levelCount: number;
  /** The path has enough skills to be worth showing first. */
  full: boolean;
}

/**
 * Careers for the overview: one from each kind of work in turn (a career's
 * kind is its home domain), so the set spans
 * the trades instead of repeating the largest one. Which career stands for a
 * kind, and which kind leads, changes with the day and with nothing else.
 */
function pickCareers(candidates: CareerCandidate[], day: string, count: number): CareerCandidate[] {
  const byDomain = new Map<string, CareerCandidate[]>();
  for (const career of candidates) {
    const list = byDomain.get(career.domain);
    if (list) list.push(career);
    else byDomain.set(career.domain, [career]);
  }
  for (const list of byDomain.values()) {
    // Paths with all three levels filled first, the fuller ones ahead of thin
    // ones (a path of a dozen skills says more than one of six), then the day's order.
    list.sort(
      (a, b) =>
        b.levelCount - a.levelCount || Number(b.full) - Number(a.full) || hash(`${day}:${a.id}`) - hash(`${day}:${b.id}`)
    );
  }
  const domains = [...byDomain.keys()].sort(
    (a, b) => Number(a === UNPLACED) - Number(b === UNPLACED) || hash(`${day}:${a}`) - hash(`${day}:${b}`)
  );
  const picked: CareerCandidate[] = [];
  for (let round = 0; picked.length < count; round++) {
    let took = false;
    for (const domain of domains) {
      const career = byDomain.get(domain)?.[round];
      if (!career) continue;
      picked.push(career);
      took = true;
      if (picked.length === count) break;
    }
    if (!took) break;
  }
  return picked;
}

// Featured employers with a plant in scope, most plants first. Each with the
// industry most of its plants are in (one of the 21, or none).
async function loadEmployers() {
  const result = await db.execute(sql`
    SELECT c.id, c.name, c.slug, c.domain,
           mode() WITHIN GROUP (ORDER BY f.primary_naics_description COLLATE "C")
             FILTER (WHERE f.primary_naics_description IN (${INDUSTRY_NAME_LIST})) AS industry,
           COUNT(*)::int AS site_count,
           COUNT(DISTINCT f.state)::int AS state_count
    FROM companies c
    INNER JOIN factories f ON f.company_id = c.id AND ${factoryInScope('f')}
    WHERE c.featured AND ${sql.raw(browsableCompanyNameSql('c.name'))}
    GROUP BY c.id
    ORDER BY site_count DESC, state_count DESC, c.name ASC
    LIMIT ${EMPLOYER_COUNT}
  `);
  return rowsOf(result).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    slug: text(r.slug),
    domain: text(r.domain),
    industry: text(r.industry),
    siteCount: int(r.site_count),
    stateCount: int(r.state_count),
  }));
}

// Careers that have a path, with the shape of each path.
async function loadCareers(day: string) {
  const candidates = rowsOf(
    await db.execute(sql`
      SELECT o.id, o.title, o.description,
             COALESCE(o.home_domain, mode() WITHIN GROUP (ORDER BY COALESCE(sg.domain_slug, ${UNPLACED}))) AS domain,
             COUNT(DISTINCT s.level)::int AS level_count,
             COUNT(*)::int AS skill_total
      FROM occupations o
      INNER JOIN occupation_skills os ON os.occupation_id = o.id
      INNER JOIN skills s ON s.id = os.skill_id AND s.level IS NOT NULL
      LEFT JOIN skill_groups sg ON sg.slug = s.group_slug
      WHERE o.path_status IS NOT NULL AND ${civilianCareer('o')}
      GROUP BY o.id
    `)
  ).map((r): CareerCandidate => ({
    id: String(r.id),
    title: String(r.title),
    description: text(r.description),
    domain: text(r.domain) ?? UNPLACED,
    levelCount: int(r.level_count),
    full: int(r.skill_total) >= FULL_PATH_SKILLS,
  }));

  const picked = pickCareers(candidates, day, CAREER_COUNT);
  if (picked.length === 0) return [];

  const ids = sql.join(picked.map((career) => sql`${career.id}::uuid`), sql`, `);
  const byLevel = rowsOf(
    await db.execute(sql`
      SELECT os.occupation_id, s.level, s.name
      FROM occupation_skills os
      INNER JOIN skills s ON s.id = os.skill_id
      WHERE os.occupation_id IN (${ids}) AND s.level IS NOT NULL
      ORDER BY os.occupation_id, s.level, s.name
    `)
  );
  const names = new Map<string, string[]>();
  for (const r of byLevel) {
    const key = `${String(r.occupation_id)}:${int(r.level)}`;
    const list = names.get(key);
    if (list) list.push(String(r.name));
    else names.set(key, [String(r.name)]);
  }

  return picked.map((career) => ({
    id: career.id,
    title: career.title,
    description: career.description,
    levels: SKILL_LEVELS.map(({ id: level }) => {
      const all = names.get(`${career.id}:${level}`) ?? [];
      return { level, count: all.length, skills: all.slice(0, LEVEL_SKILL_NAMES) };
    }),
  }));
}

// The skills the most careers call for, in the domains careers draw on most.
async function loadSkillDomains() {
  const result = await db.execute(sql`
    WITH linked AS (
      SELECT s.id, s.name, sd.slug, sd.name AS domain, COUNT(*)::int AS career_count
      FROM occupation_skills os
      INNER JOIN skills s ON s.id = os.skill_id
      INNER JOIN skill_groups sg ON sg.slug = s.group_slug
      INNER JOIN skill_domains sd ON sd.slug = sg.domain_slug
      WHERE ${civilianPathLine('os')}
      GROUP BY s.id, sd.slug
    ), ranked AS (
      SELECT linked.*,
             ROW_NUMBER() OVER (PARTITION BY slug ORDER BY career_count DESC, name ASC) AS rank,
             SUM(career_count) OVER (PARTITION BY slug)::int AS domain_total
      FROM linked
    )
    SELECT id, name, slug, domain, career_count, domain_total
    FROM ranked
    WHERE rank <= ${SKILLS_PER_DOMAIN}
    ORDER BY domain_total DESC, domain ASC, rank ASC
  `);

  const domains: { slug: string; name: string; skills: { id: string; name: string; careerCount: number }[] }[] = [];
  for (const r of rowsOf(result)) {
    const slug = String(r.slug);
    let domain = domains[domains.length - 1];
    if (!domain || domain.slug !== slug) {
      domain = { slug, name: String(r.domain), skills: [] };
      domains.push(domain);
    }
    domain.skills.push({ id: String(r.id), name: String(r.name), careerCount: int(r.career_count) });
  }
  return domains.slice(0, SKILL_DOMAIN_COUNT);
}

/**
 * The domains and groups the Skills list can be narrowed to: those with a
 * skill some career uses, in the taxonomy's order.
 */
async function loadSkillFacets() {
  const rows = rowsOf(
    await db.execute(sql`
      SELECT sd.slug AS domain_slug, sd.name AS domain_name, sg.slug, sg.name
      FROM skill_groups sg
      INNER JOIN skill_domains sd ON sd.slug = sg.domain_slug
      WHERE EXISTS (
        SELECT 1 FROM skills s INNER JOIN occupation_skills os ON os.skill_id = s.id WHERE s.group_slug = sg.slug AND ${civilianPathLine('os')}
      )
      ORDER BY sd.position, sd.slug, sg.position, sg.slug
    `)
  );
  const domains: { slug: string; name: string; groups: { slug: string; name: string }[] }[] = [];
  for (const r of rows) {
    let domain = domains[domains.length - 1];
    if (!domain || domain.slug !== String(r.domain_slug)) {
      domain = { slug: String(r.domain_slug), name: String(r.domain_name), groups: [] };
      domains.push(domain);
    }
    domain.groups.push({ slug: String(r.slug), name: String(r.name) });
  }
  return domains;
}

// Factories per state and per focus area, counted in one pass over the table.
// An area's count is what lies inside its drawn boundary, as on the map's panel.
async function loadPlaces() {
  const columns: SQL[] = [
    sql`f.state AS code`,
    sql`COUNT(*)::int AS factory_count`,
    ...FOCUS_AREAS.map(
      (area, i) => sql`COUNT(*) FILTER (WHERE ${factoryInArea(area, 'f')})::int AS ${sql.identifier(`area_${i}`)}`
    ),
  ];
  const rows = rowsOf(
    await db.execute(sql`
      SELECT ${sql.join(columns, sql`, `)}
      FROM factories f
      WHERE ${factoryInScope('f')}
      GROUP BY f.state
    `)
  );

  const names: Record<string, string> = STATE_CODE_TO_NAME;
  const states = rows
    .map((r) => ({ code: text(r.code)?.toUpperCase() ?? '', factoryCount: int(r.factory_count) }))
    .filter((s) => s.code in names && s.factoryCount > 0)
    .sort((a, b) => b.factoryCount - a.factoryCount || a.code.localeCompare(b.code))
    .slice(0, STATE_COUNT)
    .map((s) => ({ code: s.code, name: names[s.code], factoryCount: s.factoryCount }));

  const areas = FOCUS_AREAS.map((area, i) => ({
    id: area.id,
    name: area.name,
    description: area.description,
    factoryCount: rows.reduce((sum, r) => sum + int(r[`area_${i}`]), 0),
  }));

  return { areas, states };
}

// The largest industries in the country: by people employed (official
// figures) where published, else by plants listed.
async function loadIndustries() {
  const { industries, manufacturing } = await listIndustries({ kind: 'country', name: '' });
  return {
    industries: industries.slice(0, INDUSTRY_COUNT).map(({ slug, name, plants, employment }) => ({ slug, name, plants, employment })),
    industriesYear: manufacturing?.year ?? null,
  };
}

// GET /api/explore/overview - Everything the Explore overview shows, in one
// response: featured employers, careers with a path, the most connected
// skills, the focus areas and the states with the most factories.
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const [employers, careers, skillDomains, places, byIndustry] = await Promise.all([
      loadEmployers(),
      loadCareers(day),
      loadSkillDomains(),
      loadPlaces(),
      loadIndustries(),
    ]);
    res.json({ employers, careers, skillDomains, areas: places.areas, states: places.states, ...byIndustry });
  } catch (error) {
    console.error('Error fetching explore overview:', error);
    res.status(500).json({ error: 'Failed to fetch explore overview' });
  }
});

// GET /api/explore/facets - The values the browse lists can be filtered by,
// taken from every row (not from the first page a list happens to load):
// - `industries`: of the 21, those some plant carries (`plants`) and those
//   that are some company's industry (`companies`: the one most of its plants
//   are in), each by the name a plant carries, in the order of their short names;
// - `skillDomains`: the domains with a skill some career uses, each
//   `{ slug, name, groups: [{ slug, name }] }`, in the taxonomy's order;
// - `careerDomains`: the domains that are some career's home, each
//   `{ slug, name }`, in the same order;
// `factoryIndustries` is the same list as `industries.plants`, kept under its
// old name for the map's filter and for pages loaded before this.
router.get('/facets', async (_req: Request, res: Response) => {
  try {
    const [factoryRows, skillDomains, companyIndustryRows, homes] = await Promise.all([
      db.execute(sql`
        SELECT f.primary_naics_description AS value
        FROM factories f
        WHERE ${factoryInScope('f')} AND f.primary_naics_description IN (${INDUSTRY_NAME_LIST})
        GROUP BY 1
      `),
      loadSkillFacets(),
      db.execute(sql`SELECT DISTINCT ci.industry AS value FROM (${companyIndustries()}) ci`),
      careerDomains(),
    ]);
    const values = (result: unknown) =>
      rowsOf(result)
        .map((r) => text(r.value))
        .filter((v): v is string => v !== null)
        .sort((x, y) => x.localeCompare(y));
    // Of the 21 only, in the order a person reads them: by the short name.
    const industries = (result: unknown) =>
      values(result)
        .filter((name) => industryByName(name) !== undefined)
        .sort((x, y) => industryLabel(x).localeCompare(industryLabel(y)));
    const plantIndustries = industries(factoryRows);
    res.json({
      industries: { plants: plantIndustries, companies: industries(companyIndustryRows) },
      factoryIndustries: plantIndustries,
      skillDomains,
      careerDomains: homes,
    });
  } catch (error) {
    console.error('Error fetching explore facets:', error);
    res.status(500).json({ error: 'Failed to fetch explore facets' });
  }
});

export default router;
