import type { AtlasField, AtlasStructure } from '@shared/atlas';
import type { Taxonomy, TaxonomyGroup } from '../../lib/api';

/**
 * The Atlas's wheel as numbers: the tree of skill groups (shared/atlas.ts)
 * joined, by group slug, to the skills the API serves (GET /api/skills/taxonomy),
 * and every angle that follows from the two. Pure: no DOM, no React, so
 * `tests/unit/atlas-wheel.unit.ts` can hold it.
 *
 * Twelve groups of fundamentals stand on the centre ring (the core); every
 * other group is built on one nearer the centre. Round the wheel every skill
 * takes one step of angle: a group's own skills first, then what is built on
 * it. The core's own skills take no room at the rim: on the wheel they are
 * marks on the centre ring, and the core has a view of its own where they are
 * lines.
 *
 * Angles are true angles, in radians, from 0 to one whole turn in the wheel's
 * order. Where one is drawn is the lens's business (lens.ts).
 */

export const TAU = Math.PI * 2;
export const EPS = 1e-7;

/** Gaps, in steps of one skill: between two groups of one field, where the field changes, between two of the twelve families. */
export const SIB = 1.3;
export const FIELDGAP = 3.2;
export const FAMGAP = 6;

/** A group on the wheel. `parent` and `field` are indexes into `G` and `F`, -1 for a core group. */
export interface WheelGroup {
  slug: string;
  /** The taxonomy's name for it. */
  name: string;
  /** 1 (the centre ring, the core) to 5. */
  ring: number;
  /** The group it is built on, -1 for a core group. */
  parent: number;
  /** Its field, -1 for a core group. */
  field: number;
  /** How many groups stand between it and the core: 0 for a core group. */
  depth: number;
  /** Its skills as indexes into `S`, by level and then by name. */
  skills: number[];
}

export interface WheelSkill {
  id: string;
  name: string;
  level: number;
  /** How many careers use it. */
  careers: number;
  /** How many military careers use it. */
  militaryCareers: number;
}

/** The stretch of one field that hangs from one core group: `k` is that core group's place among the twelve. */
export interface FieldPart {
  k: number;
  a0: number;
  a1: number;
}

/** A field as it lies on the wheel. */
export interface FieldSpan {
  /** Its index in `F`. */
  f: number;
  slug: string;
  name: string;
  /** Its groups, in the wheel's order. */
  groups: number[];
  a0: number;
  a1: number;
  mid: number;
  /** The core groups its groups are built on. */
  roots: number[];
  parts: FieldPart[];
  /** How many skills its groups hold. */
  skills: number;
}

export interface AtlasModel {
  /** The groups in the wheel's order: each core group followed by everything built on it. */
  G: WheelGroup[];
  /** The fields that have a group on the wheel, in the structure's order. */
  F: AtlasField[];
  /** The skills, group by group in the wheel's order. */
  S: WheelSkill[];
  /** `G.length`. */
  N: number;
  /** What is built directly on each group, in the wheel's order. */
  kids: number[][];
  /** The core groups, in order round the wheel (the twelve). */
  core: number[];
  /** A group's place among the core groups, -1 for a group that is not one. */
  coreIndex: Int16Array;
  /** The core group each group stands on (itself, for a core group). */
  rootOf: Int16Array;
  /** How many skills the core groups hold between them. */
  coreSkills: number;
  /** The wheel's whole turn in steps, and one step of angle. */
  total: number;
  U: number;
  /** A group's width in steps, with everything built on it. */
  Wd: Float64Array;
  /** The span of a group with everything built on it, and of its own skills alone. */
  sp0: Float64Array;
  sp1: Float64Array;
  own0: Float64Array;
  own1: Float64Array;
  /** Each skill's angle and its group. */
  skillAng: Float64Array;
  skillGroup: Int16Array;
  /** A group's bar on its ring runs from lo to hi; the line in from the group it is built on lands at node. */
  lo: Float64Array;
  hi: Float64Array;
  node: Float64Array;
  /** The fields as they lie on the wheel, by index in `F`, and their indexes in order round the wheel. */
  fields: FieldSpan[];
  order: number[];
  groupBySlug: Map<string, number>;
  fieldBySlug: Map<string, number>;
  skillById: Map<string, number>;
  /** Groups the taxonomy has that are not on the wheel: ones the structure does not name, or names with nothing present to stand on. */
  unplaced: string[];
}

/** Whether a group stands on the centre ring. */
export const isCore = (model: AtlasModel, i: number): boolean => model.G[i].parent < 0;

/**
 * The wheel for a taxonomy and a structure.
 *
 * A taxonomy group the structure does not name is left off the wheel and
 * listed in `unplaced`. A structure group the taxonomy lacks (or has with no
 * skill in it) is skipped, and anything built on it hangs from its nearest
 * present ancestor; with none, it is left off and listed too. An empty
 * taxonomy gives an empty model.
 */
