// Unit checks for the parts of the postings pipeline that need no database
// (scripts/ingest/postings/): the registry's check, the fetcher's manners and
// its stop rule against a local server that plays each case, every hiring
// system's adapter against a reduced copy of what that system answered
// (tests/fixtures/postings/), and what a board is turned into before it is
// staged. The plant a posting is at, and the job it becomes, are decided in the
// database (migration 0054): tests/api/postings.sh checks them there.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
// @ts-expect-error a plain script, no types
import { checkRegistry, loadRegistry, sourceOf } from '../../scripts/ingest/postings/registry.mjs';
// @ts-expect-error a plain script, no types
import { BudgetSpent, CeilingReached, FeedError, Refusal, USER_AGENT, createFetcher, parseRobots, platformOf, rewriteTo } from '../../scripts/ingest/postings/fetch.mjs';
// @ts-expect-error a plain script, no types
import { SYSTEMS } from '../../scripts/ingest/postings/systems/index.mjs';
// @ts-expect-error a plain script, no types
import { countryFacet, postedDay } from '../../scripts/ingest/postings/systems/workday.mjs';
// @ts-expect-error a plain script, no types
import { placeOf } from '../../scripts/ingest/postings/systems/icims.mjs';
// @ts-expect-error a plain script, no types
import { sitesOf } from '../../scripts/ingest/postings/systems/jibe.mjs';
// @ts-expect-error a plain script, no types
import { countryOf, dayOf } from '../../scripts/ingest/postings/systems/successfactors-site.mjs';
// @ts-expect-error a plain script, no types
import { listAll, unescapeHtml, webAddress } from '../../scripts/ingest/postings/systems/shared.mjs';
// @ts-expect-error a plain script, no types
import { beforeText, collect, inTurn, report, siteNames, stage } from '../../scripts/ingest/postings/jobs.mjs';
// @ts-expect-error a plain script, no types
import { TITLES_KEPT, titleKey, titleLines, titleTally } from '../../scripts/ingest/postings/titles.mjs';
// @ts-expect-error a plain script, no types
import * as reader from '../../scripts/ingest/postings/read/index.mjs';
// @ts-expect-error a plain script, no types
import { checkSource } from '../../scripts/ingest/lib/pipeline.mjs';
// @ts-expect-error a plain script, no types
import { feedServer } from '../api/postings/feeds.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'postings');

interface Listed {
  id: string;
  title: string;
  location: string | null;
  locations: string[];
  address: string | null;
  department: string | null;
  url: string | null;
  postedAt: string | null;
  updatedAt: string | null;
  country: string | null;
  text: string | null;
  hints: { pay?: { min: number; max: number; period: string }; employmentType?: string; shift?: string };
  path?: string;
}
interface Session {
  requests: number;
  stopped: Error | null;
  get: (url: string, opts?: Record<string, unknown>) => Promise<{ status: number; text: string; json?: unknown }>;
  post: (url: string, body: unknown) => Promise<{ status: number; text: string; json?: unknown }>;
}
interface Asked { method: string; host: string; path: string; query: string; agent: string; body: string }

// --- The registry --------------------------------------------------------------

const line = (over: Record<string, unknown> = {}) => ({ slug: 'acme', employer: 'Acme', company: 'Acme Works', system: 'greenhouse', board: 'acme', ...over });
const registry = (employers: unknown[], leftOut: unknown[] = []) => ({ employers, leftOut });

test('the committed registry is usable, and every system it names has an adapter', () => {
  const committed = loadRegistry();
  assert.ok(committed.employers.length >= 20);
  for (const entry of committed.employers) {
    assert.ok(SYSTEMS[entry.system], `${entry.slug}: ${entry.system}`);
    assert.match(SYSTEMS[entry.system].feed(entry.board), /^https:\/\//);
    assert.doesNotThrow(() => checkSource(sourceOf(entry)));
  }
  // The employers whose sites refused are left out, each with what refused and when.
  for (const name of ['Tesla', 'L3Harris', 'Lockheed Martin']) {
    const out = committed.leftOut.find((entry: { employer: string }) => entry.employer === name);
    assert.equal(out?.why, 'refused', name);
    assert.ok(out.what.length > 10 && /^\d{4}-\d{2}-\d{2}$/.test(out.when));
    assert.ok(!committed.employers.some((entry: { employer: string }) => entry.employer === name));
  }
});

test('the check holds the registry to its shape', () => {
  assert.deepEqual(checkRegistry(registry([line()])), []);
  const problems = (employers: unknown[], leftOut: unknown[] = []) => checkRegistry(registry(employers, leftOut)).join('\n');
  assert.match(problems([line({ system: 'smartrecruiters' })]), /no adapter reads the system "smartrecruiters"/);
  assert.match(problems([line(), line()]), /slug is used twice/);
  assert.match(problems([line({ company: '' })]), /company .* is missing/);
  assert.match(problems([line({ board: 'https://example.com/board' })]), /a Greenhouse board is its token/);
  assert.match(problems([line({ system: 'workday', board: 'boeing' })]), /a Workday board is its address/);
  assert.match(problems([line({ system: 'oracle', board: 'efds.fa.em5.oraclecloud.com' })]), /an Oracle board is/);
  assert.match(problems([line({ also: ['Acme Works'] })]), /also repeats a company/);
  assert.match(problems([line({ ceiling: 100000 })]), /ceiling is a whole number/);
  assert.match(problems([line({ secret: 'x' })]), /"secret" is not something/);
  // A board's sites named by their town alone, each written out as one US place.
  assert.deepEqual(checkRegistry(registry([line({ sites: { Evendale: 'Evendale, OH', 'Loves Park': 'Loves Park, IL' } })])), []);
  assert.match(problems([line({ sites: { Evendale: 'Evendale' } })]), /sites: "Evendale" is "Evendale", which is not one US place written "City, ST"/);
  assert.match(problems([line({ sites: { Evendale: 'Evendale, Ohio' } })]), /not one US place written "City, ST"/, 'the state as its two letters');
  assert.match(problems([line({ sites: { Perth: 'Perth, WA; Seattle, WA' } })]), /not one US place/);
  assert.match(problems([line({ sites: { Evendale: 'Evendale, OH', EVENDALE: 'Evendale, OH' } })]), /"EVENDALE" is named twice/, 'a name in any letter case is one name');
  assert.match(problems([line({ sites: {} })]), /sites is an object of the board's names for its sites/);
  // A site is written out as the town it is in: the city is the site's name or in it, unless the line says why.
  assert.match(problems([line({ sites: { Evendale: 'Cincinnati, OH' } })]), /"Evendale" is written out as Cincinnati, OH, whose city is not the site's name or in it/);
  assert.deepEqual(checkRegistry(registry([line({ sites: { Evendale: { place: 'Cincinnati, OH', why: 'The board writes the village for a site in the city.' } } })])), []);
  assert.match(problems([line({ sites: { Evendale: { place: 'Cincinnati, OH' } } })]), /"Evendale" is written as an object, which is for a place that says why: its why is missing/);
  assert.match(problems([line({ sites: { Evendale: { place: 'Evendale, OH', why: 'x', city: 'Evendale' } } })]), /"city" is not something a site holds/);
  assert.match(problems([line({ sites: { Evendale: { why: 'x' } } })]), /not one US place written "City, ST"/);
  assert.deepEqual(checkRegistry(registry([line({ sites: { 'Evendale Campus': 'Evendale, OH', 'St. George': 'Saint George, UT', 'W Chester AEROSPACE OH US': { place: 'West Chester, OH', why: 'The board shortens the town.' } } })])), [],
    'a city inside the site\'s name, written either way, and one that is not with its why');
  assert.match(problems([line({ sites: ['Evendale, OH'] })]), /sites is an object/);
  assert.match(problems([line()], [{ employer: 'Acme', why: 'refused', what: 'robots.txt answered 403', when: '2026-11-19' }]), /also among the employers that are read/);
  assert.match(problems([], [{ employer: 'Tesla', why: 'unknown', what: 'x', when: '2026-11-19' }]), /why is one of/);
  assert.match(problems([], [{ employer: 'Tesla', why: 'refused', what: 'robots.txt answered 403', when: 'last week' }]), /when is a day/);
  assert.deepEqual(checkRegistry({ employers: [] }), ['leftOut: is not a list']);
});

test('an employer becomes a source of jobs named for it', () => {
  const source = sourceOf(line({ slug: 'blue-origin', also: ['Acme Parts'] }));
  assert.equal(source.slug, 'postings-blue-origin');
  assert.equal(source.refSource, 'POSTINGS_BLUE_ORIGIN');
  assert.equal(source.kind, 'job');
  assert.equal(source.company, 'Acme Works');
  assert.deepEqual(source.also, ['Acme Parts']);
  assert.throws(() => checkSource({ ...source, company: '' }), /names its company/);
});

// --- robots.txt ------------------------------------------------------------------

test('a robots file is read for our name, then for every robot', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/jobs\nCrawl-delay: 5\n\nUser-agent: OtherBot\nDisallow: /\n');
  assert.equal(rules.allowed('/jobs'), true);
  assert.equal(rules.allowed('/private/x'), false);
  assert.equal(rules.allowed('/private/jobs/1'), true, 'the longer rule wins');
  assert.equal(rules.delay, 5);
  const named = parseRobots('User-agent: *\nAllow: /\n\nUser-agent: ArchangelPostings\nDisallow: /api/\n');
  assert.equal(named.allowed('/api/jobs'), false, 'a group that names us is ours');
  assert.equal(named.allowed('/careers'), true);
  assert.equal(parseRobots('User-agent: *\nDisallow:\n').allowed('/anything'), true, 'an empty Disallow forbids nothing');
  assert.equal(parseRobots('User-agent: *\nDisallow: /*.json$\n').allowed('/a/b.json'), false);
  assert.equal(parseRobots('User-agent: *\nDisallow: /*.json$\n').allowed('/a/b.json?x=1'), true);
  assert.equal(parseRobots('').allowed('/x'), true);
});

test('the robots files the scout saved read as he read them', () => {
  const robots = (host: string) => parseRobots(readFileSync(path.join(FIXTURES, 'robots', `${host}.txt`), 'utf8'));
  assert.equal(robots('careers.l3harris.com').allowed('/search-jobs/'), false);
  assert.equal(robots('api.lever.co').delay, 1);
  assert.equal(robots('careers.na.panasonic.com').delay, 5);
  assert.equal(robots('ngc.wd1.myworkdayjobs.com').allowed('/wday/cxs/ngc/Northrop_Grumman_External_Site/jobs'), true);
  assert.equal(robots('ngc.wd1.myworkdayjobs.com').allowed('/refreshFacet/x'), false);
  assert.equal(robots('jobs.deere.com').allowed('/sitemap.xml'), true);
});

// --- The fetcher, against a server that plays each case -----------------------------

let dir = '';
let server: { requests: Asked[]; listen: (port?: number) => Promise<string>; close: () => Promise<void> };
let base = '';
const put = (rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), text);
};
const board = (jobs: unknown[] = []) => JSON.stringify({ jobs });
const feed = (host: string) => `https://${host}/v1/boards/acme/jobs?content=true`;
const asked = (host: string) => server.requests.filter((request) => request.host === host);

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'postings-unit-'));
  put('greenhouse/acme.json', board([{ id: 1, title: 'Welder' }]));
  for (const [host, how] of [['forbidden.test', '403'], ['limited.wd1.myworkdayjobs.com', '429'], ['challenge.test', 'challenge'], ['reset.test', 'reset'], ['down.test', '500']]) put(`refuse/${host}`, how);
  put('robots/closed.test.txt', 'User-agent: *\nDisallow: /\n');
  put('robots/slow.test.txt', 'User-agent: *\nCrawl-delay: 3\n');
  put('robots/crawl.test.txt', 'User-agent: *\nCrawl-delay: 600\n');
  put('robots/partly.test.txt', 'User-agent: *\nDisallow: /v1/boards/secret/\n');
  server = feedServer(dir);
  base = await server.listen(0);
});
after(async () => {
  await server.close();
});

