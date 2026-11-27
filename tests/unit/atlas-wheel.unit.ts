// The arithmetic of the Atlas's wheel (client/src/components/atlas/: model.ts,
// lens.ts, camera.ts), over the curated taxonomy and the Atlas's structure
// themselves, and the twelve core hues in the token file.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ATLAS, type AtlasStructure } from '../../shared/atlas';
import type { Taxonomy } from '../../client/src/lib/api';
import { FAMGAP, TAU, buildAtlas, isCore, layOver, statusOf, type AtlasModel } from '../../client/src/components/atlas/model';
import { K, at, blendTo, disp, freeze, norm, sweep, tableFor, undisp, wrapPi } from '../../client/src/components/atlas/lens';
import { AIR, RR, chosen, coreSegs, modeOf, phone, target, wordsOf, type Selection } from '../../client/src/components/atlas/camera';

interface FileTaxonomy {
  domains: { slug: string; name: string; what?: string; groups: { slug: string; name: string; what?: string; skills: { name: string; level: 1 | 2 | 3 }[] }[] }[];
}

const file = JSON.parse(readFileSync('data/skills/taxonomy.json', 'utf8')) as FileTaxonomy;
// The file in the shape the API serves it: each skill a made-up id.
let made = 0;
const taxonomy: Taxonomy = {
  levels: [
    { id: 1, name: 'Fundamentals' },
    { id: 2, name: 'Intermediate' },
    { id: 3, name: 'Advanced' },
  ],
  domains: file.domains.map((domain) => ({
    slug: domain.slug,
    name: domain.name,
    description: domain.what ?? '',
    groups: domain.groups.map((group) => ({
      slug: group.slug,
      name: group.name,
      description: group.what ?? '',
      skills: group.skills.map((skill) => ({ id: `skill-${++made}`, name: skill.name, level: skill.level, careers: made % 7, makes: [] })),
    })),
  })),
};
const model = buildAtlas(taxonomy, ATLAS);
const { G, F, S, U } = model;

/** The stage sizes the wheel is held at: three phones (one sideways), a laptop's stage, a desktop's and a large one. */
const SIZES: [number, number][] = [
  [390, 330],
  [360, 290],
  [844, 300],
  [1024, 560],
  [1280, 700],
  [1728, 900],
];
const REST: Selection = { core: false, field: -1, group: -1, skill: -1 };
/** Every state the page can be in, as far as the camera and the lens can tell (a skill moves neither). */
const STATES: { name: string; st: Selection }[] = [
  { name: 'rest', st: REST },
  { name: 'the core', st: { ...REST, core: true } },
  ...model.core.map((g) => ({ name: `the core > ${G[g].name}`, st: { ...REST, core: true, group: g } })),
  ...F.map((field, f) => ({ name: `field ${field.name}`, st: { ...REST, field: f } })),
  ...G.flatMap((group, g) => (group.field >= 0 ? [{ name: `${F[group.field].name} > ${group.name}`, st: { ...REST, field: group.field, group: g } }] : [])),
];

test('the wheel holds the whole taxonomy: 201 groups, 12 of them the core, 33 fields, 1,023 skills', () => {
  assert.equal(G.length, 201);
  assert.equal(model.N, 201);
  assert.equal(model.core.length, 12);
  assert.equal(F.length, 33);
  assert.equal(S.length, 1023);
  assert.deepEqual(model.unplaced, []);
  assert.deepEqual(
    model.core.map((g) => G[g].slug),
    ATLAS.core,
  );
  assert.equal(model.coreSkills, model.core.reduce((n, g) => n + G[g].skills.length, 0));
  // Every skill is on the wheel once, in one group.
  assert.equal(new Set(G.flatMap((group) => group.skills)).size, S.length);
  assert.equal(model.skillById.size, S.length);
  for (const [id, s] of model.skillById) assert.equal(S[s].id, id);
  for (const [slug, g] of model.groupBySlug) assert.equal(G[g].slug, slug);
  for (const [slug, f] of model.fieldBySlug) assert.equal(F[f].slug, slug);
});

