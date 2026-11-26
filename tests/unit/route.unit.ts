// A career's path, cut for drawing (shared/route.ts): into stops, by skill
// group, and how much of it is held; and what a career's page must never
// draw again. `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRoute, groupRoute, routeSkills, shareOf, type RouteStatus } from '../../shared/route';

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

const path6 = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));

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

test('by group, a path is each group once, where the route first reaches it, with its skills in the route\'s order', () => {
  const grouped = (skills: { id: string; group: { slug: string; name: string } | null }[]) =>
    groupRoute(skills).map((stop) => (stop.kind === 'section' ? `${stop.group.slug}[${stop.skills.map((each) => each.id).join(' ')}]` : stop.skill.id));
  // A group the route comes back to is one section, and a group of one skill is a section too.
  assert.deepEqual(
    grouped([skill('a', 'cnc'), skill('b', 'cnc'), skill('c', 'inspection'), skill('d', 'safety'), skill('e', 'cnc'), skill('f', 'inspection')]),
    ['cnc[a b e]', 'inspection[c f]', 'safety[d]']
  );
  // A skill no taxonomy placed stands by itself, where it is.
  assert.deepEqual(grouped([skill('a', 'cnc'), skill('x', null), skill('b', 'cnc')]), ['cnc[a b]', 'x']);
  assert.deepEqual(grouped([]), []);
  // Each section is keyed by its group, so what a person opened holds while the career's groups do.
  const route = groupRoute([skill('a', 'cnc'), skill('c', 'inspection'), skill('b', 'cnc')]);
  assert.deepEqual(route.map((stop) => stop.key), ['cnc', 'inspection']);
  // Every skill is there once.
  assert.deepEqual(routeSkills(route).map((each) => each.id).sort(), ['a', 'b', 'c']);
});

/** Every source file of the client, as paths from the repository's root with forward slashes. */
const clientFiles = (dir = 'client/src'): string[] =>
  readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? clientFiles(`${dir}/${entry.name}`) : /\.(tsx?|css)$/.test(entry.name) ? [`${dir}/${entry.name}`] : []
  );
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

// The owner found NEXT and THEN, the column beside a career's skills and the line above them confusing. They are
// gone from the client, not hidden: no part draws them and no style is kept for them.
test('no skill is called next: nothing in the client draws NEXT or THEN, a column beside a path or a line above it', () => {
  const said = clientFiles().filter((file) => /NextUp|RouteSide|RouteLadder|RouteRow\b|data-next(?![-\w])|data-next-up|data-route-aside|route-row-word|route-side|route-next/.test(read(file)));
  assert.deepEqual(said, []);
});

// A career's page, a company's version of it and the trees they are drawn with ask nobody to sign in: the owner
// asked for no sign-in prompt there at all, and a loose line of text that asks is the mistake he named.
test("a career's page and its trees hold no way to sign in", () => {
  const pages = [
    'client/src/components/entity/OccupationDetailView.tsx',
    'client/src/components/entity/CareerVersionView.tsx',
    'client/src/components/route/SkillGroups.tsx',
    'client/src/components/route/SkillPreview.tsx',
    'client/src/components/route/CareerLadder.tsx',
    'client/src/components/reach/CivilianReach.tsx',
    'client/src/components/layout/Tree.tsx',
    'client/src/components/layout/Panel.tsx',
  ];
  for (const file of pages) assert.doesNotMatch(read(file), /signInPath|canSignIn|sign-in|Sign in/, file);
});

// A tree's root is the page's own record, whose name the page's heading says once: no caller hands a root a
// title to say again.
test("no tree's root is given the record's name", () => {
  const roots = clientFiles()
    .flatMap((file) => [...read(file).matchAll(/<TreeRoot\b[^>]*>([^<]*)<\/TreeRoot>/g)].map((match) => `${file}: ${match[1].trim()}`))
    .sort();
  assert.deepEqual(roots, [
    "client/src/components/reach/CivilianReach.tsx: {plural(careers.length, 'career', 'careers')}",
    'client/src/components/route/CareerLadder.tsx: This career',
    'client/src/components/route/CareerLadder.tsx: This career',
    "client/src/components/route/SkillGroups.tsx: {plural(skills.length, 'skill', 'skills')}",
  ]);
});
