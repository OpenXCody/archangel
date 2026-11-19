// The skill taxonomy (data/skills/taxonomy.json), the checks its builder makes
// (scripts/build-taxonomy-sql.mjs) and the migration made from it.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SKILL_LEVELS, isSkillLevel, skillLevelName } from '../../shared/skillLevels';

interface TaxonomySkill {
  name: string;
  level: number;
}
interface TaxonomyGroup {
  slug: string;
  name: string;
  what: string;
  skills: TaxonomySkill[];
}
interface TaxonomyDomain {
  slug: string;
  name: string;
  what: string;
  groups: TaxonomyGroup[];
}
interface TaxonomyFile {
  levels: { id: number; name: string; what: string }[];
  domains: TaxonomyDomain[];
}

const BUILDER = 'scripts/build-taxonomy-sql.mjs';
const TAXONOMY = 'data/skills/taxonomy.json';
const CATALOGUE = 'data/skills/catalogue.json';
const MIGRATION = 'migrations/0042_skill_taxonomy.sql';

const taxonomy = JSON.parse(readFileSync(TAXONOMY, 'utf8')) as TaxonomyFile;
const catalogue = JSON.parse(readFileSync(CATALOGUE, 'utf8')) as { skills: { name: string }[] };
const copy = (): TaxonomyFile => JSON.parse(JSON.stringify(taxonomy)) as TaxonomyFile;

