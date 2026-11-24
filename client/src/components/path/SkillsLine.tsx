import { cn } from '@/lib/utils';
import type { SkillLevel } from '../../lib/api';

/** A skill named in a line: what a person does not hold yet, or what one path lacks of another. */
export interface LineSkill {
  id: string;
  name: string;
  /** The skill's level, as the API sends it. A line never says it. */
  level?: SkillLevel | null;
}

/**
 * Skills named in one line of text, in the order they stand on their career's
 * route: "Next: Blueprint Reading, Lot Tracking, Shop Math". No level is
 * named. `lead` is the word the line opens with ("Next" for the skills to
 * pick up, "Missing" for what one path lacks of another); `more` is how many
 * are not named. Nothing when there are none.
 */
export function SkillsLine({ lead, skills, more = 0, className }: { lead: string; skills: LineSkill[]; more?: number; className?: string }) {
  if (skills.length === 0) return null;
  return (
    <p className={cn('break-words text-sm text-text-1', className)} data-next-skills>
      <span className="text-text-2">{lead}:</span> {skills.map((skill) => skill.name).join(', ')}
      {more > 0 && <span className="text-text-2"> and {more.toLocaleString()} more</span>}
    </p>
  );
}