const fetcherHere = (options: Record<string, unknown> = {}) => createFetcher({ rewrite: rewriteTo(base), pace: 0, ...options });

test('a request says what it is, and the robots file is read first, once', async () => {
  const fetcher = fetcherHere();
  const session: Session = fetcher.session('acme');
  const answer = await session.get(feed('open.test'));
  assert.deepEqual(answer.json, { jobs: [{ id: 1, title: 'Welder' }] });
  await session.get(feed('open.test'));
  assert.deepEqual(asked('open.test').map((request) => request.path), ['/robots.txt', '/v1/boards/acme/jobs', '/v1/boards/acme/jobs']);
  for (const request of asked('open.test')) assert.equal(request.agent, USER_AGENT);
  assert.match(USER_AGENT, /^ArchangelPostings\/\d/);
  assert.doesNotMatch(USER_AGENT, /Mozilla|Chrome|Safari|@/, 'no browser imitation and no address of a person');
  assert.equal(session.requests, 3, 'the robots file counts as a request');
  assert.equal(fetcher.totals.requests, 3);
});

test('a host with no robots file allows everything; one that disallows the path is obeyed without asking for it', async () => {
  const session: Session = fetcherHere().session('acme');
  await assert.rejects(session.get(feed('closed.test')), (error: Error) => error instanceof Refusal && /robots\.txt on closed\.test disallows/.test(error.message));
  assert.deepEqual(asked('closed.test').map((request) => request.path), ['/robots.txt'], 'the feed itself was never asked for');
  const partly: Session = fetcherHere().session('acme');
  assert.equal((await partly.get(feed('partly.test'))).status, 200);
  await assert.rejects(partly.get('https://partly.test/v1/boards/secret/jobs'), Refusal);
});

test('a 403, a 429, a challenge page and a reset each end the employer for the run, and nothing is asked again', async () => {
  for (const [host, said] of [['forbidden.test', /answered 403/], ['limited.wd1.myworkdayjobs.com', /answered 429/], ['challenge.test', /challenge page/], ['reset.test', /was reset/]] as const) {
    const fetcher = fetcherHere();
    const session: Session = fetcher.session('acme');
    await assert.rejects(session.get(feed(host)), (error: Error) => error instanceof Refusal && said.test(error.message), host);
    const first = asked(host).length;
    assert.equal(first, 1, `${host}: one request, and it was the robots file`);
    // The same employer asks again: it is told the same, and no request goes out.
    await assert.rejects(session.get(feed(host)), Refusal);
    await assert.rejects(session.get(feed('open.test')), Refusal, 'the employer is done for the run, whatever the host');
    assert.equal(asked(host).length, first, `${host}: nothing was retried`);
    assert.equal(fetcher.totals.refusals, 1);
    assert.ok(session.stopped instanceof Refusal);
  }
});

test('a rate limit or a reset stops every employer on that platform for the run; a 403 stops only its own', async () => {
  const fetcher = fetcherHere();
  await assert.rejects(fetcher.session('one').get(feed('limited.wd1.myworkdayjobs.com')), Refusal);
  const before = server.requests.length;
  await assert.rejects(fetcher.session('two').get(feed('other.wd1.myworkdayjobs.com')), (error: Error) => error instanceof Refusal && /turned this run away earlier/.test(error.message));
  assert.equal(server.requests.length, before, 'the second tenant was not asked');
  assert.equal(platformOf('boeing.wd1.myworkdayjobs.com'), 'myworkdayjobs.com');
  const other = fetcherHere();
  await assert.rejects(other.session('one').get(feed('forbidden.test')), Refusal);
  assert.equal((await other.session('two').get(feed('open.test'))).status, 200);
});

test('a server error fails the employer and is not a refusal', async () => {
  const session: Session = fetcherHere().session('acme');
  await assert.rejects(session.get(feed('down.test')), (error: Error) => error instanceof FeedError && !(error instanceof Refusal));
  assert.equal(asked('down.test').length, 1);
});

test('requests to one host keep their distance: the longer of our pace and the robots file\'s', async () => {
  const waits: number[] = [];
  let clock = 1_000_000;
  const fetcher = fetcherHere({ pace: 1000, now: () => clock, sleep: async (ms: number) => { waits.push(ms); clock += ms; } });
  const session: Session = fetcher.session('acme', { pace: 2000 });
  await session.get(feed('paced.test'));
  await session.get(feed('paced.test'));
  assert.deepEqual(waits, [2000, 2000], 'the robots file, then two feeds 2 s apart');
  waits.length = 0;
  const slow: Session = fetcher.session('slow');
  await slow.get(feed('slow.test'));
  await slow.get(feed('slow.test'));
  assert.deepEqual(waits, [3000, 3000], 'Crawl-delay: 3 is longer than our own second');
  await assert.rejects(fetcher.session('crawl').get(feed('crawl.test')), (error: Error) => error instanceof Refusal && /600 s between requests/.test(error.message));
});

test('a platform with a budget keeps its distance across its tenants: one board after another is still four seconds apart', async () => {
  const waits: number[] = [];
  let clock = 2_000_000;
  const fetcher = fetcherHere({ pace: 1000, budgets: { 'spaced.test': 20 }, now: () => clock, sleep: async (ms: number) => { waits.push(ms); clock += ms; } });
  await fetcher.session('first', { pace: 4000 }).get(feed('a.spaced.test'));
  await fetcher.session('second', { pace: 4000 }).get(feed('b.spaced.test'));
  assert.deepEqual(waits, [4000, 4000, 4000], 'the first board\'s feed, then the second board\'s robots file and feed: each 4 s after the one before');
  waits.length = 0;
  await fetcher.session('elsewhere', { pace: 4000 }).get(feed('c.unbudgeted.test'));
  assert.deepEqual(waits, [4000], 'a host with no budget is paced on its own: its robots file goes at once');
});

test('an employer has a ceiling of requests for a run', async () => {
  const session: Session = fetcherHere().session('acme', { ceiling: 3 });
  await session.get(feed('ceiling.test'));
  await session.get(feed('ceiling.test'));
  await assert.rejects(session.get(feed('ceiling.test')), CeilingReached);
  assert.equal(asked('ceiling.test').length, 3);
  assert.equal(session.stopped, null, 'the ceiling is not a refusal');
});

