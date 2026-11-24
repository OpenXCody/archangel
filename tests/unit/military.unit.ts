// Military careers: what shared/military.ts derives, and that the database's
// checks (migration 0061) name the same services and code systems.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MIGRATIONS } from '../../scripts/migrate.mjs';
import {
  CODE_SYSTEMS as BUILDER_CODE_SYSTEMS,
  PATH_FLOOR,
  SERVICE_KEYS,
  careerProblems,
  civilianNames,
  employerProblems,
  militaryPathProblems,
  reaches,
} from '../../scripts/build-military-sql.mjs';
import { loadVocabulary, readPosting } from '../../scripts/ingest/postings/read/index.mjs';
import {
  CODE_SYSTEMS,
  MILITARY_TAG,
  SERVICES,
  careerKind,
  careerTags,
  codeSystemOf,
  isCodeSystem,
  isServiceKey,
  militaryTitle,
  serviceName,
  serviceOfCodeSystem,
  serviceShortName,
} from '../../shared/military';

const COLUMNS = 'migrations/0061_career_service.sql';
const BUILDER = 'scripts/build-military-sql.mjs';
const EMPLOYERS = 'data/careers/military/employers.json';
/** The latest employers' migration: what the file generates now. 0062 was the first. */
const EMPLOYERS_MIGRATION = 'migrations/0077_military_employers_2.sql';
const FIRST_EMPLOYERS_MIGRATION = 'migrations/0062_military_employers.sql';

interface Employer {
  name: string;
  service: string;
  slug: string;
  domain: string;
  description: string;
  descriptionWas?: string[];
  headquarters: { city: string; state: string; country: string };
  sources?: string[];
}
const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const employers = read<{ companies: Employer[] }>(EMPLOYERS).companies;

interface MilitaryCareer {
  title: string;
  officialTitle: string;
  service: string;
  code: string;
  codeSystem: string;
  home: string;
  what: string;
  was: string[];
  source?: string;
}
interface MilitaryPath {
  title: string;
  basis: string;
  skills: string[];
}
interface CivilianCareer {
  title: string;
  home: string;
  was: string[];
}
type PathEntry = string | { skill: string };
const CAREERS = 'data/careers/military/careers.json';
const PATHS = 'data/careers/military/paths.json';
const CAREERS_MIGRATION = 'migrations/0063_military_careers.sql';
const PATHS_MIGRATION = 'migrations/0064_military_paths.sql';
const careersFile = read<{ careers: MilitaryCareer[]; dropped: { code: string; codeSystem: string; why: string }[] }>(CAREERS);
const pathsFile = read<{ careers: MilitaryPath[] }>(PATHS);
const careers = careersFile.careers;
const paths = pathsFile.careers;
const taxonomy = read<{ domains: { slug: string; groups: { slug: string; skills: { name: string; level: number }[] }[] }[] }>('data/skills/taxonomy.json');
const skillsCatalogue = read<{ skills: { name: string }[] }>('data/skills/catalogue.json');
const civilianCatalogue = read<{ careers: CivilianCareer[] }>('data/careers/catalogue.json');
const civilianAliases = read<{ careers: { title: string; aliases?: string[]; not?: string[] }[] }>('data/careers/aliases.json');
const civilianPaths = read<{ careers: { title: string; skills: PathEntry[] }[] }>('data/careers/paths.json');
const civilian = civilianNames(civilianCatalogue, civilianAliases);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** What the builder writes for one of its migrations, generated afresh. */
function generated(what: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'military-sql-'));
  try {
    const out = path.join(dir, 'out.sql');
    execFileSync(process.execPath, [BUILDER, what, out], { stdio: 'pipe' });
    return readFileSync(out, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the four services and the three code systems', () => {
  assert.deepEqual(SERVICES.map((service) => service.key), ['navy', 'army', 'air-force', 'marine-corps']);
  assert.deepEqual(SERVICES.map((service) => service.name), ['U.S. Navy', 'U.S. Army', 'U.S. Air Force', 'U.S. Marine Corps']);
  assert.deepEqual(CODE_SYSTEMS.map((system) => system.key), ['navy-rating', 'army-mos', 'afsc']);
  // Each system is one service's, and no service has two.
  for (const system of CODE_SYSTEMS) assert.ok(isServiceKey(system.service), system.key);
  assert.equal(new Set(CODE_SYSTEMS.map((system) => system.service)).size, CODE_SYSTEMS.length);
  assert.ok(isServiceKey('air-force') && !isServiceKey('coast-guard') && !isServiceKey(null));
  assert.ok(isCodeSystem('afsc') && !isCodeSystem('marine-mos') && !isCodeSystem(undefined));
});

