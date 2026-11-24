import { shareOf as shareOfSkills, type Share } from '@shared/route';
import type { SkillLevel } from '../../lib/stages';
import type { TaxonomyRef } from '../../lib/api';
import type { SkillStatus } from '../../lib/seeker';

/*
 * Skills as the parts in this folder and in `components/route/` take them.
 *
 * Everything drawn from these shapes fetches nothing, so the same parts draw
 * the standard path of a career, a company's version of it, one group on a
 * skill's page or a person's own skills. A path's own shape, the route, is
 * `buildRoute` in shared/route.ts. A skill is not
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

/** Some of a skill group's skills: a person's own from it, on Profile. */
export interface PathGroup {
  slug: string;
  name: string;
  /** The department the group belongs to. */
  domain: TaxonomyRef | null;
  skills: PathSkillItem[];
}

/** A career on the ladder beside this one. */
export interface LadderCareer {
  id: string;
  title: string;
}

/** What a path is built from: a skill with its place, as the API gives one wherever it gives a skill. */
export interface PlacedSkill extends PathSkillItem {
  level: SkillLevel | null;
  group: TaxonomyRef | null;
  domain: TaxonomyRef | null;
  /** How the skill is learned, in the catalogue's sentence: sent with a career's path. */
  howLearned?: string | null;
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

export type { Share };

/** How much of a set of skills a person holds (`shareOf` in shared/route.ts, read through their marks). */
export function shareOf(skills: readonly { id: string }[], marks: SkillMarks): Share {
  return shareOfSkills(skills, marks.statusOf);
}
