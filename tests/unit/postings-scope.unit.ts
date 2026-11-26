// Where new jobs are ported from, and whose turn Workday's budget is
// (scripts/ingest/postings/: registry.mjs, jobs.mjs; migration 0091).
//
// The registry names the states new jobs are ported from: its own for every
// line, a line's own where it says otherwise. The rule looks forward only: a
// job already ported from a place elsewhere is tended as before, and what
// stops is the new. What needs no database is held here: the registry's
// check, what a board is turned into under the rule (what is kept, what is
// set aside, which texts are never asked for), a board that is not read, the
// order the budget is spent in, replayed over the two days one long listing
// took all of it, and the migration held to the functions it restates. The
// jobs themselves are decided in the database: tests/api/postings.sh checks
// them there.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
// @ts-expect-error a plain script, no types
import { checkRegistry, loadRegistry, statesOf } from '../../scripts/ingest/postings/registry.mjs';
// @ts-expect-error a plain script, no types
import { createFetcher, rewriteTo } from '../../scripts/ingest/postings/fetch.mjs';
// @ts-expect-error a plain script, no types
import { boardStanding, collect, inTurn, portedFrom, report, runEmployer, wasTurn } from '../../scripts/ingest/postings/jobs.mjs';
// @ts-expect-error a plain script, no types
import { SYSTEMS } from '../../scripts/ingest/postings/systems/index.mjs';
// @ts-expect-error a plain script, no types
import * as reader from '../../scripts/ingest/postings/read/index.mjs';
// @ts-expect-error a plain script, no types
import { MIGRATIONS } from '../../scripts/migrate.mjs';
// @ts-expect-error a plain script, no types
import { feedServer } from '../api/postings/feeds.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'postings');

interface Line { slug: string; employer: string; company: string; system: string; board: string; states?: string[]; note?: string; also?: string[] }
interface Asked { method: string; host: string; path: string; body: string }
interface Session { requests: number; get: (url: string, opts?: Record<string, unknown>) => Promise<unknown>; post: (url: string, body: unknown) => Promise<unknown> }
interface Place { city: string; state: string }
interface Kept { same?: boolean; hash: string; payload: unknown; facts: { reading: { places: Place[] } } }

// --- The registry -------------------------------------------------------------------

const line = (over: Record<string, unknown> = {}) => ({ slug: 'acme', employer: 'Acme', company: 'Acme Works', system: 'greenhouse', board: 'acme', ...over });

test('the registry says where new jobs are ported from: its own states, and a line\'s own', () => {
  const file = (states: unknown, employers: unknown[] = [line()]) => ({ ...(states === undefined ? {} : { states }), employers, leftOut: [] });
  assert.deepEqual(checkRegistry(file(['TX'])), []);
  assert.deepEqual(checkRegistry(file(['TX'], [line({ states: ['OK', 'TX'] })])), []);
  assert.deepEqual(checkRegistry(file(undefined, [line({ states: ['DC'] })])), [], 'a line may say its own in a file that says none');
  const problems = (states: unknown, employers?: unknown[]) => checkRegistry(file(states, employers)).join('\n');
  // Two-letter codes of the 50 states and the District of Columbia, each once.
  assert.match(problems(['Texas']), /the file: states: "Texas" is not one of the 50 states or DC by its two letters/);
  assert.match(problems(['tx']), /"tx" is not one of the 50 states/);
  assert.match(problems(['PR']), /"PR" is not one of the 50 states/, 'Puerto Rico is not covered');
  assert.match(problems(['TX', 'TX']), /states names a state twice/);
  assert.match(problems([]), /states is a list of the states new jobs are ported from/);
  assert.match(problems('TX'), /states is a list of the states/);
  assert.match(problems(['TX'], [line({ states: ['Nevada'] })]), /employers\[0\] \(acme\): states: "Nevada" is not one of the 50 states/);
  assert.match(problems(['TX'], [line({ states: [] })]), /employers\[0\] \(acme\): states is a list/);

  // A line's own states stand in place of the file's; where neither says, new jobs are ported from everywhere.
  assert.deepEqual(statesOf({ states: ['TX'] }, line()), ['TX']);
  assert.deepEqual(statesOf({ states: ['TX'] }, line({ states: ['OK', 'LA'] })), ['LA', 'OK'], 'the line\'s own, not the file\'s with them');
  assert.equal(statesOf({}, line()), null);
  assert.deepEqual(statesOf({}, line({ states: ['NV'] })), ['NV']);
});

