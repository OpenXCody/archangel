import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
 * A section of a route: a run of skills of one skill group. One button, a
 * full finger tall, that opens and closes its rows: on the trunk the
 * section's ring, then the group's name with a figure after it that says
 * something or is not there ("Measuring · 2 of 4" part done, "· 4"
 * untouched, nothing when it is whole), then the chevron. Closed, the names
 * of its skills stand under the group's in one quiet line (`SkillNames`), so
 * the path reads at a glance, and its rows are hidden and out of the tab
 * order; open, the rows say the rest.
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
            {!open && <SkillNames skills={section.skills} marks={marks} />}
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

/** The lines the names may take before the rest are counted. */
const NAME_LINES = 2;

/**
 * A closed section's skills by name, in the route's order: one quiet line,
 * wrapping to two at most, then "and N more". For a seeker a held skill is
 * in full ink and the rest in secondary ink; no other mark. How many fit is
 * measured where it is drawn, again whenever its width changes.
 */
function SkillNames({ skills, marks }: { skills: readonly PlacedSkill[]; marks: SkillMarks | null }) {
  const line = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(skills.length);
  // A new width, or new skills: start from every name again, and cut back below.
  useLayoutEffect(() => setShown(skills.length), [skills, width]);
  // While the last thing drawn (a name, or "and N more") ends past the second line, one name fewer.
  useLayoutEffect(() => {
    const box = line.current;
    if (!box || shown <= 1) return;
    const items = box.querySelectorAll<HTMLElement>('[data-name]');
    const end = items[items.length - 1];
    if (!end) return;
    const height = parseFloat(getComputedStyle(box).lineHeight) || 18;
    if (end.getBoundingClientRect().bottom - box.getBoundingClientRect().top > height * NAME_LINES + 2) setShown(shown - 1);
  });
  useEffect(() => {
    const box = line.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    watch.observe(box);
    return () => watch.disconnect();
  }, []);
  const more = skills.length - shown;
  return (
    <span ref={line} className="route-head-names" data-section-names>
      {skills.slice(0, shown).map((skill, at) => (
        <span key={skill.id} data-name className={marks?.statusOf(skill.id) === 'held' ? 'text-text-1' : undefined} data-held={marks?.statusOf(skill.id) === 'held' || undefined}>
          {skill.name}
          {at < shown - 1 || more > 0 ? ', ' : ''}
        </span>
      ))}
      {more > 0 && (
        <span data-name className="text-text-3" data-names-more>
          and {more} more
        </span>
      )}
    </span>
  );
}
