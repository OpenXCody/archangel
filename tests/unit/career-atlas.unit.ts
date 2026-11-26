// A career as a small plate (client/src/components/atlas/plate.ts): the wheel
// at rest at the size of a thumb, a career's route drawn over it, and over
// that the part of it a person holds. Over the curated taxonomy, the Atlas's
// structure and every career's path themselves.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ATLAS } from '../../shared/atlas';
import type { Taxonomy } from '../../client/src/lib/api';
import { FT, HEAD, RIM, RR } from '../../client/src/components/atlas/camera';
import { buildAtlas, isCore, layOver, type AtlasModel } from '../../client/src/components/atlas/model';
import { plateBox, ringRadii, routePath } from '../../client/src/components/atlas/plate';

interface FileTaxonomy {
  domains: { slug: string; name: string; groups: { slug: string; name: string; skills: { name: string; level: 1 | 2 | 3 }[] }[] }[];
}

const file = JSON.parse(readFileSync('data/skills/taxonomy.json', 'utf8')) as FileTaxonomy;
const taxonomy: Taxonomy = {
  levels: [],
  domains: file.domains.map((domain) => ({
    slug: domain.slug,
    name: domain.name,
    description: '',
    groups: domain.groups.map((group) => ({
      slug: group.slug,
      name: group.name,
      description: '',
      skills: group.skills.map((skill) => ({ id: skill.name, name: skill.name, level: skill.level, careers: 1, makes: [] })),
    })),
  })),
};
const model = buildAtlas(taxonomy, ATLAS);
const S = 100;
const RINGS = ringRadii(S);
const TIP = (RIM + HEAD) * S;
/** A path's numbers are written to two places: what is one point may differ by a hundredth each way. */
const NEAR = 0.03;

// Every career's path as the curated files have it: the 231 and the military careers, by the skills' names.
interface PathsFile {
  careers: { title: string; skills: (string | { skill?: string; name?: string })[] }[];
}
const pathsOf = (name: string): { title: string; skills: number[] }[] =>
  (JSON.parse(readFileSync(name, 'utf8')) as PathsFile).careers.map((career) => ({
    title: career.title,
    skills: [
      ...new Set(
        career.skills
          .map((entry) => (typeof entry === 'string' ? entry : (entry.skill ?? entry.name ?? '')))
          .map((skill) => model.skillById.get(skill))
          .filter((skill): skill is number => skill !== undefined)
      ),
    ],
  }));
const CAREERS = [...pathsOf('data/careers/paths.json'), ...pathsOf('data/careers/military/paths.json')];