test('the rule as it is said and asked: the states, a place inside them and one outside', () => {
  assert.equal(portedFrom(null), null);
  assert.equal(portedFrom([]), null, 'no states is everywhere');
  const texas = portedFrom(['TX']);
  assert.deepEqual(texas.states, ['TX']);
  assert.equal(texas.said, 'TX');
  assert.equal(texas.inside([{ city: 'Fort Worth', state: 'TX' }]), true);
  assert.equal(texas.inside([{ city: 'Tucson', state: 'AZ' }]), false);
  assert.equal(texas.inside([{ city: 'Tucson', state: 'AZ' }, { city: 'Fort Worth', state: 'TX' }]), true, 'a posting with a place inside is inside');
  assert.equal(texas.inside([]), false);
  assert.equal(portedFrom(['tx', 'OK', 'TX']).said, 'OK and TX');
  assert.equal(portedFrom(['TX', 'OK', 'LA']).said, 'LA, OK and TX');
});

test('the committed registry ports new jobs from Texas, and its lines are in the order of priority, food and drink last', () => {
  const committed = loadRegistry();
  assert.deepEqual(committed.states, ['TX']);
  const lines: Line[] = committed.employers;
  for (const entry of lines) assert.deepEqual(statesOf(committed, entry), ['TX'], `${entry.slug} says no states of its own yet`);
  const slugs = lines.map((entry) => entry.slug);
  // Food and drink are read last: no line follows them. Tyson Foods stays left out.
  assert.deepEqual(slugs.slice(-3), ['cargill', 'heb', 'hormel']);
  assert.ok(committed.leftOut.some((entry: { employer: string }) => entry.employer === 'Tyson Foods'));
  // The largest employers in Texas that make machines, vehicles, aircraft, chips and equipment come first.
  assert.deepEqual(slugs.slice(0, 10), ['daikin', 'rtx', 'texas-instruments', 'spacex', 'gm', 'samsung-austin', 'applied-materials', 'toyota', 'boeing', 'flex']);
  const at = (slug: string) => slugs.indexOf(slug);
  for (const slug of ['alcon', 'dow', 'exxonmobil']) assert.ok(at('coherent') < at(slug), `${slug} is of the other industries: after the last of the priority ones`);
  for (const slug of ['anduril', 'rivian', 'deere']) assert.ok(at('poly-america') < at(slug) && at(slug) < at('cargill'), `${slug} has no factory in Texas: after those that have`);
  assert.match(committed.note, /The lines are in the order they are read, which is the order of priority/);

  // The employers moved in on Nov 26, 2026: left out before only for want of a machine that may ask Workday, each with
  // its board's address as the adapter takes it and a note that says it has not been verified.
  const added = lines.filter((entry) => /^Added unverified on Nov 26, 2026/.test(entry.note ?? ''));
  assert.deepEqual(added.map((entry) => entry.slug).sort(), [
    'aaon', 'abbott', 'airbus', 'alcon', 'baker-hughes', 'canadian-solar', 'daikin', 'delfingen', 'dow', 'firefly', 'ge-vernova', 'hexcel', 'moog', 'nxp',
    'plug-power', 'samsung-austin', 'shield-ai', 'stryker', 'toyota', 'trane', 'xylem',
  ]);
  for (const entry of added) {
    if (entry.system !== 'workday') continue;
    // The tenant under /wday/cxs is the first word of the host, as on every board read so far.
    const [, tenant, inPath] = /^https:\/\/([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com\/wday\/cxs\/([^/]+)\/[^/]+$/.exec(entry.board) ?? [];
    assert.ok(tenant && tenant === inPath, `${entry.slug}: ${entry.board}`);
    assert.ok(!committed.leftOut.some((out: { employer: string }) => out.employer === entry.employer), `${entry.employer} is no longer left out`);
  }
  assert.deepEqual(lines.find((entry) => entry.slug === 'toyota')?.also, ['Toyota Motor Manufacturing Texas']);
  // An employer whose site refused is not added, whatever its size in Texas.
  for (const name of ['Lockheed Martin', 'Tesla', 'L3Harris', 'SLB', 'Schneider Electric']) {
    assert.equal(committed.leftOut.find((entry: { employer: string }) => entry.employer === name)?.why, 'refused', name);
    assert.ok(!lines.some((entry) => entry.employer === name));
  }
});

// --- A board under the rule ------------------------------------------------------------

let saved: { requests: Asked[]; listen: () => Promise<string>; close: () => Promise<void> };
let savedBase = '';
before(async () => {
  saved = feedServer(FIXTURES);
  savedBase = await saved.listen();
});
after(async () => {
  await saved.close();
});

const WORKDAY = { slug: 'scope', employer: 'Scope Works', company: 'Scope Works', system: 'workday', board: 'https://scope.wd1.myworkdayjobs.com/wday/cxs/scope/Careers' };
const ASHBY = { slug: 'scope-ashby', employer: 'Scope Works', company: 'Scope Works', system: 'ashby', board: 'scope' };

/** One run over a saved board: what staging and the jobs hold, the states, and which texts it asked for (by posting id). */
async function run(entry: Record<string, unknown>, { states = null as string[] | null, records = [] as unknown[], passes = [] as unknown[], held = [] as string[] } = {}) {
  const queries: string[] = [];
  const db = Object.assign(async (strings: TemplateStringsArray) => {
    const sql = strings.join('');
    queries.push(sql);
    if (sql.includes('FROM intake_records')) return records;
    if (sql.includes('FROM posting_passes')) return passes;
    if (sql.includes('FROM jobs')) return held.map((id) => ({ source_id: id }));
    return [];
  }, { json: (value: unknown) => value });
  const from = saved.requests.length;
  const session: Session = createFetcher({ rewrite: rewriteTo(savedBase), pace: 0 }).session(String(entry.slug), { pace: 0 });
  const collected = await collect(db, entry, { session, reader, vocab: reader.loadVocabulary(ROOT), today: '2026-11-26', states });
  const texts = saved.requests.slice(from).filter((request) => request.path.includes('/job/')).map((request) => request.path.split('_').pop());
  return { collected, texts, kept: collected.kept as Map<string, Kept>, queries };
}
const placesOf = (record: Kept | undefined) => record?.facts.reading.places.map((place) => `${place.city}, ${place.state}`);
const asRecords = (kept: Map<string, Kept>) => [...kept].map(([id, record]) => ({ source_id: id, hash: record.hash, payload: record.payload, facts: record.facts }));

test('where the text costs a request: a posting outside the states is set aside before its text is asked for, unless a job of ours stands behind it', async () => {
  // The board: S1 in Texas; S2 in Arizona; S3 at two places its record names, Arizona and Texas; S4 in Kansas, where a job
  // of ours already is; S5 at two places, neither in Texas; S6 not one of our careers; S7 at a site that says no state.
  const first = await run(WORKDAY, { states: ['TX'], held: ['S4'] });
  assert.deepEqual(first.collected.counts, { read: 7, abroad: 0, notCareer: 1, noPlace: 1, noAddress: 0, vanished: 0, texts: 4, spared: 0, kept: 3, outside: 2 });
  assert.deepEqual(first.texts, ['S1', 'S3', 'S4', 'S5'], 'no text for S2: its listing says Arizona, and each text is a request');
  assert.deepEqual([...first.kept.keys()], ['S1', 'S3', 'S4']);
  assert.deepEqual(placesOf(first.kept.get('S1')), ['Fort Worth, TX']);
  // A posting inside and outside is kept with every place it names: which of them becomes a new job is the database's to say.
  assert.deepEqual(placesOf(first.kept.get('S3')), ['Tucson, AZ', 'Fort Worth, TX']);
  // The job that already exists outside the states is still tended: its posting is read and staged as before.
  assert.deepEqual(placesOf(first.kept.get('S4')), ['Wichita, KS']);
  // S5 named its places only in its record: the text was asked for once, and that it was read is noted, so it is not asked again.
  assert.deepEqual([...first.collected.passes.keys()], ['S5']);
  // What is outside the states is not among the lines no place was read in: only the site that says no state is.
  assert.deepEqual(first.collected.unplaced, [['Evendale', 1]]);
  assert.deepEqual(first.collected.states, ['TX']);

  // The next day, nothing changed: no text at all, and what is outside is set aside again.
  const passed = [...first.collected.passes].map(([id, listing]) => ({ source_id: id, listing, read_on: '2026-11-26' }));
  const second = await run(WORKDAY, { states: ['TX'], held: ['S4'], records: asRecords(first.kept), passes: passed });
  assert.deepEqual(second.texts, []);
  assert.equal(second.collected.counts.outside, 1, 'S2; S5 is spared, as any posting read before and not kept');
  assert.equal(second.collected.counts.spared, 1);
  assert.deepEqual(second.kept.get('S4'), { same: true, hash: first.kept.get('S4')?.hash });

  // The job in Kansas is gone from our side (never made, or its factory removed): the posting is no longer read.
  const third = await run(WORKDAY, { states: ['TX'], records: asRecords(first.kept), passes: passed });
  assert.deepEqual(third.texts, []);
  assert.deepEqual([...third.kept.keys()], ['S1', 'S3']);
  assert.equal(third.collected.counts.outside, 2, 'S2 and S4');

  // A line that says its own states is ported from those.
  const own = await run(WORKDAY, { states: ['AZ', 'KS'] });
  assert.deepEqual([...own.kept.keys()], ['S2', 'S3', 'S4', 'S5']);
  assert.equal(own.collected.counts.outside, 1, 'S1, in Texas');
  assert.deepEqual(own.texts, ['S2', 'S3', 'S4', 'S5']);
});

test('a registry that names no states ports from everywhere: the board is read exactly as before, and no job is looked up', async () => {
  const { collected, texts, queries } = await run(WORKDAY);
  assert.deepEqual(collected.counts, { read: 7, abroad: 0, notCareer: 1, noPlace: 1, noAddress: 0, vanished: 0, texts: 5, spared: 0, kept: 5 });
  assert.ok(!('outside' in collected.counts));
  assert.deepEqual(texts, ['S1', 'S2', 'S3', 'S4', 'S5']);
  assert.equal(collected.states, null);
  assert.ok(!queries.some((sql) => sql.includes('FROM jobs')));
});

test('where the text comes with the listing: a posting wholly outside the states is not kept, one with a place inside is kept whole', async () => {
  // The board: a1 in Texas and Arizona; a2 in Arizona; a3 in Kansas, where a job of ours already is; a4 remote.
  const { collected, kept } = await run(ASHBY, { states: ['TX'], held: ['a3'] });
  assert.deepEqual(collected.counts, { read: 4, abroad: 0, notCareer: 0, noPlace: 1, noAddress: 0, vanished: 0, texts: 0, spared: 0, kept: 2, outside: 1 });
  assert.deepEqual([...kept.keys()], ['a1', 'a3']);
  assert.deepEqual(placesOf(kept.get('a1')), ['Fort Worth, TX', 'Tucson, AZ']);
  assert.deepEqual(collected.unplaced, [['Remote', 1]], 'Arizona is a place we read: it is set aside, not listed for a person to write out');
  // With the job in Kansas gone, a3 is not kept either; with no states, all three places are.
  assert.deepEqual([...(await run(ASHBY, { states: ['TX'] })).kept.keys()], ['a1']);
  assert.deepEqual([...(await run(ASHBY)).kept.keys()], ['a1', 'a2', 'a3']);
});

test('the run\'s report says what was set aside, and where new jobs are ported from', async () => {
  const db = Object.assign(async (strings: TemplateStringsArray) => {
    if (!strings.join('').includes('JOIN intake_sources')) return [];
    return [{
      id: 9, source: 'postings-scope', state: 'applied', input: `${WORKDAY.board}/jobs`, note: null, source_name: 'Scope Works job postings', system: 'workday', company: 'Scope Works',
      counts: { read: 7, notCareer: 1, abroad: 0, noPlace: 1, kept: 3, outside: 2, states: ['TX'], placed: 2, waiting: 1, waitingPlaces: 1, placesOutside: 1 }, timings: {},
    }];
  }, { json: (value: unknown) => value });
  const text = await report(db, 9);
  assert.match(text, /read: 7 postings listed; 1 not one of our careers, 0 outside the United States, 1 naming no place, 2 at places outside TX with no job of ours; kept 3/);
  assert.match(text, /new jobs are ported from TX: 1 places of kept postings are elsewhere and have no job of ours; they make no new job and do not wait/);
});

// --- A board that is not read ------------------------------------------------------------

/** runEmployer over a database that answers as told: whether the company is listed, and how it stands in the states. */
async function employerRun(standing: { factories: number; open: number }, states: string[] | null) {
  const sent: { sql: string; values: unknown[] }[] = [];
  let note: unknown = null;
  const db = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join(' ? ');
    sent.push({ sql, values });
    if (sql.includes('AS listed')) return [{ listed: true }];
    if (sql.includes('WITH RECURSIVE family')) return [standing];
    if (sql.includes('INSERT INTO intake_runs')) return [{ id: 7 }];
    if (sql.includes('information_schema.columns')) return [{ ready: true }];
    if (sql.includes("SET state = 'failed'")) note = values[0];
    if (sql.includes('JOIN intake_sources s ON s.slug = r.source')) {
      return [{ id: 7, source: 'postings-acme', state: 'failed', input: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs', note, source_name: 'Acme job postings', system: 'greenhouse', company: 'Acme Works', counts: { outcome: 'not read', requests: 0 }, timings: {} }];
    }
    return [];
  }, { json: (value: unknown) => value });
  // A fetcher that says so if anything is asked of the employer's site.
  let asked = 0;
  const ask = async () => { asked += 1; throw new Error('the site was asked'); };
  const fetcher = { budgets: {}, session: () => ({ requests: 0, get: ask, post: ask }) };
  const result = await runEmployer(db, line(), { fetcher, reader, vocab: {}, today: '2026-11-26', states, log: () => {} }).catch((error: Error) => ({ error }));
  return { result, sent, asked, note };
}

test('a board whose company has no factory in the states and no open job is not read: nothing is asked of its site, and its run says so', async () => {
  const { result, sent, asked, note } = await employerRun({ factories: 0, open: 0 }, ['TX']);
  assert.equal(asked, 0);
  assert.equal(result.outcome, 'not read');
  assert.equal(result.runId, 7, 'a run is recorded: its row is where a person reads why');
  assert.equal(note, 'new jobs are ported from TX: we list no factory of Acme Works there and no job from this board is open, so the board is not read for now');
  assert.match(result.text, /not read: new jobs are ported from TX: we list no factory of Acme Works there/);
  // Its line in the log is not one to read every day, and what waits is resolved against the rule all the same.
  const logged = sent.find(({ sql }) => sql.includes('INSERT INTO load_log'));
  assert.deepEqual(logged?.values.slice(0, 3), ['postings-acme', 'not read', false]);
  assert.ok(sent.some(({ sql }) => sql.includes('posting_resolve')));
  // Where its new jobs are ported from is written to its row.
  assert.deepEqual(sent.find(({ sql }) => sql.includes('UPDATE intake_sources SET states'))?.values[0], ['TX']);
});

test('a board is read while its company has a factory in the states, or a job from it is still open anywhere', async () => {
  // Each of these goes on to ask the site (which the stand-in refuses to do: that it was asked is the point).
  for (const standing of [{ factories: 2, open: 0 }, { factories: 0, open: 3 }, { factories: 1, open: 5 }]) {
    const { asked } = await employerRun(standing, ['TX']);
    assert.ok(asked > 0, JSON.stringify(standing));
  }
  // With no states named, a board is read whatever its company has where.
  assert.ok((await employerRun({ factories: 0, open: 0 }, null)).asked > 0);
});

test('how a company stands in the states is asked of the database in one statement: its factories there, and the open jobs from this board', async () => {
  const sent: { sql: string; values: unknown[] }[] = [];
  const db = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    sent.push({ sql: strings.join(' ? '), values });
    return [{ factories: '3', open: '0' }];
  };
  assert.deepEqual(await boardStanding(db, line({ also: ['Acme Parts'] }), ['TX']), { factories: 3, open: 0 });
  assert.deepEqual(sent[0].values, [['acme works', 'acme parts'], ['acme works', 'acme parts'], ['TX'], 'postings-acme']);
  // The companies recorded as parts of the one named count, as they do when a posting is placed (posting_companies).
  assert.match(sent[0].sql, /JOIN companies c ON c\.parent_company_id = f\.id WHERE f\.depth < 3/);
  // An open job is one whose status says so, wherever it is and whether or not its expiry has passed.
  assert.match(sent[0].sql, /FROM jobs j WHERE j\.source =\s+\?\s+AND j\.status = 'open'\)/);
});

