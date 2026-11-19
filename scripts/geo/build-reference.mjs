#!/usr/bin/env node
// Reduces the Census Bureau's reference files to the small lists the product
// keeps in git, each with a note of where it came from and when:
//
//   data/geo/counties.json              every county: code, name, state, its metro area, a point inside it
//   data/geo/metros.json                every metropolitan and micropolitan area: code, name, kind
//   data/industries/naics-2022.json     the 2022 NAICS codes for manufacturing (31-33), sector to national industry
//   data/industries/naics-concordance.json   other forms of a code that mean exactly one 2022 national industry
//
//   node scripts/geo/build-reference.mjs --fetch          download what is missing, then reduce
//   node scripts/geo/build-reference.mjs --dir <folder>   reduce files already downloaded there
//
// The downloads are kept in a folder outside the repository (the system's
// temporary folder unless --dir names one). Nothing here touches a database:
// the lists reach one through scripts/build-geo-sql.mjs. Behind a proxy,
// Node's fetch needs NODE_USE_ENV_PROXY=1.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { unzip, xlsNumbers, xlsxRows } from './lib/files.mjs';
import { DEFAULT_DIR, cite, sourceFile } from './lib/sources.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The states the product covers (shared/states.ts): the 50 and the District of Columbia. */
export const STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')
);

/** The Gazetteer's county file (tab-separated text) as [{ fips, name, state, lat, lng }], the product's states only. */
export function parseGazetteer(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0].split('\t').map((name) => name.trim());
  const at = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`The county file has no "${name}" column`);
    return i;
  };
  const col = { state: at('USPS'), fips: at('GEOID'), name: at('NAME'), lat: at('INTPTLAT'), lng: at('INTPTLONG') };
  const counties = [];
  for (const line of lines.slice(1)) {
    const f = line.split('\t').map((value) => value.trim());
    if (!STATES.has(f[col.state])) continue;
    if (!/^\d{5}$/.test(f[col.fips]) || !f[col.name]) throw new Error(`Not a county row: ${line}`);
    counties.push({ fips: f[col.fips], name: f[col.name], state: f[col.state], lat: Number(f[col.lat]), lng: Number(f[col.lng]) });
  }
  return counties.sort((a, b) => a.fips.localeCompare(b.fips));
}

/**
 * The delineation file's rows as { metros: [{ code, name, kind }], byCounty: Map(fips -> code) }.
 * A county belongs to at most one core based statistical area.
 */
export function parseDelineation(rows) {
  const head = rows.findIndex((row) => row[0] === 'CBSA Code');
  if (head === -1) throw new Error('The delineation file has no "CBSA Code" column');
  const at = (name) => {
    const i = rows[head].indexOf(name);
    if (i === -1) throw new Error(`The delineation file has no "${name}" column`);
    return i;
  };
  const col = { code: at('CBSA Code'), name: at('CBSA Title'), kind: at('Metropolitan/Micropolitan Statistical Area'), state: at('FIPS State Code'), county: at('FIPS County Code') };
  const metros = new Map();
  const byCounty = new Map();
  for (const row of rows.slice(head + 1)) {
    if (!/^\d{5}$/.test(row[col.code] ?? '')) continue; // the notes under the table
    const kind = /^Metropolitan/.test(row[col.kind]) ? 'metropolitan' : /^Micropolitan/.test(row[col.kind]) ? 'micropolitan' : null;
    if (!kind) throw new Error(`Neither metropolitan nor micropolitan: ${row.join(' | ')}`);
    metros.set(row[col.code], { code: row[col.code], name: row[col.name].trim(), kind });
    const fips = row[col.state].padStart(2, '0') + row[col.county].padStart(3, '0');
    if (byCounty.has(fips) && byCounty.get(fips) !== row[col.code]) throw new Error(`County ${fips} is listed in two areas`);
    byCounty.set(fips, row[col.code]);
  }
  return { metros: [...metros.values()].sort((a, b) => a.code.localeCompare(b.code)), byCounty };
}

const isManufacturing = (code) => /^3[123]/.test(code);

