import { cn } from '@/lib/utils';
import { ShareCount, ShareRing } from './HeldShare';
import { shareOf, type PathGroup, type PathSkillItem, type SkillMarks } from './model';
import { SkillTag, SkillTags } from './SkillTag';

interface SkillGroupBoxProps {
  /** The group's name. */
  name: string;
  skills: PathSkillItem[];
  /** A seeker's marks; without them the box shows no marks and no progress. */
  marks?: SkillMarks | null;
  /** The skill whose page this is, drawn as the one tag that is not a link. */
  currentId?: string;
  className?: string;
}

/**
 * A skill group as a box: a thin frame with the group's name set into its top
 * edge (a fieldset and its legend, so the frame opens for the name on any
 * surface), how much of the group the person holds, and the skills as tags.
 * It knows nothing of the page it is on.
 */
export function SkillGroupBox({ name, skills, marks, currentId, className }: SkillGroupBoxProps) {
  const share = marks ? shareOf(skills, marks) : null;
  return (
    <fieldset className={cn('skill-group', className)} data-skill-group data-complete={(share && share.total > 0 && share.held === share.total) || undefined}>
      <legend className="skill-group-name">
        <span className="min-w-0 break-words">{name}</span>
        {share && (
          <>
            <ShareRing share={share} className="h-3.5 w-3.5" />
            {/* One skill says how much is held by its own mark; the figure is for a group of several. */}
            <ShareCount share={share} data-group-count className={skills.length > 1 ? undefined : 'sr-only'} />
          </>
        )}
      </legend>
      <SkillTags>
        {skills.map((skill) => (
          <SkillTag key={skill.id} skill={skill} marks={marks} current={skill.id === currentId} />
        ))}
      </SkillTags>
    </fieldset>
  );
}

/**
 * Group boxes with no levels between them, side by side where there is room:
 * a career whose path is not written, a domain's groups on a person's profile.
 */
export function SkillGroups({ groups, marks, className }: { groups: PathGroup[]; marks?: SkillMarks | null; className?: string }) {
  return (
    <ul className={cn('grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3', className)} data-skill-groups>
      {groups.map((group) => (
        <li key={group.slug} className="min-w-0">
          <SkillGroupBox name={group.name} skills={group.skills} marks={marks} />
        </li>
      ))}
    </ul>
  );
}