// --- Whose turn the budget is ----------------------------------------------------------------

test('a turn is a run that read the listing to its end, or had at least half of the run\'s budget', () => {
  assert.equal(wasTurn({ read: 400, complete: true, requests: 21 }, 300), true);
  assert.equal(wasTurn({ read: 1200, complete: false, requests: 300 }, 300), true, 'cut by the budget after the whole of it');
  assert.equal(wasTurn({ read: 600, complete: false, requests: 150 }, 300), true);
  assert.equal(wasTurn({ read: 80, complete: false, requests: 40 }, 300), false, 'the tail of another board\'s turn');
  assert.equal(wasTurn({ read: 80, complete: false, requests: 6, budget: 6 }, 300), true, 'the budget the run itself had is what counts');
  assert.equal(wasTurn({ read: 80, complete: false, requests: 40, budget: 300 }, 6), false);
  assert.equal(wasTurn({ complete: false, requests: 300 }, 300), false, 'a run that listed nothing was no turn');
  assert.equal(wasTurn(null, 300), false);
});

interface Run { source: string; at: number; read: number; complete: boolean; requests: number; budget: number }
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BUDGET = 300;
const board = (slug: string, system = 'workday') => ({ slug, employer: slug, company: slug, system, board: slug });

/**
 * The platform as the runner meets it, reduced to what the order depends on: each board needs so many requests to list
 * to its end, a run has a budget, and a board the budget cuts takes its listing up at its next run (less the three
 * requests that go on the robots file and the two pages it goes back). Runs are written as intake_runs rows are, and
 * `order` decides who goes first; a board the budget does not reach has no run.
 */
