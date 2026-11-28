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
// The taxonomy's latest migration. 0042 was the first, 0049 the second, 0060 the third, 0068 the fourth and 0071 the fifth; each is as it was applied.
const MIGRATION = 'migrations/0083_skill_taxonomy_6.sql';
const FIFTH = 'migrations/0071_skill_taxonomy_5.sql';

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
      // The migration was generated when the third level was called Advanced; the word stands in one comment of it.
      readFileSync(out, 'utf8').replace('3 Specialization. A career', '3 Advanced. A career'),
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
  assert.deepEqual(SKILL_LEVELS.map((level) => level.name), ['Fundamentals', 'Intermediate', 'Specialization']);
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
  await refused('a level renamed', (file) => { file.levels[0].name = 'Introduction'; }, /"levels" must be 1 Fundamentals, 2 Intermediate, 3 Specialization/);
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
  const runner = readFileSync('scripts/migrate.mjs', 'utf8');
  assert.match(runner, /'0041_largest_plants\.sql', '0042_skill_taxonomy\.sql'/);
  // The catalogue's migration comes first: it leaves exactly the skills this one places.
  assert.match(runner, /'0048_skills_catalogue_2\.sql', '0049_skill_taxonomy_2\.sql'/);
  assert.match(runner, /'0059_skills_catalogue_4\.sql', '0060_skill_taxonomy_3\.sql'/);
  assert.match(runner, /'0070_skills_catalogue_5\.sql', '0071_skill_taxonomy_5\.sql'/);
  // The fourth changes only the domains' order, so it needs no catalogue pass before it; it follows the third.
  const list = [...runner.matchAll(/'(\d{4}_[a-z0-9_]+\.sql)'/g)].map((m) => m[1]);
  assert.ok(list.indexOf('0068_skill_taxonomy_4.sql') > list.indexOf('0060_skill_taxonomy_3.sql'));
  assert.ok(list.indexOf('0071_skill_taxonomy_5.sql') > list.indexOf('0068_skill_taxonomy_4.sql'));
  // The sixth adds, renames and removes no skill, so it needs no catalogue pass before it either.
  assert.ok(list.indexOf('0083_skill_taxonomy_6.sql') > list.indexOf('0071_skill_taxonomy_5.sql'));
  assert.ok(list.indexOf('0083_skill_taxonomy_6.sql') > list.indexOf('0082_texas_hubs_2.sql'));
});

// Read from the fourth's own file: the later ones restate it with their own groups and skills.
test('the fourth taxonomy changes the order of the domains and nothing else: Safety is last', () => {
  const domains = (sql: string) => [...sql.matchAll(/^ {2}\('([a-z0-9-]+)', '((?:[^']|'')+)', '(?:[^']|'')+', (\d+)\)[,;]$/gm)].map((m) => ({ slug: m[1], name: m[2], position: Number(m[3]) }));
  const before = readFileSync('migrations/0060_skill_taxonomy_3.sql', 'utf8');
  const after = readFileSync('migrations/0068_skill_taxonomy_4.sql', 'utf8');
  assert.deepEqual(domains(after).map((domain) => domain.name), [
    'Materials', 'Engineering', 'Production', 'Machining', 'Fabrication', 'Assembly', 'Electronics', 'Automation',
    'Semiconductor', 'Battery and electric drive', 'Process', 'Test', 'Maintenance', 'Quality', 'Nondestructive testing', 'Safety',
  ]);
  assert.deepEqual(domains(after).map((domain) => domain.position), domains(after).map((_, index) => index + 1));
  assert.deepEqual(taxonomy.domains.map((domain: { slug: string }) => domain.slug), domains(after).map((domain) => domain.slug));
  // Every group keeps its domain and its place among that domain's groups (a group's stored position
  // counts across all domains, so the numbers move); every skill keeps its group, level and place.
  const groupsByDomain = (sql: string) => {
    const by = new Map<string, string[]>();
    const rows = [...sql.matchAll(/^ {2}\('([a-z0-9-]+)', '([a-z0-9-]+)', '(?:[^']|'')+', '(?:[^']|'')+', (\d+)\)[,;]$/gm)].sort((a, b) => Number(a[3]) - Number(b[3]));
    for (const [, slug, domain] of rows) by.set(domain, [...(by.get(domain) ?? []), slug]);
    return by;
  };
  assert.equal([...groupsByDomain(after).values()].flat().length, 143);
  assert.deepEqual(Object.fromEntries([...groupsByDomain(after)].sort()), Object.fromEntries([...groupsByDomain(before)].sort()));
  const skillLines = (sql: string) => [...sql.matchAll(/^ {2}\('((?:[^']|'')+)', '([a-z0-9-]+)', ([123]), (\d+)\)[,;]$/gm)].map((m) => m.slice(1).join(' | ')).sort();
  assert.equal(skillLines(after).length, 722);
  assert.deepEqual(skillLines(after), skillLines(before));
  // And the statements around the lists are the same ones.
  const statements = (sql: string) => sql.split('\n').filter((line) => !line.startsWith('  (') && !line.startsWith('--'));
  assert.deepEqual(statements(after), statements(before));
});

