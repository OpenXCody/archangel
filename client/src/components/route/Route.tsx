import { useMemo, useState } from 'react';
import { buildRoute } from '@shared/route';
import { cn, focusRing, labelClass } from '@/lib/utils';
import type { PlacedSkill } from '../path/model';
import { RouteSection } from './RouteSection';

/** A skill on a route: its place in the taxonomy. */
export type RouteSkill = PlacedSkill;

/** What a row is told about where its skill stands on the route. */
export interface RowContext {
  /** The skill's group, when the skill is a stop by itself: said under its name. Null inside a section, whose line says it. */
  group: string | null;
}

interface RouteProps {
  /** The path's skills, in the order to learn them: the order is the server's (`routeOf`) and is never changed here. */
  skills: readonly RouteSkill[];
  /** Draws a skill's row (it returns the list item): the employer's editor of a company's version, whose rows are switches. */
  renderRow: (skill: RouteSkill, context: RowContext) => React.ReactNode;
  className?: string;
}

/**
 * A career's path cut into its stops, down the page in the order to learn in:
 * what the employer's editor of a company's version of a career works on
 * (`components/versions/VersionEditor.tsx`), whose rows are switches, so it
 * has no trunk and no marks (`data-route-plain`). A stop is a section (a run
 * of two or more neighbouring skills of one skill group: one line that opens
 * and closes, open to begin with) or a single skill with its group under its
 * name; "Open all" opens and closes the sections together. No domain and no
 * level is named here.
 *
 * A career's own page and a company's version of it draw the path as the
 * connector tree instead (`SkillGroups`).
 */
export function Route({ skills, renderRow, className }: RouteProps) {
  const route = useMemo(() => buildRoute(skills), [skills]);
  const sections = useMemo(() => route.filter((stop) => stop.kind === 'section'), [route]);
  // Which sections the person closed, or opened again: every section starts open.
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const isOpen = (key: string): boolean => chosen[key] ?? true;
  const choose = (change: Record<string, boolean>) => setChosen((current) => ({ ...current, ...change }));
  const allOpen = sections.length > 0 && sections.every((section) => isOpen(section.key));

  if (skills.length === 0) return null;

  return (
    <div className={cn('route', className)} data-route data-route-plain>
      <div className="route-main">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
          {/* The page above says how many skills are on; the route does not count them again. */}
          <p className={labelClass} data-route-count>
            Path
          </p>
          {sections.length > 0 && (
            <button
              type="button"
              onClick={() => choose(Object.fromEntries(sections.map((section) => [section.key, !allOpen])))}
              className={cn('-mr-2 inline-flex min-h-11 items-center px-2 text-sm text-text-1 underline', focusRing)}
              data-route-open-all
            >
              {allOpen ? 'Close all' : 'Open all'}
            </button>
          )}
        </div>
        <ol className="route-stops">
          {route.map((stop) => {
            if (stop.kind === 'single') return renderRow(stop.skill, { group: stop.skill.group?.name ?? null });
            const open = isOpen(stop.key);
            return (
              <RouteSection key={stop.key} section={stop} open={open} onToggle={() => choose({ [stop.key]: !open })}>
                {stop.skills.map((skill) => renderRow(skill, { group: null }))}
              </RouteSection>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
