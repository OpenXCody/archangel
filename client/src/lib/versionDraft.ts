import type { Skill, SkillPlace } from './api';
import type { Version, VersionChanges, VersionSkill } from './versions';

/**
 * What the editor of a company's version of a career holds while a person
 * taps: every skill it shows, and which are left out, added and run. Pure
 * functions, so each tap is one new value and the save is read straight from it.
 */

export interface DraftSkill {
  id: string;
  name: string;
  level: SkillPlace['level'] | null;
  group: SkillPlace['group'] | null;
  domain: SkillPlace['domain'] | null;
  /** On the career's standard path. One that is not is the company's addition. */
  standard: boolean;
  /** The skill's makes, in order. */
  makes: { id: string; name: string }[];
  /** Its place in path order; a skill just added has none until the save answers. */
  order: number | null;
}

export interface VersionDraft {
  /** Every skill the editor shows: the standard's, and the ones added now or earlier in this visit. */
  skills: DraftSkill[];
  /** Standard skills that are left out. */
  out: string[];
  /** Added skills that are on the path. One taken off again stays in `skills`, quiet, until the page is left. */
  added: string[];
  /** The makes that are run. A skill that is left out keeps its own here, so putting it back brings them back. */
  runs: string[];
}

const byOrder = (a: DraftSkill, b: DraftSkill) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);

function draftSkill(skill: VersionSkill): DraftSkill {
  return {
    id: skill.id,
    name: skill.name,
    level: skill.level,
    group: skill.group,
    domain: skill.domain,
    standard: !skill.added,
    makes: skill.makes.map(({ id, name }) => ({ id, name })),
    order: skill.order,
  };
}

/** The draft a version opens as. */
export function draftFromVersion(version: Version): VersionDraft {
  return {
    skills: [...version.skills, ...version.leftOut].map(draftSkill).sort(byOrder),
    out: version.leftOut.map((skill) => skill.id),
    added: version.skills.filter((skill) => skill.added).map((skill) => skill.id),
    runs: version.skills.flatMap((skill) => skill.makes.filter((make) => make.runs).map((make) => make.id)),
  };
}

/** Whether a skill is on the version's path as the draft stands. */
export function isOn(draft: VersionDraft, skill: DraftSkill): boolean {
  return skill.standard ? !draft.out.includes(skill.id) : draft.added.includes(skill.id);
}

const flip = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((each) => each !== id) : [...list, id]);

/** One tap on a skill: a standard skill is left out or put back, an added one taken off or put on again. */
export function toggleSkill(draft: VersionDraft, skillId: string): VersionDraft {
  const skill = draft.skills.find((each) => each.id === skillId);
  if (!skill) return draft;
  return skill.standard ? { ...draft, out: flip(draft.out, skillId) } : { ...draft, added: flip(draft.added, skillId) };
}

/** One tap on a make: run, or not. */
export function toggleMake(draft: VersionDraft, makeId: string): VersionDraft {
  return { ...draft, runs: flip(draft.runs, makeId) };
}

/**
 * A skill chosen from the search. One the standard has (left out) is put
 * back; one already shown is put on; a new one joins the path as an addition,
 * placed by its own level and group. Its makes arrive with the save's answer.
 */
export function addSkill(draft: VersionDraft, skill: Pick<Skill, 'id' | 'name'> & Partial<SkillPlace>): VersionDraft {
  const shown = draft.skills.find((each) => each.id === skill.id);
  if (shown) return isOn(draft, shown) ? draft : toggleSkill(draft, skill.id);
  const added: DraftSkill = {
    id: skill.id,
    name: skill.name,
    level: skill.level ?? null,
    group: skill.group ?? null,
    domain: skill.domain ?? null,
    standard: false,
    makes: [],
    order: null,
  };
  return { ...draft, skills: [...draft.skills, added], added: [...draft.added, skill.id] };
}

/**
 * The server's answer to a save, laid under the draft: what each skill is
 * (its makes, its place, whether the standard now has it) comes from the
 * answer; what the person chose stays as they left it, taps made while the
 * save was on its way included. An addition taken off again in this visit
 * stays shown.
 */
export function mergeSaved(draft: VersionDraft, saved: Version): VersionDraft {
  const fresh = new Map([...saved.skills, ...saved.leftOut].map((skill) => [skill.id, draftSkill(skill)]));
  // A standard skill the answer no longer names has left the standard, and goes; an addition taken off
  // in this visit (or added a moment ago, and not yet saved) is the draft's own, and stays.
  const kept = draft.skills.filter((skill) => !fresh.has(skill.id) && !skill.standard);
  const skills = [...fresh.values(), ...kept].sort(byOrder);
  const standard = new Set(skills.filter((skill) => skill.standard).map((skill) => skill.id));
  return {
    skills,
    // A skill that changed sides (the standard took it up, or dropped it) carries no choice across.
    out: draft.out.filter((id) => standard.has(id)),
    added: draft.added.filter((id) => !standard.has(id) && skills.some((skill) => skill.id === id)),
    runs: draft.runs,
  };
}

/** What a save sends: each list whole. Makes are sent only for skills on the path. */
export function changesOf(draft: VersionDraft): Required<VersionChanges> {
  const on = draft.skills.filter((skill) => isOn(draft, skill));
  const makes = new Set(on.flatMap((skill) => skill.makes.map((make) => make.id)));
  return {
    added: draft.added.filter((id) => draft.skills.some((skill) => skill.id === id && !skill.standard)),
    leftOut: draft.out.filter((id) => draft.skills.some((skill) => skill.id === id && skill.standard)),
    makes: draft.runs.filter((id) => makes.has(id)),
  };
}

/** Two saves that would send the same thing. */
export function sameChanges(a: VersionChanges, b: VersionChanges): boolean {
  const key = (changes: VersionChanges) => JSON.stringify([[...(changes.added ?? [])].sort(), [...(changes.leftOut ?? [])].sort(), [...(changes.makes ?? [])].sort()]);
  return key(a) === key(b);
}
