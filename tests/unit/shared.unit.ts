// Unit checks for the pure functions the app leans on. Node's own test
// runner, through tsx: `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packPins, unpackPins, type PinSource } from '../../shared/pins.js';
import { industryLabel } from '../../shared/industry.js';
import { formatCompanyName, formatFactoryName } from '../../shared/displayName.js';
import { milesBetween, focusArea, FOCUS_AREAS } from '../../shared/scope.js';
import { pageLimit, pageOffset } from '../../server/lib/paging.js';
// @ts-expect-error a plain script, no types
import { buildDecision, MIGRATIONS } from '../../scripts/migrate.mjs';

const pin = (over: Partial<PinSource>): PinSource => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Plant',
  latitude: '30.267153',
  longitude: '-97.743057',
  companyId: 'c1',
  companyName: 'Acme',
  tier: 2,
  industry: 'Food Manufacturing',
  city: 'Austin',
  state: 'TX',
  openJobs: 0,
  ...over,
});

test('pins survive the trip to the map', () => {
  const rows = [pin({}), pin({ id: 'b', name: 'Second', openJobs: 3 }), pin({ id: 'c', companyId: null, companyName: null, industry: null, tier: 0 })];
  const packed = packPins(rows);
  assert.equal(packed.companies.length, 1, 'a company is said once however many plants it has');
  assert.equal(packed.industries.length, 1);
  const { features } = unpackPins(JSON.parse(JSON.stringify(packed)));
  assert.equal(features.length, 3);
  assert.deepEqual(features[0].geometry.coordinates, [-97.74306, 30.26715], 'coordinates are rounded to five places');
  assert.deepEqual(features[1].properties, { id: 'b', name: 'Second', companyName: 'Acme', tier: 2, industry: 'Food Manufacturing', city: 'Austin', state: 'TX', openJobs: 3 });
  assert.equal(features[2].properties.companyName, null);
  assert.equal(features[2].properties.industry, null);
  assert.equal(features[2].properties.tier, 0);
});

test('a row without usable coordinates is left off the map', () => {
  assert.equal(packPins([pin({ latitude: 'abc' }), pin({ longitude: '' })]).pins.length, 0);
});

test('industries are said in plain words, the same everywhere', () => {
  assert.equal(industryLabel('Fabricated Metal Product Manufacturing'), 'Fabricated metal products');
  assert.equal(industryLabel('Nonmetallic Mineral Product Manufacturing'), 'Glass, cement and minerals');
  assert.equal(industryLabel('Textile Mills'), 'Textile mills');
  assert.equal(industryLabel('Widget Manufacturing'), 'Widget', 'an unknown subsector loses only its last word');
  assert.equal(industryLabel('Aerospace & Defense'), 'Aerospace & Defense');
});

test('names are shown, not shouted, and never empty', () => {
  assert.equal(typeof formatCompanyName(null), 'string');
  assert.equal(typeof formatFactoryName(undefined), 'string');
  const shown = formatFactoryName('MODERN FORGE INDIANA');
  assert.notEqual(shown, 'MODERN FORGE INDIANA', 'a name in capitals is recased');
  assert.equal(shown.toLowerCase(), 'modern forge indiana');
});

test('a list page is at least one row and never the whole table', () => {
  assert.equal(pageLimit('-1', 20, 100), 1);
  assert.equal(pageLimit('5000', 20, 100), 100);
  assert.equal(pageLimit(undefined, 20, 100), 20);
  assert.equal(pageLimit('abc', 20, 100), 20);
  assert.equal(pageOffset('-5'), 0);
  assert.equal(pageOffset('99999999999999999999'), 1_000_000);
  assert.equal(pageOffset('40'), 40);
});

test('focus areas are found by id, and distance is in miles', () => {
  assert.ok(FOCUS_AREAS.length >= 1);
  assert.equal(focusArea(FOCUS_AREAS[0].id), FOCUS_AREAS[0]);
  assert.equal(focusArea('nowhere'), undefined);
  const austinToDallas = milesBetween(30.2672, -97.7431, 32.7767, -96.797);
  assert.ok(austinToDallas > 175 && austinToDallas < 195, `Austin to Dallas is about 182 miles, got ${austinToDallas}`);
});

test('a build migrates only when it is the production build on Vercel', () => {
  assert.deepEqual(buildDecision({ VERCEL: '1', VERCEL_ENV: 'production' }, '/vercel/path0'), { run: true });
  assert.equal(buildDecision({ VERCEL: '1', VERCEL_ENV: 'preview' }, '/vercel/path0').run, false);
  assert.equal(buildDecision({ VERCEL: '1', VERCEL_ENV: 'preview' }, '/vercel/path0').fail, undefined);
  assert.equal(buildDecision({}, '/home/dev/archangel').run, false, 'a build on a developer machine or in CI');
  assert.equal(buildDecision({}, '/home/dev/archangel').fail, undefined);
  const unsure = buildDecision({ VERCEL: '1' }, '/vercel/path0');
  assert.equal(unsure.run, false);
  assert.equal(unsure.fail, true, 'on Vercel without VERCEL_ENV the build stops rather than guess');
});

test('the migration list is in order, with no name twice', () => {
  assert.deepEqual([...MIGRATIONS].sort(), MIGRATIONS);
  assert.equal(new Set(MIGRATIONS).size, MIGRATIONS.length);
  for (const name of MIGRATIONS) assert.match(name, /^\d{4}_[a-z0-9_]+\.sql$/);
});
