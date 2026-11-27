import { EPS, TAU, isCore, type AtlasModel } from './model';
import type { Mid, Seg } from './lens';

/**
 * The Atlas's camera: the plate's measures, and where the wheel stands for
 * what is chosen. Pure: no DOM.
 *
 * The plate's measures are parts of its radius. Five rings; a skill runs from
 * its group's ring to RIM and ends in a mark; one arc a field at EDGE; names
 * past 1. In the core's own view only the first two rings are drawn, and the
 * core's skills are lines from the first to the second.
 */
export const RR = [0, 0.15, 0.31, 0.47, 0.62, 0.76] as const;
export const RIM = 0.9;
export const HEAD = 0.03;
export const EDGE = 0.962;
export const FT = 0.046;
export const CORE = RR[1] / RR[2];
/** Air between two of the twelve in the core's own view, in steps of one line. */
export const AIR = 0.7;

/**
 * What is chosen. Open at most one of: the core (Fundamentals), or a field.
 * A group may be chosen inside either, and a skill inside a group. Indexes
 * into the model, -1 for none.
 */
export interface Selection {
  core: boolean;
  field: number;
  group: number;
  skill: number;
}

/** What is under the pointer, or what the list points at: a field, a group, a skill (indexes, -1 for none), or the core as a whole. */
export interface Hit {
  f: number;
  g: number;
  s: number;
  core?: boolean;
}

export type Mode = 'rest' | 'core' | 'coreGroup' | 'field';

/** The word for the centre, the twelve core groups together, wherever it is said: on the wheel, in the list, beside the pointer. */
export const FUNDAMENTALS = 'Fundamentals';

/**
 * What a hit is, in the list's own words: where it lies (its field, or Fundamentals for the core and its groups),
 * its group and its skill, each '' when the hit does not name one. What the pointer is on is said with these.
 */
export function wordsOf(model: AtlasModel, h: Hit): { where: string; group: string; skill: string } {
  return {
    where: h.core ? FUNDAMENTALS : h.f >= 0 ? model.F[h.f].name : h.g >= 0 && isCore(model, h.g) ? FUNDAMENTALS : '',
    group: h.g >= 0 ? model.G[h.g].name : '',
    skill: h.s >= 0 ? model.S[h.s].name : '',
  };
}

export const NOTHING: Selection = { core: false, field: -1, group: -1, skill: -1 };

/** What the wheel shows follows from what is chosen. */
export const modeOf = (model: AtlasModel, st: Selection): Mode =>
  st.group >= 0 && isCore(model, st.group) ? 'coreGroup' : st.field >= 0 ? 'field' : st.core ? 'core' : 'rest';

/** A narrow or a shallow stage is drawn the way a phone's is. */
export const phone = (W: number, H: number): boolean => W < 700 || H < 430;

/**
 * Choosing from the wheel or its names: the core, one of its groups, or a
 * field with a group and a skill in it.
 */
export function chosen(model: AtlasModel, h: Hit): Selection {
  return h.f >= 0
    ? { core: false, field: h.f, group: h.g >= 0 && model.G[h.g].field === h.f ? h.g : -1, skill: h.s >= 0 ? h.s : -1 }
    : { core: true, field: -1, group: h.g >= 0 ? h.g : -1, skill: h.s >= 0 ? h.s : -1 };
}

/** The lens for the core's view: each group's span is as wide as its lines need, `open` (one group) by its own step. */
export function coreSegs(model: AtlasModel, open: number, step: number): Seg[] {
  const { G, core, coreSkills, sp0, sp1 } = model;
  const taken = open >= 0 ? G[open].skills.length * step : 0;
  const rest = coreSkills - (open >= 0 ? G[open].skills.length : 0);
  const each = (TAU - taken) / (rest + core.length * AIR);
  return core.map((f): Seg => [sp0[f], sp1[f], (G[f].skills.length * (f === open ? step : each)) / (sp1[f] - sp0[f])]);
}

/** Where the wheel stands: its centre and radius on the stage, the lens's spans, and how far the core's own view is in (0 the wheel, 1 the core). */
export interface Target {
  cx: number;
  cy: number;
  R: number;
  segs: Seg[];
  mid: Mid;
  core: number;
}

export function target(model: AtlasModel, st: Selection, W: number, H: number): Target {
  const { G, U, coreSkills, core, sp0, sp1, own0, own1, fields } = model;
  const ph = phone(W, H);
  const m = modeOf(model, st);
  const restR = Math.max(24, ph ? Math.min(W / 2 - 6, H / 2 - 8) : Math.min(W / 2 - 138, H / 2 - 54));
  if (m === 'rest') return { cx: W / 2, cy: H / 2, R: restR, segs: [], mid: null, core: 0 };
  // the core, whole: its second ring fills the stage but for room to name the twelve round it
  if (m === 'core') {
    const r2 = Math.max(18, ph ? Math.min(W / 2 - 78, H / 2 - 34) : Math.min(W / 2 - 190, H / 2 - 64));
    return { cx: W / 2, cy: H / 2, R: r2 / RR[2], segs: coreSegs(model, -1, 0), mid: null, core: 1 };
  }
  const label = ph ? Math.min(190, W * 0.47) : Math.min(300, W * 0.3);
  if (m === 'coreGroup') {
    // the core turned to one of its groups: the whole centre ring stays in view at the left
    const g = st.group;
    const r2 = Math.max(18, Math.min((W - label - 20) / (1 + CORE), H / 2 - 12));
    const n = G[g].skills.length;
    const most = Math.min(1.7, 2 * Math.asin(Math.min(1, (H - 22) / (2 * r2))));
    const step = Math.min(most / n, Math.max(TAU / (coreSkills + core.length * AIR), (ph ? 14.5 : 16) / r2));
    return { cx: Math.max(CORE * r2 + 8, Math.min(W / 2, W - label - r2 - 14)), cy: H / 2, R: r2 / RR[2], segs: coreSegs(model, g, step), mid: [sp0[g], sp1[g]], core: 1 };
  }
  // a field: the wheel moves left to leave a column for names; on a phone its centre ring stays just in view
  const R = Math.max(24, ph ? Math.min((W - label - 8) / (1 + RR[1]), H * 0.66) : Math.min(H / 2 - 18, (W - label) / 2 - 10));
  const px = U * RIM * R;
  const most = ph ? Math.min(1.6, 2 * Math.asin(Math.min(1, (H - 22) / (2 * R)))) : 1.5;
  const named = (ph ? 14.5 : 16) / px;
  const x = fields[st.field];
  const wf = x.a1 - x.a0;
  const mf = Math.max(1, Math.min(most / wf, (ph ? 8.5 : 13) / px));
  const g = st.group;
  let segs: Seg[];
  if (g >= 0 && G[g].field === st.field) {
    const wg = own1[g] - own0[g];
    const mg = Math.max(mf, named);
    const rest = wf - wg;
    const mr = rest > EPS ? Math.max(1, 0.4 * mf, Math.min(mf, (most - wg * mg) / rest)) : mf;
    segs = ([
      [x.a0, own0[g], mr],
      [own0[g], own1[g], mg],
      [own1[g], x.a1, mr],
    ] as Seg[]).filter((s) => s[1] - s[0] > EPS);
  } else segs = [[x.a0, x.a1, mf]];
  return { cx: ph ? W - label - R : Math.min(W / 2, W - label - R), cy: H / 2, R, segs, mid: [x.a0, x.a1], core: 0 };
}
