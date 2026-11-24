// The careers catalogue (data/careers/catalogue.json), the two lists that hang
// from it (careers by industry, everyday names), the checks their builders make
// (scripts/build-careers-sql.mjs, scripts/build-career-lists-sql.mjs) and the
// migrations made from them.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INDUSTRIES } from '../../shared/industry';

interface Career {
  title: string;
  home: string;
  what: string;
  leadsTo: string[];
  was: string[];
  dropAliases?: string[];
  note?: string;
}
interface CatalogueFile {
  note: string;
  careers: Career[];
  removed: { why: string; titles: string[] }[];
}
interface IndustriesFile {
  note: string;
  everywhere: string[];
  industries: { industry: string; careers: string[] }[];
}
interface AliasesFile {
  note: string;
  careers: { title: string; aliases: string[]; not?: string[] }[];
}

const BUILDER = 'scripts/build-careers-sql.mjs';
const LISTS_BUILDER = 'scripts/build-career-lists-sql.mjs';
const CATALOGUE = 'data/careers/catalogue.json';
const TAXONOMY = 'data/skills/taxonomy.json';
const INDUSTRY_LIST = 'data/careers/industries.json';
const ALIASES = 'data/careers/aliases.json';
// The latest of each. 0046 was the catalogue's first; 0047 and 0056 the lists' first and second; each is as it was applied.
const MIGRATION = 'migrations/0073_careers_catalogue_2.sql';
const LISTS_MIGRATION = 'migrations/0074_career_lists_3.sql';

const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const catalogue = read<CatalogueFile>(CATALOGUE);
const taxonomy = read<{ domains: { slug: string }[] }>(TAXONOMY);
const industries = read<IndustriesFile>(INDUSTRY_LIST);
const aliases = read<AliasesFile>(ALIASES);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Runs a builder over files written for the run and gives back how it ended and what it said. */
function run(builder: string, files: unknown[], extra: string[] = []): { ok: boolean; said: string; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'careers-check-'));
  const paths = files.map((file, i) => {
    if (typeof file === 'string') return file;
    const written = path.join(dir, `in-${i}.json`);
    writeFileSync(written, JSON.stringify(file));
    return written;
  });
  const done = spawnSync(process.execPath, [builder, ...extra, ...paths], { encoding: 'utf8' });
  return { ok: done.status === 0, said: `${done.stdout}${done.stderr}`, dir };
}
const check = (file: CatalogueFile) => {
  const result = run(BUILDER, [file, TAXONOMY], ['--check']);
  rmSync(result.dir, { recursive: true, force: true });
  return result;
};
const checkLists = (lists: { catalogue?: CatalogueFile; industries?: IndustriesFile; aliases?: AliasesFile }) => {
  const result = run(LISTS_BUILDER, [lists.catalogue ?? CATALOGUE, lists.industries ?? INDUSTRY_LIST, lists.aliases ?? ALIASES], ['--check']);
  rmSync(result.dir, { recursive: true, force: true });
  return result;
};

