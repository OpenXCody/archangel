import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SkillHeldToggle } from '../account/SkillStatusButton';
import type { PathSkillItem, SkillMarks } from './model';

/**
 * One skill as a tag: its name, which opens the skill's page, and for a
 * seeker the mark before it, which sets the skill held or clears it in one
 * tap. Both are a full finger's size. A held skill's tag is lit; one being
 * learned is half lit; the rest are quiet. With no `marks` it is the name
 * alone. A second line is where a make of equipment goes: `note` as given, or
 * on a company's version of a career the makes the company runs (`makes`),
 * the ones the person has run themselves brighter, after the word "Added"
 * for a skill the company adds to the standard.
 *
 * It is a list item: put it in a `ul` (`SkillTags`, or `SkillGroupBox`).
 */
export function SkillTag({ skill, marks, current, className }: { skill: PathSkillItem; marks?: SkillMarks | null; current?: boolean; className?: string }) {
  const status = marks ? marks.statusOf(skill.id) : undefined;
  const name = (
    <>
      <span className="block">{skill.name}</span>
      <SecondLine skill={skill} />
    </>
  );
  const nameClass = cn(
    'flex min-h-11 min-w-0 flex-1 flex-col justify-center py-1.5 pr-3 text-sm leading-snug [overflow-wrap:anywhere]',
    marks ? 'pl-0' : 'pl-3'
  );
  return (
    <li
      data-skill-tag={skill.id}
      data-status={status}
      data-current={current || undefined}
      data-added={skill.added || undefined}
      className={cn('skill-tag', className)}
    >
      {marks && (
        <SkillHeldToggle
          label={skill.name}
          value={status ?? 'none'}
          disabled={marks.pending}
          onChange={(next) => marks.mark(skill, next)}
          className="rounded-lg focus-visible:[outline-offset:-2px]"
        />
      )}
      {current ? (
        <span className={nameClass} aria-current="page">
          {name}
        </span>
      ) : (
        <Link to={`/skills/${skill.id}`} className={cn(nameClass, 'rounded-lg underline-offset-4 hover:underline focus-visible:[outline-offset:-2px]')}>
          {name}
        </Link>
      )}
    </li>
  );
}

/** A tag's second line: what narrows the skill here. Nothing when there is nothing to say. */
function SecondLine({ skill }: { skill: PathSkillItem }) {
  const makes = skill.makes ?? [];
  if (!skill.added && makes.length === 0) {
    return skill.note ? <span className="block text-xs font-normal text-fg-soft">{skill.note}</span> : null;
  }
  return (
    <span className="block text-xs font-normal text-fg-soft" data-tag-line>
      {skill.added && <span data-tag-added>Added</span>}
      {skill.added && makes.length > 0 && ' · '}
      {makes.map((make, index) => (
        <span key={make.name}>
          {index > 0 && ', '}
          <span data-tag-make={make.lit ? 'lit' : ''} className={make.lit ? 'font-medium text-fg-default' : undefined}>
            {make.name}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Tags in a row that wraps. */
export function SkillTags({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn('skill-tags', className)}>{children}</ul>;
}
