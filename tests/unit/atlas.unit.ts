// The arithmetic of the Atlas (client/src/components/atlas/layout.ts) and its
// address (state.ts), over the curated taxonomy itself.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  GEOMETRY,
  START,
  TAU,
  WHOLE,
  between,
  branchPath,
  cameraOn,
  cameraWhole,
  layoutAtlas,
  leafRadius,
  leafWeight,
  locate,
  linkPath,
  placeLabels,
  point,
  project,
  skeletonPath,
  spread,
  spreadRound,
  spreadWithin,
  turn,
  unproject,
} from '../../client/src/components/atlas/layout';
import { atlasHref, readAtlasState, skillsListHref } from '../../client/src/components/atlas/state';

interface FileSkill {
  name: string;
  level: 1 | 2 | 3;
}
interface FileTaxonomy {
  domains: { slug: string; name: string; what: string; groups: { slug: string; name: string; what: string; skills: FileSkill[] }[] }[];
}

const file = JSON.parse(readFileSync('data/skills/taxonomy.json', 'utf8')) as FileTaxonomy;
// The file in the shape the API serves it: a skill's id here is its name, and it is used by one more career than the last.
let careers = 0;
const taxonomy = {
  domains: file.domains.map((domain) => ({
    slug: domain.slug,
    name: domain.name,
    description: domain.what,
    groups: domain.groups.map((group) => ({
      slug: group.slug,
      name: group.name,
      description: group.what,
      // As the API orders them: by level, then the file's order.
      skills: group.skills
        .map((skill, order) => ({ skill, order }))
        .sort((a, b) => a.skill.level - b.skill.level || a.order - b.order)
        .map(({ skill }) => ({ id: skill.name, name: skill.name, level: skill.level, careers: (careers++ % 40) + 1 })),
    })),
  })),
};
const layout = layoutAtlas(taxonomy);
const total = file.domains.reduce((sum, domain) => sum + domain.groups.reduce((n, group) => n + group.skills.length, 0), 0);
const near = (a: number, b: number, epsilon = 1e-9) => Math.abs(a - b) <= epsilon;

test('every skill, group and domain of the taxonomy is on the plate once', () => {
  assert.equal(layout.leaves.length, total);
  assert.equal(layout.leafById.size, total);
  assert.equal(layout.domains.length, file.domains.length);
  assert.equal(layout.groups.length, file.domains.reduce((sum, domain) => sum + domain.groups.length, 0));
  // In the taxonomy's order, and each group and domain holds one unbroken run of leaves.
  assert.deepEqual(layout.domains.map((domain) => domain.slug), file.domains.map((domain) => domain.slug));
  let next = 0;
  for (const group of layout.groups) {
    assert.equal(group.first, next, `${group.slug} starts where the last group ended`);
    assert.ok(group.last >= group.first);
    for (let i = group.first; i <= group.last; i++) assert.equal(layout.leaves[i].group, group.index);
    next = group.last + 1;
  }
  assert.equal(next, total);
  for (const domain of layout.domains) {
    assert.equal(domain.first, layout.groups[domain.firstGroup].first);
    assert.equal(domain.last, layout.groups[domain.lastGroup].last);
  }
});

test('the angles sum to the circle', () => {
  const groupGaps = layout.groups.length - layout.domains.length;
  const steps = total + groupGaps * GEOMETRY.groupGap + layout.domains.length * GEOMETRY.domainGap;
  assert.ok(near(steps * layout.step, TAU), 'the leaves and the gaps between them take one full turn');
  // The seam between the last domain and the first is centred on the start angle, and the angles run on from it unwrapped.
  const first = layout.leaves[0];
  const last = layout.leaves[total - 1];
  assert.ok(near(first.angle - layout.step / 2 - START, (GEOMETRY.domainGap / 2) * layout.step));
  assert.ok(near(START + TAU - (last.angle + layout.step / 2), (GEOMETRY.domainGap / 2) * layout.step));
  for (let i = 1; i < total; i++) assert.ok(layout.leaves[i].angle > layout.leaves[i - 1].angle);
});

