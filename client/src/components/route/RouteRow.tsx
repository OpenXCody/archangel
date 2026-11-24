import { Link } from 'react-router-dom';
import { SkillMark } from '../account/SkillStatusButton';
import type { PlacedSkill, SkillMarks } from '../path/model';
import { SecondLine } from '../path/SkillTag';

/** What a row is told about where its skill stands on the route. */
export interface RowContext {
  /** The skill's group, when the skill is a stop by itself: said under its name. Null inside a section, whose line says it. */
  group: string | null;
  /** 0 when the skill is Next, 1 or 2 when it is Then, null otherwise. */
  next: number | null;
  /** The first line of the route, and the last: where the trunk begins and ends. */
  first: boolean;
  last: boolean;
}

/** A row's standing for a seeker: held, being learned, one of the next three, or later. */
export type RowState = 'held' | 'learning' | 'next' | 'later';

const SAID: Record<RowState, string> = { held: 'Held', learning: 'Learning', next: 'Not held', later: 'Not held' };

/**
 * One skill on a route: the mark on the trunk, the name, which opens the
 * skill's page, and at the right the word NEXT or THEN on the three skills to
 * pick up next. Under the name, where there is something to say: the skill's
 * group when it stands by itself, "Added" and the makes a company runs on a
 * company's version.
 *
 * The mark is read, never pressed: a career's page shows what a person holds
 * and changes nothing. Marking is done on Profile. Held, the name steps back;
 * next, it is in full ink and heavier; later, it is quiet and so is its ring.
 * No fill, no colour. With no marks (a visitor, someone here to hire) it is a
 * dot on the trunk and the name in full ink.
 */
export function RouteRow({ skill, marks, context }: { skill: PlacedSkill; marks: SkillMarks | null; context: RowContext }) {
  const status = marks ? marks.statusOf(skill.id) : undefined;
  const isNext = context.next !== null;
  const state: RowState | undefined = status === undefined ? undefined : status === 'held' ? 'held' : status === 'learning' ? 'learning' : isNext ? 'next' : 'later';
  const word = isNext ? (context.next === 0 ? 'Next' : 'Then') : null;
  return (
    <li
      className="route-stop route-item route-row"
      data-skill-tag={skill.id}
      data-status={status}
      data-route-state={state}
      data-next={word?.toLowerCase()}
      data-added={skill.added || undefined}
      data-first={context.first || undefined}
      data-last={context.last || undefined}
    >
      <span className="route-node" aria-hidden="true">
        {status ? <SkillMark status={status} className={state === 'next' ? 'text-text-1' : undefined} /> : <span className="route-dot" />}
      </span>
      <Link to={`/skills/${skill.id}`} className="route-row-name rounded-lg hover:underline focus-visible:[outline-offset:-2px]">
        <span className="block">{skill.name}</span>
        <SecondLine skill={skill} lead={context.group} />
      </Link>
      {/* What the mark and the word say, for someone who hears the row: "Held", "Not held, next". */}
      {state && (
        <span className="sr-only" data-row-said>
          {SAID[state]}
          {word ? `, ${word.toLowerCase()}` : ''}
        </span>
      )}
      {marks && word && (
        <span className="route-row-word" aria-hidden="true">
          {word}
        </span>
      )}
    </li>
  );
}
