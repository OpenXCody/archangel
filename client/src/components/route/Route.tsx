import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildRoute, groupRoute, nextOf, type RouteStop } from '@shared/route';
import { cn, focusRing, labelClass, plural } from '@/lib/utils';
import { readStored, writeStored } from '../../lib/storage';
import type { LadderCareer, PlacedSkill, SkillMarks } from '../path/model';
import { NextUp } from './NextUp';
import { Ladder } from './RouteLadder';
import { RouteRow, type RowContext } from './RouteRow';
import { RouteSection } from './RouteSection';
import { RouteSide } from './RouteSide';

/** A skill on a route: its place in the taxonomy, and how it is learned where the path says. */
export type RouteSkill = PlacedSkill;

interface RouteProps {
  /** The path's skills, in the order to learn them: the order is the server's (`routeOf`) and is never changed here. */
  skills: readonly RouteSkill[];
  /**
   * A seeker's marks, which are read here and never changed: without them the
   * route shows no mark, ring, Next or figure but a section's size.
   */
  marks?: SkillMarks | null;
  /** The careers a person usually comes from: named before the first stop. */
  comesFrom?: LadderCareer[];
  /** The careers this one leads to: named after the last. */
  leadsTo?: LadderCareer[];
  /**
   * Draws a skill in place of its row (it returns the list item): the
   * employer's editor of a company's version, whose rows are switches. A
   * route drawn this way has no trunk and no marks.
   */
  renderRow?: (skill: RouteSkill, context: RowContext) => React.ReactNode;
  /** What a person's own opening and closing of sections is kept under for the visit: the career, or the career at a company. */
  keepAs?: string;
  /**
   * The path by skill group (a career's page): each group one section, where
   * the route first reaches it, closed until it is opened. Without it the
   * route is its stops in order, as the employer's editor draws it.
   */
  grouped?: boolean;
  /** The section's heading, drawn on the route's first line beside "Open all" in place of the count. */
  heading?: React.ReactNode;
  className?: string;
}

/** A route of stops this short is open whole, for everyone. */
const OPEN_WHOLE = 3;

/**
 * A career's path as a route: stops down one line, at every width. Top to
 * bottom is the order to learn in. A stop is a section (a run of skills of
 * one skill group: one line that opens and closes) or a single skill with its
 * group under its name. No domain and no level is named here.
 *
 * On a career's page the route is by group (`grouped`): each skill group is
 * one section, in the order the route first reaches it, and every section is
 * closed to its one line ("Arc welding · 4") until it is opened, for
 * everyone; "Open all" opens them together.
 *
 * For a seeker each skill is held, being learned, one of the next three, or
 * later; the first of the three is said above the route (`NextUp`) and, from
 * 1024 px, in a column that holds still beside it (`RouteSide`). The sections
 * that hold a next skill are the open ones when the page arrives. Everyone
 * else sees the same sections, closed, and nothing marked.
 *
 * The route is read-only: it shows what a person holds and nothing here
 * marks a skill (that is done on Profile). When their marks change elsewhere
 * every figure follows, a section that Next has moved into opens, and none
 * closes by itself during a visit.
 */
