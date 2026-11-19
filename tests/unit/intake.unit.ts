// Unit checks for the parts of intake that decide without a database
// (scripts/ingest/): hashing a record, a run against the last, the refusal of
// a database that is not on this machine, reading a large CSV, and the first
// adapter's reading of the EPA's file. The rule for which value wins lives in
// the database (intake_fact_wins, migration 0043) so the runner and Admin
// Tools share it; tests/api/intake.sh checks it there.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
// @ts-expect-error a plain script, no types
import { canonical, recordHash } from '../../scripts/ingest/lib/hash.mjs';
// @ts-expect-error a plain script, no types
import { diffRun } from '../../scripts/ingest/lib/diff.mjs';
// @ts-expect-error a plain script, no types
import { checkDatabase, databaseTarget } from '../../scripts/ingest/lib/safety.mjs';
// @ts-expect-error a plain script, no types
import { csvRows, parseCsvRow } from '../../scripts/ingest/lib/csv.mjs';
// @ts-expect-error a plain script, no types
import { copyLine } from '../../scripts/ingest/lib/copy.mjs';
// @ts-expect-error a plain script, no types
import { checkSource } from '../../scripts/ingest/lib/pipeline.mjs';
// @ts-expect-error a plain script, no types
import { fetchDir, parseArgs } from '../../scripts/ingest/run.mjs';
// @ts-expect-error a plain script, no types
import * as epa from '../../scripts/ingest/sources/epa-echo.mjs';
// @ts-expect-error a plain script, no types
import { MIGRATIONS } from '../../scripts/migrate.mjs';

// --- Hashing -------------------------------------------------------------------

