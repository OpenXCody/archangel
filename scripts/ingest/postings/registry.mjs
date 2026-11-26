#!/usr/bin/env node
// The registry of employers' job boards: data/employers/boards.json.
//
// One line per employer: the company as our data names it, the hiring system
// its board runs on, and the board's token or address. Adding an employer is
// a line here, never code. An employer that is left out says why.
//
// A board that names its sites by their town alone ("Evendale", "Lynn": a
// Workday tenant's own names for its locations, which say no state) has them
// written out on its line by a person, `sites`: { "<the site as the board
// writes it>": "City, ST" }, a site only where the board uses it and as the
// town it is in (a place in another town's name says why: { "place":
// "City, ST", "why": "..." }). The runner reads a site so named as the place
// beside it; a site that is not on the line has no place, because a state is
// never guessed.
//
//   node scripts/ingest/postings/registry.mjs --check     holds the file to its shape; writes nothing
//
// The runner (scripts/ingest/run.mjs) reads it through `loadRegistry` and
// turns a line into an intake source with `sourceOf`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SYSTEMS } from './systems/index.mjs';
import { readPlaces } from './read/facts.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const REGISTRY_FILE = path.join(ROOT, 'data', 'employers', 'boards.json');

/** What a source of postings is called: the word before an employer's slug. */
export const SOURCE_PREFIX = 'postings-';

const LEFT_OUT = new Set(['refused', 'not verified', 'no adapter']);
const EMPLOYER_KEYS = new Set(['slug', 'employer', 'company', 'also', 'system', 'board', 'ceiling', 'sites', 'note']);
const LEFT_OUT_KEYS = new Set(['employer', 'why', 'what', 'when', 'system']);
const MOST_REQUESTS = 2000;

const text = (value) => typeof value === 'string' && value.trim() !== '' && value === value.trim();

/** A site's name as the runner matches it: its words, in any letter case. */
export const siteKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The place a line's `sites` writes beside a site: "City, ST", or { place: "City, ST", why } where it says why. */
export const sitePlace = (written) => (written && typeof written === 'object' && !Array.isArray(written) ? written.place : written);

/** A town's words as they are compared: lower case, Saint, Fort and Mount short, no punctuation, a space either side. */
const townWords = (value) =>
  ` ${String(value ?? '').toLowerCase().replace(/\bsaint\b/g, 'st').replace(/\bfort\b/g, 'ft').replace(/\bmount\b/g, 'mt').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * What is wrong with a line's `sites`, as sentences: each name once, each place one US city and state as "City, ST",
 * and its city the site's name or a part of it ("Evendale" is "Evendale, OH"). A site is written out only as the board
 * names it and as the town it is in: a place in another town's name (the town a factory is filed under, say) is
 * refused unless the line says why, `{ "place": "City, ST", "why": "..." }`.
 */
function siteProblems(sites) {
  if (!sites || typeof sites !== 'object' || Array.isArray(sites) || Object.keys(sites).length === 0) {
    return ['sites is an object of the board\'s names for its sites, each with its place as "City, ST"'];
  }
  const problems = [];
  const seen = new Set();
  for (const [name, written] of Object.entries(sites)) {
    if (!text(name)) problems.push(`sites: "${name}" is not a site's name`);
    else if (seen.has(siteKey(name))) problems.push(`sites: "${name}" is named twice`);
    seen.add(siteKey(name));
    const explained = written && typeof written === 'object' && !Array.isArray(written);
    if (explained) {
      for (const key of Object.keys(written)) if (key !== 'place' && key !== 'why') problems.push(`sites: "${name}": "${key}" is not something a site holds (its place and why)`);
      if (!text(written.why)) problems.push(`sites: "${name}" is written as an object, which is for a place that says why: its why is missing`);
    }
    const place = sitePlace(written);
    // The place is held to what the reader will read in it: exactly one US city and state, written as it reads.
    const read = typeof place === 'string' ? readPlaces(place, '', () => []) : [];
    if (read.length !== 1 || `${read[0].city}, ${read[0].state}` !== place) {
      problems.push(`sites: "${name}" is "${typeof place === 'string' ? place : JSON.stringify(written)}", which is not one US place written "City, ST"`);
    } else if (!explained && !townWords(name).includes(townWords(read[0].city))) {
      problems.push(`sites: "${name}" is written out as ${place}, whose city is not the site's name or in it: write the town the site is in, or say why ({ "place": "${place}", "why": "..." })`);
    }
  }
  return problems;
}

