import { cn } from '@/lib/utils';
import { ShareCount } from './HeldShare';
import { shareOf, type PathGroup, type PathSkillItem, type Share, type SkillMarks } from './model';
import { SkillTag, SkillTags } from './SkillTag';

interface SkillGroupBoxProps {
  /** The group's name. */
  name: string;
  skills: PathSkillItem[];
  /** A seeker's marks; without them the box shows no marks and no progress. */
  marks?: SkillMarks | null;
  /** The marks are shown and cannot be pressed: a skill's page reads them and changes none. */
  readOnly?: boolean;
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
  /**
   * Draws a skill in place of the tag (it returns the list item): the
   * employer's editor of a company's version, whose tags are switches.
   */
  renderSkill?: (skill: PathSkillItem) => React.ReactNode;
  className?: string;
}

/**
 * A skill group: one small line with the group's name and how much of it the
 * person holds ("Workplace safety · 1 of 5"), and the skills as tags directly
 * under it. There is no frame around it. It is still a fieldset and its
 * legend, so the name labels the skills for a screen reader. It knows nothing
 * of the page it is on.
 */
export function SkillGroupBox({ name, skills, marks, readOnly, share: given, currentId, parts, renderSkill, className }: SkillGroupBoxProps) {
  const share = marks ? given ?? shareOf(skills, marks) : null;
  return (
    <fieldset className={cn('skill-group', className)} data-group-box data-complete={(share && share.total > 0 && share.held === share.total) || undefined}>
      <legend className="skill-group-name">
        <span className="min-w-0 break-words">{name}</span>
        {/* One skill says how much is held by its own mark; the figure is for a group of several. */}
        {share && share.total > 1 && <span aria-hidden="true"> · </span>}
        {share && <ShareCount share={share} data-group-count className={share.total > 1 ? 'text-text-2' : 'sr-only'} />}
      </legend>
      {(parts ?? [{ label: '', skills }]).map((part) => (
        <div key={part.label} className="skill-group-part">
          {part.label && <p className="skill-group-part-label">{part.label}</p>}
          <SkillTags>
            {part.skills.map((skill) =>
              renderSkill ? renderSkill(skill) : <SkillTag key={skill.id} skill={skill} marks={marks} readOnly={readOnly} current={skill.id === currentId} />
            )}
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
