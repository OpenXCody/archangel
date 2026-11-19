#!/usr/bin/env node
// Official employment by industry and state, from the Bureau of Labor
// Statistics' Quarterly Census of Employment and Wages (QCEW): open data, no
// key. It counts every establishment covered by unemployment insurance, so it
// is the nearest thing to a census of who works in each industry and where.
//
//   node scripts/ingest/qcew.mjs                 the latest complete year
//   node scripts/ingest/qcew.mjs --year 2025     that year
//   node scripts/ingest/qcew.mjs --from <dir>    read <dir>/<code>.csv instead of downloading
//
// It downloads one file per industry (the 21 subsectors named in
// data/industries/industries.json, and 31-33 for manufacturing as a whole):
// every area's annual averages for that industry. It keeps the private-sector
// rows for the nation and for each state the app knows, and writes
// data/industries/qcew-<year>.json with where the figures came from and when.
// Nothing here touches a database: the JSON reaches one through a generated
// migration (scripts/build-industry-stats-sql.mjs).
//
// A figure the Bureau withheld (to protect one employer's confidentiality) is
// null, never zero.
//
// Behind a proxy, Node's fetch needs NODE_USE_ENV_PROXY=1.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE_URL = (year, code) => `https://data.bls.gov/cew/data/api/${year}/a/industry/${code.replace('-', '_')}.csv`;

const MANUFACTURING = '31-33';

/** The Bureau's area codes for the states the app knows (shared/states.ts): FIPS, then three zeros. */
export const STATE_FIPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
};

/** One line of CSV as its fields. Quoted fields may hold commas and doubled quotes. */
function fields(line) {
  const out = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let value = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          value += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          value += line[i++];
        }
      }
      out.push(value);
      i++; // the comma
    } else {
      const end = line.indexOf(',', i);
      out.push(line.slice(i, end === -1 ? line.length : end));
      i = end === -1 ? line.length + 1 : end + 1;
    }
  }
  return out;
}

const whole = (text) => {
  const n = Number(text);
  return Number.isFinite(n) && text !== '' ? Math.round(n) : null;
};

/**
 * The rows of one industry's file that the app keeps: private sector
 * (ownership 5), all establishment sizes, annual, for the nation ("US") and
 * each known state. Returns [{ state, code, establishments, employment,
 * avgAnnualPay }]; a withheld figure (disclosure code "N") is null.
 */
export function parseQcew(csv, code) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const header = fields(lines[0]);
  const at = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`QCEW file for ${code} has no "${name}" column`);
    return i;
  };
  const col = {
    area: at('area_fips'),
    own: at('own_code'),
    industry: at('industry_code'),
    size: at('size_code'),
    qtr: at('qtr'),
    disclosure: at('disclosure_code'),
    establishments: at('annual_avg_estabs'),
    employment: at('annual_avg_emplvl'),
    pay: at('avg_annual_pay'),
  };
  const rows = [];
  for (const line of lines.slice(1)) {
    const f = fields(line);
    if (f[col.own] !== '5' || f[col.industry] !== code || f[col.size] !== '0' || f[col.qtr] !== 'A') continue;
    const area = f[col.area];
    const state = area === 'US000' ? 'US' : /^\d{2}000$/.test(area) ? STATE_FIPS[area.slice(0, 2)] : undefined;
    if (!state) continue;
    const withheld = f[col.disclosure].trim() !== '';
    rows.push({
      state,
      code,
      establishments: whole(f[col.establishments]),
      employment: withheld ? null : whole(f[col.employment]),
      avgAnnualPay: withheld ? null : whole(f[col.pay]),
    });
  }
  return rows;
}

/** A year is complete when the nation's figure is published and (nearly) every state has a row. */
export function isComplete(rows) {
  const nation = rows.find((row) => row.state === 'US');
  return Boolean(nation && nation.employment !== null && nation.employment > 0) && rows.filter((row) => row.state !== 'US').length >= 50;
}

async function download(year, code) {
  const response = await fetch(FILE_URL(year, code), { headers: { 'User-Agent': 'qcew-ingest' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${FILE_URL(year, code)} answered ${response.status}`);
  return response.text();
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const from = option('--from');
  const asked = option('--year');
  if (asked !== undefined && !/^\d{4}$/.test(asked)) throw new Error('--year takes a four-digit year');

  const catalogue = JSON.parse(await readFile(path.join(ROOT, 'data', 'industries', 'industries.json'), 'utf8'));
  const codes = [MANUFACTURING, ...catalogue.industries.map((industry) => industry.code)];
  const read = async (year, code) =>
    from ? readFile(path.join(from, `${code.replace('-', '_')}.csv`), 'utf8').catch(() => null) : download(year, code);

  // The latest complete year: this year's annual file does not exist until
  // the middle of the next, so start one back and walk down.
  const thisYear = new Date().getFullYear();
  const candidates = asked ? [Number(asked)] : [thisYear - 1, thisYear - 2, thisYear - 3];
  let year = null;
  let whole31 = null;
  for (const candidate of candidates) {
    const csv = await read(candidate, MANUFACTURING);
    const rows = csv ? parseQcew(csv, MANUFACTURING) : [];
    if (isComplete(rows)) {
      year = candidate;
      whole31 = rows;
      break;
    }
    console.log(`qcew: ${candidate} is ${csv ? 'not complete' : 'not published'}`);
  }
  if (year === null) throw new Error(`No complete year among ${candidates.join(', ')}`);

  const rows = [...whole31];
  for (const code of codes.slice(1)) {
    const csv = await read(year, code);
    if (!csv) throw new Error(`No ${year} file for industry ${code}`);
    const kept = parseQcew(csv, code);
    if (!kept.some((row) => row.state === 'US')) throw new Error(`The ${year} file for industry ${code} has no national row`);
    rows.push(...kept);
    console.log(`qcew: ${code} ${kept.length} rows`);
  }
  rows.sort((a, b) => a.code.localeCompare(b.code) || Number(b.state === 'US') - Number(a.state === 'US') || a.state.localeCompare(b.state));

  const out = {
    source: {
      name: 'Quarterly Census of Employment and Wages',
      publisher: 'U.S. Bureau of Labor Statistics',
      url: 'https://www.bls.gov/cew/',
      files: FILE_URL(year, '<industry code>'),
      year,
      retrieved: new Date().toISOString().slice(0, 10),
      note: 'Annual averages, private sector, all establishment sizes. "US" is the nation; other rows are states. establishments: annual_avg_estabs. employment: annual_avg_emplvl. avgAnnualPay: avg_annual_pay, in dollars. null: withheld by the Bureau (disclosure code N).',
    },
    rows,
  };
  const file = path.join(ROOT, 'data', 'industries', `qcew-${year}.json`);
  // One row per line: a later year's file then diffs against this one.
  const text = `{\n  "source": ${JSON.stringify(out.source, null, 2).replace(/\n/g, '\n  ')},\n  "rows": [\n${rows.map((row) => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]\n}\n`;
  await writeFile(file, text);
  const withheld = rows.filter((row) => row.employment === null).length;
  console.log(`qcew: wrote ${path.relative(ROOT, file)}: ${rows.length} rows for ${year} (${withheld} with employment withheld)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`qcew: ${error.message}`);
    process.exit(1);
  });
}
