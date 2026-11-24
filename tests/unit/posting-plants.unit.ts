// The plants behind employers' postings: the research file, the rows that are
// not the employers', and the places decided by the data, each held to the
// migration its builder generates (scripts/build-employers-sql.mjs,
// scripts/build-not-theirs-sql.mjs, scripts/build-posting-places-sql.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { checkRows, buildSql as notTheirsSql } from '../../scripts/build-not-theirs-sql.mjs';
import { checkPlaces, cityKey, researchPlants, sourcesForSql, buildSql as placesSql } from '../../scripts/build-posting-places-sql.mjs';
import { MIGRATIONS } from '../../scripts/migrate.mjs';

const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const RESEARCH = 'data/employers/posting-employers.json';
const EMPLOYERS_MIGRATION = 'migrations/0065_posting_employers.sql';
const NOT_THEIRS = 'data/employers/not-theirs.json';
const NOT_THEIRS_MIGRATION = 'migrations/0066_rows_not_theirs.sql';
const PLACES = 'data/employers/places.json';
const PLACES_MIGRATION = 'migrations/0067_posting_places.sql';

interface Plant {
  name: string;
  city: string;
  state: string;
  employees?: number;
  employeesSource?: string;
  employeesYear?: number;
  sources?: string[];
  sameAs?: string;
}
interface Company {
  name: string;
  parent?: string;
  alsoKnownAs?: string[];
  plants?: Plant[];
}
interface Registry {
  employers: { slug: string; employer: string; company: string; also?: string[] }[];
}