test('Safety, the last domain, is never at the top: it ends at the lower left, and the trades hold the top', () => {
  assert.equal(GEOMETRY.start, START);
  const clock = (slug: string) => {
    const domain = layout.domainBySlug.get(slug);
    assert.ok(domain, slug);
    return { from: turn(domain.from), to: turn(domain.to), middle: turn(domain.angle) };
  };
  const lastDomain = layout.domains[layout.domains.length - 1];
  assert.equal(lastDomain.slug, 'safety', 'the taxonomy ends in Safety');
  // Safety lies wholly in the lower left quarter: between six and nine o'clock.
  const safety = clock('safety');
  assert.ok(safety.from > Math.PI && safety.to < Math.PI * 1.5, `Safety runs from ${safety.from.toFixed(2)} to ${safety.to.toFixed(2)}`);
  // Twelve o'clock, where the eye starts, is one of the making trades.
  const top = locate(layout, 0);
  assert.ok(top && ['machining', 'fabrication', 'assembly'].includes(top.domain.slug), `the top of the plate is ${top?.domain.slug}`);
  // Machining, Fabrication and Assembly are all in the upper half; the first domain opens on the left.
  for (const slug of ['machining', 'fabrication', 'assembly']) assert.ok(Math.cos(clock(slug).middle) > 0, `${slug} is in the upper half`);
  assert.ok(Math.sin(turn(layout.domains[0].angle)) < 0, 'the first domain is on the left');
  // No domain's middle is nearer the top than Safety's is to the bottom-left seam... and Safety is the furthest domain from the top but for its neighbours.
  const fromTop = (angle: number) => Math.abs(between(angle, 0));
  assert.ok(fromTop(safety.middle) > Math.PI * 0.6);
});

test('no two leaves overlap', () => {
  for (let i = 1; i < total; i++) {
    const gap = layout.leaves[i].angle - layout.leaves[i - 1].angle;
    assert.ok(gap >= layout.step - 1e-9, `${layout.leaves[i].name} has its own step of angle`);
  }
  // Nor two marks: any two leaves near each other round the plate are further apart than two of the smallest marks are wide (radius 0.0048).
  for (let i = 0; i < total; i++) {
    for (let j = i + 1; j < Math.min(total, i + 12); j++) {
      const a = layout.leaves[i];
      const b = layout.leaves[j];
      const [ax, ay] = point(a.angle, a.radius);
      const [bx, by] = point(b.angle, b.radius);
      assert.ok(Math.hypot(ax - bx, ay - by) > 0.0048 * 2, `${a.name} and ${b.name} are apart`);
    }
  }
  // A domain's rim arc ends before the next one's begins, all the way round.
  layout.domains.forEach((domain, i) => {
    const following = layout.domains[(i + 1) % layout.domains.length];
    assert.ok(between(following.from, domain.to) > 0, `${domain.slug} and ${following.slug} do not touch`);
    assert.ok(domain.from < domain.a0 && domain.to > domain.a1);
  });
  // Groups: a gap between two of one domain, a wider one between two domains.
  for (let i = 1; i < layout.groups.length; i++) {
    const before = layout.groups[i - 1];
    const group = layout.groups[i];
    const gap = (group.a0 - before.a1) / layout.step - 1;
    assert.ok(near(gap, group.domain === before.domain ? GEOMETRY.groupGap : GEOMETRY.domainGap, 1e-6));
  }
});

test('a level maps to its band: Fundamentals nearest the centre, Advanced at the rim', () => {
  for (const level of [1, 2, 3] as const) {
    const band = GEOMETRY.bands[level];
    assert.equal(leafRadius(GEOMETRY, level, 0), band.from);
    assert.equal(leafRadius(GEOMETRY, level, band.rows - 1), band.to);
    assert.equal(leafRadius(GEOMETRY, level, band.rows), band.from, 'the rows are taken in turn');
  }
  const reach = { 1: [Infinity, -Infinity], 2: [Infinity, -Infinity], 3: [Infinity, -Infinity] };
  const rows = { 1: new Set<number>(), 2: new Set<number>(), 3: new Set<number>() };
  for (const leaf of layout.leaves) {
    const band = GEOMETRY.bands[leaf.level];
    assert.ok(leaf.radius >= band.from - 1e-9 && leaf.radius <= band.to + 1e-9, `${leaf.name} is in its level's band`);
    reach[leaf.level][0] = Math.min(reach[leaf.level][0], leaf.radius);
    reach[leaf.level][1] = Math.max(reach[leaf.level][1], leaf.radius);
    rows[leaf.level].add(Number(leaf.radius.toFixed(6)));
  }
  // Every row of every band is used.
  for (const level of [1, 2, 3] as const) assert.equal(rows[level].size, GEOMETRY.bands[level].rows);
  // The three bands do not meet, and all of them lie between the groups' tips and the rim.
  assert.ok(GEOMETRY.group < reach[1][0]);
  assert.ok(reach[1][1] < reach[2][0]);
  assert.ok(reach[2][1] < reach[3][0]);
  assert.ok(reach[3][1] < GEOMETRY.ring && GEOMETRY.ring < 1);
  assert.ok(GEOMETRY.root < GEOMETRY.domain && GEOMETRY.domain < GEOMETRY.group);
});