function platform(needs: Record<string, number>) {
  const runs: Run[] = [];
  const left: Record<string, number> = { ...needs };
  const db = async (strings: TemplateStringsArray, slug: string) => {
    const source = slug.replace(/^postings-/, '');
    if (!strings.join('').includes('FROM intake_runs')) return [];
    return runs.filter((run) => run.source === source).sort((a, b) => b.at - a.at).map((run) => ({ started_at: new Date(run.at), read: run.read, complete: run.complete, requests: run.requests, budget: run.budget }));
  };
  const lines = Object.keys(needs).map((slug) => board(slug));
  /** One run of the runner at `at`: returns the boards that were read, in order. */
  const run = async (at: number, order: (at: number) => Promise<{ slug: string }[]>) => {
    let budget = BUDGET;
    const served: string[] = [];
    for (const [n, { slug }] of (await order(at)).entries()) {
      if (budget <= 0) break;
      const requests = Math.min(left[slug], budget);
      const complete = requests === left[slug];
      budget -= requests;
      left[slug] = complete ? needs[slug] : left[slug] - Math.max(0, requests - 3);
      runs.push({ source: slug, at: at + n * 1000, read: requests * 20, complete, requests, budget: BUDGET });
      served.push(slug);
    }
    return served;
  };
  return { runs, lines, db, run, now: () => inTurn(db, lines) as Promise<{ slug: string }[]> };
}
/** The order before this change: a cut listing first, then a board a week past its last whole listing, then one never listed whole, then the oldest. */
function oldOrder(runs: Run[], lines: { slug: string }[]) {
  return async (now: number) => lines.map((entry, at) => {
    const mine = runs.filter((run) => run.source === entry.slug).sort((a, b) => b.at - a.at);
    const whole = mine.find((run) => run.complete)?.at ?? 0;
    return { entry, at, cut: mine[0] && !mine[0].complete ? 1 : 0, due: whole > 0 && now - whole >= 7 * DAY ? 1 : 0, whole };
  }).sort((a, b) => b.cut - a.cut || b.due - a.due || a.whole - b.whole || a.at - b.at).map((row) => row.entry);
}

