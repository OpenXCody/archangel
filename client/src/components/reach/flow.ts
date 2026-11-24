/**
 * The arithmetic of a military career's flow into industry: its skills by
 * group, on the left; the civilian careers within its reach, in the middle;
 * the industries those careers are typical of, on the right. Every line on
 * the left is one skill the military path shares with a civilian career, so
 * a bundle is as thick as what carries; every line on the right is one
 * career typical of one industry.
 *
 * It is plain numbers, no drawing: `ReachFlow` draws them, and
 * tests/unit/reach-flow.unit.ts holds them. Across, a position is in
 * thousandths of the drawing's width (it stretches with the page); down, it
 * is in pixels (rows keep their height at every width).
 */

/** A skill of the military career's path, in the route's order, with its group. */
export interface FlowSkill {
  id: string;
  group: { slug: string; name: string } | null;
}

/** A civilian career within reach: the skills it shares with the military path, and its industries. */
export interface FlowCareer {
  id: string;
  shared: readonly string[];
  /** Its industries by their full names; none when it is typical of none in particular. */
  industries: readonly string[];
  /** Found in every industry rather than a few. */
  everywhere: boolean;
}

/** Where the columns stand, in thousandths of the width, and the rows' heights in pixels. */
export const FLOW = {
  width: 1000,
  /** A group's lines leave here; its name stands to the left of it. */
  groupEnd: 220,
  /** A career's button runs from here to `careerEnd`. */
  careerStart: 348,
  careerEnd: 652,
  /** An industry's lines arrive here; its name stands to the right of it. */
  industryStart: 780,
  /** One career per row, a pointer's button tall with room between. */
  careerPitch: 44,
  /** A group's or an industry's row at its closest: one line of small type with air around it. */
  minPitch: 28,
  /** Pixels between two lines where they meet a career. */
  slot: 2,
  /** Pixels between two lines where they leave a career for its industries. */
  outSlot: 3,
} as const;

/** The key of the industry node that stands for every industry. */
export const EVERY_INDUSTRY = '*';

/** A group of the military path, as the left column draws it. */
export interface FlowGroup {
  /** The group's slug ('' for skills in no group). */
  key: string;
  name: string | null;
  /** Its skills on the military path. */
  skills: number;
  /** Lines that leave it: its skills, once for each career shown that shares them. Nought: nothing in it carries. */
  lines: number;
  y: number;
}

export interface FlowCareerRow {
  id: string;
  y: number;
}

export interface FlowIndustry {
  /** The industry's full name, or `EVERY_INDUSTRY`. */
  key: string;
  /** How many of the careers shown are typical of it. */
  careers: number;
  y: number;
}

/** One shared skill: from its group to a career that has it. */
export interface FlowLine {
  career: string;
  group: string;
  skill: string;
  from: number;
  to: number;
}

/** One career to one industry it is typical of. */
export interface FlowLink {
  career: string;
  industry: string;
  from: number;
  to: number;
}

export interface FlowLayout {
  /** The drawing's height in pixels. */
  height: number;
  groups: FlowGroup[];
  careers: FlowCareerRow[];
  industries: FlowIndustry[];
  lines: FlowLine[];
  links: FlowLink[];
}

/** Rows down one column: `count` of them as close as `pitch` allows, centred in `height`. */
function rows(count: number, pitch: number, height: number): number[] {
  const top = (height - count * pitch) / 2;
  return Array.from({ length: count }, (_, at) => top + pitch * (at + 0.5));
}

/** Spread `count` ends about `centre`, `gap` apart, never wider than `widest`. */
function spread(count: number, centre: number, gap: number, widest: number): number[] {
  if (count <= 1) return Array.from({ length: count }, () => centre);
  const step = Math.min(gap, widest / (count - 1));
  return Array.from({ length: count }, (_, at) => centre + (at - (count - 1) / 2) * step);
}

/** The mean of the rows a node's lines run to: where it stands best, so that lines cross least. */
function middle(rowsOf: readonly number[]): number {
  return rowsOf.reduce((sum, row) => sum + row, 0) / rowsOf.length;
}

/**
 * The flow for a military path and the civilian careers it reaches, in the
 * order given (the closest first). Groups and industries are placed where
 * their lines run (the mean row of their careers), so bundles cross as little
 * as they can; a group whose skills carry into none of the careers shown
 * stands last, in the route's order, with no line.
 */
