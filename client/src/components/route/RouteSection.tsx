import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RouteSection as Section } from '@shared/route';
import { cn } from '@/lib/utils';
import type { PlacedSkill } from '../path/model';

interface RouteSectionProps {
  section: Section<PlacedSkill>;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * A section of a route (the employer's editor of a company's version): a run
 * of skills of one skill group. One button, a full finger tall, that opens
 * and closes its rows: the group's name with how many skills of the path are
 * in it ("Measuring · 4"), then the chevron. Closed, the names of its
 * skills stand under the group's in one quiet line (`SkillNames`), and its
 * rows are hidden and out of the tab order; open, the rows say the rest.
 */
export function RouteSection({ section, open, onToggle, children }: RouteSectionProps) {
  const id = useId();
  const size = section.skills.length;
  return (
    <li className="route-stop" data-route-section={section.key} data-open={open || undefined}>
      <div className="route-item route-head">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="route-head-button focus-visible:[outline-offset:-2px]"
        >
          <span className="route-head-name">
            <span className="route-head-group">{section.group.name}</span>
            <span className="route-head-count" data-section-count>
              <span aria-hidden="true">· </span>
              {size}
              <span className="sr-only">{size === 1 ? ' skill' : ' skills'}</span>
            </span>
            {!open && <SkillNames skills={section.skills} />}
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
 * wrapping to two at most, then "and N more". How many fit is measured where
 * it is drawn, again whenever its width changes.
 */
function SkillNames({ skills }: { skills: readonly PlacedSkill[] }) {
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
        <span key={skill.id} data-name>
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
