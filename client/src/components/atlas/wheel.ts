import { EPS, FAMGAP, SIB, TAU, fieldTree, layOver, type AtlasModel, type LaidOver } from './model';
import { blendTo, disp as dispIn, freeze, sweep as sweepIn, tableFor, undisp, wrapPi, type Blend } from './lens';
import { EDGE, FT, FUNDAMENTALS, HEAD, RIM, RR, modeOf, phone, target, type Hit, type Mode, type Selection } from './camera';
import { fill as fillIn, pen as penIn, readInk, type Tone } from './ink';

/**
 * The Atlas's wheel: the canvas engine.
 *
 * The wheel is a display. It is drawn like an instrument: five rings, every
 * skill one fine line, words kept level and outside. Whatever is chosen is
 * named on the wheel in the list's own words, and every line joins the next.
 * It draws what it is told (`set`), says what the pointer is on (`onHover`)
 * and what was pressed (`onChoose`), and changes nothing by itself: the page
 * turns a choice into an address, and the address comes back as `set`.
 *
 * It owns its canvas, the listeners on its stage, its frames and its
 * observers (the stage's size, the theme, the typeface arriving), and
 * `destroy` removes all of them. It touches no other part of the page.
 */

/**
 * A career laid over the wheel, as indexes into the model's skills.
 * `have` is a military rating laid under it: what the rating lacks is drawn
 * dashed. `held` is a signed-in seeker's own skills: with no rating, a skill
 * of the career they hold is drawn bright in place of the accent.
 */
export interface Overlay {
  need: readonly number[];
  have: ReadonlySet<number> | null;
  held: ReadonlySet<number> | null;
}

/** A name as the wheel last drew it (for tests of what is named and how its line joins). */
export interface ShownName {
  kind: 'head' | 'group' | 'skill' | 'field';
  /** As drawn, cut short where there was no room. */
  text: string;
  full: string;
  on: boolean;
  x: number;
  y: number;
  h: number;
  /** The leader from the end of its line to the name: [x0, y0, x1, y1]. */
  lead: [number, number, number, number] | null;
  /** The skill it names, -1 for any other name. */
  s: number;
}

export interface WheelOptions {
  canvas: HTMLCanvasElement;
  /** The element the canvas fills: its size is the wheel's, and the pointer is read on it. */
  stage: HTMLElement;
  model: AtlasModel;
  /** A tap or click on the wheel or one of its names. */
  onChoose: (hit: Hit) => void;
  /** What the pointer is on (fine pointers only), or null when it leaves. */
  onHover: (hit: Hit | null) => void;
}

export interface Wheel {
  /** What is chosen and what is laid over it. The wheel turns to it, at once with `instant`. */
  set(selection: Selection, overlay: Overlay | null, opts?: { instant?: boolean }): void;
  /** What the list points at: a row under the pointer, or the row a phone's list has been scrolled to. */
  point(hit: Hit | null): void;
  /** Read the theme again and redraw. */
  retheme(): void;
  /** Measure the stage again and redraw. */
  resize(): void;
  destroy(): void;
  /** The names on the wheel now, after a fresh draw. */
  shown(): ShownName[];
  /** Where one skill's line is drawn now, from its ring to the end of its mark: [x0, y0, x1, y1]. */
  line(skill: number): [number, number, number, number];
  mode(): Mode;
  cam(): { cx: number; cy: number; R: number; core: number };
  size(): { W: number; H: number; dpr: number };
}

/** The single line (if any) that turns at one end of a group's bar. */
interface Turn {
  a: number;
  dir: number;
  k: 'in' | 'kid' | 'mark' | 'skill';
  id: number;
}
/** The part of a group's bar one layer draws. */
interface Part {
  a: number;
  b: number;
  ea: Turn | null;
  eb: Turn | null;
}
/** A rounded corner where a bar turns into a line: its radius, and which way the line leaves (out 1, in -1). */
interface Fillet {
  rho: number;
  dir: number;
}
/** A name to set beside the drawing. */
interface Name {
  /** The drawn angle of the thing it names; a name with none is a heading over the names after it. */
  p?: number;
  text: string;
  kind: ShownName['kind'];
  g?: number;
  f?: number;
  s?: number;
  on?: boolean;
  dim?: boolean;
  pointed?: boolean;
  want?: boolean;
  held?: boolean;
  inset?: number;
  color?: Tone;
}
/** Where the pointer finds a name. */
interface LabelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  g?: number;
  f?: number;
  s?: number;
}

