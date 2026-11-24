// The one way a posting adapter asks an employer's site for anything.
//
// It says plainly what it is (one fixed user agent, nothing private, no
// browser imitation), reads each host's robots file once per run and obeys
// it, keeps a minimum interval between requests to a host, counts requests
// against a ceiling per employer, and stops at a refusal: a 401, 403 or 429,
// a challenge page or a connection reset ends that employer for the run.
// Nothing is retried, with these headers or any others.
//
// Used through a session per employer:
//   const fetcher = createFetcher();
//   const session = fetcher.session('boeing', { pace: 2000 });
//   const { json } = await session.get(url, { accept: 'json' });

export const USER_AGENT = 'ArchangelPostings/1.0 (+https://www.o-10.com; reads public job postings for a directory of US manufacturing jobs)';
/** The name robots files know us by: the product token of the user agent. */
const ROBOTS_TOKEN = 'archangelpostings';

/** How long a robots file may ask us to wait between requests before the employer is left for a person: seconds. */
const LONGEST_CRAWL_DELAY = 30;
const DEFAULT_PACE = 1000;
const DEFAULT_CEILING = 400;
const DEFAULT_TIMEOUT = 60_000;

/** The site said no: the employer is done for this run, and the run's log says why. */
export class Refusal extends Error {
  constructor(message, { url, status } = {}) {
    super(message);
    this.name = 'Refusal';
    this.refusal = true;
    this.url = url;
    this.status = status;
  }
}

/** The site answered, but not with the feed: the run fails for this employer and says so. */
export class FeedError extends Error {
  constructor(message, { url, status } = {}) {
    super(message);
    this.name = 'FeedError';
    this.url = url;
    this.status = status;
  }
}

/** The employer's requests for this run are spent: what is left is read on a later run. */
export class CeilingReached extends Error {
  constructor(ceiling) {
    super(`the ceiling of ${ceiling} requests for one employer in one run is reached`);
    this.name = 'CeilingReached';
    this.ceiling = ceiling;
  }
}

/** A platform's requests for this run are spent: its boards carry on at the next run, the oldest listing first. */
export class BudgetSpent extends Error {
  constructor(platform, budget) {
    super(`the run's budget of ${budget} requests to ${platform} is spent`);
    this.name = 'BudgetSpent';
    this.platform = platform;
    this.budget = budget;
  }
}

// ---------------------------------------------------------------------------
// robots.txt (RFC 9309)
// ---------------------------------------------------------------------------

/** A rule's path as a pattern: `*` is any run of characters, `$` at the end is the end. */
function pathPattern(path) {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path).split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/**
 * Reads a robots file for one crawler. The group naming our token is ours;
 * with none, the group for `*`; with neither, everything is allowed. Of the
 * rules that fit a path the longest wins, and Allow wins a tie. Returns
 * `{ allowed(path), delay }`, the delay in seconds (Crawl-delay) or null.
 */
export function parseRobots(text, token = ROBOTS_TOKEN) {
  const groups = [];
  let current = null;
  let namingAgents = false;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const at = line.indexOf(':');
    if (at < 0) continue;
    const field = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    if (field === 'user-agent') {
      if (!namingAgents) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      namingAgents = true;
    } else if (current && (field === 'allow' || field === 'disallow')) {
      namingAgents = false;
      // An empty Disallow forbids nothing.
      if (value !== '') current.rules.push({ allow: field === 'allow', path: value, pattern: pathPattern(value) });
    } else if (current && field === 'crawl-delay') {
      namingAgents = false;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.delay = seconds;
    } else {
      namingAgents = false;
    }
  }
  const ours = groups.filter((group) => group.agents.some((agent) => agent !== '*' && token.includes(agent)));
  const chosen = ours.length > 0 ? ours : groups.filter((group) => group.agents.includes('*'));
  const rules = chosen.flatMap((group) => group.rules);
  const delays = chosen.map((group) => group.delay).filter((delay) => delay !== null);
  return {
    delay: delays.length > 0 ? Math.max(...delays) : null,
    allowed(path) {
      let best = null;
      for (const rule of rules) {
        if (!rule.pattern.test(path)) continue;
        if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
      }
      return best ? best.allow : true;
    },
  };
}

const ALLOW_ALL = { delay: null, allowed: () => true };

// ---------------------------------------------------------------------------
// Telling a refusal from an answer
// ---------------------------------------------------------------------------

/** Marks of a page put in front of a site to turn robots away. */
const CHALLENGE = /cf-chl|cf_chl|just a moment\.\.\.|attention required|captcha|access denied|request unsuccessful|incapsula|perimeterx|px-captcha|akamai|are you a robot|unusual traffic|bot detection|datadome/i;

