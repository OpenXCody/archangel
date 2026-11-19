import { useMemo } from 'react';
import { useAccount } from '../../lib/account';
import { useMarkSkill, useMySkills } from '../../lib/seeker';
import { useSeekerTools } from '../../lib/viewer';
import type { MarkStatus, SkillMarks } from './model';

/**
 * The signed-in seeker's marks, for the parts in this folder: which skills
 * they hold or are learning, and the one-tap change (optimistic, so every
 * figure worked out from the marks follows at once).
 *
 * `marks` is null for a visitor and for someone here to hire: the parts then
 * draw no marks and no progress. `canSignIn` says a visitor could have them.
 * `ranMakes` is the makes the person has marked as run, by make id (empty for
 * anyone without marks): a company's version of a career lights the ones it
 * shares with them.
 */
export function useSkillMarks(): { marks: SkillMarks | null; canSignIn: boolean; error: Error | null; ranMakes: ReadonlySet<string> } {
  const { data: account } = useAccount();
  const seekerTools = useSeekerTools();
  const signedIn = Boolean(account?.user) && seekerTools;
  const { data: mySkills, isPending } = useMySkills(signedIn);
  const markSkill = useMarkSkill();
  const { mutate } = markSkill;

  const marks = useMemo<SkillMarks | null>(() => {
    if (!signedIn) return null;
    const byId = new Map((mySkills ?? []).map((skill) => [skill.skillId, skill.status]));
    return {
      statusOf: (skillId): MarkStatus => byId.get(skillId) ?? 'none',
      mark: (skill, next) => mutate({ skillId: skill.id, name: skill.name, mark: next }),
      pending: isPending,
    };
  }, [signedIn, mySkills, isPending, mutate]);

  const ranMakes = useMemo<ReadonlySet<string>>(
    () => new Set(signedIn ? (mySkills ?? []).flatMap((skill) => (skill.makes ?? []).map((make) => make.id)) : []),
    [signedIn, mySkills]
  );

  return { marks, canSignIn: Boolean(account) && !account?.user && seekerTools, error: markSkill.error, ranMakes };
}