test('the groups are a walk of the tree: each stands after the group it is built on, one ring or more further out', () => {
  G.forEach((group, i) => {
    if (group.parent < 0) {
      assert.equal(group.ring, 1, `${group.slug} is on the centre ring`);
      assert.equal(group.field, -1);
      assert.equal(group.depth, 0);
      assert.equal(model.rootOf[i], i);
      assert.ok(model.coreIndex[i] >= 0);
      return;
    }
    assert.ok(group.parent < i, `${group.slug} stands after what it is built on`);
    assert.ok(group.ring > G[group.parent].ring && group.ring <= 5, `${group.slug} is further out than what it is built on`);
    assert.ok(group.field >= 0 && group.field < F.length);
    assert.equal(group.depth, G[group.parent].depth + 1);
    assert.equal(model.rootOf[i], model.rootOf[group.parent]);
    assert.equal(model.coreIndex[i], -1);
    assert.ok(model.kids[group.parent].includes(i));
  });
});

test("a group's skills are by level, then by name", () => {
  for (const group of G) {
    for (let j = 1; j < group.skills.length; j++) {
      const a = S[group.skills[j - 1]];
      const b = S[group.skills[j]];
      assert.ok(a.level < b.level || (a.level === b.level && a.name.localeCompare(b.name, 'en') < 0), `${group.slug}: ${a.name} before ${b.name}`);
    }
  }
});

test('every skill has an angle within one turn, and within a group the angles go up by exactly one step', () => {
  for (let s = 0; s < S.length; s++) assert.ok(model.skillAng[s] >= 0 && model.skillAng[s] < TAU, `${S[s].name} is at ${model.skillAng[s]}`);
  G.forEach((group, i) => {
    // A core group's skills share its span on the centre ring; every other skill takes one step of the wheel.
    const step = isCore(model, i) ? (model.hi[i] - model.lo[i]) / group.skills.length : U;
    for (let j = 1; j < group.skills.length; j++) {
      const d = model.skillAng[group.skills[j]] - model.skillAng[group.skills[j - 1]];
      assert.ok(Math.abs(d - step) < 1e-12, `${group.slug}: a step of ${d}, not ${step}`);
    }
    group.skills.forEach((s) => {
      assert.equal(model.skillGroup[s], i);
      assert.ok(model.skillAng[s] > model.lo[i] && model.skillAng[s] < model.hi[i] + 1e-12, `${S[s].name} lies on its group's bar`);
    });
  });
});

test('no two skills at the rim are closer than one step', () => {
  const rim = [...S.keys()].filter((s) => !isCore(model, model.skillGroup[s])).map((s) => model.skillAng[s]);
  rim.sort((a, b) => a - b);
  assert.equal(rim.length, S.length - model.coreSkills);
  for (let i = 1; i < rim.length; i++) assert.ok(rim[i] - rim[i - 1] >= U - 1e-9, `two skills are ${(rim[i] - rim[i - 1]) / U} of a step apart`);
  assert.ok(rim[0] + TAU - rim[rim.length - 1] >= U - 1e-9, 'the last and the first are a step apart across the seam');
});

test("every group lies inside the span of what it is built on, beside its neighbours and never over them", () => {
  const eps = 1e-12;
  G.forEach((group, i) => {
    assert.ok(model.sp1[i] > model.sp0[i], `${group.slug} has a span`);
    assert.ok(model.own0[i] >= model.sp0[i] - eps && model.own1[i] <= model.sp1[i] + eps);
    assert.ok(model.lo[i] >= model.sp0[i] - eps && model.hi[i] <= model.sp1[i] + eps, `${group.slug}: its bar is inside its span`);
    assert.ok(model.node[i] >= model.lo[i] - eps && model.node[i] <= model.hi[i] + eps, `${group.slug}: the line in lands on its bar`);
    if (group.parent >= 0) {
      const p = group.parent;
      assert.ok(model.sp0[i] >= model.sp0[p] - eps && model.sp1[i] <= model.sp1[p] + eps, `${group.slug} is inside ${G[p].slug}`);
      // The bar of what it is built on reaches the line in to it, so that line joins a bar at both ends.
      assert.ok(model.node[i] >= model.lo[p] - eps && model.node[i] <= model.hi[p] + eps, `${G[p].slug}'s bar reaches ${group.slug}`);
    }
    const kids = model.kids[i];
    for (let j = 1; j < kids.length; j++) assert.ok(model.sp0[kids[j]] > model.sp1[kids[j - 1]], `${G[kids[j - 1]].slug} and ${G[kids[j]].slug} overlap`);
  });
  // The twelve families take the turn between them, each with half a gap at either side.
  model.core.forEach((g, k) => {
    const next = model.core[(k + 1) % model.core.length];
    const gap = k + 1 < model.core.length ? model.sp0[next] - model.sp1[g] : model.sp0[next] + TAU - model.sp1[g];
    assert.ok(Math.abs(gap - FAMGAP * U) < 1e-9, `${G[g].slug} and ${G[next].slug} are ${gap / U} steps apart`);
  });
  assert.ok(Math.abs(model.total * U - TAU) < 1e-12);
});