/** The 2022 code list's rows as the manufacturing codes: [{ code, title, parent }], the sector ('31-33') first. */
export function parseNaics(rows) {
  const codes = [];
  for (const row of rows) {
    const code = String(row[1] ?? '').trim();
    const title = String(row[2] ?? '').replace(/\s+/g, ' ').trim();
    if (code !== '31-33' && !(/^\d{3,6}$/.test(code) && isManufacturing(code))) continue;
    if (!title) throw new Error(`NAICS ${code} has no title`);
    codes.push({ code, title, parent: code === '31-33' ? null : code.length === 3 ? '31-33' : code.slice(0, -1) });
  }
  const known = new Set(codes.map((entry) => entry.code));
  for (const entry of codes) {
    if (entry.parent && !known.has(entry.parent)) throw new Error(`NAICS ${entry.code} has no parent in the list`);
  }
  return codes.sort((a, b) => (a.code === '31-33' ? -1 : b.code === '31-33' ? 1 : a.code.localeCompare(b.code)));
}

/** A concordance's rows ([newer code, ..., older code, ...]) as Map(older code -> Set of newer codes). */
export function olderToNewer(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row) continue;
    const newer = String(row[0] ?? '').trim();
    const older = String(row[2] ?? '').trim();
    if (!/^\d{6}$/.test(newer) || !/^\d{6}$/.test(older)) continue;
    if (!map.has(older)) map.set(older, new Set());
    map.get(older).add(newer);
  }
  return map;
}

/**
 * Every other form of a code that means exactly one 2022 national industry
 * in manufacturing: [{ from, to, basis }].
 *
 * - A shorter 2022 code with only one national industry under it ('32411'
 *   is 324110): basis 'only'.
 * - A six-digit code of an earlier edition that is not a 2022 code, when all
 *   of it went to one 2022 industry: basis '2017', '2012' or '2007', the
 *   newest edition that has the code. One that was split between industries
 *   is left out: nothing says which part a plant is.
 *
 * `codes` is parseNaics's list; `all2022` is every six-digit 2022 code of
 * any sector; each `to20xx` is that edition's codes mapped to the next
 * edition's (olderToNewer).
 */
