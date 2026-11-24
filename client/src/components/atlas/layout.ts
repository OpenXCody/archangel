import type { SkillLevel, Taxonomy } from '../../lib/api';

/**
 * The arithmetic of the Atlas: where every domain, skill group and skill sits
 * on the plate. Pure functions, no DOM and no React, so `tests/unit/atlas.unit.ts`
 * can check them.
 *
 * The plate is a circle of radius 1 about the origin. An angle is measured in
 * radians, clockwise from twelve o'clock, so `point(0, 1)` is the top of the
 * plate and angles grow the way the domains are read. A radius is a fraction
 * of the plate's.
 *
 * The domains do not start at the top. The seam between the last domain and
 * the first is at `start` (half past seven, lower left), so the first domain
 * opens on the left where a line is begun, the trades that follow it hold the
 * top of the plate, and the last domain (Safety) ends at the lower left, the
 * quietest place on a circle. Angles run on from `start` without wrapping:
 * every angle of the layout is in [start, start + 2π), and grows with the
 * order of the leaves.
 *
 * The tree is: centre → domain → skill group → skill. Every skill is a leaf
 * and takes one step of angle; a gap separates two groups and a wider one two
 * domains, so the sectors read with nothing drawn between them. A skill's
 * level sets how far out its leaf sits: Fundamentals nearest the centre,
 * Advanced nearest the rim, each level a band of a few rows.
 *
 * The branches are smooth curves (`linkPath`): each leaves its parent along
 * the radius and arrives at its child along the radius, the way a radial
 * tree is drawn. The plate draws them only as far as the groups (the
 * skeleton, `skeletonPath`); a career laid over it draws them on to its
 * skills (`branchPath`).
 */

export const TAU = Math.PI * 2;

/** A level's band: where its leaves sit, from the inner row to the outer, and in how many rows. */
export interface AtlasBand {
  from: number;
  to: number;
  rows: number;
}

export interface AtlasGeometry {
  /** Where the seam between the last domain and the first is: radians clockwise from twelve o'clock. */
  start: number;
  /** The gap between two groups of one domain, in leaf steps. */
  groupGap: number;
  /** The gap between two domains, in leaf steps. */
  domainGap: number;
  /** How far a domain's rim arc reaches past its first and last leaf, in leaf steps. */
  ringPad: number;
  /** The small ring the trunks leave from. */
  root: number;
  /** Where a domain's trunk ends and its groups' branches begin. */
  domain: number;
  /** Where a group's branch ends, under its skills. */
  group: number;
  /**
   * The level's bands, Fundamentals nearest the centre. Leaves of one level
   * in one group take the band's rows in turn, so 722 skills keep a mark of
   * their own: on one ring they would run together into a line. Intermediate
   * holds most of the skills and has the deepest band.
   */
  bands: Record<SkillLevel, AtlasBand>;
  /** The rim: one arc per domain. */
  ring: number;
}

/** Half past seven: the last domain ends at the lower left, the first begins there and climbs the left side. */
export const START = (Math.PI * 5) / 4;

export const GEOMETRY: AtlasGeometry = {
  start: START,
  groupGap: 1.6,
  domainGap: 6,
  ringPad: 1.5,
  root: 0.035,
  domain: 0.14,
  group: 0.4,
  bands: {
    1: { from: 0.465, to: 0.53, rows: 4 },
    2: { from: 0.58, to: 0.71, rows: 4 },
    3: { from: 0.76, to: 0.85, rows: 3 },
  },
  ring: 0.905,
};

/**
 * The radius of a leaf: its level's band, and within the band the row it
 * takes (`turn` counts the leaves of that level round the plate, from 0).
 * Every Fundamentals leaf is nearer the centre than every Intermediate one,
 * and those nearer than every Advanced one.
 */
export function leafRadius(geometry: AtlasGeometry, level: SkillLevel, turn = 0): number {
  const band = geometry.bands[level] ?? geometry.bands[2];
  if (band.rows <= 1) return (band.from + band.to) / 2;
  return band.from + ((turn % band.rows) / (band.rows - 1)) * (band.to - band.from);
}

