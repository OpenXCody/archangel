import { useMemo, useState } from 'react';
import { nextOf } from '@shared/route';
import { useMediaQuery } from '../../lib/media';
import { shareOf, type PlacedSkill, type Share, type SkillMarks } from '../path/model';

/** From this width a career's page has a column beside its sections: the person's panel and a skill's preview. */
export const RAIL_QUERY = '(min-width: 1024px)';

/**
 * Which skill of a path the column beside it shows, and what a seeker holds
 * of it. The column shows the skill the person chose in the groups; until
 * they choose one, a seeker who holds some of the path is shown their next
 * skill (the first not held, in the route's order), and anyone else nothing.
 * Under the column's width there is no choosing: a skill's row opens its page.
 */
export function useSkillChoice(skills: readonly PlacedSkill[], marks: SkillMarks | null) {
  const wide = useMediaQuery(RAIL_QUERY);
  const ready = marks && !marks.pending ? marks : null;
  const share: Share | null = useMemo(() => (ready && skills.length > 0 ? shareOf(skills, ready) : null), [ready, skills]);
  // Next means something only once the person holds part of the path: before that it would be the first row.
  const next = useMemo(
    () => (ready && share && share.held > 0 ? (nextOf(skills, (id) => ready.statusOf(id) === 'held', 1)[0] ?? null) : null),
    [ready, share, skills]
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const shown = skills.find((skill) => skill.id === (chosen ?? next?.id)) ?? null;
  return {
    wide,
    share,
    next,
    shown,
    /** The skill shown is the seeker's next one. */
    showingNext: Boolean(shown && next && shown.id === next.id),
    choose: (skill: PlacedSkill) => setChosen(skill.id),
  };
}