// Production as the two days began, on Nov 24, 2026: twelve Workday boards. Ten had a whole listing on Nov 23 or 24;
// Northrop Grumman and RTX had never been read, and Northrop's listing is far longer than a run's budget.
const NEEDS = { flex: 20, caterpillar: 55, globalfoundries: 15, gm: 50, 'ge-aerospace': 60, boeing: 40, intel: 45, 'applied-materials': 30, 'blue-origin': 50, micron: 30, northrop: 6000, rtx: 400 };
const NOV = (day: number, hour: number) => Date.UTC(2026, 10, day, hour, 23);
function production() {
  const world = platform(NEEDS);
  const whole = (slug: string, at: number) => world.runs.push({ source: slug, at, read: NEEDS[slug as keyof typeof NEEDS] * 20, complete: true, requests: NEEDS[slug as keyof typeof NEEDS], budget: BUDGET });
  ['flex', 'caterpillar', 'globalfoundries', 'gm'].forEach((slug, n) => whole(slug, NOV(23, 9) + n * 1000));
  ['ge-aerospace', 'boeing', 'intel', 'applied-materials', 'blue-origin', 'micron'].forEach((slug, n) => whole(slug, NOV(24, 9) + n * 1000));
  return world;
}
const RUNS_OF_TWO_DAYS = [NOV(24, 15), NOV(24, 21), NOV(25, 3), NOV(25, 9), NOV(25, 15), NOV(25, 21), NOV(26, 3), NOV(26, 9)];

