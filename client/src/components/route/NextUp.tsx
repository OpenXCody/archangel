import { ArrowDown } from 'lucide-react';
import { cn, focusRing, labelClass } from '@/lib/utils';
import type { PlacedSkill } from '../path/model';

/**
 * The next turn, in words, above the route: the one next skill and how it is
 * learned (the skill's own sentence, cut at two lines and given the room of
 * two, so the block is the same height whatever it says). It is one control:
 * pressed, the skill's section opens, its row comes into view and its name
 * takes focus.
 */
export function NextUp({ skill, onGo, className }: { skill: PlacedSkill; onGo: (skillId: string) => void; className?: string }) {
  return (
    <div className={cn('mb-3', className)} data-next-up={skill.id}>
      <p className={labelClass}>Next</p>
      <button type="button" onClick={() => onGo(skill.id)} className={cn('mt-1 flex w-full items-start gap-3 rounded-lg text-left', focusRing)}>
        <span className="min-w-0 flex-1">
          <span className="flex min-h-11 items-center text-xl font-semibold leading-snug text-text-1 [overflow-wrap:anywhere]">{skill.name}</span>
          <span className="line-clamp-2 min-h-10 text-[13px] leading-5 text-text-2">{skill.howLearned}</span>
        </span>
        <ArrowDown aria-hidden="true" className="mt-3.5 h-4 w-4 shrink-0 text-text-3" />
      </button>
    </div>
  );
}
