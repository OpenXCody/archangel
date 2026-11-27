import { TAU } from './model';

/**
 * The Atlas's lens: a table of where each true angle of the wheel is drawn.
 *
 * Some spans of the wheel are opened wider (each by its own factor) and the
 * rest closes up a little, so the wheel stays one whole turn. `mid` names the
 * stretch that is turned to three o'clock. A table keeps every state a
 * one-to-one turn of the wheel, so the change between two states is a blend
 * of two tables and nothing ever crosses.
 *
 * Pure: no DOM. A drawn angle is in radians, 0 at three o'clock, growing
 * clockwise on the screen (the canvas's own sense).
 */

export const PI = Math.PI;
/** How many steps a table cuts the turn into. */
export const K = 4096;

/** A span of true angle opened by a factor: [from, to, factor]. */
export type Seg = readonly [a0: number, a1: number, m: number];
/** The stretch turned to three o'clock: [from, to], or nothing (the wheel's own start then stands at twelve o'clock). */
export type Mid = readonly [a0: number, a1: number] | null;

export const wrapPi = (d: number): number => {
  d = (d + PI) % TAU;
  if (d < 0) d += TAU;
  return d - PI;
};
export const norm = (a: number): number => {
  a %= TAU;
  return a < 0 ? a + TAU : a;
};

/** The table for a set of opened spans (in order round the wheel, none overlapping) and the stretch turned to three o'clock. */
export function tableFor(segs: readonly Seg[], mid: Mid): Float64Array {
  const t = new Float64Array(K + 1);
  let used = 0;
  let wide = 0;
  for (const [a0, a1, m] of segs) {
    used += (a1 - a0) * m;
    wide += a1 - a0;
  }
  const mOut = segs.length ? Math.max(0.05, (TAU - used) / (TAU - wide)) : 1;
  const cum = (x: number): number => {
    let c = 0;
    let from = 0;
    for (const [a0, a1, m] of segs) {
      if (x <= a0) return c + (x - from) * mOut;
      c += (a0 - from) * mOut;
      if (x <= a1) return c + (x - a0) * m;
      c += (a1 - a0) * m;
      from = a1;
    }
    return c + (x - from) * mOut;
  };
  const base = mid ? (cum(mid[0]) + cum(mid[1])) / 2 : PI / 2;
  for (let k = 0; k <= K; k++) t[k] = cum((k / K) * TAU) - base;
  return t;
}

/** Where a table draws the true angle x. */
export const at = (t: Float64Array, x: number): number => {
  const v = (norm(x) / TAU) * K;
  const k = Math.floor(v);
  const f = v - k;
  return t[k] + (t[Math.min(K, k + 1)] - t[k]) * f;
};

/** Two tables on the way from one to the other. */
export interface Blend {
  a: Float64Array;
  b: Float64Array;
  /** The true angle that travels the short way to its place; everything else keeps its place relative to it. */
  anchor: number;
  a0: number;
  b0: number;
  pA: number;
  dp: number;
  /** How far along: 0 at `a`, 1 at `b`. */
  e: number;
}

/** Where the true angle x is drawn now: by the table, or part way between two. */
export function disp(cur: Float64Array, blend: Blend | null, x: number): number {
  if (!blend) return at(cur, x);
  const d = wrapPi(x - blend.anchor);
  const ua = at(blend.a, x) - blend.a0;
  const ub = at(blend.b, x) - blend.b0;
  // each side of the anchor is measured its own way round, so nothing crosses it
  const fa = d >= 0 ? norm(ua) : -norm(-ua);
  const fb = d >= 0 ? norm(ub) : -norm(-ub);
  return blend.pA + blend.dp * blend.e + fa * (1 - blend.e) + fb * blend.e;
}

/** The drawn span of the true span from x0 to x1, the second angle never behind the first. */
export function sweep(cur: Float64Array, blend: Blend | null, x0: number, x1: number): [number, number] {
  const p0 = disp(cur, blend, x0);
  return [p0, p0 + norm(disp(cur, blend, x1) - p0)];
}

/** The true angle a table draws nearest to the drawn angle phi. */
export function undisp(t: Float64Array, phi: number): number {
  let best = 0;
  let bd = 9;
  for (let k = 0; k < K; k++) {
    const d = Math.abs(wrapPi(t[k] - phi));
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return (best / K) * TAU;
}

/** Where everything is drawn at this moment, as a table of its own: the start of the next change. */
export function freeze(cur: Float64Array, blend: Blend | null): Float64Array {
  const now = new Float64Array(K + 1);
  for (let k = 0; k <= K; k++) now[k] = disp(cur, blend, (k / K) * TAU);
  for (let k = 1; k <= K; k++) {
    let n = 0;
    while (now[k] < now[k - 1] - 1e-9 && n++ < 4) now[k] += TAU;
  }
  return now;
}

/**
 * The change from where everything is now to the next table. The anchor is
 * what the next table draws at three o'clock: it travels the short way to its
 * place, and everything else keeps its place relative to it.
 */
export function blendTo(now: Float64Array, next: Float64Array): Blend {
  const keep = undisp(next, 0);
  const pA = at(now, keep);
  const b0 = at(next, keep);
  return { a: now, b: next, anchor: keep, a0: pA, b0, pA, dp: wrapPi(b0 - pA), e: 0 };
}
