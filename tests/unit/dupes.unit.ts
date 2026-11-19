// Unit checks for "one row for one plant" that need no database: the
// migration is what its three files build, it carries no id of any record,
// and the words Admin Tools uses for a pair. What the SQL decides is checked
// on a database by tests/api/dupes.sh.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error a plain script, no types
import { buildSql, LOAD, MIGRATION } from '../../scripts/build-duplicates-sql.mjs';
// @ts-expect-error a plain script, no types
import { MIGRATIONS } from '../../scripts/migrate.mjs';

const stored = readFileSync(MIGRATION as string, 'utf8');

test('the migration is what the three files build', async () => {
  assert.equal(stored, await buildSql(), 'run: node scripts/build-duplicates-sql.mjs');
});

test('it is listed, after the migrations it stands on', () => {
  const list = MIGRATIONS as string[];
  assert.ok(list.includes('0051_plant_duplicates.sql'));
  // record_merges, fact_sources and the crosswalk (0043), the county a plant is placed in (0044).
  assert.ok(list.indexOf('0051_plant_duplicates.sql') > list.indexOf('0044_geo_keys.sql'));
});

test('it names no record: every decision is made on the database it meets', () => {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  assert.equal(uuid.test(stored), false, 'a record id is written into the migration');
  // An EPA registry id is twelve digits.
  assert.equal(/\b1100\d{8}\b/.test(stored), false, 'a registry id is written into the migration');
});

test('it deletes a plant only by merging it', () => {
  // The one statement that removes a plant row is plant_merge's own, after everything attached has moved.
  const deletes = stored.match(/DELETE FROM factories\b[^;]*;/g) ?? [];
  assert.deepEqual(deletes, ['DELETE FROM factories WHERE id = p_gone;']);
  // And the loader's company merge is the only thing that removes a company.
  assert.deepEqual(stored.match(/DELETE FROM companies\b[^;]*;/g), ['DELETE FROM companies WHERE id = m;']);
});

test('it runs once, under its own load, and a rehearsal undoes itself', async () => {
  assert.equal(LOAD, 'plant-duplicates');
  assert.equal(stored.trimEnd().endsWith("SELECT pg_temp.pd_run('plant-duplicates');"), true);
  const rehearsal: string = await buildSql({ rehearse: true });
  assert.match(rehearsal, /SELECT \* FROM pg_temp\.pd_rehearse\(\$pd_schema\$/);
  assert.equal(rehearsal.includes("SELECT pg_temp.pd_run('plant-duplicates');"), false, 'a rehearsal must not run the cleanup for good');
  // The schema rides inside the rehearsal as text, so nothing is created outside the block that is undone.
  assert.equal(rehearsal.indexOf('CREATE TABLE IF NOT EXISTS plants_apart') > rehearsal.indexOf('$pd_schema$'), true);
});
