// Builds the migration that gives plants their geography and industry keys:
// the hand-written schema (scripts/geo/keys-schema.sql), then the reference
// rows from the reduced official lists, then one year of county statistics.
//
//   node scripts/build-geo-sql.mjs --out migrations/0044_geo_keys.sql
//       data/geo/metros.json, data/geo/counties.json,
//       data/industries/naics-2022.json, data/industries/naics-concordance.json
//       and data/industries/qcew-2025-counties.json (--stats names another)
//
//   node scripts/build-geo-sql.mjs --stats-only data/industries/qcew-<year>-counties.json --out migrations/00NN_county_stats.sql
//       a later year of county statistics alone: a new migration; the year before stays in the table
//
// The migration is safe to run again: tables and columns are added only when
// missing, rows are matched by key and brought up to what the files say, and
// nothing is deleted. It writes no county on any plant: that is computed from
// coordinates by scripts/geo/assign-keys.mjs, outside the build. Once the
// file has been applied anywhere, a change goes out as a new migration.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const q = (text) => (text === null || text === undefined ? 'NULL' : `'${String(text).replace(/'/g, "''")}'`);
const n = (value) => (value === null || value === undefined ? 'NULL' : String(Math.round(Number(value))));

const STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')
);

/** Refuses a list that would load wrongly; returns nothing. */
export function checkReference({ metros, counties, naics, concordance }) {
  const unique = (values, what) => {
    const seen = new Set();
    for (const value of values) {
      if (seen.has(value)) throw new Error(`${what} ${value} is listed twice`);
      seen.add(value);
    }
    return seen;
  };
  const metroCodes = unique(metros.map((metro) => metro.code), 'Metro area');
  for (const metro of metros) {
    if (!/^\d{5}$/.test(metro.code) || !metro.name || !['metropolitan', 'micropolitan'].includes(metro.kind)) throw new Error(`Not a metro area: ${JSON.stringify(metro)}`);
  }
  unique(counties.map((county) => county.fips), 'County');
  for (const county of counties) {
    if (!/^\d{5}$/.test(county.fips) || !county.name || !STATES.has(county.state)) throw new Error(`Not a county: ${JSON.stringify(county)}`);
    if (county.cbsa !== null && !metroCodes.has(county.cbsa)) throw new Error(`County ${county.fips} is in a metro area that is not listed: ${county.cbsa}`);
  }
  const codes = unique(naics.map((entry) => entry.code), 'NAICS code');
  for (const entry of naics) {
    if (!(entry.code === '31-33' || /^3[123]\d{1,4}$/.test(entry.code)) || !entry.title) throw new Error(`Not a manufacturing NAICS code: ${JSON.stringify(entry)}`);
    if (entry.code === '31-33' ? entry.parent !== null : !codes.has(entry.parent)) throw new Error(`NAICS ${entry.code} has no parent in the list`);
  }
  unique(concordance.map((entry) => entry.from), 'Another form of a code');
  for (const entry of concordance) {
    if (!/^\d{3,6}$/.test(entry.from) || !['only', '2017', '2012', '2007'].includes(entry.basis)) throw new Error(`Not another form of a code: ${JSON.stringify(entry)}`);
    if (!/^\d{6}$/.test(entry.to) || !codes.has(entry.to)) throw new Error(`${entry.from} stands for ${entry.to}, which is not a 2022 national industry in the list`);
    if (entry.from.length === 6 && codes.has(entry.from)) throw new Error(`${entry.from} is a 2022 national industry itself`);
  }
}

/** The reference rows as SQL statements. */
export function referenceSql({ metros, counties, naics, concordance }) {
  checkReference({ metros, counties, naics, concordance });
  // The sector's code is two digits written as a range; every other level is its length.
  const level = (code) => (code === '31-33' ? 2 : code.length);
  return [
    `-- ${metros.length} metro areas.`,
    'INSERT INTO "metros" ("code", "name", "kind") VALUES',
    metros.map((metro) => `  (${q(metro.code)}, ${q(metro.name)}, ${q(metro.kind)})`).join(',\n'),
    'ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "kind" = EXCLUDED."kind";',
    '',
    `-- ${counties.length} counties.`,
    'INSERT INTO "counties" ("fips", "name", "state", "cbsa_code") VALUES',
    counties.map((county) => `  (${q(county.fips)}, ${q(county.name)}, ${q(county.state)}, ${q(county.cbsa)})`).join(',\n'),
    'ON CONFLICT ("fips") DO UPDATE SET "name" = EXCLUDED."name", "state" = EXCLUDED."state", "cbsa_code" = EXCLUDED."cbsa_code";',
    '',
    `-- ${naics.length} NAICS codes.`,
    'INSERT INTO "naics" ("code", "title", "level", "parent") VALUES',
    naics.map((entry) => `  (${q(entry.code)}, ${q(entry.title)}, ${level(entry.code)}, ${q(entry.parent)})`).join(',\n'),
    'ON CONFLICT ("code") DO UPDATE SET "title" = EXCLUDED."title", "level" = EXCLUDED."level", "parent" = EXCLUDED."parent";',
    '',
    `-- ${concordance.length} other forms of a code.`,
    'INSERT INTO "naics_concordance" ("from_code", "code", "basis") VALUES',
    concordance.map((entry) => `  (${q(entry.from)}, ${q(entry.to)}, ${q(entry.basis)})`).join(',\n'),
    'ON CONFLICT ("from_code") DO UPDATE SET "code" = EXCLUDED."code", "basis" = EXCLUDED."basis";',
    '',
    '-- Every plant\'s clean code, from what is stored: one pass, and only rows that would change.',
    '-- New and changed rows are kept right by the factories_keys trigger.',
    'UPDATE "factories" f SET "naics" = k.code',
    'FROM (',
    '  SELECT p.id, COALESCE(own.code, other.code)::varchar(6) AS code',
    '  FROM "factories" p',
    '  LEFT JOIN "naics" own ON own.code = btrim(p.primary_naics) AND own.level = 6',
    '  LEFT JOIN "naics_concordance" other ON other.from_code = btrim(p.primary_naics)',
    ') k',
    'WHERE k.id = f.id AND f."naics" IS DISTINCT FROM k.code;',
    '',
  ];
}