export interface AtlasLeaf {
  /** Position in `leaves`: clockwise from the seam. */
  index: number;
  id: string;
  name: string;
  level: SkillLevel;
  /** How many careers use the skill. */
  careers: number;
  /** How many military careers use it: said in the panel for a skill no other career uses. */
  militaryCareers: number;
  angle: number;
  radius: number;
  /** Positions in `groups` and `domains`. */
  group: number;
  domain: number;
}

export interface AtlasGroup {
  index: number;
  slug: string;
  name: string;
  description: string;
  domain: number;
  /** Its leaves are `leaves[first..last]`. */
  first: number;
  last: number;
  /** The angles of its first and last leaf, and where its branch ends. */
  a0: number;
  a1: number;
  angle: number;
}

export interface AtlasDomain {
  index: number;
  slug: string;
  name: string;
  description: string;
  /** Its groups are `groups[firstGroup..lastGroup]`, its leaves `leaves[first..last]`. */
  firstGroup: number;
  lastGroup: number;
  first: number;
  last: number;
  /** The angles of its first and last leaf. */
  a0: number;
  a1: number;
  /** Where its rim arc starts and ends: a little past its leaves. */
  from: number;
  to: number;
  /** Where its trunk leaves the centre: the middle of its sector. */
  angle: number;
}

export interface AtlasLayout {
  geometry: AtlasGeometry;
  /** The angle one leaf takes. */
  step: number;
  /** The most careers any one skill has: the top of the scale a leaf's weight is read on. */
  maxCareers: number;
  domains: AtlasDomain[];
  groups: AtlasGroup[];
  leaves: AtlasLeaf[];
  leafById: Map<string, AtlasLeaf>;
  groupBySlug: Map<string, AtlasGroup>;
  domainBySlug: Map<string, AtlasDomain>;
}

/** A point on the plate: `angle` clockwise from the top, `radius` from the centre; y grows downward, as on a screen. */
export function point(angle: number, radius: number): [x: number, y: number] {
  return [radius * Math.sin(angle), -radius * Math.cos(angle)];
}

/** An angle brought into [0, 2π). */
export function turn(angle: number): number {
  const a = angle % TAU;
  return a < 0 ? a + TAU : a;
}

/**
 * Lay the taxonomy out on the plate. Domains, groups and skills keep the
 * order they are given in; a domain or group with no skill takes no room and
 * is left out.
 */
export function layoutAtlas(taxonomy: Pick<Taxonomy, 'domains'>, geometry: AtlasGeometry = GEOMETRY): AtlasLayout {
  const source = taxonomy.domains
    .map((domain) => ({ ...domain, groups: domain.groups.filter((group) => group.skills.length > 0) }))
    .filter((domain) => domain.groups.length > 0);

  let steps = 0;
  for (const domain of source) {
    steps += geometry.domainGap + (domain.groups.length - 1) * geometry.groupGap;
    for (const group of domain.groups) steps += group.skills.length;
  }
  const step = steps > 0 ? TAU / steps : 0;

  const domains: AtlasDomain[] = [];
  const groups: AtlasGroup[] = [];
  const leaves: AtlasLeaf[] = [];
  let maxCareers = 0;
  // The leaves of each level take their band's rows in turn round the whole plate: two that share a row have a band's worth of rows of others between them.
  const turns: Record<SkillLevel, number> = { 1: 0, 2: 0, 3: 0 };
  // The seam between the last domain and the first is centred on `start`.
  const origin = step > 0 ? geometry.start / step : 0;
  let cursor = origin + geometry.domainGap / 2;

  for (const d of source) {
    const domain: AtlasDomain = {
      index: domains.length,
      slug: d.slug,
      name: d.name,
      description: d.description,
      firstGroup: groups.length,
      lastGroup: groups.length + d.groups.length - 1,
      first: leaves.length,
      last: leaves.length,
      a0: 0,
      a1: 0,
      from: 0,
      to: 0,
      angle: 0,
    };
    d.groups.forEach((g, n) => {
      if (n > 0) cursor += geometry.groupGap;
      const group: AtlasGroup = {
        index: groups.length,
        slug: g.slug,
        name: g.name,
        description: g.description,
        domain: domain.index,
        first: leaves.length,
        last: leaves.length + g.skills.length - 1,
        a0: 0,
        a1: 0,
        angle: 0,
      };
      for (const skill of g.skills) {
        // A leaf sits in the middle of its step.
        leaves.push({
          index: leaves.length,
          id: skill.id,
          name: skill.name,
          level: skill.level,
          careers: skill.careers,
          militaryCareers: skill.militaryCareers ?? 0,
          angle: (cursor + 0.5) * step,
          radius: leafRadius(geometry, skill.level, turns[skill.level] ?? 0),
          group: group.index,
          domain: domain.index,
        });
        if (skill.careers > maxCareers) maxCareers = skill.careers;
        if (skill.level in turns) turns[skill.level] += 1;
        cursor += 1;
      }
      group.a0 = leaves[group.first].angle;
      group.a1 = leaves[group.last].angle;
      group.angle = (group.a0 + group.a1) / 2;
      groups.push(group);
    });
    domain.last = leaves.length - 1;
    domain.a0 = leaves[domain.first].angle;
    domain.a1 = leaves[domain.last].angle;
    domain.from = domain.a0 - geometry.ringPad * step;
    domain.to = domain.a1 + geometry.ringPad * step;
    domain.angle = (domain.a0 + domain.a1) / 2;
    domains.push(domain);
    cursor += geometry.domainGap;
  }

  return {
    geometry,
    step,
    maxCareers,
    domains,
    groups,
    leaves,
    leafById: new Map(leaves.map((leaf) => [leaf.id, leaf])),
    groupBySlug: new Map(groups.map((group) => [group.slug, group])),
    domainBySlug: new Map(domains.map((domain) => [domain.slug, domain])),
  };
}