test('the research file loads as the migration says, and the builder changes nothing in it', () => {
  const out = execFileSync('node', ['scripts/build-employers-sql.mjs', RESEARCH], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  assert.equal(readFileSync(EMPLOYERS_MIGRATION, 'utf8'), out, `run: node scripts/build-employers-sql.mjs --out ${EMPLOYERS_MIGRATION} ${RESEARCH}`);
  const report = execFileSync('node', ['scripts/build-employers-sql.mjs', '--check', RESEARCH], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(/changed: posting-employers/.test(report), false, 'no value of the file is dropped or changed by the builder');
});

test('every plant the file adds says where it was read, and every headcount its source and year', () => {
  const { companies } = read<{ companies: Company[] }>(RESEARCH);
  for (const c of companies) {
    for (const p of c.plants ?? []) {
      assert.ok((p.sources ?? []).length > 0 && (p.sources ?? []).every((s) => /^https?:\/\//.test(s)), `${c.name} / ${p.name}: sources`);
      if (p.employees !== undefined) {
        assert.ok(p.employeesSource && /^https?:\/\//.test(p.employeesSource), `${c.name} / ${p.name}: a headcount with no source`);
        assert.ok(p.employeesYear, `${c.name} / ${p.name}: a headcount with no year`);
      }
    }
  }
});

test('the four employers the registry named and we did not list are companies of the file, under the registry\'s names', () => {
  const { companies } = read<{ companies: Company[] }>(RESEARCH);
  const names = new Set(companies.map((c) => c.name));
  for (const name of ['Relativity Space', 'Rocket Lab', 'Apptronik', 'Hermeus']) {
    assert.ok(names.has(name), name);
    assert.ok((companies.find((c) => c.name === name)?.plants ?? []).length > 0, `${name} has plants`);
  }
  const registry = read<Registry>('data/employers/boards.json');
  for (const name of ['Relativity Space', 'Rocket Lab', 'Apptronik', 'Hermeus']) assert.ok(registry.employers.some((e) => e.company === name), name);
});

test('the rows that are not the employers\' are moved or merged as the migration says', () => {
  const file = read<{ rows: Record<string, unknown>[]; leftInPlace: Record<string, unknown>[] }>(NOT_THEIRS);
  assert.deepEqual(checkRows(file), []);
  const migration = readFileSync(NOT_THEIRS_MIGRATION, 'utf8');
  assert.equal(migration, notTheirsSql(file), `run: node scripts/build-not-theirs-sql.mjs --out ${NOT_THEIRS_MIGRATION}`);
  assert.equal(/DELETE FROM factories/i.test(migration), false, 'no plant is deleted');
  // A row left in place for the owner (a dealer, an office, ready-mix, a business sold long ago) is not in the migration at all.
  assert.ok(file.leftInPlace.length > 0);
  for (const row of file.leftInPlace) assert.equal(migration.includes(String(row.id)), false, `${String(row.name)} is left in place`);
});

test('a row file is refused when it is not one decision per row, or moves a row that is no plant', () => {
  const row = { id: '00000000-0000-4000-8000-000000000001', from: 'General Motors', name: 'CADILLAC CASTING, INCORPORATED', why: 'A foundry of its own.' };
  assert.deepEqual(checkRows({ rows: [{ ...row, to: 'Cadillac Casting' }] }), []);
  assert.equal(checkRows({ rows: [{ ...row, why: 'A car dealer.', to: 'Bob Myers Buick' }] }).length, 1, 'a dealer is not given a company of its own');
  assert.equal(checkRows({ rows: [{ ...row, why: 'Its ready-mix plant.', to: 'Concrete Supply Co' }] }).length, 1, 'nor ready-mix');
  assert.deepEqual(checkRows({ rows: [], leftInPlace: [{ ...row, why: 'A car dealer.', leftBecause: 'a dealer, for the owner' }] }), [], 'it is left in place');
  assert.equal(checkRows({ rows: [], leftInPlace: [{ ...row }] }).length, 1, 'a row left in place says why');
  assert.equal(checkRows({ rows: [{ ...row, to: 'Cadillac Casting' }], leftInPlace: [{ ...row, leftBecause: 'x' }] }).length, 1, 'not both');
  assert.equal(checkRows({ rows: [row] }).length, 1, 'neither to nor mergeInto');
  assert.equal(checkRows({ rows: [{ ...row, to: 'X', mergeInto: '00000000-0000-4000-8000-000000000002', intoName: 'X' }] }).length, 1, 'both');
  assert.equal(checkRows({ rows: [{ ...row, to: 'general motors' }] }).length, 1, 'to the company it is under');
  assert.equal(checkRows({ rows: [{ ...row, to: 'A' }, { ...row, to: 'B' }] }).length, 1, 'one row twice');
  assert.ok(checkRows({ rows: [{ ...row, mergeInto: row.id, intoName: 'X' }] }).length >= 1, 'into itself');
});

test('the places are the registry\'s employers, each pointed plant named once, and the migration is what the file builds', async () => {
  const file = read<{ places: Record<string, unknown>[] }>(PLACES);
  const registry = read<Registry>('data/employers/boards.json');
  const plants = await researchPlants();
  assert.deepEqual(checkPlaces(file, registry, plants), []);
  assert.equal(readFileSync(PLACES_MIGRATION, 'utf8'), placesSql(file, registry), `run: node scripts/build-posting-places-sql.mjs --out ${PLACES_MIGRATION}`);
  const employers = new Set(registry.employers.map((e) => e.employer));
  for (const place of file.places) assert.ok(employers.has(String(place.employer)), String(place.employer));
});

test('a places file is refused for an employer we do not read, a plant named twice or not at all, and a person\'s words in place of a decision', () => {
  const registry: Registry = { employers: [{ slug: 'acme', employer: 'Acme', company: 'Acme' }] };
  const plants = [
    { company: 'Acme', name: 'Acme Works', city: 'Postville', state: 'NV' },
    { company: 'Acme', name: 'Acme Twin', city: 'Twin Forks', state: 'NV' },
    { company: 'Acme', name: 'Acme Twin', city: 'Other Forks', state: 'NV' },
  ];
  const place = { employer: 'Acme', city: 'Next Door', state: 'NV', why: 'The plant stands over the town line.', sources: ['https://example.com/'] };
  assert.deepEqual(checkPlaces({ places: [{ ...place, decision: 'point', company: 'Acme', plant: 'Acme Works' }] }, registry, plants), []);
  assert.deepEqual(checkPlaces({ places: [{ ...place, decision: 'leave', kind: 'office' }] }, registry, plants), []);
  assert.equal(checkPlaces({ places: [{ ...place, employer: 'Nobody', decision: 'leave', kind: 'office' }] }, registry, plants).length, 1);
  assert.equal(checkPlaces({ places: [{ ...place, decision: 'point', company: 'Acme', plant: 'Acme Twin' }] }, registry, plants).length, 1, 'named twice');
  assert.deepEqual(checkPlaces({ places: [{ ...place, decision: 'point', company: 'Acme', plant: 'Acme Twin', plantCity: 'Twin Forks' }] }, registry, plants), []);
  assert.equal(checkPlaces({ places: [{ ...place, decision: 'point', company: 'Acme', plant: 'Acme Gone' }] }, registry, plants).length, 1, 'not named');
  assert.deepEqual(checkPlaces({ places: [{ ...place, decision: 'point', company: 'Acme', plant: 'ACME GONE', stored: true }] }, registry, plants), [], 'a stored name');
  assert.equal(checkPlaces({ places: [{ ...place, decision: 'leave' }] }, registry, plants).length, 1, 'a place left says its kind');
  assert.equal(checkPlaces({ places: [{ ...place, decision: 'maybe' }] }, registry, plants).length, 1);
  assert.equal(checkPlaces({ places: [{ ...place, decision: 'leave', kind: 'office' }, { ...place, city: 'NEXT DOOR', decision: 'leave', kind: 'office' }] }, registry, plants).length, 1, 'twice');
});

test('a city is compared as posting_city_key compares it', () => {
  assert.equal(cityKey('Saint Louis'), 'st louis');
  assert.equal(cityKey('St. Louis'), 'st louis');
  assert.equal(cityKey('Fort Collins'), 'ft collins');
  assert.equal(cityKey('Winston-Salem'), 'winston salem');
});

test('the three stand in order in the runner\'s list, after the migrations they read', () => {
  const at = (name: string) => MIGRATIONS.indexOf(name);
  assert.ok(at('0054_job_postings.sql') < at('0065_posting_employers.sql'));
  assert.ok(at('0065_posting_employers.sql') < at('0066_rows_not_theirs.sql'));
  assert.ok(at('0066_rows_not_theirs.sql') < at('0067_posting_places.sql'));
  assert.ok(at('0067_posting_places.sql') < at('0068_skill_taxonomy_4.sql'));
});

test('a place decided by the data names no person and never overrides one a person decided, or took back', () => {
  const sql = readFileSync(PLACES_MIGRATION, 'utf8');
  assert.match(sql, /IF r\.decided_by IS NOT NULL OR pg_temp\.pp_person_decided\(/);
  assert.match(sql, /'postings place waits again'/, 'taking a decision back is a decision');
  assert.equal(sql.match(/WHERE posting_places\.decided_by IS NULL;/g)?.length, 2, 'nor one a person makes while it runs');
  assert.doesNotMatch(sql, /decided_by = [^N]/);
  assert.match(sql, /VALUES \(NULL, '', 'factory'/, 'the audit line names no person');
});

test('the places migration sets a place aside from the near rule, and registers the sources it needs as the runner would', () => {
  const sql = readFileSync(PLACES_MIGRATION, 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION posting_decide\(/);
  assert.match(sql, /x\.place_key = rp\.place_key AND x\.status = 'left'/);
  assert.ok(sql.includes(readFileSync('scripts/posting-decide.sql', 'utf8').trimEnd()), 'the function is scripts/posting-decide.sql');
  const file = read<{ places: { employer: string }[] }>(PLACES);
  const registry = read<Registry>('data/employers/boards.json');
  const sources = sourcesForSql(file, registry) as { slug: string; kind: string; company: string }[];
  const named = new Set(file.places.map((p) => registry.employers.find((e) => e.employer === p.employer)?.slug));
  assert.deepEqual(sources.map((s) => s.slug).sort(), [...named].map((slug) => `postings-${slug}`).sort());
  for (const s of sources) assert.equal(s.kind, 'job', s.slug);
  assert.match(sql, /ON CONFLICT \(slug\) DO NOTHING/, 'an existing source is never changed');
});
