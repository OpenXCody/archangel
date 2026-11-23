// Military careers: what shared/military.ts derives, and that the database's
// checks (migration 0061) name the same services and code systems.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MIGRATIONS } from '../../scripts/migrate.mjs';
import { SERVICE_KEYS, employerProblems } from '../../scripts/build-military-sql.mjs';
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
const EMPLOYERS_MIGRATION = 'migrations/0062_military_employers.sql';

interface Employer {
  name: string;
  service: string;
  slug: string;
  domain: string;
  description: string;
  headquarters: { city: string; state: string; country: string };
}
const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const employers = read<{ companies: Employer[] }>(EMPLOYERS).companies;

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
  for (const company of employers) assert.deepEqual(Object.keys(company).sort(), ['description', 'domain', 'headquarters', 'name', 'service', 'slug']);
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
});

test('a service keeps the lettermark: its emblem is not fetched', () => {
  const list = read<Record<string, string | null>>('client/src/lib/logos.json');
  const decisions = read<{ none: Record<string, string> }>('data/companies/logo-decisions.json');
  for (const company of employers) {
    assert.equal(list[company.domain], null, `${company.domain} is listed, with no mark`);
    assert.ok(decisions.none[company.domain]?.includes('military service'), `${company.domain} says why`);
  }
});
