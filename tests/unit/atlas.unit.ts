// The arithmetic of the Atlas (client/src/components/atlas/layout.ts) and its
// address (state.ts), over the curated taxonomy itself.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  GEOMETRY,
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
  placeLabels,
  point,
  spread,
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
  // The seam between the last domain and the first is centred on twelve o'clock.
  const first = layout.leaves[0];
  const last = layout.leaves[total - 1];
  assert.ok(near(first.angle - layout.step / 2, (GEOMETRY.domainGap / 2) * layout.step));
  assert.ok(near(TAU - (last.angle + layout.step / 2), (GEOMETRY.domainGap / 2) * layout.step));
});

test('no two leaves overlap', () => {
  for (let i = 1; i < total; i++) {
    const gap = layout.leaves[i].angle - layout.leaves[i - 1].angle;
    assert.ok(gap >= layout.step - 1e-9, `${layout.leaves[i].name} has its own step of angle`);
  }
  // Nor two marks: neighbours along a row of a level's band are further apart than two of the smallest marks are wide.
  for (let i = 0; i < total; i++) {
    for (let j = i + 1; j < Math.min(total, i + 4); j++) {
      const a = layout.leaves[i];
      const b = layout.leaves[j];
      const [ax, ay] = point(a.angle, a.radius);
      const [bx, by] = point(b.angle, b.radius);
      assert.ok(Math.hypot(ax - bx, ay - by) > 0.0048 * 1.5, `${a.name} and ${b.name} are apart`);
    }
  }
  // A domain's outer arc ends before the next one's begins, all the way round.
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

test('a level maps to its radius: Fundamentals nearest the centre, Advanced at the rim', () => {
  for (const level of [1, 2, 3] as const) assert.equal(leafRadius(GEOMETRY, level, 1), GEOMETRY.level[level]);
  const reach = { 1: [Infinity, -Infinity], 2: [Infinity, -Infinity], 3: [Infinity, -Infinity] };
  for (const leaf of layout.leaves) {
    assert.ok(Math.abs(leaf.radius - GEOMETRY.level[leaf.level]) <= GEOMETRY.lattice + 1e-9, `${leaf.name} is in its level's band`);
    reach[leaf.level][0] = Math.min(reach[leaf.level][0], leaf.radius);
    reach[leaf.level][1] = Math.max(reach[leaf.level][1], leaf.radius);
  }
  // The three bands do not meet, and all of them lie between the groups' arcs and the rings.
  assert.ok(GEOMETRY.group < reach[1][0]);
  assert.ok(reach[1][1] < reach[2][0]);
  assert.ok(reach[2][1] < reach[3][0]);
  assert.ok(reach[3][1] < GEOMETRY.groupRing && GEOMETRY.groupRing < GEOMETRY.ring && GEOMETRY.ring < 1);
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

test('the branches to a skill run from the centre: three spokes and the arcs between them', () => {
  const leaf = layout.leaves[Math.floor(total / 2)];
  const one = branchPath(layout, [leaf.index], 500);
  assert.equal((one.match(/L/g) ?? []).length, 3, 'its own spoke, its group\'s and its domain\'s trunk');
  assert.ok((one.match(/A/g) ?? []).length <= 2);
  // Two skills of one group share the group's spoke and the trunk.
  const group = layout.groups.find((candidate) => candidate.last > candidate.first);
  assert.ok(group);
  const two = branchPath(layout, [group.first, group.last], 500);
  assert.equal((two.match(/L/g) ?? []).length, 4);
  // Every skill at once: every leaf, every group, every domain.
  const all = branchPath(layout, layout.leaves.map((l) => l.index), 500);
  assert.equal((all.match(/L/g) ?? []).length, total + layout.groups.length + layout.domains.length);
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
  // The seam at the top is shared: just right of it is the first domain, just left of it the last.
  assert.equal(locate(layout, 0.0001)?.domain.index, 0);
  assert.equal(locate(layout, -0.0001)?.domain.index, layout.domains.length - 1);
  assert.equal(locate(layout, TAU * 3 + 0.0001)?.domain.index, 0);
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

test('an open domain names its groups, an open group its skills', () => {
  const pitch = { group: 0.03, skill: 0.035 };
  for (const domain of layout.domains) {
    const labels = placeLabels(layout, domain, null, pitch);
    assert.equal(labels.length, domain.lastGroup - domain.firstGroup + 1);
    assert.ok(labels.every((label) => label.kind === 'group' && !label.far));
    for (let i = 1; i < labels.length; i++) assert.ok(labels[i].angle - labels[i - 1].angle >= pitch.group - 1e-9, `${domain.slug}: labels do not overlap`);
    const open = layout.groups[domain.firstGroup];
    const withSkills = placeLabels(layout, domain, open, pitch);
    const skills = withSkills.filter((label) => label.kind === 'skill');
    assert.equal(skills.length, open.last - open.first + 1);
    assert.equal(withSkills.length, labels.length - 1 + skills.length);
    for (let i = 1; i < withSkills.length; i++) assert.ok(withSkills[i].angle - withSkills[i - 1].angle >= pitch.group - 1e-9);
  }
  // Neighbouring domains' groups are named as far as the frame reaches, across the seam at the top too.
  const first = layout.domains[0];
  const wide = placeLabels(layout, first, null, pitch, 0.5);
  assert.ok(wide.some((label) => label.far && layout.groups[label.index].domain === layout.domains.length - 1));
  assert.ok(wide.some((label) => label.far && layout.groups[label.index].domain === 1));
  for (let i = 1; i < wide.length; i++) assert.ok(wide[i].angle - wide[i - 1].angle >= pitch.group - 1e-9);
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
