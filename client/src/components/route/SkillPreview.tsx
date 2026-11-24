import { Link } from 'react-router-dom';
import { cn, labelClass } from '@/lib/utils';
import { levelName } from '../../lib/stages';
import { Panel, PanelHead, secondaryActionClass } from '../layout/Panel';
import type { PlacedSkill } from '../path/model';

/**
 * What one skill of the path is, beside the groups on a wide screen: its
 * name, its level and group, what it is, how it is learned, and the way to its
 * page. It shows the skill chosen in the groups; for a seeker who holds some
 * of the path, the next one until they choose another ("Next for you"). With
 * nothing chosen it says how to choose one.
 */
export function SkillPreview({ skill, next = false }: { skill: PlacedSkill | null; next?: boolean }) {
  if (!skill) {
    return (
      <Panel data-skill-preview="">
        <PanelHead title="About a skill" as="h2" />
        <p className="px-4 py-3 text-sm leading-relaxed text-text-3">Choose a skill in a group to read what it is and how it is learned.</p>
      </Panel>
    );
  }
  const level = levelName(skill.level);
  return (
    <Panel data-skill-preview={skill.id}>
      <PanelHead title={next ? 'Next for you' : 'About a skill'} as="h2" />
      <div className="px-4 pb-4 pt-3">
        <p className="break-words text-lg font-semibold leading-snug text-text-1">{skill.name}</p>
        <p className="mt-0.5 text-[13px] text-text-3">{[level, skill.group?.name].filter(Boolean).join(' · ')}</p>
        {skill.description && <p className="mt-3 text-sm leading-relaxed text-text-2">{skill.description}</p>}
        {skill.howLearned && (
          <div className="mt-4 border-t border-line pt-3">
            <p className={labelClass}>How it is learned</p>
            <p className="mt-1 text-sm leading-relaxed text-text-2">{skill.howLearned}</p>
          </div>
        )}
        <Link to={`/skills/${skill.id}`} className={cn(secondaryActionClass, 'mt-4 w-full')} data-preview-open>
          Skill page
        </Link>
      </div>
    </Panel>
  );
}