// --- The adapters, against what each system answered ---------------------------------

let saved: { requests: Asked[]; listen: (port?: number) => Promise<string>; close: () => Promise<void> };
let savedBase = '';
before(async () => {
  saved = feedServer(FIXTURES);
  savedBase = await saved.listen(0);
});
after(async () => {
  await saved.close();
});

async function read(system: string, boardOf: string) {
  const session: Session = createFetcher({ rewrite: rewriteTo(savedBase), pace: 0 }).session(system, { pace: 0 });
  const tools = { get: session.get, post: session.post, today: '2026-11-19' };
  const listed: Listed[] = await listAll(SYSTEMS[system], boardOf, tools);
  return { listed, session, tools };
}

function wellFormed(listed: Listed[], withText: boolean) {
  assert.ok(listed.length >= 3);
  assert.equal(new Set(listed.map((posting) => posting.id)).size, listed.length, 'ids are distinct');
  for (const posting of listed) {
    assert.equal(typeof posting.id, 'string');
    assert.ok(posting.title.length > 2 && posting.title === posting.title.trim());
    assert.match(posting.url ?? '', /^https:\/\//);
    assert.ok(Array.isArray(posting.locations));
    if (posting.location) assert.equal(posting.locations[0], posting.location);
    if (posting.postedAt) assert.match(posting.postedAt, /^\d{4}-\d{2}-\d{2}/);
    if (withText) assert.ok((posting.text ?? '').length > 100, 'the text comes with the list');
    else assert.equal(posting.text, null, 'the text costs a request and is not in the list');
  }
}

test('Greenhouse: one request, the whole board with its text', async () => {
  const { listed, session } = await read('greenhouse', 'andurilindustries');
  wellFormed(listed, true);
  assert.equal(session.requests, 2, 'the robots file and the board');
  const one = listed.find((posting) => posting.id === '5163328007');
  assert.equal(one?.title, 'Electrical Engineer');
  assert.equal(one?.location, 'McHenry, Mississippi, United States');
  assert.match(one?.department ?? '', /Rocket Motor Systems Engineering/);
  assert.match(one?.text ?? '', /^<div|^<p/, 'the escaped HTML is HTML again');
  const several = listed.find((posting) => posting.id === '4802172007');
  assert.deepEqual(several?.locations, ['Costa Mesa, California, United States', 'Fort Collins, Colorado, United States'], 'one line naming two places is two places');
});

test('Lever: one request; the pay the feed states as a field is carried beside the text', async () => {
  const { listed, session } = await read('lever', 'hermeus');
  wellFormed(listed, true);
  assert.equal(session.requests, 2);
  const one = listed.find((posting) => posting.title === 'Aerodynamics Engineer');
  assert.deepEqual(one?.hints.pay, { min: 91800, max: 140250, period: 'year' });
  assert.equal(one?.hints.employmentType, 'Full-time');
  assert.equal(one?.country, 'US');
  assert.match(one?.url ?? '', /^https:\/\/jobs\.lever\.co\/hermeus\//);
});

test('Ashby: one request; a posting at a second place names both', async () => {
  const { listed, session } = await read('ashby', 'saronic');
  wellFormed(listed, true);
  assert.equal(session.requests, 2);
  const one = listed.find((posting) => posting.title === 'Manufacturing Engineer');
  assert.deepEqual(one?.locations, ['Franklin, LA', 'New Orleans, LA']);
  assert.equal(one?.hints.employmentType, 'full-time');
  assert.equal(one?.country, 'United States', 'the country as the feed writes it');
  assert.deepEqual(listed.find((posting) => posting.title.startsWith('Deputy Program Manager'))?.hints.pay, { min: 120000, max: 150000, period: 'year' });
});

test('iCIMS/Jibe: pages of the list with text; the place and street come as fields', async () => {
  const { listed, session } = await read('jibe', 'careers.na.panasonic.com');
  wellFormed(listed, true);
  assert.equal(session.requests, 2);
  const one = listed.find((posting) => posting.id === '51095');
  assert.equal(one?.location, 'Sparks, Nevada');
  assert.match(one?.address ?? '', /1 Electric Ave/);
  assert.equal(one?.url, 'https://careers.na.panasonic.com/jobs/51095?lang=en-us', "the posting's own page, not the sign-in");
  assert.equal(one?.country, 'US');
});

test('iCIMS/Jibe: a posting at several sites names each, each with its own country: one abroad is left out, the others kept', async () => {
  const { listed, session } = await read('jibe', 'careers.manysites.test');
  wellFormed(listed, true);
  assert.equal(session.requests, 2, 'the robots file and the one page: the other sites are in the listing');
  const at = (id: string) => listed.find((posting) => posting.id === id);
  const sites = (id: string) => ({ locations: at(id)?.locations, address: at(id)?.address, country: at(id)?.country });
  assert.deepEqual(sites('7001'), { locations: ['Normal, Illinois', 'Social Circle, Georgia'], address: '1 Works Way, 61761; 100 Works Parkway, 30025', country: 'US' },
    'its first site and the other at home, in order; the one in Ontario left out');
  assert.equal(at('7001')?.location, 'Normal, Illinois');
  assert.deepEqual(sites('7002'), { locations: ['Normal, Illinois'], address: '1 Works Way, 61761', country: 'US' }, 'listed first abroad and kept at its site at home');
  assert.deepEqual(sites('7003'), { locations: ['Social Circle, Georgia'], address: '100 Works Parkway, 30025', country: 'US' }, 'one site, as before');
  assert.deepEqual(sites('7004'), { locations: ['Windsor, Ontario'], address: '9 Lakeshore Road, N9A 1A1', country: 'CA' }, 'abroad at every site: its first, whose country says so');
  assert.deepEqual(sites('7005'), { locations: ['Normal, Illinois'], address: '1 Works Way, 61761; 40 Press Road, 61761', country: 'US' }, 'two streets in one town are one place');

  // Read through: a posting is kept at every site at home, each to be a job at its own factory.
  const entry = { slug: 'manysites', employer: 'Manysites', company: 'Manysites Works', system: 'jibe', board: 'careers.manysites.test' };
  const fresh: Session = createFetcher({ rewrite: rewriteTo(savedBase), pace: 0 }).session('manysites', { pace: 0 });
  const collected = await collect(noRows, entry, { session: fresh, reader, vocab: reader.loadVocabulary(ROOT), today: '2026-11-19' });
  const placesOf = (id: string) => collected.kept.get(id)?.facts.reading.places.map((place: { city: string; state: string }) => `${place.city}, ${place.state}`);
  assert.deepEqual([...collected.kept.keys()], ['7001', '7002', '7003', '7005']);
  assert.deepEqual(placesOf('7001'), ['Normal, IL', 'Social Circle, GA']);
  assert.equal(collected.kept.get('7001')?.facts.location, 'Normal, Illinois; Social Circle, Georgia');
  assert.deepEqual(placesOf('7002'), ['Normal, IL']);
  assert.deepEqual(placesOf('7005'), ['Normal, IL']);
  assert.equal(collected.counts.abroad, 1, 'the posting at sites abroad alone');
  assert.equal(collected.counts.notCareer, 1);
  assert.deepEqual(collected.unplaced, [], 'every site at home was read as a place');

  // Where the job's own fields name no city or state, its location line stands for its first site: the whole line
  // only for a posting at one site; at several it names every site, those abroad among them, and the first is its name.
  const bare = { title: 'Welder', country_code: 'US', location_name: 'Normal Works' };
  assert.deepEqual(sitesOf({ ...bare, full_location: 'Normal, Illinois' }).locations, ['Normal, Illinois']);
  const several = {
    ...bare, full_location: 'Normal, Illinois; Social Circle, Georgia; Windsor, Ontario', multipleLocations: true,
    additional_locations: [{ city: 'Social Circle', state: 'Georgia', country_code: 'US' }, { city: 'Windsor', state: 'Ontario', country_code: 'CA' }],
  };
  assert.deepEqual(sitesOf(several).locations, ['Normal Works', 'Social Circle, Georgia']);
  assert.deepEqual(sitesOf({ ...bare, full_location: 'Normal, Illinois; Windsor, Ontario', multipleLocations: true }).locations, ['Normal Works'],
    'a posting said to be at several sites whose others are not listed');
});

test('Oracle: a list without text, then one request for a posting\'s text', async () => {
  const { listed, session, tools } = await read('oracle', 'efds.fa.em5.oraclecloud.com/CX_1');
  wellFormed(listed, false);
  assert.equal(session.requests, 2);
  assert.deepEqual(listed.map((posting) => posting.country), ['US', 'US', 'IN']);
  const detail = await SYSTEMS.oracle.text('efds.fa.em5.oraclecloud.com/CX_1', listed[0], tools);
  assert.ok(detail.text.length > 300);
  assert.deepEqual(detail.hints, { shift: 'Day', employmentType: 'full-time' });
  assert.equal(session.requests, 3);
  // A posting that left between the list and its text is a 404 the run survives.
  await assert.rejects(SYSTEMS.oracle.text('efds.fa.em5.oraclecloud.com/CX_1', listed[1], tools), (error: FeedError & { status?: number }) => error.status === 404);
  assert.equal(session.stopped, null);
});

test('Workday: the list is narrowed to the United States when the board offers it, and a posting at several places says them in its detail', async () => {
  const { listed, session, tools } = await read('workday', 'https://boeing.wd1.myworkdayjobs.com/wday/cxs/boeing/EXTERNAL_CAREERS');
  wellFormed(listed, false);
  assert.equal(session.requests, 3, 'the robots file, the first page, and the first page again with the filter');
  const posts = saved.requests.filter((request) => request.host === 'boeing.wd1.myworkdayjobs.com' && request.method === 'POST').slice(-2).map((request) => JSON.parse(request.body));
  assert.deepEqual(posts[0].appliedFacets, {});
  assert.deepEqual(posts[1].appliedFacets, { locationCountry: ['bc33aa3152ec42d4995f4791a106ed09'] });
  assert.equal(posts[1].limit, 20);
  const one = listed[0];
  assert.equal(one.id, 'JR2026516085-1', 'the requisition, not the path that carries the title');
  assert.equal(one.location, null, '"2 Locations" is not a place');
  assert.equal(one.postedAt, '2026-11-13');
  const detail = await SYSTEMS.workday.text('https://boeing.wd1.myworkdayjobs.com/wday/cxs/boeing/EXTERNAL_CAREERS', one, tools);
  assert.deepEqual(detail.locations, ['USA - Auburn, WA', 'USA - Algona, WA']);
  assert.equal(detail.hints.employmentType, 'full-time');
  assert.ok(detail.text.length > 100);
});

test('Workday: the filter is found wherever the board puts it, and "Posted 6 Days Ago" is a day', () => {
  assert.deepEqual(countryFacet([{ facetParameter: 'Country', values: [{ descriptor: 'United States of America', id: 'bc33aa3152ec42d4995f4791a106ed09' }] }]), { Country: ['bc33aa3152ec42d4995f4791a106ed09'] });
  assert.deepEqual(
    countryFacet([{ facetParameter: 'locationMainGroup', values: [{ facetParameter: 'locationCountry', values: [{ descriptor: 'United States of America', id: 'bc33aa3152ec42d4995f4791a106ed09' }] }] }]),
    { locationCountry: ['bc33aa3152ec42d4995f4791a106ed09'] }
  );
  assert.equal(countryFacet([{ facetParameter: 'timeType', values: [{ descriptor: 'Full time', id: 'x' }] }]), null);
  assert.equal(postedDay('Posted Today', '2026-11-19'), '2026-11-19');
  assert.equal(postedDay('Posted Yesterday', '2026-11-19'), '2026-11-18');
  assert.equal(postedDay('Posted 6 Days Ago', '2026-11-19'), '2026-11-13');
  assert.equal(postedDay('Posted 30+ Days Ago', '2026-11-19'), '2026-10-20');
  assert.equal(postedDay('', '2026-11-19'), null);
});

/** A board shaped as GE Aerospace's answers (tests/fixtures/postings/workday/townsites): its sites by their town alone, and no filter for a country. */
const TOWNSITES = 'https://townsites.wd5.myworkdayjobs.com/wday/cxs/townsites/Careers';

test('Workday: a board that names its sites by their town alone says no state, in its list or in a posting\'s own record', async () => {
  const { listed, session, tools } = await read('workday', TOWNSITES);
  wellFormed(listed, false);
  assert.equal(session.requests, 2, 'the robots file and one page: with no filter for a country, the first page is the list');
  assert.deepEqual(listed.map((posting) => posting.location), ['Evendale', null, 'Bohemia', 'Auburn AL USA', null, 'Singapore', null], '"2 Locations" is not a place');
  assert.ok(listed.every((posting) => posting.country === null), 'a list that could not be narrowed says no country');
  const several = listed.find((posting) => posting.id === 'R5000002-1');
  assert.deepEqual(several?.locations, []);
  const detail = await SYSTEMS.workday.text(TOWNSITES, several, tools);
  assert.deepEqual(detail.locations, ['Lynn', 'Evendale'], 'the sites are in the posting\'s own record, its first and the others, there too by town alone');
  assert.equal(detail.country, 'US', 'the record says the country of its first site');
  assert.equal(session.requests, 3);
});

test('SuccessFactors: one feed with every posting; the place in the title is taken out of it', async () => {
  const { listed, session } = await read('successfactors', 'https://jobs.deere.com/sitemap.xml');
  wellFormed(listed, true);
  assert.equal(session.requests, 2);
  assert.equal(listed[0].title, 'Controls Engineer');
  assert.equal(listed[0].location, 'URBANDALE, Iowa, US, 50131-3155');
  assert.deepEqual(listed.map((posting) => posting.country), ['US', 'US', 'NL']);
  assert.match(listed[0].text ?? '', /^<p>/);
});

test('iCIMS portals: the search pages are the listing, a place is "City, ST", and the text is the posting\'s own data on its page', async () => {
  const { listed, session, tools } = await read('icims', 'careers-northyard.icims.com');
  wellFormed(listed, false);
  assert.equal(session.requests, 3, 'the robots file and the two pages of the search');
  assert.deepEqual(listed.map((posting) => posting.id), ['1001', '1002', '1003']);
  assert.equal(listed[0].title, 'Welder - Structural (2nd Shift)');
  assert.equal(listed[0].location, 'Groton, CT');
  assert.equal(listed[0].country, 'US');
  assert.equal(listed[0].department, 'Trades & Operations');
  assert.equal(listed[0].url, 'https://careers-northyard.icims.com/jobs/1001/welder---structural-%282nd-shift%29/job', "the posting's page, without the frame's word");
  assert.deepEqual(listed[1].locations, ['North Kingstown, RI', 'Groton, CT'], 'a place above the title, and two in one line');
  assert.deepEqual(placeOf('US-ME-Bath'), { place: 'Bath, ME', country: 'US' });
  assert.deepEqual(placeOf('Bath Shipyard'), { place: 'Bath Shipyard', country: null });
  const detail = await SYSTEMS.icims.text('careers-northyard.icims.com', listed[0], tools);
  assert.match(detail.text, /^<h2>Overview<\/h2>/);
  assert.equal(detail.address, '40 Harbor Point Road, 06340');
  assert.equal(detail.postedAt, '2026-11-12');
  assert.deepEqual(detail.hints, { employmentType: 'full-time' });
  // A posting that left between the list and its text is a 404 the run survives.
  await assert.rejects(SYSTEMS.icims.text('careers-northyard.icims.com', listed[1], tools), (error: FeedError & { status?: number }) => error.status === 404);
  assert.equal(session.stopped, null);
});

test('SuccessFactors career sites: the search pages are the listing, as a table or as tiles, and the text is the posting\'s page', async () => {
  const table = await read('successfactors-site', 'careers.northyard.example');
  wellFormed(table.listed, false);
  assert.equal(table.session.requests, 3, 'the robots file and the two pages of the search');
  const asked = saved.requests.filter((request) => request.host === 'careers.northyard.example' && request.path === '/search/').slice(-2).map((request) => request.query);
  assert.deepEqual(asked, ['?startrow=0', '?startrow=2'], 'no keyword is sent, and the next page starts where the last ended');
  const [one, two, three] = table.listed;
  assert.equal(one.id, '2000001');
  assert.equal(one.title, 'SHIPFITTER - EXPERIENCED (3+ YEARS)');
  assert.equal(one.location, 'Newport News, Virginia, United States');
  assert.equal(one.url, 'https://careers.northyard.example/job/Newport-News-SHIPFITTER-EXPERIENCED-3%2B-YEARS-Virg/2000001/');
  assert.equal(one.postedAt, '2026-11-17');
  assert.equal(one.department, 'Trades & Production');
  assert.deepEqual([one.country, two.country, three.country], ['US', 'US', null], 'a place that does not say the United States is left to the reader');
  const detail = await SYSTEMS['successfactors-site'].text('careers.northyard.example', one, table.tools);
  assert.match(detail.text, /^<p>Req ID: 70001/);
  assert.match(detail.text, /GED<\/li><\/ul>\s*$/, 'the whole description, to its own end, with the spans inside it');
  assert.equal(detail.postedAt, '2026-11-17');
  assert.deepEqual(detail.locations, ['Newport News, Virginia, United States']);
  await assert.rejects(SYSTEMS['successfactors-site'].text('careers.northyard.example', two, table.tools), (error: FeedError & { status?: number }) => error.status === 404);

  const tiled = await read('successfactors-site', 'jobs.tilebrook.example');
  wellFormed(tiled.listed, false);
  assert.equal(tiled.session.requests, 3);
  assert.deepEqual(tiled.listed.map((posting) => [posting.id, posting.title, posting.location, posting.country]), [
    ['3000001', 'Maintenance Technician - 2nd Shift', 'Lafayette, IN', null],
    ['3000002', 'Production Supervisor', 'Friona, Texas, US United States, 79035', 'US'],
    ['3000003', 'Tool & Die Maker', 'Lafayette, IN', null],
  ]);
  assert.equal(tiled.listed[0].department, 'Manufacturing');
  assert.equal(tiled.listed[1].postedAt, '2026-11-20');
  assert.equal(dayOf('Mon Oct 26 00:00:00 UTC 2026'), '2026-10-26');
  assert.equal(dayOf('soon'), null);
  // A place abroad is said by its country, so it is not read as a state and costs no request for its text.
  const lines: [string, string | null][] = [
    ['Arden Hills, MN, US, 55112', 'US'], ['Newport News, Virginia, United States', 'US'], ['Manhattan, NY, US +3 more', 'US'],
    ['Bangalore, KA, IN, 560066', 'IN'], ['Pune, MH, IN', 'IN'], ['Hyderabad, IN, 500 008', 'IN'], ['Giron, Santander, CO Colombia, 687541', 'CO'],
    ['Oakville, ON, CA', 'CA'], ['Curitiba, BR, 81260-900', 'BR'],
    ['Lafayette, IN', null], ['Kingsport, TN, 37660', null], ['Dallas, Multiple Locations, TX', null], ['Wenzhou, CN', null],
  ];
  for (const [line, country] of lines) assert.equal(countryOf(line), country, line);
});

test('a portal or a career site whose pages give no count is read until a page shows nothing new, never taken to end at its first page', async () => {
  const portal = await read('icims', 'careers-quietyard.icims.com');
  assert.deepEqual(portal.listed.map((posting) => posting.id), ['4001', '4002', '4003']);
  assert.equal(portal.session.requests, 4, 'the robots file, two pages, and the page past the end that repeats the last');
  const site = await read('successfactors-site', 'careers.quietyard.example');
  assert.deepEqual(site.listed.map((posting) => posting.id), ['5000001', '5000002', '5000003']);
  assert.equal(site.session.requests, 4, 'the robots file, two pages, and the empty page past the end');
});

test('a career site that answers with a challenge page where its listing was asked for is a refusal, not a changed shape', async () => {
  put('refuse/careers-walled.icims.com', 'challenge after 1');
  const session: Session = fetcherHere().session('walled');
  await assert.rejects(
    listAll(SYSTEMS.icims, 'careers-walled.icims.com', { get: session.get, post: session.post, today: '2026-11-19' }),
    (error: Refusal) => error instanceof Refusal && /challenge page/.test(error.message)
  );
});

test('a feed whose shape changed fails for that employer and says what was missing', async () => {
  put('greenhouse/changed.json', JSON.stringify({ postings: [] }));
  const session: Session = fetcherHere().session('changed');
  await assert.rejects(
    listAll(SYSTEMS.greenhouse, 'changed', { get: session.get, post: session.post, today: '2026-11-19' }),
    (error: FeedError & { shape?: boolean }) => error instanceof FeedError && error.shape === true && /shape changed: no list of jobs/.test(error.message)
  );
});

test('small readings: escaped HTML, and what counts as a web address', () => {
  assert.equal(unescapeHtml('&lt;p&gt;A &amp;amp; B&#39;s &quot;x&quot;&nbsp;&#x41;&lt;/p&gt;'), '<p>A &amp; B\'s "x" A</p>');
  assert.equal(webAddress('http://careers.example.com/job/1'), 'https://careers.example.com/job/1');
  assert.equal(webAddress('javascript:alert(1)'), null);
  assert.equal(webAddress('https://user:pw@example.com/'), null);
  assert.equal(webAddress(undefined), null);
});

// --- A board, before it is staged ----------------------------------------------------

const noRows = Object.assign(async () => [], { json: (value: unknown) => value });

test('before a text is asked for: a title that is a career, one that could be, and one that is not', () => {
  const vocab = reader.loadVocabulary(ROOT);
  const ask = (title: string, location: string | null) =>
    beforeText(reader, { title, location, locations: location ? [location] : [] }, { employer: 'Acme', title }, vocab);
  // The title says it.
  assert.deepEqual(ask('Welder', 'Franklin, LA'), { could: true, places: [{ city: 'Franklin', state: 'LA' }] });
  // The title could be one of ours and the text has to bear it out: the reader reached for the text, so it is worth the request.
  assert.equal(reader.readPosting({ employer: 'Acme', title: 'Manufacturing Technician', location: 'Franklin, LA', text: '' }, vocab).career, null);
  assert.equal(ask('Manufacturing Technician', 'Franklin, LA').could, true);
  // A title the reader refuses outright is never asked about.
  assert.equal(ask('Deputy Program Manager', 'Austin, Texas, United States').could, false);
  assert.equal(ask('Accountant', 'Franklin, LA').could, false);
  // A listing that says where, and it is nowhere in the United States; and one that gives no line to read.
  assert.deepEqual(ask('Welder', 'Melbourne, Victoria, Australia').places, []);
  assert.equal(ask('Welder', null).places, null, 'no line: the places are in the posting itself');
  assert.equal(ask('Welder', null).could, true);
  // A site named by its town alone says no state. Written out on the board's line, it is the place written there.
  assert.deepEqual(ask('Welder', 'Evendale').places, []);
  const named = siteNames({ sites: { Evendale: 'Evendale, OH' } });
  const listed = named.posting({ title: 'Welder', location: 'evendale ', locations: ['evendale '] });
  assert.deepEqual(listed.locations, ['Evendale, OH'], 'in any letter case, with any spaces');
  assert.deepEqual(beforeText(reader, listed, { employer: 'Acme', title: 'Welder' }, vocab).places, [{ city: 'Evendale', state: 'OH' }]);
  assert.deepEqual(named.posting({ title: 'Welder', location: 'Lynn', locations: ['Lynn'] }).locations, ['Lynn'], 'a site not written out is as the feed gave it');
  // A site written out with its why is read as the place it names; the key is what the places are, the why aside.
  const why = siteNames({ sites: { Evendale: { place: 'Evendale, OH', why: 'The board writes the village.' } } });
  assert.deepEqual(why.posting({ title: 'Welder', location: 'Evendale', locations: ['Evendale'] }).locations, ['Evendale, OH']);
  assert.equal(why.key, named.key);
  // A whole line the reader reads as states, never a town, is written out the same way where a person knows the town:
  // Workday's "Wyoming, Michigan, United States of America" reads as "Texas, Oklahoma, United States" does.
  const states = 'Wyoming, Michigan, United States of America';
  assert.deepEqual(ask('Welder', states).places, []);
  assert.deepEqual(checkRegistry(registry([line({ sites: { [states]: 'Wyoming, MI' } })])), []);
  const town = siteNames({ sites: { [states]: 'Wyoming, MI' } }).posting({ title: 'Welder', location: states, locations: [states] });
  assert.deepEqual(beforeText(reader, town, { employer: 'Acme', title: 'Welder' }, vocab).places, [{ city: 'Wyoming', state: 'MI' }]);
  // A board with no sites written out reads exactly as before.
  const plain = { title: 'Welder', location: 'Evendale', locations: ['Evendale'] };
  assert.equal(siteNames({}).posting(plain), plain);
  assert.equal(siteNames({}).key, null);
});

test('a title turned away is counted by what the job is: its level, shift, codes and places set aside', () => {
  const key = (title: string, location = '') => titleKey(title, location);
  // Level words and numerals as the reader sets them aside; the place, where the location line or a state says it; a requisition.
  assert.equal(key('Sr. Propulsion Technician II - Hawthorne, CA (R10260434)', 'Hawthorne, CA'), 'propulsion technician');
  assert.equal(key('Propulsion Technician (Night Shift)', 'McGregor, TX'), 'propulsion technician');
  assert.equal(key('Mechanisms Technician 4th shift'), 'mechanisms technician');
  assert.equal(key('Test Operations Engineer II/Senior Test Operations Engineer'), 'test operations engineer', 'the same job said twice is one');
  assert.equal(key('Avionics Technician 2/3 - Starbase', 'Starbase, TX'), 'avionics technician');
  assert.equal(key('Battery Cell Production Technician (2nd shift) - De Soto, KS', 'De Soto, Kansas'), 'battery cell production technician');
  assert.equal(key('Req #12345 Welder - Texas'), 'welder');
  // A programme or a team in brackets or after a dash is not the job; a bare job word takes its kind from beside it.
  assert.equal(key('Launch Vehicle Integration Technician - Starship (Falcon)'), 'launch vehicle integration technician');
  assert.equal(key('Technician, Composites (Level 3)'), 'composite technician');
  assert.equal(key('Technician (Composites)'), 'composite technician');
  assert.equal(key('(Toolmaker)'), 'toolmaker');
  assert.equal(key('Procurement Agent (Procurement Agent-General)', 'USA - Hazelwood, MO'), 'procurement agent');
  assert.equal(key('Senior Staff Assembly, Integration & Test (AIT) Engineer'), 'integration and test engineer', 'a bracket inside a part does not cut it');
  // Work the reader refuses a title for is still counted as what it is: a lead, a manager, a co-op.
  assert.equal(key('Avionics Lead', 'Starbase, TX'), 'avionics lead');
  assert.equal(key('Lead Technician, Propulsion & Fluids'), 'propulsion and fluids technician', '"lead" before a job is its level');
  assert.equal(key('Senior Manager, Supply Chain - Remote'), 'supply chain manager');
  assert.equal(key('Manufacturing Engineering Co-op', 'Austin, TX'), 'manufacturing engineering co-op');
  assert.equal(key('Automation & Controls Engineer'), 'automation and controls engineer');
  assert.equal(key('Assembler / Machine Operator'), 'assembler / machine operator');
  assert.equal(key('Texas'), '', 'nothing but a place');
  assert.equal(key('Production Mgr - Austin, TX', 'Austin, TX'), 'production mgr', '"Mgr" is a job word as "Manager" is');
  assert.equal(key('Mgr, Quality'), 'quality mgr', 'and a bare one takes its kind from beside it');
  for (const letter of ['X', 'A - Remote', 'B (Austin, TX)']) assert.equal(key(letter, 'Austin, TX'), '', `a letter alone is no title: ${letter}`);

  // The tally: the commonest first, then by title; the postings counted whatever their title came to.
  const tally = titleTally();
  for (const [title, location] of [
    ['Software Engineer II', 'Hawthorne, CA'], ['Senior Software Engineer', 'Redmond, WA'], ['Software Engineer (Starlink)', ''],
    ['Propulsion Technician - Hawthorne', 'Hawthorne, CA'], ['Avionics Lead', ''], ['Propulsion Technician (Raptor)', 'McGregor, TX'], ['Texas', ''],
  ]) tally.add(title, location);
  assert.deepEqual(tally.summary(), { postings: 7, distinct: 3, top: [['software engineer', 3], ['propulsion technician', 2], ['avionics lead', 1]] });
  assert.deepEqual(tally.summary(2).top.map(([title]: [string, number]) => title), ['software engineer', 'propulsion technician']);
  // A board's part of the report names the 25 commonest and how many distinct there are.
  assert.equal(TITLES_KEPT, 25);
  const many = titleTally();
  // Forty titles, a word of two letters apart ("Widget aa Specialist"), each listed one to four times.
  const word = (n: number) => String.fromCharCode(97 + Math.floor(n / 26), 97 + (n % 26));
  for (let n = 0; n < 40; n += 1) for (let times = 0; times <= n % 4; times += 1) many.add(`Widget ${word(n)} Specialist`, '');
  const summary = many.summary();
  assert.equal(summary.distinct, 40);
  assert.equal(summary.top.length, 25);
  assert.ok(summary.top.every(([, count]: [string, number], at: number) => at === 0 || count <= summary.top[at - 1][1]), 'the commonest first');
  assert.deepEqual(titleLines(tally.summary()), [
    '  turned away as not one of our careers: 7 postings under 3 distinct titles; all 3, with how many postings:',
    '    3  software engineer',
    '    2  propulsion technician',
    '    1  avionics lead',
  ]);
  assert.match(titleLines(summary)[0], /: \d+ postings under 40 distinct titles; the 25 commonest, with how many postings:$/);
  assert.deepEqual(titleLines(titleTally().summary()), [], 'nothing turned away, nothing said');
});

test('only postings that are one of our careers at a US place are kept, as facts and a link: never the text', async () => {
  const session: Session = createFetcher({ rewrite: rewriteTo(savedBase), pace: 0 }).session('saronic', { pace: 0 });
  const entry = { slug: 'saronic', employer: 'Saronic', company: 'Saronic', system: 'ashby', board: 'saronic' };
  // The reader is given the country where the feed gives one, as the feed writes it.
  const countries: unknown[] = [];
  const watching = { ...reader, readPosting: (posting: { country?: string; text: string }, vocab: unknown) => { if (posting.text) countries.push(posting.country); return reader.readPosting(posting, vocab); } };
  await collect(noRows, entry, { session: createFetcher({ rewrite: rewriteTo(savedBase), pace: 0 }).session('saronic', { pace: 0 }), reader: watching, vocab: reader.loadVocabulary(ROOT), today: '2026-11-19' });
  assert.deepEqual(countries, ['United States', 'United States', 'United States', 'United States'], 'each posting is read once, with its country');
  const collected = await collect(noRows, entry, { session, reader, vocab: reader.loadVocabulary(ROOT), today: '2026-11-19' });
  assert.deepEqual(collected.counts, { read: 4, abroad: 0, notCareer: 1, noPlace: 0, noAddress: 0, vanished: 0, texts: 0, spared: 0, kept: 3 });
  // The title turned away is counted for the report, by what the job is; the counts that go into the run's row do not carry it.
  assert.deepEqual(collected.titles, { postings: 1, distinct: 1, top: [['deputy program manager', 1]] });
  const run = {
    id: 7, source: 'postings-saronic', source_name: 'Saronic job postings', system: 'ashby', input: 'https://api.ashbyhq.com/posting-api/job-board/saronic',
    state: 'staged', note: null, counts: { ...collected.counts, complete: true }, timings: { fetch: 1 },
  };
  let asked = 0;
  const one = Object.assign(async () => (asked++ === 0 ? [run] : []), { json: (value: unknown) => value });
  const text = await report(one, 7, { titles: collected.titles });
  assert.match(text, /\n {2}turned away as not one of our careers: 1 posting under 1 distinct title; the one, with how many postings:\n {4}1 {2}deputy program manager/);
  asked = 0;
  assert.doesNotMatch(await report(one, 7), /turned away/, 'read again later from the database, a report has no titles: they were kept nowhere');
  const welder = [...collected.kept.values()].find((record: { facts: { title: string } }) => record.facts.title === 'Welder');
  assert.equal(welder.facts.reading.career.title, 'Welder');
  assert.deepEqual(welder.facts.reading.places, [{ city: 'Franklin', state: 'LA' }]);
  assert.equal(welder.facts.url, 'https://jobs.ashbyhq.com/saronic/bee16057-c1f1-43f1-aef8-e596108964b9');
  // What the feed states as a field of its own stands where the text says nothing.
  assert.equal(welder.facts.reading.requirements.employmentType, 'full-time');
  const two = [...collected.kept.values()].find((record: { facts: { title: string } }) => record.facts.title === 'Manufacturing Engineer');
  assert.deepEqual(two.facts.reading.places, [{ city: 'Franklin', state: 'LA' }, { city: 'New Orleans', state: 'LA' }], 'every place the posting is at');
  // Nothing staged carries the posting's wording: only a hash of it.
  const staged = JSON.stringify([...collected.kept.values()]);
  assert.doesNotMatch(staged, /Saronic Technologies is a leader/);
  assert.match(welder.payload.text, /^[0-9a-f]{32}$/);
  assert.equal(welder.hash.length, 32);
});

test('where the text costs a request it is asked for only postings whose title is kept, and only when the listing is new or changed', async () => {
  const machinists = {
    loadVocabulary: () => ({}),
    readPosting: (posting: { title: string; location: string; text: string }) => ({
      career: /machinist/i.test(posting.title) ? { title: 'CNC Machinist', how: 'close', matched: posting.title } : null,
      level: null,
      places: ['Auburn', 'Algona'].filter((city) => posting.location.includes(city)).map((city) => ({ city, state: 'WA' })),
      skills: [], makes: [], requirements: {}, pay: null, unknown: [],
    }),
  };
  const entry = { slug: 'boeing', employer: 'Boeing', company: 'Boeing', system: 'workday', board: 'https://boeing.wd1.myworkdayjobs.com/wday/cxs/boeing/EXTERNAL_CAREERS' };
  const run = async (rows: unknown[], options: Record<string, unknown> = {}) => {
    const session: Session = createFetcher({ rewrite: rewriteTo(savedBase), pace: 0 }).session('boeing', { pace: 0, ...options });
    const db = Object.assign(async () => rows, { json: (value: unknown) => value });
    return { collected: await collect(db, entry, { session, reader: machinists, vocab: {}, today: '2026-11-19' }), session };
  };
  const first = await run([]);
  assert.equal(first.collected.counts.read, 4);
  assert.equal(first.collected.counts.notCareer, 3, 'three titles are not ours: their text is never asked for');
  assert.deepEqual(first.collected.titles.top, [['procurement agent', 1], ['safety specialist', 1], ['supplier program management specialist', 1]],
    'turned away on the title alone, and counted all the same');
  assert.equal(first.collected.counts.texts, 1);
  assert.equal(first.session.requests, 4, 'robots, the list twice (the filter), and one text');
  const record = first.collected.kept.get('JR2026516085-1');
  assert.deepEqual(record.facts.reading.places, [{ city: 'Auburn', state: 'WA' }, { city: 'Algona', state: 'WA' }]);
  assert.equal(record.facts.postedAt, '2026-11-13');

  // The next day the listing is the same: no text is asked for, and the record is as it was.
  const second = await run([{ source_id: 'JR2026516085-1', hash: record.hash, payload: record.payload, facts: record.facts }]);
  assert.equal(second.session.requests, 3);
  assert.equal(second.collected.counts.texts, 0);
  assert.deepEqual(second.collected.kept.get('JR2026516085-1'), { same: true, hash: record.hash });

  // With the ceiling reached the posting is left for the next run, not dropped.
  const third = await run([], { ceiling: 3 });
  assert.equal(third.collected.kept.size, 0);
  assert.deepEqual([...third.collected.deferred], ['JR2026516085-1']);
  assert.equal(third.collected.stopped.outcome, 'cut');
  assert.equal(third.collected.complete, true, 'the listing itself was read to its end');
  assert.deepEqual([...third.collected.present], ['JR2026516085-1'], 'listed, so not gone');
});

test('the titles turned away are the report\'s alone: staging writes none of them to the database', async () => {
  const session: Session = createFetcher({ rewrite: rewriteTo(savedBase), pace: 0 }).session('boeing', { pace: 0 });
  const entry = { slug: 'boeing', employer: 'Boeing', company: 'Boeing', system: 'workday', board: 'https://boeing.wd1.myworkdayjobs.com/wday/cxs/boeing/EXTERNAL_CAREERS' };
  const collected = await collect(noRows, entry, { session, reader, vocab: reader.loadVocabulary(ROOT), today: '2026-11-19' });
  const turnedAway = collected.titles.top.map(([title]: [string, number]) => title);
  assert.ok(turnedAway.length > 0, 'the run turned titles away');
  // Every statement stage() sends, with what it sends: the run's counts are what note() writes to intake_runs.
  const sent: { sql: string; values: unknown[] }[] = [];
  const db = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    sent.push({ sql: strings.join('$'), values });
    return [];
  }, { json: (value: unknown) => value });
  await stage(db, 7, collected, { log: () => {} });
  const noted = sent.filter(({ sql }) => /UPDATE intake_runs SET\s+state/.test(sql));
  assert.equal(noted.length, 1, 'note() wrote the run\'s row once');
  const counts = noted[0].values.find((value) => value && typeof value === 'object' && 'read' in value) as Record<string, unknown>;
  assert.equal(counts.read, collected.counts.read);
  assert.ok(!('titles' in counts), 'the run\'s counts carry no titles');
  assert.ok('unknown' in counts && 'unplaced' in counts, 'what is kept in the run\'s row is kept');
  // Nor is any title turned away in anything else staging sent.
  const everything = JSON.stringify(sent.map(({ values }) => values)).toLowerCase();
  for (const title of turnedAway) assert.ok(!everything.includes(title), `"${title}" is not written`);
});

