import { LEVELS, type SkillLevel } from '../../lib/stages';
import type { TaxonomyRef } from '../../lib/api';
import type { SkillStatus } from '../../lib/seeker';

/*
 * A skill path as data: levels, then skill groups, then skills.
 *
 * Everything in this folder draws from these shapes and fetches nothing, so
 * the same parts draw the standard path of a career, a company's version of
 * it, one group on a skill's page or a person's own skills. A skill is not
 * assumed to be the last level of the tree: it can carry a second line (the
 * make of equipment a company runs it on).
 */

/** One skill as a tag shows it. */
export interface PathSkillItem {
  id: string;
  name: string;
  /** A short second line under the name: a make ("Haas"), where a path is specific to one. */
  note?: string | null;
  /**
   * The second line as makes, where a path is a company's version: the makes
   * the company runs, in order. One the person has run themselves is `lit`
   * (brighter, never another colour). Drawn in place of `note`.
   */
  makes?: { name: string; lit?: boolean }[];
  /** A skill a company's version adds to the standard path: the tag says so. */
  added?: boolean;
}

/** A skill group's skills at one level of a path. */
export interface PathGroup {
  slug: string;
  name: string;
  /** The department the group belongs to. */
  domain: TaxonomyRef | null;
  skills: PathSkillItem[];
}

/** One level of a path: its groups in the order they are shown (by domain, then group). */
export interface PathLevel {
  level: SkillLevel;
  name: string;
  /** A few words on what the level is ("The foundation"). */
  gloss?: string;
  groups: PathGroup[];
}

/** A career on the ladder beside this one. */
export interface LadderCareer {
  id: string;
  title: string;
}

export interface SkillPath {
  /** Always the three levels, in order; a level may hold no group. */
  levels: PathLevel[];
  /** Skills with no level or group: only from a database no taxonomy was loaded into. */
  unplaced: PathSkillItem[];
}

/** What a path is built from: a skill with its place, as the API gives one wherever it gives a skill. */
export interface PlacedSkill extends PathSkillItem {
  level: SkillLevel | null;
  group: TaxonomyRef | null;
  domain: TaxonomyRef | null;
}

/**
 * Lay skills out as a path. The order they arrive in is kept (the API sends a
 * career's skills by level, then domain, group and the skill's place in its
 * group), so groups and domains appear in the taxonomy's order.
 */
export function buildPath(skills: readonly PlacedSkill[]): SkillPath {
  const levels: PathLevel[] = LEVELS.map(({ id, name, gloss }) => ({ level: id, name, gloss, groups: [] }));
  const unplaced: PathSkillItem[] = [];
  for (const skill of skills) {
    const level = levels.find((each) => each.level === skill.level);
    if (!level || !skill.group) {
      unplaced.push(skill);
      continue;
    }
    let group = level.groups.find((each) => each.slug === skill.group?.slug);
    if (!group) {
      group = { slug: skill.group.slug, name: skill.group.name, domain: skill.domain, skills: [] };
      level.groups.push(group);
    }
    group.skills.push({ id: skill.id, name: skill.name, note: skill.note, makes: skill.makes, added: skill.added });
  }
  return { levels, unplaced };
}

export type MarkStatus = SkillStatus | 'none';

/**
 * A person's marks, as the parts here read them. A page gets one from
 * `useSkillMarks()` for a signed-in seeker and passes it down; with none, the
 * same parts draw no marks and no progress.
 */
export interface SkillMarks {
  statusOf: (skillId: string) => MarkStatus;
  /** Set a skill held, or clear it. */
  mark: (skill: { id: string; name: string }, next: MarkStatus) => void;
  /** True while the person's list is still being read: marks hold their place and ignore presses. */
  pending: boolean;
}

/** How much of a set of skills is held. Learning is counted apart and never as held. */
export interface Share {
  held: number;
  learning: number;
  total: number;
}

export function shareOf(skills: readonly { id: string }[], marks: SkillMarks): Share {
  let held = 0;
  let learning = 0;
  for (const skill of skills) {
    const status = marks.statusOf(skill.id);
    if (status === 'held') held += 1;
    else if (status === 'learning') learning += 1;
  }
  return { held, learning, total: skills.length };
}

export const levelSkills = (level: PathLevel): PathSkillItem[] => level.groups.flatMap((group) => group.skills);
export const pathSkills = (path: SkillPath): PathSkillItem[] => [...path.levels.flatMap(levelSkills), ...path.unplaced];