test('the words above the name come from the code system', () => {
  assert.equal(careerKind('navy-rating'), 'Navy rating');
  assert.equal(careerKind('army-mos'), 'Army MOS');
  assert.equal(careerKind('afsc'), 'Air Force specialty');
  // A civilian career has none, and nothing else passes for a system.
  assert.equal(careerKind(null), null);
  assert.equal(careerKind('navy'), null);
  assert.equal(serviceOfCodeSystem('afsc'), 'air-force');
  assert.equal(codeSystemOf('army'), 'army-mos');
  // The Marine Corps is an employer with no careers yet.
  assert.equal(codeSystemOf('marine-corps'), null);
});

test('a service by its short name and as an employer', () => {
  assert.equal(serviceShortName('navy'), 'Navy');
  assert.equal(serviceShortName('air-force'), 'Air Force');
  assert.equal(serviceShortName('marine-corps'), 'Marine Corps');
  assert.equal(serviceShortName('boeing'), null);
  assert.equal(serviceName('army'), 'U.S. Army');
  assert.equal(serviceName(undefined), null);
});

test('tags are derived from the service: military, and the service', () => {
  assert.deepEqual(careerTags('navy'), [{ key: 'military', word: 'Military' }, { key: 'navy', word: 'Navy' }]);
  assert.deepEqual(careerTags('air-force').map((tag) => tag.key), [MILITARY_TAG, 'air-force']);
  assert.deepEqual(careerTags(null), []);
  assert.deepEqual(careerTags('acme'), []);
});

test('a military career\'s title keeps the service in front', () => {
  assert.equal(militaryTitle('navy', 'Electronics Technician'), 'Navy Electronics Technician');
  assert.equal(militaryTitle('air-force', 'Fuels'), 'Air Force Fuels');
});

