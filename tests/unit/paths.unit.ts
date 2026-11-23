// The careers' skill paths (data/careers/paths.json), the checks their builder
// makes (scripts/build-career-paths-sql.mjs) and the migration made from them.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MIGRATIONS } from '../../scripts/migrate.mjs';

type Line = string | { skill: string; why: string };
interface PathsFile {
  note: string;
  weakLinks: { from: string; to: string; why: string }[];
  careers: { title: string; basis: string; skills: Line[]; lacks?: string[] }[];
}
interface Career {
  title: string;
  home: string;
  leadsTo: string[];
}

const BUILDER = 'scripts/build-career-paths-sql.mjs';
const PATHS = 'data/careers/paths.json';
const CAREERS = 'data/careers/catalogue.json';
const SKILLS = 'data/skills/catalogue.json';
const TAXONOMY = 'data/skills/taxonomy.json';
const MIGRATION = 'migrations/0052_career_paths.sql';

const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const paths = read<PathsFile>(PATHS);
const careers = read<{ careers: Career[] }>(CAREERS).careers;
const skills = read<{ skills: { name: string }[] }>(SKILLS).skills;
const taxonomy = read<{ domains: { slug: string; groups: { slug: string; skills: { name: string; level: number }[] }[] }[] }>(TAXONOMY);
// The groups added for the military careers (0060). Their skills are on those careers' paths
// (data/careers/military/), which are not this file's: a civilian path may use one, and none has to.
const MILITARY_GROUPS = ['aircraft-systems', 'engines-and-power-plants', 'vehicles-and-heavy-equipment', 'power-generation-and-distribution', 'plant-utilities', 'fielded-electronic-systems', 'weapons-and-munitions', 'survival-equipment', 'shipfitting', 'nuclear-plant-operations', 'fuels'];
const copy = (): PathsFile => JSON.parse(JSON.stringify(paths)) as PathsFile;
const name = (line: Line) => (typeof line === 'string' ? line : line.skill);
const entry = (file: PathsFile, title: string) => {
  const found = file.careers.find((career) => career.title === title);
  assert.ok(found, `${title} has a path`);
  return found;
};
const level = new Map(taxonomy.domains.flatMap((domain) => domain.groups.flatMap((group) => group.skills.map((skill) => [skill.name, skill.level] as const))));

