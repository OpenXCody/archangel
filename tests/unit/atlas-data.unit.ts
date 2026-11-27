// The Atlas's structure (data/skills/atlas.json) held to the skill taxonomy
// (data/skills/taxonomy.json), and the typed door to it (shared/atlas.ts).
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ATLAS, type AtlasPlace } from '../../shared/atlas';

interface TaxonomyFile {
  domains: { slug: string; groups: { slug: string; name: string; skills: { name: string; level: number }[] }[] }[];
}
interface AtlasFile {
  note: string;
  core: string[];
  fields: { slug: string; name: string }[];
  groups: AtlasPlace[];
}

const taxonomy = JSON.parse(readFileSync('data/skills/taxonomy.json', 'utf8')) as TaxonomyFile;
const file = JSON.parse(readFileSync('data/skills/atlas.json', 'utf8')) as AtlasFile;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// The most groups one group is the basis of: the wheel has room for six spokes from one bar.
const FAN = 6;
const RINGS = 5;

const taxonomyGroups = taxonomy.domains.flatMap((domain) => domain.groups);
const at = new Map(file.groups.map((group, index) => [group.slug, index]));
const place = (slug: string): AtlasPlace => file.groups[at.get(slug) ?? -1];
const core = file.groups.filter((group) => group.on === null);
const builtOn = (slug: string) => file.groups.filter((group) => group.on === slug);

test('the door gives the file as it is written', () => {
  assert.deepEqual(ATLAS.core, file.core);
  assert.deepEqual(ATLAS.fields, file.fields);
  assert.deepEqual(ATLAS.groups, file.groups);
  assert.ok(file.note.trim().length > 0, 'the file says what it is');
  for (const group of file.groups) {
    assert.deepEqual(Object.keys(group).filter((key) => !['slug', 'ring', 'on', 'field', 'basedOn'].includes(key)), [], `${group.slug} has only the keys the door types`);
  }
});

test('every group of the taxonomy is placed exactly once, and nothing else is', () => {
  assert.equal(at.size, file.groups.length, 'no group is placed twice');
  assert.deepEqual([...at.keys()].sort(), taxonomyGroups.map((group) => group.slug).sort());
  assert.equal(file.groups.length, 201);
});

test('twelve groups are the core: ring 1, built on nothing, in no field', () => {
  assert.equal(core.length, 12);
  // `core` is those twelve, in the order they stand round the wheel.
  assert.deepEqual(file.core, core.map((group) => group.slug));
  for (const group of core) {
    assert.equal(group.ring, 1, `${group.slug} is on ring 1`);
    assert.equal(group.field, null, `${group.slug} is in no field`);
    assert.equal(group.basedOn, undefined, `${group.slug} has no line inward to read`);
  }
  // Ring 1 is the core and nothing else.
  assert.deepEqual(file.groups.filter((group) => group.ring === 1), core);
  // The centre is the Fundamentals: every core group holds a skill of level 1.
  for (const group of core) {
    const skills = taxonomyGroups.find((item) => item.slug === group.slug)?.skills ?? [];
    assert.ok(skills.some((skill) => skill.level === 1), `${group.slug} holds a Fundamentals skill`);
  }
});

test('every other group is built on a group that stands earlier, on a smaller ring, and is in a field', () => {
  const fields = new Set(file.fields.map((field) => field.slug));
  for (const group of file.groups) {
    assert.ok(Number.isInteger(group.ring) && group.ring >= 1 && group.ring <= RINGS, `${group.slug} is on ring ${group.ring}`);
    if (group.on === null) continue;
    assert.ok(typeof group.field === 'string' && fields.has(group.field), `${group.slug} is in a field that exists: ${group.field}`);
    const basis = at.get(group.on);
    assert.ok(basis !== undefined, `${group.slug} is built on a group that exists: ${group.on}`);
    assert.ok(basis < at.get(group.slug)!, `${group.on} stands before ${group.slug}`);
    assert.ok(place(group.on).ring < group.ring, `${group.slug} (ring ${group.ring}) is further out than ${group.on} (ring ${place(group.on).ring})`);
    if (group.basedOn !== undefined) assert.match(group.basedOn, /^\d+ of \d+ (civilian|military|civilian and military) careers$/, `${group.slug}: ${group.basedOn}`);
  }
  assert.deepEqual([...new Set(file.groups.map((group) => group.ring))].sort(), [1, 2, 3, 4, 5]);
});

test('the order is a walk of the tree: every group\'s subtree is one unbroken run of the file', () => {
  const size = (slug: string): number => 1 + builtOn(slug).reduce((sum, group) => sum + size(group.slug), 0);
  const within = (slug: string, top: string): boolean => slug === top || (place(slug).on !== null && within(place(slug).on!, top));
  for (const group of file.groups) {
    const from = at.get(group.slug)!;
    const run = file.groups.slice(from, from + size(group.slug));
    assert.ok(run.every((item) => within(item.slug, group.slug)), `the groups built on ${group.slug} stand directly after it, with nothing between`);
  }
  // So the core groups' subtrees, one after another, are the whole file.
  assert.equal(core.reduce((sum, group) => sum + size(group.slug), 0), file.groups.length);
  assert.equal(file.groups[0].on, null, 'the file opens on a core group');
});

test('no group is the basis of more than six others', () => {
  const widest = Math.max(...file.groups.map((group) => builtOn(group.slug).length));
  assert.ok(widest <= FAN, `one group is the basis of ${widest}`);
  for (const group of file.groups) assert.ok(builtOn(group.slug).length <= FAN, `${group.slug} is the basis of ${builtOn(group.slug).length}`);
});

test('the fields: each named once, each used, each one unbroken arc of the wheel', () => {
  assert.equal(file.fields.length, 33);
  assert.equal(new Set(file.fields.map((field) => field.slug)).size, file.fields.length, 'no field slug twice');
  assert.equal(new Set(file.fields.map((field) => field.name)).size, file.fields.length, 'no field name twice');
  for (const field of file.fields) {
    assert.match(field.slug, SLUG, `field slug ${field.slug}`);
    assert.equal(field.slug, field.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), `${field.name}: its slug is its name in lower case with hyphens`);
    assert.ok(file.groups.some((group) => group.field === field.slug), `${field.name} has a group`);
  }
  // A group built on a group outside the core is in that group's field, so a field is whole branches.
  for (const group of file.groups) {
    if (group.on === null || place(group.on).on === null) continue;
    assert.equal(group.field, place(group.on).field, `${group.slug} is in the field of ${group.on}`);
  }
  // Round the wheel the fields come one after another, none in two places, in the order the file lists them.
  const runs: string[] = [];
  for (const group of file.groups) if (group.field !== null && runs.at(-1) !== group.field) runs.push(group.field);
  assert.deepEqual(runs, file.fields.map((field) => field.slug));
});
