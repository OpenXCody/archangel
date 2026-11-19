import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db, skillMakes, userSkillMakes, userSkills } from '../db/index.js';
import type { Executor } from './audit.js';
import { isUuid } from './writes.js';
import { rowsOf } from './rows.js';

/**
 * Makes: the named equipment and software a skill is run on ("CNC Control
 * Operation": Fanuc, Haas, Siemens). A make is a leaf beyond the skill and
 * never replaces it; a person who holds or is learning the skill can say which
 * of its makes they have run. The curated list is data/skills/makes.json,
 * loaded by a generated migration (scripts/build-makes-sql.mjs); an admin
 * corrects it on the skill's record (the writes are in records.ts).
 *
 * This file reads makes, and writes a person's own marks.
 */

export interface Make {
  id: string;
  name: string;
}

/** The most makes a skill carries, and the longest name one has: the file's limits, kept for a make added by hand. */
export const MAKES_MAX = 12;
export const MAKE_NAME_MAX = 60;

/** A make's name as it is stored: one line, spaces collapsed. Null when it is not a name of 1 to 60 characters. */
export function makeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= MAKE_NAME_MAX ? name : null;
}

/** A skill's makes, in the order they are shown. */
export async function makesOf(executor: Executor, skillId: string): Promise<Make[]> {
  return executor
    .select({ id: skillMakes.id, name: skillMakes.name })
    .from(skillMakes)
    .where(eq(skillMakes.skillId, skillId))
    .orderBy(skillMakes.position, sql`lower(${skillMakes.name})`);
}

/** Every skill's makes by name, for the taxonomy: skill id to names, in order. Skills with none are left out. */
export async function makeNamesBySkill(): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ skillId: skillMakes.skillId, name: skillMakes.name })
    .from(skillMakes)
    .orderBy(skillMakes.skillId, skillMakes.position, sql`lower(${skillMakes.name})`);
  const bySkill = new Map<string, string[]>();
  for (const row of rows) {
    const names = bySkill.get(row.skillId);
    if (names) names.push(row.name);
    else bySkill.set(row.skillId, [row.name]);
  }
  return bySkill;
}

/** A skill's makes as its editor lists them: each with how many people marked it. */
export async function makesForEditor(executor: Executor, skillId: string): Promise<(Make & { people: number })[]> {
  const rows = rowsOf<{ id: string; name: string; people: number }>(
    await executor.execute(sql`
      SELECT m.id, m.name, (SELECT COUNT(*)::int FROM user_skill_makes um WHERE um.make_id = m.id) AS people
      FROM skill_makes m
      WHERE m.skill_id = ${skillId}
      ORDER BY m.position, lower(m.name)
    `)
  );
  return rows.map((row) => ({ id: String(row.id), name: String(row.name), people: Number(row.people) || 0 }));
}

/** The makes a person marked, by skill: skill id to makes, in the skill's order. */
export async function markedMakes(userId: string, skillId?: string): Promise<Map<string, Make[]>> {
  const rows = await db
    .select({ skillId: userSkillMakes.skillId, id: skillMakes.id, name: skillMakes.name })
    .from(userSkillMakes)
    .innerJoin(skillMakes, eq(skillMakes.id, userSkillMakes.makeId))
    .where(skillId ? and(eq(userSkillMakes.userId, userId), eq(userSkillMakes.skillId, skillId)) : eq(userSkillMakes.userId, userId))
    .orderBy(userSkillMakes.skillId, skillMakes.position, sql`lower(${skillMakes.name})`);
  const bySkill = new Map<string, Make[]>();
  for (const row of rows) {
    const make = { id: row.id, name: row.name };
    const list = bySkill.get(row.skillId);
    if (list) list.push(make);
    else bySkill.set(row.skillId, [make]);
  }
  return bySkill;
}

export type MarkResult = { ok: true; makes: Make[] } | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * Set the makes a person has run for one skill to exactly `wanted` (make ids;
 * an empty list clears them). Only for a skill on the person's list, held or
 * learning, and only that skill's makes.
 */