test('a skill more careers use is a stronger mark', () => {
  assert.equal(leafWeight(0, 196), 0);
  assert.equal(leafWeight(1, 196), 0);
  assert.equal(leafWeight(196, 196), 1);
  assert.ok(leafWeight(2, 196) > 0 && leafWeight(2, 196) < leafWeight(15, 196) && leafWeight(15, 196) < leafWeight(100, 196));
  assert.equal(leafWeight(3, 1), 0);
  assert.equal(layout.maxCareers, 40);
});

test('a branch is a curve that leaves its parent and reaches its child along the radius', () => {
  // On one angle it is a straight run.
  assert.match(linkPath(1, 0.1, 1, 0.3, 500), /^M[-\d. ]+L[-\d. ]+$/);
  // Across angles, a cubic whose two control points stand on the parent's angle and the child's, at the middle radius.
  const d = linkPath(1, 0.2, 1.3, 0.6, 500);
  const numbers = d.replace(/[MC]/g, ' ').trim().split(/\s+/).map(Number);
  assert.equal(numbers.length, 8);
  const at = (i: number) => [numbers[i] / 500, numbers[i + 1] / 500];
  const [c1, c2, end] = [at(2), at(4), at(6)];
  const [p1, p2, p3] = [point(1, 0.4), point(1.3, 0.4), point(1.3, 0.6)];
  for (const [got, want] of [[c1, p1], [c2, p2], [end, p3]]) assert.ok(near(got[0], want[0], 0.01) && near(got[1], want[1], 0.01));
  // Going on from where the pen is: no move.
  assert.ok(linkPath(1, 0.2, 1.3, 0.6, 500, true).startsWith('C'));
});

test('the plate draws its branches as far as the groups; a career draws them on to its skills, each once', () => {
  // The skeleton: a trunk per domain and a curve per group, and no stem to any skill.
  const skeleton = skeletonPath(layout, 500);
  assert.equal((skeleton.match(/M/g) ?? []).length, layout.domains.length + layout.groups.length);
  // Each one a single run: straight up a trunk (or to a group that stands on its domain's own angle), else a curve.
  assert.equal((skeleton.match(/[LC]/g) ?? []).length, layout.domains.length + layout.groups.length);
  assert.ok((skeleton.match(/L/g) ?? []).length >= layout.domains.length);
  const leaf = layout.leaves[Math.floor(total / 2)];
  const one = branchPath(layout, [leaf.index], 500);
  assert.equal((one.match(/M/g) ?? []).length, 3, "its own curve, its group's and its domain's trunk");
  assert.equal((one.match(/[LC]/g) ?? []).length, 3, 'three runs, the first the straight trunk');
  assert.match(one.slice(one.lastIndexOf('M')), /^M[-\d. ]+L[-\d. ]+$/, 'the trunk is a straight run');
  assert.ok(!/A/.test(one), 'no arcs: the way is curves');
  // Two skills of one group share the group's curve and the trunk.
  const group = layout.groups.find((candidate) => candidate.last > candidate.first);
  assert.ok(group);
  const two = branchPath(layout, [group.first, group.last], 500);
  assert.equal((two.match(/M/g) ?? []).length, 4);
  // Every skill at once: every leaf, every group, every domain.
  const all = branchPath(layout, layout.leaves.map((l) => l.index), 500);
  assert.equal((all.match(/M/g) ?? []).length, total + layout.groups.length + layout.domains.length);
  assert.equal(branchPath(layout, [], 500), '');
  assert.equal(branchPath(layout, [total + 5], 500), '');
});

test('a point on the plate finds its domain, group and skill', () => {
  for (const leaf of layout.leaves) {
    const hit = locate(layout, leaf.angle);
    assert.ok(hit);
    assert.equal(hit.leaf.index, leaf.index);
    assert.equal(hit.group.index, leaf.group);
    assert.equal(hit.domain.index, leaf.domain);
  }
  // The seam is shared: just clockwise of it is the first domain, just before it the last, whatever turn the angle is given in.
  assert.equal(locate(layout, START + 0.0001)?.domain.index, 0);
  assert.equal(locate(layout, START - 0.0001)?.domain.index, layout.domains.length - 1);
  assert.equal(locate(layout, START + TAU * 3 + 0.0001)?.domain.index, 0);
  assert.equal(locate(layout, START - TAU * 2 - 0.0001)?.domain.index, layout.domains.length - 1);
  // A point of the screen comes back as an angle in [0, 2π): every leaf is still found from there.
  for (const leaf of layout.leaves) assert.equal(locate(layout, turn(leaf.angle))?.leaf.index, leaf.index);
  assert.equal(locate(layoutAtlas({ domains: [] }), 1), null);
});