/**
 * How strong a leaf's mark is, 0 to 1, from how many careers use the skill.
 * The scale is logarithmic: most skills belong to one or two careers and a
 * few to a hundred, and both ends have to read.
 */
export function leafWeight(careers: number, maxCareers: number): number {
  if (maxCareers <= 1 || careers <= 1) return 0;
  return Math.min(1, Math.log(careers) / Math.log(maxCareers));
}

// ---------------------------------------------------------------------------
// Paths. Coordinates are written in the plate's units times `scale`.
// ---------------------------------------------------------------------------

const n = (value: number) => (Math.round(value * 100) / 100).toString();

function at(angle: number, radius: number, scale: number): string {
  const [x, y] = point(angle, radius);
  return `${n(x * scale)} ${n(y * scale)}`;
}

/** "M … A …": an arc of the circle of `radius`, clockwise from `a0` to `a1`. */
export function arcPath(radius: number, a0: number, a1: number, scale: number): string {
  if (a1 - a0 < 1e-9) return '';
  const r = n(radius * scale);
  return `M${at(a0, radius, scale)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${at(a1, radius, scale)}`;
}

/** The same arc drawn anticlockwise from `a1` to `a0`: what text on the lower half of the plate is set along, so it reads upright. */
export function arcPathReversed(radius: number, a0: number, a1: number, scale: number): string {
  if (a1 - a0 < 1e-9) return '';
  const r = n(radius * scale);
  return `M${at(a1, radius, scale)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 0 ${at(a0, radius, scale)}`;
}

/**
 * One branch, from a parent at (`a0`, `r0`) to a child at (`a1`, `r1`): a
 * straight run when the two share an angle, else a cubic curve whose control
 * points stand at the middle radius on each one's angle, so it leaves the
 * parent and reaches the child along the radius. `continued` leaves out the
 * move to its start, for a line that goes on from where the pen is.
 */
export function linkPath(a0: number, r0: number, a1: number, r1: number, scale: number, continued = false): string {
  const start = continued ? '' : `M${at(a0, r0, scale)}`;
  if (Math.abs(a1 - a0) < 1e-9) return `${start}L${at(a1, r1, scale)}`;
  const middle = (r0 + r1) / 2;
  return `${start}C${at(a0, middle, scale)} ${at(a1, middle, scale)} ${at(a1, r1, scale)}`;
}