/** Runs the builder's --check over a taxonomy and gives back how it ended and what it said. */
function check(file: TaxonomyFile): { ok: boolean; said: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'taxonomy-check-'));
  try {
    const input = path.join(dir, 'taxonomy.json');
    writeFileSync(input, JSON.stringify(file));
    const run = spawnSync(process.execPath, [BUILDER, '--check', input, CATALOGUE], { encoding: 'utf8' });
    return { ok: run.status === 0, said: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the taxonomy migration is what the taxonomy generates', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'taxonomy-sql-'));
  try {
    const out = path.join(dir, 'out.sql');
    execFileSync(process.execPath, [BUILDER, TAXONOMY, CATALOGUE, out], { stdio: 'pipe' });
    assert.equal(
      readFileSync(out, 'utf8'),
      readFileSync(MIGRATION, 'utf8'),
      'run `node scripts/build-taxonomy-sql.mjs` after editing data/skills/taxonomy.json'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the taxonomy file passes the builder\'s check', () => {
  const result = check(taxonomy);
  assert.ok(result.ok, result.said);
  assert.match(result.said, /valid\. \d+ domains, \d+ groups, \d+ skills/);
});

test('every catalogue skill is placed exactly once, in a group of 2 to 12, at a level of 1 to 3', () => {
  const placed = new Map<string, string>();
  const slugs = new Set<string>();
  for (const domain of taxonomy.domains) {
    assert.match(domain.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `domain slug ${domain.slug}`);
    assert.ok(domain.name.trim() && domain.what.trim(), `${domain.slug} has a name and a what`);
    for (const group of domain.groups) {
      assert.match(group.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `group slug ${group.slug}`);
      assert.ok(!slugs.has(group.slug), `group slug ${group.slug} is used twice`);
      slugs.add(group.slug);
      assert.ok(group.name.trim() && group.what.trim(), `${group.slug} has a name and a what`);
      assert.ok(group.skills.length >= 2 && group.skills.length <= 12, `${group.slug} holds ${group.skills.length} skills`);
      for (const skill of group.skills) {
        assert.ok(isSkillLevel(skill.level), `${skill.name} has level ${skill.level}`);
        assert.ok(!placed.has(skill.name), `${skill.name} is in ${placed.get(skill.name)} and ${group.slug}`);
        placed.set(skill.name, group.slug);
      }
    }
  }
  assert.equal(new Set(taxonomy.domains.map((domain) => domain.slug)).size, taxonomy.domains.length, 'domain slugs are unique');
  const names = catalogue.skills.map((skill) => skill.name);
  assert.deepEqual([...placed.keys()].sort(), [...names].sort(), 'the placed skills are the catalogue\'s');
});

test('the levels are the three the code names', () => {
  assert.deepEqual(
    taxonomy.levels.map(({ id, name }) => ({ id, name })),
    SKILL_LEVELS.map(({ id, name }) => ({ id, name }))
  );
  assert.deepEqual(SKILL_LEVELS.map((level) => level.name), ['Fundamentals', 'Intermediate', 'Advanced']);
  assert.equal(skillLevelName(2), 'Intermediate');
  assert.equal(skillLevelName(null), null);
  assert.equal(skillLevelName(4), null);
  assert.ok(SKILL_LEVELS.every((level) => level.gloss.trim().length > 0));
});

test('the check refuses a taxonomy that is not whole', async (t) => {
  const refused = (name: string, change: (file: TaxonomyFile) => void, saying: RegExp) =>
    t.test(name, () => {
      const file = copy();
      change(file);
      const result = check(file);
      assert.ok(!result.ok, `${name}: the check passed`);
      assert.match(result.said, saying);
    });
  const firstGroup = (file: TaxonomyFile) => file.domains[0].groups[0];

  await refused('a skill placed twice', (file) => file.domains[1].groups[0].skills.push({ ...firstGroup(file).skills[0] }), /is placed twice/);
  await refused('a catalogue skill left out', (file) => {
    // Taken from a group that can spare one.
    const group = file.domains.flatMap((domain) => domain.groups).find((item) => item.skills.length > 2)!;
    group.skills.pop();
  }, /is in the catalogue and has no group/);
  await refused('a skill the catalogue does not have', (file) => firstGroup(file).skills.push({ name: 'Not A Catalogue Skill', level: 1 }), /is not a skill in the catalogue/);
  await refused('a level of 4', (file) => { firstGroup(file).skills[0].level = 4; }, /a level is 1, 2 or 3/);
  await refused('a slug with a capital', (file) => { firstGroup(file).slug = 'Hand-Tools'; }, /not lowercase words joined by hyphens/);
  await refused('a group slug used twice', (file) => { file.domains[1].groups[0].slug = firstGroup(file).slug; }, /is used twice/);
  await refused('a domain slug used twice', (file) => { file.domains[1].slug = file.domains[0].slug; }, /domain slug .* is used twice/);
  await refused('a group of one', (file) => {
    const group = firstGroup(file);
    file.domains[0].groups[1].skills.push(...group.skills.splice(1));
  }, /a group holds 2 to 12/);
  await refused('a group of thirteen', (file) => {
    const groups = file.domains.flatMap((domain) => domain.groups);
    const big = groups[0];
    for (const other of groups.slice(1)) {
      while (big.skills.length < 13 && other.skills.length > 2) big.skills.push(other.skills.pop()!);
    }
  }, /a group holds 2 to 12/);
  await refused('a group with no what', (file) => { firstGroup(file).what = ' '; }, /needs a "what"/);
  await refused('a domain with no what', (file) => { file.domains[0].what = ''; }, /needs a "what"/);
  await refused('a level renamed', (file) => { file.levels[0].name = 'Introduction'; }, /"levels" must be 1 Fundamentals, 2 Intermediate, 3 Advanced/);
});

test('the migration checks the stored skills before it changes anything, and holds stage to level', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const at = (text: string) => {
    const index = sql.indexOf(text);
    assert.ok(index >= 0, `the migration has: ${text}`);
    return index;
  };
  // The loud stop comes before the first statement that creates or changes a stored table.
  const stop = at('RAISE EXCEPTION');
  for (const change of ['CREATE TABLE IF NOT EXISTS skill_domains', 'ALTER TABLE skills', 'UPDATE skills s SET', 'UPDATE occupation_skills os SET', 'INSERT INTO skill_domains']) {
    assert.ok(stop < at(change), `the check comes before: ${change}`);
  }
  // The one way past it is the session scripts/create-db.mjs marks while it builds a database from nothing.
  at("IF current_setting('archangel.from_nothing', true) = 'on' THEN RETURN; END IF;");
  assert.match(readFileSync('scripts/create-db.mjs', 'utf8'), /set_config\('archangel\.from_nothing', 'on', false\)[\s\S]*applyMigrations\(sql\);[\s\S]*sql = connect\(\);\s*await applyMigrations\(sql, \{ reapply: true \}\)/);
  at('CREATE TRIGGER occupation_skills_stage_is_level BEFORE INSERT OR UPDATE ON occupation_skills');
  at('CREATE TRIGGER skills_level_moves_paths AFTER UPDATE OF level ON skills');
  // One row per skill, each naming a group the file has.
  const rows = sql.slice(at('INSERT INTO taxonomy_skills'), at('-- The stored skills must be exactly')).split('\n').filter((line) => line.startsWith('  ('));
  assert.equal(rows.length, catalogue.skills.length);
});

test('the migration is in the runner\'s list', () => {
  assert.match(readFileSync('scripts/migrate.mjs', 'utf8'), /'0041_largest_plants\.sql', '0042_skill_taxonomy\.sql'/);
});
