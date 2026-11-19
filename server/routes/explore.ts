import { Router, Request, Response } from 'express';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { browsableCompanyNameSql } from '../lib/companyFilters.js';
import { factoryInArea, factoryInScope } from '../lib/scope.js';
import { FOCUS_AREAS } from '../../shared/scope.js';
import { STATE_CODE_TO_NAME } from '../../shared/states.js';
import { INDUSTRY_NAME_LIST, companyIndustries, listIndustries } from '../lib/industries.js';
import { industryByName, industryLabel } from '../../shared/industry.js';

const router = Router();

const EMPLOYER_COUNT = 12;
const CAREER_COUNT = 9;
const SKILL_GROUP_COUNT = 6;
const SKILLS_PER_GROUP = 6;
const STAGE_SKILL_NAMES = 3;
const FULL_PATH_SKILLS = 10;
const SUPPORT_CATEGORIES = new Set(['material handling']);
const STATE_COUNT = 10;
const INDUSTRY_COUNT = 10;
const OTHER = 'Other';

type Row = Record<string, unknown>;
const rowsOf = (result: unknown): Row[] => Array.from(result as Iterable<Row>);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const int = (value: unknown): number => Number(value) || 0;

/**
 * A skill's category as the overview shows it. The column holds leftovers from
 * the skill tree import ("Subcategory", "Category", "Skill", "Root", blanks):
 * those fold into "Other". "Welding" and "Welding & Fabrication" are one group.
 */
function skillCategory(skillTable: string): SQL {
  const category = sql`${sql.identifier(skillTable)}.category`;
  return sql`CASE
    WHEN ${category} IS NULL OR lower(btrim(${category})) IN ('', 'subcategory', 'category', 'skill', 'root') THEN ${OTHER}
    WHEN lower(btrim(${category})) = 'welding' THEN 'Welding & Fabrication'
    ELSE btrim(${category})
  END`;
}

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
  category: string;
  stageCount: number;
  /** The path has enough skills to be worth showing first. */
  full: boolean;
}

/**
 * Careers for the overview: one from each kind of work in turn (a career's
 * kind is the category most of its path's skills fall in), so the set spans
 * the trades instead of repeating the largest one. Which career stands for a
 * kind, and which kind leads, changes with the day and with nothing else.
 */
