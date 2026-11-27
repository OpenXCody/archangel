import test from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS, atlasSections } from '../../shared/atlas.ts';

// A tree of skills on a career's, a version's and a job's page is a cut of the Atlas: `atlasSections` says where
// each of its groups stands. The Atlas is the one source of that order.

const g = (key: string) => ({ key });

test('skill groups are laid out as the Atlas places them: Fundamentals, then each field in the wheel\'s order', () => {
  // A welder's groups, given in the route's order.
  const sections = atlasSections(['shop-basics', 'workplace-safety', 'material-handling', 'cutting-processes', 'arc-welding', 'weld-quality', 'alloy-welding'].map(g));
  assert.deepEqual(sections.map((section) => [section.key, section.name]), [['fundamentals', 'Fundamentals'], ['welding', 'Welding']]);
  const order = (key: string) => sections.find((section) => section.key === key)!.groups.map((group) => group.key);
  const at = (slug: string) => ATLAS.groups.findIndex((place) => place.slug === slug);
  // Within a part the wheel's order holds, so a group stands before the groups built on it.
  for (const key of ['fundamentals', 'welding']) assert.deepEqual(order(key), [...order(key)].sort((a, b) => at(a) - at(b)));
  assert.equal(order('welding')[0], 'arc-welding', 'the group the others are built on leads its field');
  assert.equal(order('fundamentals').length, 3);
});

test('every group of the Atlas has one part, a core group Fundamentals and any other its field', () => {
  const sections = atlasSections(ATLAS.groups.map((place) => g(place.slug)));
  assert.equal(sections[0].key, 'fundamentals');
  assert.deepEqual(sections[0].groups.map((group) => group.key), ATLAS.core.length ? ATLAS.groups.filter((place) => place.field === null).map((place) => place.slug) : []);
  assert.deepEqual(sections.slice(1).map((section) => section.key), ATLAS.fields.map((field) => field.slug), 'the fields stand in the wheel\'s order');
  assert.equal(sections.reduce((sum, section) => sum + section.groups.length, 0), ATLAS.groups.length);
});

test('a group the Atlas does not place comes last, with no name over it, and nothing is lost', () => {
  const sections = atlasSections([g('not-a-group'), g('arc-welding'), g('shop-basics')]);
  assert.deepEqual(sections.map((section) => section.key), ['fundamentals', 'welding', 'other']);
  assert.equal(sections[2].name, null);
  assert.deepEqual(atlasSections([]), []);
});