export function buildAtlas(taxonomy: Taxonomy, structure: AtlasStructure): AtlasModel {
  const served = new Map<string, TaxonomyGroup>();
  for (const domain of taxonomy.domains) for (const group of domain.groups) served.set(group.slug, group);
  const placeOf = new Map(structure.groups.map((place) => [place.slug, place]));
  const fieldSlugs = new Set(structure.fields.map((field) => field.slug));
  const unplaced: string[] = [];
  for (const slug of served.keys()) if (!placeOf.has(slug)) unplaced.push(slug);

  // ---- the tree ----
  const G: WheelGroup[] = [];
  const S: WheelSkill[] = [];
  const groupBySlug = new Map<string, number>();
  const skillById = new Map<string, number>();
  const fieldOf: (string | null)[] = [];
  for (const place of structure.groups) {
    const group = served.get(place.slug);
    if (!group || group.skills.length === 0 || groupBySlug.has(place.slug)) continue;
    let parent = -1;
    if (place.on !== null) {
      // The nearest group it is built on that is on the wheel.
      let on: string | null = place.on;
      for (let hops = 0; on !== null && !groupBySlug.has(on); hops++) on = hops > structure.groups.length ? null : (placeOf.get(on)?.on ?? null);
      if (on === null || place.field === null || !fieldSlugs.has(place.field)) {
        unplaced.push(place.slug);
        continue;
      }
      parent = groupBySlug.get(on) as number;
    }
    // A group's skills by level, then by name: the order they take round the wheel and in every list.
    const skills = [...group.skills].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'en'));
    groupBySlug.set(place.slug, G.length);
    fieldOf.push(parent < 0 ? null : place.field);
    G.push({
      slug: place.slug,
      name: group.name,
      ring: place.ring,
      parent,
      field: -1,
      depth: parent < 0 ? 0 : G[parent].depth + 1,
      skills: skills.map((skill) => {
        skillById.set(skill.id, S.length);
        S.push({ id: skill.id, name: skill.name, level: skill.level, careers: skill.careers, militaryCareers: skill.militaryCareers ?? 0 });
        return S.length - 1;
      }),
    });
  }
  const used = new Set(fieldOf);
  const F: AtlasField[] = structure.fields.filter((field) => used.has(field.slug)).map((field) => ({ slug: field.slug, name: field.name }));
  const fieldBySlug = new Map(F.map((field, f) => [field.slug, f]));
  G.forEach((group, i) => {
    const slug = fieldOf[i];
    if (slug !== null) group.field = fieldBySlug.get(slug) as number;
  });

  const N = G.length;
  const kids: number[][] = G.map(() => []);
  const core: number[] = [];
  G.forEach((group, i) => (group.parent < 0 ? core.push(i) : kids[group.parent].push(i)));
  const coreIndex = new Int16Array(N).fill(-1);
  core.forEach((i, k) => (coreIndex[i] = k));
  const onCore = (i: number) => G[i].parent < 0;
  const rootOf = new Int16Array(N);
  G.forEach((_, i) => {
    let j = i;
    while (G[j].parent >= 0) j = G[j].parent;
    rootOf[i] = j;
  });

  // ---- round the wheel ----
  const gapOf = (a: number, b: number) => (G[a].field !== G[b].field ? FIELDGAP : SIB);
  const ownN = (i: number) => (onCore(i) ? 0 : G[i].skills.length);
  const Wd = new Float64Array(N);
  const width = (i: number): number => {
    let s = ownN(i);
    kids[i].forEach((c, j) => {
      if (j) s += gapOf(kids[i][j - 1], c);
      else if (ownN(i)) s += gapOf(i, c);
      s += width(c);
    });
    return (Wd[i] = s);
  };
  let total = 0;
  core.forEach((f) => (total += width(f) + FAMGAP));
  const U = total > 0 ? TAU / total : 0;
  const sp0 = new Float64Array(N);
  const sp1 = new Float64Array(N);
  const own0 = new Float64Array(N);
  const own1 = new Float64Array(N);
  const place = (i: number, s: number): void => {
    sp0[i] = s;
    sp1[i] = s + Wd[i] * U;
    own0[i] = s;
    own1[i] = s + ownN(i) * U;
    let t = own1[i];
    kids[i].forEach((c, j) => {
      if (j) t += gapOf(kids[i][j - 1], c) * U;
      else if (ownN(i)) t += gapOf(i, c) * U;
      place(c, t);
      t += Wd[c] * U;
    });
  };
  {
    let s = (FAMGAP * U) / 2;
    core.forEach((f) => {
      place(f, s);
      s += (Wd[f] + FAMGAP) * U;
    });
  }
  const skillAng = new Float64Array(S.length);
  const skillGroup = new Int16Array(S.length);
  G.forEach((group, i) =>
    group.skills.forEach((s, j) => {
      skillGroup[s] = i;
      if (!onCore(i)) skillAng[s] = own0[i] + (j + 0.5) * U;
    }),
  );
  // A group's bar on its ring runs from lo to hi; the line in from the group it is built on lands at node.
  const lo = new Float64Array(N);
  const hi = new Float64Array(N);
  const node = new Float64Array(N);
  const fix = (i: number): void => {
    kids[i].forEach(fix);
    const group = G[i];
    if (onCore(i)) {
      lo[i] = sp0[i];
      hi[i] = sp1[i];
      group.skills.forEach((s, j) => {
        skillAng[s] = lo[i] + ((j + 0.5) / group.skills.length) * (hi[i] - lo[i]);
      });
    } else {
      lo[i] = own0[i];
      hi[i] = Math.max(own1[i], ...kids[i].map((c) => node[c]));
    }
    node[i] = (lo[i] + hi[i]) / 2;
  };
  core.forEach(fix);

  // ---- the fields ----
  const fields: FieldSpan[] = F.map((field, f) => {
    const groups: number[] = [];
    G.forEach((group, i) => {
      if (group.field === f) groups.push(i);
    });
    const a0 = Math.min(...groups.map((i) => own0[i]));
    const a1 = Math.max(...groups.map((i) => own1[i]));
    const roots = [...new Set(groups.map((i) => rootOf[i]))];
    return {
      f,
      slug: field.slug,
      name: field.name,
      groups,
      a0,
      a1,
      mid: (a0 + a1) / 2,
      roots,
      parts: roots.map((r) => {
        const its = groups.filter((i) => rootOf[i] === r);
        return { k: coreIndex[r], a0: Math.min(...its.map((i) => own0[i])), a1: Math.max(...its.map((i) => own1[i])) };
      }),
      skills: groups.reduce((n, i) => n + G[i].skills.length, 0),
    };
  });
  const order = fields.map((_, i) => i).sort((a, b) => fields[a].a0 - fields[b].a0); // round the wheel

  return {
    G,
    F,
    S,
    N,
    kids,
    core,
    coreIndex,
    rootOf,
    coreSkills: core.reduce((n, f) => n + G[f].skills.length, 0),
    total,
    U,
    Wd,
    sp0,
    sp1,
    own0,
    own1,
    skillAng,
    skillGroup,
    lo,
    hi,
    node,
    fields,
    order,
    groupBySlug,
    fieldBySlug,
    skillById,
    unplaced,
  };
}

