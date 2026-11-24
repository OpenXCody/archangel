// The makes of the skills (data/skills/makes.json), the checks their builder
// makes (scripts/build-makes-sql.mjs) and the migration made from them.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface MakesFile {
  note: string;
  skills: { skill: string; makes: string[] }[];
}

const BUILDER = 'scripts/build-makes-sql.mjs';
const MAKES = 'data/skills/makes.json';
const CATALOGUE = 'data/skills/catalogue.json';
// The makes' latest migration. 0050 was the first and 0058 the second; each is as it was applied.
const MIGRATION = 'migrations/0072_skill_makes_3.sql';

const makes = JSON.parse(readFileSync(MAKES, 'utf8')) as MakesFile;
const catalogue = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as { skills: { name: string; tools?: string[] }[] };
const copy = (): MakesFile => JSON.parse(JSON.stringify(makes)) as MakesFile;

/** Runs the builder's --check over a makes file and gives back how it ended and what it said. */
function check(file: MakesFile): { ok: boolean; said: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'makes-check-'));
  try {
    const input = path.join(dir, 'makes.json');
    writeFileSync(input, JSON.stringify(file));
    const run = spawnSync(process.execPath, [BUILDER, '--check', input, CATALOGUE], { encoding: 'utf8' });
    return { ok: run.status === 0, said: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the makes migration is what the makes file generates', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'makes-sql-'));
  try {
    const out = path.join(dir, 'out.sql');
    execFileSync(process.execPath, [BUILDER, MAKES, CATALOGUE, out], { stdio: 'pipe' });
    assert.equal(readFileSync(out, 'utf8'), readFileSync(MIGRATION, 'utf8'), 'run `node scripts/build-makes-sql.mjs` after editing data/skills/makes.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the makes file passes the builder's check", () => {
  const result = check(makes);
  assert.ok(result.ok, result.said);
  assert.match(result.said, /valid\. \d+ makes on \d+ skills/);
});

test('every listed skill is a catalogue skill, once, with 1 to 12 makes, none twice in any letter case', () => {
  const known = new Set(catalogue.skills.map((skill) => skill.name));
  const listed = new Set<string>();
  for (const entry of makes.skills) {
    assert.ok(known.has(entry.skill), `${entry.skill} is in the catalogue`);
    assert.ok(!listed.has(entry.skill), `${entry.skill} is listed twice`);
    listed.add(entry.skill);
    assert.ok(entry.makes.length >= 1 && entry.makes.length <= 12, `${entry.skill} has ${entry.makes.length} makes`);
    const seen = new Set<string>();
    for (const name of entry.makes) {
      assert.ok(name === name.trim() && name.length >= 1 && name.length <= 60, `${entry.skill}: "${name}" is a short name`);
      assert.ok(!seen.has(name.toLowerCase()), `${entry.skill} lists ${name} twice`);
      seen.add(name.toLowerCase());
    }
  }
  // The owner's examples are there.
  const of = (skill: string) => makes.skills.find((entry) => entry.skill === skill)?.makes ?? [];
  for (const make of ['Fanuc', 'Haas', 'Siemens', 'Mazak', 'Okuma', 'Heidenhain']) assert.ok(of('CNC Control Operation').includes(make), `CNC Control Operation has ${make}`);
  for (const make of ['Studio 5000', 'TIA Portal', 'TwinCAT']) assert.ok(of('PLC Programming').includes(make), `PLC Programming has ${make}`);
  for (const make of ['PC-DMIS', 'Calypso']) assert.ok(of('CMM Programming').includes(make), `CMM Programming has ${make}`);
});

test('a skill that has makes does not also name them in what it is done with', () => {
  const tools = new Map(catalogue.skills.map((skill) => [skill.name, skill.tools ?? []]));
  for (const entry of makes.skills) {
    for (const tool of tools.get(entry.skill) ?? []) {
      const named = entry.makes.filter((make) => tool.toLowerCase().includes(make.toLowerCase()));
      assert.deepEqual(named, [], `${entry.skill}: "${tool}" names a make; makes.json is where it is said`);
    }
  }
});

test('the check refuses a makes file that is not whole', async (t) => {
  const refused = (name: string, change: (file: MakesFile) => void, saying: RegExp) =>
    t.test(name, () => {
      const file = copy();
      change(file);
      const result = check(file);
      assert.ok(!result.ok, `${name}: the check passed`);
      assert.match(result.said, saying);
    });
  await refused('a skill the catalogue does not have', (file) => { file.skills[0].skill = 'Not A Catalogue Skill'; }, /is not a skill in the catalogue/);
  await refused('a skill listed twice', (file) => { file.skills.push({ ...file.skills[0] }); }, /is listed twice/);
  await refused('a make listed twice in other letters', (file) => { file.skills[0].makes.push(file.skills[0].makes[0].toUpperCase()); }, /twice/);
  await refused('a skill with no makes', (file) => { file.skills[0].makes = []; }, /has 0 makes: a skill that is listed has 1 to 12/);
  await refused('thirteen makes', (file) => { file.skills[0].makes = Array.from({ length: 13 }, (_, i) => `Make ${i}`); }, /has 13 makes/);
  await refused('a name of 61 characters', (file) => { file.skills[0].makes[0] = 'm'.repeat(61); }, /not a name of 1 to 60 characters/);
  await refused('a name with a space at its end', (file) => { file.skills[0].makes[0] = 'Haas '; }, /not a name of 1 to 60 characters/);
  await refused('a name on two lines', (file) => { file.skills[0].makes[0] = 'Haas\nMazak'; }, /not a name of 1 to 60 characters/);
  await refused('a make that is not text', (file) => { (file.skills[0].makes as unknown[])[0] = 5; }, /not a name of 1 to 60 characters/);
  await refused('no list at all', (file) => { (file as { skills: unknown }).skills = {}; }, /"skills" must be a list/);
});

test('the migration ties a mark to the holding and to the make, checks before it loads, and deletes no make', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const at = (text: string) => {
    const index = sql.indexOf(text);
    assert.ok(index >= 0, `the migration has: ${text}`);
    return index;
  };
  at('CREATE TABLE IF NOT EXISTS skill_makes (');
  at('skill_id uuid NOT NULL REFERENCES skills (id) ON DELETE CASCADE');
  // One name per skill, in any letter case.
  at('CREATE UNIQUE INDEX IF NOT EXISTS skill_makes_name_idx ON skill_makes (skill_id, lower(name));');
  // Taking the skill off a person's list takes its makes with it; a mark is only for a make of that skill.
  at('FOREIGN KEY (user_id, skill_id) REFERENCES user_skills (user_id, skill_id) ON DELETE CASCADE');
  at('FOREIGN KEY (skill_id, make_id) REFERENCES skill_makes (skill_id, id) ON DELETE CASCADE');
  // The loud stop comes before the first make is written.
  const stop = at('RAISE EXCEPTION');
  for (const change of ['UPDATE skill_makes m SET name', 'INSERT INTO skill_makes (skill_id, name, position)']) assert.ok(stop < at(change), `the check comes before: ${change}`);
  assert.ok(!/DELETE FROM (skill_makes|user_skill_makes)/.test(sql), 'the migration deletes no make and no mark');
  // One row per make, in the file's order.
  const rows = sql.slice(at('INSERT INTO makes_file'), at('-- Every skill the file names must be stored')).split('\n').filter((line) => line.startsWith('  ('));
  assert.equal(rows.length, makes.skills.reduce((sum, entry) => sum + entry.makes.length, 0));
});

test("the migration is in the runner's list after the taxonomy's, and the tables are in the schema", () => {
  const runner = readFileSync('scripts/migrate.mjs', 'utf8');
  assert.match(runner, /'0049_skill_taxonomy_2\.sql', '0050_skill_makes\.sql'/);
  // The latest follows the catalogue's latest, which stores every skill it names.
  assert.match(runner, /'0057_skills_catalogue_3\.sql', '0058_skill_makes_2\.sql'/);
  assert.match(runner, /'0070_skills_catalogue_5\.sql', '0071_skill_taxonomy_5\.sql', '0072_skill_makes_3\.sql'/);
  const schema = readFileSync('server/db/schema.ts', 'utf8');
  assert.match(schema, /pgTable\(\s*'skill_makes'/);
  assert.match(schema, /pgTable\(\s*'user_skill_makes'/);
});