interface Line {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface Arc {
  r: number;
  from: number;
  span: number;
  a: [number, number];
  b: [number, number];
}
const radius = (x: number, y: number) => Math.hypot(x, y);
const angle = (x: number, y: number) => (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
const ringOf = (r: number) => RINGS.findIndex((ring) => Math.abs(ring - r) < NEAR);

/** A route's pieces: straight runs along a radius, and bars round a ring. Fails on anything else a path could hold. */
function pieces(d: string): { lines: Line[]; arcs: Arc[] } {
  const number = '-?\\d+(?:\\.\\d+)?';
  const piece = `M(${number}) (${number})(?:L(${number}) (${number})|A(${number}) (${number}) 0 ([01]) 1 (${number}) (${number}))`;
  assert.match(d, new RegExp(`^(?:${piece})*$`), 'a route is moves, lines and arcs, and every number is one a path can hold');
  const lines: Line[] = [];
  const arcs: Arc[] = [];
  for (const m of d.matchAll(new RegExp(piece, 'g'))) {
    if (m[3] !== undefined) lines.push({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4] });
    else {
      assert.equal(m[5], m[6], 'a bar is part of a circle');
      const from = angle(+m[1], +m[2]);
      let span = (angle(+m[8], +m[9]) - from + Math.PI * 2) % (Math.PI * 2);
      // Clockwise from its first end to its last, the long way round when it says so.
      if (m[7] === '1' && span < Math.PI) span += Math.PI * 2;
      arcs.push({ r: +m[5], from, span, a: [+m[1], +m[2]], b: [+m[8], +m[9]] });
    }
  }
  return { lines, arcs };
}

/** Whether a point lies on a bar. */
function onArc(arc: Arc, x: number, y: number): boolean {
  if (Math.abs(arc.r - radius(x, y)) > NEAR) return false;
  if (Math.hypot(x - arc.a[0], y - arc.a[1]) < NEAR * 2 || Math.hypot(x - arc.b[0], y - arc.b[1]) < NEAR * 2) return true;
  return (angle(x, y) - arc.from + Math.PI * 2) % (Math.PI * 2) <= arc.span + 1e-3;
}

/**
 * Everything the owner's rule asks of a drawn route: every piece joins the
 * next, with no stub and no gap, from the centre ring out. Returns how many
 * lines end at the rim and how many are a core skill's mark on the centre ring.
 */
function joined(d: string, what: string): { rim: number; marks: number; lines: number; arcs: number } {
  const { lines, arcs } = pieces(d);
  let rim = 0;
  let marks = 0;
  for (const line of lines) {
    const r0 = radius(line.x0, line.y0);
    const r1 = radius(line.x1, line.y1);
    // Along one radius: both ends on one angle.
    assert.ok(Math.abs(line.x0 * line.y1 - line.y0 * line.x1) / Math.max(r0, r1) < NEAR * 2, `${what}: a line leaves its radius`);
    assert.ok(ringOf(r0) >= 0, `${what}: a line starts off the rings, at ${r0.toFixed(2)}`);
    if (Math.abs(r1 - TIP) < NEAR) rim += 1;
    else if (ringOf(r0) === 0 && Math.abs(r1 - (RR[1] - FT) * S) < NEAR) marks += 1;
    // A spoke runs outward, from the ring of the group it is built on to its own.
    else assert.ok(ringOf(r1) > ringOf(r0), `${what}: a line from ${r0.toFixed(2)} ends nowhere, at ${r1.toFixed(2)}`);
  }
  for (const arc of arcs) {
    assert.ok(ringOf(arc.r) >= 0, `${what}: a bar off the rings, at ${arc.r}`);
    assert.ok(Math.abs(radius(...arc.a) - arc.r) < NEAR && Math.abs(radius(...arc.b) - arc.r) < NEAR, `${what}: a bar's ends are off its ring`);
    assert.ok(arc.span > 0 && arc.span < Math.PI * 2, `${what}: a bar of no length`);
  }
  // No piece is drawn twice.
  assert.equal(new Set(strokes(d)).size, lines.length + arcs.length, `${what}: a piece is drawn twice`);

  // Joined: start from every piece that touches the centre ring and walk through whatever meets what has been reached.
  const ends = lines.map((line) => [[line.x0, line.y0] as const, [line.x1, line.y1] as const]);
  const meet = (i: number, j: number): boolean => ends[i].some((p) => ends[j].some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < NEAR * 2));
  const lineOnArc = (i: number, k: number): boolean => ends[i].some((p) => onArc(arcs[k], p[0], p[1]));
  const reachedLine = lines.map((line) => ringOf(radius(line.x0, line.y0)) === 0);
  const reachedArc = arcs.map((arc) => ringOf(arc.r) === 0);
  for (let moved = true; moved; ) {
    moved = false;
    for (let i = 0; i < lines.length; i++) {
      if (reachedLine[i]) continue;
      if (lines.some((_, j) => reachedLine[j] && meet(i, j)) || arcs.some((_, k) => reachedArc[k] && lineOnArc(i, k))) reachedLine[i] = moved = true;
    }
    for (let k = 0; k < arcs.length; k++) {
      if (reachedArc[k]) continue;
      if (lines.some((_, i) => reachedLine[i] && lineOnArc(i, k))) reachedArc[k] = moved = true;
    }
  }
  assert.ok(reachedLine.every(Boolean), `${what}: a line is joined to nothing that leads to the centre ring`);
  assert.ok(reachedArc.every(Boolean), `${what}: a bar is joined to nothing that leads to the centre ring`);
  // No stub: a bar ends where a line meets it, never past the last one.
  for (const arc of arcs) {
    for (const end of [arc.a, arc.b]) {
      assert.ok(ends.some((pair) => pair.some((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) < NEAR * 2)), `${what}: a bar runs on past the last line that meets it`);
    }
  }
  return { rim, marks, lines: lines.length, arcs: arcs.length };
}

/** A route's pieces as they are written, in one order. */
const strokes = (d: string): string[] => (d.match(/M[^M]+/g) ?? []).sort();

/** How many of some skills are in a core group. */
const inCore = (m: AtlasModel, skills: readonly number[]) => skills.filter((skill) => isCore(m, m.skillGroup[skill])).length;

test('the small plate is the wheel at rest: its five rings, out to the end of a skill\'s mark', () => {
  assert.deepEqual(RINGS, RR.slice(1).map((r) => r * S));
  assert.equal(RINGS.length, 5);
  for (let i = 1; i < RINGS.length; i++) assert.ok(RINGS[i] > RINGS[i - 1]);
  // The frame holds the rim, a skill's mark and a little air, and scales with the plate.
  assert.ok(plateBox(S) > TIP && plateBox(S) < TIP + 4);
  assert.ok(RINGS[4] < RIM * S && RIM * S < TIP);
  assert.equal(plateBox(50) - 2, (plateBox(S) - 2) / 2);
  assert.equal(routePath(model, [], S), '');
});

