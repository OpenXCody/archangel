// The EPA's ECHO Exporter: one line per regulated facility in the country,
// with its Facility Registry Service id, name, address, coordinates and
// industry codes. Most of our plants came from it and carry its registry id,
// so it is read by id: it fills what those plants lack and adds nothing.
//
// The file    https://echo.epa.gov/files/echodownloads/echo_exporter.zip
//             (about 450 MB zipped, 2.2 GB as one CSV, refreshed weekly;
//             listed at https://echo.epa.gov/tools/data-downloads)
// Its terms   EPA data is in the public domain (17 U.S.C. 105), with no
//             warranty: https://edg.epa.gov/EPA_Data_License.html. No key, no
//             login. echo.epa.gov/robots.txt allows /files/ and asks for 10
//             seconds between requests; a fetch is one request.
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvRows } from '../lib/csv.mjs';
import { NOT_COVERED } from '../../build-employers-sql.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE_URL = 'https://echo.epa.gov/files/echodownloads/echo_exporter.zip';

export const source = {
  slug: 'epa-echo',
  name: 'EPA ECHO Exporter',
  publisher: 'US Environmental Protection Agency',
  url: 'https://echo.epa.gov/tools/data-downloads',
  terms: 'Public domain (17 U.S.C. 105), no warranty. No key or login. One request per fetch; the site asks for 10 seconds between requests.',
  howFetched: `One zip, refreshed weekly: ${FILE_URL}`,
  kind: 'factory',
  // The name the registry ids have been kept under since the first import.
  refSource: 'EPA_ECHO',
  // Only records whose registry id we already hold are staged; the rest are counted.
  scope: 'known',
  // Nothing is added: a manufacturing facility we do not list is the owner's decision.
  unmatched: 'hold',
  // It fills a fact only where the plant has none.
  fill: 'empty',
  // A regulator's registry: good for where a site is and what industry it reports, below research and people.
  rank: 40,
  ranks: {},
};

/** Raised when what the adapter makes of a record changes, so every record is read again. */
export const version = 1;

/** The columns kept as the source said them. */
const KEPT = [
  'REGISTRY_ID', 'FAC_NAME', 'FAC_STREET', 'FAC_CITY', 'FAC_STATE', 'FAC_ZIP', 'FAC_COUNTY', 'FAC_FIPS_CODE',
  'FAC_LAT', 'FAC_LONG', 'FAC_ACCURACY_METERS', 'FAC_COLLECTION_METHOD', 'FAC_ACTIVE_FLAG', 'FAC_NAICS_CODES', 'FAC_SIC_CODES',
];
const NEEDED = ['REGISTRY_ID', 'FAC_NAME', 'FAC_STATE', 'FAC_LAT', 'FAC_LONG', 'FAC_NAICS_CODES'];

let industries = null;
/** The 21 manufacturing industries by their three digits: { '311': 'Food Manufacturing', ... }. */
export async function industryNames() {
  if (!industries) {
    const file = JSON.parse(await readFile(path.join(HERE, '..', '..', '..', 'data', 'industries', 'industries.json'), 'utf8'));
    industries = Object.fromEntries(file.industries.map((industry) => [industry.code, industry.name]));
  }
  return industries;
}

/** The industry codes in a cell: "332710 332999 811310" as a list, without anything that is not a code. */
export function codes(cell) {
  return String(cell ?? '').split(/[\s,;]+/).filter((code) => /^\d{2,6}$/.test(code));
}

const isManufacturing = (code) => /^3[123]/.test(code);
const isCovered = (code) => !NOT_COVERED.some((prefix) => code.startsWith(prefix));

/**
 * The code a plant is filed under, from the codes the registry lists for it
 * (in number order, not by importance). Only manufacturing codes the product
 * covers count. The industry most of them name wins, a tie going to the lower
 * number; within it, the first six-digit code, else the longest. Null when
 * there is none, with why.
 */
export function chooseNaics(list) {
  if (list.length === 0) return { naics: null, note: 'the registry lists no industry code' };
  const manufacturing = list.filter(isManufacturing);
  if (manufacturing.length === 0) return { naics: null, note: `the registry lists only codes outside manufacturing: ${list.join(' ')}` };
  const covered = manufacturing.filter(isCovered);
  if (covered.length === 0) return { naics: null, note: `construction materials (${manufacturing.join(' ')}), which the map does not cover` };
  const votes = new Map();
  for (const code of covered) votes.set(code.slice(0, 3), (votes.get(code.slice(0, 3)) ?? 0) + 1);
  const [subsector] = [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const inIt = covered.filter((code) => code.startsWith(subsector));
  const naics = inIt.find((code) => code.length === 6) ?? [...inIt].sort((a, b) => b.length - a.length)[0];
  return { naics, note: null };
}

/** "787541234" and "78754-1234" as "78754-1234", "78754" as it is; null for anything that does not start with five digits. */
export function zip(cell) {
  const text = String(cell ?? '').trim();
  const match = /^(\d{5})(?:-?(\d{4}))?(?!\d)/.exec(text);
  return match ? (match[2] ? `${match[1]}-${match[2]}` : match[1]) : null;
}

/** A coordinate as text of at most six decimal places, or null when it is not one in range. */
function coordinate(cell, limit) {
  const text = String(cell ?? '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || Math.abs(value) > limit || value === 0) return null;
  return String(Math.round(value * 1e6) / 1e6);
}

const text = (cell) => {
  const value = String(cell ?? '').replace(/\s+/g, ' ').trim();
  return value === '' ? null : value;
};

/**
 * Reads the file's rows: a .zip is read through `unzip -p` (its one CSV), a
 * .csv directly. Yields each row as { column: text } for the columns in
 * `KEPT`, without the empty ones.
 */
export async function* rows(file) {
  let stream;
  let child = null;
  if (/\.zip$/i.test(file)) {
    child = spawn('unzip', ['-p', file], { stdio: ['ignore', 'pipe', 'inherit'] });
    stream = child.stdout;
  } else {
    stream = createReadStream(file);
  }
  let at = null;
  try {
    for await (const fields of csvRows(stream)) {
      if (!at) {
        at = KEPT.map((column) => [column, fields.indexOf(column)]);
        const missing = NEEDED.filter((column) => fields.indexOf(column) < 0);
        if (missing.length > 0) throw new Error(`The file is not the ECHO Exporter this adapter reads: it has no ${missing.join(', ')} column.`);
        continue;
      }
      const row = {};
      for (const [column, index] of at) {
        const value = index < 0 ? '' : (fields[index] ?? '').trim();
        if (value !== '') row[column] = value;
      }
      yield row;
    }
  } finally {
    if (child && child.exitCode === null) child.kill();
  }
}

/** The source's own id for a row, or null for a row that has none. */
export function idOf(row) {
  return /^\d{6,15}$/.test(row.REGISTRY_ID ?? '') ? row.REGISTRY_ID : null;
}

const STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));

