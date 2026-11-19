// The skills catalogue (data/skills/catalogue.json) and the migration made
// from it. `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface CatalogueSkill {
  name: string;
  category: string;
  was?: string[];
  aliases?: string[];
  what: string;
  learned: string;
  tools?: string[];
}
interface Catalogue {
  categories: string[];
  skills: CatalogueSkill[];
  removed: { why: string; names: string[] }[];
}

const catalogue = JSON.parse(readFileSync('data/skills/catalogue.json', 'utf8')) as Catalogue;
// The catalogue's latest migration. 0033 was the first and is as it was applied.
const MIGRATION = 'migrations/0048_skills_catalogue_2.sql';

test('the skills migration is what the catalogue generates', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'skills-sql-'));
  try {
    const out = path.join(dir, 'out.sql');
    execFileSync(process.execPath, ['scripts/build-skills-sql.mjs', 'data/skills/catalogue.json', out], { stdio: 'pipe' });
    assert.equal(
      readFileSync(out, 'utf8'),
      readFileSync(MIGRATION, 'utf8'),
      'run `node scripts/build-skills-sql.mjs` after editing data/skills/catalogue.json'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every kept skill says what it is, how it is learned, and sits in a listed category', () => {
  const names = new Set<string>();
  for (const skill of catalogue.skills) {
    assert.ok(!names.has(skill.name), `${skill.name} is listed twice`);
    names.add(skill.name);
    assert.ok(catalogue.categories.includes(skill.category), `${skill.name}: unknown category ${skill.category}`);
    // What it is, then what a person who has it can do: two sentences at least.
    assert.match(skill.what, /\. A person who has it /, `${skill.name}: "what" says what a person who has it can do`);
    assert.ok(skill.learned.trim().endsWith('.'), `${skill.name}: "learned" is a sentence`);
    assert.ok((skill.tools ?? []).length <= 12, `${skill.name}: at most 12 tools`);
  }
  for (const category of catalogue.categories) {
    assert.ok(catalogue.skills.some((skill) => skill.category === category), `no skill in ${category}`);
  }
});

test('a stored skill is decided once: kept, merged into one skill, or removed', () => {
  const decided = new Map<string, string>();
  const decide = (name: string, how: string) => {
    assert.ok(!decided.has(name), `${name} is ${decided.get(name)} and also ${how}`);
    decided.set(name, how);
  };
  for (const skill of catalogue.skills) for (const was of skill.was ?? []) decide(was, `merged into ${skill.name}`);
  for (const group of catalogue.removed) {
    assert.ok(group.why.length > 20, 'a removal says why');
    for (const name of group.names) decide(name, 'removed');
  }
  // A kept name may not also be merged away or removed.
  for (const skill of catalogue.skills) assert.ok(!decided.has(skill.name), `${skill.name} is kept and ${decided.get(skill.name)}`);
});

test('the migration knows every stored name before it changes anything, adds what is missing and attaches nothing to a career', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const at = (text: string) => {
    const index = sql.indexOf(text);
    assert.ok(index >= 0, `the migration has: ${text}`);
    return index;
  };
  // The loud stop comes before the first rename, removal, addition or change.
  const stop = at('RAISE EXCEPTION');
  for (const change of ['SELECT pg_temp.rename_skill(', 'DELETE FROM skills WHERE name IN', 'INSERT INTO skills (name, category)', 'UPDATE skills SET description']) {
    assert.ok(stop < at(change), `the check comes before: ${change}`);
  }
  at("IF current_setting('archangel.from_nothing', true) = 'on' THEN RETURN; END IF;");
  // Every kept skill is added when it is not stored, and every name the file decides is one the check knows.
  for (const skill of catalogue.skills) {
    const name = skill.name.replace(/'/g, "''");
    at(`INSERT INTO skills (name, category) SELECT '${name}',`);
    assert.match(sql, new RegExp(`INSERT INTO catalogue_names \\(name\\) VALUES .*\\('${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\)`), `${skill.name} is a known name`);
  }
  // A path is written in data/paths/: this migration writes none.
  assert.ok(!sql.includes('INSERT INTO occupation_skills'), 'the migration attaches no skill to a career');
  assert.ok(catalogue.skills.every((skill) => !('careers' in skill)), 'no skill carries "careers"');
  // A merge takes the merged skill's makes and the marks people put on them (migration 0050).
  at("IF to_regclass('public.skill_makes') IS NOT NULL THEN");
  // Next to each other, the catalogue first: the taxonomy places exactly the skills this one leaves.
  assert.match(readFileSync('scripts/migrate.mjs', 'utf8'), /'0048_skills_catalogue_2\.sql', '0049_skill_taxonomy_2\.sql'/);
});

test('the pass kept every name it folded or renamed, as an earlier name of the skill it became', () => {
  const became = new Map<string, string>();
  for (const skill of catalogue.skills) for (const was of skill.was ?? []) became.set(was, skill.name);
  const expected: [string, string][] = [
    ['Mastercam', 'CAM Programming'],
    ['Allen-Bradley PLC Programming', 'PLC Programming'],
    ['PLC Ladder Logic Programming', 'PLC Programming'],
    ['FANUC Robot Programming', 'Robot Programming'],
    ['KUKA Robot Programming', 'Robot Programming'],
    ['SolidWorks', '3D CAD Modeling'],
    ['CATIA', '3D CAD Modeling'],
    ['AutoCAD', '2D CAD Drafting'],
    ['LabVIEW Programming', 'Test Automation Programming'],
    ['Vericut Simulation', 'CNC Program Verification'],
    ['MT Yoke Technique', 'Magnetic Particle Testing'],
    ['AS9100 Quality System Requirements', 'Quality System Auditing'],
  ];
  for (const [was, name] of expected) assert.equal(became.get(was), name, `${was} became ${name}`);
  const names = new Set(catalogue.skills.map((skill) => skill.name));
  for (const added of ['CNC Turning', 'Injection Molding Machine Operation', 'Shot Peening', 'Thermal Spray Coating', 'Powder Coating', 'Control Panel Building', 'Dial Indicator Measurement', 'Pin and Plug Gauge Use', 'Surface Plate Inspection', 'Distributed Control System Operation']) {
    assert.ok(names.has(added), `${added} is in the catalogue`);
  }
  // No kept skill is named for one maker's product.
  for (const brand of ['FANUC', 'Allen-Bradley', 'Siemens', 'Mastercam', 'SolidWorks', 'AutoCAD', 'CATIA', 'LabVIEW', 'Vericut', 'KUKA', 'ABB ']) {
    assert.ok(![...names].some((name) => name.includes(brand)), `no skill is named for ${brand.trim()}`);
  }
});