const spread = (ls: { y: number; h: number }[], y0: number, y1: number): void => {
  for (let pass = 0; pass < 160; pass++) {
    let moved = false;
    for (let i = 1; i < ls.length; i++) {
      const need = (ls[i].h + ls[i - 1].h) / 2;
      const d = ls[i].y - ls[i - 1].y;
      if (d < need - 0.01) {
        const m = (need - d) / 2;
        ls[i - 1].y -= m;
        ls[i].y += m;
        moved = true;
      }
    }
    if (ls.length) {
      const a = ls[0];
      const z = ls[ls.length - 1];
      if (a.y < y0 + a.h / 2) {
        a.y = y0 + a.h / 2;
        moved = true;
      }
      if (z.y > y1 - z.h / 2) {
        z.y = y1 - z.h / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
};
const spaced = (c: CanvasRenderingContext2D, px: number): void => {
  if ('letterSpacing' in c) c.letterSpacing = px + 'px';
};
function fit(c: CanvasRenderingContext2D, text: string, room: number): string {
  if (c.measureText(text).width <= room) return text;
  let n = text.length;
  while (n > 4 && c.measureText(text.slice(0, n) + '…').width > room) n--;
  return text.slice(0, n).trimEnd() + '…';
}
const same = (a: Hit | null, b: Hit | null): boolean => (a ? [a.f, a.g, !!a.core].join() : '') === (b ? [b.f, b.g, !!b.core].join() : '');

export function createWheel({ canvas: cv, stage, model, onChoose, onHover }: WheelOptions): Wheel {
  const got = cv.getContext('2d');
  if (!got) throw new Error('The Atlas needs a canvas it can draw on.');
  const ctx: CanvasRenderingContext2D = got;
  const { G, S, N, kids, core: floors, coreIndex, rootOf, U, sp0, sp1, own0, own1, skillAng, skillGroup, lo, hi, node, fields } = model;
  const isFloor = (i: number): boolean => G[i].parent < 0;

  // ---- state ----------------------------------------------------------------------------------------------------
  // Open at most one of: the core (Fundamentals), or a field. A group may be chosen inside either, and a skill inside a group.
  const st: Selection & { hover: Hit | null; point: Hit | null } = { core: false, field: -1, group: -1, skill: -1, hover: null, point: null };
  let overlay: Overlay | null = null;
  const mode = (): Mode => modeOf(model, st);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let dead = false;

  // ---- the lens ---------------------------------------------------------------------------------------------------
  let cur = tableFor([], null);
  let blend: Blend | null = null;
  const disp = (x: number): number => dispIn(cur, blend, x);
  const sweep = (x0: number, x1: number): [number, number] => sweepIn(cur, blend, x0, x1);

  // ---- camera -----------------------------------------------------------------------------------------------------
  const cam = { cx: 0, cy: 0, R: 100 };
  let camA = { ...cam };
  let camB = { ...cam };
  // core: 0 the wheel, 1 the core's own view
  let core = 0;
  let coreA = 0;
  let coreB = 0;

  // ---- what is lit ------------------------------------------------------------------------------------------------
  let hot = new Uint8Array(N);
  let hotFull = new Uint8Array(N);
  let laid: LaidOver = layOver(model, null, null);
  let have: ReadonlySet<number> | null = null;
  // A seeker's own skills count only with no rating laid under the career: bright is the person, the accent is the career.
  let held: ReadonlySet<number> | null = null;
  function relight(): void {
    hot = new Uint8Array(N);
    hotFull = new Uint8Array(N);
    if (st.field >= 0) fieldTree(model, st.field, hot, hotFull);
    have = overlay ? overlay.have : null;
    held = overlay && !overlay.have ? overlay.held : null;
    laid = layOver(model, overlay ? overlay.need : null, have);
  }
  // The part of a group's bar one layer draws, and the single line (if any) that turns at each of its ends.
  function partsFor(on: Uint8Array, full: Uint8Array | null, skills: boolean): Map<number, Part> {
    const out = new Map<number, Part>();
    for (let i = 0; i < N; i++) {
      if (!on[i]) continue;
      const its: Turn[] = [];
      if (G[i].parent >= 0) its.push({ a: node[i], dir: -1, k: 'in', id: i });
      for (const c of kids[i]) if (on[c]) its.push({ a: node[c], dir: 1, k: 'kid', id: c });
      if (skills) {
        const e = laid.need.get(i);
        if (e) for (const s of e.all) its.push({ a: skillAng[s], dir: isFloor(i) ? -1 : 1, k: isFloor(i) ? 'mark' : 'skill', id: s });
      }
      let a: number;
      let b: number;
      if (full && full[i]) {
        a = lo[i];
        b = hi[i];
      } else {
        if (!its.length) continue;
        a = Math.min(...its.map((t) => t.a));
        b = Math.max(...its.map((t) => t.a));
      }
      const only = (x: number): Turn | null => {
        const m = its.filter((t) => Math.abs(t.a - x) < EPS);
        return m.length === 1 && b - a > EPS ? m[0] : null;
      };
      out.set(i, { a, b, ea: only(a), eb: only(b) });
    }
    return out;
  }

  /**
   * A control the page stands on the stage (the way back to the whole wheel, in its top corner) covers what is drawn
   * under it. Where it is, in the stage's own units, so that no name round a ring is set under it; null for none.
   */
  const covered = (): { x0: number; y0: number; x1: number; y1: number } | null => {
    const control = stage.querySelector('a, button');
    if (!control) return null;
    const s = stage.getBoundingClientRect();
    const b = control.getBoundingClientRect();
    return b.width > 0 && b.height > 0 ? { x0: b.left - s.left, y0: b.top - s.top, x1: b.right - s.left, y1: b.bottom - s.top } : null;
  };

  // ---- drawing ----------------------------------------------------------------------------------------------------
  let ink = readInk(floors.map((f) => G[f].slug));
  let labels: LabelBox[] = [];
  let shown: ShownName[] = [];
  // How far in the names were when the wheel was last drawn: 0 while a turn begins, 1 once it is over.
  let named = 1;
  function draw(): void {
    shown = [];
    labels = [];
    if (dead || !W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';
    const { cx, cy, R } = cam;
    const m = mode();
    const ph = phone(W, H);
    const open = m !== 'rest';
    const career = overlay !== null;
    const quiet = open || career;
    const { need, way, fields: careerFields } = laid;
    const X = (p: number, r: number): number => cx + r * Math.cos(p);
    const Y = (p: number, r: number): number => cy + r * Math.sin(p);
    const pt = st.point || st.hover;
    const ptF = pt ? pt.f : -1;
    const ptG = pt ? pt.g : -1;
    const ptCore = !!(pt && pt.core);
    const rOf = (i: number): number => RR[G[i].ring] * R;
    const radial = (p: number, r0: number, r1: number): void => {
      const c = Math.cos(p);
      const s = Math.sin(p);
      ctx.moveTo(cx + r0 * c, cy + r0 * s);
      ctx.lineTo(cx + r1 * c, cy + r1 * s);
    };
    const needed = (s: number): boolean => {
      const e = need.get(skillGroup[s]);
      return !!e && e.all.includes(s);
    };
    const e = blend ? blend.e : 1;
    const fade = Math.max(0, Math.min(1, (e - 0.55) / 0.45));
    named = fade;
    // Every colour is a tone on the layer being drawn: a token at its strength, times the layer's own alpha
    // (the wheel and the core's view cross-fade; the names fade in as a change ends).
    let layer = 1;
    const pen = (tone: Tone): void => penIn(ctx, tone, layer);
    const fill = (tone: Tone): void => fillIn(ctx, tone, layer);

    // ================= the wheel =================
    if (core < 0.999) {
      layer = 1 - core;
      const selG = st.group >= 0 && !isFloor(st.group) ? st.group : -1;
      const RHO = ph ? 4 : 5;
      const rhoFor = (r: number, arcPx: number, linePx: number): number => {
        const q = Math.min(RHO, arcPx * 0.5, linePx * 0.4, r * 0.3);
        return q < 0.9 ? 0 : q;
      };
      const lineLen = (t: Turn, i: number): number => (t.k === 'in' ? rOf(i) - rOf(G[i].parent) : t.k === 'kid' ? rOf(t.id) - rOf(i) : RIM * R - rOf(i));
      const piece = (r: number, a: number, b: number, fa: Fillet | null, fb: Fillet | null): void => {
        const [p0, p1] = sweep(a, b);
        const d0 = fa ? fa.rho / r : 0;
        const d1 = fb ? fb.rho / r : 0;
        if (fa) {
          ctx.moveTo(X(p0, r + fa.dir * fa.rho), Y(p0, r + fa.dir * fa.rho));
          ctx.arcTo(X(p0, r), Y(p0, r), X(p0 + d0, r), Y(p0 + d0, r), fa.rho);
        } else ctx.moveTo(X(p0, r), Y(p0, r));
        ctx.arc(cx, cy, r, p0 + d0, Math.max(p0 + d0, p1 - d1));
        if (fb) ctx.arcTo(X(p1, r), Y(p1, r), X(p1, r + fb.dir * fb.rho), Y(p1, r + fb.dir * fb.rho), fb.rho);
      };
      // a skill's line: from its group's ring to the rim and on through its mark, in one stroke; the core's are marks on the centre ring
      const skillLine = (s: number, trim = 0): void => {
        const g = skillGroup[s];
        const p = disp(skillAng[s]);
        if (isFloor(g)) radial(p, rOf(g) - trim, rOf(g) - FT * R);
        else radial(p, rOf(g) + trim, RIM * R);
      };
      const skillHead = (s: number): void => {
        if (!isFloor(skillGroup[s])) radial(disp(skillAng[s]), RIM * R - 0.5, (RIM + HEAD) * R);
      };
      // what the list points at, lit down to the core (only while nothing is open)
      let ptOn: Uint8Array | null = null;
      let ptFull: Uint8Array | null = null;
      if (!open && ptF >= 0 && ptG < 0) {
        ptOn = new Uint8Array(N);
        ptFull = new Uint8Array(N);
        fieldTree(model, ptF, ptOn, ptFull);
      }
      const lit = ptOn || hot;
      const litFull = ptFull || hotFull;
      const wayParts = career ? partsFor(way, null, true) : null;
      const hotParts = partsFor(lit, litFull, false);

      // 0. the five rings, whole
      ctx.beginPath();
      for (let k = 1; k <= 5; k++) {
        ctx.moveTo(cx + RR[k] * R, cy);
        ctx.arc(cx, cy, RR[k] * R, 0, TAU);
      }
      pen(ink.mix(quiet ? 0.12 : 0.17));
      ctx.lineWidth = 1;
      ctx.stroke();

      // 1. every skill: a fine line from its group's ring to the rim, ending in its mark
      const groupOpen = selG >= 0 && G[selG].field === st.field;
      const cls = (s: number): number => {
        const g = skillGroup[s];
        if (career && needed(s)) return have && !have.has(s) ? 3 : held && held.has(s) ? 7 : 2;
        if (g === selG || (g === ptG && open)) return 4;
        if (hot[g]) return groupOpen && hotFull[g] ? 6 : hotFull[g] || isFloor(g) ? 1 : 0;
        if (ptFull ? ptFull[g] : g === ptG || (ptCore && isFloor(g))) return 5;
        return 0;
      };
      const pitch = U * RIM * R;
      const wRay = Math.max(0.36, Math.min(0.6, pitch * 0.4));
      const styles: { ray: Tone | null; w: number; head: Tone; hw: number }[] = [
        { ray: ink.mix(quiet ? 0.15 : 0.3), w: wRay, head: ink.mix(quiet ? 0.42 : 0.74), hw: Math.max(0.5, Math.min(1, pitch * 0.5)) },
        { ray: ink.mix(0.42, ink.t1), w: 0.8, head: ink.mix(0.92, ink.t1), hw: 1.4 },
        { ray: null, w: 0, head: ink.ac, hw: 2.2 },
        { ray: null, w: 0, head: ink.ac, hw: 1.2 },
        { ray: ink.mix(0.8, ink.t1), w: 1, head: ink.t1, hw: 1.8 },
        { ray: ink.mix(0.36, ink.t1), w: Math.max(0.45, wRay), head: ink.mix(0.9, ink.t1), hw: Math.max(0.7, Math.min(1.2, pitch * 0.6)) },
        { ray: ink.mix(0.26, ink.t1), w: wRay, head: ink.mix(0.55, ink.t1), hw: Math.max(0.5, Math.min(1, pitch * 0.5)) },
        // a skill of the career the person holds: the career's own mark, bright in place of the accent
        { ray: null, w: 0, head: ink.t1, hw: 2.2 },
      ];
      const sc = new Uint8Array(S.length);
      for (let s = 0; s < S.length; s++) sc[s] = cls(s);
      // (stroked a group at a time: one path holding every line is far slower to paint at a phone's pixel density)
      const each = (c: number, mark: (s: number) => void, hued: boolean): void => {
        for (let i = 0; i < N; i++) {
          if (isFloor(i)) continue;
          let any = false;
          ctx.beginPath();
          for (const s of G[i].skills)
            if (sc[s] === c) {
              mark(s);
              any = true;
            }
          if (any) {
            if (hued) pen(ink.hue(coreIndex[rootOf[i]], true));
            ctx.stroke();
          }
        }
      };
      styles.forEach((z, c) => {
        if (z.ray) {
          pen(z.ray);
          ctx.lineWidth = z.w;
          each(c, skillLine, false);
        }
        pen(z.head);
        ctx.lineWidth = z.hw;
        each(c, skillHead, !quiet && c === 0);
      });
      for (const f of floors) {
        const g = G[f];
        const [q0, q1] = sweep(lo[f], hi[f]);
        const px = ((q1 - q0) * rOf(f)) / g.skills.length;
        for (const c of [0, 6, 5, 1, 4]) {
          const z = styles[c];
          let any = false;
          ctx.beginPath();
          for (const s of g.skills)
            if (sc[s] === c) {
              skillLine(s);
              any = true;
            }
          if (any) {
            pen(z.head);
            ctx.lineWidth = Math.max(0.3, Math.min(c ? 1.4 : 1, px * 0.42));
            ctx.stroke();
          }
        }
      }

      // 2. the tree: a group's bar on its ring and the line in from the group it builds on. Bars are always drawn
      //    whole, so nothing is left in pieces; a brighter layer is laid over a quieter one along the same path.
      //    Lines that a brighter layer draws are left out of the quieter one, so no stub shows beside a turn.
      // the career's turns, worked out first so the layers under it turn the same way
      const wayTop = new Map<number, number>();
      const wayLow = new Map<number, number>();
      const waySk = new Map<number, number>();
      const wayEnd = new Map<string, Fillet>();
      if (wayParts)
        for (const [i, p] of wayParts) {
          const r = rOf(i);
          const [q0, q1] = sweep(p.a, p.b);
          const arcPx = (q1 - q0) * r;
          const f = (t: Turn | null, end: 'a' | 'b'): void => {
            if (!t || t.k === 'mark') return;
            const rho = rhoFor(r, arcPx, lineLen(t, i));
            if (!rho) return;
            (t.k === 'in' ? wayTop : t.k === 'kid' ? wayLow : waySk).set(t.id, rho);
            wayEnd.set(i + ':' + end, { rho, dir: t.dir });
          };
          f(p.ea, 'a');
          f(p.eb, 'b');
        }
      pen(ink.mix(quiet ? 0.36 : 0.6));
      ctx.lineWidth = 1;
      for (let i = 0; i < N; i++) {
        ctx.beginPath();
        if (!litFull[i]) piece(rOf(i), lo[i], hi[i], null, null);
        if (G[i].parent >= 0 && !lit[i] && !(wayParts && way[i])) radial(disp(node[i]), rOf(G[i].parent), rOf(i));
        ctx.stroke();
      }
      if (hotParts.size) {
        const top = new Map<number, number>();
        const low = new Map<number, number>();
        ctx.beginPath();
        for (const [i, p] of hotParts) {
          const r = rOf(i);
          const w = wayParts ? wayParts.get(i) : undefined;
          let a = p.a;
          let b = p.b;
          let ea = p.ea;
          let eb = p.eb;
          if (w && litFull[i] && !isFloor(i)) {
            // with the career over this group: from the first to the last thing still drawn in this layer
            const own = G[i].skills.filter((s) => !needed(s)).map((s) => skillAng[s]);
            const pts: number[] = [];
            if (own.length) pts.push(own[0] - U / 2, own[own.length - 1] + U / 2);
            if (G[i].parent >= 0 && !way[i]) pts.push(node[i]);
            for (const c of kids[i]) if (lit[c] && !way[c]) pts.push(node[c]);
            a = Math.min(w.a, ...pts);
            b = Math.max(w.b, ...pts);
            if (Math.abs(a - p.a) > EPS) ea = null;
            if (Math.abs(b - p.b) > EPS) eb = null;
          }
          const [q0, q1] = sweep(a, b);
          const arcPx = (q1 - q0) * r;
          const f = (t: Turn | null, end: 'a' | 'b'): Fillet | null => {
            const x = end === 'a' ? a : b;
            // the career turns here: turn with it, and leave the line to it
            if (w && Math.abs((end === 'a' ? w.a : w.b) - x) < EPS) return wayEnd.get(i + ':' + end) || null;
            if (!t) return null;
            if (wayParts && (t.k === 'in' ? way[i] : way[t.id])) return null;
            const rho = rhoFor(r, arcPx, lineLen(t, i));
            if (!rho) return null;
            (t.k === 'in' ? top : low).set(t.id, rho);
            return { rho, dir: t.dir };
          };
          if (b - a > EPS) piece(r, a, b, f(ea, 'a'), f(eb, 'b'));
        }
        for (const i of hotParts.keys())
          if (G[i].parent >= 0 && !(wayParts && way[i])) radial(disp(node[i]), rOf(G[i].parent) + (low.get(i) || 0), rOf(i) - (top.get(i) || 0));
        pen(ink.mix(ptOn ? 0.7 : 0.88, ink.t1));
        ctx.lineWidth = ptOn ? 1.1 : 1.25;
        ctx.stroke();
      }
      // what is chosen or pointed at sits under the career's line, so that line is never interrupted
      const bar = (i: number, tone: Tone, w: number): void => {
        const [p0, p1] = isFloor(i) ? sweep(lo[i], hi[i]) : sweep(own0[i], own1[i]);
        ctx.beginPath();
        ctx.arc(cx, cy, rOf(i), p0, p1);
        pen(tone);
        ctx.lineWidth = w;
        ctx.stroke();
      };
      if (ptG >= 0 && ptG !== selG) bar(ptG, ink.mix(0.9, ink.t1), 1.6);
      if (selG >= 0) bar(selG, ink.t1, 2.4);
      if (wayParts) {
        ctx.lineCap = 'round';
        // the career's route: its groups' bars and the lines between them
        const route = (): void => {
          for (const [i, p] of wayParts) if (p.b - p.a > EPS) piece(rOf(i), p.a, p.b, wayEnd.get(i + ':a') || null, wayEnd.get(i + ':b') || null);
          for (const i of wayParts.keys()) if (G[i].parent >= 0) radial(disp(node[i]), rOf(G[i].parent) + (wayLow.get(i) || 0), rOf(i) - (wayTop.get(i) || 0));
        };
        ctx.beginPath();
        route();
        for (const en of need.values()) for (const s of en.all) if ((!have || have.has(s)) && !(held && held.has(s))) skillLine(s, waySk.get(s) || 0);
        pen(ink.ac);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // The skills of the career the person holds: their own lines, bright, at the career's width, along the
        // path the accent would have taken. Bright goes over the career's other lines (where the wheel is whole
        // they lie closer than they are wide, and what a person holds must not be lost under what they do not),
        // and the route is laid over their starts again, so it stays the accent and is never interrupted.
        if (held) {
          let any = false;
          ctx.beginPath();
          for (const en of need.values())
            for (const s of en.all)
              if (held.has(s)) {
                skillLine(s, waySk.get(s) || 0);
                any = true;
              }
          if (any) {
            pen(ink.t1);
            ctx.stroke();
            ctx.beginPath();
            route();
            pen(ink.ac);
            ctx.stroke();
          }
        }
        if (have) {
          ctx.beginPath();
          for (const en of need.values()) for (const s of en.all) if (!have.has(s)) skillLine(s, (waySk.get(s) || 0) + 2);
          ctx.setLineDash([2.5, 3.5]);
          ctx.lineWidth = 1.2;
          ctx.lineCap = 'butt';
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.lineCap = 'butt';
      }
      if (st.skill >= 0 && !isFloor(skillGroup[st.skill])) {
        ctx.beginPath();
        radial(disp(skillAng[st.skill]), rOf(skillGroup[st.skill]), (RIM + HEAD) * R);
        pen(ink.t1);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 3. the centre pin, each core group's bar in its colour, and one arc a field outside the rim
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.6, R * 0.009), 0, TAU);
      fill(ink.mix(quiet ? 0.5 : 0.8));
      ctx.fill();
      if (!quiet)
        floors.forEach((f, k) => {
          if (lit[f]) return;
          const [p0, p1] = sweep(lo[f], hi[f]);
          ctx.beginPath();
          ctx.arc(cx, cy, rOf(f), p0, p1);
          pen(ptCore || ptG === f ? ink.t1 : ink.hue(k));
          ctx.lineWidth = 1.6;
          ctx.stroke();
        });
      const touched = new Set(careerFields.map((c) => c.f));
      fields.forEach((x, f) => {
        const on = f === st.field;
        const pointed = f === ptF;
        const plain = on || pointed || touched.has(f) || quiet;
        // plain: the field's one arc; otherwise a piece for each core group it stands on, in that group's hue
        const parts: { a0: number; a1: number; k?: number }[] = plain ? [x] : x.parts;
        for (const part of parts) {
          const [p0, p1] = sweep(part.a0, part.a1);
          ctx.beginPath();
          ctx.arc(cx, cy, EDGE * R, p0, p1);
          pen(on || pointed ? ink.t1 : touched.has(f) ? ink.ac : plain ? ink.mix(quiet ? 0.36 : 0.56) : ink.hue(part.k ?? -1));
          ctx.lineWidth = on ? 2 : pointed ? 1.8 : plain ? 1.25 : 1.6;
          ctx.stroke();
        }
      });
      layer = 1;
    }

    // ================= the core's own view: the centre ring and the second, and nothing beyond =================
    if (core > 0.001) {
      layer = core;
      const r1 = RR[1] * R;
      const r2 = RR[2] * R;
      const selC = m === 'coreGroup' ? st.group : -1;
      const head = Math.max(3, (r2 - r1) * 0.1);
      ctx.beginPath();
      ctx.moveTo(cx + r2, cy);
      ctx.arc(cx, cy, r2, 0, TAU);
      pen(ink.mix(0.2));
      ctx.lineWidth = 1;
      ctx.stroke();
      floors.forEach((f, k) => {
        const g = G[f];
        const sel = f === selC;
        const off = selC >= 0 && !sel;
        const pointed = f === ptG;
        const [p0, p1] = sweep(lo[f], hi[f]);
        ctx.beginPath();
        ctx.arc(cx, cy, r1, p0, p1);
        pen(sel || pointed ? ink.t1 : ink.hue(k));
        ctx.lineWidth = sel ? 2.4 : 1.8;
        ctx.stroke();
        // each skill: one line from the centre ring to the second, ending in its mark
        // (plain; the career's; the career's that the rating lacks; the career's that the person holds)
        const kinds: number[][] = [[], [], [], []];
        for (const s of g.skills) kinds[career && needed(s) ? (have && !have.has(s) ? 2 : held && held.has(s) ? 3 : 1) : 0].push(s);
        const lines = (list: number[], tone: Tone, w: number, dash?: number[]): void => {
          if (!list.length) return;
          ctx.beginPath();
          for (const s of list) radial(disp(skillAng[s]), r1, r2);
          ctx.setLineDash(dash || []);
          pen(tone);
          ctx.lineWidth = w;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          for (const s of list) radial(disp(skillAng[s]), r2 - head, r2);
          ctx.lineWidth = w + 0.9;
          ctx.stroke();
        };
        lines(kinds[0], sel || pointed ? ink.mix(0.9, ink.t1) : ink.mix(off ? 0.34 : 0.62, ink.t1), sel ? 1.2 : 1);
        lines(kinds[1], ink.ac, 1.6);
        lines(kinds[2], ink.ac, 1.2, [2.5, 3.5]);
        lines(kinds[3], ink.t1, 1.6);
      });
      if (st.skill >= 0 && isFloor(skillGroup[st.skill])) {
        ctx.beginPath();
        radial(disp(skillAng[st.skill]), r1, r2);
        pen(ink.t1);
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1.6, r1 * 0.04), 0, TAU);
      fill(ink.mix(0.6));
      ctx.fill();
      layer = 1;
    }
    ctx.globalAlpha = 1;

    // ================= names: level, outside the drawing, in the list's own words =================
    const size = ph ? 11 : 12.5;
    const line = size + 3.5;
    // one column beside the drawing: what is open as its heading, then each thing in it against its own line.
    // `from` is where a thing's line ends, so the leader to its name starts exactly there and nothing is left open.
    const column = (names: Name[], from: number, ro: number): void => {
      const ls = names.filter((l) => l.p === undefined || Math.cos(l.p) > 0.15).map((l) => ({ ...l, h: line, y: 0, x: 0 }));
      const room = H - 18;
      while (ls.length * line > room) {
        const far = ls.map((l, i) => (l.kind === 'group' && !l.on ? i : -1)).filter((i) => i >= 0);
        if (!far.length) break;
        const sel = Math.max(
          0,
          ls.findIndex((l) => l.on),
        );
        far.sort((a, b) => Math.abs(b - sel) - Math.abs(a - sel));
        ls.splice(far[0], 1);
      }
      if (ls.length * line > room) for (const l of ls) l.h = Math.max(10.5, room / ls.length);
      ls.forEach((l) => {
        if (l.p !== undefined) l.y = Y(l.p, ro);
      });
      ls.forEach((l, i) => {
        if (l.p === undefined) {
          const nx = ls.slice(i + 1).find((q) => q.p !== undefined);
          l.y = (nx ? nx.y : cy) - l.h * (l.kind === 'head' ? 1.35 : 1.05);
        }
      });
      for (let i = 1; i < ls.length; i++) if (ls[i].y < ls[i - 1].y) ls[i].y = ls[i - 1].y + 0.01;
      spread(ls, 9, H - 7);
      const xAt = (l: (typeof ls)[number]): number => {
        const dy = l.y - cy;
        const edge = Math.abs(dy) < ro ? Math.sqrt(ro * ro - dy * dy) : 0;
        return cx + Math.max(l.p !== undefined ? ro * Math.cos(l.p) : 0, edge) + 7 + (l.inset || 0);
      };
      ls.forEach((l) => {
        if (l.p !== undefined) l.x = xAt(l);
      });
      ls.forEach((l, i) => {
        if (l.p === undefined) {
          const nx = ls.slice(i + 1).find((q) => q.p !== undefined);
          l.x = Math.max(xAt(l), nx ? nx.x - (nx.inset || 0) : 0);
        }
      });
      layer = fade;
      ctx.textAlign = 'left';
      for (const l of ls) {
        let lead: ShownName['lead'] = null;
        if (l.p !== undefined) {
          const x0 = X(l.p, from);
          const y0 = Y(l.p, from);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(l.x - 4, l.y);
          // a leader carries its line on to the name, so it is its line's colour: bright for a skill the person holds
          pen(l.on || l.held ? ink.t1 : l.want ? ink.ac : l.kind === 'skill' ? ink.mix(0.6, ink.t1) : ink.mix(0.5));
          ctx.lineWidth = l.on ? 1.6 : 1;
          ctx.stroke();
          lead = [x0, y0, l.x - 4, l.y];
        }
        const caps = l.kind === 'head';
        ctx.font = `${caps || l.on ? 600 : 400} ${caps ? size + 1 : size}px ${ink.font}`;
        spaced(ctx, caps ? 0.8 : 0);
        fill(caps || l.on || l.pointed ? ink.t1 : l.kind === 'skill' ? (l.want ? ink.t1 : ink.mix(0.74, ink.t1)) : l.dim ? ink.t3 : ink.mix(0.82, ink.t1));
        const text = fit(ctx, l.text, W - l.x - 6);
        ctx.fillText(text, l.x, l.y);
        shown.push({ kind: l.kind, text, full: l.text, on: !!l.on, x: Math.round(l.x), y: Math.round(l.y * 10) / 10, h: l.h, lead, s: l.s ?? -1 });
        if (!caps) labels.push({ x0: l.x - 4, y0: l.y - l.h / 2, x1: l.x + ctx.measureText(text).width + 6, y1: l.y + l.h / 2, g: l.g, f: l.f, s: l.s });
      }
      spaced(ctx, 0);
      layer = 1;
      ctx.globalAlpha = 1;
    };
    // names set round a ring, each level on a short leader: the fields round the wheel, the twelve round the core
    const around = (items: (Name & { p: number })[], from: number, ro: number, sz: number, caps: boolean): void => {
      ctx.font = `500 ${sz}px ${ink.font}`;
      spaced(ctx, caps ? 0.7 : 0);
      const keep = covered();
      for (const right of [true, false]) {
        const ls = items
          .filter((l) => (Math.cos(l.p) >= 0) === right)
          .map((l) => {
            const room = (right ? W - cx : cx) - ro * Math.abs(Math.cos(l.p)) - 16;
            let lines = [l.text];
            if (!caps && ctx.measureText(l.text).width > room && l.text.includes(' ')) {
              const w = l.text.split(' ');
              let best = 1;
              let bd = 1e9;
              for (let i = 1; i < w.length; i++) {
                const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length);
                if (d < bd) {
                  bd = d;
                  best = i;
                }
              }
              lines = [w.slice(0, best).join(' '), w.slice(best).join(' ')];
            }
            return { ...l, lines, y: cy + ro * Math.sin(l.p), h: lines.length * (sz + 2) + 3 };
          })
          .sort((a, b) => a.y - b.y);
        const xOf = (l: (typeof ls)[number]): number => {
          const dy = l.y - cy;
          const edge = Math.abs(dy) < ro ? Math.sqrt(ro * ro - dy * dy) : 0;
          const dx = Math.max(Math.abs(ro * Math.cos(l.p)), edge) + 9;
          return cx + (right ? dx : -dx);
        };
        spread(ls, 6, H - 6);
        // a name that would lie under the control in the stage's top corner: this side's names start below it
        if (
          keep &&
          ls.some((l) => {
            const tx = xOf(l);
            const w = Math.max(...l.lines.map((t) => ctx.measureText(t).width));
            return (right ? tx + w + 4 : tx + 4) > keep.x0 && (right ? tx - 4 : tx - w - 4) < keep.x1 && l.y + l.h / 2 > keep.y0 && l.y - l.h / 2 < keep.y1;
          })
        )
          spread(ls, keep.y1 + 2, H - 6);
        for (const l of ls) {
          const tx = xOf(l);
          const x0 = X(l.p, from);
          const y0 = Y(l.p, from);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(tx + (right ? -4 : 4), l.y);
          pen(l.on ? ink.t1 : ink.mix(0.5));
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.textAlign = right ? 'left' : 'right';
          fill(l.on ? ink.t1 : l.color || ink.t2);
          let w = 0;
          l.lines.forEach((t, i) => {
            const yy = l.y + (i - (l.lines.length - 1) / 2) * (sz + 2);
            ctx.fillText(t, tx, yy);
            w = Math.max(w, ctx.measureText(t).width);
          });
          shown.push({ kind: l.kind, text: l.lines.join(' '), full: l.text, on: !!l.on, x: Math.round(tx), y: Math.round(l.y * 10) / 10, h: l.h, lead: [x0, y0, tx + (right ? -4 : 4), l.y], s: -1 });
          labels.push({ x0: right ? tx - 4 : tx - w - 4, y0: l.y - l.h / 2, x1: right ? tx + w + 4 : tx + 4, y1: l.y + l.h / 2, f: l.f, g: l.g });
        }
      }
      spaced(ctx, 0);
      ctx.textAlign = 'left';
    };
    const P = (a: number): number => wrapPi(disp(a));
    if (m === 'field') {
      const x = fields[st.field];
      const g = st.group;
      const inside = g >= 0 && G[g].field === st.field;
      const en = inside ? need.get(g) : null;
      const ls: Name[] = [{ text: x.name.toUpperCase(), kind: 'head' }];
      for (const i of x.groups) {
        if (i !== g) {
          ls.push({ p: P((own0[i] + own1[i]) / 2), text: G[i].name, kind: 'group', g: i, dim: inside || (career && !way[i]), pointed: i === ptG });
          continue;
        }
        ls.push({ text: G[i].name, kind: 'group', g: i, on: st.skill < 0 });
        for (const s of G[i].skills) {
          const want = !!(en && en.all.includes(s));
          ls.push({ p: P(skillAng[s]), text: S[s].name, kind: 'skill', s, on: s === st.skill, want, held: want && !!held && held.has(s), inset: 9 });
        }
      }
      column(ls, (RIM + HEAD) * R, (EDGE + 0.028) * R);
    } else if (m === 'coreGroup') {
      const g = st.group;
      const en = need.get(g);
      const r2 = RR[2] * R;
      const ls: Name[] = [{ text: G[g].name.toUpperCase(), kind: 'head' }];
      for (const s of G[g].skills) {
        const want = !!(en && en.all.includes(s));
        ls.push({ p: P(skillAng[s]), text: S[s].name, kind: 'skill', s, on: s === st.skill, want, held: want && !!held && held.has(s) });
      }
      column(ls, r2, r2 + 13);
    } else if (m === 'core') {
      const r2 = RR[2] * R;
      layer = fade;
      around(
        floors.map((f) => ({ p: P((lo[f] + hi[f]) / 2), text: G[f].name, kind: 'group' as const, g: f, on: f === ptG, color: ink.mix(0.86, ink.t1) })),
        r2,
        r2 + 11,
        size,
        false,
      );
      layer = 1;
      ctx.globalAlpha = 1;
    } else if (!ph) {
      layer = blend ? fade : 1;
      const touched = new Set(careerFields.map((c) => c.f));
      around(
        fields.map((x, f) => ({ p: P(x.mid), text: x.name.toUpperCase(), kind: 'field' as const, f, on: f === ptF, color: touched.has(f) ? ink.t1 : ink.t2 })),
        (EDGE + 0.012) * R,
        (EDGE + 0.03) * R,
        11,
        true,
      );
      layer = 1;
      ctx.globalAlpha = 1;
    } else if (pt && (ptF >= 0 || ptG >= 0 || ptCore)) {
      // a phone at rest: what the list is on, named in the corner the wheel leaves free
      const name = ptCore ? FUNDAMENTALS : ptG >= 0 ? G[ptG].name : fields[ptF].name;
      ctx.textAlign = 'left';
      spaced(ctx, 0.8);
      ctx.font = `500 11px ${ink.font}`;
      fill(ink.t1);
      ctx.fillText(name.toUpperCase(), 12, 16);
      spaced(ctx, 0);
    }
  }

  // ---- motion -----------------------------------------------------------------------------------------------------
  let raf = 0;
  let t0 = 0;
  let dur = 0;
  function frame(now: number): void {
    raf = 0;
    if (blend) {
      const t = Math.min(1, (now - t0) / dur);
      blend.e = 1 - Math.pow(1 - t, 3);
      const e = blend.e;
      cam.cx = camA.cx + (camB.cx - camA.cx) * e;
      cam.cy = camA.cy + (camB.cy - camA.cy) * e;
      cam.R = camA.R + (camB.R - camA.R) * e;
      core = coreA + (coreB - coreA) * e;
      draw();
      if (t >= 1) {
        cur = blend.b;
        blend = null;
        core = coreB;
        draw();
      } else ask();
    } else draw();
  }
  const ask = (): void => {
    if (!raf && !dead) raf = requestAnimationFrame(frame);
  };
  function retarget(instant?: boolean): void {
    const T = target(model, st, W, H);
    // freeze where everything is now, then head for the new table
    const now = freeze(cur, blend);
    const next = tableFor(T.segs, T.mid);
    camA = { ...cam };
    camB = { cx: T.cx, cy: T.cy, R: T.R };
    coreA = core;
    coreB = T.core;
    if (instant || reduce) {
      cur = next;
      blend = null;
      Object.assign(cam, camB);
      core = coreB;
      ask();
      return;
    }
    // the anchor travels the short way to its place; everything else keeps its place relative to it
    blend = blendTo(now, next);
    t0 = performance.now();
    dur = 620;
    ask();
  }
  const setHover = (h: Hit | null): void => {
    st.hover = h;
    stage.style.cursor = h ? 'pointer' : 'default';
    onHover(h);
  };

  // ---- pointer: a tap or click opens what is under it (a drag does nothing and moves nothing) ---------------------
  function probe(e: MouseEvent, finger: boolean): Hit | null {
    const b = stage.getBoundingClientRect();
    const x = e.clientX - b.left;
    const y = e.clientY - b.top;
    const m = mode();
    // While the wheel turns it is read where it is drawn at this moment, and a name counts once it can be seen.
    const names = blend && named < 0.5 ? [] : labels;
    const table = blend ? freeze(cur, blend) : cur;
    // a finger is blunt: among the names it takes the nearest line, on the wheel a whole field or group
    const lab = finger
      ? names
          .filter((l) => x >= l.x0 - 12 && x <= l.x1 + 12 && Math.abs(y - (l.y0 + l.y1) / 2) < 16)
          .sort((p, q) => Math.abs(y - (p.y0 + p.y1) / 2) - Math.abs(y - (q.y0 + q.y1) / 2))[0]
      : names.find((l) => x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1);
    if (lab) {
      const g = lab.s !== undefined ? skillGroup[lab.s] : (lab.g ?? -1);
      return { f: lab.f ?? (g >= 0 ? G[g].field : -1), g, s: lab.s ?? -1 };
    }
    const dx = x - cam.cx;
    const dy = y - cam.cy;
    const r = Math.hypot(dx, dy);
    const rho = r / cam.R;
    const th = undisp(table, Math.atan2(dy, dx));
    const fam = floors.find((f) => th >= sp0[f] - FAMGAP * U * 0.5 && th <= sp1[f] + FAMGAP * U * 0.5);
    if (m === 'core' || m === 'coreGroup') {
      if (fam === undefined || rho > RR[2] + 0.03 || rho < RR[1] - 0.05) return null;
      return { f: -1, g: fam, s: -1 };
    }
    if (rho > EDGE + 0.03) return null;
    // the centre: the core
    if (rho < RR[2] - 0.035) return finger || fam === undefined ? { f: -1, g: -1, s: -1, core: true } : { f: -1, g: fam, s: -1 };
    if (fam === undefined) return null;
    let g = fam;
    for (;;) {
      const c = kids[g].find((k) => th >= sp0[k] - SIB * U * 0.5 && th <= sp1[k] + SIB * U * 0.5 && RR[G[k].ring] <= rho + 0.04);
      if (c === undefined) break;
      g = c;
    }
    if (isFloor(g)) return null;
    if (finger) return G[g].field === st.field ? { f: G[g].field, g, s: -1 } : { f: G[g].field, g: -1, s: -1 };
    const s = th >= own0[g] && th <= own1[g] && rho >= RR[G[g].ring] - 0.02 ? G[g].skills[Math.min(G[g].skills.length - 1, Math.floor((th - own0[g]) / U))] : -1;
    return { f: G[g].field, g, s };
  }
  const onMove = (e: PointerEvent): void => {
    if (blend || e.pointerType === 'touch') return;
    const h = probe(e, false);
    if (JSON.stringify(h) !== JSON.stringify(st.hover)) {
      setHover(h);
      ask();
    }
  };
  const onLeave = (): void => {
    if (st.hover) {
      setHover(null);
      ask();
    }
  };
  // A press is never lost: one made while the wheel turns is read where the wheel is at that moment, and the turn
  // then heads for what was pressed (`set` starts from where everything stands).
  const onClick = (e: MouseEvent): void => {
    if (e.target instanceof Element && e.target.closest('button, a')) return;
    const h = probe(e, !fine);
    if (!h) return;
    if (st.hover) {
      setHover(null);
      ask();
    }
    onChoose(h);
  };
  if (fine) {
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerleave', onLeave);
  }
  stage.addEventListener('click', onClick);

  // ---- start ------------------------------------------------------------------------------------------------------
  function resize(): void {
    if (dead) return;
    const b = stage.getBoundingClientRect();
    if (!b.width || !b.height) return;
    W = b.width;
    H = b.height;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    retarget(true);
    draw();
  }
  const sized = new ResizeObserver(resize);
  sized.observe(stage);
  const retheme = (): void => {
    if (dead) return;
    ink = readInk(floors.map((f) => G[f].slug));
    ask();
  };
  const themed = new MutationObserver(retheme);
  themed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // The typeface never holds the wheel up: when it arrives the names are set again in it.
  const fonts: FontFaceSet | undefined = document.fonts;
  if (fonts) {
    if (fonts.addEventListener) fonts.addEventListener('loadingdone', retheme);
    if (fonts.ready) void fonts.ready.then(retheme);
  }
  relight();
  resize();

  const inRange = (i: number, n: number): number => (Number.isInteger(i) && i >= 0 && i < n ? i : -1);
  return {
    set(selection, next, opts = {}) {
      if (dead) return;
      const to: Selection = { core: !!selection.core, field: inRange(selection.field, fields.length), group: inRange(selection.group, N), skill: inRange(selection.skill, S.length) };
      const moved = to.core !== st.core || to.field !== st.field || to.group !== st.group || to.skill !== st.skill;
      Object.assign(st, to);
      // what the list pointed at belonged to the selection that has just gone
      if (moved) st.point = null;
      overlay = next;
      relight();
      // Before the stage has a size there is nothing to turn: the first measure takes the wheel straight there.
      // With nothing chosen anew (a mark set, a career laid over) the wheel stands where it is and is drawn again.
      if (W && H && (moved || opts.instant)) retarget(opts.instant);
      else ask();
    },
    point(p) {
      if (dead || same(st.point, p)) return;
      st.point = p;
      ask();
    },
    retheme,
    resize,
    destroy() {
      if (dead) return;
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      sized.disconnect();
      themed.disconnect();
      if (fonts && fonts.removeEventListener) fonts.removeEventListener('loadingdone', retheme);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      stage.removeEventListener('click', onClick);
      stage.style.cursor = '';
    },
    shown() {
      draw();
      return shown;
    },
    line(s) {
      const g = skillGroup[s];
      const p = disp(skillAng[s]);
      const inCore = core > 0.5;
      const r0 = (inCore ? RR[1] : RR[G[g].ring]) * cam.R;
      const r1 = (inCore ? RR[2] : RIM + HEAD) * cam.R;
      return [cam.cx + r0 * Math.cos(p), cam.cy + r0 * Math.sin(p), cam.cx + r1 * Math.cos(p), cam.cy + r1 * Math.sin(p)];
    },
    mode,
    cam: () => ({ ...cam, core }),
    size: () => ({ W, H, dpr }),
  };
}