test('the plate stands as the wheel does: the first core group opens at twelve, Shop safety is at the lower left', () => {
  // A core group's skill is a mark on the centre ring; its place says where the wheel's start is and which way it turns.
  const mark = (slug: string, at: 'first' | 'last') => {
    const skills = model.G[model.groupBySlug.get(slug) as number].skills;
    const { lines } = pieces(routePath(model, [at === 'first' ? skills[0] : skills[skills.length - 1]], S));
    assert.equal(lines.length, 1);
    return lines[0];
  };
  const first = mark(ATLAS.core[0], 'first');
  assert.ok(first.y0 < 0 && first.x0 > 0 && first.x0 < -first.y0, 'the first skill of the first core group stands just past twelve, clockwise');
  const safety = mark('workplace-safety', 'first');
  assert.ok(safety.x0 < 0 && safety.y0 > 0, 'Shop safety is on the left, below nine');
  // Round the centre ring in the structure's order, clockwise.
  let before = -1;
  for (const slug of ATLAS.core) {
    const line = mark(slug, 'first');
    const clock = (Math.atan2(line.x0, -line.y0) + Math.PI * 2) % (Math.PI * 2);
    assert.ok(clock > before, `${slug} stands after the core group before it`);
    before = clock;
  }
});

test('the way to any one skill is unbroken from the centre ring out to the end of its mark', () => {
  for (let skill = 0; skill < model.S.length; skill++) {
    const group = model.skillGroup[skill];
    const d = routePath(model, [skill], S);
    const drawn = joined(d, model.S[skill].name);
    if (isCore(model, group)) {
      // A core group's skill is one mark on the centre ring, drawn inward.
      assert.deepEqual(drawn, { rim: 0, marks: 1, lines: 1, arcs: 0 }, model.S[skill].name);
      continue;
    }
    assert.equal(drawn.rim, 1, `${model.S[skill].name}: one line to the rim`);
    assert.equal(drawn.marks, 0);
    // One spoke for each group between it and the centre ring, and its own line.
    assert.equal(drawn.lines, model.G[group].depth + 1, `${model.S[skill].name}: ${model.G[group].depth} spokes and its line`);
  }
});

test("every career's route is joined: each skill's line, each group's bar, each spoke in, with no stub and no gap", () => {
  assert.ok(CAREERS.length >= 231 + 118, `${CAREERS.length} careers read from the curated paths`);
  let drawn = 0;
  for (const career of CAREERS) {
    if (career.skills.length === 0) continue;
    const d = routePath(model, career.skills, S);
    const route = joined(d, career.title);
    const core = inCore(model, career.skills);
    assert.equal(route.marks, core, `${career.title}: a mark on the centre ring for each of the core's skills`);
    assert.equal(route.rim, career.skills.length - core, `${career.title}: a line to the rim for each other skill`);
    // One spoke in for each group on the way that is not a core group.
    const laid = layOver(model, career.skills, null);
    const spokes = [...laid.way].filter((on, i) => on && !isCore(model, i)).length;
    assert.equal(route.lines, career.skills.length + spokes, `${career.title}: ${spokes} spokes`);
    // The order the skills are given in changes nothing but the order the pieces are written in.
    assert.deepEqual(strokes(routePath(model, [...career.skills].reverse(), S)), strokes(d), `${career.title}: the same route whichever way round`);
    drawn += 1;
  }
  assert.ok(drawn >= 231 + 118, `${drawn} careers have a route to draw`);
});

test('what a person holds of a career is part of the same route', () => {
  for (const career of CAREERS) {
    if (career.skills.length < 2) continue;
    const whole = pieces(routePath(model, career.skills, S));
    // Held: every other skill of the career.
    const some = career.skills.filter((_, at) => at % 2 === 0);
    const d = routePath(model, some, S);
    joined(d, `${career.title}, half held`);
    const held = pieces(d);
    for (const line of held.lines) {
      assert.ok(
        whole.lines.some((each) => each.x0 === line.x0 && each.y0 === line.y0 && each.x1 === line.x1 && each.y1 === line.y1),
        `${career.title}: a held line leaves the career's route`
      );
    }
    for (const arc of held.arcs) {
      assert.ok(
        whole.arcs.some((each) => onArc(each, arc.a[0], arc.a[1]) && onArc(each, arc.b[0], arc.b[1]) && arc.span <= each.span + 1e-3),
        `${career.title}: a held bar leaves the career's route`
      );
    }
  }
  // A skill named twice is drawn once.
  const two = CAREERS.find((career) => career.skills.length >= 2)!.skills.slice(0, 2);
  assert.equal(routePath(model, [...two, ...two], S), routePath(model, two, S));
});

test('a plate of another size is the same route, larger or smaller', () => {
  const career = CAREERS.find((each) => each.skills.length >= 12)!;
  const small = pieces(routePath(model, career.skills, 50));
  const large = pieces(routePath(model, career.skills, S));
  assert.equal(small.lines.length, large.lines.length);
  assert.equal(small.arcs.length, large.arcs.length);
  small.lines.forEach((line, i) => {
    for (const key of ['x0', 'y0', 'x1', 'y1'] as const) assert.ok(Math.abs(line[key] * 2 - large.lines[i][key]) <= 0.02, 'a line of the half plate is half as long');
  });
});