test("the fields' order is by angle, and each field's parts are its stretches by core group", () => {
  assert.equal(model.order.length, F.length);
  assert.deepEqual([...model.order].sort((a, b) => a - b), F.map((_, f) => f));
  for (let i = 1; i < model.order.length; i++) assert.ok(model.fields[model.order[i]].a0 > model.fields[model.order[i - 1]].a0);
  let skills = 0;
  model.fields.forEach((x, f) => {
    assert.equal(x.f, f);
    assert.equal(x.slug, F[f].slug);
    assert.ok(x.groups.length > 0 && x.a1 > x.a0 && x.mid > x.a0 && x.mid < x.a1);
    assert.deepEqual(x.groups, G.flatMap((group, i) => (group.field === f ? [i] : [])));
    assert.equal(x.parts.length, x.roots.length);
    x.parts.forEach((part, j) => {
      assert.equal(part.k, model.coreIndex[x.roots[j]]);
      assert.ok(part.a0 >= x.a0 && part.a1 <= x.a1 && part.a1 > part.a0);
    });
    skills += x.skills;
  });
  assert.equal(skills, S.length - model.coreSkills);
});

/**
 * The lens's rule written out again, without the table: how far round a true angle is drawn, measured from the
 * wheel's own start. The table samples this at K points and reads between them along straight lines, so at the
 * end of an opened span (where the rate changes inside one step of the table) it is a hair off.
 */
function exact(segs: readonly (readonly [number, number, number])[], x: number): number {
  let used = 0;
  let wide = 0;
  for (const [a0, a1, m] of segs) {
    used += (a1 - a0) * m;
    wide += a1 - a0;
  }
  const out = segs.length ? Math.max(0.05, (TAU - used) / (TAU - wide)) : 1;
  let c = 0;
  let from = 0;
  for (const [a0, a1, m] of segs) {
    if (x <= a0) return c + (x - from) * out;
    c += (a0 - from) * out;
    if (x <= a1) return c + (x - a0) * m;
    c += (a1 - a0) * m;
    from = a1;
  }
  return c + (x - from) * out;
}

test('the lens is a one-to-one turn of the wheel in every state, at every size', () => {
  let tables = 0;
  for (const [W, H] of SIZES) {
    for (const { name, st } of STATES) {
      const T = target(model, st, W, H);
      const t = tableFor(T.segs, T.mid);
      tables++;
      assert.equal(t.length, K + 1);
      for (let k = 1; k <= K; k++) assert.ok(t[k] > t[k - 1], `${name} at ${W}x${H}: the table turns back at ${k}`);
      assert.ok(Math.abs(t[K] - t[0] - TAU) < 1e-9, `${name} at ${W}x${H}: the table comes to ${t[K] - t[0]}, not one turn`);
      // The spans the lens opens are in order, apart, and inside the turn.
      T.segs.forEach((seg, i) => {
        assert.ok(seg[1] > seg[0] && seg[2] > 0 && Number.isFinite(seg[2]), `${name} at ${W}x${H}: span ${i}`);
        if (i) assert.ok(seg[0] >= T.segs[i - 1][1] - 1e-12);
      });
    }
  }
  assert.equal(tables, SIZES.length * (2 + 12 + 33 + (201 - 12)));
});

