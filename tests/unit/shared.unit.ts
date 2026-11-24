// Unit checks for the pure functions the app leans on. Node's own test
// runner, through tsx: `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { packPins, unpackPins, type PinSource } from '../../shared/pins.js';
import { industryLabel } from '../../shared/industry.js';
import { formatCompanyName, formatFactoryName } from '../../shared/displayName.js';
import { milesBetween, focusArea, FOCUS_AREAS } from '../../shared/scope.js';
import { pageLimit, pageOffset } from '../../server/lib/paging.js';
import { containing, likeLiteral } from '../../server/lib/like.js';
import { int, rowsOf, text } from '../../server/lib/rows.js';
// @ts-expect-error a plain script, no types
import { buildDecision, MIGRATIONS } from '../../scripts/migrate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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
  // A fraction is its whole part: LIMIT takes a whole number, and 1.5 reached the database as it was.
  assert.equal(pageLimit('1.5', 100, 500), 1);
  assert.equal(pageLimit('2.9', 12, 30), 2);
  assert.equal(pageOffset('-5'), 0);
  assert.equal(pageOffset('99999999999999999999'), 1_000_000);
  assert.equal(pageOffset('40'), 40);
});

test('typed text inside a LIKE pattern means itself', () => {
  assert.equal(likeLiteral('plain'), 'plain');
  assert.equal(likeLiteral('100%'), '100\\%');
  assert.equal(likeLiteral('a_b\\c'), 'a\\_b\\\\c');
  assert.equal(containing('50%_off'), '%50\\%\\_off%');
});

test('the rows of a statement are an array, and a column reads as text or as a number', () => {
  assert.deepEqual(rowsOf<{ n: number }>(new Set([{ n: 1 }, { n: 2 }])), [{ n: 1 }, { n: 2 }]);
  assert.equal(text(' Welding '), ' Welding ');
  assert.equal(text('   '), null);
  assert.equal(text(5), null);
  assert.equal(int('7'), 7);
  assert.equal(int(null), 0);
  assert.equal(int('seven'), 0);
});

test('focus areas are found by id, and distance is in miles', () => {
  assert.ok(FOCUS_AREAS.length >= 1);
  assert.equal(focusArea(FOCUS_AREAS[0].id), FOCUS_AREAS[0]);
  assert.equal(focusArea('nowhere'), undefined);
  const austinToDallas = milesBetween(30.2672, -97.7431, 32.7767, -96.797);
  assert.ok(austinToDallas > 175 && austinToDallas < 195, `Austin to Dallas is about 182 miles, got ${austinToDallas}`);
});

test("a focus area is its metro area's counties, and the ring the server counts with is the line the map draws", () => {
  type County = { fips: string; cbsa: string | null; lat: number; lng: number };
  const counties = (JSON.parse(readFileSync(path.join(ROOT, 'data/geo/counties.json'), 'utf8')) as { counties: County[] }).counties;
  const inside = ([x, y]: [number, number], ring: [number, number][]) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  assert.deepEqual(FOCUS_AREAS.map((a) => a.id), ['austin', 'houston', 'dfw', 'san-antonio']);
  for (const area of FOCUS_AREAS) {
    const feature = JSON.parse(readFileSync(path.join(ROOT, 'client/public', area.boundaryUrl), 'utf8')).features[0];
    assert.equal(feature.id, area.id);
    assert.equal(feature.properties.name, area.name);
    const polygons = feature.geometry.coordinates as [number, number][][][];
    assert.equal(polygons.length, 1, `${area.id}: one outline, which the server counts with`);
    assert.deepEqual(area.ring, polygons[0][0], `${area.id}: the ring in shared/scope.ts is the file's outline`);
    const points = polygons.flat(2);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    assert.deepEqual(area.bounds, [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], `${area.id}: the box is the outline's`);
    assert.ok(inside([area.center.longitude, area.center.latitude], area.ring), `${area.id}: its centre is inside it`);
    // Its counties are one metro area's, all of them, as the Census Bureau delineates it (data/geo): the
    // outline holds the inside point of each of them and of no other county.
    const fips: string[] = [...feature.properties.fips].sort();
    const metros = new Set(counties.filter((c) => fips.includes(c.fips)).map((c) => c.cbsa));
    assert.equal(metros.size, 1, `${area.id}: its counties are of one metro area`);
    const [cbsa] = [...metros];
    assert.deepEqual(counties.filter((c) => c.cbsa === cbsa).map((c) => c.fips).sort(), fips, `${area.id}: every county of metro ${cbsa}`);
    assert.deepEqual(counties.filter((c) => inside([c.lng, c.lat], area.ring)).map((c) => c.fips).sort(), fips, `${area.id}: the outline holds its counties and no other`);
  }
});

test('a build migrates only when it is the production build on Vercel', () => {
  assert.deepEqual(buildDecision({ VERCEL: '1', VERCEL_ENV: 'production' }, '/vercel/path0'), { run: true });
  assert.equal(buildDecision({ VERCEL: '1', VERCEL_ENV: 'preview' }, '/vercel/path0').run, false);
  assert.equal(buildDecision({}, '/home/dev/archangel').run, false, 'a build on a developer machine or in CI');
  const unsure = buildDecision({ VERCEL: '1' }, '/vercel/path0');
  assert.equal(unsure.run, true, 'on Vercel without VERCEL_ENV the build migrates, as every build used to');
  assert.match(unsure.why, /VERCEL_ENV is not set/);
});

test('the migration list is in order, with no name twice', () => {
  assert.deepEqual([...MIGRATIONS].sort(), MIGRATIONS);
  assert.equal(new Set(MIGRATIONS).size, MIGRATIONS.length);
  for (const name of MIGRATIONS) assert.match(name, /^\d{4}_[a-z0-9_]+\.sql$/);
});
