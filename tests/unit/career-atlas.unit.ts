// A career on the Atlas, part walked (client/src/components/atlas/walk.ts) and
// the career page's two views of a path (pathView.ts), over the curated
// taxonomy itself. `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { GEOMETRY, layoutAtlas, point } from '../../client/src/components/atlas/layout';
import { dotsPath, routePath, shareDash, walkOf } from '../../client/src/components/atlas/walk';
import { careerAtlasHref, namedPathView, pathViewSearch, readPathView } from '../../client/src/components/atlas/pathView';

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

/** The points a path passes through, in order: where it starts, and where each line and arc ends. */
function points(d: string): [number, number][] {
  const found: [number, number][] = [];
  for (const [, command, rest] of d.matchAll(/([MLA])([^MLA]*)/g)) {
    const numbers = rest.trim().split(/[\s,]+/).map(Number);
    found.push(command === 'A' ? [numbers[5], numbers[6]] : [numbers[0], numbers[1]]);
  }
  return found;
}

test('the way to a skill is one unbroken line from the centre to its leaf, along the plate\'s own branches', () => {
  for (const leaf of layout.leaves) {
    const d = routePath(layout, leaf, S);
    // One pen stroke: it can be drawn in from the centre outward.
    assert.equal((d.match(/M/g) ?? []).length, 1, `${leaf.name}: one stroke`);
    assert.equal((d.match(/L/g) ?? []).length, 3, `${leaf.name}: the trunk, the group's spoke and its own`);
    assert.ok((d.match(/A/g) ?? []).length <= 2, `${leaf.name}: at most the domain's arc and the group's`);
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
    // Every turn on the way is at the domain's arc or the group's, never across the plate.
    for (const [x, y] of way.slice(1, -1)) {
      const radius = Math.hypot(x, y) / S;
      assert.ok(near(radius, GEOMETRY.domain, 1e-3) || near(radius, GEOMETRY.group, 1e-3), `${leaf.name}: turns only where the plate branches`);
    }
    // It passes the foot of the group's spoke.
    const [gx, gy] = point(group.angle, GEOMETRY.group);
    assert.ok(way.some(([x, y]) => near(x, gx * S) && near(y, gy * S)), `${leaf.name}: by its group's spoke`);
  }
});

test('the way never goes the long way round an arc', () => {
  for (const leaf of layout.leaves) {
    for (const [, flags] of routePath(layout, leaf, S).matchAll(/A[\d.]+ [\d.]+ 0 (\d) \d/g)) {
      assert.equal(flags, '0', `${leaf.name}: the short arc`);
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

test('the view of a path is the address\'s, else the one last shown in the visit, else the route', () => {
  assert.equal(readPathView('atlas', null), 'atlas');
  assert.equal(readPathView('route', 'atlas'), 'route', 'the address wins over what was kept');
  assert.equal(readPathView(null, 'atlas'), 'atlas');
  assert.equal(readPathView(null, null), 'route');
  assert.equal(readPathView('sideways', 'atlas'), 'atlas', 'a word that is no view is no word');
  assert.equal(readPathView(null, 'sideways'), 'route');
});

test('the route was the flow: an old address and a view kept from before still read', () => {
  assert.equal(readPathView('flow', null), 'route');
  assert.equal(readPathView('flow', 'atlas'), 'route', 'an old address still wins over what was kept');
  assert.equal(readPathView(null, 'flow'), 'route');
  assert.equal(namedPathView('flow'), 'route');
  assert.equal(namedPathView('route'), 'route');
  assert.equal(namedPathView('atlas'), 'atlas');
  assert.equal(namedPathView('levels'), null);
  assert.equal(namedPathView(null), null);
});

test('the address carries the view and the open domain, and keeps what else it had', () => {
  assert.equal(pathViewSearch('', 'atlas'), '?path=atlas');
  assert.equal(pathViewSearch('?path=route', 'atlas', 'quality'), '?path=atlas&domain=quality');
  assert.equal(pathViewSearch('?path=flow', 'atlas'), '?path=atlas', 'an old word is written over');
  assert.equal(pathViewSearch('?path=atlas&domain=quality', 'atlas'), '?path=atlas', 'back to the whole path');
  assert.equal(pathViewSearch('?path=atlas&domain=quality', 'route'), '?path=route', 'the route has no open domain');
  assert.equal(pathViewSearch('?path=atlas&domain=quality', 'route', 'quality'), '?path=route');
  assert.equal(pathViewSearch('?from=search', 'atlas', 'safety'), '?from=search&path=atlas&domain=safety');
  assert.equal(careerAtlasHref('abc'), '/occupations/abc?path=atlas#skills');
});