/**
 * What a row we do not stage counts as, for the run's report: the labels are
 * tallied by distinct id. A manufacturing facility is one with a NAICS code
 * in 31 to 33; "listable" narrows that to what the product would list: a
 * code it covers, marked active, in the 50 states or DC, with coordinates.
 */
export function classify(row) {
  const list = codes(row.FAC_NAICS_CODES);
  if (!list.some(isManufacturing)) return [];
  const labels = ['manufacturing'];
  if (row.FAC_ACTIVE_FLAG === 'Y') labels.push('manufacturing, active');
  if (
    row.FAC_ACTIVE_FLAG === 'Y' && list.some((code) => isManufacturing(code) && isCovered(code)) && STATES.has(row.FAC_STATE) &&
    coordinate(row.FAC_LAT, 90) && coordinate(row.FAC_LONG, 180)
  ) {
    labels.push('manufacturing, listable');
  }
  return labels;
}

/**
 * One row as a staged record: `payload` is the row as the registry said it,
 * `facts` the same in the words intake_apply_record reads. `asOf` is the day
 * the file was published.
 */
export async function read(row, { asOf = null } = {}) {
  const names = await industryNames();
  const all = codes(row.FAC_NAICS_CODES);
  const { naics, note } = chooseNaics(all);
  const facts = {
    name: text(row.FAC_NAME),
    address: text(row.FAC_STREET),
    city: text(row.FAC_CITY),
    state: text(row.FAC_STATE),
    zip: zip(row.FAC_ZIP),
    latitude: coordinate(row.FAC_LAT, 90),
    longitude: coordinate(row.FAC_LONG, 180),
    naics,
    industry: naics ? names[naics.slice(0, 3)] ?? null : null,
    industryNote: note,
    naicsAll: all.length > 0 ? all : null,
    countyFips: /^\d{5}$/.test(row.FAC_FIPS_CODE ?? '') ? row.FAC_FIPS_CODE : null,
    // The flag is Y or nothing: a facility with no permit in force is left blank.
    active: row.FAC_ACTIVE_FLAG === 'Y',
    url: `https://echo.epa.gov/detailed-facility-report?fid=${row.REGISTRY_ID}`,
    asOf,
  };
  // A coordinate without its pair is no place.
  if (!facts.latitude || !facts.longitude) {
    facts.latitude = null;
    facts.longitude = null;
  }
  for (const key of Object.keys(facts)) if (facts[key] === null) delete facts[key];
  return { id: row.REGISTRY_ID, payload: row, facts };
}

/**
 * Downloads the file into `dir` (a folder outside the repository) with one
 * request, and writes beside it what was fetched: the address, when, and the
 * day the registry published it. Returns the file's path. Behind a proxy,
 * Node's fetch needs NODE_USE_ENV_PROXY=1.
 */
export async function fetchFile({ dir, log = console.log }) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'echo_exporter.zip');
  log(`fetch: ${FILE_URL}`);
  const response = await fetch(FILE_URL, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    // A refusal is the site's answer: it is reported, not worked around.
    throw new Error(`The EPA answered ${response.status} ${response.statusText}. Nothing was downloaded; the request is not repeated.`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  const published = response.headers.get('last-modified');
  const note = {
    url: FILE_URL,
    fetchedAt: new Date().toISOString(),
    published: published ? new Date(published).toISOString().slice(0, 10) : null,
    etag: response.headers.get('etag'),
    bytes: (await stat(file)).size,
  };
  await writeFile(`${file}.json`, `${JSON.stringify(note, null, 2)}\n`);
  log(`fetch: ${Math.round(note.bytes / 1e6)} MB, published ${note.published ?? 'on a day the EPA did not say'}`);
  return file;
}

/** The day the file is for: what the fetch noted beside it, else the day the file was last written. */
export async function asOfFile(file) {
  try {
    const note = JSON.parse(await readFile(`${file}.json`, 'utf8'));
    if (/^\d{4}-\d{2}-\d{2}$/.test(note.published ?? '')) return note.published;
  } catch {
    // No note beside it: a file brought here by hand.
  }
  return (await stat(file)).mtime.toISOString().slice(0, 10);
}
