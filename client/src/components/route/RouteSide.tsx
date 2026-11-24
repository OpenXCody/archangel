import { cn, focusRing, labelClass } from '@/lib/utils';
import type { PlacedSkill } from '../path/model';

/**
 * Beside the route from 1024 px, held under the header while the route
 * scrolls: the next skill and how it is learned, then the two after it. Each
 * leads to its row. There is no second ring here: the figure stands beside
 * the goal button.
 */
export function RouteSide({ next, onGo }: { next: PlacedSkill[]; onGo: (skillId: string) => void }) {
  const [first, ...then] = next;
  if (!first) return null;
  const go = cn('block max-w-full rounded-lg text-left text-text-1 hover:underline [overflow-wrap:anywhere]', focusRing);
  return (
    <aside className="route-side" aria-label="Next on this path" data-route-aside>
      <p className={labelClass}>Next</p>
      <button type="button" onClick={() => onGo(first.id)} className={cn(go, 'mt-2 text-xl font-semibold leading-snug')} data-side-next={first.id}>
        {first.name}
      </button>
      {first.howLearned && <p className="mt-2 text-[13px] leading-5 text-text-2">{first.howLearned}</p>}
      {then.length > 0 && (
        <>
          <p className={cn(labelClass, 'mt-5')}>Then</p>
          <ul className="mt-1">
            {then.map((skill) => (
              <li key={skill.id}>
                <button type="button" onClick={() => onGo(skill.id)} className={cn(go, 'py-1.5 text-sm')} data-side-then={skill.id}>
                  {skill.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
