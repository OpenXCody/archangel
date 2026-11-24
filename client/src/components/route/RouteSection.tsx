import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RouteSection as Section } from '@shared/route';
import { cn } from '@/lib/utils';
import { ShareRing } from '../path/HeldShare';
import { shareOf, type PlacedSkill, type SkillMarks } from '../path/model';

interface RouteSectionProps {
  section: Section<PlacedSkill>;
  open: boolean;
  onToggle: () => void;
  /** A seeker's marks, once they have arrived. */
  marks: SkillMarks | null;
  /** Whether the route is a seeker's: the section's node is then the ring, even before the marks have arrived. */
  seeker: boolean;
  /** A route with no trunk (its rows are another control): the line has no node. */
  plain?: boolean;
  /** The first line of the route, and the last one drawn: where the trunk begins and ends. */
  first: boolean;
  last: boolean;
  children: React.ReactNode;
}

/**
 * A section of a route: a run of skills of one skill group. One line, a full
 * finger tall, that opens and closes its rows: on the trunk the section's
 * ring, then the group's name with a figure after it that says something or
 * is not there ("· 2 of 4" part done, "· 4" untouched, nothing when it is
 * whole), then the chevron. Closed, its rows are hidden and out of the tab order.
 */
export function RouteSection({ section, open, onToggle, marks, seeker, plain, first, last, children }: RouteSectionProps) {
  const id = useId();
  const share = marks ? shareOf(section.skills, marks) : null;
  const whole = share !== null && share.held === share.total;
  const size = section.skills.length;
  return (
    <li className="route-stop" data-route-section={section.key} data-open={open || undefined} data-complete={whole || undefined}>
      <div className="route-item route-head" data-first={first || undefined} data-last={last || undefined}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="route-head-button focus-visible:[outline-offset:-2px]"
        >
          {!plain && (
            <span className="route-node" aria-hidden="true">
              {seeker ? <ShareRing share={share} /> : <span className="route-dot" />}
            </span>
          )}
          {/* "Arc welding · 4": the group, and how many of the path's skills are in it ("2 of 4" once some are held). */}
          <span className="route-head-name">
            <span className="route-head-group">{section.group.name}</span>
            {!whole && (
              <span className="route-head-count" data-section-count>
                <span aria-hidden="true">· </span>
                {share && share.held > 0 ? (
                  <>
                    <span className="font-medium text-text-1">{share.held}</span> of {size}
                    <span className="sr-only"> held</span>
                  </>
                ) : (
                  <>
                    {size}
                    <span className="sr-only">{size === 1 ? ' skill' : ' skills'}</span>
                  </>
                )}
              </span>
            )}
            {whole && <span className="sr-only">, all {size} held</span>}
          </span>
          <ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-text-3 transition-transform motion-reduce:transition-none', open && 'rotate-180')} />
        </button>
      </div>
      <ul id={id} hidden={!open} aria-label={section.group.name}>
        {children}
      </ul>
    </li>
  );
}