test('the fifth taxonomy places the new skills, most in 51 new groups, and moves one skill that was placed', () => {
  const groups = (sql: string) => new Map([...sql.matchAll(/^ {2}\('([a-z0-9-]+)', '([a-z0-9-]+)', '/gm)].map((m) => [m[1], m[2]]));
  const skillsOf = (sql: string) => new Map([...sql.matchAll(/^ {2}\('((?:[^']|'')+)', '([a-z0-9-]+)', ([123]), \d+\)[,;]$/gm)].map((m) => [m[1], `${m[2]} ${m[3]}`]));
  const domains = (sql: string) => [...sql.matchAll(/^ {2}\('([a-z0-9-]+)', '((?:[^']|'')+)', '(?:[^']|'')+', (\d+)\)[,;]$/gm)].map((m) => m[1]);
  const before = readFileSync('migrations/0068_skill_taxonomy_4.sql', 'utf8');
  const after = readFileSync(FIFTH, 'utf8');
  // The domains are the sixteen, in the fourth's order: Safety last.
  assert.deepEqual(domains(after), domains(before));
  const added = [...groups(after).keys()].filter((slug) => !groups(before).has(slug));
  assert.equal(added.length, 51);
  assert.equal(groups(after).size, 194);
  for (const [slug, domain] of groups(before)) assert.equal(groups(after).get(slug), domain, `${slug} stays in ${domain}`);
  // A skill that was placed keeps its group and level; the one that moves is Industrial Sewing, to the sewn trades.
  const was = skillsOf(before);
  const now = skillsOf(after);
  assert.equal(was.size, 722);
  assert.equal(now.size, 1023);
  const moved = [...was].filter(([name, place]) => now.get(name) !== place).map(([name]) => `${name}: ${was.get(name)} to ${now.get(name)}`);
  assert.deepEqual(moved, ['Industrial Sewing: survival-equipment 2 to cut-and-sew 2']);
  // Safety is ancillary: it gains no skill.
  const safety = (sql: string) => [...skillsOf(sql).values()].filter((place) => ['workplace-safety', 'hazardous-energy', 'hazardous-materials'].includes(place.split(' ')[0])).length;
  assert.equal(safety(after) - safety(before), 0);
});

test('the sixth taxonomy re-cuts the groups to the Atlas\'s: seven new groups of skills already placed, and no skill added, removed or at another level', () => {
  const groups = (sql: string) => new Map([...sql.matchAll(/^ {2}\('([a-z0-9-]+)', '([a-z0-9-]+)', '((?:[^']|'')+)', '(?:[^']|'')+', \d+\)[,;]$/gm)].map((m) => [m[1], { domain: m[2], name: m[3].replace(/''/g, "'") }]));
  const skillsOf = (sql: string) => new Map([...sql.matchAll(/^ {2}\('((?:[^']|'')+)', '([a-z0-9-]+)', ([123]), \d+\)[,;]$/gm)].map((m) => [m[1].replace(/''/g, "'"), { group: m[2], level: Number(m[3]) }]));
  const domains = (sql: string) => [...sql.matchAll(/^ {2}\('([a-z0-9-]+)', '((?:[^']|'')+)', '((?:[^']|'')+)', (\d+)\)[,;]$/gm)].map((m) => m.slice(1).join(' | '));
  const before = readFileSync(FIFTH, 'utf8');
  const after = readFileSync(MIGRATION, 'utf8');
  // The sixteen domains as they were: slug, name, sentence and place.
  assert.deepEqual(domains(after), domains(before));
  // Every group that was there is there under its slug, in its domain; seven are new.
  const added = [...groups(after).keys()].filter((slug) => !groups(before).has(slug));
  assert.deepEqual(added.sort(), ['electrical-fundamentals', 'hand-tools', 'machine-care', 'mechanical-fundamentals', 'multi-axis-machining', 'precision-measurement', 'validation']);
  assert.equal(groups(before).size, 194);
  assert.equal(groups(after).size, 201);
  for (const [slug, group] of groups(before)) assert.equal(groups(after).get(slug)?.domain, group.domain, `${slug} stays in ${group.domain}`);
  // Names are the Atlas's: 127 of the 194 change, and no two groups share one.
  assert.equal([...groups(before)].filter(([slug, group]) => groups(after).get(slug)?.name !== group.name).length, 127);
  assert.equal(new Set([...groups(after).values()].map((group) => group.name)).size, 201);
  for (const [slug, name] of [['measurement-tools', 'Measuring'], ['gmp-and-sanitation', 'GMP'], ['design-documentation', 'CAD'], ['workplace-safety', 'Shop safety'], ['electrical-fundamentals', 'Electrical basics'], ['mechanical-fundamentals', 'Power transmission']]) {
    assert.equal(groups(after).get(slug)?.name, name);
  }
  // The skills are the same 1,023 at the same levels; 27 stand in another group.
  const was = skillsOf(before);
  const now = skillsOf(after);
  assert.equal(was.size, 1023);
  assert.deepEqual([...now.keys()].sort(), [...was.keys()].sort());
  for (const [name, place] of was) assert.equal(now.get(name)?.level, place.level, `${name} keeps its level`);
  const moved = [...was].filter(([name, place]) => now.get(name)?.group !== place.group).map(([name]) => name);
  assert.equal(moved.length, 27);
  // 23 of them into the new groups, which hold nothing else; four into a group that was there.
  const intoOld = moved.filter((name) => !added.includes(now.get(name)!.group)).map((name) => `${name}: ${was.get(name)!.group} to ${now.get(name)!.group}`).sort();
  assert.deepEqual(intoOld, [
    'Data Analysis and Scripting: manufacturing-engineering to design-documentation',
    'Fabric Inspection: part-inspection to fabric-forming',
    'Potable Water and Drain Plumbing: rv-and-modular-building to fluid-system-assembly',
    'Weighing and Dispensing: tablet-manufacturing to lot-control',
  ]);
  assert.equal([...now].filter(([, place]) => added.includes(place.group)).length, 23);
  // Four of the 27 change domain with their group: two that moved to a group of another domain, and one
  // skill of each new group cut from two domains.
  const domainOf = (sql: string, name: string) => groups(sql).get(skillsOf(sql).get(name)!.group)!.domain;
  const crossed = moved.filter((name) => domainOf(before, name) !== domainOf(after, name)).map((name) => `${name}: ${domainOf(before, name)} to ${domainOf(after, name)}`).sort();
  assert.deepEqual(crossed, [
    'Belt and Chain Drive Maintenance: maintenance to assembly',
    'Fabric Inspection: quality to materials',
    'Multimeter Testing: test to maintenance',
    'Weighing and Dispensing: process to production',
  ]);
  // And the statements around the lists are the same ones.
  const statements = (sql: string) => sql.split('\n').filter((line) => !line.startsWith('  (') && !line.startsWith('--'));
  assert.deepEqual(statements(after), statements(before));
});

// Read from the third's own file: the latest restates it with the domains in another order.
test('the third taxonomy places the military careers\' skills in eleven new groups and moves no skill that was placed', () => {
  const groups = (sql: string) => new Map([...sql.matchAll(/^ {2}\('([a-z0-9-]+)', '([a-z0-9-]+)', '/gm)].map((m) => [m[1], m[2]]));
  const skillsOf = (sql: string) => new Map([...sql.matchAll(/^ {2}\('((?:[^']|'')+)', '([a-z0-9-]+)', ([123]), \d+\)[,;]$/gm)].map((m) => [m[1], `${m[2]} ${m[3]}`]));
  const before = readFileSync('migrations/0049_skill_taxonomy_2.sql', 'utf8');
  const after = readFileSync('migrations/0060_skill_taxonomy_3.sql', 'utf8');
  const added = [...groups(after).keys()].filter((slug) => !groups(before).has(slug));
  assert.deepEqual(added.sort(), ['aircraft-systems', 'engines-and-power-plants', 'fielded-electronic-systems', 'fuels', 'nuclear-plant-operations', 'plant-utilities', 'power-generation-and-distribution', 'shipfitting', 'survival-equipment', 'vehicles-and-heavy-equipment', 'weapons-and-munitions']);
  for (const [slug, domain] of groups(before)) assert.equal(groups(after).get(slug), domain, `${slug} stays in ${domain}`);
  // A skill that was placed keeps its group and its level.
  const was = skillsOf(before);
  const now = skillsOf(after);
  assert.equal(was.size, 656);
  assert.equal(now.size, 722);
  for (const [name, place] of was) assert.equal(now.get(name), place, `${name} stays where it was`);
  for (const [name, place] of now) if (!was.has(name)) assert.ok(added.includes(place.split(' ')[0]), `${name} is new and in a new group`);
});