/** What a board must look like for each system, and why not when it does not. */
const BOARD = {
  greenhouse: (board) => /^[a-z0-9][a-z0-9_-]*$/i.test(board) || 'a Greenhouse board is its token, such as "spacex"',
  lever: (board) => /^[a-z0-9][a-z0-9_-]*$/i.test(board) || 'a Lever board is the company\'s name there, such as "hermeus"',
  ashby: (board) => /^[a-z0-9][a-z0-9_.-]*$/i.test(board) || 'an Ashby board is the company\'s name there, such as "saronic"',
  icims: (board) => /^[a-z0-9][a-z0-9-]*\.icims\.com$/.test(board) || 'an iCIMS board is the portal\'s host, such as "careers-gdeb.icims.com"',
  jibe: (board) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(board) || 'a Jibe board is the career site\'s host, such as "careers.rivian.com"',
  oracle: (board) => /^[a-z0-9.-]+\.oraclecloud\.com\/[A-Za-z0-9_-]+$/.test(board) || 'an Oracle board is "<host>/<site number>", such as "efds.fa.em5.oraclecloud.com/CX_1"',
  workday: (board) => /^https:\/\/[a-z0-9.-]+\.myworkdayjobs\.com\/wday\/cxs\/[^/]+\/[^/]+$/.test(board) || 'a Workday board is its address under /wday/cxs, such as "https://boeing.wd1.myworkdayjobs.com/wday/cxs/boeing/EXTERNAL_CAREERS"',
  'successfactors-site': (board) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(board) || 'a SuccessFactors career site is its host, such as "careers.huntingtoningalls.com"',
  successfactors: (board) => /^https:\/\/[a-z0-9.-]+\/[^\s]*$/.test(board) || 'a SuccessFactors board is the address of its feed, such as "https://jobs.deere.com/sitemap.xml"',
};

/** Every problem with a registry, as sentences. An empty list is a registry that can be run. */
export function checkRegistry(registry) {
  const problems = [];
  const say = (where, what) => problems.push(`${where}: ${what}`);
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return ['the file is not an object'];
  if (!Array.isArray(registry.employers)) say('employers', 'is not a list');
  if (!Array.isArray(registry.leftOut)) say('leftOut', 'is not a list');
  const slugs = new Set();
  const names = new Set();
  for (const [index, entry] of (Array.isArray(registry.employers) ? registry.employers : []).entries()) {
    const where = `employers[${index}]${text(entry?.slug) ? ` (${entry.slug})` : ''}`;
    if (!entry || typeof entry !== 'object') { say(where, 'is not an object'); continue; }
    for (const key of Object.keys(entry)) if (!EMPLOYER_KEYS.has(key)) say(where, `"${key}" is not something an employer's line holds`);
    if (!text(entry.slug) || !/^[a-z0-9][a-z0-9-]*$/.test(entry.slug)) say(where, 'slug is lower-case letters, digits and hyphens');
    else if (slugs.has(entry.slug)) say(where, 'the slug is used twice');
    else slugs.add(entry.slug);
    if (!text(entry.employer)) say(where, 'employer (the name the board goes by) is missing');
    else if (names.has(entry.employer.toLowerCase())) say(where, `${entry.employer} is listed twice`);
    else names.add(entry.employer.toLowerCase());
    if (!text(entry.company)) say(where, 'company (the company exactly as our data names it) is missing');
    if (entry.also !== undefined) {
      if (!Array.isArray(entry.also) || entry.also.length === 0 || !entry.also.every(text)) say(where, 'also is a list of company names');
      else if (new Set(entry.also.map((name) => name.toLowerCase())).size !== entry.also.length || entry.also.some((name) => name.toLowerCase() === String(entry.company).toLowerCase())) {
        say(where, 'also repeats a company');
      }
    }
    if (!text(entry.system)) say(where, 'system is missing');
    else if (!Object.hasOwn(SYSTEMS, entry.system)) say(where, `no adapter reads the system "${entry.system}" (there are: ${Object.keys(SYSTEMS).sort().join(', ')})`);
    else if (!text(entry.board)) say(where, 'board is missing');
    else {
      const fits = BOARD[entry.system](entry.board);
      if (fits !== true) say(where, fits);
      else if (!/^https:\/\//.test(SYSTEMS[entry.system].feed(entry.board))) say(where, 'the board\'s feed is not an https address');
    }
    if (entry.ceiling !== undefined && !(Number.isInteger(entry.ceiling) && entry.ceiling >= 1 && entry.ceiling <= MOST_REQUESTS)) {
      say(where, `ceiling is a whole number of requests from 1 to ${MOST_REQUESTS}`);
    }
    if (entry.sites !== undefined) for (const problem of siteProblems(entry.sites)) say(where, problem);
    if (entry.note !== undefined && !text(entry.note)) say(where, 'note is text');
  }
  for (const [index, entry] of (Array.isArray(registry.leftOut) ? registry.leftOut : []).entries()) {
    const where = `leftOut[${index}]${text(entry?.employer) ? ` (${entry.employer})` : ''}`;
    if (!entry || typeof entry !== 'object') { say(where, 'is not an object'); continue; }
    for (const key of Object.keys(entry)) if (!LEFT_OUT_KEYS.has(key)) say(where, `"${key}" is not something a left-out line holds`);
    if (!text(entry.employer)) say(where, 'employer is missing');
    else if (names.has(entry.employer.toLowerCase())) say(where, `${entry.employer} is also among the employers that are read`);
    if (!LEFT_OUT.has(entry.why)) say(where, `why is one of: ${[...LEFT_OUT].join(', ')}`);
    if (!text(entry.what)) say(where, 'what (what refused, or what is missing) is missing');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.when ?? '')) say(where, 'when is a day, such as 2026-11-19');
  }
  return problems;
}