// --- Sites named by their town alone ---------------------------------------------------

interface Kept { same?: boolean; hash: string; payload: unknown; facts: { location: string; reading: { places: { city: string; state: string }[] } } }

test('a site named by its town alone is the place its line in the registry writes out; any other is listed in the report and costs no text', async () => {
  const vocab = reader.loadVocabulary(ROOT);
  const host = 'townsites.wd5.myworkdayjobs.com';
  const entry = { slug: 'townsites', employer: 'Townsites', company: 'Townsites Works', system: 'workday', board: TOWNSITES, sites: { Evendale: 'Evendale, OH', LYNN: 'Lynn, MA' } };
  /** One run over the board, with what staging holds: the texts it asked for, by the end of each one's path. */
  const run = async (line: Record<string, unknown>, records: unknown[] = [], passes: unknown[] = []) => {
    const db = Object.assign(async (strings: TemplateStringsArray) => {
      const sql = strings.join('');
      return sql.includes('FROM intake_records') ? records : sql.includes('FROM posting_passes') ? passes : [];
    }, { json: (value: unknown) => value });
    const from = saved.requests.length;
    const session: Session = createFetcher({ rewrite: rewriteTo(savedBase), pace: 0 }).session('townsites', { pace: 0 });
    const collected = await collect(db, line, { session, reader, vocab, today: '2026-11-19' });
    const asked = saved.requests.slice(from).filter((request) => request.host === host && request.path.includes('/job/')).map((request) => request.path.split('/').pop());
    return { collected, asked, kept: collected.kept as Map<string, Kept> };
  };
  const placesOf = (record: Kept | undefined) => record?.facts.reading.places.map((place) => `${place.city}, ${place.state}`);

  // Without the line's sites the board gives what GE Aerospace's gave: nothing at a town alone, and one posting kept,
  // at the one site that says its state.
  const before = await run({ ...entry, sites: undefined });
  assert.deepEqual([...before.kept.keys()], ['R5000004-1']);
  assert.deepEqual(before.asked, ['CNC-Machinist_R5000002-1', 'Welder_R5000004-1', 'CNC-Machinist_R5000007-1']);
  assert.deepEqual(before.collected.unplaced, [['Bohemia', 2], ['Evendale', 2], ['Lynn', 1], ['Norwich', 1], ['Singapore', 1]]);

  const first = await run(entry);
  assert.deepEqual(first.collected.counts, { read: 7, abroad: 0, notCareer: 1, noPlace: 3, noAddress: 0, vanished: 0, texts: 4, spared: 0, kept: 3 });
  assert.deepEqual(first.asked, ['Welder_R5000001-1', 'CNC-Machinist_R5000002-1', 'Welder_R5000004-1', 'CNC-Machinist_R5000007-1'],
    'a text for each posting that could be ours at a place, or whose places are only in its record: none at Bohemia or Singapore alone, none for the payroll analyst');
  assert.deepEqual(placesOf(first.kept.get('R5000001-1')), ['Evendale, OH']);
  assert.deepEqual(placesOf(first.kept.get('R5000002-1')), ['Lynn, MA', 'Evendale, OH'], 'a posting at two sites is at both, each to be a job at its own factory');
  assert.equal(first.kept.get('R5000002-1')?.facts.location, 'Lynn, MA; Evendale, OH');
  assert.deepEqual(placesOf(first.kept.get('R5000004-1')), ['Auburn, AL'], 'a site that says its state is read as it is');
  assert.deepEqual(first.collected.unplaced, [['Bohemia', 2], ['Norwich', 1], ['Singapore', 1]], 'where postings that could be ours are at no place we read: for a person to write out');
  assert.deepEqual([...first.collected.passes.keys()], ['R5000007-1'], 'its text was read and it is at no place: noted, so it is not asked about again while nothing changes');

  // The next day nothing has changed: no text is asked for.
  const staged = [...first.kept].map(([id, record]) => ({ source_id: id, hash: record.hash, payload: record.payload, facts: record.facts }));
  const passed = [...first.collected.passes].map(([id, listing]) => ({ source_id: id, listing, read_on: '2026-11-19' }));
  const second = await run(entry, staged, passed);
  assert.deepEqual(second.asked, []);
  assert.equal(second.collected.counts.spared, 1);
  assert.deepEqual(second.kept.get('R5000001-1'), { same: true, hash: first.kept.get('R5000001-1')?.hash });

  // A site written out since: the postings listed there are read, and so are those whose places are only in their own
  // record; the rest stand as they were.
  const third = await run({ ...entry, sites: { ...entry.sites, Bohemia: 'Bohemia, NY' } }, staged, passed);
  assert.deepEqual(third.asked, ['CNC-Machinist_R5000002-1', 'Welder_R5000003-1', 'CNC-Machinist_R5000007-1']);
  assert.deepEqual(placesOf(third.kept.get('R5000003-1')), ['Bohemia, NY']);
  assert.deepEqual(placesOf(third.kept.get('R5000007-1')), ['Bohemia, NY']);
  assert.deepEqual(third.kept.get('R5000004-1'), { same: true, hash: first.kept.get('R5000004-1')?.hash });
  assert.deepEqual(third.collected.unplaced, [['Norwich', 1], ['Singapore', 1]], 'a site of a posting kept at another is still one to write out');
});