const RESET_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_ABORTED', 'ERR_SSL_PROTOCOL_ERROR']);

function isReset(error) {
  for (let e = error; e; e = e.cause) {
    if (RESET_CODES.has(e.code)) return true;
    if (/socket hang up|other side closed|ECONNRESET|terminated/i.test(String(e.message ?? ''))) return true;
  }
  return false;
}

function isTimeout(error) {
  for (let e = error; e; e = e.cause) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError' || e.code === 'UND_ERR_CONNECT_TIMEOUT' || e.code === 'UND_ERR_HEADERS_TIMEOUT') return true;
  }
  return false;
}

/** The part of an address that goes in a log line: where it was, never a query that could carry a token. */
function shown(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return String(url).slice(0, 120);
  }
}

/** The site a host belongs to, for stopping every employer on a platform that turned us away: its last two labels. */
export function platformOf(host) {
  return host.replace(/:\d+$/, '').split('.').slice(-2).join('.');
}

// ---------------------------------------------------------------------------
// The fetcher
// ---------------------------------------------------------------------------

/**
 * One fetcher per run. Options (all optional; tests set the last four):
 *   pace       the least milliseconds between two requests to one host
 *   ceiling    the most requests for one employer in one run
 *   budgets    { '<platform>': n }: the most requests to a platform (platformOf a host) in the whole run, across employers
 *   timeout    milliseconds to wait for an answer
 *   rewrite    (url) => url: sends requests elsewhere (a local server standing in for the feeds)
 *   unpaced    no waiting between requests: only ever with `rewrite`, where there is nobody to be polite to
 *   fetchImpl, sleep, now
 */