test('the catalogue migration is what the catalogue generates', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'careers-sql-'));
  try {
    const out = path.join(dir, 'out.sql');
    execFileSync(process.execPath, [BUILDER, CATALOGUE, TAXONOMY, out], { stdio: 'pipe' });
    assert.equal(readFileSync(out, 'utf8'), readFileSync(MIGRATION, 'utf8'), 'run `node scripts/build-careers-sql.mjs` after editing data/careers/catalogue.json');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the career lists migration is what the two lists generate', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'careers-sql-'));
  try {
    const out = path.join(dir, 'out.sql');
    execFileSync(process.execPath, [LISTS_BUILDER, CATALOGUE, INDUSTRY_LIST, ALIASES, out], { stdio: 'pipe' });
    assert.equal(
      readFileSync(out, 'utf8'),
      readFileSync(LISTS_MIGRATION, 'utf8'),
      'run `node scripts/build-career-lists-sql.mjs` after editing data/careers/industries.json or aliases.json'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the catalogue and its lists pass their builders\' checks', () => {
  const one = check(catalogue);
  assert.ok(one.ok, one.said);
  assert.match(one.said, /valid\. \d+ careers in \d+ domains, \d+ titles folded in, \d+ removed, \d+ links/);
  const two = checkLists({});
  assert.ok(two.ok, two.said);
  assert.match(two.said, /valid\. \d+ industries/);
});

test('every title is used once, every home is a domain, and no ladder comes back on itself', () => {
  const domains = new Set(taxonomy.domains.map((domain) => domain.slug));
  const used = new Map<string, string>();
  const use = (title: string, where: string) => {
    const key = title.toLowerCase();
    assert.ok(!used.has(key), `"${title}" is used by ${used.get(key)} and ${where}`);
    used.set(key, where);
  };
  const titles = new Set(catalogue.careers.map((career) => career.title));
  for (const career of catalogue.careers) {
    use(career.title, 'a career');
    for (const was of career.was) use(was, `was of ${career.title}`);
    assert.ok(domains.has(career.home), `${career.title}: home ${career.home}`);
    assert.ok(career.what.trim().length > 20, `${career.title} says what it is`);
    assert.ok(career.leadsTo.length <= 3, `${career.title} leads to at most three`);
    assert.equal(new Set(career.leadsTo).size, career.leadsTo.length, `${career.title} leads to no career twice`);
    for (const next of career.leadsTo) assert.ok(titles.has(next) && next !== career.title, `${career.title} leads to ${next}`);
  }
  for (const group of catalogue.removed) for (const title of group.titles) use(title, 'removed');
  // Walked from every career: a chain longer than the catalogue has come round.
  const next = new Map(catalogue.careers.map((career) => [career.title, career.leadsTo]));
  const depth = new Map<string, number>();
  const longest = (title: string, seen: string[]): number => {
    assert.ok(!seen.includes(title), `the ladder comes back on itself: ${[...seen, title].join(' → ')}`);
    if (!depth.has(title)) depth.set(title, 1 + Math.max(0, ...(next.get(title) ?? []).map((to) => longest(to, [...seen, title]))));
    return depth.get(title)!;
  };
  for (const title of titles) longest(title, []);
  // The owner's own example is three rungs of one ladder.
  assert.deepEqual(next.get('CNC Machine Operator')?.includes('CNC Machinist'), true);
  assert.deepEqual(next.get('CNC Machinist')?.[0], 'CNC Programmer');
});

test('the industry list names the 21 industries and only careers of the catalogue, and misses none', () => {
  const titles = new Set(catalogue.careers.map((career) => career.title));
  assert.deepEqual(industries.industries.map((row) => row.industry).sort(), INDUSTRIES.map((industry) => industry.name).sort());
  const listed = new Set(industries.everywhere);
  for (const row of industries.industries) {
    assert.equal(new Set(row.careers).size, row.careers.length, `${row.industry} lists no career twice`);
    for (const title of row.careers) {
      assert.ok(titles.has(title), `${row.industry}: ${title} is a career of the catalogue`);
      listed.add(title);
    }
  }
  for (const title of industries.everywhere) assert.ok(titles.has(title), `everywhere: ${title}`);
  assert.deepEqual([...titles].filter((title) => !listed.has(title)), [], 'every career is listed for some industry');
});

test('an everyday name points to one career and is nobody\'s title', () => {
  const titles = new Set(catalogue.careers.map((career) => career.title.toLowerCase()));
  const folded = new Set(catalogue.careers.flatMap((career) => career.was.map((was) => was.toLowerCase())));
  const seen = new Set<string>();
  for (const row of aliases.careers) {
    assert.ok(titles.has(row.title.toLowerCase()), `${row.title} is a career of the catalogue`);
    for (const alias of row.aliases) {
      const key = alias.toLowerCase();
      assert.ok(!seen.has(key), `"${alias}" is listed twice`);
      seen.add(key);
      assert.ok(!titles.has(key), `"${alias}" is a career's title`);
      assert.ok(!folded.has(key), `"${alias}" is a folded title, which the catalogue already keeps`);
    }
  }
});

test('the check refuses a catalogue that is not whole', async (t) => {
  const refused = (name: string, change: (file: CatalogueFile) => void, saying: RegExp) =>
    t.test(name, () => {
      const file = copy(catalogue);
      change(file);
      const result = check(file);
      assert.ok(!result.ok, `${name}: the check passed`);
      assert.match(result.said, saying);
    });
  const first = (file: CatalogueFile) => file.careers[0];
  // Two careers with a link from the first to the second, for closing a ladder.
  const linked = (file: CatalogueFile) => {
    const from = file.careers.find((career) => career.leadsTo.length > 0)!;
    return { from, to: file.careers.find((career) => career.title === from.leadsTo[0])! };
  };

  await refused('a title used twice', (file) => file.careers.push({ ...first(file), was: [] }), /is used twice/);
  await refused('a title used twice in another letter case', (file) => { file.careers[1].was.push(first(file).title.toUpperCase()); }, /is used twice/);
  await refused('a title both folded and removed', (file) => { file.removed[0].titles.push(file.careers.find((career) => career.was.length > 0)!.was[0]); }, /is used twice/);
  await refused('a home that is not a domain', (file) => { first(file).home = 'welding'; }, /is not a domain of the taxonomy/);
  await refused('a career with no what', (file) => { first(file).what = ' '; }, /needs a "what"/);
  await refused('a link to a career that is not there', (file) => { first(file).leadsTo = ['Not A Career']; }, /which is not a career of the file/);
  await refused('a link to a folded title', (file) => { first(file).leadsTo = [file.careers.find((career) => career.was.length > 0 && career !== first(file))!.was[0]]; }, /which is not a career of the file/);
  await refused('a career that leads to itself', (file) => { first(file).leadsTo = [first(file).title]; }, /leads to itself/);
  await refused('a career that leads to four', (file) => { first(file).leadsTo = file.careers.slice(1, 5).map((career) => career.title); }, /at most 3/);
  await refused('a career that leads to one career twice', (file) => { const { from } = linked(file); from.leadsTo = [from.leadsTo[0], from.leadsTo[0]]; }, /twice/);
  await refused('a ladder of two that comes back', (file) => { const { from, to } = linked(file); to.leadsTo = [from.title]; }, /the ladder comes back on itself/);
  await refused('a ladder of three that comes back', (file) => {
    const [a, b, c] = file.careers;
    for (const career of file.careers) career.leadsTo = [];
    a.leadsTo = [b.title];
    b.leadsTo = [c.title];
    c.leadsTo = [a.title];
  }, new RegExp('the ladder comes back on itself: .* → .* → .* → '));
  await refused('a removed group with no reason', (file) => { file.removed[0].why = ''; }, /has no "why"/);
  await refused('a was that is not a list', (file) => { (first(file) as unknown as { was: unknown }).was = 'Operator'; }, /"was" must be a list/);
});

test('the check refuses lists that have left the catalogue', async (t) => {
  const refused = (name: string, lists: () => Parameters<typeof checkLists>[0], saying: RegExp) =>
    t.test(name, () => {
      const result = checkLists(lists());
      assert.ok(!result.ok, `${name}: the check passed`);
      assert.match(result.said, saying);
    });
  const folded = catalogue.careers.find((career) => career.was.length > 0)!;
  const dropped = catalogue.careers.find((career) => (career.dropAliases ?? []).length > 0)!;

  await refused('an industry that lists a folded title', () => {
    const file = copy(industries);
    file.industries[0].careers.push(folded.was[0]);
    return { industries: file };
  }, /is not a career of the catalogue/);
  await refused('a career listed twice for one industry', () => {
    const file = copy(industries);
    file.industries[0].careers.push(file.industries[0].careers[0]);
    return { industries: file };
  }, /is listed twice/);
  await refused('a career of the catalogue listed nowhere', () => {
    const file = copy(catalogue);
    file.careers.push({ title: 'Glass Blower', home: 'fabrication', what: 'Shapes glass by hand.', leadsTo: [], was: [] });
    return { catalogue: file };
  }, /is listed for no industry/);
  await refused('an everyday name that is a title', () => {
    const file = copy(aliases);
    file.careers[0].aliases.push(catalogue.careers[5].title.toLowerCase());
    return { aliases: file };
  }, /is a career's title/);
  await refused('an everyday name that is a folded title', () => {
    const file = copy(aliases);
    file.careers[0].aliases.push(folded.was[0]);
    return { aliases: file };
  }, /the catalogue already keeps it/);
  await refused('an everyday name listed for two careers', () => {
    const file = copy(aliases);
    file.careers[1].aliases.push(file.careers[0].aliases[0].toUpperCase());
    return { aliases: file };
  }, /is listed for both/);
  await refused('a name the catalogue says must not follow a career', () => {
    const file = copy(aliases);
    const row = file.careers.find((each) => each.title === dropped.title);
    if (row) row.aliases.push(dropped.dropAliases![0] + ' ');
    else file.careers.push({ title: dropped.title, aliases: [dropped.dropAliases![0]] });
    // The name may also stand, rightly, under another career: taken from there so only one problem is found.
    for (const other of file.careers) if (other.title !== dropped.title) other.aliases = other.aliases.filter((alias) => alias.toLowerCase() !== dropped.dropAliases![0].toLowerCase());
    return { aliases: file };
  }, /must not follow that career|is not a name/);
  await refused('everyday names for a career that is not there', () => {
    const file = copy(aliases);
    file.careers.push({ title: folded.was[0], aliases: ['old hand'] });
    return { aliases: file };
  }, /is not a career of the catalogue/);
});

test('the catalogue migration decides in the database, keeps one path and loses no goal', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  // The file as rows, one to a line.
  assert.equal((sql.match(/^ {2}\(\d+, '.*', '[a-z]+', '.*'\)[,;]$/gm) ?? []).length, catalogue.careers.length, 'one row per career');
  // Additive and repeatable.
  assert.match(sql, /ALTER TABLE occupations ADD COLUMN IF NOT EXISTS home_domain text REFERENCES skill_domains \(slug\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS occupation_links/);
  assert.match(sql, /CHECK \(from_occupation_id <> to_occupation_id\)/);
  assert.match(sql, /REFERENCES occupations \(id\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /\b(BEGIN|COMMIT);/, 'the runner supplies the transaction');
  // Rows are found by title in any letter case.
  assert.match(sql, /lower\(o\.title\) = ANY \(v_names\)/);
  // Goals move unless the person already has the kept career as a goal: none lost, none twice.
  assert.match(sql, /UPDATE user_goals x SET occupation_id = v_keeper[\s\S]*?NOT EXISTS \(SELECT 1 FROM user_goals y WHERE y\.occupation_id = v_keeper AND y\.user_id = x\.user_id\)/);
  // Everything an admin's merge moves (server/lib/recordMerge.ts) moves here too.
  for (const table of ['industry_occupations', 'factory_occupations', 'jobs', 'occupation_aliases', 'occupation_links']) {
    assert.match(sql, new RegExp(`UPDATE ${table}\\b`), `${table} moves`);
  }
  // One path, never a union: the keeper's skills are replaced, not added to.
  assert.match(sql, /DELETE FROM occupation_skills WHERE occupation_id = v_keeper;\s+UPDATE occupation_skills SET occupation_id = v_keeper WHERE occupation_id = v_donor;/);
  // A removed title with a job that has applications, or that is somebody's goal, stays.
  assert.match(sql, /ELSIF m\.applications > 0 THEN[\s\S]*?ELSIF m\.goals > 0 THEN[\s\S]*?ELSE\s+DELETE FROM occupations WHERE id = m\.id;/);
  // Each decision is written down.
  for (const action of ['kept', 'renamed', 'created', 'folded', 'path', 'no path', 'not found', 'removed', 'not removed', 'not in the file', 'summary']) {
    assert.ok(sql.includes(`cat_log('${action}'`), `the log has "${action}"`);
  }
});

test('both migrations are in the runner\'s list, the lists after the catalogue', () => {
  const runner = readFileSync('scripts/migrate.mjs', 'utf8');
  assert.match(runner, /'0046_careers_catalogue\.sql', '0047_career_lists\.sql'/);
  assert.ok(runner.indexOf("'0047_career_lists.sql'") < runner.indexOf("'0056_career_lists_2.sql'"), 'the second lists migration follows the first');
  // The catalogue's second comes after the skills' fifth and its taxonomy (a home is a domain), and the lists' third right after it.
  assert.match(runner, /'0073_careers_catalogue_2\.sql', '0074_career_lists_3\.sql'/);
  assert.ok(runner.indexOf("'0071_skill_taxonomy_5.sql'") < runner.indexOf("'0073_careers_catalogue_2.sql'"));
});

test('a name taken back is deleted from its career only, said in the log, and listed for nobody', () => {
  const sql = readFileSync(LISTS_MIGRATION, 'utf8');
  const taken = aliases.careers.flatMap((row) => (row.not ?? []).map((name) => [row.title, name] as const));
  assert.ok(taken.length > 0, 'the list takes some names back');
  // The earlier lists, and the titles the first catalogue folded in (a title folded then may be a career of its own now).
  const earlier = ['migrations/0047_career_lists.sql', 'migrations/0056_career_lists_2.sql', 'migrations/0046_careers_catalogue.sql'].map((file) => readFileSync(file, 'utf8')).join('\n');
  for (const [title, name] of taken) {
    assert.ok(sql.includes(`  ('${name.replace(/'/g, "''")}', '${title}')`), `${name} is taken back from ${title}`);
    // A name that means other work elsewhere is not another career's either.
    for (const row of aliases.careers) assert.ok(!row.aliases.some((alias) => alias.toLowerCase() === name.toLowerCase()), `"${name}" is not listed for ${row.title}`);
    // It was a name the career had: a folded title of the catalogue, or an everyday name of the earlier list.
    const folded = catalogue.careers.find((career) => career.title === title)?.was.some((was) => was.toLowerCase() === name.toLowerCase());
    assert.ok(folded || earlier.includes(`('${name}', '${title}')`) || earlier.includes(`('${title}', '${name}')`), `"${name}" was a name of ${title}`);
  }
  const at = (text: string) => {
    const i = sql.indexOf(text);
    assert.ok(i >= 0, `the migration has: ${text}`);
    return i;
  };
  const gone = at('DELETE FROM occupation_aliases a USING list_not n, occupations o');
  at('WHERE o.title = n.title AND a.canonical_occupation_id = o.id AND lower(a.alias_text) = lower(n.alias)');
  at("'name removed'");
  assert.ok(gone < at('INSERT INTO occupation_aliases (alias_text, canonical_occupation_id)'), 'names are taken back before any is added');
  assert.equal(sql.match(/DELETE FROM occupation_aliases/g)?.length, 1, 'no other name is deleted');
  at("'name added'");
  at("'name not added'");
});

test('the second catalogue adds the trades of the industries it lacked: each with a home, a description and a place on the lists', () => {
  const before = readFileSync('migrations/0046_careers_catalogue.sql', 'utf8');
  const after = readFileSync(MIGRATION, 'utf8');
  const titles = (sql: string) => new Set([...sql.matchAll(/^ {2}\(\d+, '((?:[^']|'')+)', '[a-z]+', '(?:[^']|'')*'\)[,;]$/gm)].map((m) => m[1].replace(/''/g, "'")));
  const was = titles(before);
  const now = titles(after);
  assert.equal(was.size, 156);
  assert.equal(now.size, 231);
  for (const title of was) assert.ok(now.has(title), `${title} is still a career`);
  const added = [...now].filter((title) => !was.has(title));
  assert.equal(added.length, 75);
  const named = new Map(industries.industries.flatMap((row) => row.careers.map((title) => [title, row.industry] as const)));
  for (const title of added) assert.ok(named.has(title), `${title} is typical of an industry`);
  // A level, a single machine, a product or an employer's program is another name, never a career.
  for (const title of ['Kiln Operator', 'Field Service Technician', 'Thermoforming Operator', 'Wire Drawing Operator', 'Head Brewer', 'Cellar Worker']) assert.ok(!now.has(title), `${title} is not a career of its own`);
  // Names that moved: the molding technician's names are the process technician's now, not the operator's.
  const operator = catalogue.careers.find((career) => career.title === 'Injection Molding Operator')!;
  const technician = aliases.careers.find((row) => row.title === 'Plastics Process Technician')!;
  for (const name of ['molding technician', 'mold technician', 'injection molding process technician']) {
    assert.ok(operator.dropAliases?.includes(name), `${name} must not follow Injection Molding Operator`);
    assert.ok(technician.aliases.includes(name), `${name} is Plastics Process Technician's`);
  }
  // The careers that leave a ladder at the bottom have a rung above them now.
  const leads = new Map(catalogue.careers.map((career) => [career.title, career.leadsTo]));
  assert.ok(leads.get('Food Processing Operator')!.includes('Baker'));
  assert.ok(leads.get('Welder')!.includes('Pipefitter'));
  assert.ok(leads.get('Metal Fabricator')!.includes('Shipfitter'));
  assert.ok(leads.get('Wire Harness Assembler')!.includes('Marine Electrician'));
});

test('the check refuses a name both listed for a career and taken back from it', () => {
  const twice = copy(aliases);
  const row = twice.careers.find((career) => career.aliases.length > 0)!;
  row.not = [row.aliases[0].toUpperCase()];
  const result = checkLists({ aliases: twice });
  assert.ok(!result.ok);
  assert.match(result.said, /is both listed for .* and taken back from it/);
  const title = copy(aliases);
  title.careers[0].not = [title.careers[0].title];
  assert.match(checkLists({ aliases: title }).said, /cannot be taken back from it/);
});