/** A closed sector of an annulus: the veil, and what the pointer is on. */
export function sectorPath(r0: number, r1: number, a0: number, a1: number, scale: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const inner = n(r0 * scale);
  const outer = n(r1 * scale);
  return (
    `M${at(a0, r0, scale)}L${at(a0, r1, scale)}A${outer} ${outer} 0 ${large} 1 ${at(a1, r1, scale)}` +
    `L${at(a1, r0, scale)}A${inner} ${inner} 0 ${large} 0 ${at(a0, r0, scale)}Z`
  );
}

/** The plate's own branches, as one path: each domain's trunk from the centre and a curve from it to each of its groups. No skill has a stem of its own. */
export function skeletonPath(layout: AtlasLayout, scale: number): string {
  const g = layout.geometry;
  let d = '';
  for (const domain of layout.domains) {
    d += linkPath(domain.angle, g.root, domain.angle, g.domain, scale);
    for (let i = domain.firstGroup; i <= domain.lastGroup; i++) d += linkPath(domain.angle, g.domain, layout.groups[i].angle, g.group, scale);
  }
  return d;
}

/** A group's branches on to its skills: what an open group draws. */
export function stemsPath(layout: AtlasLayout, group: AtlasGroup, scale: number): string {
  const g = layout.geometry;
  let d = '';
  for (let i = group.first; i <= group.last; i++) d += linkPath(group.angle, g.group, layout.leaves[i].angle, layout.leaves[i].radius, scale);
  return d;
}

/**
 * The branches that lead from the centre to a set of skills, as one path:
 * each domain's trunk, the curve to each group, and the curve on to each
 * skill, every one drawn once however many skills share it. What a career
 * laid over the atlas lights.
 */
export function branchPath(layout: AtlasLayout, leafIndexes: Iterable<number>, scale: number): string {
  const g = layout.geometry;
  const groups = new Set<number>();
  let d = '';
  for (const index of leafIndexes) {
    const leaf = layout.leaves[index];
    if (!leaf) continue;
    groups.add(leaf.group);
    d += linkPath(layout.groups[leaf.group].angle, g.group, leaf.angle, leaf.radius, scale);
  }
  const domains = new Set<number>();
  for (const index of groups) {
    const group = layout.groups[index];
    domains.add(group.domain);
    d += linkPath(layout.domains[group.domain].angle, g.domain, group.angle, g.group, scale);
  }
  for (const index of domains) d += linkPath(layout.domains[index].angle, g.root, layout.domains[index].angle, g.domain, scale);
  return d;
}

// ---------------------------------------------------------------------------
// Finding what is under a point
// ---------------------------------------------------------------------------

export interface AtlasHit {
  domain: AtlasDomain;
  /** The group whose share of the circle the angle falls in. */
  group: AtlasGroup;
  /** The skill nearest the angle within that group. */
  leaf: AtlasLeaf;
}

/**
 * What sits at an angle: the domain whose sector holds it (the gap between
 * two domains is shared between them), then the nearest group in that
 * domain, then the nearest leaf in that group. Null for an empty atlas.
 */
export function locate(layout: AtlasLayout, angle: number): AtlasHit | null {
  if (layout.leaves.length === 0) return null;
  // Brought into the layout's own turn: [start, start + 2π).
  const a = layout.geometry.start + turn(angle - layout.geometry.start);
  const pad = (layout.geometry.domainGap / 2) * layout.step;
  // The seam belongs to the first domain on its clockwise side and the last on the other.
  let domain = layout.domains[layout.domains.length - 1];
  for (const candidate of layout.domains) {
    if (a < candidate.a1 + pad) {
      domain = candidate;
      break;
    }
  }
  let group = layout.groups[domain.firstGroup];
  for (let i = domain.firstGroup; i <= domain.lastGroup; i++) {
    const candidate = layout.groups[i];
    group = candidate;
    const next = layout.groups[i + 1];
    if (i === domain.lastGroup || a < (candidate.a1 + next.a0) / 2) break;
  }
  const offset = Math.round((a - group.a0) / layout.step);
  const leaf = layout.leaves[Math.min(group.last, Math.max(group.first, group.first + offset))];
  return { domain, group, leaf };
}