test('the run\'s report names the places that were not read, the commonest first', async () => {
  const db = Object.assign(async (strings: TemplateStringsArray) => {
    if (!strings.join('').includes('JOIN intake_sources')) return [];
    return [{
      id: 7, source: 'postings-townsites', state: 'applied', input: `${TOWNSITES}/jobs`, note: null, source_name: 'Townsites job postings', system: 'workday', company: 'Townsites Works',
      counts: { read: 7, notCareer: 1, abroad: 0, noPlace: 3, kept: 3, unplaced: [['Bohemia', 2], ['Norwich', 1]] }, timings: {},
    }];
  }, { json: (value: unknown) => value });
  const text = await report(db, 7);
  assert.match(text, /places named and not read as a US city and state \(the 2 commonest, with how many postings; a site named by its town alone is written out under "sites" on the board's line\): Bohemia 2; Norwich 1/);
});

test('the committed registry writes out GE Aerospace\'s sites where we list a factory of the board\'s companies', () => {
  const ge = loadRegistry().employers.find((entry: { slug: string }) => entry.slug === 'ge-aerospace');
  assert.equal(ge.sites.Evendale, 'Evendale, OH');
  assert.equal(ge.sites.Lynn, 'Lynn, MA');
  // Each as the town it is in. The board's own Cincinnati site, apart from Evendale, is not written out: we cannot place
  // it yet, and written "Cincinnati, OH" its postings would be taken for the Evendale factory, which is filed under its
  // mailing town, Cincinnati (places.json points Evendale, OH at it). It is decided in places.json once it is known.
  assert.equal(ge.sites.Cincinnati, undefined);
  for (const [name, place] of Object.entries(ge.sites)) assert.equal(place, `${name}, ${String(place).slice(-2)}`, name);
});

// --- A platform's budget, and a listing that is cut -------------------------------------

test('a platform has a budget of requests for the whole run, across every employer on it', async () => {
  const fetcher = fetcherHere({ budgets: { 'budget.test': 3 } });
  const first: Session = fetcher.session('one');
  const second: Session = fetcher.session('two');
  await first.get(feed('a.budget.test'));
  assert.equal(fetcher.budgetLeft('budget.test'), 1, 'the robots file and the feed are two requests to the platform');
  await second.get('https://b.budget.test/robots.txt').catch(() => undefined);
  await assert.rejects(second.get(feed('b.budget.test')), (error: Error) => error instanceof BudgetSpent && /budget of 3 requests to budget\.test is spent/.test(error.message));
  await assert.rejects(first.get(feed('a.budget.test')), BudgetSpent);
  assert.equal(fetcher.totals.platforms['budget.test'], 3);
  assert.equal(asked('a.budget.test').length + asked('b.budget.test').length, 3, 'nothing was asked past the budget');
  assert.equal(first.stopped, null, 'a spent budget is not a refusal');
  assert.equal(fetcher.budgetLeft('elsewhere.test'), Infinity);
  // Another platform is not held back.
  await fetcher.session('three').get(feed('open.test'));
});

/** A Workday board of `count` postings in the folder the local server reads: every fifth a welder, with its text. */
function longBoard(tenant: string, count: number, without: number[] = []) {
  const jobPostings = [];
  for (let n = 1; n <= count; n += 1) {
    if (without.includes(n)) continue;
    const title = n % 5 === 1 ? 'Welder' : 'Payroll Analyst';
    const row = { title, externalPath: `/job/Reno-NV/${title.replace(/ /g, '-')}_W${n}`, locationsText: 'Reno, NV', postedOn: 'Posted Today', bulletFields: [`W${n}`] };
    jobPostings.push(row);
    if (title === 'Welder') {
      put(`workday/${tenant}/detail/${row.externalPath.replace(/[^A-Za-z0-9]+/g, '_')}.json`, JSON.stringify({ jobPostingInfo: {
        title, jobDescription: '<p>Weld frames.</p><h3>Basic Qualifications</h3><ul><li>Experience in MIG welding</li></ul>', location: 'Reno, NV', additionalLocations: [],
        startDate: '2026-11-18', timeType: 'Full time', externalUrl: `https://${tenant}.wd1.myworkdayjobs.com/Careers${row.externalPath}` } }));
    }
  }
  put(`workday/${tenant}/list.json`, JSON.stringify({ jobPostings, facets: [] }));
}

test('the budget is spent where it is most needed: a cut listing, then a board a week past its last whole listing, then one never read', async () => {
  const day = 86_400_000;
  const now = Date.parse('2026-11-24T09:23:00Z');
  const history: Record<string, { cut?: boolean; whole?: number }> = {
    'postings-fresh': { whole: now - 2 * day },
    'postings-never': {},
    'postings-stale': { whole: now - 9 * day },
    'postings-cut': { cut: true, whole: now - 3 * day },
  };
  const db = async (strings: TemplateStringsArray, slug: string) => {
    const known = history[slug] ?? {};
    if (strings.join('').includes('max(started_at)')) return [{ at: known.whole ? new Date(known.whole) : null }];
    return known.cut ? [{ counts: { read: 40, resume: { next: { offset: 40 } } } }] : [];
  };
  const entry = (slug: string, system: string) => ({ slug, employer: slug, company: slug, system, board: slug });
  const order = await inTurn(db, [entry('fresh', 'workday'), entry('one', 'greenhouse'), entry('never', 'workday'), entry('stale', 'workday'), entry('cut', 'workday')], { now });
  assert.deepEqual(order.map((line: { slug: string }) => line.slug), ['one', 'cut', 'stale', 'never', 'fresh'], 'a board with no budget first; jobs already on the lists are kept before new boards are read in');
});

test('a listing cut by the budget has read everything up to the cut, and the next run takes it up there', async () => {
  longBoard('cut', 85);
  const vocab = reader.loadVocabulary(ROOT);
  const entry = { slug: 'cut', employer: 'Cut', company: 'Cut', system: 'workday', board: 'https://cut.wd1.myworkdayjobs.com/wday/cxs/cut/Careers' };
  const host = 'cut.wd1.myworkdayjobs.com';
  const offsets = (from: number) => asked(host).slice(from).filter((request) => request.method === 'POST').map((request) => JSON.parse(request.body).offset);
  const run = async (budget: number, rows: unknown[]) => {
    const fetcher = fetcherHere({ budgets: { 'myworkdayjobs.com': budget } });
    const db = Object.assign(async () => rows, { json: (value: unknown) => value });
    const before = asked(host).length;
    const collected = await collect(db, entry, { session: fetcher.session('cut', { pace: 0 }), reader, vocab, today: '2026-11-19' });
    return { collected, before };
  };

  // Robots, then pages and the texts of each page's welders as it goes: 1 + (1 + 4) + (1 + 4) + 1 = 12, and the thirteenth is refused by the budget.
  const first = await run(12, []);
  assert.deepEqual(offsets(first.before), [0, 20, 40]);
  assert.equal(first.collected.complete, false);
  assert.equal(first.collected.stopped.outcome, 'cut');
  assert.match(first.collected.stopped.why, /budget of 12 requests to myworkdayjobs\.com is spent/);
  assert.equal(first.collected.counts.read, 60);
  assert.deepEqual([...first.collected.kept.keys()], ['W1', 'W6', 'W11', 'W16', 'W21', 'W26', 'W31', 'W36'], 'the first two pages were read whole');
  assert.deepEqual([...first.collected.deferred], ['W41', 'W46', 'W51', 'W56'], 'the page the budget cut at: listed, not read, and listed again next run');
  assert.deepEqual(first.collected.resume.next, { offset: 60, facet: {}, total: 85 });
  assert.equal(first.collected.resume.seen.length, 12);

  // The next run: what the last run's row says is where it starts, two pages back from the cut.
  const staged = [...first.collected.kept].map(([id, record]) => ({ source_id: id, hash: (record as { hash: string }).hash, payload: (record as { payload: unknown }).payload, facts: (record as { facts: unknown }).facts }));
  const second = await run(300, [{ counts: { resume: first.collected.resume }, ...staged[0] }, ...staged.slice(1)]);
  assert.deepEqual(offsets(second.before), [20, 40, 60, 80], 'no first page, no filter request: straight to where it stopped, less two pages');
  assert.equal(second.collected.complete, true);
  assert.equal(second.collected.resumed, true);
  assert.equal(second.collected.resume, null);
  assert.equal(second.collected.counts.texts, 9, 'the page that was cut and the ones after it; what was read before the cut is not asked for again');
  assert.equal(second.collected.present.size, 17, 'every welder of the board, over the two runs');
  assert.ok(second.collected.present.has('W1'), 'one the first run saw and the second did not list is not gone');
});

test('a listing that is refused part way keeps what it listed and says it did not reach the end', async () => {
  put('jibe/careers.partway.test.json', JSON.stringify({ jobs: Array.from({ length: 120 }, (_, n) => ({ data: {
    req_id: String(n + 1), title: n % 50 === 3 ? 'Welder' : 'Payroll Analyst', city: 'Reno', state: 'Nevada', country_code: 'US',
    description: '<p>Weld frames.</p><ul><li>Experience in MIG welding</li></ul>', meta_data: { canonical_url: `https://careers.partway.test/jobs/${n + 1}` } } })) }));
  put('refuse/careers.partway.test', '403 after 2');
  const entry = { slug: 'partway', employer: 'Partway', company: 'Partway', system: 'jibe', board: 'careers.partway.test' };
  const session: Session = fetcherHere().session('partway', { pace: 0 });
  const collected = await collect(noRows, entry, { session, reader, vocab: reader.loadVocabulary(ROOT), today: '2026-11-19' });
  assert.equal(collected.counts.read, 100);
  assert.deepEqual([...collected.kept.keys()], ['4', '54']);
  assert.equal(collected.complete, false);
  assert.equal(collected.stopped.outcome, 'refused');
  assert.equal(collected.resume, null, 'this system cannot be taken up part way: the next run starts it again');
  assert.ok(session.stopped instanceof Refusal);
  // Refused before anything was listed: there is nothing to stage, and the run fails as a refusal.
  put('refuse/careers.partway.test', '403 after 1');
  await assert.rejects(collect(noRows, entry, { session: fetcherHere().session('partway', { pace: 0 }), reader, vocab: reader.loadVocabulary(ROOT), today: '2026-11-19' }), Refusal);
});