test('the two days replayed as they went: the cut listing went first at every run, and no other board was read', async () => {
  const world = production();
  for (const at of RUNS_OF_TWO_DAYS) assert.deepEqual(await world.run(at, oldOrder(world.runs, world.lines)), ['northrop'], 'cut at 300 requests, and taken up first at the next');
  assert.equal(world.runs.filter((run) => run.source === 'northrop' && !run.complete && run.requests === 300).length, 8);
  assert.ok(!world.runs.some((run) => run.source === 'rtx'), 'RTX has never been read');
  assert.ok(world.runs.filter((run) => run.source !== 'northrop').every((run) => run.at < NOV(24, 15)), 'no other board has had a listing since');
});

test('the same two days under the rule: the board that has waited longest goes first, and every board is read', async () => {
  const world = production();
  const served: string[][] = [];
  for (const at of RUNS_OF_TWO_DAYS) served.push(await world.run(at, world.now));
  // The two boards never read go first, in the registry's order, each with the whole of a run: Northrop, then RTX.
  // Then every other board in the order it has waited, and Northrop is taken up again only behind all of them.
  assert.deepEqual(served.slice(0, 4), [
    ['northrop'],
    ['rtx'],
    ['flex', 'caterpillar', 'globalfoundries', 'gm', 'ge-aerospace', 'boeing', 'intel', 'applied-materials'],
    ['applied-materials', 'blue-origin', 'micron', 'northrop'],
  ]);
  // Applied Materials was the board the third run's budget ran out on, after fifteen requests: no turn, so it was first
  // at the fourth. RTX, never read before, is read at the second run and to its end within the two days.
  assert.ok(world.runs.some((run) => run.source === 'rtx' && run.at < NOV(25, 3)), 'RTX is read the same day');
  const whole = (slug: string) => world.runs.filter((run) => run.source === slug && run.complete && run.at >= NOV(24, 15)).length;
  for (const slug of Object.keys(NEEDS)) if (slug !== 'northrop') assert.ok(whole(slug) >= (slug === 'rtx' ? 1 : 2), `${slug} was listed to its end ${whole(slug)} times in the two days`);
  // The long listing is not starved either: it is taken up when its turn comes round, three turns in the eight runs,
  // and it has a run to itself twice (the first and the seventh), not eight times.
  assert.deepEqual(served.map((boards, n) => (boards[0] === 'northrop' ? n + 1 : 0)).filter(Boolean), [1, 7]);
  assert.equal(world.runs.filter((run) => run.source === 'northrop' && wasTurn(run, BUDGET)).length, 3);
  // No listing is taken up twice before every other board has had its turn.
  const turns = (slug: string) => world.runs.filter((run) => run.source === slug && wasTurn(run, BUDGET)).map((run) => run.at);
  for (const slug of Object.keys(NEEDS)) {
    const mine = turns(slug).filter((at) => at >= NOV(24, 15));
    for (let n = 1; n < mine.length; n += 1) {
      for (const other of Object.keys(NEEDS)) {
        if (other === slug) continue;
        assert.ok(turns(other).some((at) => at > mine[n - 1] && at < mine[n]), `${other} had a turn between two turns of ${slug}`);
      }
    }
  }
});