test('what is opened is turned to three o\'clock: a field\'s middle, a core group\'s', () => {
  for (const [W, H] of SIZES) {
    for (const { name, st } of STATES) {
      const mode = modeOf(model, st);
      const T = target(model, st, W, H);
      const t = tableFor(T.segs, T.mid);
      if (mode === 'rest' || mode === 'core') {
        // Nothing is turned: the wheel's own start stands at twelve o'clock.
        assert.equal(T.mid, null);
        assert.ok(Math.abs(t[0] + Math.PI / 2) < 1e-12);
        continue;
      }
      const [a0, a1] = mode === 'field' ? [model.fields[st.field].a0, model.fields[st.field].a1] : [model.sp0[st.group], model.sp1[st.group]];
      assert.deepEqual(T.mid, [a0, a1]);
      // The middle of what is drawn of it, half way between where its two ends are drawn, is at three o'clock:
      // exactly by the lens's rule, which the table holds at each of its points...
      const base = exact(T.segs, 0) - t[0];
      const middle = (exact(T.segs, a0) + exact(T.segs, a1)) / 2 - base;
      assert.ok(Math.abs(middle) < 1e-9, `${name} at ${W}x${H}: its middle is drawn at ${middle}`);
      for (const k of [1, K >> 2, K >> 1, K - 1]) assert.ok(Math.abs(exact(T.segs, (k / K) * TAU) - base - t[k]) < 1e-9, `${name} at ${W}x${H}: the table at ${k}`);
      // ... and, read between the table's points as the wheel reads it, within a pixel of it at the rim.
      const drawn = (at(t, a0) + at(t, a1)) / 2;
      assert.ok(Math.abs(drawn) * T.R < 1, `${name} at ${W}x${H}: its middle is drawn ${Math.abs(drawn) * T.R}px from three o'clock`);
      // And it is drawn on the right-hand side, top to bottom, within the half turn the names stand beside.
      assert.ok(at(t, a0) < 0 && at(t, a1) > 0 && at(t, a1) - at(t, a0) < Math.PI, `${name} at ${W}x${H}: it is drawn over ${at(t, a1) - at(t, a0)}`);
      // The turn can be undone: the true angle found at three o'clock is inside it.
      const back = undisp(t, 0);
      assert.ok(back >= a0 - TAU / K && back <= a1 + TAU / K, `${name} at ${W}x${H}`);
    }
  }
});

test('the camera never gives a radius under its floor, or anything that is not a number', () => {
  for (const [W, H] of SIZES) {
    for (const { name, st } of STATES) {
      const mode = modeOf(model, st);
      const T = target(model, st, W, H);
      for (const v of [T.cx, T.cy, T.R, T.core, ...T.segs.flat(), ...(T.mid ?? [])]) assert.ok(Number.isFinite(v), `${name} at ${W}x${H}: ${v}`);
      const floor = mode === 'rest' || mode === 'field' ? 24 : 18 / RR[2];
      assert.ok(T.R >= floor - 1e-9, `${name} at ${W}x${H}: a radius of ${T.R}`);
      assert.equal(T.core, mode === 'core' || mode === 'coreGroup' ? 1 : 0);
      assert.equal(T.cy, H / 2);
      // The centre ring is whole and in view wherever the wheel has moved to, and where names are set in a column
      // beside the drawing the column has its room at the right.
      assert.ok(T.cx - RR[1] * T.R >= 0 && T.cx + RR[1] * T.R <= W, `${name} at ${W}x${H}: centred at ${T.cx}`);
      if (mode === 'rest' || mode === 'core') assert.equal(T.cx, W / 2);
      else {
        const label = phone(W, H) ? Math.min(190, W * 0.47) : Math.min(300, W * 0.3);
        // what is drawn: the whole wheel for a field, the core's two rings for one of the twelve
        const drawing = mode === 'field' ? T.R : RR[2] * T.R;
        assert.ok(W - (T.cx + drawing) >= label - 1e-9, `${name} at ${W}x${H}: ${W - (T.cx + drawing)}px for names, not ${label}`);
      }
    }
  }
  assert.equal(phone(390, 330), true);
  assert.equal(phone(844, 300), true);
  assert.equal(phone(1024, 560), false);
});