export async function setMarkedMakes(userId: string, skillId: string, wanted: unknown): Promise<MarkResult> {
  if (!Array.isArray(wanted) || wanted.length > MAKES_MAX * 4 || !wanted.every(isUuid)) {
    return { ok: false, status: 400, error: "makes must be a list of the skill's make ids." };
  }
  const ids = [...new Set(wanted as string[])];
  return db.transaction(async (tx): Promise<MarkResult> => {
    // The row is held so the skill cannot leave the list while its makes are written.
    const [holding] = await tx
      .select({ skillId: userSkills.skillId })
      .from(userSkills)
      .where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, skillId)))
      .limit(1)
      .for('update');
    if (!holding) return { ok: false, status: 409, error: 'Add the skill to your list first.' };
    if (ids.length > 0) {
      const known = await tx
        .select({ id: skillMakes.id })
        .from(skillMakes)
        .where(and(eq(skillMakes.skillId, skillId), inArray(skillMakes.id, ids)));
      if (known.length !== ids.length) return { ok: false, status: 400, error: 'That is not a make of this skill.' };
    }
    await tx
      .delete(userSkillMakes)
      .where(
        ids.length > 0
          ? and(eq(userSkillMakes.userId, userId), eq(userSkillMakes.skillId, skillId), notInArray(userSkillMakes.makeId, ids))
          : and(eq(userSkillMakes.userId, userId), eq(userSkillMakes.skillId, skillId))
      );
    if (ids.length > 0) {
      await tx
        .insert(userSkillMakes)
        .values(ids.map((makeId) => ({ userId, skillId, makeId })))
        .onConflictDoNothing();
    }
    const rows = await tx
      .select({ id: skillMakes.id, name: skillMakes.name })
      .from(userSkillMakes)
      .innerJoin(skillMakes, eq(skillMakes.id, userSkillMakes.makeId))
      .where(and(eq(userSkillMakes.userId, userId), eq(userSkillMakes.skillId, skillId)))
      .orderBy(skillMakes.position, sql`lower(${skillMakes.name})`);
    return { ok: true, makes: rows };
  });
}

/**
 * The makes' part of merging skill `fromId` into `intoId`, in two steps around
 * the move of people's skills (a mark hangs from the person's holding of the
 * skill, so it is set aside by name first and put back once the holding has
 * moved). Call it before user_skills is touched, and its `restore` after.
 *
 * A make the kept skill lacks moves to it, after its own; one it already has
 * under the same name, in any letter case, is dropped and its marks go to the
 * kept skill's make.
 */
export async function mergeMakes(tx: Executor, fromId: string, intoId: string): Promise<{ restore: () => Promise<void> }> {
  const marks = rowsOf<{ user_id: string; name: string }>(
    await tx.execute(sql`
      SELECT um.user_id, lower(m.name) AS name
      FROM user_skill_makes um INNER JOIN skill_makes m ON m.id = um.make_id
      WHERE um.skill_id = ${fromId}
    `)
  );
  await tx.execute(sql`DELETE FROM user_skill_makes WHERE skill_id = ${fromId}`);
  return {
    restore: async () => {
      await tx.execute(sql`
        UPDATE skill_makes x SET skill_id = ${intoId},
            position = x.position + COALESCE((SELECT MAX(y.position) FROM skill_makes y WHERE y.skill_id = ${intoId}), 0)
        WHERE x.skill_id = ${fromId}
          AND NOT EXISTS (SELECT 1 FROM skill_makes y WHERE y.skill_id = ${intoId} AND lower(y.name) = lower(x.name))`);
      // A thousand marks to a statement keeps well inside the driver's limit on parameters.
      for (let i = 0; i < marks.length; i += 1000) {
        const values = sql.join(
          marks.slice(i, i + 1000).map((mark) => sql`(${mark.user_id}::uuid, ${mark.name})`),
          sql`, `
        );
        await tx.execute(sql`
          INSERT INTO user_skill_makes (user_id, skill_id, make_id)
          SELECT v.user_id, ${intoId}, m.id
          FROM (VALUES ${values}) AS v(user_id, name)
          INNER JOIN skill_makes m ON m.skill_id = ${intoId} AND lower(m.name) = v.name
          WHERE EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = v.user_id AND us.skill_id = ${intoId})
          ON CONFLICT DO NOTHING`);
      }
    },
  };
}
