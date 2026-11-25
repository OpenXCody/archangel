// The Texas factories texas-hubs.json left waiting for a location, placed: the research file
// data/employers/texas-hubs-2.json held to the migration its builder generates (scripts/build-employers-sql.mjs,
// migrations/0082_texas_hubs_2.sql), to the file it comes from, and to what the placements settled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { MIGRATIONS } from '../../scripts/migrate.mjs';
// @ts-expect-error a plain script, no types
import { SUBSECTORS } from '../../scripts/build-employers-sql.mjs';

const RESEARCH = 'data/employers/texas-hubs-2.json';
const MIGRATION = 'migrations/0082_texas_hubs_2.sql';
const EARLIER = 'data/employers/texas-hubs.json';

// The research files beside it when 0082 was generated; one added later is not part of 0082.
const KNOWN_AT_0082 = [
  'posting-employers',
  'texas-chemicals',
  'texas-electronics',
  'texas-food-consumer',
  'texas-hubs',
  'texas-metals-materials',
  'texas-osha-additions',
  'texas-transport-machinery',
  'us-largest-plants',
].flatMap((name) => ['--known', `data/employers/${name}.json`]);

interface Plant {
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  subsector?: string | null;
  employees?: number | null;
  employeesYear?: number | null;
  employeesSource?: string | null;
  opened?: number | null;
  sources?: string[];
  coordinatesFrom?: string | null;
}
interface Company {
  name: string;
  alsoKnownAs?: string[];
  plants: Plant[];
}
interface Waiting {
  company: string;
  why: string;
}
interface File {
  brief: string;
  companies: Company[];
  unplaced: Waiting[];
}
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as File;
const file = read(RESEARCH);
const earlier = read(EARLIER);
const plants = file.companies.flatMap((c) => c.plants.map((p) => ({ company: c.name, ...p })));

// A load's SQL as its text, its data and the names it protects (a correction laid in later can protect one more).
const loadParts = (sql: string) => {
  const at = sql.indexOf('$el_data$');
  const end = sql.lastIndexOf('$el_data$');
  const { protect, ...data } = JSON.parse(sql.slice(at + '$el_data$'.length, end)) as { protect: string[] };
  return { text: sql.slice(0, at) + sql.slice(end), data, protect };
};

test('0082 is what the builder makes of the file, with the files known when it was generated', () => {
  const out = execFileSync('node', ['scripts/build-employers-sql.mjs', ...KNOWN_AT_0082, RESEARCH], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const run = `run: node scripts/build-employers-sql.mjs --out ${MIGRATION} ${RESEARCH}`;
  const [stored, now] = [loadParts(readFileSync(MIGRATION, 'utf8')), loadParts(out)];
  assert.equal(stored.text, now.text, run);
  assert.deepEqual(stored.data, now.data, run);
  const protectedNow = new Set(now.protect);
  for (const name of stored.protect) assert.ok(protectedNow.has(name), `${name}: protected by 0082, and still protected`);
  const report = execFileSync('node', ['scripts/build-employers-sql.mjs', '--check', RESEARCH], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(/changed: texas-hubs-2/.test(report), false, 'no value of the file is dropped or changed by the builder');
});

test('0082 guards the companies it merges away, deletes no factory, and stands in the runner after 0081', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /CREATE TRIGGER el_merge_guard BEFORE DELETE ON companies/);
  assert.match(sql, /DROP TRIGGER el_merge_guard ON companies;\s*$/);
  assert.equal(/DELETE FROM factories/i.test(sql.slice(sql.indexOf('SELECT pg_temp.el_load('))), false);
  assert.equal(MIGRATIONS.indexOf('0082_texas_hubs_2.sql'), MIGRATIONS.indexOf('0081_posting_places_2.sql') + 1);
});