export function layoutFlow(path: readonly FlowSkill[], careers: readonly FlowCareer[]): FlowLayout {
  // The groups of the path, in the order the route first reaches them.
  const groupOf = new Map<string, string>();
  const named = new Map<string, { name: string | null; skills: number; order: number }>();
  for (const skill of path) {
    const key = skill.group?.slug ?? '';
    groupOf.set(skill.id, key);
    const known = named.get(key);
    if (known) known.skills += 1;
    else named.set(key, { name: skill.group?.name ?? null, skills: 1, order: named.size });
  }
  const order = new Map(path.map((skill, at) => [skill.id, at]));

  // Which careers each group's lines and each industry's links reach, by the career's row.
  const reaching = new Map<string, number[]>();
  const typical = new Map<string, number[]>();
  careers.forEach((career, row) => {
    for (const skill of career.shared) {
      const group = groupOf.get(skill);
      if (group === undefined) continue;
      reaching.set(group, [...(reaching.get(group) ?? []), row]);
    }
    for (const industry of industriesOf(career)) typical.set(industry, [...(typical.get(industry) ?? []), row]);
  });

  const groupKeys = [...named.keys()].sort((a, b) => {
    const [ra, rb] = [reaching.get(a), reaching.get(b)];
    if (ra && rb) return middle(ra) - middle(rb) || named.get(a)!.order - named.get(b)!.order;
    if (ra || rb) return ra ? -1 : 1;
    return named.get(a)!.order - named.get(b)!.order;
  });
  const industryKeys = [...typical.keys()].sort((a, b) => {
    if (a === EVERY_INDUSTRY || b === EVERY_INDUSTRY) return a === EVERY_INDUSTRY ? 1 : -1;
    const [ra, rb] = [typical.get(a)!, typical.get(b)!];
    return middle(ra) - middle(rb) || rb.length - ra.length || a.localeCompare(b);
  });

  // The careers keep their pitch; the other two columns share the same height, closer where they have more rows.
  const careerHeight = careers.length * FLOW.careerPitch;
  const pitchFor = (count: number) => (count === 0 ? FLOW.careerPitch : Math.min(FLOW.careerPitch, Math.max(FLOW.minPitch, careerHeight / count)));
  const groupPitch = pitchFor(groupKeys.length);
  const industryPitch = pitchFor(industryKeys.length);
  const height = Math.max(careerHeight, groupKeys.length * groupPitch, industryKeys.length * industryPitch);

  const careerRows = rows(careers.length, FLOW.careerPitch, height);
  const groupAt = rows(groupKeys.length, groupPitch, height);
  const industryAt = rows(industryKeys.length, industryPitch, height);
  const groupRows = new Map(groupKeys.map((key, at) => [key, groupAt[at]]));
  const industryRows = new Map(industryKeys.map((key, at) => [key, industryAt[at]]));

  // Lines: one per shared skill. Into a career they stack in the order of their groups' rows, so none crosses
  // another where it arrives; out of a group they stack in the order of the careers' rows.
  const lines: FlowLine[] = careers.flatMap((career, row) => {
    const ends = career.shared
      .filter((skill) => groupOf.has(skill))
      .map((skill) => ({ skill, group: groupOf.get(skill)! }))
      .sort((a, b) => groupRows.get(a.group)! - groupRows.get(b.group)! || order.get(a.skill)! - order.get(b.skill)!);
    const at = spread(ends.length, careerRows[row], FLOW.slot, FLOW.careerPitch - 12);
    return ends.map((end, index) => ({ career: career.id, group: end.group, skill: end.skill, from: 0, to: at[index] }));
  });
  for (const key of groupKeys) {
    const leaving = lines
      .filter((line) => line.group === key)
      .sort((a, b) => a.to - b.to);
    const at = spread(leaving.length, groupRows.get(key)!, FLOW.slot, groupPitch * 0.6);
    leaving.forEach((line, index) => (line.from = at[index]));
  }

  // Links: one per career and industry, stacked at both ends in the order of the other end's row.
  const links: FlowLink[] = careers.flatMap((career, row) => {
    const ends = industriesOf(career).sort((a, b) => industryRows.get(a)! - industryRows.get(b)!);
    const at = spread(ends.length, careerRows[row], FLOW.outSlot, FLOW.careerPitch - 16);
    return ends.map((industry, index) => ({ career: career.id, industry, from: at[index], to: 0 }));
  });
  for (const key of industryKeys) {
    const arriving = links.filter((link) => link.industry === key).sort((a, b) => a.from - b.from);
    const at = spread(arriving.length, industryRows.get(key)!, FLOW.outSlot, industryPitch * 0.6);
    arriving.forEach((link, index) => (link.to = at[index]));
  }

  return {
    height,
    groups: groupKeys.map((key) => {
      const group = named.get(key)!;
      return { key, name: group.name, skills: group.skills, lines: reaching.get(key)?.length ?? 0, y: groupRows.get(key)! };
    }),
    careers: careers.map((career, row) => ({ id: career.id, y: careerRows[row] })),
    industries: industryKeys.map((key) => ({ key, careers: typical.get(key)!.length, y: industryRows.get(key)! })),
    lines,
    links,
  };
}

/** A career's industries as the flow keys them: its own, else every industry when it is found in all. */
export function industriesOf(career: Pick<FlowCareer, 'industries' | 'everywhere'>): string[] {
  if (career.industries.length > 0) return [...career.industries];
  return career.everywhere ? [EVERY_INDUSTRY] : [];
}

/**
 * A line from one column to the next, as SVG path data: level where it leaves
 * and where it arrives, bending once between.
 */
export function curve(x0: number, y0: number, x1: number, y1: number): string {
  const mid = (x0 + x1) / 2;
  const round = (value: number) => Math.round(value * 10) / 10;
  return `M${round(x0)} ${round(y0)}C${round(mid)} ${round(y0)} ${round(mid)} ${round(y1)} ${round(x1)} ${round(y1)}`;
}
