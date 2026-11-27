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
  /** The words that make a posting's title not ours, whatever career it also names: read by the posting reader, loaded into no table. */
  notOurs?: { why: string; words: string[]; exceptIn?: string[] };
}

const BUILDER = 'scripts/build-careers-sql.mjs';
const LISTS_BUILDER = 'scripts/build-career-lists-sql.mjs';
const CATALOGUE = 'data/careers/catalogue.json';
const TAXONOMY = 'data/skills/taxonomy.json';
const INDUSTRY_LIST = 'data/careers/industries.json';
const ALIASES = 'data/careers/aliases.json';
// The latest of each. 0046 and 0073 were the catalogue's first and second; 0047, 0056 and 0074 the lists' first three; each is as it was applied.
const MIGRATION = 'migrations/0084_careers_catalogue_3.sql';
const LISTS_MIGRATION = 'migrations/0085_career_lists_4.sql';
const SECOND_MIGRATION = 'migrations/0073_careers_catalogue_2.sql';
// The careers that left the catalogue with its third migration: cleaning a plant, and preparing food by hand.
const TAKEN_OUT = ['Sanitation Technician', 'Meat Cutter', 'Slaughterer', 'Baker'];

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
  // A removed title with a job that has applications, that is somebody's goal, or that anything else hangs from (a
  // company's own version of it) stays. What else hangs from a career is asked of the database's foreign keys, as the
  // employer loader's merge guard asks: the migration names no table of a version (tests/unit/versions.unit.ts holds
  // that no migration does), and a table added later is guarded without this file knowing it.
  const removal = sql.slice(sql.indexOf('FROM cat_removed r LEFT JOIN occupations o'), sql.indexOf('-- A career the file does not name is left alone'));
  assert.match(removal, /ELSIF m\.applications > 0 THEN[\s\S]*?ELSIF m\.goals > 0 THEN[\s\S]*?ELSIF m\.others IS NOT NULL THEN[\s\S]*?ELSE[\s\S]*?DELETE FROM occupations WHERE id = m\.id;/);
  assert.match(sql, /pg_temp\.cat_goes_with\(o\.id\) AS others/);
  assert.match(sql, /WHERE c\.confrelid = 'occupations'::regclass AND c\.contype = 'f' AND c\.confdeltype = 'c'/);
  // What a removal knowingly takes with a career, and nothing more.
  assert.match(sql, /NOT IN \('occupation_skills', 'occupation_aliases', 'occupation_links', 'industry_occupations',\s+'factory_occupations', 'jobs', 'user_goals'\)/);
  assert.doesNotMatch(sql, /company_career/);
  assert.equal(removal.match(/DELETE FROM occupations\b/g)?.length, 1, 'a career is deleted in one place, after every reason to keep it');
  // Each decision is written down.
  for (const action of ['kept', 'renamed', 'created', 'folded', 'path', 'no path', 'not found', 'removed', 'not removed', 'jobs removed', 'postings unstaged', 'not in the file', 'summary']) {
    assert.ok(sql.includes(`cat_log('${action}'`), `the log has "${action}"`);
  }
});

