/**
 * Reach: how much of one career's path another set of skills covers. It is
 * arithmetic over paths, never a stored link: a person's held skills against a
 * career (Profile's "Within reach"), and a military career's path against a
 * civilian career's ("Civilian careers within reach" on the one page, "Military
 * careers that reach this" on the other). One rule, `withinReach`, decides what
 * those words are said of, wherever they are said. Profile also has something
 * to show a person whose skills reach no career yet: the closest ones, which
 * it calls that (`reachOrClosest`).
 */

/** A path shorter than this says too little to rank a career by. */
export const REACH_MIN_PATH = 5;

/**
 * Whether one career's path reaches another's: the other's path has five skills
 * or more, and at least a third of them are on this one. A career that shares
 * two shop basics with a path of nineteen is not within reach of it.
 */
export function withinReach(held: number, total: number): boolean {
  return total >= REACH_MIN_PATH && held > 0 && held * 3 >= total;
}

/** What a reach is ranked on. */
interface Reach {
  held: number;
  total: number;
  title: string;
}

/** The order reach is listed in: the largest share first, then the most skills held, then by title. */
export function byReach(a: Reach, b: Reach): number {
  // Shares are compared as cross products, so 6 of 9 and 4 of 6 are the same share exactly.
  return b.held * a.total - a.held * b.total || b.held - a.held || a.title.localeCompare(b.title);
}

/** The careers of a list that are within reach, closest first. */
export function reached<T extends Reach>(careers: readonly T[]): T[] {
  return careers.filter((career) => withinReach(career.held, career.total)).sort(byReach);
}

/**
 * What Profile lists from the careers closest to a person's skills (each with
 * at least one of them held): the ones within reach, in the order given; and
 * when none is, the closest as they are, which the page then heads "Closest
 * careers". The words "within reach" are never said of a career under the rule.
 */
export function reachOrClosest<T extends { held: number; total: number }>(careers: readonly T[]): { within: boolean; careers: T[] } {
  const within = careers.filter((career) => withinReach(career.held, career.total));
  return within.length > 0 ? { within: true, careers: within } : { within: false, careers: [...careers] };
}