// ---------------------------------------------------------------------------
// Labels that must not sit on one another
// ---------------------------------------------------------------------------

/**
 * Place labels along a line so none overlaps its neighbour, each as near to
 * where it wants to be as the others allow. `wanted` are the centres they ask
 * for, in order; `sizes` their extents along the line. The answer keeps the
 * order and moves the labels as little as possible in total (least squares:
 * pooling neighbours that would collide and placing each pool about the mean
 * of what its members asked for).
 */
export function spread(wanted: number[], sizes: number[]): number[] {
  const count = wanted.length;
  if (count === 0) return [];
  // With each label's distance from the first taken out, "do not overlap" is "do not decrease".
  const offsets = new Array<number>(count);
  offsets[0] = 0;
  for (let i = 1; i < count; i++) offsets[i] = offsets[i - 1] + (sizes[i - 1] + sizes[i]) / 2;
  const pools: { sum: number; size: number }[] = [];
  for (let i = 0; i < count; i++) {
    pools.push({ sum: wanted[i] - offsets[i], size: 1 });
    while (pools.length > 1) {
      const last = pools[pools.length - 1];
      const before = pools[pools.length - 2];
      if (before.sum / before.size <= last.sum / last.size) break;
      before.sum += last.sum;
      before.size += last.size;
      pools.pop();
    }
  }
  const placed: number[] = [];
  for (const pool of pools) {
    const value = pool.sum / pool.size;
    for (let i = 0; i < pool.size; i++) placed.push(value + offsets[placed.length]);
  }
  return placed;
}

/**
 * `spread` round a circle: labels set along a ring, where the last is also the
 * first one's neighbour. `wanted` are angles in order within one turn. The
 * line is cut between each pair of neighbours in turn and the cut kept is the
 * one where the two ends do not meet, then the one that moves the labels
 * least. `moved` is how far they were moved in total, `overlap` how far the
 * ends still run into each other when the ring is too short for them all.
 */
export function spreadRound(wanted: number[], sizes: number[]): { placed: number[]; moved: number; overlap: number } {
  const count = wanted.length;
  let best: { placed: number[]; moved: number; overlap: number } = { placed: [], moved: 0, overlap: 0 };
  for (let cut = 0; cut < count; cut++) {
    const order = wanted.map((_, i) => (cut + i) % count);
    const asked = order.map((index, i) => wanted[index] + (i >= count - cut ? TAU : 0));
    const size = order.map((index) => sizes[index]);
    const got = spread(asked, size);
    const overlap = Math.max(0, got[count - 1] + size[count - 1] / 2 - (got[0] + TAU - size[0] / 2));
    let moved = 0;
    const placed = new Array<number>(count);
    got.forEach((angle, i) => {
      moved += Math.abs(angle - asked[i]);
      placed[order[i]] = angle - (i >= count - cut ? TAU : 0);
    });
    if (cut === 0 || overlap < best.overlap - 1e-9 || (overlap < best.overlap + 1e-9 && moved < best.moved - 1e-9)) best = { placed, moved, overlap };
  }
  return best;
}

/**
 * `spread` inside a span: rows along a line from `low` to `high`, none on
 * another, each as near where it asks to be as the others allow, and all of
 * them inside. Where the span is too short for them all they are set closer.
 */
export function spreadWithin(wanted: number[], sizes: number[], low: number, high: number): number[] {
  const count = wanted.length;
  if (count === 0) return [];
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const fit = total > high - low ? (high - low) / total : 1;
  const fitted = sizes.map((size) => size * fit);
  // Each asks for no more than leaves room for those before it above and those after it below: then all of them fit.
  let before = 0;
  let after = fitted.reduce((sum, size) => sum + size, 0);
  const asked = wanted.map((value, i) => {
    after -= fitted[i];
    const lowest = low + before + fitted[i] / 2;
    const highest = high - after - fitted[i] / 2;
    before += fitted[i];
    return Math.min(highest, Math.max(lowest, value));
  });
  return spread(asked, fitted);
}