test('a removed career goes with its jobs and with what the postings pipeline keeps of them', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const at = (text: string) => {
    const i = sql.indexOf(text);
    assert.ok(i >= 0, `the migration has: ${text}`);
    return i;
  };
  // Before the career is deleted (its jobs go with it by the foreign key, and with them their skills and makes):
  // the outside ids of its jobs, which no foreign key holds, and the staged postings read as it.
  const ids = at("DELETE FROM external_references x USING jobs j WHERE x.entity_type = 'jobs' AND x.entity_id = j.id AND j.occupation_id = m.id;");
  const staged = at('FROM pg_temp.cat_unstage(m.title) u;');
  // (The same words delete a folded row, earlier in the file: the one that deletes a removed career follows these.)
  const career = sql.indexOf('DELETE FROM occupations WHERE id = m.id;', staged);
  assert.ok(ids < staged && staged < career, 'ids, then staging, then the career');
  // Staging: a source of jobs only, the reading's career by its title in any letter case; the links and reviews follow by their foreign keys.
  at("WHERE s.kind = 'job' AND lower(r.facts->'reading'->'career'->>'title') = lower(p_title);");
  at('DELETE FROM intake_records r USING cat_unstaged u WHERE r.source = u.source AND r.source_id = u.source_id;');
  // A place stops waiting only when it waited (a person's or the data's decision stays), the postings that went named
  // it, and no posting still standing does.
  const places = sql.slice(at('DELETE FROM posting_places pp'), at('GET DIAGNOSTICS places = ROW_COUNT;'));
  assert.match(places, /WHERE pp\.status = 'waiting'\s+AND EXISTS \(SELECT 1 FROM cat_unstaged u,[\s\S]*?AND NOT EXISTS \(SELECT 1 FROM intake_records r,[\s\S]*?r\.gone_run_id IS NULL/);
  // A title to remove that is not stored is still cleared from staging (a run that read with the catalogue as it was).
  at('FROM pg_temp.cat_unstage(m.named) u;');
  // What went is said, for a person to read on a database that had careers.
  at("cat_log('jobs removed', NOT v_new");
  at("cat_log('postings unstaged', NOT v_new");
  // Nothing of the pipeline's history is rewritten, and no job is deleted but through its career.
  assert.ok(!/DELETE FROM (jobs|intake_changes|intake_runs|load_log|posting_passes)\b/.test(sql), 'the journal, the runs and the log stay');
  // It stands after the tables it reads.
  const list = readFileSync('scripts/migrate.mjs', 'utf8');
  for (const before of ["'0043_intake.sql'", "'0054_job_postings.sql'"]) assert.ok(list.indexOf(before) < list.indexOf("'0084_careers_catalogue_3.sql'"), `0084 comes after ${before}`);
});

test('both migrations are in the runner\'s list, the lists after the catalogue', () => {
  const runner = readFileSync('scripts/migrate.mjs', 'utf8');
  assert.match(runner, /'0046_careers_catalogue\.sql', '0047_career_lists\.sql'/);
  assert.ok(runner.indexOf("'0047_career_lists.sql'") < runner.indexOf("'0056_career_lists_2.sql'"), 'the second lists migration follows the first');
  // The catalogue's second comes after the skills' fifth and its taxonomy (a home is a domain), and the lists' third right after it.
  assert.match(runner, /'0073_careers_catalogue_2\.sql', '0074_career_lists_3\.sql'/);
  assert.ok(runner.indexOf("'0071_skill_taxonomy_5.sql'") < runner.indexOf("'0073_careers_catalogue_2.sql'"));
  // The catalogue's third, the lists' fourth and the paths' third stand together, after everything applied before them.
  assert.match(runner, /'0084_careers_catalogue_3\.sql', '0085_career_lists_4\.sql', '0086_career_paths_3\.sql'/);
  assert.ok(runner.indexOf("'0082_texas_hubs_2.sql'") < runner.indexOf("'0084_careers_catalogue_3.sql'"));
});

test('a name taken back is deleted from its career only, said in the log, and listed for nobody', () => {
  const sql = readFileSync(LISTS_MIGRATION, 'utf8');
  const taken = aliases.careers.flatMap((row) => (row.not ?? []).map((name) => [row.title, name] as const));
  assert.ok(taken.length > 0, 'the list takes some names back');
  // The earlier lists, and the titles the first catalogue folded in (a title folded then may be a career of its own now).
  const earlier = ['migrations/0047_career_lists.sql', 'migrations/0056_career_lists_2.sql', 'migrations/0074_career_lists_3.sql', 'migrations/0046_careers_catalogue.sql'].map((file) => readFileSync(file, 'utf8')).join('\n');
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

const rowTitles = (sql: string) => new Set([...sql.matchAll(/^ {2}\(\d+, '((?:[^']|'')+)', '[a-z]+', '(?:[^']|'')*'\)[,;]$/gm)].map((m) => m[1].replace(/''/g, "'")));

test('the second catalogue adds the trades of the industries it lacked: each with a home, a description and a place on the lists', () => {
  const before = readFileSync('migrations/0046_careers_catalogue.sql', 'utf8');
  const after = readFileSync(SECOND_MIGRATION, 'utf8');
  const was = rowTitles(before);
  const now = rowTitles(after);
  assert.equal(was.size, 156);
  assert.equal(now.size, 231);
  for (const title of was) assert.ok(now.has(title), `${title} is still a career`);
  const added = [...now].filter((title) => !was.has(title));
  assert.equal(added.length, 75);
  // Every one of them that is still a career is typical of an industry (four have left since: the next check).
  const named = new Map(industries.industries.flatMap((row) => row.careers.map((title) => [title, row.industry] as const)));
  for (const title of added) assert.ok(named.has(title) || TAKEN_OUT.includes(title), `${title} is typical of an industry`);
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
  assert.ok(leads.get('Food Processing Operator')!.includes('Cheesemaker'));
  assert.ok(leads.get('Welder')!.includes('Pipefitter'));
  assert.ok(leads.get('Metal Fabricator')!.includes('Shipfitter'));
  assert.ok(leads.get('Wire Harness Assembler')!.includes('Marine Electrician'));
});

test('the third catalogue takes out cleaning a plant and preparing food by hand, and nothing else', () => {
  const before = readFileSync(SECOND_MIGRATION, 'utf8');
  const after = readFileSync(MIGRATION, 'utf8');
  const was = rowTitles(before);
  const now = rowTitles(after);
  assert.equal(now.size, 227);
  assert.equal(catalogue.careers.length, 227);
  assert.deepEqual([...was].filter((title) => !now.has(title)).sort(), [...TAKEN_OUT].sort(), 'the four, and only they, are careers no longer');
  assert.deepEqual([...now].filter((title) => !was.has(title)), [], 'no career is added');
  // They are under `removed`, in one group that says why, so the migration deletes them and the title cannot come back unnoticed.
  const group = catalogue.removed.find((each) => each.titles.includes('Sanitation Technician'))!;
  assert.deepEqual(group.titles, TAKEN_OUT);
  assert.match(group.why, /Cleaning a plant and preparing food by hand/);
  for (const title of TAKEN_OUT) assert.ok(after.includes(`, '${title}')`), `${title} is a row of cat_removed`);
  assert.equal(catalogue.removed.reduce((sum, each) => sum + each.titles.length, 0), 17);
  // Every other career's row is as the second catalogue wrote it: title, home and what.
  const rows = (sql: string) => new Map([...sql.matchAll(/^ {2}\(\d+, ('(?:[^']|'')+', '[a-z]+', '(?:[^']|'')*')\)[,;]$/gm)].map((m) => [m[1].split("', '")[0], m[1]] as const));
  const [rowsBefore, rowsAfter] = [rows(before), rows(after)];
  for (const [title, row] of rowsAfter) assert.equal(row, rowsBefore.get(title), `${title} is as it was`);
  // The ladders: the five links that named one of the four are gone, and one is added so that Food Safety and Quality
  // Technician, which only the three that left led to, still has a career below it. No other link changed.
  // (A link is `from, to` with its place among the careers `from` leads to: Cheesemaker moves up to the place Baker had.)
  const linkRows = (sql: string) => sql.slice(sql.indexOf('INSERT INTO cat_links'), sql.indexOf('INSERT INTO cat_drop')).split('\n').filter((line) => line.startsWith('  (')).map((line) => line.replace(/[,;]$/, ''));
  const links = (sql: string) => new Set(linkRows(sql).map((line) => line.replace(/, \d+\)$/, ')')));
  const [linksBefore, linksAfter] = [links(before), links(after)];
  assert.equal(linksBefore.size, 195);
  assert.equal(linksAfter.size, 191);
  const gone = [...linksBefore].filter((link) => !linksAfter.has(link));
  assert.equal(gone.length, 5);
  for (const link of gone) assert.ok(TAKEN_OUT.some((title) => link.includes(`'${title}'`)), `${link} named one of the four`);
  assert.deepEqual([...linksAfter].filter((link) => !linksBefore.has(link)), ["  ('Food Processing Operator', 'Food Safety and Quality Technician')"]);
  const placed = new Set(linkRows(before));
  assert.deepEqual(
    linkRows(after).filter((line) => !placed.has(line)),
    ["  ('Food Processing Operator', 'Cheesemaker', 2)", "  ('Food Processing Operator', 'Food Safety and Quality Technician', 3)"],
    'one link changes its place, one is new, and none other'
  );
  assert.deepEqual(catalogue.careers.find((career) => career.title === 'Food Processing Operator')!.leadsTo, ['Maintenance Technician', 'Cheesemaker', 'Food Safety and Quality Technician']);
  // Which careers no career leads to any more: Baker, which left, and Food Scientist, which only Baker led to and
  // which now starts its ladder as the engineers start theirs. Food Safety and Quality Technician is not among them.
  const reached = (sql: string) => new Set([...links(sql)].map((link) => /, '((?:[^']|'')+)'\)$/.exec(link)![1]));
  assert.deepEqual([...reached(before)].filter((title) => !reached(after).has(title)).sort(), ['Baker', 'Food Scientist']);
  // No list names one: not a ladder, an industry, an everyday name's career, or a name another career goes by.
  for (const career of catalogue.careers) for (const next of career.leadsTo) assert.ok(!TAKEN_OUT.includes(next), `${career.title} leads to ${next}`);
  for (const row of industries.industries) for (const title of row.careers) assert.ok(!TAKEN_OUT.includes(title), `${row.industry} lists ${title}`);
  const taken = new Set(TAKEN_OUT.map((title) => title.toLowerCase()));
  for (const row of aliases.careers) {
    assert.ok(!TAKEN_OUT.includes(row.title), `${row.title} has everyday names`);
    for (const alias of row.aliases) assert.ok(!taken.has(alias.toLowerCase()), `"${alias}" is another name of ${row.title}`);
  }
  for (const career of catalogue.careers) for (const was of career.was) assert.ok(!taken.has(was.toLowerCase()), `"${was}" is folded into ${career.title}`);
  // The food and drink careers that run process equipment stay.
  for (const title of ['Food Processing Operator', 'Beverage Production Operator', 'Packaging Line Operator', 'Food Safety and Quality Technician', 'Food Safety Specialist',
    'Food Scientist', 'Brewer', 'Winemaker', 'Cheesemaker', 'Distiller', 'Grain Miller']) assert.ok(now.has(title), `${title} is still a career`);
  // The lists that follow it: 421 careers by industry (426 less the five places the four had), and 42 everyday names
  // fewer, with five added (the production welder, who is the MIG Welder, and the TIG one; a body shop's weld
  // technician as one employer titles it) and one taken back (a rigger is not a millwright). The reader's test holds
  // what each changes.
  const listsBefore = readFileSync('migrations/0074_career_lists_3.sql', 'utf8');
  const listsAfter = readFileSync(LISTS_MIGRATION, 'utf8');
  const listed = (sql: string, from: string, to: string) => sql.slice(sql.indexOf(from), sql.indexOf(to)).split('\n').filter((line) => line.startsWith('  (')).map((line) => line.replace(/[,;]$/, ''));
  const own = (sql: string) => listed(sql, 'INSERT INTO list_industries', 'INSERT INTO list_names').filter((line) => line.endsWith(', false)'));
  assert.equal(own(listsBefore).length, 426);
  assert.equal(own(listsAfter).length, 421);
  assert.equal(industries.industries.reduce((sum, row) => sum + row.careers.length, 0), 421);
  const names = (sql: string) => listed(sql, 'INSERT INTO list_names', '-- Careers by industry');
  assert.equal(names(listsBefore).length, 1156);
  assert.equal(names(listsAfter).length, 1118);
  const namesAfter = new Set(names(listsAfter));
  const TAKEN_BACK = ["  ('rigger', 'Millwright')"];
  for (const line of names(listsBefore)) assert.ok(namesAfter.has(line) || TAKEN_BACK.includes(line) || TAKEN_OUT.some((title) => line.endsWith(`, '${title}')`)), `${line} is still listed`);
  for (const line of TAKEN_BACK) assert.ok(!namesAfter.has(line), `${line} is no longer a name`);
  const namesBefore = new Set(names(listsBefore));
  assert.deepEqual(
    names(listsAfter).filter((line) => !namesBefore.has(line)),
    [
      "  ('production welder', 'MIG Welder')", "  ('production MIG welder', 'MIG Welder')", "  ('MIG production welder', 'MIG Welder')",
      "  ('TIG production welder', 'TIG Welder')", "  ('EDV body weld technician', 'Body Weld Technician')",
    ],
    'the only names added'
  );
  // Two names more are taken back: a bakery's oven operator is not a painter, and a rigger is not a millwright.
  assert.ok(listsAfter.includes("  ('Oven Operator', 'Automotive Paint Technician')"));
  assert.ok(listsAfter.includes("  ('rigger', 'Millwright')"));
  assert.equal(aliases.careers.reduce((sum, row) => sum + (row.not ?? []).length, 0), 14);
});