test('a group chosen in a field has a step wide enough to carry a name at every skill', () => {
  for (const [W, H] of SIZES) {
    const ph = phone(W, H);
    for (const { name, st } of STATES) {
      if (modeOf(model, st) !== 'field' || st.group < 0) continue;
      const T = target(model, st, W, H);
      const open = T.segs.find((seg) => Math.abs(seg[0] - model.own0[st.group]) < 1e-12 && Math.abs(seg[1] - model.own1[st.group]) < 1e-12);
      assert.ok(open, `${name} at ${W}x${H}: its group is opened`);
      // one skill's step at the rim, in pixels: a line of names (14.5px on a phone, 16px elsewhere)
      const px = U * open[2] * 0.9 * T.R;
      assert.ok(px >= (ph ? 14.5 : 16) - 1e-6, `${name} at ${W}x${H}: ${px}px a skill`);
    }
  }
});

test("the core's own view gives every one of the twelve room by its lines", () => {
  const each = TAU / (model.coreSkills + 12 * AIR);
  const segs = coreSegs(model, -1, 0);
  assert.equal(segs.length, 12);
  model.core.forEach((g, k) => {
    assert.deepEqual([segs[k][0], segs[k][1]], [model.sp0[g], model.sp1[g]]);
    const drawn = exact(segs, model.sp1[g]) - exact(segs, model.sp0[g]);
    assert.ok(Math.abs(drawn / G[g].skills.length - each) < 1e-12, `${G[g].slug}: each of its lines takes ${drawn / G[g].skills.length}, not ${each}`);
  });
  // and between two of the twelve, the air of 0.7 of a line
  model.core.forEach((g, k) => {
    if (k + 1 === model.core.length) return;
    const air = exact(segs, model.sp0[model.core[k + 1]]) - exact(segs, model.sp1[g]);
    assert.ok(Math.abs(air - AIR * each) < 1e-9);
  });
  // One opened: its lines take the step asked for, the others share what is left.
  const open = model.core[3];
  const one = coreSegs(model, open, 0.2);
  assert.ok(Math.abs((exact(one, model.sp1[open]) - exact(one, model.sp0[open])) / G[open].skills.length - 0.2) < 1e-12);
  assert.ok(Math.abs(exact(one, TAU) - TAU) < 1e-9);
});

test('a change between two states is a blend in which nothing crosses', () => {
  const turns = (cur: Float64Array, blend: ReturnType<typeof blendTo> | null): number => {
    // Once round the wheel by true angle: what is drawn goes once round too, never back.
    let sum = 0;
    for (let k = 0; k < K; k++) sum += norm(disp(cur, blend, ((k + 1) / K) * TAU) - disp(cur, blend, (k / K) * TAU));
    return sum / TAU;
  };
  const pick = (name: string) => STATES.find((state) => state.name === name)!.st;
  const pairs: [Selection, Selection][] = [
    [REST, pick('field Machining')],
    [pick('field Machining'), pick('Machining > CNC setup')],
    [pick('Machining > CNC setup'), pick('field Welding')],
    [pick('field Welding'), pick('the core')],
    [pick('the core'), pick('the core > Shop safety')],
    [pick('the core > Shop safety'), pick('the core > CAD')],
    [pick('the core > CAD'), pick('field Food and drug')],
    [pick('field Food and drug'), REST],
  ];
  for (const [W, H] of [SIZES[0], SIZES[4]]) {
    for (const [from, to] of pairs) {
      const a = target(model, from, W, H);
      const b = target(model, to, W, H);
      const cur = tableFor(a.segs, a.mid);
      const next = tableFor(b.segs, b.mid);
      const now = freeze(cur, null);
      for (let k = 0; k <= K; k++) assert.ok(Math.abs(now[k] - cur[k]) < 1e-12, 'standing still, the wheel is where its table says');
      const blend = blendTo(now, next);
      for (const e of [0, 0.1, 0.35, 0.5, 0.8, 1]) {
        blend.e = e;
        assert.ok(Math.abs(turns(cur, blend) - 1) < 1e-6, `at ${e} of the way the wheel is ${turns(cur, blend)} turns`);
      }
      // It starts where the wheel stood and ends where the next table puts everything.
      for (const x of [0.3, 1.7, 2.9, 4.4, 6.1]) {
        blend.e = 0;
        assert.ok(Math.abs(wrapPi(disp(cur, blend, x) - at(cur, x))) < 1e-9);
        blend.e = 1;
        assert.ok(Math.abs(wrapPi(disp(cur, blend, x) - at(next, x))) < 1e-9);
      }
      // Stopped half way and frozen, it is a table like any other: one turn, never back.
      blend.e = 0.5;
      const half = freeze(cur, blend);
      for (let k = 1; k <= K; k++) assert.ok(half[k] >= half[k - 1] - 1e-9);
      assert.ok(Math.abs(half[K] - half[0] - TAU) < 1e-6);
    }
  }
  const [p0, p1] = sweep(tableFor([], null), null, 6, 0.5);
  assert.ok(p1 > p0 && p1 - p0 < Math.PI, 'a span over the seam is swept the short way on');
});