/** The registry, checked. Throws every problem at once. */
export function loadRegistry(file = REGISTRY_FILE) {
  const registry = JSON.parse(readFileSync(file, 'utf8'));
  const problems = checkRegistry(registry);
  if (problems.length > 0) throw new Error(`${path.basename(file)} is not usable:\n  ${problems.join('\n  ')}`);
  return registry;
}

/** An employer's line as the intake source it is. */
export function sourceOf(entry) {
  const system = SYSTEMS[entry.system];
  return {
    slug: `${SOURCE_PREFIX}${entry.slug}`,
    name: `${entry.employer} job postings`,
    publisher: entry.employer,
    url: system.feed(entry.board),
    terms: "The employer's public careers feed. Facts and a link are kept, never the posting's text.",
    howFetched: `${system.name}. ${system.how}`,
    kind: 'job',
    refSource: `POSTINGS_${entry.slug.toUpperCase().replace(/-/g, '_')}`,
    // What a source of plants chooses; a source of jobs has no use for them.
    scope: 'all', unmatched: 'hold', fill: 'empty', rank: 50,
    system: entry.system,
    company: entry.company,
    also: entry.also ?? [],
  };
}

/** The employer's line a source's slug names, or null. */
export function entryOf(registry, slug) {
  if (!slug.startsWith(SOURCE_PREFIX)) return null;
  return registry.employers.find((entry) => entry.slug === slug.slice(SOURCE_PREFIX.length)) ?? null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--')) ?? REGISTRY_FILE;
  try {
    const registry = loadRegistry(file);
    const bySystem = {};
    for (const entry of registry.employers) bySystem[entry.system] = (bySystem[entry.system] ?? 0) + 1;
    console.log(`${path.basename(file)}: ${registry.employers.length} employers are read (${Object.entries(bySystem).sort().map(([system, n]) => `${system} ${n}`).join(', ')}); ` +
      `${registry.leftOut.length} are left out (${[...LEFT_OUT].map((why) => `${why} ${registry.leftOut.filter((entry) => entry.why === why).length}`).join(', ')}).`);
    if (!process.argv.includes('--check')) console.log('Nothing is written: this only checks. The runner reads the file itself.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
