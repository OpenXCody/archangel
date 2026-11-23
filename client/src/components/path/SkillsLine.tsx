import { cn } from '@/lib/utils';
import type { SkillLevel } from '../../lib/api';
import { levelName } from '../../lib/stages';

/** A skill named in a line: what a person does not hold yet, or what one path lacks of another. */
export interface LineSkill {
  id: string;
  name: string;
  /** The skill's level: 1 Fundamentals, 2 Intermediate, 3 Advanced. */
  level: SkillLevel | null;
}

/**
 * Skills named in one line of text under the level they are at: "Next,
 * Fundamentals: Blueprint Reading, Lot Tracking". They come lowest level
 * first, so a second level is named only where the first runs out. `lead` is
 * the word the line opens with ("Next" for the skills to pick up, "Missing"
 * for what one path lacks of another); `more` is how many are not named.
 * Nothing when there are none.
 */
export function SkillsLine({ lead, skills, more = 0, className }: { lead: string; skills: LineSkill[]; more?: number; className?: string }) {
  if (skills.length === 0) return null;
  const runs: { level: string | null; skills: LineSkill[] }[] = [];
  for (const skill of skills) {
    const level = levelName(skill.level);
    const last = runs[runs.length - 1];
    if (last && last.level === level) last.skills.push(skill);
    else runs.push({ level, skills: [skill] });
  }
  return (
    <p className={cn('break-words text-sm text-text-1', className)} data-next-skills>
      {runs.map((run, index) => (
        <span key={run.level ?? index}>
          {index > 0 && ' · '}
          <span className="text-text-2">{index === 0 ? (run.level ? `${lead}, ${run.level}:` : lead) : `${run.level}:`}</span>{' '}
          {run.skills.map((skill) => skill.name).join(', ')}
        </span>
      ))}
      {more > 0 && <span className="text-text-2"> and {more.toLocaleString()} more</span>}
    </p>
  );
}
