import { levelName } from '../../lib/stages';
import { TreeCard, TreeCardColumns, TreeCardLink, TreeCardPart } from '../layout/Tree';
import type { MarkStatus, PlacedSkill } from '../path/model';

/** How a seeker stands with the skill, in words. */
const STATUS_SAID: Record<MarkStatus, string> = {
  held: 'You hold it',
  learning: 'You are learning it',
  none: 'Not held yet',
};

interface SkillPreviewProps {
  id: string;
  skill: PlacedSkill;
  /** A seeker's mark on it: the card then says how they stand with it. Null for anyone else. */
  status?: MarkStatus | null;
}

/**
 * What one skill of a path is, as its card in the career's tree of skills
 * (`SkillGroups`), hung from the skill's own node: its level and, for a
 * seeker, whether they hold it; what it is and how it is learned, side by
 * side where the card is wide enough; and the way to its page. The node above
 * it says its name and its group, so it says neither again; the makes a
 * company runs are the node's own second line.
 */
export function SkillPreview({ id, skill, status = null }: SkillPreviewProps) {
  const level = levelName(skill.level);
  const said = [level, status ? STATUS_SAID[status] : null].filter(Boolean).join(' · ');
  return (
    <TreeCard id={id} aria-label={skill.name} data-skill-preview={skill.id}>
      {said && (
        <p className="mb-3 text-[13px] leading-[18px] text-text-3" data-preview-status={status ?? undefined}>
          {said}
        </p>
      )}
      {(skill.description || skill.howLearned) && (
        <TreeCardColumns>
          {skill.description && (
            <TreeCardPart label="What it is" data-preview-description="">
              <p>{skill.description}</p>
            </TreeCardPart>
          )}
          {skill.howLearned && (
            <TreeCardPart label="How it is learned" data-preview-learned="">
              <p>{skill.howLearned}</p>
            </TreeCardPart>
          )}
        </TreeCardColumns>
      )}
      <TreeCardLink to={`/skills/${skill.id}`} name={skill.name} data-preview-open="">
        Skill page
      </TreeCardLink>
    </TreeCard>
  );
}