test('the words that make a title not ours: the check holds their shape, and no career is named with one', () => {
  // The list as it stands: the words first written, the other spellings and the persons that go with them
  // ("grounds keeper", "house keeping", "foodservice", "landscaper", "food preparation"), the ways the same work
  // is said ("porter", "sanitizing", "hygiene", "grounds and maintenance", "lawn care", "canteen", "catering",
  // "culinary"), and the work of the careers that left the catalogue ("meat cutting", "kill floor", "deboning").
  assert.deepEqual(aliases.notOurs!.words, [
    'janitor', 'janitorial', 'custodian', 'custodial', 'housekeeper', 'housekeeping', 'house keeper', 'house keeping', 'porter',
    'sanitation', 'sanitor', 'sanitization', 'sanitizing', 'hygiene',
    'groundskeeper', 'groundskeeping', 'grounds keeper', 'grounds keeping', 'grounds maintenance', 'grounds and maintenance', 'grounds and building',
    'landscaping', 'landscaper', 'landscape', 'lawn care', 'lawn maintenance',
    'cafeteria', 'canteen', 'catering', 'culinary', 'food service', 'foodservice', 'food prep', 'food preparation',
    'meat cutter', 'meat cutting', 'butcher', 'kill floor', 'slaughter', 'deboning',
  ]);
  // A word of the list may stand in one of these and not count: a proving grounds has maintenance technicians.
  assert.deepEqual(aliases.notOurs!.exceptIn, ['proving grounds']);
  // Left off on purpose (real factory work is titled with them), and said so beside the list.
  for (const word of ['building', 'facilities', 'cleaning', 'cleaner', 'clean', 'kitchen', 'bakery', 'deli', 'store', 'market', 'lawn', 'harvest', 'grounds']) {
    assert.ok(!aliases.notOurs!.words.includes(word), `"${word}" is not on the list`);
    assert.ok(aliases.notOurs!.why.includes(word), `the list says "${word}" is left off`);
  }
  assert.match(checkLists({}).said, /; 40 words that make a title not ours\.$/m);
  // The words reach no table: the lists' migration is the same with and without them.
  const sql = readFileSync(LISTS_MIGRATION, 'utf8');
  for (const word of ['janitor', 'custodial', 'cafeteria', 'groundskeeper']) assert.ok(!sql.toLowerCase().includes(word), `${word} is not in the migration`);
  const refused = (name: string, change: (list: { why: unknown; words: unknown[] }, file: AliasesFile) => void, saying: RegExp) => {
    const file = copy(aliases);
    change(file.notOurs as unknown as { why: unknown; words: unknown[] }, file);
    const result = checkLists({ aliases: file });
    assert.ok(!result.ok, `${name}: the check let it through`);
    assert.match(result.said, saying, name);
  };
  refused('no why', (list) => { list.why = ''; }, /"notOurs" has no one-line "why"/);
  refused('a why of two lines', (list) => { list.why = 'One line.\nAnd another.'; }, /"notOurs" has no one-line "why"/);
  refused('no words', (list) => { list.words = []; }, /"notOurs" lists no words/);
  refused('a word in capitals', (list) => { list.words.push('Janitress'); }, /"Janitress" is not one to three plain words in lower case/);
  refused('a pattern, not a word', (list) => { list.words.push('clean.*'); }, /is not one to three plain words in lower case/);
  refused('a word twice', (list) => { list.words.push('janitor'); }, /"janitor" is listed twice/);
  refused('another key', (_, file) => { (file.notOurs as unknown as Record<string, unknown>).titles = []; }, /only "why", "words" and "exceptIn" are read/);
  // The phrases a word may stand in: two or three plain words, once each, sharing a word with the list.
  const phrases = (file: AliasesFile) => (file.notOurs as unknown as { exceptIn: unknown[] }).exceptIn;
  refused('a phrase of one word', (_, file) => { phrases(file).push('grounds'); }, /"grounds" is not two or three plain words in lower case/);
  refused('a phrase twice', (_, file) => { phrases(file).push('proving grounds'); }, /"proving grounds" is listed twice/);
  refused('a phrase that excepts nothing', (_, file) => { phrases(file).push('test track'); }, /"test track" shares no word with the words that make a title not ours/);
  refused('phrases that are not a list', (_, file) => { (file.notOurs as unknown as Record<string, unknown>).exceptIn = 'proving grounds'; }, /"notOurs.exceptIn" is not a list of phrases/);
  refused('not a list at all', (_, file) => { (file as unknown as Record<string, unknown>).notOurs = ['janitor']; }, /"notOurs" is not a why and a list of words/);
  // A word a career is named with could never be read: its title, a title folded into it, an everyday name.
  refused("a word of a career's title", (list) => { list.words.push('maintenance'); }, /"maintenance" makes a title not ours, and the career "Maintenance Technician" has it/);
  refused('a word of a folded title', (list) => { list.words.push('cleanroom'); }, /"cleanroom" makes a title not ours, and "Cleanroom Technician", a title folded into "Wafer Fab Operator" has it/);
  refused('words of an everyday name', (list) => { list.words.push('cleaning room'); }, /"cleaning room" makes a title not ours, and "Cleaning Room Operator", an everyday name of "Casting Finisher" has it/);
  refused('a word a title has in the plural', (list) => { list.words.push('electronic'); }, /"electronic" makes a title not ours, and the career "Electronics [A-Za-z ]+" has it/);
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
