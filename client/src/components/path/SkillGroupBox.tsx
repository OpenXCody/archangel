import { cn } from '@/lib/utils';
import { ShareCount, ShareRing } from './HeldShare';
import { shareOf, type PathGroup, type PathSkillItem, type Share, type SkillMarks } from './model';
import { SkillTag, SkillTags } from './SkillTag';

interface SkillGroupBoxProps {
  /** The group's name. */
  name: string;
  skills: PathSkillItem[];
  /** A seeker's marks; without them the box shows no marks and no progress. */
  marks?: SkillMarks | null;
  /**
   * How much of the group is held, where the box does not hold the whole
   * group (a person's own skills from it). Left out, it is counted from `skills`.
   */
  share?: Share;
  /** The skill whose page this is, drawn as the one tag that is not a link. */
  currentId?: string;
  /**
   * The same skills under captions (a group's skills by level, on a skill's
   * page). Left out, the tags are one run, which is what a path wants: there
   * the level is said by where the box stands.
   */
  parts?: { label: string; skills: PathSkillItem[] }[];
  className?: string;
}

/**
 * A skill group as a box: a thin frame with the group's name set into its top
 * edge (a fieldset and its legend, so the frame opens for the name on any
 * surface), how much of the group the person holds, and the skills as tags.
 * It knows nothing of the page it is on.
 */
export function SkillGroupBox({ name, skills, marks, share: given, currentId, parts, className }: SkillGroupBoxProps) {
  const share = marks ? given ?? shareOf(skills, marks) : null;
  return (
    <fieldset className={cn('skill-group', className)} data-group-box data-complete={(share && share.total > 0 && share.held === share.total) || undefined}>
      <legend className="skill-group-name">
        <span className="min-w-0 break-words">{name}</span>
        {share && (
          <>
            <ShareRing share={share} className="h-3.5 w-3.5" />
            {/* One skill says how much is held by its own mark; the figure is for a group of several. */}
            <ShareCount share={share} data-group-count className={share.total > 1 ? undefined : 'sr-only'} />
          </>
        )}
      </legend>
      {(parts ?? [{ label: '', skills }]).map((part) => (
        <div key={part.label} className="skill-group-part">
          {part.label && <p className="skill-group-part-label">{part.label}</p>}
          <SkillTags>
            {part.skills.map((skill) => (
              <SkillTag key={skill.id} skill={skill} marks={marks} current={skill.id === currentId} />
            ))}
          </SkillTags>
        </div>
      ))}
    </fieldset>
  );
}

/**
 * Group boxes with no levels between them, side by side where there is room:
 * a career whose path is not written, a domain's groups on a person's profile.
 */
export function SkillGroups({
  groups,
  marks,
  shareOfGroup,
  className,
}: {
  groups: PathGroup[];
  marks?: SkillMarks | null;
  /** A group's share where the boxes do not hold whole groups. */
  shareOfGroup?: (group: PathGroup) => Share | undefined;
  className?: string;
}) {
  return (
    <ul className={cn('grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3', className)} data-skill-groups>
      {groups.map((group) => (
        <li key={group.slug} className="min-w-0">
          <SkillGroupBox name={group.name} skills={group.skills} marks={marks} share={shareOfGroup?.(group)} />
        </li>
      ))}
    </ul>
  );
}
