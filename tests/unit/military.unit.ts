// Military careers: what shared/military.ts derives, and that the database's
// checks (migration 0061) name the same services and code systems.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { MIGRATIONS } from '../../scripts/migrate.mjs';
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
