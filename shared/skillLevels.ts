/**
 * The three levels a skill can have. A skill has one level, the same in every
 * career that uses it: a career's path is its skills laid out by their levels.
 * The names and their glosses are written here and nowhere else.
 */
export type SkillLevel = 1 | 2 | 3;

export interface SkillLevelInfo {
  id: SkillLevel;
  name: string;
  /** A few words under the name, where a path is laid out by level. */
  gloss: string;
}

export const SKILL_LEVELS: readonly SkillLevelInfo[] = [
  { id: 1, name: 'Fundamentals', gloss: 'The foundation' },
  { id: 2, name: 'Intermediate', gloss: 'The working trade' },
  { id: 3, name: 'Advanced', gloss: 'The specialties' },
];

export function isSkillLevel(value: unknown): value is SkillLevel {
  return value === 1 || value === 2 || value === 3;
}

/** "Fundamentals", "Intermediate" or "Advanced"; null for a skill with no level. */
export function skillLevelName(level: number | null | undefined): string | null {
  return SKILL_LEVELS.find((info) => info.id === level)?.name ?? null;
}