test('the worst case: every listing longer than a run\'s budget. Each board has the whole budget once in as many runs as there are boards', async () => {
  const slugs = ['a', 'b', 'c', 'd', 'e'];
  const world = platform(Object.fromEntries(slugs.map((slug) => [slug, 100_000])));
  const served: string[] = [];
  for (let n = 0; n < 15; n += 1) served.push(...await world.run(NOV(2, 0) + n * 6 * HOUR, world.now));
  assert.deepEqual(served, [...slugs, ...slugs, ...slugs], 'one board a run, in turn; the registry\'s order settled the first round');
  assert.ok(world.runs.every((run) => run.requests === BUDGET && !run.complete));
});

test('the board the budget ran out on, after less than half of it, has had no turn: it is first at the next run', async () => {
  // A needs 200 requests and B more than any budget. Neither has been read: A is first in the registry.
  const world = platform({ a: 200, b: 100_000 });
  assert.deepEqual(await world.run(NOV(3, 3), world.now), ['a', 'b']);
  assert.equal(world.runs.find((run) => run.source === 'b')?.requests, 100, 'what A left');
  // B's hundred requests were the tail of A's turn, and no turn of its own: B is ahead of A now, with the whole of the
  // next budget, and A is not reached.
  assert.deepEqual(await world.run(NOV(3, 9), world.now), ['b']);
  // B has had its turn; A's is the older one.
  assert.deepEqual(await world.run(NOV(3, 15), world.now), ['a', 'b']);
});

test('boards never read go before every board that has had a turn, in the registry\'s order; a board with no budget is read first of all', async () => {
  const lines = [board('had-a-turn'), board('second'), board('free', 'greenhouse'), board('third')];
  const db = async (strings: TemplateStringsArray, slug: string) =>
    (strings.join('').includes('FROM intake_runs') && slug === 'postings-had-a-turn' ? [{ started_at: new Date(NOV(1, 9)), read: 400, complete: true, requests: 20, budget: BUDGET }] : []);
  const order: { slug: string }[] = await inTurn(db, lines);
  assert.deepEqual(order.map((entry) => entry.slug), ['free', 'second', 'third', 'had-a-turn']);
  assert.equal(SYSTEMS.workday.budget.requests, BUDGET, 'the replays above are run with the platform\'s own budget');
});