export function buildConcordance({ codes, all2022, to2022, to2017, to2012 }) {
  const national = new Set(codes.filter((entry) => entry.code.length === 6).map((entry) => entry.code));
  const out = [];
  for (const entry of codes) {
    if (entry.code.length === 6 || entry.code === '31-33') continue;
    const under = [...national].filter((code) => code.startsWith(entry.code));
    if (under.length === 1) out.push({ from: entry.code, to: under[0], basis: 'only' });
  }
  const step = (codesIn, map) => {
    const next = new Set();
    for (const code of codesIn ?? []) for (const target of map.get(code) ?? []) next.add(target);
    return next;
  };
  const editions = [
    ['2017', to2022, (code) => to2022.get(code)],
    ['2012', to2017, (code) => step(to2017.get(code), to2022)],
    ['2007', to2012, (code) => step(step(to2012.get(code), to2017), to2022)],
  ];
  const seen = new Set();
  for (const [basis, map, targetsOf] of editions) {
    for (const from of [...map.keys()].sort()) {
      // A code a newer edition also has is read as that edition's.
      if (seen.has(from)) continue;
      seen.add(from);
      if (all2022.has(from)) continue;
      const targets = [...targetsOf(from)];
      if (targets.length === 1 && national.has(targets[0])) out.push({ from, to: targets[0], basis });
    }
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

const oneRowPerLine = (head, key, rows) =>
  `{\n${Object.entries(head)
    .map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')},\n`)
    .join('')}  ${JSON.stringify(key)}: [\n${rows.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]\n}\n`;

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const dir = option('--dir') ?? DEFAULT_DIR;
  const read = (key) => sourceFile(key, { dir, fetchMissing: args.includes('--fetch') });
  const retrieved = option('--retrieved') ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retrieved)) throw new Error('--retrieved takes a date, such as 2026-11-19');

  // Counties and metro areas.
  const gazetteer = [...unzip(await read('counties')).entries()].find(([name]) => name.endsWith('.txt'));
  if (!gazetteer) throw new Error('The county archive holds no text file');
  const listed = parseGazetteer(gazetteer[1].toString('utf8'));
  const { metros, byCounty } = parseDelineation(xlsxRows(await read('metros')));
  const fipsListed = new Set(listed.map((county) => county.fips));
  const counties = listed.map(({ fips, name, state, lat, lng }) => ({ fips, name, state, cbsa: byCounty.get(fips) ?? null, lat, lng }));
  const used = new Set(counties.map((county) => county.cbsa).filter(Boolean));
  const metrosKept = metros.filter((metro) => used.has(metro.code));
  // A delineated county the county list does not have would be a mismatch of editions.
  const strangers = [...byCounty.keys()].filter((fips) => !fipsListed.has(fips) && !fips.startsWith('72'));
  if (strangers.length > 0) throw new Error(`The delineation file names counties the county list does not have: ${strangers.join(', ')}`);

  // NAICS and the other forms of a code.
  const naicsRows = xlsxRows(await read('naics'));
  const codes = parseNaics(naicsRows);
  const concordance = buildConcordance({
    codes,
    all2022: new Set(naicsRows.map((row) => String(row[1] ?? '').trim()).filter((code) => /^\d{6}$/.test(code))),
    to2022: olderToNewer(xlsxRows(await read('naics2017'))),
    to2017: olderToNewer(xlsxRows(await read('naics2012'))),
    to2012: olderToNewer(xlsNumbers(await read('naics2007'))),
  });

  await mkdir(path.join(ROOT, 'data', 'geo'), { recursive: true });
  const write = async (file, text) => {
    await writeFile(path.join(ROOT, file), text);
    console.log(`wrote ${file}`);
  };
  await write(
    'data/geo/counties.json',
    oneRowPerLine(
      {
        note: 'Every county and county equivalent of the 50 states and the District of Columbia. fips: the five-digit code (state, then county). name: as the Census Bureau writes it. cbsa: the metropolitan or micropolitan area it belongs to (data/geo/metros.json), null for a county in none. lat, lng: a point inside the county (the Bureau\'s internal point), used to check a boundary file. Connecticut is its nine planning regions, as the Bureau and the statistics published by county have had it since 2022. Written by scripts/geo/build-reference.mjs; loaded by scripts/build-geo-sql.mjs.',
        sources: [cite('counties', retrieved), cite('metros', retrieved)],
      },
      'counties',
      counties
    )
  );
  await write(
    'data/geo/metros.json',
    oneRowPerLine(
      {
        note: 'Core based statistical areas, as delineated by the Office of Management and Budget in July 2023: the metropolitan and micropolitan areas that hold at least one county of the 50 states and the District of Columbia. Written by scripts/geo/build-reference.mjs; loaded by scripts/build-geo-sql.mjs.',
        sources: [cite('metros', retrieved)],
      },
      'metros',
      metrosKept
    )
  );
  await write(
    'data/industries/naics-2022.json',
    oneRowPerLine(
      {
        note: 'The 2022 North American Industry Classification System for manufacturing: the sector (31-33), its 21 subsectors, and every industry group, industry and national industry under them. parent is the code one level up, so a six-digit code rolls up to its subsector (the 21 in shared/industry.ts). Written by scripts/geo/build-reference.mjs; loaded by scripts/build-geo-sql.mjs.',
        sources: [cite('naics', retrieved)],
      },
      'codes',
      codes
    )
  );
  await write(
    'data/industries/naics-concordance.json',
    oneRowPerLine(
      {
        note: "Other forms of a code that mean exactly one 2022 national industry in manufacturing. basis 'only': a shorter 2022 code with one national industry under it. basis '2017', '2012', '2007': a six-digit code of that edition that is not a 2022 code and went whole to one 2022 industry (through each later edition). A code that was split between industries is not listed. Written by scripts/geo/build-reference.mjs; loaded by scripts/build-geo-sql.mjs.",
        sources: [cite('naics', retrieved), cite('naics2017', retrieved), cite('naics2012', retrieved), cite('naics2007', retrieved)],
      },
      'codes',
      concordance
    )
  );
  const by = (basis) => concordance.filter((entry) => entry.basis === basis).length;
  console.log(
    `${counties.length} counties (${counties.filter((county) => county.cbsa).length} in a metro area), ${metrosKept.length} metro areas, ` +
      `${codes.length} NAICS codes (${codes.filter((entry) => entry.code.length === 6).length} national industries), ` +
      `${concordance.length} other forms (${by('only')} shorter, ${by('2017')} from 2017, ${by('2012')} from 2012, ${by('2007')} from 2007)`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`build-reference: ${error.message}`);
    process.exit(1);
  });
}