test('a record reads the same whatever order its keys came in', () => {
  assert.equal(canonical({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }), canonical({ a: { c: null, d: [2, { y: 2, z: 1 }] }, b: 1 }));
  assert.equal(canonical({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(recordHash({ FAC_NAME: 'ACME', REGISTRY_ID: '1' }), recordHash({ REGISTRY_ID: '1', FAC_NAME: 'ACME' }));
});

test('a changed value, and a changed adapter, change the hash', () => {
  const hash = recordHash({ REGISTRY_ID: '1', FAC_ZIP: '78754' });
  assert.match(hash, /^[0-9a-f]{32}$/);
  assert.notEqual(hash, recordHash({ REGISTRY_ID: '1', FAC_ZIP: '78753' }));
  assert.notEqual(hash, recordHash({ REGISTRY_ID: '1', FAC_ZIP: '78754' }, 2));
  // A list is ordered: the same codes in another order are another record.
  assert.notEqual(recordHash({ codes: ['a', 'b'] }), recordHash({ codes: ['b', 'a'] }));
});

// --- A run against the last ----------------------------------------------------

test('a run is told apart from the last: new, changed, the same, back, gone', () => {
  const previous = new Map([
    ['same', { hash: 'h1', gone: false }],
    ['changed', { hash: 'h1', gone: false }],
    ['gone', { hash: 'h1', gone: false }],
    ['was-gone', { hash: 'h1', gone: true }],
    ['back', { hash: 'h1', gone: true }],
    ['back-changed', { hash: 'h1', gone: true }],
  ]);
  const incoming = new Map([
    ['new', 'h9'],
    ['same', 'h1'],
    ['changed', 'h2'],
    ['back', 'h1'],
    ['back-changed', 'h2'],
  ]);
  assert.deepEqual(diffRun(previous, incoming), {
    fresh: ['new'],
    changed: ['back-changed', 'changed'],
    same: ['same'],
    back: ['back'],
    // A record already marked gone is not gone again.
    gone: ['gone'],
  });
});

test('a first run is all new, and the same run again changes nothing', () => {
  const incoming = new Map([['b', 'h'], ['a', 'h']]);
  assert.deepEqual(diffRun(new Map(), incoming), { fresh: ['a', 'b'], changed: [], same: [], back: [], gone: [] });
  const staged = new Map([['a', { hash: 'h', gone: false }], ['b', { hash: 'h', gone: false }]]);
  assert.deepEqual(diffRun(staged, incoming), { fresh: [], changed: [], same: ['a', 'b'], back: [], gone: [] });
  assert.deepEqual(diffRun(staged, new Map()).gone, ['a', 'b']);
});

// --- The database a command may touch --------------------------------------------

test('a database on this machine is allowed', () => {
  for (const url of ['postgresql://postgres:postgres@127.0.0.1:5432/archangel', 'postgres://u:p@localhost/db', 'postgresql://u:p@[::1]:5432/db']) {
    assert.equal(checkDatabase(url, undefined).local, true, url);
  }
  assert.deepEqual(databaseTarget('postgresql://u:p@localhost:5432/archangel_ci'), { host: 'localhost', database: 'archangel_ci', local: true });
});

test('a database that is not on this machine is refused unless its host is named', () => {
  const remote = 'postgresql://user:secret@ep-example-123.us-east-2.aws.neon.tech/neondb?sslmode=require';
  assert.throws(() => checkDatabase(remote, undefined), /Refusing: the database is on "ep-example-123\.us-east-2\.aws\.neon\.tech"/);
  assert.throws(() => checkDatabase(remote, ''), /Refusing/);
  assert.throws(() => checkDatabase(remote, 'localhost'), /names "localhost", but DATABASE_URL points at "ep-example-123/);
  assert.throws(() => checkDatabase(remote, 'neon.tech'), /Refusing/);
  // The refusal never repeats the password.
  assert.throws(() => checkDatabase(remote, undefined), (error: Error) => !error.message.includes('secret'));
  const target = checkDatabase(remote, 'EP-Example-123.us-east-2.aws.neon.tech');
  assert.deepEqual([target.host, target.database, target.local], ['ep-example-123.us-east-2.aws.neon.tech', 'neondb', false]);
  // A host that only looks local is not.
  assert.throws(() => checkDatabase('postgresql://u:p@localhost.example.com/db', undefined), /Refusing/);
  assert.throws(() => checkDatabase('postgresql://u:p@127.0.0.1.example.com/db', undefined), /Refusing/);
});

test('what is not a Postgres address is refused', () => {
  assert.throws(() => checkDatabase(undefined, undefined), /DATABASE_URL is not set/);
  assert.throws(() => checkDatabase('not a url', undefined), /not a connection string/);
  assert.throws(() => checkDatabase('https://localhost/db', undefined), /not a Postgres connection string/);
});

// --- The command line --------------------------------------------------------------

test('the command line: commands, values and switches', () => {
  assert.deepEqual(parseArgs(['apply', '12', '--all', '--yes-this-database', 'db.example.com']), {
    command: 'apply',
    args: ['12'],
    options: { all: true, 'yes-this-database': 'db.example.com' },
  });
  assert.equal(parseArgs([]).command, 'help');
  assert.throws(() => parseArgs(['list', '--yes-this-database']), /--yes-this-database needs a value/);
  assert.throws(() => parseArgs(['list', '--report', '--all']), /--report needs a value/);
});

test('a download never lands in the repository', () => {
  assert.throws(() => fetchDir('epa-echo', 'data/epa'), /Refusing to download into the repository/);
  assert.throws(() => fetchDir('epa-echo', '.'), /Refusing to download into the repository/);
  assert.equal(fetchDir('epa-echo', undefined), path.join(tmpdir(), 'archangel-ingest', 'epa-echo'));
  assert.equal(fetchDir('epa-echo', '/var/tmp/epa'), '/var/tmp/epa');
});

// --- Reading a CSV ---------------------------------------------------------------

test('a CSV row: quotes, commas, doubled quotes, empty fields', () => {
  assert.deepEqual(parseCsvRow('a,"b, c","say ""hi""",,e'), ['a', 'b, c', 'say "hi"', '', 'e']);
  assert.deepEqual(parseCsvRow('"only"'), ['only']);
  assert.deepEqual(parseCsvRow('a,b,\r'), ['a', 'b', '']);
  assert.deepEqual(parseCsvRow(''), ['']);
});

async function rowsOf(chunks: (string | Uint8Array)[]): Promise<string[][]> {
  const rows: string[][] = [];
  for await (const row of csvRows(chunks)) rows.push(row);
  return rows;
}

test('a CSV stream: rows survive wherever the chunks break', async () => {
  const text = 'ID,NAME,STREET\r\n1,"ACME, INC","1 MAIN ST\nSUITE 2"\r\n\r\n2,"SAY ""HI""",\n3,É plant,x';
  const want = [
    ['ID', 'NAME', 'STREET'],
    ['1', 'ACME, INC', '1 MAIN ST\nSUITE 2'],
    ['2', 'SAY "HI"', ''],
    ['3', 'É plant', 'x'],
  ];
  assert.deepEqual(await rowsOf([text]), want);
  // Broken at every position, as text and as bytes (a two-byte letter is split too).
  const bytes = new TextEncoder().encode(text);
  for (let at = 1; at < bytes.length; at += 1) {
    assert.deepEqual(await rowsOf([bytes.slice(0, at), bytes.slice(at)]), want, `bytes broken at ${at}`);
  }
  assert.deepEqual(await rowsOf(text.split('').map((letter) => letter)), want);
  assert.deepEqual(await rowsOf([]), []);
});

test('a row for COPY: tabs, line breaks and backslashes are escaped, null is \\N', () => {
  assert.equal(copyLine([7, 'a\tb', null, { note: 'line\nbreak "q" \\' }]), '7\ta\\tb\t\\N\t{"note":"line\\\\nbreak \\\\"q\\\\" \\\\\\\\"}\n');
});

// --- A source's description of itself ------------------------------------------------

test("an adapter's source is checked before anything is written", () => {
  assert.equal(checkSource(epa.source), epa.source);
  assert.throws(() => checkSource({ ...epa.source, slug: 'EPA Echo' }), /slug is lower-case/);
  assert.throws(() => checkSource({ ...epa.source, refSource: 'CURATED' }), /"CURATED" is taken/);
  assert.throws(() => checkSource({ ...epa.source, terms: ' ' }), /terms is missing/);
  assert.throws(() => checkSource({ ...epa.source, rank: 100 }), /rank is a whole number from 1 to 99/);
  assert.throws(() => checkSource({ ...epa.source, unmatched: 'delete' }), /unmatched is "hold" or "add"/);
});

test('the EPA source fills gaps on plants we hold and adds nothing', () => {
  assert.deepEqual(
    [epa.source.slug, epa.source.refSource, epa.source.scope, epa.source.unmatched, epa.source.fill],
    ['epa-echo', 'EPA_ECHO', 'known', 'hold', 'empty']
  );
});

// --- The EPA adapter's reading -------------------------------------------------------

test('the industry code a plant is filed under', () => {
  assert.deepEqual(epa.codes('332710 332999,811310; abc 12345678'), ['332710', '332999', '811310']);
  // The industry most codes name wins; a tie goes to the lower number.
  assert.equal(epa.chooseNaics(['311411', '325611', '325612']).naics, '325611');
  assert.equal(epa.chooseNaics(['332710', '336390']).naics, '332710');
  // A six-digit code before a shorter one of the same industry.
  assert.equal(epa.chooseNaics(['32311', '323110', '323111']).naics, '323110');
  assert.equal(epa.chooseNaics(['3231', '32311']).naics, '32311');
  // Codes outside manufacturing do not vote.
  assert.equal(epa.chooseNaics(['339999', '447190', '811121']).naics, '339999');
});

test('no industry is offered for what is not a covered manufacturing code, and it says why', () => {
  assert.deepEqual(epa.chooseNaics([]), { naics: null, note: 'the registry lists no industry code' });
  assert.match(epa.chooseNaics(['562111', '811310']).note, /only codes outside manufacturing: 562111 811310/);
  // Ready-mix concrete and asphalt paving mixtures are construction materials: not loaded again.
  assert.match(epa.chooseNaics(['324121', '327320']).note, /construction materials \(324121 327320\)/);
  // A cement plant is covered; so is a plant that also mixes concrete.
  assert.equal(epa.chooseNaics(['327310']).naics, '327310');
  assert.equal(epa.chooseNaics(['327320', '327310']).naics, '327310');
});

test('a ZIP code as it is stored', () => {
  assert.equal(epa.zip('78754'), '78754');
  assert.equal(epa.zip('787541234'), '78754-1234');
  assert.equal(epa.zip('78754-1234'), '78754-1234');
  assert.equal(epa.zip(' 78754 '), '78754');
  assert.equal(epa.zip('7875'), null);
  assert.equal(epa.zip('UNKNOWN'), null);
  assert.equal(epa.zip(''), null);
});

const ROW = {
  REGISTRY_ID: '110002939367',
  FAC_NAME: 'AGILENT  TECHNOLOGIES',
  FAC_STREET: '1101 CREEKSIDE RIDGE DR',
  FAC_CITY: 'ROSEVILLE',
  FAC_STATE: 'CA',
  FAC_ZIP: '956781234',
  FAC_FIPS_CODE: '06061',
  FAC_LAT: '38.7702',
  FAC_LONG: '-121.2618512',
  FAC_ACTIVE_FLAG: 'Y',
  FAC_NAICS_CODES: '334516 541380',
};

test('a row of the file as a staged record', async () => {
  const record = await epa.read(ROW, { asOf: '2026-11-15' });
  assert.equal(record.id, '110002939367');
  // What the source said is kept as it said it.
  assert.equal(record.payload, ROW);
  assert.deepEqual(record.facts, {
    name: 'AGILENT TECHNOLOGIES',
    address: '1101 CREEKSIDE RIDGE DR',
    city: 'ROSEVILLE',
    state: 'CA',
    zip: '95678-1234',
    latitude: '38.7702',
    longitude: '-121.261851',
    naics: '334516',
    industry: 'Computer and Electronic Product Manufacturing',
    naicsAll: ['334516', '541380'],
    countyFips: '06061',
    active: true,
    url: 'https://echo.epa.gov/detailed-facility-report?fid=110002939367',
    asOf: '2026-11-15',
  });
});

test('a row with half a place has no place, and one with no usable code says why', async () => {
  const { facts } = await epa.read({ REGISTRY_ID: '110000000001', FAC_NAME: 'X', FAC_LAT: '38.1', FAC_LONG: '0', FAC_NAICS_CODES: '562111' }, {});
  assert.equal(facts.latitude, undefined);
  assert.equal(facts.longitude, undefined);
  assert.equal(facts.naics, undefined);
  assert.equal(facts.industryNote, 'the registry lists only codes outside manufacturing: 562111');
  // The registry marks an active facility Y and leaves the rest blank.
  assert.equal(facts.active, false);
});

test('the id of a row, and what a row we do not stage counts as', () => {
  assert.equal(epa.idOf(ROW), '110002939367');
  assert.equal(epa.idOf({ FAC_NAME: 'NO ID' }), null);
  assert.equal(epa.idOf({ REGISTRY_ID: 'N/A' }), null);
  assert.deepEqual(epa.classify(ROW), ['manufacturing', 'manufacturing, active', 'manufacturing, listable']);
  assert.deepEqual(epa.classify({ ...ROW, FAC_ACTIVE_FLAG: 'N' }), ['manufacturing']);
  // Puerto Rico and construction materials are manufacturing in the file's count, and not listable.
  assert.deepEqual(epa.classify({ ...ROW, FAC_STATE: 'PR' }), ['manufacturing', 'manufacturing, active']);
  assert.deepEqual(epa.classify({ ...ROW, FAC_NAICS_CODES: '327320' }), ['manufacturing', 'manufacturing, active']);
  assert.deepEqual(epa.classify({ ...ROW, FAC_NAICS_CODES: '541380' }), []);
});

test('the file is read through the adapter: only the columns it keeps, empty ones left out', async () => {
  const dir = path.join(tmpdir(), `archangel-intake-unit-${process.pid}`);
  const { mkdir, rm, writeFile } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'echo.csv');
  await writeFile(file, 'REGISTRY_ID,FAC_NAME,FAC_STREET,FAC_STATE,FAC_LAT,FAC_LONG,DFR_URL,FAC_NAICS_CODES\n110000000001,"ACME, INC",,TX,30.1,-97.1,http://x,332710\n');
  try {
    const rows = [];
    for await (const row of epa.rows(file)) rows.push(row);
    assert.deepEqual(rows, [{ REGISTRY_ID: '110000000001', FAC_NAME: 'ACME, INC', FAC_STATE: 'TX', FAC_LAT: '30.1', FAC_LONG: '-97.1', FAC_NAICS_CODES: '332710' }]);
    await writeFile(file, 'ID,NAME\n1,ACME\n');
    await assert.rejects(async () => {
      for await (const row of epa.rows(file)) void row;
    }, /not the ECHO Exporter this adapter reads: it has no REGISTRY_ID/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Where it sits in the repository ---------------------------------------------------

test('the intake migration is in the runner, in order, and loads no rows of data', () => {
  assert.ok(MIGRATIONS.indexOf('0043_intake.sql') > MIGRATIONS.indexOf('0042_skill_taxonomy.sql'));
  const sql = readFileSync('migrations/0043_intake.sql', 'utf8');
  // What the migration does when it is applied: its statements, without the bodies of the functions it installs
  // (undoing a run removes the plants that run added, which is a function's business, not the migration's).
  const applied = sql.replace(/\$f\$[\s\S]*?\$f\$/g, '$f$ $f$');
  assert.equal(applied.match(/CREATE OR REPLACE FUNCTION/g)?.length, 5);
  // Additive: nothing is dropped or deleted, and no plant or company is touched.
  assert.doesNotMatch(applied, /\bDROP\b/i);
  assert.doesNotMatch(applied, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(applied, /\bTRUNCATE\b/i);
  assert.doesNotMatch(applied, /\bUPDATE\s+(factories|companies)\b/i);
  assert.doesNotMatch(applied, /\bINSERT\s+INTO\s+(factories|companies)\b/i);
  // Every table, index and column it adds can be added twice.
  for (const statement of sql.match(/^CREATE (UNIQUE )?(TABLE|INDEX)[^\n]*/gm) ?? []) assert.match(statement, /IF NOT EXISTS/, statement);
  for (const statement of sql.match(/ADD COLUMN[^\n]*/g) ?? []) assert.match(statement, /ADD COLUMN IF NOT EXISTS/, statement);
});

test('the workflow that runs intake on production starts by hand only and holds no credential', () => {
  const workflow = readFileSync('.github/workflows/ingest.yml', 'utf8');
  const triggers = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\njobs:'));
  assert.match(triggers, /workflow_dispatch:/);
  assert.doesNotMatch(triggers, /^\s*(push|pull_request|pull_request_target|schedule|workflow_run|release):/m);
  // The database is named by a repository secret, never written here.
  assert.match(workflow, /\$\{\{ secrets\.INGEST_DATABASE_URL \}\}/);
  assert.doesNotMatch(workflow, /postgres(ql)?:\/\/[^\s$]/);
});