test('what the wheel shows follows from what is chosen, and a choice on the wheel is a selection', () => {
  const measuring = model.groupBySlug.get('measurement-tools')!;
  const setup = model.groupBySlug.get('cnc-setup')!;
  const machining = model.fieldBySlug.get('machining')!;
  const welding = model.fieldBySlug.get('welding')!;
  assert.equal(modeOf(model, REST), 'rest');
  assert.equal(modeOf(model, { ...REST, core: true }), 'core');
  assert.equal(modeOf(model, { ...REST, core: true, group: measuring }), 'coreGroup');
  assert.equal(modeOf(model, { ...REST, field: machining }), 'field');
  assert.equal(modeOf(model, { ...REST, field: machining, group: setup }), 'field');
  // A core group chosen from inside a field's list is still the core turned to it.
  assert.equal(modeOf(model, { ...REST, field: machining, group: measuring }), 'coreGroup');
  const s = G[setup].skills[2];
  assert.deepEqual(chosen(model, { f: machining, g: setup, s }), { core: false, field: machining, group: setup, skill: s });
  assert.deepEqual(chosen(model, { f: machining, g: -1, s: -1 }), { core: false, field: machining, group: -1, skill: -1 });
  // A group of another field does not come along.
  assert.deepEqual(chosen(model, { f: welding, g: setup, s: -1 }), { core: false, field: welding, group: -1, skill: -1 });
  assert.deepEqual(chosen(model, { f: -1, g: -1, s: -1, core: true }), { core: true, field: -1, group: -1, skill: -1 });
  assert.deepEqual(chosen(model, { f: -1, g: measuring, s: G[measuring].skills[0] }), { core: true, field: -1, group: measuring, skill: G[measuring].skills[0] });
  // And it is said in the list's own words: the centre is Fundamentals, never another name for it.
  assert.deepEqual(wordsOf(model, { f: machining, g: setup, s }), { where: 'Machining', group: 'CNC setup', skill: S[s].name });
  assert.deepEqual(wordsOf(model, { f: machining, g: -1, s: -1 }), { where: 'Machining', group: '', skill: '' });
  assert.deepEqual(wordsOf(model, { f: -1, g: -1, s: -1, core: true }), { where: 'Fundamentals', group: '', skill: '' });
  assert.deepEqual(wordsOf(model, { f: -1, g: measuring, s: -1 }), { where: 'Fundamentals', group: 'Measuring', skill: '' });
});

test('a career laid over the wheel lights its groups, the way from each to the centre ring, and its fields in order', () => {
  const setup = model.groupBySlug.get('cnc-setup')!;
  const basics = model.groupBySlug.get('shop-basics')!;
  const need = [G[setup].skills[0], G[setup].skills[1], G[basics].skills[0]];
  const laid = layOver(model, need, null);
  assert.deepEqual([...laid.need.keys()].sort((a, b) => a - b), [setup, basics].sort((a, b) => a - b));
  assert.deepEqual(laid.need.get(setup), { all: [G[setup].skills[0], G[setup].skills[1]], got: 2 });
  for (let j = setup; j >= 0; j = G[j].parent) assert.equal(laid.way[j], 1, `${G[j].slug} is on the way`);
  assert.equal(laid.way[basics], 1);
  assert.equal(laid.way.reduce((n, v) => n + v, 0), G[setup].depth + 1 + 1);
  assert.deepEqual(laid.fields, [{ f: G[setup].field, n: 2 }]);
  assert.equal(statusOf(laid, setup, false), 'need');
  assert.equal(statusOf(laid, setup + 1, false), '');
  // A rating laid under it: what it has, and what is the gap.
  const rated = layOver(model, need, new Set([G[setup].skills[0]]));
  assert.equal(rated.need.get(setup)!.got, 1);
  assert.equal(statusOf(rated, setup, true), 'part');
  assert.equal(statusOf(rated, basics, true), 'gap');
  // No career: nothing lit. A skill named twice, or one the wheel does not have, changes nothing.
  assert.equal(layOver(model, null, null).need.size, 0);
  assert.deepEqual(layOver(model, [...need, need[0], -1, S.length], null).need.get(setup), laid.need.get(setup));
  // Fields come in order round the wheel, whatever order the career names its skills in.
  const far = G.findIndex((group) => group.field >= 0 && model.fields[group.field].a0 > model.fields[G[setup].field].a0);
  const both = layOver(model, [G[far].skills[0], ...need], null);
  assert.deepEqual(both.fields.map((x) => x.f), [G[setup].field, G[far].field]);
});

