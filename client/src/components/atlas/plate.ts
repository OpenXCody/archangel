import { FT, HEAD, RIM, RR } from './camera';
import { isCore, layOver, type AtlasModel } from './model';

/**
 * A career as the wheel at rest draws its route, for a plate the size of a
 * thumb (GoalPlate). Pure: no DOM, no React.
 *
 * The route of some skills is everything between them and the centre ring:
 * each skill's line from its group's ring to the rim and on through its mark
 * (a core group's skills are marks on the centre ring, drawn inward); each
 * group's bar on its ring, from the first to the last line that meets it; and
 * the spoke in from the group it is built on. Every piece ends on another, so
 * the route is unbroken from the centre ring out. The joins are square: at
 * this size a rounded corner is not seen.
 *
 * The plate is the wheel at rest: nothing is opened, so the lens turns every
 * true angle by the same quarter turn and the wheel's own start stands at
 * twelve o'clock (lens.ts), going round clockwise.
 */

/** Where the wheel at rest draws the true angle 0: twelve o'clock. */
const START = -Math.PI / 2;

const n = (value: number): string => (Math.round(value * 100) / 100).toString();

/** One SVG path for the route of `skills` (indexes into the model's), on a plate whose radius is `scale`. Empty for none. */
export function routePath(model: AtlasModel, skills: readonly number[], scale: number): string {
  const { G, N, kids, node, skillAng } = model;
  const laid = layOver(model, skills, null);
  const at = (angle: number, r: number): string => `${n(Math.cos(angle + START) * r * scale)} ${n(Math.sin(angle + START) * r * scale)}`;
  let d = '';
  const radial = (angle: number, r0: number, r1: number): void => {
    d += `M${at(angle, r0)}L${at(angle, r1)}`;
  };
  for (let i = 0; i < N; i++) {
    if (!laid.way[i]) continue;
    const r = RR[G[i].ring];
    const core = isCore(model, i);
    // Everything that meets this group's bar: the spoke in, the spokes out, its own skills' lines.
    const meets: number[] = [];
    if (!core) {
      meets.push(node[i]);
      radial(node[i], RR[G[G[i].parent].ring], r);
    }
    for (const c of kids[i]) if (laid.way[c]) meets.push(node[c]);
    for (const s of laid.need.get(i)?.all ?? []) {
      meets.push(skillAng[s]);
      if (core) radial(skillAng[s], r, r - FT);
      else radial(skillAng[s], r, RIM + HEAD);
    }
    const a = Math.min(...meets);
    const b = Math.max(...meets);
    if (b - a > 1e-7) d += `M${at(a, r)}A${n(r * scale)} ${n(r * scale)} 0 ${b - a > Math.PI ? 1 : 0} 1 ${at(b, r)}`;
  }
  return d;
}

/** The five rings, as radii on a plate whose radius is `scale`. */
export const ringRadii = (scale: number): number[] => RR.slice(1).map((r) => r * scale);

/** Half the side of the square a plate of radius `scale` is drawn in: out to the end of a skill's mark, and a little air. */
export const plateBox = (scale: number): number => (RIM + HEAD) * scale + 2;
