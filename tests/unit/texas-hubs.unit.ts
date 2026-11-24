// Texas's hubs: the research file data/employers/texas-hubs.json held to the migration its builder generates
// (scripts/build-employers-sql.mjs, migrations/0076_texas_hubs.sql), and to the rules its facts were read by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { MIGRATIONS } from '../../scripts/migrate.mjs';

const RESEARCH = 'data/employers/texas-hubs.json';
const MIGRATION = 'migrations/0076_texas_hubs.sql';

// The research files beside it when 0076 was generated; one added later is not part of 0076.
const KNOWN_AT_0076 = [
  'posting-employers',
  'texas-chemicals',
  'texas-electronics',
  'texas-food-consumer',
  'texas-metals-materials',
  'texas-osha-additions',
  'texas-transport-machinery',
  'us-largest-plants',
].flatMap((name) => ['--known', `data/employers/${name}.json`]);

interface Plant {
  name: string;
  latitude: number;
  longitude: number;
  employees?: number | null;
  employeesYear?: number | null;
  employeesSource?: string | null;
  sources?: string[];
  coordinatesFrom?: string | null;
}
interface Company {
  name: string;
  parent?: string | null;
  plants: Plant[];
}
interface File {
  companies: Company[];
  unplaced: { company: string; name?: string; plant?: string }[];
  held: { company: string; name: string; why: string }[];
}
const file = JSON.parse(readFileSync(RESEARCH, 'utf8')) as File;
const plants = file.companies.flatMap((c) => c.plants.map((p) => ({ company: c.name, ...p })));

// A load's SQL as its text, its data and the names it protects (a correction laid in later can protect one more).
const loadParts = (sql: string) => {
  const at = sql.indexOf('$el_data$');
  const end = sql.lastIndexOf('$el_data$');
  const { protect, ...data } = JSON.parse(sql.slice(at + '$el_data$'.length, end)) as { protect: string[] };
  return { text: sql.slice(0, at) + sql.slice(end), data, protect };
};

test('0076 is what the builder makes of the file, with the files known when it was generated', () => {
  const out = execFileSync('node', ['scripts/build-employers-sql.mjs', ...KNOWN_AT_0076, RESEARCH], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const run = `run: node scripts/build-employers-sql.mjs --out ${MIGRATION} ${RESEARCH}`;
  const [stored, now] = [loadParts(readFileSync(MIGRATION, 'utf8')), loadParts(out)];
  assert.equal(stored.text, now.text, run);
  assert.deepEqual(stored.data, now.data, run);
  const protectedNow = new Set(now.protect);
  for (const name of stored.protect) assert.ok(protectedNow.has(name), `${name}: protected by 0076, and still protected`);
  const report = execFileSync('node', ['scripts/build-employers-sql.mjs', '--check', RESEARCH], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(/changed: texas-hubs/.test(report), false, 'no value of the file is dropped or changed by the builder');
});

test('0076 guards the companies it merges away, and stands in the runner before 0077', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /CREATE TRIGGER el_merge_guard BEFORE DELETE ON companies/);
  assert.match(sql, /DROP TRIGGER el_merge_guard ON companies;\s*$/);
  assert.equal(/DELETE FROM factories/i.test(sql.slice(sql.indexOf('SELECT pg_temp.el_load('))), false);
  const at = MIGRATIONS.indexOf('0076_texas_hubs.sql');
  assert.ok(at > MIGRATIONS.indexOf('0069_company_marks.sql') && at < MIGRATIONS.indexOf('0077_military_employers_2.sql'));
});

test('every factory says where it was read, and every headcount its source and year', () => {
  for (const p of plants) {
    assert.ok((p.sources ?? []).length > 0 && (p.sources ?? []).every((s) => /^https?:\/\//.test(s)), `${p.company} / ${p.name}: sources`);
    if (p.employees != null) {
      assert.ok(p.employeesSource && /^https?:\/\//.test(p.employeesSource), `${p.company} / ${p.name}: a headcount with no source`);
      assert.ok(p.employeesYear && p.employeesYear >= 2014 && p.employeesYear <= 2026, `${p.company} / ${p.name}: a headcount with no year`);
    }
  }
});

test('no point is one whose terms forbid keeping it, and none is OpenStreetMap\'s', () => {
  // Williamson County's own address locator runs on ArcGIS software and is the county's public service; the
  // ArcGIS World Geocoding Service and OpenStreetMap's searches are not sources of a point here.
  const forbidden = /openstreetmap|nominatim|photon\.komoot|geocode\.arcgis\.com|World Geocod|\bEsri\b/i;
  for (const p of plants) {
    assert.equal(forbidden.test(p.coordinatesFrom ?? ''), false, `${p.company} / ${p.name}: ${p.coordinatesFrom}`);
    for (const s of p.sources ?? []) assert.equal(forbidden.test(s), false, `${p.company} / ${p.name}: ${s}`);
    assert.ok(p.latitude > 25.8 && p.latitude < 36.6 && p.longitude > -106.7 && p.longitude < -93.5, `${p.company} / ${p.name}: in Texas`);
  }
});

test('what the review settled stays settled', () => {
  const plant = (company: string, name: string) => plants.find((p) => p.company === company && p.name === name);
  // Undated economic development tables gave way to dated filings.
  assert.deepEqual([plant('Reynolds Consumer Products', 'Reynolds Temple')?.employees, plant('Reynolds Consumer Products', 'Reynolds Temple')?.employeesYear], [280, 2025]);
  assert.deepEqual([plant('Texas Hydraulics', 'Texas Hydraulics Temple')?.employees, plant('Texas Hydraulics', 'Texas Hydraulics Temple')?.employeesYear], [278, 2025]);
  assert.deepEqual([plant('Pure Castings', 'Pure Castings Lockhart')?.employees, plant('Pure Castings', 'Pure Castings Lockhart')?.employeesYear], [57, 2025]);
  // A filing whose hours rule the figure out is not written.
  assert.equal(plant('Alegacy Equipment', 'Alegacy Equipment Waller')?.employees ?? null, null);
  assert.equal(plant('SAF-Holland', 'SAF-Holland Wylie')?.employees, 165);
  // A headquarters filing is held, not loaded.
  assert.ok(file.held.some((h) => h.name === 'Axiom Space Gemini Street'));
  assert.equal(plants.some((p) => p.name === 'Axiom Space Gemini Street'), false);
  // A joint venture names no parent the loader would create.
  assert.equal(file.companies.find((c) => c.name === 'Hiland Dairy')?.parent ?? null, null);
  assert.equal(file.companies.find((c) => c.name === 'ZT Systems')?.parent, 'Sanmina');
});