/** A name beside the open domain: a group's, or a skill's of the open group, set level in a column right of the rim. */
export interface AtlasLabel {
  kind: 'group' | 'skill';
  /** Its place in `groups` or in `leaves`. */
  index: number;
  text: string;
  /** The angle of what it names. */
  from: number;
  /** Where its line is set: frame units (plate radii) from the frame's middle, downward. */
  y: number;
}

/** The signed way from angle `b` round to angle `a`, the short way: in [-π, π). */
export function between(a: number, b: number): number {
  return turn(a - b + Math.PI) - Math.PI;
}

/**
 * The names beside an open domain, in order down the column: one for each of
 * its groups, and for the open group one for each of its skills in the
 * group's place. Each asks to stand level with its place on the rim as the
 * camera shows it; neighbours make room (`spreadWithin`), the rows `pitch`
 * apart, all between `top` and `bottom` (frame units). No other domain's
 * groups are named.
 */
export function placeLabels(
  layout: AtlasLayout,
  domain: AtlasDomain,
  open: AtlasGroup | null,
  camera: AtlasCamera,
  rows: { group: number; skill: number; top: number; bottom: number }
): AtlasLabel[] {
  const labels: AtlasLabel[] = [];
  const sizes: number[] = [];
  for (let i = domain.firstGroup; i <= domain.lastGroup; i++) {
    const group = layout.groups[i];
    if (open && open.index === group.index) {
      for (let leaf = group.first; leaf <= group.last; leaf++) {
        labels.push({ kind: 'skill', index: leaf, text: layout.leaves[leaf].name, from: layout.leaves[leaf].angle, y: 0 });
        sizes.push(rows.skill);
      }
    } else {
      labels.push({ kind: 'group', index: group.index, text: group.name, from: group.angle, y: 0 });
      sizes.push(rows.group);
    }
  }
  const wanted = labels.map((label) => project(camera, label.from, layout.geometry.ring)[1]);
  spreadWithin(wanted, sizes, rows.top, rows.bottom).forEach((y, i) => {
    labels[i].y = y;
  });
  return labels;
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

/**
 * How the plate is looked at: turned by `rotate` (radians, clockwise),
 * enlarged `scale` times about its centre, then moved by (`x`, `y`) plate
 * radii. The whole atlas is `{ rotate: 0, scale: 1, x: 0, y: 0 }`.
 */
export interface AtlasCamera {
  rotate: number;
  scale: number;
  x: number;
  y: number;
}

export const WHOLE: AtlasCamera = { rotate: 0, scale: 1, x: 0, y: 0 };

/**
 * The camera that turns `angle` to three o'clock, so labels beside it read
 * left to right, and enlarges the plate `scale` times with the radius
 * `anchor` brought to `anchorX` (plate radii from the frame's centre).
 * The turn is the shortest one from `from`, so a neighbouring domain is a
 * small move and never a spin the long way round.
 */
export function cameraOn(angle: number, scale: number, anchor: number, anchorX: number, from = 0): AtlasCamera {
  const target = Math.PI / 2 - angle;
  const delta = turn(target - from + Math.PI) - Math.PI;
  return { rotate: from + delta, scale, x: anchorX - anchor * scale, y: 0 };
}

/** The whole atlas, reached by the shortest turn from `from`. */
export function cameraWhole(from = 0): AtlasCamera {
  return { rotate: Math.round(from / TAU) * TAU, scale: 1, x: 0, y: 0 };
}

/** Where a point of the plate is in the frame (plate radii from the frame's centre), as the camera shows it. */
export function project(camera: AtlasCamera, angle: number, radius: number): [x: number, y: number] {
  const [x, y] = point(angle + camera.rotate, radius);
  return [x * camera.scale + camera.x, y * camera.scale + camera.y];
}

/** Where a point of the frame (plate radii from the frame's centre) is on the plate: its angle and radius. */
export function unproject(camera: AtlasCamera, x: number, y: number): { angle: number; radius: number } {
  const px = (x - camera.x) / camera.scale;
  const py = (y - camera.y) / camera.scale;
  // The screen angle of the point, clockwise from the top, less the camera's turn.
  return { angle: turn(Math.atan2(px, -py) - camera.rotate), radius: Math.hypot(px, py) };
}