test('labels are spread so none sits on another, and moved no further than they must be', () => {
  assert.deepEqual(spread([], []), []);
  assert.deepEqual(spread([1, 5, 9], [2, 2, 2]), [1, 5, 9]);
  const crowded = spread([10, 10, 10], [2, 2, 2]);
  assert.deepEqual(crowded, [8, 10, 12]);
  const mixed = spread([0, 1, 1.5, 20], [2, 4, 2, 2]);
  for (let i = 1; i < mixed.length; i++) assert.ok(mixed[i] - mixed[i - 1] >= ([2, 4, 2, 2][i] + [2, 4, 2, 2][i - 1]) / 2 - 1e-9);
  assert.equal(mixed[3], 20);
});

test('names set round a ring make room for each other across the seam too', () => {
  // Room for all: nothing moves.
  const easy = spreadRound([1, 3, 5], [0.5, 0.5, 0.5]);
  assert.deepEqual(easy.placed, [1, 3, 5]);
  assert.equal(easy.overlap, 0);
  // The last and the first are neighbours: two names either side of the seam part from each other.
  const seam = spreadRound([0.05, 3, TAU - 0.05], [0.6, 0.6, 0.6]);
  assert.equal(seam.overlap, 0);
  assert.ok(seam.placed[0] + TAU - seam.placed[2] >= 0.6 - 1e-9);
  assert.ok(Math.abs(seam.placed[1] - 3) < 1e-9, 'a name with room stays where it is');
  // The domains' own names at a phone's size of plate: one row is too short, which the answer says.
  const sizes = layout.domains.map((domain) => (domain.name.length * 6 + 11) / 160);
  const crowded = spreadRound(layout.domains.map((domain) => domain.angle), sizes);
  assert.equal(crowded.placed.length, layout.domains.length);
  assert.ok(crowded.overlap > 0, 'sixteen names do not fit one row round a phone');
  // On a desktop's they do, and then every name is clear of the next, round the seam as well.
  const wide = sizes.map((size) => size * 0.45);
  const fits = spreadRound(layout.domains.map((domain) => domain.angle), wide);
  assert.equal(fits.overlap, 0);
  fits.placed.forEach((angle, i) => {
    const j = (i + 1) % fits.placed.length;
    assert.ok(turn(fits.placed[j] - angle) >= (wide[i] + wide[j]) / 2 - 1e-9, `${layout.domains[i].name} is clear of ${layout.domains[j].name}`);
  });
});

test('rows set in a span stay inside it, keep their order and do not meet', () => {
  assert.deepEqual(spreadWithin([], [], 0, 1), []);
  // Room for all: nothing moves.
  assert.deepEqual(spreadWithin([0.2, 0.5, 0.8], [0.1, 0.1, 0.1], 0, 1), [0.2, 0.5, 0.8]);
  // Asked for past the ends: brought inside.
  const pushed = spreadWithin([-1, -1, 5], [0.2, 0.2, 0.2], 0, 1);
  assert.ok(pushed[0] - 0.1 >= -1e-9 && pushed[2] + 0.1 <= 1 + 1e-9);
  for (let i = 1; i < pushed.length; i++) assert.ok(pushed[i] - pushed[i - 1] >= 0.2 - 1e-9);
  // More than fit: set closer, still inside and in order.
  const tight = spreadWithin([0.5, 0.5, 0.5, 0.5], [0.4, 0.4, 0.4, 0.4], 0, 1);
  assert.ok(tight[0] >= 0.125 - 1e-9 && tight[3] <= 0.875 + 1e-9);
  for (let i = 1; i < tight.length; i++) assert.ok(tight[i] - tight[i - 1] >= 0.25 - 1e-9);
});