test('the database holds a service and a code system to the same lists', () => {
  const sql = readFileSync(COLUMNS, 'utf8');
  const listed = (constraint: string) => {
    const at = sql.indexOf(`ADD CONSTRAINT ${constraint}`);
    assert.ok(at >= 0, constraint);
    const check = sql.slice(at, sql.indexOf(';', at));
    return [...check.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
  };
  assert.deepEqual(listed('companies_service_check'), SERVICES.map((service) => service.key));
  assert.deepEqual(listed('occupations_code_system_check'), CODE_SYSTEMS.map((system) => system.key));
  // A career with a service has a code and a code system; one without has none of the four.
  assert.match(sql, /ADD CONSTRAINT occupations_service_code_check CHECK \(\s*\(service_company_id IS NULL AND code IS NULL AND code_system IS NULL AND official_title IS NULL\)\s*OR \(service_company_id IS NOT NULL AND code IS NOT NULL AND btrim\(code\) <> '' AND code_system IS NOT NULL\)/);
  // One company per service, one career per code of a system.
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS companies_service_key ON companies \(service\) WHERE service IS NOT NULL;/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS occupations_code_key ON occupations \(code_system, code\) WHERE code IS NOT NULL;/);
  // Additive and safe to repeat: columns are added if missing, nothing is dropped, updated or deleted.
  assert.ok(!/\b(DROP|DELETE|UPDATE|TRUNCATE)\b/.test(sql.replace(/ON DELETE RESTRICT/g, '').replace(/^--.*$/gm, '')));
  for (const column of ['companies ADD COLUMN IF NOT EXISTS service', 'occupations ADD COLUMN IF NOT EXISTS service_company_id', 'occupations ADD COLUMN IF NOT EXISTS code ', 'occupations ADD COLUMN IF NOT EXISTS code_system', 'occupations ADD COLUMN IF NOT EXISTS official_title']) {
    assert.ok(sql.includes(`ALTER TABLE ${column}`), column);
  }
});

test('the columns come after the skills and before anything that fills them', () => {
  const list = MIGRATIONS as string[];
  assert.ok(list.indexOf('0061_career_service.sql') > list.indexOf('0060_skill_taxonomy_3.sql'));
  for (const later of list.slice(list.indexOf('0061_career_service.sql') + 1)) assert.ok(later > '0061', `${later} follows 0061`);
});

test('the four services are employers: one company each, named as the code names them', () => {
  assert.deepEqual(employerProblems({ companies: employers }), []);
  assert.deepEqual(SERVICE_KEYS, SERVICES.map((service) => service.key));
  assert.deepEqual(employers.map((company) => company.service), SERVICES.map((service) => service.key));
  for (const company of employers) assert.equal(company.name, serviceName(company.service), company.service);
  // Tags are derived and careers are counted: the file carries neither.
  for (const company of employers) assert.deepEqual(Object.keys(company).sort(), ['description', 'descriptionWas', 'domain', 'headquarters', 'name', 'service', 'slug', 'sources']);
  // Each description says where it was read, in the data and never on screen.
  for (const company of employers) assert.ok((company.sources ?? []).some((line) => /^https:\/\/www\.[a-z]+\.(com|mil)\//.test(line)), `${company.name} names the page its description was read from`);
});

test('the employers\' migration is what the file generates, and adds no plant', () => {
  const sql = readFileSync(EMPLOYERS_MIGRATION, 'utf8');
  assert.equal(generated('employers'), sql, 'run `node scripts/build-military-sql.mjs employers` after editing data/careers/military/employers.json');
  // A service is found by the key it already carries, else by its exact name in any letter case; never by a name like it.
  assert.ok(sql.includes('WHERE c.service = e.service'));
  assert.ok(sql.includes('WHERE lower(c.name) = lower(e.name)'));
  assert.ok(!/ILIKE|similarity|%/.test(sql.replace(/format\('[^']*(?:''[^']*)*'/g, '')), 'no loose match on the name');
  assert.ok(!/INSERT INTO factories|UPDATE factories|DELETE FROM/.test(sql), 'it adds, moves and deletes no plant, and deletes nothing');
  // What it decided is in the log, and the lines to read are marked.
  for (const action of ['created', 'found', 'kept', 'not set', 'summary']) assert.ok(sql.includes(`pg_temp.mil_log('${action}'`), action);
  const list = MIGRATIONS as string[];
  assert.equal(list.indexOf('0062_military_employers.sql'), list.indexOf('0061_career_service.sql') + 1);
  assert.ok(list.indexOf(path.basename(EMPLOYERS_MIGRATION)) > list.indexOf('0069_company_marks.sql'), 'the latest employers\' migration is in the list, after 0069');
});

test('a description is replaced only where it is still the file\'s earlier one', () => {
  const sql = readFileSync(EMPLOYERS_MIGRATION, 'utf8');
  // Filled where empty, replaced where it is word for word what the file said before; one a person wrote stays.
  assert.ok(sql.includes("CASE WHEN c.description IS NULL OR btrim(c.description) = '' THEN 'description' END"));
  assert.ok(sql.includes('coalesce(btrim(c.description) = ANY (e.description_was), false)'));
  assert.ok(sql.includes("description = CASE WHEN 'description' = ANY (v_filled) OR v_newer THEN e.description ELSE c.description END"));
  // The earlier descriptions are the ones the first migration wrote, so production's are the ones replaced.
  const first = readFileSync(FIRST_EMPLOYERS_MIGRATION, 'utf8');
  for (const company of employers) {
    assert.ok((company.descriptionWas ?? []).length > 0, `${company.name} says what it replaces`);
    for (const was of company.descriptionWas ?? []) assert.ok(first.includes(`'${was.replace(/'/g, "''")}'`), `${company.name}: "${was}" is what 0062 wrote`);
  }
});

test('the check refuses an employers file that is not whole', () => {
  const copy = () => JSON.parse(JSON.stringify(employers)) as Employer[];
  const refused = (change: (list: Employer[]) => void, saying: RegExp) => {
    const list = copy();
    change(list);
    assert.match(employerProblems({ companies: list }).join('\n'), saying);
  };
  refused((list) => { list[0].service = 'coast-guard'; }, /a service is one of navy, army, air-force, marine-corps/);
  refused((list) => { list[1].service = 'navy'; }, /the service "navy" is listed twice/);
  refused((list) => { list[1].name = 'u.s. navy'; }, /is listed twice/);
  refused((list) => { list[0].domain = 'https://www.navy.mil'; }, /is not a bare domain/);
  refused((list) => { list[0].slug = 'US Navy'; }, /not lowercase words joined by hyphens/);
  refused((list) => { list[0].headquarters.state = 'Virginia'; }, /headquarters are a city, a two-letter state and a two-letter country/);
  refused((list) => { (list[0] as Employer & { tags?: string[] }).tags = ['military']; }, /unknown key "tags"/);
  refused((list) => { list[0].descriptionWas = [list[0].description]; }, /"descriptionWas" names the description itself/);
  refused((list) => { list[0].descriptionWas = ['One.', 'One.']; }, /names a description twice/);
  refused((list) => { list[0].sources = ['one\ntwo']; }, /"sources" is a list of lines/);
});

test('a service shows its own mark, placed by hand, and says where it came from', () => {
  // The owner chose to show each service's own logo; it is placed by hand, never fetched by a run.
  const list = read<Record<string, string | null>>('client/src/lib/logos.json');
  const decisions = read<{ none: Record<string, string>; kept: Record<string, { ext: string; from: string }> }>('data/companies/logo-decisions.json');
  for (const company of employers) {
    const kept = decisions.kept[company.domain];
    assert.ok(kept, `${company.domain} is a mark placed by hand`);
    assert.equal(decisions.none[company.domain], undefined, `${company.domain} is not left on the lettermark`);
    assert.equal(list[company.domain], kept.ext, `${company.domain} is listed with its mark`);
    assert.ok(existsSync(`client/public/logos/${company.domain}.${kept.ext}`), `${company.domain}'s mark is stored`);
    assert.match(kept.from, /owner chose/, `${company.domain} says the owner chose to show it`);
    assert.match(kept.from, /https?:|www\.|Commons/, `${company.domain} says where the file came from`);
  }
});

test('the builder names the code systems as the code does', () => {
  assert.deepEqual(
    BUILDER_CODE_SYSTEMS.map((system) => ({ key: system.key, service: system.service, short: system.short })),
    CODE_SYSTEMS.map((system) => ({ key: system.key, service: system.service, short: serviceShortName(system.service) }))
  );
  assert.equal(PATH_FLOOR, 5);
});

test('the military files pass the builder\'s check', () => {
  const run = spawnSync(process.execPath, [BUILDER, '--check'], { encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /valid\. 4 services; 118 careers \(39 U\.S\. Navy, 44 U\.S\. Army, 35 U\.S\. Air Force, 0 U\.S\. Marine Corps\)/);
  assert.deepEqual(careerProblems(careersFile, taxonomy, { companies: employers }, civilian), []);
  assert.deepEqual(militaryPathProblems(pathsFile, careersFile, skillsCatalogue, taxonomy), []);
});

test('a military career is a title with the service in front, a code of its service\'s system and a home', () => {
  const codes = new Set<string>();
  for (const career of careers) {
    assert.ok(isServiceKey(career.service), career.title);
    assert.equal(career.title, militaryTitle(career.service, career.officialTitle), career.title);
    assert.equal(career.codeSystem, codeSystemOf(career.service), `${career.title}: the code system is its service's`);
    assert.ok(careerKind(career.codeSystem), `${career.title} has words to stand above its name`);
    assert.ok(!codes.has(`${career.codeSystem} ${career.code}`), `${career.code} is used once in ${career.codeSystem}`);
    codes.add(`${career.codeSystem} ${career.code}`);
    // Derived or computed, never written: tags, the words above the name, the employer's name, the careers it reaches, a ladder.
    assert.deepEqual(Object.keys(career).filter((key) => ['tags', 'kind', 'employer', 'reaches', 'leadsTo'].includes(key)), [], career.title);
  }
  // The two the Defense Manpower Data Center's file marks obsolete are not careers, and the file says why.
  assert.deepEqual(careersFile.dropped.map((gone) => gone.code).sort(), ['2A7X5', '91G']);
  for (const gone of careersFile.dropped) assert.ok(!codes.has(`${gone.codeSystem} ${gone.code}`) && gone.why.length > 20, gone.code);
});

test('the civilian catalogue is untouched, and no name is shared with it', () => {
  assert.equal(civilianCatalogue.careers.length, 156);
  assert.equal(civilianPaths.careers.length, 156);
  const military = new Set(careers.flatMap((career) => [career.title, ...career.was]).map((name) => name.toLowerCase()));
  for (const name of military) assert.ok(!civilian.has(name), `${name} is a civilian name`);
  for (const career of civilianCatalogue.careers) assert.ok(!military.has(career.title.toLowerCase()), career.title);
  for (const entry of civilianPaths.careers) assert.ok(!military.has(entry.title.toLowerCase()), `${entry.title} has a civilian path`);
  // The civilian Electronics Technician and the Navy's are two careers.
  assert.ok(civilian.has('electronics technician'));
  assert.ok(careers.some((career) => career.title === 'Navy Electronics Technician' && career.code === 'ET'));
});

test('every military career has a path of five or more catalogue skills, one of them from its home', () => {
  const known = new Set(skillsCatalogue.skills.map((skill) => skill.name));
  const domainOf = new Map(taxonomy.domains.flatMap((domain) => domain.groups.flatMap((group) => group.skills.map((skill) => [skill.name, domain.slug] as const))));
  const byTitle = new Map(paths.map((entry) => [entry.title, entry]));
  assert.equal(byTitle.size, careers.length);
  for (const career of careers) {
    const entry = byTitle.get(career.title);
    assert.ok(entry, `${career.title} has a path`);
    assert.ok(entry.skills.length >= PATH_FLOOR, `${career.title} has ${entry.skills.length} skills`);
    assert.equal(new Set(entry.skills).size, entry.skills.length, `${career.title} lists no skill twice`);
    for (const skill of entry.skills) assert.ok(known.has(skill), `${career.title}: ${skill} is a catalogue skill`);
    assert.ok(entry.skills.some((skill) => domainOf.get(skill) === career.home), `${career.title} has a skill from ${career.home}`);
    assert.ok(entry.basis.trim().endsWith('.'), `${career.title} says where its path was read from`);
  }
  // The skills added for these careers (0059) are each on one of their paths, under the names step 1 left them.
  const used = new Set(paths.flatMap((entry) => entry.skills));
  const groups = ['aircraft-systems', 'engines-and-power-plants', 'vehicles-and-heavy-equipment', 'power-generation-and-distribution', 'plant-utilities', 'fielded-electronic-systems', 'weapons-and-munitions', 'survival-equipment', 'shipfitting', 'nuclear-plant-operations', 'fuels'];
  const added = taxonomy.domains.flatMap((domain) => domain.groups).filter((group) => groups.includes(group.slug)).flatMap((group) => group.skills.map((skill) => skill.name));
  assert.equal(added.length, 66);
  for (const skill of added) assert.ok(used.has(skill), `${skill} is on a military path`);
  for (const gone of ['Bulk Fuel Handling', 'Naval Mine Assembly', 'Wheeled Vehicle Maintenance', 'Powertrain and Drivetrain Repair', 'Munitions Inspection']) assert.ok(!used.has(gone), `${gone} is not a skill`);
  assert.ok(byTitle.get('Navy Mineman')?.skills.includes('Munitions Assembly'));
  assert.ok(byTitle.get('Air Force Fuels')?.skills.includes('Bulk Chemical Transfer'));
});

test('the civilian careers a military career reaches are computed from the two paths', () => {
  const reach = reaches(pathsFile, civilianPaths);
  // The owner's own test of the rule: the Hull Maintenance Technician, read against the Navy's standard.
  const ht = reach.get('Navy Hull Maintenance Technician') ?? [];
  assert.deepEqual(ht.map((r) => `${r.career} ${r.held}/${r.of}`), ['MIG Welder 10/14', 'Metal Fabricator 13/19', 'Welder 12/19']);
  for (const [title, list] of reach) {
    assert.ok(list.length <= 3, title);
    for (const r of list) assert.ok(r.held >= 1 && r.held <= r.of, `${title} reaches ${r.career}`);
    // Most covered first.
    for (let i = 1; i < list.length; i += 1) assert.ok(list[i - 1].held / list[i - 1].of >= list[i].held / list[i].of, title);
  }
  // Fuel is handled as any bulk liquid is: the fuels careers reach the chemical operator by that skill too.
  assert.equal(reach.get('Air Force Fuels')?.find((r) => r.career === 'Chemical Operator')?.held, 4);
});

test('the careers\' and the paths\' migrations are what the files generate', () => {
  const careersSql = readFileSync(CAREERS_MIGRATION, 'utf8');
  const pathsSql = readFileSync(PATHS_MIGRATION, 'utf8');
  assert.equal(generated('careers'), careersSql, 'run `node scripts/build-military-sql.mjs careers` after editing data/careers/military/careers.json');
  assert.equal(generated('paths'), pathsSql, 'run `node scripts/build-military-sql.mjs paths` after editing data/careers/military/paths.json');
  // A career is found by its code, else by its exact title; a civilian career is never taken over.
  assert.ok(careersSql.includes('WHERE o.code_system = c.code_system AND lower(o.code) = lower(c.code)'));
  assert.ok(careersSql.includes('WHERE lower(o.title) = lower(c.title)'));
  assert.ok(careersSql.includes("pg_temp.mil_log('title taken', true"));
  // It writes no path, no ladder, no industry, no company's version, and deletes nothing.
  for (const table of ['occupation_skills', 'occupation_links', 'industry_occupations', 'company_careers', 'company_career_skills', 'user_goals', 'jobs']) {
    assert.ok(!new RegExp(`(INSERT INTO|UPDATE|DELETE FROM) ${table}\\b`).test(careersSql), `the careers' migration does not write ${table}`);
  }
  assert.ok(!/DELETE FROM/.test(careersSql));
  // Every path is written as a draft, and one a person approved is left exactly as it is.
  assert.ok(pathsSql.includes("UPDATE occupations SET path_status = 'draft' WHERE id = v_id AND path_status IS DISTINCT FROM 'draft';"));
  assert.ok(pathsSql.includes("IF v_status = 'approved' THEN"));
  assert.ok(!pathsSql.includes("'approved' WHERE"), 'no path is approved by a load');
  assert.ok(pathsSql.includes("VALUES ('military-paths', 'career'"));
  // Only military careers are said to be "not in the file": the civilian ones are not this file's.
  assert.ok(pathsSql.includes('WHERE NOT EXISTS (SELECT 1 FROM path_careers k WHERE k.title = o.title) AND o.service_company_id IS NOT NULL'));
  for (const table of ['occupation_links', 'industry_occupations', 'company_careers']) assert.ok(!pathsSql.includes(table), `the paths' migration does not touch ${table}`);
  const list = MIGRATIONS as string[];
  const from = list.indexOf('0059_skills_catalogue_4.sql');
  assert.deepEqual(list.slice(from, from + 6), ['0059_skills_catalogue_4.sql', '0060_skill_taxonomy_3.sql', '0061_career_service.sql', '0062_military_employers.sql', '0063_military_careers.sql', '0064_military_paths.sql']);
});

test('the check refuses military files that are not whole', () => {
  const refusedCareer = (change: (list: MilitaryCareer[]) => void, saying: RegExp) => {
    const file = copy(careersFile);
    change(file.careers);
    assert.match(careerProblems(file, taxonomy, { companies: employers }, civilian).join('\n'), saying);
  };
  refusedCareer((list) => { list[0].title = 'Electronics Technician'; }, /is a name of the civilian catalogue/);
  refusedCareer((list) => { list[0].was.push('CNC Machinist'); }, /is a name of the civilian catalogue/);
  refusedCareer((list) => { list[1].title = list[0].title.toUpperCase(); }, /is used twice/);
  refusedCareer((list) => { list[1].code = list[0].code; }, /is used twice in navy-rating/);
  refusedCareer((list) => { list[0].codeSystem = 'army-mos'; }, /is not the service "navy"'s/);
  refusedCareer((list) => { list[0].service = 'marine-corps'; }, /is not the service "marine-corps"'s/);
  refusedCareer((list) => { list[0].service = 'coast-guard'; }, /is not an employer of employers\.json/);
  refusedCareer((list) => { list[0].home = 'aviation'; }, /is not a domain of the taxonomy/);
  refusedCareer((list) => { list[0].officialTitle = 'Machinist'; }, /a title is the service in front of the service's own title/);
  refusedCareer((list) => { (list[0] as MilitaryCareer & { tags?: string[] }).tags = ['military']; }, /unknown key "tags"/);
  refusedCareer((list) => { (list[0] as MilitaryCareer & { leadsTo?: string[] }).leadsTo = ['Welder']; }, /unknown key "leadsTo"/);
  const refusedPath = (change: (list: MilitaryPath[]) => void, saying: RegExp) => {
    const file = copy(pathsFile);
    change(file.careers);
    assert.match(militaryPathProblems(file, careersFile, skillsCatalogue, taxonomy).join('\n'), saying);
  };
  refusedPath((list) => { list[0].skills = list[0].skills.slice(0, 4); }, /a military career is listed when at least 5 apply/);
  refusedPath((list) => { list[0].skills.push('Wheeled Vehicle Maintenance'); }, /is not a skill in the catalogue/);
  refusedPath((list) => { list[0].skills.push(list[0].skills[0]); }, /twice/);
  refusedPath((list) => { list.pop(); }, /has no path/);
  refusedPath((list) => { list[0].title = 'CNC Machinist'; }, /is not a career of careers\.json/);
  refusedPath((list) => { (list[0] as MilitaryPath & { status?: string }).status = 'approved'; }, /unknown key "status"/);
});

test('the posting reader knows the civilian careers only', () => {
  const root = path.resolve('.');
  const vocab = loadVocabulary(root) as { careers: Map<string, unknown> };
  assert.equal(vocab.careers.size, 156);
  const military = new Set(careers.map((career) => career.title));
  for (const title of vocab.careers.keys()) assert.ok(!military.has(title), `${title} is in the reader's vocabulary`);
  const career = (title: string): string | null =>
    (readPosting({ employer: 'Acme Aerospace', title, location: 'Austin, TX', text: 'Requirements:\n- Read schematics' }, vocab) as { career: { title: string } | null }).career?.title ?? null;
  // A posting titled "Electronics Technician" is the civilian career, with or without a service's name in front.
  assert.equal(career('Electronics Technician'), 'Electronics Technician');
  assert.equal(career('Navy Electronics Technician'), 'Electronics Technician');
  // No title, a service's own or ours, is read as a military career.
  for (const item of careers) {
    for (const title of [item.title, item.officialTitle]) assert.ok(!military.has(career(title) ?? ''), `${title} was read as a military career`);
  }
});