// --- The migration ----------------------------------------------------------------------------

test('migration 0091 restates posting_resolve and posting_apply as 0054 wrote them, with the rule and nothing else; it closes and deletes no job', () => {
  const base = readFileSync(path.join(ROOT, 'migrations', '0054_job_postings.sql'), 'utf8');
  const sql = readFileSync(path.join(ROOT, 'migrations', '0091_new_jobs_in_scope.sql'), 'utf8');
  // In the runner's list, after the migration whose functions it restates and after the last posting-places one.
  const at = (name: string) => MIGRATIONS.indexOf(name);
  assert.ok(at('0091_new_jobs_in_scope.sql') > at('0081_posting_places_2.sql') && at('0081_posting_places_2.sql') > at('0054_job_postings.sql') && at('0054_job_postings.sql') >= 0);
  const functionOf = (text: string, name: string) => {
    const from = text.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
    assert.ok(from >= 0, name);
    return text.slice(from, text.indexOf('END $f$;', from) + 'END $f$;'.length).split('\n');
  };
  /** The lines 0091's function has that 0054's has not, and the other way round. */
  const changed = (name: string) => {
    const was = functionOf(base, name);
    const is = functionOf(sql, name);
    return { added: is.filter((row) => !was.includes(row)).map((row) => row.trim()), removed: was.filter((row) => !is.includes(row)).map((row) => row.trim()) };
  };
  // Only these two functions, and no other statement that could touch a job.
  assert.deepEqual([...sql.matchAll(/CREATE OR REPLACE FUNCTION (\w+)/g)].map((found) => found[1]), ['posting_resolve', 'posting_apply']);
  const outside = sql.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?END \$f\$;/g, '').replace(/^--.*$/gm, '');
  assert.doesNotMatch(outside, /\b(DELETE|DROP|TRUNCATE)\b/i);
  assert.deepEqual([...outside.matchAll(/\bUPDATE (\w+)/g)].map((found) => found[1]), ['intake_sources'], 'the one write: where existing sources\' new jobs are ported from');
  assert.match(outside, /ALTER TABLE intake_sources ADD COLUMN states text\[\];\s+UPDATE intake_sources SET states = ARRAY\['TX'\] WHERE kind = 'job';/);

  const resolve = changed('posting_resolve');
  assert.deepEqual(resolve.removed, [
    "SELECT company INTO v_company FROM intake_sources WHERE slug = p_source AND kind = 'job';",
    "'noCareer', (SELECT count(DISTINCT source_id) FROM posting_decided WHERE occupation_id IS NULL));",
  ]);
  assert.deepEqual(resolve.added.filter((row) => row !== '' && !row.startsWith('--')), [
    'v_states text[];',
    'v_ref text;',
    'n_outside integer := 0;',
    "SELECT company, states, ref_source INTO v_company, v_states, v_ref FROM intake_sources WHERE slug = p_source AND kind = 'job';",
    'IF v_states IS NOT NULL THEN',
    'DELETE FROM posting_decided d',
    'WHERE NOT (d.state = ANY (v_states))',
    'AND (d.factory_id IS NULL OR NOT EXISTS (',
    'SELECT 1 FROM external_references x JOIN jobs j ON j.id = x.entity_id',
    "WHERE x.source = v_ref AND x.entity_type = 'jobs' AND NOT x.duplicate AND x.external_id = d.source_id || '@' || d.place_key));",
    'GET DIAGNOSTICS n_outside = ROW_COUNT;',
    "'noCareer', (SELECT count(DISTINCT source_id) FROM posting_decided WHERE occupation_id IS NULL),",
    "'outside', n_outside);",
  ]);

  const apply = changed('posting_apply');
  assert.deepEqual(apply.removed, [
    "SELECT ref_source INTO v_ref FROM intake_sources WHERE slug = p_source AND kind = 'job';",
    'WHERE d.factory_id IS NOT NULL AND d.occupation_id IS NOT NULL;',
  ]);
  assert.deepEqual(apply.added.filter((row) => !row.startsWith('--')), [
    'v_states text[];',
    "SELECT ref_source, states INTO v_ref, v_states FROM intake_sources WHERE slug = p_source AND kind = 'job';",
    'WHERE d.factory_id IS NOT NULL AND d.occupation_id IS NOT NULL',
    // A place outside the states is in the plan only where a job of ours already is: that job is tended, no new one made.
    'AND (v_states IS NULL OR d.state = ANY (v_states) OR x.entity_id IS NOT NULL);',
  ]);
});
