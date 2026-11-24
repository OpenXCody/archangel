// A military career's flow into industry (client/src/components/reach/flow.ts):
// its skills by group, the civilian careers within its reach, their
// industries. Over the curated files themselves (the military paths, the
// civilian paths, the taxonomy, the industries' lists), with reach decided by
// the one rule (shared/reach.ts). `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { EVERY_INDUSTRY, FLOW, curve, industriesOf, layoutFlow, type FlowCareer, type FlowSkill } from '../../client/src/components/reach/flow';
import { reached } from '../../shared/reach';

const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
type PathEntry = string | { skill: string };
const military = read<{ careers: { title: string; skills: string[] }[] }>('data/careers/military/paths.json').careers;
const civilian = read<{ careers: { title: string; skills: PathEntry[] }[] }>('data/careers/paths.json').careers;
const taxonomy = read<{ domains: { slug: string; groups: { slug: string; name: string; skills: { name: string; level: number }[] }[] }[] }>('data/skills/taxonomy.json');
const lists = read<{ everywhere: string[]; industries: { industry: string; careers: string[] }[] }>('data/careers/industries.json');

// The route's order, as the server's routeOrder() has it: level, then the taxonomy as the file orders it.
const place = new Map<string, { group: { slug: string; name: string }; rank: number[] }>();
taxonomy.domains.forEach((domain, d) =>
  domain.groups.forEach((group, g) =>
    group.skills.forEach((skill, s) => place.set(skill.name, { group: { slug: group.slug, name: group.name }, rank: [skill.level, d, g, s] }))
  )
);
const byRoute = (a: string, b: string) => {
  const [x, y] = [place.get(a)!.rank, place.get(b)!.rank];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3] || a.localeCompare(b);
};
const nameOf = (entry: PathEntry) => (typeof entry === 'string' ? entry : entry.skill);

/** A military career's path as the page has it, and the civilian careers within its reach, closest first. */
function flowOf(title: string): { path: FlowSkill[]; careers: (FlowCareer & { title: string; held: number; total: number })[] } {
  const entry = military.find((career) => career.title === title);
  assert.ok(entry, `${title} is a military career of the file`);
  const names = [...entry.skills].sort(byRoute);
  const path = names.map((name) => ({ id: name, group: place.get(name)!.group }));
  const mine = new Set(names);
  const careers = reached(
    civilian.map((career) => {
      const skills = career.skills.map(nameOf);
      const shared = skills.filter((skill) => mine.has(skill)).sort(byRoute);
      const industries = lists.industries.filter((list) => list.careers.includes(career.title)).map((list) => list.industry);
      return { id: career.title, title: career.title, held: shared.length, total: skills.length, shared, industries, everywhere: industries.length === 0 && lists.everywhere.includes(career.title) };
    })
  );
  return { path, careers };
}

const ht = flowOf('Navy Hull Maintenance Technician');

test('every line is one skill a civilian career shares with the military path, from its own group', () => {
  const flow = layoutFlow(ht.path, ht.careers);
  assert.ok(ht.careers.length > 5, 'the rating reaches several civilian careers');
  for (const career of ht.careers) {
    const lines = flow.lines.filter((line) => line.career === career.id);
    assert.equal(lines.length, career.held, `${career.title}: one line per shared skill`);
    assert.deepEqual(lines.map((line) => line.skill).sort(), [...career.shared].sort(), career.title);
    for (const line of lines) assert.equal(line.group, place.get(line.skill)!.group.slug, `${line.skill} leaves from its group`);
  }
  assert.equal(flow.lines.length, ht.careers.reduce((sum, career) => sum + career.held, 0));
  // A group carries as many lines as its skills are shared, over all the careers.
  for (const group of flow.groups) assert.equal(group.lines, flow.lines.filter((line) => line.group === group.key).length, group.key);
});

test('the careers stand one to a row in the order given; the other columns fill the same height', () => {
  const flow = layoutFlow(ht.path, ht.careers);
  assert.deepEqual(flow.careers.map((row) => row.id), ht.careers.map((career) => career.id));
  flow.careers.forEach((row, at) => at > 0 && assert.equal(row.y - flow.careers[at - 1].y, FLOW.careerPitch));
  for (const column of [flow.groups, flow.careers, flow.industries]) {
    for (const [at, row] of column.entries()) {
      assert.ok(row.y > 0 && row.y < flow.height, 'every row is inside the drawing');
      if (at > 0) assert.ok(row.y - column[at - 1].y >= FLOW.minPitch - 1e-9, 'rows keep their distance');
    }
  }
  assert.ok(flow.height >= ht.careers.length * FLOW.careerPitch);
  // Every group of the path is drawn, once.
  assert.deepEqual(flow.groups.map((group) => group.key).sort(), [...new Set(ht.path.map((skill) => skill.group!.slug))].sort());
  assert.equal(flow.groups.reduce((sum, group) => sum + group.skills, 0), ht.path.length);
});