/**
 * One year of county statistics as SQL statements. `counties` is the county
 * list the rows must belong to (null when only the statistics are built: the
 * table's own reference to counties then refuses a stranger).
 */
export function countyStatsSql({ source, rows }, counties) {
  if (!Number.isInteger(source?.year)) throw new Error('The statistics file names no year');
  const listed = counties ? new Set(counties.map((county) => county.fips)) : null;
  const seen = new Set();
  for (const row of rows) {
    if (!/^\d{5}$/.test(row.county)) throw new Error(`Not a county code: ${row.county}`);
    if (listed && !listed.has(row.county)) throw new Error(`Statistics for a county that is not listed: ${row.county}`);
    if (!(row.code === '31-33' || /^3[123]\d$/.test(row.code))) throw new Error(`Statistics for something that is not manufacturing or one of its industries: ${row.code}`);
    const key = `${row.county} ${row.code}`;
    if (seen.has(key)) throw new Error(`Two rows for ${key}`);
    seen.add(key);
  }
  const sourceName = `${source.publisher}, ${source.name}`;
  return [
    `-- Official figures for ${source.year}, by county: ${rows.length} rows (${sourceName}, retrieved ${source.retrieved}).`,
    'INSERT INTO "industry_county_stats" ("county_fips", "industry_code", "year", "establishments", "employment", "avg_annual_pay", "source", "source_url")',
    `SELECT v.county_fips, v.industry_code, ${source.year}, v.establishments::integer, v.employment::integer, v.avg_annual_pay::integer, ${q(sourceName)}, ${q(source.url)}`,
    'FROM (VALUES',
    rows.map((row) => `  (${q(row.county)}, ${q(row.code)}, ${n(row.establishments)}, ${n(row.employment)}, ${n(row.avgAnnualPay)})`).join(',\n'),
    ') AS v(county_fips, industry_code, establishments, employment, avg_annual_pay)',
    'ON CONFLICT ("county_fips", "industry_code", "year") DO UPDATE SET',
    '  "establishments" = EXCLUDED."establishments", "employment" = EXCLUDED."employment",',
    '  "avg_annual_pay" = EXCLUDED."avg_annual_pay", "source" = EXCLUDED."source", "source_url" = EXCLUDED."source_url";',
    '',
  ];
}

const HEAD = [
  '-- Generated by scripts/build-geo-sql.mjs. Edit scripts/geo/keys-schema.sql or the JSON and',
  '-- regenerate; once this file has been applied anywhere, a change goes out as a new migration.',
  '-- Idempotent: rows are matched by key and brought up to date; nothing is deleted.',
];

/** The whole migration: schema, reference rows, county statistics. */
export function buildSql({ schema, metros, counties, naics, concordance, stats }) {
  return [
    '-- Geography and industry keys on every plant: numeric coordinates, county, metro area, a clean',
    '-- NAICS code; the reference tables they point at (counties, metros, naics, naics_concordance);',
    '-- and manufacturing in each county, from the official statistics (industry_county_stats).',
    ...HEAD,
    '',
    schema.trimEnd(),
    '',
    ...referenceSql({ metros, counties, naics, concordance }),
    ...countyStatsSql(stats, counties),
  ].join('\n');
}

const readJson = async (file) => JSON.parse(await readFile(path.isAbsolute(file) ? file : path.join(ROOT, file), 'utf8'));

/** What the committed migration is built from, read from the repository. */
export async function readInputs(statsFile = 'data/industries/qcew-2025-counties.json') {
  return {
    schema: await readFile(path.join(ROOT, 'scripts', 'geo', 'keys-schema.sql'), 'utf8'),
    metros: (await readJson('data/geo/metros.json')).metros,
    counties: (await readJson('data/geo/counties.json')).counties,
    naics: (await readJson('data/industries/naics-2022.json')).codes,
    concordance: (await readJson('data/industries/naics-concordance.json')).codes,
    stats: await readJson(statsFile),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const out = option('--out');
  if (!out) throw new Error('usage: node scripts/build-geo-sql.mjs [--stats <file> | --stats-only <file>] --out <output.sql>');
  const only = option('--stats-only');
  if (only) {
    const stats = await readJson(only);
    const counties = (await readJson('data/geo/counties.json')).counties;
    await writeFile(out, [`-- Manufacturing in each county, ${stats.source?.year} (${only}).`, ...HEAD, '', ...countyStatsSql(stats, counties)].join('\n'));
    console.log(`${out}: ${stats.rows.length} rows of ${stats.source.year} county statistics`);
    return;
  }
  const inputs = await readInputs(option('--stats'));
  await writeFile(out, buildSql(inputs));
  console.log(
    `${out}: ${inputs.metros.length} metro areas, ${inputs.counties.length} counties, ${inputs.naics.length} NAICS codes, ` +
      `${inputs.concordance.length} other forms, ${inputs.stats.rows.length} rows of ${inputs.stats.source.year} county statistics`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`build-geo-sql: ${error.message}`);
    process.exit(1);
  });
}
