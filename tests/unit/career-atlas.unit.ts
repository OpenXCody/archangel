// A career on the Atlas, part walked (client/src/components/atlas/walk.ts),
// over the curated taxonomy itself. `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { GEOMETRY, layoutAtlas, point } from '../../client/src/components/atlas/layout';
import { dotsPath, routePath, shareDash, walkOf } from '../../client/src/components/atlas/walk';

interface FileTaxonomy {
  domains: { slug: string; name: string; what: string; groups: { slug: string; name: string; what: string; skills: { name: string; level: 1 | 2 | 3 }[] }[] }[];
}

const file = JSON.parse(readFileSync('data/skills/taxonomy.json', 'utf8')) as FileTaxonomy;
const layout = layoutAtlas({
  domains: file.domains.map((domain) => ({
    slug: domain.slug,
    name: domain.name,
    description: domain.what,
    groups: domain.groups.map((group) => ({
      slug: group.slug,
      name: group.name,
      description: group.what,
      skills: group.skills
        .map((skill, order) => ({ skill, order }))
        .sort((a, b) => a.skill.level - b.skill.level || a.order - b.order)
        .map(({ skill }) => ({ id: skill.name, name: skill.name, level: skill.level, careers: 1, makes: [] })),
    })),
  })),
});
const S = 500;
const near = (a: number, b: number, epsilon = 0.011) => Math.abs(a - b) <= epsilon;

/** The points a path passes through, in order: where it starts, and where each line and curve ends. */
function points(d: string): [number, number][] {
  const found: [number, number][] = [];
  for (const [, command, rest] of d.matchAll(/([MLC])([^MLC]*)/g)) {
    const numbers = rest.trim().split(/[\s,]+/).map(Number);
    found.push(command === 'C' ? [numbers[4], numbers[5]] : [numbers[0], numbers[1]]);
  }
  return found;
}

test('the way to a skill is one unbroken line from the centre to its leaf, along the plate\'s own branches', () => {
  for (const leaf of layout.leaves) {
    const d = routePath(layout, leaf, S);
    // One pen stroke: it can be drawn in from the centre outward.
    assert.equal((d.match(/M/g) ?? []).length, 1, `${leaf.name}: one stroke`);
    assert.equal((d.match(/[LC]/g) ?? []).length, 3, `${leaf.name}: the trunk, the curve to its group and the curve on to it`);
    assert.ok(/^M[-\d. ]+L/.test(d), `${leaf.name}: up the trunk, straight`);
    assert.ok(!/A/.test(d), `${leaf.name}: no arcs, no elbows`);
    const way = points(d);
    const domain = layout.domains[leaf.domain];
    const group = layout.groups[leaf.group];
    // From the ring the trunks leave from, on the domain's own trunk…
    const [sx, sy] = point(domain.angle, GEOMETRY.root);
    assert.ok(near(way[0][0], sx * S) && near(way[0][1], sy * S), `${leaf.name}: starts at the centre`);
    // …out to the leaf itself.
    const [ex, ey] = point(leaf.angle, leaf.radius);
    const end = way[way.length - 1];
    assert.ok(near(end[0], ex * S) && near(end[1], ey * S), `${leaf.name}: ends on its leaf`);
    // It passes the end of its domain's trunk and the tip of its group's branch, where the plate's own branches are.
    const [dx, dy] = point(domain.angle, GEOMETRY.domain);
    assert.ok(near(way[1][0], dx * S) && near(way[1][1], dy * S), `${leaf.name}: by its domain's trunk`);
    const [gx, gy] = point(group.angle, GEOMETRY.group);
    assert.ok(near(way[2][0], gx * S) && near(way[2][1], gy * S), `${leaf.name}: by its group's branch`);
  }
});

test('the way never doubles back: each curve\'s guides stand between the radii it joins', () => {
  for (const leaf of layout.leaves) {
    let from = Math.hypot(...points(routePath(layout, leaf, S))[0]) / S;
    for (const [, rest] of routePath(layout, leaf, S).matchAll(/[LC]([^LC]*)/g)) {
      const numbers = rest.trim().split(/\s+/).map(Number);
      const radii: number[] = [];
      for (let i = 0; i < numbers.length; i += 2) radii.push(Math.hypot(numbers[i], numbers[i + 1]) / S);
      const to = radii[radii.length - 1];
      for (const radius of radii) assert.ok(radius >= from - 1e-3 && radius <= to + 1e-3, `${leaf.name}: outward all the way`);
      from = to;
    }
  }
});

test('a set of skills is drawn as dots in one path, one stroke of no length each', () => {
  const some = [0, 5, 40, layout.leaves.length - 1];
  const d = dotsPath(layout, some, S);
  assert.equal((d.match(/M/g) ?? []).length, some.length);
  assert.equal((d.match(/h0/g) ?? []).length, some.length);
  const [x, y] = point(layout.leaves[5].angle, layout.leaves[5].radius);
  const second = points(d.replace(/h0/g, ''))[1];
  assert.ok(near(second[0], x * S) && near(second[1], y * S), 'each dot is on its leaf');
  assert.equal(dotsPath(layout, [], S), '');
  assert.equal(dotsPath(layout, [layout.leaves.length + 3], S), '', 'a skill the plate does not hold has no dot');
});

test('a career is split by what the person has made of each skill; learning is never held', () => {
  const career = [3, 9, 27, 81, 243];
  const status = new Map<number, 'held' | 'learning'>([
    [3, 'held'],
    [27, 'learning'],
    [243, 'held'],
    [500, 'held'], // not of this career
  ]);
  const walk = walkOf(career, (index) => status.get(index));
  assert.deepEqual(walk.heldLeaves, [3, 243]);
  assert.deepEqual(walk.learningLeaves, [27]);
  assert.deepEqual(walk.aheadLeaves, [9, 81]);
  assert.deepEqual([walk.held, walk.learning, walk.total, walk.whole], [2, 1, 5, false]);
  // Whole only when every skill is held: learning the last one does not close it.
  assert.equal(walkOf(career, (index) => (index === 81 ? 'learning' : 'held')).whole, false);
  assert.equal(walkOf(career, () => 'held').whole, true);
  // A career with no skill on the plate is not whole, and holds nothing.
  assert.deepEqual([walkOf([], () => 'held').whole, walkOf([], () => 'held').total], [false, 0]);
  assert.equal(walkOf(career, () => 'none').held, 0);
});

test('the ring at the centre draws the held share of its circle, and the whole circle for a whole career', () => {
  const radius = 20;
  const length = 2 * Math.PI * radius;
  const dash = (held: number, total: number) => Number(shareDash({ held, learning: 0, total }, radius).dash.split(' ')[0]);
  assert.equal(dash(0, 17), 0);
  assert.ok(near(dash(5, 17), (5 / 17) * length));
  assert.ok(near(dash(17, 17), length));
  assert.equal(dash(0, 0), 0, 'a career with no skills draws nothing');
  assert.ok(dash(20, 17) <= length + 0.011, 'never more than the circle');
  // The gap after the drawn part is the whole circle, so the dash never repeats.
  assert.ok(near(Number(shareDash({ held: 5, learning: 0, total: 17 }, radius).dash.split(' ')[1]), length));
});
