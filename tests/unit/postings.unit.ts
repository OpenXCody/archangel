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
import { CeilingReached, FeedError, Refusal, USER_AGENT, createFetcher, parseRobots, platformOf, rewriteTo } from '../../scripts/ingest/postings/fetch.mjs';
// @ts-expect-error a plain script, no types
import { SYSTEMS } from '../../scripts/ingest/postings/systems/index.mjs';
// @ts-expect-error a plain script, no types
import { countryFacet, postedDay } from '../../scripts/ingest/postings/systems/workday.mjs';
// @ts-expect-error a plain script, no types
import { unescapeHtml, webAddress } from '../../scripts/ingest/postings/systems/shared.mjs';
// @ts-expect-error a plain script, no types
import { collect } from '../../scripts/ingest/postings/jobs.mjs';
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
  const listed: Listed[] = await SYSTEMS[system].list(boardOf, tools);
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

test('SuccessFactors: one feed with every posting; the place in the title is taken out of it', async () => {
  const { listed, session } = await read('successfactors', 'https://jobs.deere.com/sitemap.xml');
  wellFormed(listed, true);
  assert.equal(session.requests, 2);
  assert.equal(listed[0].title, 'Controls Engineer');
  assert.equal(listed[0].location, 'URBANDALE, Iowa, US, 50131-3155');
  assert.deepEqual(listed.map((posting) => posting.country), ['US', 'US', 'NL']);
  assert.match(listed[0].text ?? '', /^<p>/);
});

test('a feed whose shape changed fails for that employer and says what was missing', async () => {
  put('greenhouse/changed.json', JSON.stringify({ postings: [] }));
  const session: Session = fetcherHere().session('changed');
  await assert.rejects(
    SYSTEMS.greenhouse.list('changed', { get: session.get, post: session.post, today: '2026-11-19' }),
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

test('the stand-in reader keeps a posting whose title is a career, and reads a plain place', () => {
  const vocab = reader.loadVocabulary(ROOT);
  const reading = reader.readPosting({ employer: 'Acme', title: 'welder', location: 'Franklin, LA', text: '' }, vocab);
  assert.deepEqual(reading.career, { title: 'Welder', how: 'title', matched: 'welder' });
  assert.deepEqual(reading.places, [{ city: 'Franklin', state: 'LA' }]);
  assert.equal(reader.readPosting({ employer: 'Acme', title: 'Deputy Program Manager', location: 'Austin, Texas, United States', text: '' }, vocab).career, null);
  assert.deepEqual(reader.readPosting({ employer: 'Acme', title: 'Welder', location: 'USA - Berkeley, MO', text: '' }, vocab).places, [{ city: 'Berkeley', state: 'MO' }]);
  assert.deepEqual(reader.readPosting({ employer: 'Acme', title: 'Welder', location: 'Melbourne, Victoria, Australia', text: '' }, vocab).places, []);
});

test('only postings that are one of our careers at a US place are kept, as facts and a link: never the text', async () => {
  const session: Session = createFetcher({ rewrite: rewriteTo(savedBase), pace: 0 }).session('saronic', { pace: 0 });
  const entry = { slug: 'saronic', employer: 'Saronic', company: 'Saronic', system: 'ashby', board: 'saronic' };
  const collected = await collect(noRows, entry, { session, reader, vocab: reader.loadVocabulary(ROOT), today: '2026-11-19' });
  assert.deepEqual(collected.counts, { read: 4, abroad: 0, notCareer: 1, noPlace: 0, noAddress: 0, vanished: 0, texts: 0, kept: 3 });
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
      places: /Auburn/.test(posting.location) ? [{ city: 'Auburn', state: 'WA' }] : /Algona/.test(posting.location) ? [{ city: 'Algona', state: 'WA' }] : [],
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
  assert.equal(third.collected.stopped, null);
});