export function Route({ skills, marks = null, comesFrom = [], leadsTo = [], renderRow, keepAs, grouped = false, heading, className }: RouteProps) {
  const route = useMemo(() => (grouped ? groupRoute(skills) : buildRoute(skills)), [skills, grouped]);
  const sections = useMemo(() => route.filter((stop) => stop.kind === 'section'), [route]);
  // A person's marks are read once the list has arrived: until then nothing is next and nothing opens.
  const ready = !marks || !marks.pending;
  const next = useMemo(
    // In the route's own order, whichever way its stops are cut. A career's page (by group) names no next
    // skill: the owner found NEXT and THEN, the column beside the route and the groups opened for it confusing,
    // so there every group arrives closed and only the marks say what is held.
    () => (marks && ready && !grouped ? nextOf(skills, (id) => marks.statusOf(id) === 'held') : []),
    [marks, ready, skills, grouped]
  );
  const nextIds = useMemo(() => next.map((skill) => skill.id), [next]);

  // Which sections are open: the rule for the person, then whatever they opened or closed themselves this visit.
  const storeKey = keepAs ? `archangel.route.${keepAs}` : null;
  const [chosen, setChosen] = useState<Record<string, boolean>>(() => readChosen(storeKey));
  // The sections Next has stood in since the page arrived: one that Next moved into opens, and none closes under the finger.
  const [entered, setEntered] = useState<ReadonlySet<string> | null>(null);
  const holdingNext = useMemo(() => sectionsHolding(route, nextIds), [route, nextIds]);
  if (marks && ready && (entered === null || holdingNext.some((key) => !entered.has(key)))) {
    setEntered(new Set([...(entered ?? []), ...holdingNext]));
  }
  // Next moving into a section opens it, whatever the person did to it earlier.
  const before = useRef<string[] | null>(null);
  useEffect(() => {
    if (!marks || !ready) return;
    const earlier = before.current;
    before.current = holdingNext;
    if (!earlier) return;
    const fresh = holdingNext.filter((key) => !earlier.includes(key));
    if (fresh.length > 0) setChosen((current) => (fresh.some((key) => current[key] === false) ? without(current, fresh) : current));
  }, [marks, ready, holdingNext]);

  // By group, every section starts closed (a path of one group is that group, open); cut into stops, a visitor's are open.
  const everyoneOpen = grouped ? route.length <= 1 : !marks || route.length <= OPEN_WHOLE;
  const isOpen = useCallback(
    (key: string): boolean => chosen[key] ?? (everyoneOpen || Boolean(entered?.has(key))),
    [chosen, everyoneOpen, entered]
  );
  const choose = (change: Record<string, boolean>) => {
    setChosen((current) => {
      const nextChosen = { ...current, ...change };
      if (storeKey) writeStored(storeKey, JSON.stringify(nextChosen), 'session');
      return nextChosen;
    });
  };
  const allOpen = sections.length > 0 && sections.every((section) => isOpen(section.key));

  // Next in words leads to its row: its section opens, the row comes into view and its name takes focus.
  const root = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  const goTo = (skillId: string) => {
    const section = sections.find((each) => each.skills.some((skill) => skill.id === skillId));
    if (section && !isOpen(section.key)) choose({ [section.key]: true });
    setReveal(skillId);
  };
  useEffect(() => {
    if (!reveal) return;
    setReveal(null);
    const row = root.current?.querySelector<HTMLElement>(`[data-skill-tag="${reveal}"]`);
    if (!row) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    row.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
  }, [reveal]);

  if (skills.length === 0) return null;

  const plain = Boolean(renderRow);
  const count = skills.length;
  // The trunk runs from the first line of the route to the last one that is drawn.
  const lastStop = route[route.length - 1];
  const context = (stop: RouteStop<RouteSkill>, skill: RouteSkill, at: { first: boolean; last: boolean }): RowContext => {
    const place = nextIds.indexOf(skill.id);
    return { group: stop.kind === 'single' ? (skill.group?.name ?? null) : null, next: place < 0 ? null : place, first: at.first, last: at.last };
  };
  const row = (stop: RouteStop<RouteSkill>, skill: RouteSkill, at: { first: boolean; last: boolean }) => {
    const about = context(stop, skill, at);
    return renderRow ? renderRow(skill, about) : <RouteRow key={skill.id} skill={skill} marks={ready ? marks : null} context={about} />;
  };

  return (
    <div
      ref={root}
      className={cn('route', className)}
      data-route
      data-route-plain={plain || undefined}
      data-route-two={marks && next.length > 0 ? '' : undefined}
      data-route-marked={marks ? '' : undefined}
    >
      <div className="route-main">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3">
          {heading ?? (
            // Where the rows are switches, the page above says how many are on; the route does not count them again.
            <p className={labelClass} data-route-count>
              {plain ? 'Path' : plural(count, 'skill', 'skills')}
            </p>
          )}
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
        {marks && next.length > 0 && <NextUp skill={next[0]} onGo={goTo} className="route-next mt-1" />}
        {comesFrom.length > 0 && <Ladder label="Comes from" careers={comesFrom} place="before" />}
        <ol className="route-stops">
          {route.map((stop, index) => {
            const first = index === 0;
            const last = stop === lastStop;
            if (stop.kind === 'single') return row(stop, stop.skill, { first, last });
            const open = isOpen(stop.key);
            return (
              <RouteSection
                key={stop.key}
                section={stop}
                open={open}
                onToggle={() => choose({ [stop.key]: !open })}
                marks={ready ? marks : null}
                seeker={Boolean(marks)}
                plain={plain}
                first={first}
                last={last && !open}
              >
                {stop.skills.map((skill, at) => row(stop, skill, { first: false, last: last && at === stop.skills.length - 1 }))}
              </RouteSection>
            );
          })}
        </ol>
        {leadsTo.length > 0 && <Ladder label="Leads to" careers={leadsTo} place="after" />}
      </div>
      {marks && next.length > 0 && <RouteSide next={next} onGo={goTo} />}
    </div>
  );
}

/** The sections that hold one of the next skills, by key. */
function sectionsHolding(route: readonly RouteStop<RouteSkill>[], nextIds: readonly string[]): string[] {
  return route.flatMap((stop) => (stop.kind === 'section' && stop.skills.some((skill) => nextIds.includes(skill.id)) ? [stop.key] : []));
}

function without(chosen: Record<string, boolean>, keys: readonly string[]): Record<string, boolean> {
  const next = { ...chosen };
  for (const key of keys) delete next[key];
  return next;
}

/** What the person opened and closed earlier in this visit; nothing when the browser will not say. */
function readChosen(key: string | null): Record<string, boolean> {
  if (!key) return {};
  try {
    const stored: unknown = JSON.parse(readStored(key, 'session') ?? '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
  } catch {
    return {};
  }
}