test('an open domain names its groups level in a column, an open group its skills in its place', () => {
  const rows = { group: 0.05, skill: 0.05, top: -1, bottom: 1 };
  for (const domain of layout.domains) {
    const camera = cameraOn(domain.angle, 2.2, GEOMETRY.ring, 0.2);
    const labels = placeLabels(layout, domain, null, camera, rows);
    assert.equal(labels.length, domain.lastGroup - domain.firstGroup + 1, `${domain.slug}: one name per group, and none of another domain`);
    assert.ok(labels.every((label) => label.kind === 'group' && layout.groups[label.index].domain === domain.index));
    for (let i = 1; i < labels.length; i++) assert.ok(labels[i].y - labels[i - 1].y >= rows.group - 1e-9, `${domain.slug}: rows in order and apart`);
    assert.ok(labels.every((label) => label.y >= rows.top + rows.group / 2 - 1e-9 && label.y <= rows.bottom - rows.group / 2 + 1e-9), `${domain.slug}: inside the frame`);
    // A name stands level with its group's place on the rim, as near as its neighbours let it.
    const middle = labels[Math.floor(labels.length / 2)];
    const [, rimY] = project(camera, middle.from, GEOMETRY.ring);
    assert.ok(Math.abs(middle.y - rimY) <= rows.group * labels.length, `${domain.slug}: near its place`);
    const open = layout.groups[domain.firstGroup];
    const withSkills = placeLabels(layout, domain, open, camera, rows);
    const skills = withSkills.filter((label) => label.kind === 'skill');
    assert.equal(skills.length, open.last - open.first + 1);
    assert.equal(withSkills.length, labels.length - 1 + skills.length);
    for (let i = 1; i < withSkills.length; i++) assert.ok(withSkills[i].y - withSkills[i - 1].y >= rows.group - 1e-9);
  }
});

test('the camera turns a domain to three o\'clock by the shortest way, and a point of the frame can be read back', () => {
  assert.deepEqual(unproject(WHOLE, 0, -0.5), { angle: 0, radius: 0.5 });
  let turned = 0;
  for (const domain of layout.domains) {
    const camera = cameraOn(domain.angle, 2.5, GEOMETRY.ring, 0.1, turned);
    assert.ok(Math.abs(camera.rotate - turned) <= Math.PI + 1e-9, 'never the long way round');
    turned = camera.rotate;
    // The domain's middle, on the outer ring, is where it was asked to be.
    const seen = unproject(camera, 0.1, 0);
    assert.ok(near(seen.radius, GEOMETRY.ring, 1e-9));
    assert.ok(Math.abs(between(seen.angle, domain.angle)) < 1e-9);
    // And a point of the plate is projected back to where it is seen.
    const [x, y] = project(camera, domain.angle, GEOMETRY.ring);
    assert.ok(near(x, 0.1, 1e-9) && near(y, 0, 1e-9));
    const [px, py] = project(camera, domain.a0, 0.6);
    const back = unproject(camera, px, py);
    assert.ok(near(back.radius, 0.6, 1e-9) && Math.abs(between(back.angle, domain.a0)) < 1e-9);
  }
  const back = cameraWhole(turned);
  assert.equal(back.scale, 1);
  assert.ok(near(back.rotate % TAU, 0) || near(Math.abs(back.rotate % TAU), TAU));
  assert.ok(Math.abs(back.rotate - turned) <= Math.PI + 1e-9);
});

test('the address says what is open, most specific first, and keeps the careers', () => {
  assert.equal(atlasHref({}), '/atlas');
  assert.equal(atlasHref({ domain: 'quality' }), '/atlas?domain=quality');
  assert.equal(atlasHref({ domain: 'quality', group: 'calibration' }), '/atlas?group=calibration');
  assert.equal(atlasHref({ domain: 'quality', group: 'calibration', skill: 'abc' }), '/atlas?skill=abc');
  assert.equal(atlasHref({ group: 'calibration', career: 'c1', with: 'c2' }), '/atlas?group=calibration&career=c1&with=c2');
  // A second career with no first is the first; a career is not compared with itself.
  assert.equal(atlasHref({ with: 'c2' }), '/atlas?career=c2');
  assert.equal(atlasHref({ career: 'c1', with: 'c1' }), '/atlas?career=c1');
  assert.deepEqual(readAtlasState(new URLSearchParams('skill=abc&career=c1&with=c2')), { domain: null, group: null, skill: 'abc', career: 'c1', with: 'c2', at: null });
  assert.equal(skillsListHref(), '/explore?tab=skills');
  assert.equal(skillsListHref('quality', 'calibration'), '/explore?tab=skills&domain=quality&group=calibration');
  assert.equal(skillsListHref(null, 'calibration'), '/explore?tab=skills');
});
