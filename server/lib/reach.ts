import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { rowsOf } from './rows.js';
import { civilianCareer, militaryCareer } from './military.js';
import { careerKind } from '../../shared/military.js';
import { reached } from '../../shared/reach.js';
import { isSkillLevel, type SkillLevel } from '../../shared/skillLevels.js';

/**
 * Reach between a military career and a civilian one, computed from the two
 * paths each time it is asked for: no crosswalk, nothing stored. A military
 * career reaches a civilian one when it holds at least a third of the civilian
 * career's path, and that path is written and has five skills or more
 * (`withinReach` in shared/reach.ts, which both lists here are held to). The
 * statements only count; the rule and the order are the shared ones.
 */

/** A skill of a civilian career's path that a military career's path does not have. */
export interface MissingSkill {
  id: string;
  name: string;
  level: SkillLevel | null;
}

/** A civilian career within a military career's reach. */
export interface CareerWithinReach {
  id: string;
  title: string;
  /** Skills of the civilian career's path that are on the military career's, and how many the path has. */
  held: number;
  total: number;
  /** The rest of the civilian path, lowest level first. */
  missing: MissingSkill[];
}

/** A military career that reaches a civilian one. */
export interface ReachingCareer {
  id: string;
  title: string;
  /** "Navy rating", and the service's code for the job. */
  kind: string | null;
  code: string | null;
  /** Skills of the civilian career's path that are on this career's, and how many the path has. */
  held: number;
  total: number;
}

/** The civilian careers a military career's path covers at least a third of, the most covered first. */
export async function civilianCareersWithinReach(militaryId: string): Promise<CareerWithinReach[]> {
  const rows = rowsOf(
    await db.execute(sql`
      SELECT c.id, c.title, COUNT(*)::int AS total, COUNT(mine.skill_id)::int AS held,
             COALESCE(
               json_agg(json_build_object('id', s.id, 'name', s.name, 'level', cs.stage) ORDER BY cs.stage ASC NULLS LAST, s.name)
                 FILTER (WHERE mine.skill_id IS NULL),
               '[]'::json
             ) AS missing
      FROM occupations c
      INNER JOIN occupation_skills cs ON cs.occupation_id = c.id
      INNER JOIN skills s ON s.id = cs.skill_id
      LEFT JOIN occupation_skills mine ON mine.occupation_id = ${militaryId} AND mine.skill_id = cs.skill_id
      WHERE ${civilianCareer('c')} AND c.path_status IS NOT NULL
      GROUP BY c.id, c.title
      HAVING COUNT(mine.skill_id) > 0
    `)
  );
  return reached(
    rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      held: Number(row.held),
      total: Number(row.total),
      missing: (row.missing as { id: string; name: string; level: number | null }[]).map((skill) => ({
        id: skill.id,
        name: skill.name,
        level: isSkillLevel(skill.level) ? skill.level : null,
      })),
    }))
  );
}

/** The military careers whose path covers at least a third of a civilian career's, the most covering first. */
export async function militaryCareersReaching(civilianId: string): Promise<ReachingCareer[]> {
  const rows = rowsOf(
    await db.execute(sql`
      SELECT m.id, m.title, m.code, m.code_system,
             COUNT(*)::int AS held,
             (SELECT COUNT(*)::int FROM occupation_skills whole WHERE whole.occupation_id = ${civilianId}) AS total
      FROM occupation_skills cs
      INNER JOIN occupations c ON c.id = cs.occupation_id AND ${civilianCareer('c')} AND c.path_status IS NOT NULL
      INNER JOIN occupation_skills ms ON ms.skill_id = cs.skill_id
      INNER JOIN occupations m ON m.id = ms.occupation_id AND ${militaryCareer(null, 'm')}
      WHERE cs.occupation_id = ${civilianId}
      GROUP BY m.id, m.title, m.code, m.code_system
    `)
  );
  return reached(
    rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      kind: careerKind(row.code_system === null ? null : String(row.code_system)),
      code: row.code === null ? null : String(row.code),
      held: Number(row.held),
      total: Number(row.total),
    }))
  );
}