/** Runs the builder's --check over a paths file and gives back how it ended and what it said. */
function check(file: PathsFile): { ok: boolean; said: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'paths-check-'));
  try {
    const input = path.join(dir, 'paths.json');
    writeFileSync(input, JSON.stringify(file));
    const run = spawnSync(process.execPath, [BUILDER, '--check', input, CAREERS, SKILLS, TAXONOMY], { encoding: 'utf8' });
    return { ok: run.status === 0, said: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the paths migration is what the paths file generates', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'paths-sql-'));
  try {
    const out = path.join(dir, 'out.sql');
    execFileSync(process.execPath, [BUILDER, PATHS, CAREERS, SKILLS, TAXONOMY, out]);
    assert.equal(readFileSync(out, 'utf8'), readFileSync(MIGRATION, 'utf8'), `${MIGRATION} is stale: run node ${BUILDER}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the paths file passes its own check, and every career has one path', () => {
  const result = check(paths);
  assert.ok(result.ok, result.said);
  assert.match(result.said, /valid\. 156 careers/);
  assert.deepEqual(paths.careers.map((career) => career.title), careers.map((career) => career.title), 'one entry per career, in the catalogue order');
});

test('a path is a foundation, a working trade and, for a skilled trade, a specialisation', () => {
  const known = new Set(skills.map((skill) => skill.name));
  for (const career of paths.careers) {
    const names = career.skills.map(name);
    assert.equal(new Set(names).size, names.length, `${career.title} lists a skill twice`);
    for (const skill of names) assert.ok(known.has(skill), `${career.title}: ${skill} is a catalogue skill`);
    assert.ok(names.length >= 8 && names.length <= 24, `${career.title} has ${names.length} skills`);
    const at = (wanted: number) => names.filter((skill) => level.get(skill) === wanted).length;
    assert.ok(at(1) >= 2, `${career.title} stands on Fundamentals`);
    assert.ok(at(2) >= 2, `${career.title} has a working trade`);
  }
  // The owner's ladder: each rung holds most of the one below and adds to it.
  const of = (title: string) => new Set(entry(paths, title).skills.map(name));
  const keeps = (lower: string, upper: string) => [...of(lower)].filter((skill) => of(upper).has(skill)).length / of(lower).size;
  assert.ok(keeps('CNC Machine Operator', 'CNC Machinist') >= 0.8);
  assert.ok(keeps('CNC Machinist', 'CNC Programmer') >= 0.6);
  assert.ok(of('CNC Machinist').size > of('CNC Machine Operator').size);
  // An operator's path stops before the next rung's work.
  for (const skill of ['G-Code Programming', 'CAM Programming', 'Workholding and Fixturing']) assert.ok(!of('CNC Machine Operator').has(skill), `the operator does not ${skill}`);
  assert.ok(of('CNC Programmer').has('CAM Programming') && of('CNC Programmer').has('CNC Program Verification'));
});

test('the skills added last round are on a path, so they show in the Skills list', () => {
  const used = new Set(paths.careers.flatMap((career) => career.skills.map(name)));
  for (const skill of ['CNC Turning', 'Injection Molding Machine Operation', 'Dial Indicator Measurement', 'SCADA Development', 'Box Build Assembly', 'Control Panel Building', 'Shot Peening', 'Powder Coating', 'CMMS Use', 'Requirements Management']) {
    assert.ok(used.has(skill), `${skill} is on a path`);
  }
  const military = new Set(taxonomy.domains.flatMap((domain) => domain.groups).filter((group) => MILITARY_GROUPS.includes(group.slug)).flatMap((group) => group.skills.map((skill) => skill.name)));
  assert.equal(military.size, 66);
  const onMilitaryPath = new Set(read<{ careers: { skills: string[] }[] }>('data/careers/military/paths.json').careers.flatMap((career) => career.skills));
  for (const skill of military) assert.ok(onMilitaryPath.has(skill), `${skill} is on a military path`);
  const unused = skills.map((skill) => skill.name).filter((skill) => !used.has(skill) && !military.has(skill));
  assert.ok(unused.length <= 5, `${unused.length} skills are on no path: ${unused.join(', ')}`);
});

test('the check refuses a paths file that is not whole', async (t) => {
  const refused = (title: string, change: (file: PathsFile) => void, saying: RegExp) =>
    t.test(title, () => {
      const file = copy();
      change(file);
      const result = check(file);
      assert.ok(!result.ok, `${title}: the check passed`);
      assert.match(result.said, saying);
    });
  await refused('a career with no path', (file) => { file.careers = file.careers.filter((career) => career.title !== 'Welder'); }, /"Welder" is a career of the catalogue and has no path/);
  await refused('a title the catalogue does not have', (file) => { file.careers.push({ ...file.careers[0], title: 'Glass Blower' }); }, /"Glass Blower" is not a career of the catalogue/);
  await refused('two entries for one career', (file) => { file.careers.push({ ...file.careers[0] }); }, /has two entries/);
  await refused('a skill the catalogue does not have', (file) => { file.careers[0].skills[0] = 'Crew Training and Coaching'; }, /"Crew Training and Coaching" is not a skill in the catalogue/);
  await refused('a brand standing as a skill', (file) => { entry(file, 'CNC Programmer').skills.push('Mastercam'); }, /"Mastercam" is not a skill in the catalogue/);
  await refused('a skill twice in a path', (file) => { file.careers[0].skills.push(name(file.careers[0].skills[0])); }, /twice/);
  await refused('a path of seven', (file) => { entry(file, 'Quality Control Chemist').skills.splice(7); }, /has 7 skills; a path has 8 to 24/);
  await refused('a path of twenty-five', (file) => {
    const career = entry(file, 'CNC Machinist');
    const have = new Set(career.skills.map(name));
    career.skills.push(...skills.map((skill) => skill.name).filter((skill) => !have.has(skill)).slice(0, 25 - have.size));
  }, /has 25 skills; a path has 8 to 24/);
  await refused('a path with no foundation', (file) => { const career = entry(file, 'Test Engineer'); career.skills = career.skills.filter((line) => level.get(name(line)) !== 1); }, /has 0 skills at Fundamentals/);
  await refused('a path pasted under the wrong title', (file) => { entry(file, 'Yield Engineer').skills = [...entry(file, 'Welder').skills]; }, /"Yield Engineer" has no skill from its home domain, "semiconductor"/);
  await refused('a path with no basis', (file) => { file.careers[0].basis = ''; }, /does not say where its path was read from/);
  await refused('a why that says nothing', (file) => { file.careers[0].skills[0] = { skill: name(file.careers[0].skills[0]), why: '' }; }, /"why" must be a sentence/);
  await refused('a lack the catalogue has', (file) => { file.careers[0].lacks = ['CNC Turning']; }, /says the catalogue lacks "CNC Turning", which is a skill in it/);
  await refused('a foundation pasted onto every career', (file) => {
    for (const career of file.careers) if (!career.skills.map(name).includes('Shop Safety Practices') && career.skills.length < 24) career.skills.push('Shop Safety Practices');
  }, /"Shop Safety Practices" is on \d+ of 156 paths: more than half/);
  await refused('a ladder that does not show in the skills', (file) => {
    // The machinist's path replaced by a painter's: nothing of the operator carries.
    entry(file, 'CNC Machinist').skills = [...entry(file, 'Industrial Painter').skills, 'CNC Milling'];
  }, /"CNC Machine Operator" leads to "CNC Machinist", which keeps \d+% of its skills: under a third/);
  await refused('a weak link nobody acknowledged', (file) => { file.weakLinks = file.weakLinks.slice(1); }, /under a third\. Write the two paths against each other, or acknowledge the link/);
  await refused('a link acknowledged as weak that is not', (file) => { file.weakLinks.push({ from: 'MIG Welder', to: 'Welder', why: 'It is not.' }); }, /it is acknowledged as weak and is not/);
  await refused('an acknowledged link the catalogue does not have', (file) => { file.weakLinks.push({ from: 'Welder', to: 'Yield Engineer', why: 'No such ladder.' }); }, /is not a link of the careers catalogue/);
  await refused('no list at all', (file) => { (file as { careers: unknown }).careers = {}; }, /"careers" must be a list/);
});

test('every acknowledged weak link is one, and each says why', () => {
  const of = new Map(paths.careers.map((career) => [career.title, new Set(career.skills.map(name))]));
  const links = new Set(careers.flatMap((career) => career.leadsTo.map((to) => `${career.title} > ${to}`)));
  for (const link of paths.weakLinks) {
    assert.ok(links.has(`${link.from} > ${link.to}`), `${link.from} leads to ${link.to}`);
    const lower = of.get(link.from)!;
    const share = [...lower].filter((skill) => of.get(link.to)!.has(skill)).length / lower.size;
    assert.ok(share < 1 / 3, `${link.from} to ${link.to} keeps ${share}`);
    assert.ok(link.why.length > 20);
  }
  // Most of the ladders show in the skills.
  assert.ok(paths.weakLinks.length <= links.size / 5, `${paths.weakLinks.length} of ${links.size} links are weak`);
});

test('the migration finds by name, leaves an approved path alone, and writes exactly the file', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const at = (text: string) => {
    const index = sql.indexOf(text);
    assert.ok(index >= 0, `the migration has: ${text}`);
    return index;
  };
  // One row per career and per line of the file.
  const rows = (from: string, to: string) => sql.slice(at(from), at(to)).split('\n').filter((line) => line.startsWith('  (')).length;
  assert.equal(rows('INSERT INTO path_careers', 'INSERT INTO path_lines'), paths.careers.length);
  assert.equal(rows('INSERT INTO path_lines', '-- Each name, found'), paths.careers.reduce((sum, career) => sum + career.skills.length, 0));
  // A skill is found by its name, then by another name it goes by; one that is neither is skipped, not fatal.
  at('(SELECT s.id FROM skills s WHERE s.name = l.skill)');
  at('FROM skill_aliases a WHERE lower(a.alias_text) = lower(l.skill)');
  at("'skill not found', true");
  assert.ok(!/RAISE EXCEPTION/.test(sql), 'the migration does not stop on a name it cannot find');
  // The approved path is passed over before anything is deleted or added.
  const approved = at("IF v_status = 'approved' THEN");
  const passed = sql.indexOf('CONTINUE;', approved);
  assert.ok(passed > approved && passed < at('DELETE FROM occupation_skills os WHERE os.occupation_id = v_id'), 'an approved path is left before the first change');
  at("'approved, left', true");
  // It sets a draft and never approves; it sets no stage (the trigger does); it touches only careers of the file.
  at("UPDATE occupations SET path_status = 'draft' WHERE id = v_id AND path_status IS DISTINCT FROM 'draft'");
  assert.ok(!/path_status = 'approved'\s*(WHERE|,|;)/.test(sql.replace("IF v_status = 'approved' THEN", '')), 'the migration approves nothing');
  assert.ok(!/INSERT INTO occupation_skills \([^)]*stage/.test(sql), 'a path sets no stage');
  assert.ok(!/DELETE FROM (occupations|skills|skill_aliases)\b/.test(sql), 'the migration deletes no career and no skill');
  at("'not in the file', true");
  at("VALUES ('career-paths', 'career', p_action, p_look, p_detail)");
});

test("the migration is in the runner's list after the makes'", () => {
  const list = MIGRATIONS as string[];
  assert.ok(list.includes('0052_career_paths.sql'));
  // After the careers catalogue (which stores the careers) and the skills catalogue and taxonomy (which store and place the skills).
  for (const before of ['0046_careers_catalogue.sql', '0048_skills_catalogue_2.sql', '0049_skill_taxonomy_2.sql', '0050_skill_makes.sql']) {
    assert.ok(list.indexOf('0052_career_paths.sql') > list.indexOf(before), `0052 comes after ${before}`);
  }
});