function pickCareers(candidates: CareerCandidate[], day: string, count: number): CareerCandidate[] {
  const byCategory = new Map<string, CareerCandidate[]>();
  for (const career of candidates) {
    const list = byCategory.get(career.category);
    if (list) list.push(career);
    else byCategory.set(career.category, [career]);
  }
  for (const list of byCategory.values()) {
    // Paths with all three stages filled first, the fuller ones ahead of thin
    // ones (a path of a dozen skills says more than one of six), then the day's order.
    list.sort(
      (a, b) =>
        b.stageCount - a.stageCount || Number(b.full) - Number(a.full) || hash(`${day}:${a.id}`) - hash(`${day}:${b.id}`)
    );
  }
  const categories = [...byCategory.keys()].sort(
    (a, b) => Number(a === OTHER) - Number(b === OTHER) || hash(`${day}:${a}`) - hash(`${day}:${b}`)
  );
  const picked: CareerCandidate[] = [];
  for (let round = 0; picked.length < count; round++) {
    let took = false;
    for (const category of categories) {
      const career = byCategory.get(category)?.[round];
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
             mode() WITHIN GROUP (ORDER BY ${skillCategory('s')}) AS category,
             COUNT(DISTINCT os.stage)::int AS stage_count,
             COUNT(*)::int AS skill_total
      FROM occupations o
      INNER JOIN occupation_skills os ON os.occupation_id = o.id AND os.stage IN (1, 2, 3)
      INNER JOIN skills s ON s.id = os.skill_id
      WHERE o.path_status IS NOT NULL
      GROUP BY o.id
    `)
  ).map((r): CareerCandidate => ({
    id: String(r.id),
    title: String(r.title),
    description: text(r.description),
    category: text(r.category) ?? OTHER,
    stageCount: int(r.stage_count),
    full: int(r.skill_total) >= FULL_PATH_SKILLS,
  }));

  // The overview leads with the technical trades. Careers whose paths are
  // mostly material handling stay in the lists but are not picked here,
  // unless there is nothing else to show.
  const technical = candidates.filter((career) => !SUPPORT_CATEGORIES.has(career.category.toLowerCase()));
  const picked = pickCareers(technical.length >= CAREER_COUNT ? technical : candidates, day, CAREER_COUNT);
  if (picked.length === 0) return [];

  const ids = sql.join(picked.map((career) => sql`${career.id}::uuid`), sql`, `);
  const staged = rowsOf(
    await db.execute(sql`
      SELECT os.occupation_id, os.stage, s.name
      FROM occupation_skills os
      INNER JOIN skills s ON s.id = os.skill_id
      WHERE os.occupation_id IN (${ids}) AND os.stage IN (1, 2, 3)
      ORDER BY os.occupation_id, os.stage, s.name
    `)
  );
  const names = new Map<string, string[]>();
  for (const r of staged) {
    const key = `${String(r.occupation_id)}:${int(r.stage)}`;
    const list = names.get(key);
    if (list) list.push(String(r.name));
    else names.set(key, [String(r.name)]);
  }

  return picked.map((career) => ({
    id: career.id,
    title: career.title,
    description: career.description,
    stages: ([1, 2, 3] as const).map((stage) => {
      const all = names.get(`${career.id}:${stage}`) ?? [];
      return { stage, count: all.length, skills: all.slice(0, STAGE_SKILL_NAMES) };
    }),
  }));
}

// The skills the most careers call for, in the largest categories.
async function loadSkillGroups() {
  const result = await db.execute(sql`
    WITH linked AS (
      SELECT s.id, s.name, ${skillCategory('s')} AS category, COUNT(*)::int AS career_count
      FROM occupation_skills os
      INNER JOIN skills s ON s.id = os.skill_id
      GROUP BY s.id
    ), ranked AS (
      SELECT linked.*,
             ROW_NUMBER() OVER (PARTITION BY category ORDER BY career_count DESC, name ASC) AS rank,
             SUM(career_count) OVER (PARTITION BY category)::int AS category_total
      FROM linked
    )
    SELECT id, name, category, career_count, category_total
    FROM ranked
    WHERE rank <= ${SKILLS_PER_GROUP}
    ORDER BY category_total DESC, category ASC, rank ASC
  `);

  const groups: { category: string; skills: { id: string; name: string; careerCount: number }[] }[] = [];
  for (const r of rowsOf(result)) {
    const category = String(r.category);
    let group = groups[groups.length - 1];
    if (!group || group.category !== category) {
      group = { category, skills: [] };
      groups.push(group);
    }
    group.skills.push({ id: String(r.id), name: String(r.name), careerCount: int(r.career_count) });
  }

  // "Other" is whatever had no usable category: it only fills a gap, last.
  const named = groups.filter((g) => g.category !== OTHER).slice(0, SKILL_GROUP_COUNT);
  const other = groups.find((g) => g.category === OTHER);
  return other && named.length < SKILL_GROUP_COUNT ? [...named, other] : named;
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
    const [employers, careers, skillGroups, places, byIndustry] = await Promise.all([
      loadEmployers(),
      loadCareers(day),
      loadSkillGroups(),
      loadPlaces(),
      loadIndustries(),
    ]);
    res.json({ employers, careers, skillGroups, areas: places.areas, states: places.states, ...byIndustry });
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
// - `skillCategories`: the skill categories in use;
// `factoryIndustries` is the same list as `industries.plants`, kept under its
// old name for the map's filter and for pages loaded before this.
router.get('/facets', async (_req: Request, res: Response) => {
  try {
    const [factoryRows, categoryRows, companyIndustryRows] = await Promise.all([
      db.execute(sql`
        SELECT f.primary_naics_description AS value
        FROM factories f
        WHERE ${factoryInScope('f')} AND f.primary_naics_description IN (${INDUSTRY_NAME_LIST})
        GROUP BY 1
      `),
      db.execute(sql`
        SELECT btrim(category) AS value, COUNT(*)::int AS n FROM skills
        WHERE category IS NOT NULL AND lower(btrim(category)) NOT IN ('', 'subcategory', 'category', 'skill', 'root')
        GROUP BY 1 ORDER BY value ASC
      `),
      db.execute(sql`SELECT DISTINCT ci.industry AS value FROM (${companyIndustries()}) ci`),
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
      skillCategories: values(categoryRows),
    });
  } catch (error) {
    console.error('Error fetching explore facets:', error);
    res.status(500).json({ error: 'Failed to fetch explore facets' });
  }
});

export default router;