export function createFetcher({
  userAgent = USER_AGENT, pace = DEFAULT_PACE, ceiling = DEFAULT_CEILING, timeout = DEFAULT_TIMEOUT, budgets = {},
  rewrite = null, unpaced = false, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), now = Date.now,
} = {}) {
  const robots = new Map();      // host -> Promise of rules
  const lastAt = new Map();      // host -> when the last request to it was sent
  const turnedAway = new Map();  // platform -> the refusal that stopped it
  const totals = { requests: 0, bytes: 0, refusals: 0, platforms: {} };
  /** How many requests a platform has left in this run; Infinity for one with no budget. */
  const budgetLeft = (platform) => (platform in budgets ? Math.max(0, budgets[platform] - (totals.platforms[platform] ?? 0)) : Infinity);

  /** One request, paced, with no judgement on the answer. */
  async function send(session, url, { method = 'GET', body = null, accept = 'json' } = {}, wait = session.pace) {
    const host = new URL(url).host;
    const platform = platformOf(host);
    if (budgetLeft(platform) <= 0) throw new BudgetSpent(platform, budgets[platform]);
    if (session.requests >= session.ceiling) throw new CeilingReached(session.ceiling);
    const since = now() - (lastAt.get(host) ?? -Infinity);
    if (since < wait && !(unpaced && rewrite)) await sleep(wait - since);
    lastAt.set(host, now());
    session.requests += 1;
    totals.requests += 1;
    totals.platforms[platform] = (totals.platforms[platform] ?? 0) + 1;
    const headers = {
      'User-Agent': userAgent,
      Accept: accept === 'json' ? 'application/json' : accept === 'xml' ? 'application/xml, text/xml;q=0.9, */*;q=0.1'
        : accept === 'html' ? 'text/html, */*;q=0.1' : 'text/plain, */*;q=0.1',
    };
    if (body !== null) headers['Content-Type'] = 'application/json';
    let response;
    let text;
    try {
      response = await fetchImpl(rewrite ? rewrite(url) : url, {
        method, headers, body: body === null ? undefined : JSON.stringify(body), redirect: 'follow', signal: AbortSignal.timeout(timeout),
      });
      text = await response.text();
    } catch (error) {
      if (isTimeout(error)) throw new FeedError(`no answer from ${shown(url)} in ${Math.round(timeout / 1000)} s`, { url });
      if (isReset(error)) throw new Refusal(`the connection to ${shown(url)} was reset`, { url, status: 'reset' });
      throw new FeedError(`${shown(url)} could not be reached: ${error.cause?.code ?? error.cause?.message ?? error.message}`, { url });
    }
    totals.bytes += text.length;
    return { status: response.status, type: response.headers.get('content-type') ?? '', text };
  }

  /** The host's robots file, read once per run. A host with none allows everything. */
  function rulesFor(session, url) {
    const { protocol, host } = new URL(url);
    if (!robots.has(host)) {
      robots.set(host, (async () => {
        const address = `${protocol}//${host}/robots.txt`;
        const answer = await send(session, address, { accept: 'text' }, pace);
        // The stop rule holds for the robots file as for anything else.
        if (answer.status === 403 || answer.status === 429) throw new Refusal(`${shown(address)} answered ${answer.status}`, { url: address, status: answer.status });
        if (answer.status >= 500) throw new FeedError(`${shown(address)} answered ${answer.status}: the site's rules cannot be read, so nothing is asked of it`, { url: address, status: answer.status });
        // Any other answer that is not the file (404, 401, 410, 422): the host publishes no rules for robots.
        if (answer.status !== 200) return ALLOW_ALL;
        if (/<html|<!doctype/i.test(answer.text.slice(0, 500))) {
          if (CHALLENGE.test(answer.text)) throw new Refusal(`${shown(address)} answered with a challenge page`, { url: address, status: 'challenge' });
          return ALLOW_ALL;
        }
        const rules = parseRobots(answer.text);
        if (rules.delay !== null && rules.delay > LONGEST_CRAWL_DELAY) {
          throw new Refusal(`${shown(address)} asks for ${rules.delay} s between requests: too slow to read in a run`, { url: address, status: 'crawl-delay' });
        }
        return rules;
      })());
    }
    return robots.get(host);
  }

  function session(name, options = {}) {
    const self = {
      name,
      pace: Math.max(pace, options.pace ?? 0),
      ceiling: options.ceiling ?? ceiling,
      requests: 0,
      /** The refusal or failure that ended this employer's run, once there is one. */
      stopped: null,

      async request(url, opts = {}) {
        if (self.stopped) throw self.stopped;
        const { host, pathname, search } = new URL(url);
        try {
          const platform = turnedAway.get(platformOf(host));
          if (platform) throw new Refusal(`${platformOf(host)} turned this run away earlier (${platform.message}): not asked again`, { url, status: platform.status });
          const rules = await rulesFor(self, url);
          if (!rules.allowed(`${pathname}${search}`)) throw new Refusal(`robots.txt on ${host} disallows ${pathname}`, { url, status: 'robots' });
          const wait = Math.max(self.pace, (rules.delay ?? 0) * 1000);
          const answer = await send(self, url, opts, wait);
          const { status, type, text } = answer;
          if (status === 401 || status === 403 || status === 429) throw new Refusal(`${shown(url)} answered ${status}`, { url, status });
          const html = /text\/html/i.test(type) || /^\s*(<!doctype html|<html)/i.test(text.slice(0, 200));
          if (html && (opts.accept ?? 'json') !== 'text') {
            if (status === 503 || CHALLENGE.test(text.slice(0, 20_000))) throw new Refusal(`${shown(url)} answered with a challenge page`, { url, status: 'challenge' });
          }
          if (status === 404 || status === 410) throw new FeedError(`${shown(url)} answered ${status}`, { url, status });
          if (status < 200 || status >= 300) throw new FeedError(`${shown(url)} answered ${status}`, { url, status });
          // A career site whose listing is its pages (accept 'html') is expected to answer with one: a challenge page is still a refusal.
          if (html && !['text', 'html'].includes(opts.accept ?? 'json')) throw new FeedError(`${shown(url)} answered with a web page where the feed was expected`, { url, status });
          if ((opts.accept ?? 'json') === 'json') {
            try {
              return { status, text, json: JSON.parse(text) };
            } catch {
              throw new FeedError(`${shown(url)} did not answer with JSON`, { url, status });
            }
          }
          return { status, text };
        } catch (error) {
          // A posting that is gone between the list and its text is not the end of the board.
          if (error instanceof FeedError && (error.status === 404 || error.status === 410) && opts.missingIsFine) throw error;
          if (error instanceof CeilingReached || error instanceof BudgetSpent) throw error;
          self.stopped = error;
          if (error instanceof Refusal) {
            totals.refusals += 1;
            // A rate limit or a reset is the platform's word, not one board's.
            if (error.status === 429 || error.status === 'reset') turnedAway.set(platformOf(host), error);
          }
          throw error;
        }
      },
      get: (url, opts) => self.request(url, { ...opts, method: 'GET' }),
      post: (url, body, opts) => self.request(url, { ...opts, method: 'POST', body }),
    };
    return self;
  }

  return { session, totals, userAgent, budgetLeft, budgets };
}

/**
 * Sends every request to a local server that stands in for the feeds:
 * https://host/path?query becomes <base>/host/path?query. For tests and for
 * running the pipeline over saved boards; never set on a scheduled run.
 */
export function rewriteTo(base) {
  const root = base.replace(/\/+$/, '');
  return (url) => {
    const { host, pathname, search } = new URL(url);
    return `${root}/${host}${pathname}${search}`;
  };
}