test('a group the structure does not place is left off and listed; one the taxonomy lacks is skipped, and what is built on it hangs from its nearest ancestor', () => {
  // A group of the taxonomy the structure does not name.
  const extra: Taxonomy = { ...taxonomy, domains: [...taxonomy.domains, { slug: 'new', name: 'New', description: '', groups: [{ slug: 'not-placed', name: 'Not placed', description: '', skills: [{ id: 'x-1', name: 'A New Skill', level: 1, careers: 0, makes: [] }] }] }] };
  const withExtra = buildAtlas(extra, ATLAS);
  assert.deepEqual(withExtra.unplaced, ['not-placed']);
  assert.equal(withExtra.N, 201);
  assert.equal(withExtra.skillById.has('x-1'), false);

  // A group in the middle of a branch the taxonomy lacks: what was built on it hangs from the group below.
  const mid = ATLAS.groups.find((place) => place.on !== null && ATLAS.groups.some((other) => other.on === place.slug) && ATLAS.groups.find((p) => p.slug === place.on)!.on !== null)!;
  const without = (slug: string): Taxonomy => ({ ...taxonomy, domains: taxonomy.domains.map((domain) => ({ ...domain, groups: domain.groups.filter((group) => group.slug !== slug) })) });
  const hung = buildAtlas(without(mid.slug), ATLAS);
  assert.equal(hung.N, 200);
  assert.equal(hung.groupBySlug.has(mid.slug), false);
  for (const place of ATLAS.groups.filter((other) => other.on === mid.slug)) {
    const i = hung.groupBySlug.get(place.slug)!;
    assert.equal(hung.G[i].parent, hung.groupBySlug.get(mid.on!), `${place.slug} hangs from ${mid.on}`);
    assert.equal(hung.G[i].depth, hung.G[hung.G[i].parent].depth + 1);
  }
  assert.deepEqual(hung.unplaced, []);
  for (let s = 0; s < hung.S.length; s++) assert.ok(hung.skillAng[s] >= 0 && hung.skillAng[s] < TAU);

  // A core group the taxonomy lacks: everything built on it has nothing to stand on, and is listed.
  const root = ATLAS.core[0];
  const under = (slug: string): string[] => ATLAS.groups.filter((place) => place.on === slug).flatMap((place) => [place.slug, ...under(place.slug)]);
  const cut = buildAtlas(without(root), ATLAS);
  assert.equal(cut.core.length, 11);
  assert.deepEqual([...cut.unplaced].sort(), under(root).sort());
  assert.equal(cut.N, 201 - 1 - under(root).length);
  for (const x of cut.fields) assert.ok(x.groups.length > 0 && Number.isFinite(x.a0) && Number.isFinite(x.a1), 'no field is left with nothing in it');
  for (const [W, H] of SIZES) for (const st of [REST, { ...REST, core: true }, { ...REST, field: 0 }]) assert.ok(Number.isFinite(target(cut, st, W, H).R));
});

test('an empty taxonomy gives an empty wheel that can still be asked where it stands', () => {
  const empty = buildAtlas({ levels: [], domains: [] }, ATLAS);
  assert.equal(empty.N, 0);
  assert.equal(empty.S.length, 0);
  assert.equal(empty.F.length, 0);
  assert.deepEqual(empty.order, []);
  assert.equal(empty.U, 0);
  const T = target(empty, REST, 1024, 560);
  assert.ok(Number.isFinite(T.R) && T.segs.length === 0);
  assert.equal(layOver(empty, [0, 1], null).need.size, 0);
  // And a structure with nothing in it leaves the whole taxonomy unplaced.
  const bare: AtlasStructure = { core: [], fields: [], groups: [] };
  const none: AtlasModel = buildAtlas(taxonomy, bare);
  assert.equal(none.N, 0);
  assert.equal(none.unplaced.length, 201);
});