test('the file is texas-hubs.json\'s waiting list, every entry placed or still waiting with why', () => {
  assert.equal(file.brief, 'texas-hubs-2');
  assert.equal(plants.length + file.unplaced.length, earlier.unplaced.length);
  const companies = (list: { company: string }[]) => list.map((entry) => entry.company).sort();
  assert.deepEqual([...plants, ...file.unplaced].map((entry) => entry.company).sort(), companies(earlier.unplaced));
  for (const w of file.unplaced) assert.ok(w.why.trim().length > 0, `${w.company}: why it still waits`);
  // Held on whether it is a factory, already a stored row, or not shown to be a factory: none is loaded.
  for (const name of ['Canon Nanotechnologies', 'Hi-Pro Feeds', 'Rheem']) {
    assert.ok(file.unplaced.some((w) => w.company === name), `${name} still waits`);
    assert.equal(file.companies.some((c) => c.name === name), false, `${name} is not loaded`);
  }
});

test('each company is named as texas-hubs.json names it, and other names are only those it gives', () => {
  const named = new Set([...earlier.companies.map((c) => c.name), ...earlier.unplaced.map((w) => w.company)]);
  for (const c of file.companies) {
    assert.ok(named.has(c.name), `${c.name}: a name texas-hubs.json uses`);
    const there = earlier.companies.find((e) => e.name === c.name);
    assert.deepEqual(c.alsoKnownAs ?? [], there?.alsoKnownAs ?? [], `${c.name}: other names as texas-hubs.json gives them`);
  }
});

test('every factory is placed in Texas, says where its point was read and what it is, and cites its sources', () => {
  for (const p of plants) {
    const where = `${p.company} / ${p.name}`;
    assert.equal(p.state, 'TX', where);
    assert.ok(p.latitude > 25.8 && p.latitude < 36.6 && p.longitude > -106.7 && p.longitude < -93.5, `${where}: in Texas`);
    assert.ok(p.coordinatesFrom && p.coordinatesFrom.trim().length > 0, `${where}: where its point was read`);
    assert.ok(SUBSECTORS.includes(p.subsector), `${where}: one of the 21 subsectors`);
    assert.ok((p.sources ?? []).length > 0 && (p.sources ?? []).every((s) => /^https?:\/\//.test(s)), `${where}: sources`);
    if (p.employees != null) {
      assert.ok(p.employeesSource && /^https?:\/\//.test(p.employeesSource), `${where}: a headcount with no source`);
      assert.ok(p.employeesYear && p.employeesYear >= 2014 && p.employeesYear <= 2026, `${where}: a headcount with no year`);
    }
  }
});

test('what the placements settled stays settled', () => {
  const plant = (company: string, name: string) => plants.find((p) => p.company === company && p.name === name);
  // A dated filing over an undated table; a filing whose hours fail gives way to the other year's.
  assert.deepEqual([plant('Fashion Glass & Mirror', 'Fashion Glass & Mirror Lockhart')?.employees, plant('Fashion Glass & Mirror', 'Fashion Glass & Mirror Lockhart')?.employeesYear], [71, 2025]);
  assert.deepEqual([plant('Crown Holdings', 'Crown Sugar Land (Fort Bend)')?.employees, plant('Crown Holdings', 'Crown Sugar Land (Fort Bend)')?.employeesYear], [126, 2024]);
  // No source ties the Batcave's opening to this address.
  assert.equal(plant('Shield AI', 'Shield AI Frisco')?.opened ?? null, null);
  // The second Lubbock establishment is not the curated Fir Ave row, and the Pampa yard is the stored Z-W INC row.
  const corrections = JSON.parse(readFileSync('data/employers/corrections.json', 'utf8')).companies;
  assert.equal(corrections['WL Plastics'].plants['WL Plastics Lubbock (Ivory Ave)'].isNew, true);
  assert.equal(corrections['WW Tank & Vessel'].plants['WW Tank & Vessel Pampa'].sameAs, 'Z-W INC');
});
