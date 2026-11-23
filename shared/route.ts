/**
 * A career's path as a route: stops down one line, top to bottom the order to
 * learn in. Pure, and shared by the page and the server, so both cut a path
 * into the same stops and name the same next skills.
 *
 * The order itself is not decided here: the skills arrive in it (the server's
 * `routeOf`). What is derived here is never stored: the stops, what is next,
 * and how much is held.
 */

/** What a route needs of a skill: who it is, and the skill group it belongs to. */
export interface RouteSkillLike {
  id: string;
  group: { slug: string; name: string } | null;
}

/** Two or more neighbouring skills of one skill group: one line that opens and closes, its skills under it. */
export interface RouteSection<S> {
  kind: 'section';
  /** Steady for a path while its order holds: the group, and the skill the run opens with. */
  key: string;
  group: { slug: string; name: string };
  skills: S[];
}

/** A run of one: the skill's own row, with its group under its name. */
export interface RouteSingle<S> {
  kind: 'single';
  key: string;
  skill: S;
}

export type RouteStop<S> = RouteSection<S> | RouteSingle<S>;

/**
 * Cut a path into its stops. A section is a longest run of neighbouring skills
 * that share a skill group; a run of one is the skill by itself. A group the
 * route comes back to later is two stops with the same name. A skill no
 * taxonomy placed (no group) is always a stop of its own.
 */
export function buildRoute<S extends RouteSkillLike>(skills: readonly S[]): RouteStop<S>[] {
  const stops: RouteStop<S>[] = [];
  let run: S[] = [];
  const close = () => {
    if (run.length === 0) return;
    const first = run[0];
    if (run.length === 1 || !first.group) stops.push({ kind: 'single', key: first.id, skill: first });
    else stops.push({ kind: 'section', key: `${first.group.slug}:${first.id}`, group: first.group, skills: run });
    run = [];
  };
  for (const skill of skills) {
    const last = run[run.length - 1];
    if (last && (!skill.group || !last.group || skill.group.slug !== last.group.slug)) close();
    run.push(skill);
  }
  close();
  return stops;
}

/** A route's skills again, in order. */
export function routeSkills<S>(route: readonly RouteStop<S>[]): S[] {
  return route.flatMap((stop) => (stop.kind === 'section' ? stop.skills : [stop.skill]));
}

/** How many skills are named as next: the first is Next, the others Then. */
export const NEXT_SKILLS = 3;

/**
 * The next skills of a route: the first three not held, in the route's order.
 * A skill being learned is not held, so it can be one of them. Nothing is
 * gated: skills held out of order are simply passed over.
 */
export function nextOf<S extends { id: string }>(skills: readonly S[], isHeld: (skillId: string) => boolean, count = NEXT_SKILLS): S[] {
  const next: S[] = [];
  for (const skill of skills) {
    if (next.length >= count) break;
    if (!isHeld(skill.id)) next.push(skill);
  }
  return next;
}

/** A person's standing in a skill. */
export type RouteStatus = 'held' | 'learning' | 'none';

/** How much of a set of skills is held. Learning is counted apart and never as held. */
export interface Share {
  held: number;
  learning: number;
  total: number;
}

export function shareOf(skills: readonly { id: string }[], statusOf: (skillId: string) => RouteStatus): Share {
  let held = 0;
  let learning = 0;
  for (const skill of skills) {
    const status = statusOf(skill.id);
    if (status === 'held') held += 1;
    else if (status === 'learning') learning += 1;
  }
  return { held, learning, total: skills.length };
}
