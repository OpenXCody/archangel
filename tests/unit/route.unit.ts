// A career's path as a route (shared/route.ts): how a path is cut into stops,
// which skills are next, and how much is held. `npm run test:unit`. No
// browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoute, nextOf, routeSkills, shareOf, NEXT_SKILLS, type RouteStatus } from '../../shared/route';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const group = (slug: string) => ({ slug, name: slug.replace(/-/g, ' ') });
const skill = (id: string, slug: string | null) => ({ id, group: slug ? group(slug) : null });
const shape = (skills: { id: string; group: { slug: string; name: string } | null }[]) =>
  buildRoute(skills).map((stop) => (stop.kind === 'section' ? `${stop.group.slug}[${stop.skills.map((each) => each.id).join(' ')}]` : stop.skill.id));

test('a run of two or more skills of one group is a section; a run of one is the skill by itself', () => {
  assert.deepEqual(
    shape([skill('a', 'safety'), skill('b', 'basics'), skill('c', 'basics'), skill('d', 'gauges'), skill('e', 'gauges'), skill('f', 'gauges'), skill('g', 'setup')]),
    ['a', 'basics[b c]', 'gauges[d e f]', 'g']
  );
  assert.deepEqual(shape([]), []);
  assert.deepEqual(shape([skill('a', 'safety')]), ['a']);
  assert.deepEqual(shape([skill('a', 'safety'), skill('b', 'safety')]), ['safety[a b]']);
});

test('a group the route comes back to is two stops with the same name, and nothing joins them', () => {
  const route = buildRoute([skill('a', 'cnc'), skill('b', 'cnc'), skill('c', 'inspection'), skill('d', 'cnc'), skill('e', 'cnc'), skill('f', 'inspection')]);
  assert.deepEqual(
    route.map((stop) => stop.kind),
    ['section', 'single', 'section', 'single']
  );
  const [first, , second] = route;
  assert.ok(first.kind === 'section' && second.kind === 'section');
  assert.equal(first.group.name, second.group.name);
  assert.notEqual(first.key, second.key, 'each stop has its own key, so one opens without the other');
  assert.equal(new Set(route.map((stop) => stop.key)).size, route.length);
});

test('the order that arrives is the order kept: stops never sort and never regroup', () => {
  const skills = [skill('z', 'b'), skill('y', 'a'), skill('x', 'b'), skill('w', 'b'), skill('v', 'a')];
  assert.deepEqual(routeSkills(buildRoute(skills)).map((each) => each.id), ['z', 'y', 'x', 'w', 'v']);
  assert.deepEqual(shape(skills), ['z', 'y', 'b[x w]', 'v']);
});

test('a skill no taxonomy placed is a stop of its own, even beside another', () => {
  assert.deepEqual(shape([skill('a', null), skill('b', null), skill('c', 'basics'), skill('d', 'basics'), skill('e', null)]), ['a', 'b', 'basics[c d]', 'e']);
});

test('a section\'s key holds while marks change: it is the group and the skill the run opens with', () => {
  const skills = [skill('a', 'basics'), skill('b', 'basics'), skill('c', 'gauges')];
  assert.deepEqual(buildRoute(skills).map((stop) => stop.key), ['basics:a', 'c']);
  assert.deepEqual(buildRoute(skills).map((stop) => stop.key), buildRoute([...skills]).map((stop) => stop.key));
});

const ids = (skills: { id: string }[]) => skills.map((each) => each.id).join(' ');
const path6 = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));

test('next is the first three skills not held, in the route\'s order', () => {
  assert.equal(NEXT_SKILLS, 3);
  assert.equal(ids(nextOf(path6, () => false)), 'a b c');
  assert.equal(ids(nextOf(path6, (id) => id === 'a' || id === 'b')), 'c d e');
  assert.equal(ids(nextOf(path6, (id) => id !== 'f')), 'f', 'fewer than three are left');
  assert.equal(ids(nextOf(path6, () => true)), '', 'everything held: nothing is next');
  assert.equal(ids(nextOf([], () => false)), '');
});

test('a skill being learned is not held, so it is still next and keeps its place', () => {
  const status: Record<string, RouteStatus> = { a: 'held', b: 'learning', d: 'learning' };
  const held = (id: string) => status[id] === 'held';
  assert.equal(ids(nextOf(path6, held)), 'b c d', 'learning does not move a skill ahead of the route');
});

test('skills held out of order are passed over: nothing is gated', () => {
  assert.equal(ids(nextOf(path6, (id) => id === 'c' || id === 'e')), 'a b d');
  assert.equal(ids(nextOf(path6, (id) => id === 'a' || id === 'f')), 'b c d');
});

test('the share counts held skills; learning is counted apart and never as held', () => {
  const status: Record<string, RouteStatus> = { a: 'held', b: 'held', c: 'learning' };
  assert.deepEqual(shareOf(path6, (id) => status[id] ?? 'none'), { held: 2, learning: 1, total: 6 });
  assert.deepEqual(shareOf([], () => 'held'), { held: 0, learning: 0, total: 0 });
  assert.deepEqual(shareOf(path6, () => 'held'), { held: 6, learning: 0, total: 6 });
  // A skill the person holds that is not on this path is not counted.
  assert.deepEqual(shareOf([{ id: 'a' }], (id) => (id === 'zz' || id === 'a' ? 'held' : 'none')), { held: 1, learning: 0, total: 1 });
});

// One function orders a path (server/lib/route.ts). A reader that sorts
// occupation_skills itself would draw or pick from a path in another order
// than the page shows, which is what this ship removed.
test('no reader of a path writes the derived order out for itself', () => {
  const files = (dir: string): string[] =>
    readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith('.ts') ? [path.join(dir, entry.name)] : []
    );
  const own = /group_position\s+(ASC\s+)?NULLS LAST|groupPosition\}\s+ASC NULLS LAST/;
  const found = [...files('server/routes'), ...files('server/lib')]
    // The route's one fragment, and the two reads of one group's skills (the taxonomy's tree, a skill's page), which are no path.
    .filter((file) => !['server/lib/route.ts', 'server/lib/taxonomy.ts', 'server/routes/skills.ts'].includes(file.split(path.sep).join('/')))
    .filter((file) => own.test(readFileSync(path.join(root, file), 'utf8')));
  assert.deepEqual(found, []);
});

test('the flow is gone: nothing draws a path by level columns', () => {
  const client = (dir: string): string[] =>
    readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? client(path.join(dir, entry.name)) : /\.(tsx?|css)$/.test(entry.name) ? [path.join(dir, entry.name)] : []
    );
  const said = client('client/src').filter((file) => /PathFlow|buildPath\(|\.path-flow|path-level/.test(readFileSync(path.join(root, file), 'utf8')));
  // The admin's path editor still lays a path out by level; it is replaced by the builder, in its own ship.
  assert.deepEqual(said.map((file) => file.split(path.sep).join('/')), ['client/src/components/admin/PathEditor.tsx']);
});
