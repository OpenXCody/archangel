import { eq, sql, type SQL } from 'drizzle-orm';
import { db, skillDomains, skillGroups, skills } from '../db/index.js';
import { SKILL_LEVELS, isSkillLevel, type SkillLevel } from '../../shared/skillLevels.js';
import type { Executor } from './audit.js';
import { rowsOf } from './rows.js';
import { makeNamesBySkill } from './makes.js';
import { civilianPathLine } from './military.js';

/**
 * The skill taxonomy as the API gives it: every skill is in one skill group,
 * every group in one domain, and every skill has one level. The tables are
 * loaded from data/skills/taxonomy.json by a generated migration
 * (scripts/build-taxonomy-sql.mjs).
 */

/** A domain or a group, by the two things a link and a label need. */
export interface TaxonomyRef {
  slug: string;
  name: string;
}

/**
 * Where a skill sits. All three are null only for a skill no migration has
 * placed (a local database filled with `npm run db:seed` alone): the taxonomy
 * migration places every stored skill or stops, and a skill added by hand
 * needs a group and a level.
 */
export interface SkillPlace {
  level: SkillLevel | null;
  group: TaxonomyRef | null;
  domain: TaxonomyRef | null;
}

/**
 * The columns a skill's place is read from, for a select over `skills` joined
 * to its group and domain with `placeJoins`. `placeOf` nests a row of them.
 */
export const placeColumns = {
  level: skills.level,
  groupSlug: skillGroups.slug,
  groupName: skillGroups.name,
  domainSlug: skillDomains.slug,
  domainName: skillDomains.name,
};

/** For hand-written SQL: the same columns, and the joins, over `skills` aliased `alias`. */
export function placeSql(alias: string): { columns: SQL; joins: SQL } {
  const s = sql.identifier(alias);
  return {
    columns: sql`${s}.level, sg.slug AS group_slug, sg.name AS group_name, sd.slug AS domain_slug, sd.name AS domain_name`,
    joins: sql`LEFT JOIN skill_groups sg ON sg.slug = ${s}.group_slug LEFT JOIN skill_domains sd ON sd.slug = sg.domain_slug`,
  };
}

interface PlaceRow {
  level?: unknown;
  groupSlug?: unknown;
  groupName?: unknown;
  domainSlug?: unknown;
  domainName?: unknown;
  group_slug?: unknown;
  group_name?: unknown;
  domain_slug?: unknown;
  domain_name?: unknown;
}

/** A row's place, nested as the API gives it. Reads either spelling of the columns. */
export function placeOf(row: PlaceRow): SkillPlace {
  const ref = (slug: unknown, name: unknown): TaxonomyRef | null => (typeof slug === 'string' && typeof name === 'string' ? { slug, name } : null);
  const level = row.level === null || row.level === undefined ? null : Number(row.level);
  return {
    level: isSkillLevel(level) ? level : null,
    group: ref(row.groupSlug ?? row.group_slug, row.groupName ?? row.group_name),
    domain: ref(row.domainSlug ?? row.domain_slug, row.domainName ?? row.domain_name),
  };
}

/** A level as it arrives in a request body or a query string: 1, 2 or 3, or null when it is not one. */
export function readLevel(value: unknown): SkillLevel | null {
  const level = typeof value === 'string' && /^[123]$/.test(value) ? Number(value) : value;
  return isSkillLevel(level) ? level : null;
}

/** The group with this slug, with its domain; null when there is none. */
export async function findGroup(executor: Executor, slug: unknown): Promise<{ group: TaxonomyRef; domain: TaxonomyRef } | null> {
  if (typeof slug !== 'string' || slug.length === 0 || slug.length > 120) return null;
  const [row] = await executor
    .select({ groupSlug: skillGroups.slug, groupName: skillGroups.name, domainSlug: skillDomains.slug, domainName: skillDomains.name })
    .from(skillGroups)
    .innerJoin(skillDomains, eq(skillDomains.slug, skillGroups.domainSlug))
    .where(eq(skillGroups.slug, slug))
    .limit(1);
  return row ? { group: { slug: row.groupSlug, name: row.groupName }, domain: { slug: row.domainSlug, name: row.domainName } } : null;
}

export interface TaxonomySkill {
  id: string;
  name: string;
  level: SkillLevel;
  /** How many careers use it: civilian careers, as every such figure is. */
  careers: number;
  /** How many military careers use it: said only for a skill no civilian career uses. */
  militaryCareers: number;
  /** Its makes by name, in the order they are shown: the leaves beyond the skill. Empty for most skills. */
  makes: string[];
}
export interface TaxonomyGroup extends TaxonomyRef {
  description: string;
  skills: TaxonomySkill[];
}
export interface TaxonomyDomain extends TaxonomyRef {
  description: string;
  groups: TaxonomyGroup[];
}
export interface Taxonomy {
  levels: { id: SkillLevel; name: string }[];
  domains: TaxonomyDomain[];
}

/**
 * The whole tree: every domain, its groups and their skills, in the order
 * they are shown (a group's skills by level, then as the taxonomy file orders
 * them), each skill with its makes. Four small reads: 16 domains, about a
 * hundred groups, some 650 skills and their makes.
 */
export async function readTaxonomy(): Promise<Taxonomy> {
  const [domainRows, groupRows, skillRows, makes] = await Promise.all([
    db.select().from(skillDomains).orderBy(skillDomains.position, skillDomains.slug),
    db.select().from(skillGroups).orderBy(skillGroups.position, skillGroups.slug),
    db.execute(sql`
      SELECT s.id, s.name, s.level, s.group_slug,
             (SELECT COUNT(*)::int FROM occupation_skills os WHERE os.skill_id = s.id AND ${civilianPathLine('os')}) AS careers,
             (SELECT COUNT(*)::int FROM occupation_skills os WHERE os.skill_id = s.id AND NOT ${civilianPathLine('os')}) AS military_careers
      FROM skills s
      WHERE s.group_slug IS NOT NULL AND s.level IS NOT NULL
      ORDER BY s.level, s.group_position NULLS LAST, s.name
    `),
    makeNamesBySkill(),
  ]);
  const groups = new Map<string, TaxonomyGroup>();
  const domains = new Map<string, TaxonomyDomain>();
  for (const row of domainRows) domains.set(row.slug, { slug: row.slug, name: row.name, description: row.description, groups: [] });
  for (const row of groupRows) {
    const group: TaxonomyGroup = { slug: row.slug, name: row.name, description: row.description, skills: [] };
    groups.set(row.slug, group);
    domains.get(row.domainSlug)?.groups.push(group);
  }
  for (const row of rowsOf(skillRows)) {
    const level = Number(row.level);
    if (!isSkillLevel(level)) continue;
    const id = String(row.id);
    groups.get(String(row.group_slug))?.skills.push({ id, name: String(row.name), level, careers: Number(row.careers) || 0, militaryCareers: Number(row.military_careers) || 0, makes: makes.get(id) ?? [] });
  }
  return { levels: SKILL_LEVELS.map(({ id, name }) => ({ id, name })), domains: [...domains.values()] };
}