// ---- what a career laid over the wheel lights ----------------------------------------------------------------------

/** A career's skills in one group: all of them, and how many the rating laid under it already has (all, with no rating). */
export interface NeedOfGroup {
  all: number[];
  got: number;
}

/** What a career laid over the wheel reaches. */
export interface LaidOver {
  /** By group: the career's skills in it. */
  need: Map<number, NeedOfGroup>;
  /** 1 for every group on the way from one of those groups to the centre ring. */
  way: Uint8Array;
  /** The fields it reaches, in order round the wheel, each with how many of its skills lie there. */
  fields: { f: number; n: number }[];
}

/**
 * A career's skills (as indexes into `S`) laid over the wheel, with a military
 * rating's skills under it when `have` is given: what the rating lacks is the
 * gap. With no career, nothing is lit.
 */
export function layOver(model: AtlasModel, need: readonly number[] | null, have: ReadonlySet<number> | null): LaidOver {
  const { G, skillGroup, order } = model;
  const byGroup = new Map<number, NeedOfGroup>();
  const way = new Uint8Array(model.N);
  if (!need) return { need: byGroup, way, fields: [] };
  for (const s of need) {
    if (!(s >= 0 && s < model.S.length)) continue;
    const g = skillGroup[s];
    const e = byGroup.get(g) ?? { all: [], got: 0 };
    if (e.all.includes(s)) continue;
    e.all.push(s);
    if (!have || have.has(s)) e.got++;
    byGroup.set(g, e);
  }
  for (const g of byGroup.keys()) {
    let j = g;
    while (j >= 0 && !way[j]) {
      way[j] = 1;
      j = G[j].parent;
    }
  }
  const per = new Map<number, number>();
  for (const [g, e] of byGroup) if (G[g].field >= 0) per.set(G[g].field, (per.get(G[g].field) ?? 0) + e.all.length);
  return { need: byGroup, way, fields: order.filter((f) => per.has(f)).map((f) => ({ f, n: per.get(f) as number })) };
}

/** How a group stands under a career: all of its skills there are had ('need'), some ('part'), none ('gap'), or the career does not reach it (''). */
export function statusOf(laid: LaidOver, g: number, rated: boolean): '' | 'need' | 'part' | 'gap' {
  const e = laid.need.get(g);
  if (!e) return '';
  if (!rated || e.got === e.all.length) return 'need';
  return e.got ? 'part' : 'gap';
}

/** Every group of a field marked in `full`, and every group on the way from one of them to the centre ring in `on`. */
export function fieldTree(model: AtlasModel, f: number, on: Uint8Array, full: Uint8Array): void {
  for (const i of model.fields[f].groups) {
    full[i] = 1;
    let j = i;
    while (j >= 0 && !on[j]) {
      on[j] = 1;
      j = model.G[j].parent;
    }
  }
}
