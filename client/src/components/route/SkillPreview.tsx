import { Link } from 'react-router-dom';
import { cn, labelClass } from '@/lib/utils';
import { levelName } from '../../lib/stages';
import { secondaryActionClass } from '../layout/Panel';
import { TreeDetail } from '../layout/Tree';
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
  /** A seeker's mark on it: the preview then says how they stand with it. Null for anyone else. */
  status?: MarkStatus | null;
}

/**
 * What one skill of a path is, opened under its own node in the career's
 * tree of skills (`SkillGroups`): its level and, for a seeker, whether they
 * hold it, what it is, how it is learned, and the way to its page. The node
 * above it says its name and its group, so it says neither again; the makes a
 * company runs are the node's own second line.
 */
export function SkillPreview({ id, skill, status = null }: SkillPreviewProps) {
  const level = levelName(skill.level);
  const said = [level, status ? STATUS_SAID[status] : null].filter(Boolean).join(' · ');
  return (
    <TreeDetail id={id} aria-label={skill.name} data-skill-preview={skill.id}>
      {said && (
        <p className="text-[13px] leading-[18px] text-text-3" data-preview-status={status ?? undefined}>
          {said}
        </p>
      )}
      {skill.description && (
        <p className={cn('max-w-prose text-sm leading-relaxed text-text-2', said && 'mt-2')} data-preview-description>
          {skill.description}
        </p>
      )}
      {skill.howLearned && (
        <div className="mt-4">
          <p className={labelClass}>How it is learned</p>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-text-2">{skill.howLearned}</p>
        </div>
      )}
      <Link to={`/skills/${skill.id}`} className={cn(secondaryActionClass, 'mt-4 sm:h-9 sm:px-3')} data-preview-open>
        <span className="sr-only">{skill.name}: </span>
        Skill page
      </Link>
    </TreeDetail>
  );
}