// ---- the twelve core hues (client/src/styles/globals.css) ----------------------------------------------------------

const css = readFileSync('client/src/styles/globals.css', 'utf8');
function tokens(theme: 'dark' | 'light'): Map<string, string> {
  const block = theme === 'light' ? /:root\[data-theme='light'\]\s*\{([^}]*)\}/ : /:root\s*\{([^}]*)\}/;
  const body = (css.match(block)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  return new Map([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}
function luminance(hex: string): number {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `${hex} is not a six-digit hex colour`);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};
/** OKLab, to tell how far apart two colours are to the eye. */
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

for (const theme of ['dark', 'light'] as const) {
  test(`${theme}: each of the twelve core groups has a hue, as plain as the ink on both surfaces`, () => {
    const found = tokens(theme);
    for (const slug of ATLAS.core) {
      const hue = found.get(`--core-${slug}`);
      assert.ok(hue, `${theme} has no --core-${slug}`);
      for (const ground of ['--bg', '--surface']) {
        const ratio = contrast(hue, found.get(ground)!);
        console.log(`contrast ${theme.padEnd(5)} --core-${slug.padEnd(24)} ${hue} on ${ground.padEnd(9)} ${ratio.toFixed(2)}:1`);
        assert.ok(ratio >= 4.5, `${theme}: --core-${slug} on ${ground} is ${ratio.toFixed(2)}:1, under 4.5:1`);
      }
    }
    // And no hue for a group that is not one of the twelve.
    const named = [...found.keys()].filter((name) => name.startsWith('--core-')).map((name) => name.slice('--core-'.length));
    assert.deepEqual(named.sort(), [...ATLAS.core].sort());
  });

  test(`${theme}: the core hues are muted and of one lightness, none passes for the accent, and Shop safety has none`, () => {
    const found = tokens(theme);
    const labs = ATLAS.core.map((slug) => oklab(found.get(`--core-${slug}`)!));
    const lightness = labs.map((lab) => lab[0]);
    assert.ok(Math.max(...lightness) - Math.min(...lightness) <= 0.02, `${theme}: the hues span ${(Math.max(...lightness) - Math.min(...lightness)).toFixed(3)} of lightness`);
    const accent = oklab(found.get('--accent')!);
    ATLAS.core.forEach((slug, k) => {
      const chroma = Math.hypot(labs[k][1], labs[k][2]);
      if (slug === 'workplace-safety') assert.ok(chroma < 0.01, `${theme}: Shop safety is a grey`);
      else assert.ok(chroma > 0.05 && chroma <= 0.1, `${theme}: --core-${slug} has a chroma of ${chroma.toFixed(3)}`);
      assert.ok(Math.hypot(...labs[k].map((v, i) => v - accent[i])) >= 0.08, `${theme}: --core-${slug} is too near the accent`);
      // Neighbours on the centre ring are told apart.
      const next = labs[(k + 1) % labs.length];
      assert.ok(Math.hypot(...labs[k].map((v, i) => v - next[i])) >= 0.06, `${theme}: ${slug} and the next core group are too alike`);
    });
  });
}

test('the stylesheet hands each core group its hue, and nothing but the wheel\'s ink names one in script', () => {
  for (const slug of ATLAS.core) {
    assert.ok(css.includes(`[data-core='${slug}'] { --core-hue: var(--core-${slug}); }`), `no [data-core='${slug}'] rule`);
  }
  const rules = [...css.matchAll(/\[data-core='([a-z-]+)'\]/g)].map((match) => match[1]);
  assert.deepEqual(rules.sort(), [...ATLAS.core].sort());
  // ink.ts reads the tokens by the core groups' slugs and holds no colour of its own.
  const ink = readFileSync('client/src/components/atlas/ink.ts', 'utf8');
  assert.ok(ink.includes('`--core-${slug}`'));
  assert.equal(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/i.test(ink), false);
});