test('a bundle crosses none of its own lines where it arrives or leaves', () => {
  const flow = layoutFlow(ht.path, ht.careers);
  const groupY = new Map(flow.groups.map((group) => [group.key, group.y]));
  const careerY = new Map(flow.careers.map((row) => [row.id, row.y]));
  for (const row of flow.careers) {
    const into = flow.lines.filter((line) => line.career === row.id).sort((a, b) => a.to - b.to);
    into.forEach((line, at) => at > 0 && assert.ok(groupY.get(line.group)! >= groupY.get(into[at - 1].group)!, `${row.id}: lines arrive in their groups' order`));
    for (const line of into) assert.ok(Math.abs(line.to - row.y) <= FLOW.careerPitch / 2, 'a line meets its career within its row');
  }
  for (const group of flow.groups) {
    const out = flow.lines.filter((line) => line.group === group.key).sort((a, b) => a.from - b.from);
    out.forEach((line, at) => at > 0 && assert.ok(careerY.get(line.career)! >= careerY.get(out[at - 1].career)!, `${group.key}: lines leave in their careers' order`));
  }
});

test('groups whose skills carry stand where their lines go; a group that carries nothing stands last', () => {
  const flow = layoutFlow(ht.path, ht.careers);
  const idle = flow.groups.filter((group) => group.lines === 0);
  const carrying = flow.groups.filter((group) => group.lines > 0);
  assert.deepEqual(flow.groups, [...carrying, ...idle]);
  // Shipfitting carries now that the trade ashore is a career (0073): the shipfitter's path takes it.
  assert.ok(carrying.some((group) => group.key === 'shipfitting'), 'shipfitting carries into the shipfitter');
  assert.ok(flow.lines.some((line) => line.group === 'shipfitting' && line.career === 'Shipfitter'));
  // Every group of the Hull Maintenance Technician carries now. A sonar rating's fielded systems are its own:
  // no civilian career within reach asks for them, and they stand after every group that carries.
  const sonar = flowOf('Navy Sonar Technician (Surface)');
  const sonarFlow = layoutFlow(sonar.path, sonar.careers);
  const sonarIdle = sonarFlow.groups.filter((group) => group.lines === 0);
  assert.ok(sonarIdle.some((group) => group.key === 'fielded-electronic-systems'), 'fielded electronic systems carry into no civilian career');
  assert.deepEqual(sonarFlow.groups, [...sonarFlow.groups.filter((group) => group.lines > 0), ...sonarIdle]);
  // Arc welding carries into the welders at the top of the list, so it stands above shop basics, which goes everywhere.
  const at = (key: string) => flow.groups.findIndex((group) => group.key === key);
  assert.ok(at('arc-welding') >= 0 && at('arc-welding') < at('shop-basics'));
});

test('the industries are the careers\' own, each once, with every industry last', () => {
  const flow = layoutFlow(ht.path, ht.careers);
  const want = new Set(ht.careers.flatMap((career) => industriesOf(career)));
  assert.deepEqual(new Set(flow.industries.map((industry) => industry.key)), want);
  assert.equal(flow.links.length, ht.careers.reduce((sum, career) => sum + industriesOf(career).length, 0));
  for (const industry of flow.industries) assert.equal(industry.careers, flow.links.filter((link) => link.industry === industry.key).length);
  assert.ok(want.has(EVERY_INDUSTRY), 'a career found in every industry is among them');
  assert.equal(flow.industries.at(-1)?.key, EVERY_INDUSTRY);
  assert.deepEqual(industriesOf({ industries: [], everywhere: false }), []);
  assert.deepEqual(industriesOf({ industries: ['Machinery Manufacturing'], everywhere: true }), ['Machinery Manufacturing']);
});

test('a small flow by hand: two groups, two careers, one industry', () => {
  const path: FlowSkill[] = [
    { id: 'a', group: { slug: 'one', name: 'One' } },
    { id: 'b', group: { slug: 'one', name: 'One' } },
    { id: 'c', group: { slug: 'two', name: 'Two' } },
    { id: 'd', group: null },
  ];
  const flow = layoutFlow(path, [
    { id: 'x', shared: ['c'], industries: ['Machinery Manufacturing'], everywhere: false },
    { id: 'y', shared: ['a', 'b', 'c'], industries: ['Machinery Manufacturing'], everywhere: false },
  ]);
  // Two groups need less height than two careers: all three columns are the careers' height.
  assert.equal(flow.height, 2 * FLOW.careerPitch);
  // Two goes first: its lines' mean row (x and y) is above One's (y alone). The skills in no group carry nothing.
  assert.deepEqual(flow.groups.map((group) => [group.key, group.skills, group.lines]), [['two', 1, 2], ['one', 2, 2], ['', 1, 0]]);
  assert.equal(flow.groups[2].name, null);
  assert.deepEqual(flow.industries.map((industry) => [industry.key, industry.careers]), [['Machinery Manufacturing', 2]]);
  // Into y, three lines a slot apart about its row, Two's above One's.
  const into = flow.lines.filter((line) => line.career === 'y').sort((a, b) => a.to - b.to);
  assert.deepEqual(into.map((line) => line.skill), ['c', 'a', 'b']);
  assert.deepEqual(into.map((line) => line.to), [flow.careers[1].y - FLOW.slot, flow.careers[1].y, flow.careers[1].y + FLOW.slot]);
  // Nothing within reach: an empty drawing.
  assert.deepEqual(layoutFlow(path, []).lines, []);
});

test('a line leaves level and arrives level', () => {
  assert.equal(curve(220, 10, 348, 50), 'M220 10C284 10 284 50 348 50');
  assert.equal(curve(0, 1.234, 10, 2), 'M0 1.2C5 1.2 5 2 10 2');
});
