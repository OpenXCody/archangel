import { Link } from 'react-router-dom';
import { cn, labelClass } from '@/lib/utils';
import { levelName } from '../../lib/stages';
import { SkillMark } from '../account/SkillStatusButton';
import { secondaryActionClass } from '../layout/Panel';
import type { MarkStatus, PlacedSkill } from '../path/model';

/** How a seeker stands with the skill, in words beside the mark. */
const STATUS_SAID: Record<MarkStatus, string> = {
  held: 'You hold it',
  learning: 'You are learning it',
  none: 'Not held yet',
};

interface SkillPreviewProps {
  skill: PlacedSkill;
  /** A seeker's mark on it: the preview then says how they stand with it. Null for anyone else. */
  status?: MarkStatus | null;
  /**
   * Opened under its own row (a narrow screen): the row already says the
   * name and the mark, so the preview starts at its level and group.
   */
  inline?: boolean;
  id?: string;
}

/**
 * What one skill of a path is, said inside the group it belongs to: its name,
 * level and group, how a seeker stands with it, what it is, how it is
 * learned, the makes a company runs it on, and the way to its page. Beside
 * the group's rows from 1024 px, parted from them by a hairline; under its own
 * row on a narrower screen. It is drawn only for a skill that is chosen:
 * there is no empty preview.
 */
export function SkillPreview({ skill, status = null, inline = false, id }: SkillPreviewProps) {
  const level = levelName(skill.level);
  const where = [level, skill.group?.name].filter(Boolean).join(' · ');
  const makes = skill.makes ?? [];
  const body = (
    <>
      {!inline && (
        <>
          <p className={labelClass}>Skill</p>
          <h3 className="mt-1 break-words text-lg font-semibold leading-snug text-text-1">{skill.name}</h3>
        </>
      )}
      {where && <p className={cn('text-[13px] text-text-3', !inline && 'mt-0.5')}>{where}</p>}
      {/* Under its row the row's own mark says it; beside the rows the preview says it in words. */}
      {status && !inline && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-text-2" data-preview-status={status}>
          <SkillMark status={status} className="h-4 w-4" />
          {STATUS_SAID[status]}
        </p>
      )}
      {skill.description && (
        <p className="mt-3 text-sm leading-relaxed text-text-2" data-preview-description>
          {skill.description}
        </p>
      )}
      {skill.howLearned && (
        <div className="mt-4 border-t border-line pt-3">
          <p className={labelClass}>How it is learned</p>
          <p className="mt-1 text-sm leading-relaxed text-text-1">{skill.howLearned}</p>
        </div>
      )}
      {makes.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className={labelClass}>Makes</p>
          <p className="mt-1 text-sm leading-relaxed text-text-2">
            {makes.map((make, index) => (
              <span key={make.name}>
                {index > 0 && ', '}
                <span className={make.lit ? 'font-medium text-text-1' : undefined}>{make.name}</span>
              </span>
            ))}
          </p>
        </div>
      )}
      <Link to={`/skills/${skill.id}`} className={cn(secondaryActionClass, 'mt-4', inline ? 'w-full sm:w-auto' : 'w-full')} data-preview-open>
        <span className="sr-only">{skill.name}: </span>
        Skill page
      </Link>
    </>
  );
  return (
    <div id={id} aria-live={inline ? undefined : 'polite'} className={cn('min-w-0', inline ? 'px-4 pb-4 pl-11' : 'px-5 pb-5 pt-4')} data-skill-preview={skill.id} data-preview-inline={inline || undefined}>
      {body}
    </div>
  );
}
