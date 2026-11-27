import { sql, type SQL } from 'drizzle-orm';
import { occupationSkills, skillDomains, skillGroups, skills } from '../db/index.js';
import { eq } from 'drizzle-orm';
import type { Executor } from './audit.js';
import { placeColumns, placeOf, type SkillPlace } from './taxonomy.js';

/**
 * The order of a career's path: the one place it is decided. Every read that
 * returns a path, or picks from one (what is next, what is missing, what a job
 * starts from), orders by `routeOrder()`; none sorts `occupation_skills`
 * itself. A new reader that needs the order is a new caller, never a new
 * ORDER BY.
 *
 * Nothing about the order is stored yet, so it is derived: the skill's level,
 * then its domain's place in the taxonomy, its group's, its own place in its
 * group, then its name.
 */

/** The names a statement gives the three tables the order reads. */
export interface RouteNames {
  /** `skills` */
  skill: string;
  /** `skill_groups`, joined on the skill's `group_slug` */
  group: string;
  /** `skill_domains`, joined on the group's `domain_slug` */
  domain: string;
}

const NAMES: RouteNames = { skill: 's', group: 'sg', domain: 'sd' };
/** The tables under their own names, as the query builder writes them. */
export const ROUTE_TABLES: RouteNames = { skill: 'skills', group: 'skill_groups', domain: 'skill_domains' };

/** The joins `routeOrder()` needs beside the skill, for a hand-written statement. */
export function routeJoins(names: RouteNames = NAMES): SQL {
  const s = sql.identifier(names.skill);
  const sg = sql.identifier(names.group);
  const sd = sql.identifier(names.domain);
  return sql`LEFT JOIN skill_groups ${sg} ON ${sg}.slug = ${s}.group_slug LEFT JOIN skill_domains ${sd} ON ${sd}.slug = ${sg}.domain_slug`;
}

/** The ORDER BY of a path: what goes after the words, in any statement that has the three tables. */
export function routeOrder(names: RouteNames = NAMES): SQL {
  const s = sql.identifier(names.skill);
  const sg = sql.identifier(names.group);
  const sd = sql.identifier(names.domain);
  return sql`${s}.level ASC NULLS LAST, ${sd}.position ASC NULLS LAST, ${sg}.position ASC NULLS LAST, ${s}.group_position ASC NULLS LAST, ${s}.name ASC`;
}

/** A skill on a career's route. */
export interface RouteSkill extends SkillPlace {
  id: string;
  name: string;
  importance: string | null;
  /** How the skill is learned, in the catalogue's sentence. */
  howLearned: string | null;
  /** What the skill is, in the catalogue's words: a career's page previews a skill with it. */
  description: string | null;
}

/** A career's path in order: its skills, each with its level, group and domain. */
export async function routeOf(executor: Executor, careerId: string): Promise<RouteSkill[]> {
  const rows = await executor
    .select({ id: skills.id, name: skills.name, importance: occupationSkills.importance, howLearned: skills.howLearned, description: skills.description, ...placeColumns })
    .from(occupationSkills)
    .innerJoin(skills, eq(occupationSkills.skillId, skills.id))
    .leftJoin(skillGroups, eq(skillGroups.slug, skills.groupSlug))
    .leftJoin(skillDomains, eq(skillDomains.slug, skillGroups.domainSlug))
    .where(eq(occupationSkills.occupationId, careerId))
    .orderBy(routeOrder(ROUTE_TABLES));
  return rows.map(({ level, groupSlug, groupName, domainSlug, domainName, ...skill }) => ({
    ...skill,
    ...placeOf({ level, groupSlug, groupName, domainSlug, domainName }),
  }));
}
