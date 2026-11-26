import { levelName } from '../../lib/stages';
import { TreeCard, TreeCardColumns, TreeCardLink, TreeCardPart } from '../layout/Tree';
import type { PlacedSkill } from '../path/model';

/**
 * What one skill of a path is, as its card in the career's tree of skills
 * (`SkillGroups`), hung from the skill's own node: its level, in one word;
 * what it is and how it is learned, side by side where the card is wide
 * enough; and the way to its page. The node above it says its name, its
 * group and, for a seeker, whether they hold it (the mark), so the card says
 * none of them again; the makes a company runs are the node's own second line.
 */
export function SkillPreview({ id, skill }: { id: string; skill: PlacedSkill }) {
  const level = levelName(skill.level);
  return (
    <TreeCard id={id} aria-label={skill.name} data-skill-preview={skill.id}>
      {level && (
        <p className="mb-3 text-[13px] leading-[18px] text-text-3" data-preview-level>
          {level}
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
