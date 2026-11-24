// Unit checks for what the employer loader settles before any SQL runs
// (scripts/build-employers-sql.mjs), and for how curated names are shown.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCompanyName, formatFactoryName } from '../../shared/displayName.js';
// @ts-expect-error a plain script, no types
import { applyCorrections, buildSql, cleanDomain, crossCheck, metres, normaliseFile, protectedNames, SUBSECTORS } from '../../scripts/build-employers-sql.mjs';

const STATES = { TX: 'texas', KY: 'kentucky', PR: 'puerto rico' };
const plant = (over: Record<string, unknown> = {}) => ({
  name: 'Austin Plant',
  city: 'Austin',
  state: 'TX',
  latitude: 30.37324,
  longitude: -97.63608,
  subsector: 'Machinery Manufacturing',
  status: 'operating',
  ...over,
});
const company = (over: Record<string, unknown> = {}) => ({ name: 'Acme', alsoKnownAs: [], plants: [plant()], ...over });

test('a research file is brought to the shape the loader takes', () => {
  const { file, problems } = normaliseFile(
    {
      brief: 'texas-test',
      companies: [
        company({
          name: '  Acme ',
          alsoKnownAs: ['Acme Corp', 'acme', 'Acme Corp', ''],
          parent: 'Acme',
          domain: 'https://www.Acme.com/about',
          stateEmployees: { state: 'tx', count: '4,500', year: 2024, source: 'https://example.com/a' },
          plants: [
            plant({ employees: 1200, employeesYear: 2024, employeesSource: 'https://example.com/p', naics: 333111, zip: '78754', opened: 1997 }),
            plant({ name: 'No Source', employees: 50, employeesYear: 2024 }),
            plant({ name: 'Closed Plant', status: 'closed' }),
            plant({ name: 'Elsewhere', latitude: 51.5, longitude: -0.1 }),
            plant({ name: 'Island', state: 'PR', latitude: 18.2, longitude: -66.5 }),
            plant({ name: 'Odd Industry', subsector: 'Widgets' }),
            plant({ name: 'austin plant' }),
            plant({ name: 'Ready Mix', naics: '327320', subsector: 'Nonmetallic Mineral Product Manufacturing' }),
            plant({ name: 'Hot Mix', naics: '324121', subsector: 'Petroleum and Coal Products Manufacturing' }),
            plant({ name: 'Refinery', naics: '324110', subsector: 'Petroleum and Coal Products Manufacturing', rank: 3 }),
          ],
        }),
        { alsoKnownAs: ['Nameless'] },
      ],
    },
    STATES
  );
  const [acme] = file.companies;
  assert.equal(file.companies.length, 1, 'a company with no name is left out');
  assert.equal(acme.name, 'Acme');
  assert.deepEqual(acme.alsoKnownAs, ['Acme Corp'], 'other names are said once, and never the name itself');
  assert.equal(acme.parent, undefined, 'a company is not its own parent');
  assert.equal(acme.domain, 'acme.com');
  assert.deepEqual(acme.people, [{ state: 'TX', count: 4500, year: 2024, source: 'https://example.com/a' }]);
  assert.deepEqual(acme.plants.map((p: { name: string }) => p.name), ['Austin Plant', 'No Source', 'Refinery']);
  assert.equal(acme.plants[2].rank, undefined, 'a field the loader has no place for is left behind');
  assert.equal(acme.plants[0].naics, '333111');
  assert.equal(acme.plants[0].employees, 1200);
  assert.equal(acme.plants[1].employees, undefined, 'a headcount with no source is not loaded');
  assert.deepEqual(acme.notLoaded, ['Closed Plant (closed)', 'Island (Puerto Rico)', 'Ready Mix (construction materials, NAICS 327320)', 'Hot Mix (construction materials, NAICS 324121)']);
  assert.equal(problems.length, 8, problems.join('\n'));
});

test('a company the file only names is still a company', () => {
  const { file, problems } = normaliseFile(
    { companies: [{ name: 'Plain', alsoKnownAs: null, parent: null, domain: null, industry: null, description: null, headquarters: null, stateEmployees: null, sources: null, plants: [plant({ sources: null })] }] },
    STATES
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(file.companies[0]).sort(), ['name', 'plants']);
});

test('the only plant of a company in a city is marked, so the loader may look further for it', () => {
  const { file } = normaliseFile({ companies: [company({ plants: [plant(), plant({ name: 'Waco One', city: 'Waco' }), plant({ name: 'Waco Two', city: 'Waco', status: 'closed' })] })] }, STATES);
  assert.deepEqual(file.companies[0].plants.map((p: { name: string; alone?: boolean }) => [p.name, p.alone ?? false]), [['Austin Plant', true], ['Waco One', false]]);
});

test('a parent is loaded before the companies that are part of it', () => {
  const { file } = normaliseFile({ companies: [company({ name: 'Kid', parent: 'Mother' }), company({ name: 'Other' }), company({ name: 'Mother', parent: 'Grandmother' }), company({ name: 'Grandmother' })] }, STATES);
  assert.deepEqual(file.companies.map((c: { name: string }) => c.name), ['Grandmother', 'Mother', 'Kid', 'Other']);
});

