import { linkPath, point, type AtlasLayout, type AtlasLeaf } from './layout';

/**
 * A career on the Atlas, part walked: the arithmetic of the layers that say
 * how much of a career a person holds. Pure functions, no DOM and no React
 * (`tests/unit/career-atlas.unit.ts`).
 *
 * The plate itself is never drawn again for any of this. What a person holds
 * of a career is the way from the centre out to each held skill, a mark on
 * its leaf, and a ring at the centre that closes as the career is filled in.
 */

const n = (value: number) => (Math.round(value * 100) / 100).toString();

function at(angle: number, radius: number, scale: number): string {
  const [x, y] = point(angle, radius);
  return `${n(x * scale)} ${n(y * scale)}`;
}

/**
 * The way from the centre out to one skill, as one unbroken line: up the
 * domain's trunk, along the curve to the group, and along the curve on to the
 * skill. It is the same line the plate and a career draw for those branches,
 * so it lies exactly on them. Unbroken, so it can be drawn in from the centre
 * outward.
 */
export function routePath(layout: AtlasLayout, leaf: AtlasLeaf, scale: number): string {
  const g = layout.geometry;
  const group = layout.groups[leaf.group];
  const domain = layout.domains[leaf.domain];
  return (
    linkPath(domain.angle, g.root, domain.angle, g.domain, scale) +
    linkPath(domain.angle, g.domain, group.angle, g.group, scale, true) +
    linkPath(group.angle, g.group, leaf.angle, leaf.radius, scale, true)
  );
}

/**
 * Leaves as dots in one path: a stroke of no length at each, which a round
 * line cap draws as a disc as wide as the stroke. A whole set of skills is
 * then one element, which is what a small plate wants.
 */
export function dotsPath(layout: AtlasLayout, indexes: Iterable<number>, scale: number): string {
  let d = '';
  for (const index of indexes) {
    const leaf = layout.leaves[index];
    if (leaf) d += `M${at(leaf.angle, leaf.radius, scale)}h0`;
  }
  return d;
}

/** How much of a career is held, as the plate counts it: by leaf. */
export interface WalkShare {
  held: number;
  learning: number;
  total: number;
}

/** A career's skills on the plate, split by what the person has made of each. */
export interface Walk extends WalkShare {
  heldLeaves: number[];
  learningLeaves: number[];
  aheadLeaves: number[];
  /** Every skill of the career held: the picture is whole. */
  whole: boolean;
}

/**
 * Split a career's leaves by a person's marks. `career` are positions in
 * `layout.leaves`; `statusOf` answers for one of them. Learning is counted
 * apart and never as held, as everywhere else.
 */
export function walkOf(career: Iterable<number>, statusOf: (index: number) => 'held' | 'learning' | 'none' | undefined): Walk {
  const heldLeaves: number[] = [];
  const learningLeaves: number[] = [];
  const aheadLeaves: number[] = [];
  for (const index of career) {
    const status = statusOf(index);
    (status === 'held' ? heldLeaves : status === 'learning' ? learningLeaves : aheadLeaves).push(index);
  }
  const total = heldLeaves.length + learningLeaves.length + aheadLeaves.length;
  return { heldLeaves, learningLeaves, aheadLeaves, held: heldLeaves.length, learning: learningLeaves.length, total, whole: total > 0 && heldLeaves.length === total };
}

/**
 * The ring at the centre: the dashes of a circle of `radius` that leave the
 * held share drawn, starting from the top. A whole career is the whole circle.
 */
export function shareDash(share: WalkShare, radius: number): { dash: string; length: number } {
  const length = 2 * Math.PI * radius;
  const part = share.total > 0 ? Math.min(1, Math.max(0, share.held / share.total)) : 0;
  return { dash: `${n(part * length)} ${n(length)}`, length };
}
