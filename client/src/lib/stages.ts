import { SKILL_LEVELS, skillLevelName, type SkillLevel } from '@shared/skillLevels';

/**
 * The three levels of a skill, in the order they are learned, with the words
 * used for them everywhere: 1 Fundamentals, 2 Intermediate, 3 Advanced. A
 * skill has one level, the same in every career, and a career's path is its
 * skills laid out by their levels. The names and glosses are written once, in
 * shared/skillLevels.ts; this file is how the client reads them.
 */
export type { SkillLevel };

/** The levels in order, each `{ id, name, gloss }`: the gloss is the few words under a level's name on a path. */
export const LEVELS = SKILL_LEVELS;

/** A level's name by its number: `LEVEL_NAME[2]` is "Intermediate". */
export const LEVEL_NAME: Record<SkillLevel, string> = { 1: SKILL_LEVELS[0].name, 2: SKILL_LEVELS[1].name, 3: SKILL_LEVELS[2].name };

/** A level's gloss by its number: `LEVEL_GLOSS[1]` is "The foundation". */
export const LEVEL_GLOSS: Record<SkillLevel, string> = { 1: SKILL_LEVELS[0].gloss, 2: SKILL_LEVELS[1].gloss, 3: SKILL_LEVELS[2].gloss };

/** A level's name, or null for a skill that has none (see `SkillPlace` in lib/api.ts). */
export const levelName = skillLevelName;
