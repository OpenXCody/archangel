import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SkillHeldToggle } from '../account/SkillStatusButton';
import type { PathSkillItem, SkillMarks } from './model';

/**
 * One skill as a tag: its name, which opens the skill's page, and for a
 * seeker the mark before it, which sets the skill held or clears it in one
 * tap. Both are a full finger's size. A held skill's tag is lit; one being
 * learned is half lit; the rest are quiet. With no `marks` it is the name
 * alone. A second line (`note`) is where a make of equipment goes.
 *
 * It is a list item: put it in a `ul` (`SkillTags`, or `SkillGroupBox`).
 */
export function SkillTag({ skill, marks, current, className }: { skill: PathSkillItem; marks?: SkillMarks | null; current?: boolean; className?: string }) {
  const status = marks ? marks.statusOf(skill.id) : undefined;
  const name = (
    <>
      <span className="block">{skill.name}</span>
      {skill.note && <span className="block text-xs font-normal text-fg-soft">{skill.note}</span>}
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
      className={cn('skill-tag', className)}
    >
      {marks && (
        <SkillHeldToggle
          label={skill.name}
          value={status ?? 'none'}
          disabled={marks.pending}
          onChange={(next) => marks.mark(skill, next)}
          className="rounded-lg"
        />
      )}
      {current ? (
        <span className={nameClass} aria-current="page">
          {name}
        </span>
      ) : (
        <Link to={`/skills/${skill.id}`} className={cn(nameClass, 'rounded-lg underline-offset-4 hover:underline')}>
          {name}
        </Link>
      )}
    </li>
  );
}

/** Tags in a row that wraps. */
export function SkillTags({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn('skill-tags', className)}>{children}</ul>;
}