test('a name that is a company of its own is protected and called out', () => {
  const files = [
    normaliseFile({ brief: 'a', companies: [company({ name: 'Kid Motors Texas', alsoKnownAs: ['Kid Motors'], parent: 'Kid Motors' })] }, STATES).file,
    normaliseFile({ brief: 'b', companies: [company({ name: 'Kid Motors', plants: [plant({ name: 'Other Name', latitude: 30.3733 })] })] }, STATES).file,
  ];
  assert.deepEqual(protectedNames(files), ['kid motors', 'kid motors texas']);
  const notes = crossCheck(files);
  assert.equal(notes.filter((note: string) => note.includes('"Kid Motors" is listed as another name')).length, 1);
  assert.equal(notes.filter((note: string) => /^\d+ m apart: a: Kid Motors Texas \/ Austin Plant.*differ in company, name/.test(note)).length, 1);
});

test('corrections are laid over a file without changing it', () => {
  const raw = { companies: [company({ alsoKnownAs: ['Acme Corp', 'Bell'], plants: [plant(), plant({ name: 'Gone' })] })] };
  const { raw: fixed, used } = applyCorrections(raw, {
    companies: { acme: { addAlsoKnownAs: ['Acme Works'], dropAlsoKnownAs: ['bell'], dropPlants: ['gone'], plants: { 'austin plant': { sameAs: 'ACME AUSTIN' } }, setAside: [{ name: 'Acme', withPlant: 'X', renameTo: 'Acme Boxes' }] } },
  });
  assert.deepEqual([...used], ['acme']);
  assert.deepEqual(fixed.companies[0].alsoKnownAs, ['Acme Corp', 'Acme Works']);
  assert.deepEqual(fixed.companies[0].plants.map((p: { name: string; sameAs?: string }) => [p.name, p.sameAs]), [['Austin Plant', 'ACME AUSTIN']]);
  assert.equal(raw.companies[0].plants.length, 2, 'the file as delivered is untouched');
  const { file } = normaliseFile(fixed, STATES);
  assert.deepEqual(file.companies[0].setAside, [{ name: 'Acme', withPlant: 'X', renameTo: 'Acme Boxes' }]);
  assert.equal(file.companies[0].plants[0].sameAs, 'ACME AUSTIN');
});

test('the SQL is a load, or a rehearsal that says so', () => {
  const { file } = normaliseFile({ brief: 'texas-test', companies: [company()] }, STATES);
  const load = buildSql({ files: [file], states: STATES, loaderSql: '-- functions', sources: ['data/employers/texas-test.json'] });
  assert.match(load, /^-- Employers and plants from data\/employers\/texas-test\.json/);
  assert.match(load, /SELECT pg_temp\.el_load\(\$el_data\$\{.*\}\$el_data\$::jsonb\);\nDROP TRIGGER el_merge_guard ON companies;\n$/s);
  // A company merged away that carries what the loader's merge does not move stops the load (a version of a career).
  assert.match(load, /CREATE TRIGGER el_merge_guard BEFORE DELETE ON companies FOR EACH ROW EXECUTE FUNCTION pg_temp\.el_merge_guard\(\);/);
  assert.ok(!load.includes('BEGIN;'), 'the migration runner opens the transaction');
  const rehearsal = buildSql({ files: [file], states: STATES, loaderSql: '-- functions', rehearse: true, schemaSql: 'SELECT 1;' });
  assert.match(rehearsal, /A REHEARSAL/);
  assert.match(rehearsal, /SELECT \* FROM pg_temp\.el_rehearse\(.*\$el_schema\$SELECT 1;\$el_schema\$, false\) AS report;\n$/s);
  assert.throws(() => buildSql({ files: [{ ...file, brief: '$el_data$' }], states: STATES, loaderSql: '' }), /cannot be quoted/);
});

test('small things the loader counts on', () => {
  assert.equal(SUBSECTORS.length, 21);
  assert.equal(cleanDomain('HTTPS://www.TI.com/about?x=1'), 'ti.com');
  assert.equal(cleanDomain('not a domain'), null);
  assert.equal(metres(30, -97, 30.001, -97), 111);
});

test('a curated name is shown as it was written', () => {
  for (const name of ['INEOS', 'CITGO', 'NOV', 'SLB', 'AAON', 'Bell', 'Samsung Austin Semiconductor', 'Toyota Motor Manufacturing Texas', 'W&W|AFCO Steel']) {
    assert.equal(formatCompanyName(name), name);
  }
  for (const name of ['La Porte Complex', 'Boeing St. Louis', 'RFAB', 'NOV FM 529', 'Fort Worth Air Force Plant 4', 'Giga Texas']) {
    assert.equal(formatFactoryName(name), name);
  }
  assert.equal(formatFactoryName('LA PORTE PLANT'), 'La Porte Plant');
});
