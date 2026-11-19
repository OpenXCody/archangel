#!/usr/bin/env node
// Gives every plant its county and metro area from its coordinates, and
// brings its clean NAICS code up to date. Data computed from data the
// database already holds: it runs against a database, outside the build, and
// can be run again at any time.
//
//   DATABASE_URL=... node scripts/geo/assign-keys.mjs              says what it would write; writes nothing
//   DATABASE_URL=... node scripts/geo/assign-keys.mjs --apply      writes
//
//   --boundaries <zip>   the Census Bureau's county boundary file (cb_2024_us_county_500k.zip);
//                        otherwise it is looked for in the system's temporary folder
//   --fetch              download the boundary file there when it is missing (about 12 MB, once)
//   --remote             DATABASE_URL may name a database that is not on this machine
//   --near-km <n>        how far outside every county a point may be and still be given to the
//                        nearest one (default 2: a plant on a pier, a point a few metres offshore)
//   --report <file>      write every plant that was not placed, and why, as JSON
//
// A plant's county is the county its coordinates fall in (point in polygon
// against the boundary file, scripts/geo/lib/locate.mjs); its metro area is
// that county's. Every plant is worked out again on every run and only rows
// whose keys would change are written, so a run after a run writes nothing,
// and a plant that was moved, added or corrected since the last run is picked
// up. A plant is left without a county, and listed, when:
//   - its coordinates are not usable numbers;
//   - they fall outside every county (in the sea, or in another country);
//   - they fall in a county of a state other than the plant's own: one of the
//     two is wrong, and a key is only worth having when the evidence agrees.
// The clean NAICS code needs no file: it is one statement over the reference
// tables, the same one migration 0044 runs.
//
// Needs migration 0044 (the counties table and the key columns). Behind a
// proxy, Node's fetch needs NODE_USE_ENV_PROXY=1.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';
import { dbfRows, shpPolygons, unzip } from './lib/files.mjs';
import { areaIndex } from './lib/locate.mjs';
import { DEFAULT_DIR, SOURCES, sourceFile } from './lib/sources.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BATCH = 5000;

/** Whether a database address names this machine. */
export function isLocalDatabase(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === '';
  } catch {
    return false;
  }
}

/** The boundary archive as areas for the index: [{ id: fips, state, name, rings }]. */
export function readBoundaries(zip) {
  const files = unzip(zip);
  const named = (ending) => [...files.entries()].find(([name]) => name.toLowerCase().endsWith(ending))?.[1];
  const shp = named('.shp');
  const dbf = named('.dbf');
  if (!shp || !dbf) throw new Error('The boundary archive holds no .shp and .dbf pair');
  const shapes = shpPolygons(shp);
  const rows = dbfRows(dbf);
  if (shapes.length !== rows.length) throw new Error('The boundary file and its attribute table disagree on how many counties there are');
  const areas = [];
  rows.forEach((row, i) => {
    if (!/^\d{5}$/.test(row.GEOID ?? '')) throw new Error('The boundary file has no five-digit GEOID for a county');
    if (shapes[i]) areas.push({ id: row.GEOID, state: row.STUSPS, name: row.NAMELSAD || row.NAME, rings: shapes[i].rings });
  });
  return areas;
}

/**
 * Checks a boundary file against the county list before anything is written
 * with it: every listed county must be in the file, and the point the Census
 * Bureau gives as inside each county must be found in that county. The
 * boundaries are drawn at the shoreline and the Bureau's point is not, so a
 * handful of coastal counties have theirs in their own waters: for those the
 * county must be the nearest one. A file of another edition, or a damaged
 * one, fails here. Returns how many points were inside and how many in the water.
 */
export function checkBoundaries(areas, index, counties) {
  const drawn = new Set(areas.map((area) => area.id));
  const missing = counties.filter((county) => !drawn.has(county.fips));
  if (missing.length > 0) throw new Error(`The boundary file has no outline for ${missing.length} listed counties (${missing.slice(0, 5).map((county) => county.fips).join(', ')}...): it is not the edition the county list was made from`);
  let inside = 0;
  let offshore = 0;
  const wrong = [];
  for (const county of counties) {
    if (index.locate(county.lng, county.lat)?.id === county.fips) inside++;
    else if (index.locate(county.lng, county.lat, { nearKm: 25 })?.id === county.fips && !index.locate(county.lng, county.lat)) offshore++;
    else wrong.push(county.fips);
  }
  if (wrong.length > 0 || offshore > counties.length / 100) {
    throw new Error(`${wrong.length} counties do not hold their own inside point (${wrong.slice(0, 5).join(', ')}) and ${offshore} have it offshore: the boundary file cannot be trusted`);
  }
  return { inside, offshore };
}

const MISMATCH = 'county is not in the stored state';

/**
 * Where one plant belongs. `counties` is Map(fips -> { state, cbsa, name })
 * of the counties the database knows. Returns { county, cbsa } to write (both
 * null when it is not placed) and, when not placed or placed by nearness,
 * `why` and what was found.
 */
export function placePlant(plant, index, counties, nearKm) {
  const none = { county: null, cbsa: null };
  if (plant.lat === null || plant.lng === null) return { ...none, why: 'no usable coordinates' };
  const found = index.locate(plant.lng, plant.lat, { nearKm });
  if (!found) return { ...none, why: 'outside every county' };
  const county = counties.get(found.id);
  if (!county) return { ...none, why: 'in a county the product does not cover', found: found.id };
  if (plant.state && county.state !== plant.state.trim().toUpperCase()) return { ...none, why: MISMATCH, found: found.id };
  return { county: found.id, cbsa: county.cbsa, ...(found.km > 0 ? { nearKm: Math.round(found.km * 1000) / 1000 } : {}) };
}

/**
 * The whole run against one database connection (`sql`, postgres.js).
 * Returns the report; writes only when `apply`.
 */
export async function assignKeys(sql, { areas, index, apply = false, nearKm = 2, log = console.log } = {}) {
  const started = Date.now();
  const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'factories' AND column_name IN ('lat', 'lng', 'county_fips', 'cbsa_code', 'naics')`;
  if (columns.length < 5) throw new Error('This database does not have the key columns yet: apply migration 0044 first (npm run db:migrate)');
  const counties = new Map((await sql`SELECT fips, name, state, cbsa_code FROM counties`).map((row) => [row.fips, { name: row.name, state: row.state, cbsa: row.cbsa_code }]));
  if (counties.size === 0) throw new Error('The counties table is empty: apply migration 0044 first');
  const drawn = new Map(areas.map((area) => [area.id, area]));

  // Read every plant, a few thousand at a time, and work out where it is.
  const changes = [];
  const unplaced = [];
  const near = [];
  let plants = 0;
  let placed = 0;
  let already = 0;
  const located = Date.now();
  const cursor = sql`SELECT id, name, city, state, lat, lng, county_fips, cbsa_code FROM factories ORDER BY id`.cursor(10000);
  for await (const rows of cursor) {
    for (const plant of rows) {
      plants++;
      const place = placePlant(plant, index, counties, nearKm);
      if (place.county) placed++;
      const label = { id: plant.id, name: plant.name, city: plant.city, state: plant.state, lat: plant.lat, lng: plant.lng };
      if (place.why) {
        const where = place.found ? (counties.get(place.found) ?? drawn.get(place.found)) : null;
        // How far the point is from the state the plant is filed under: a few metres is a
        // boundary drawn coarsely or a river bank; further is a wrong state or a wrong point.
        const own = place.why === MISMATCH ? index.locate(plant.lng, plant.lat, { nearKm: 25, among: (area) => area.state === plant.state.trim().toUpperCase() }) : null;
        unplaced.push({
          ...label,
          why: place.why,
          ...(place.found ? { foundCounty: place.found, foundName: where ? `${where.name}, ${where.state}` : null } : {}),
          ...(place.why === MISMATCH ? { kmToStoredState: own ? Math.round(own.km * 1000) / 1000 : null } : {}),
        });
      } else if (place.nearKm) {
        near.push({ ...label, county: place.county, countyName: counties.get(place.county).name, km: place.nearKm });
      }
      if (place.county === plant.county_fips && place.cbsa === plant.cbsa_code) already++;
      else changes.push({ id: plant.id, lat: plant.lat, lng: plant.lng, county: place.county, cbsa: place.cbsa });
    }
  }
  const locateMs = Date.now() - located;

  // Write only what differs, and only where the coordinates are still the ones that were read.
  let written = 0;
  const writing = Date.now();
  if (apply) {
    for (let i = 0; i < changes.length; i += BATCH) {
      const batch = changes.slice(i, i + BATCH);
      const result = await sql`
        UPDATE factories f SET county_fips = v.county, cbsa_code = v.cbsa
        FROM jsonb_to_recordset(${sql.json(batch)}) AS v(id uuid, lat float8, lng float8, county text, cbsa text)
        WHERE f.id = v.id AND f.lat IS NOT DISTINCT FROM v.lat AND f.lng IS NOT DISTINCT FROM v.lng`;
      written += result.count;
    }
  }
  const writeMs = Date.now() - writing;

  // The clean NAICS code: the statement migration 0044 runs, here so that a
  // later change to the reference tables reaches the plants.
  const cleanCodes = sql`
    SELECT p.id, COALESCE(own.code, other.code)::varchar(6) AS code
    FROM factories p
    LEFT JOIN naics own ON own.code = btrim(p.primary_naics) AND own.level = 6
    LEFT JOIN naics_concordance other ON other.from_code = btrim(p.primary_naics)`;
  const naicsChanged = apply
    ? (await sql`UPDATE factories f SET naics = k.code FROM (${cleanCodes}) k WHERE k.id = f.id AND f.naics IS DISTINCT FROM k.code`).count
    : (await sql`SELECT COUNT(*)::int AS n FROM factories f INNER JOIN (${cleanCodes}) k ON k.id = f.id WHERE f.naics IS DISTINCT FROM k.code`)[0].n;
  // What the stored codes are, read the way the clean code is derived.
  const [codes] = await sql`
    SELECT COUNT(*)::int AS plants,
           COUNT(*) FILTER (WHERE btrim(COALESCE(p.primary_naics, '')) <> '')::int AS stored,
           COUNT(own.code)::int AS exact,
           COUNT(*) FILTER (WHERE own.code IS NULL AND other.basis = 'only')::int AS shorter,
           COUNT(*) FILTER (WHERE own.code IS NULL AND other.basis IN ('2017', '2012', '2007'))::int AS earlier
    FROM factories p
    LEFT JOIN naics own ON own.code = btrim(p.primary_naics) AND own.level = 6
    LEFT JOIN naics_concordance other ON other.from_code = btrim(p.primary_naics)`;
  const unclean = await sql`
    SELECT btrim(p.primary_naics) AS code, COUNT(*)::int AS plants, shorter.title
    FROM factories p
    LEFT JOIN naics own ON own.code = btrim(p.primary_naics) AND own.level = 6
    LEFT JOIN naics_concordance other ON other.from_code = btrim(p.primary_naics)
    LEFT JOIN naics shorter ON shorter.code = btrim(p.primary_naics)
    WHERE btrim(COALESCE(p.primary_naics, '')) <> '' AND own.code IS NULL AND other.code IS NULL
    GROUP BY 1, shorter.title ORDER BY plants DESC, code LIMIT 500`;

  const why = (reason) => unplaced.filter((row) => row.why === reason);
  const report = {
    applied: apply,
    plants,
    placed,
    placedByNearness: near.length,
    unplaced: unplaced.length,
    noCoordinates: why('no usable coordinates').length,
    outsideEveryCounty: why('outside every county').length,
    notCovered: why('in a county the product does not cover').length,
    stateMismatch: why(MISMATCH).length,
    alreadyRight: already,
    toWrite: changes.length,
    written,
    naics: { stored: codes.stored, clean: codes.exact + codes.shorter + codes.earlier, exact: codes.exact, fromShorter: codes.shorter, fromEarlierEdition: codes.earlier, notClean: codes.stored - codes.exact - codes.shorter - codes.earlier, changed: naicsChanged },
    ms: { locate: locateMs, write: writeMs, total: Date.now() - started },
    lists: { unplaced, near, uncleanCodes: unclean.map((row) => ({ code: row.code, plants: row.plants, title: row.title })) },
  };

  const count = (value) => value.toLocaleString('en-US');
  log(`${count(plants)} plants read and located in ${(locateMs / 1000).toFixed(1)} s`);
  log(`  placed in a county      ${count(placed)} (${count(near.length)} of them by nearness, within ${nearKm} km of a shoreline or border)`);
  log(`  not placed              ${count(unplaced.length)}`);
  log(`    no usable coordinates ${count(report.noCoordinates)}`);
  log(`    outside every county  ${count(report.outsideEveryCounty)}`);
  log(`    county not covered    ${count(report.notCovered)}`);
  log(`    county in another state than the plant's  ${count(report.stateMismatch)}`);
  log(`  keys already right      ${count(already)}`);
  log(apply ? `  rows written            ${count(written)} of ${count(changes.length)} in ${(writeMs / 1000).toFixed(1)} s` : `  rows that would change  ${count(changes.length)} (nothing written: add --apply)`);
  log(`NAICS: ${count(codes.stored)} plants have a stored code; ${count(report.naics.clean)} mean one 2022 national industry`);
  log(`  the code itself ${count(codes.exact)}, a shorter form ${count(codes.shorter)}, a code of an earlier edition ${count(codes.earlier)}; not clean ${count(report.naics.notClean)}`);
  log(apply ? `  rows written            ${count(naicsChanged)}` : `  rows that would change  ${count(naicsChanged)}`);
  const show = (title, rows, line) => {
    if (rows.length === 0) return;
    log(`\n${title} (${count(rows.length)}${rows.length > 25 ? ', the first 25' : ''}):`);
    for (const row of rows.slice(0, 25)) log(`  ${line(row)}`);
  };
  const plantLine = (row) => `${row.id}  ${row.name}  [${[row.city, row.state].filter(Boolean).join(', ')}]  ${row.lat}, ${row.lng}`;
  show(
    "County in another state than the plant's, nearest to its own state first",
    why(MISMATCH).sort((a, b) => (a.kmToStoredState ?? Infinity) - (b.kmToStoredState ?? Infinity)),
    (row) => `${plantLine(row)}  -> ${row.foundName ?? row.foundCounty}  (${row.kmToStoredState === null ? 'more than 25' : row.kmToStoredState} km from ${row.state})`
  );
  show('Outside every county', why('outside every county'), plantLine);
  show('In a county the product does not cover', why('in a county the product does not cover'), (row) => `${plantLine(row)}  -> ${row.foundName ?? row.foundCounty}`);
  show('No usable coordinates', why('no usable coordinates'), plantLine);
  show('Stored codes that are not one 2022 national industry', report.lists.uncleanCodes, (row) => `${row.code}  ${count(row.plants)} ${row.plants === 1 ? 'plant' : 'plants'}${row.title ? `  (${row.title}: more than one national industry)` : ''}`);
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const apply = args.includes('--apply');
  const nearKm = option('--near-km') === undefined ? 2 : Number(option('--near-km'));
  if (!Number.isFinite(nearKm) || nearKm < 0 || nearKm > 25) throw new Error('--near-km takes a distance from 0 to 25');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const local = isLocalDatabase(url);
  if (!local && !args.includes('--remote')) {
    throw new Error(`DATABASE_URL names a database that is not on this machine (${new URL(url).hostname}). Add --remote to run against it.`);
  }
  console.log(`assign-keys: ${apply ? 'WRITING' : 'dry run on'} ${local ? 'the local database' : 'the remote database at'} ${new URL(url).hostname}${new URL(url).pathname}`);
  console.log(`  plants get county_fips and cbsa_code from their coordinates, and naics from primary_naics; nothing else is touched${apply ? '' : '; nothing is written without --apply'}`);

  const loading = Date.now();
  const given = option('--boundaries');
  const zip = given ? await readFile(given) : await sourceFile('boundaries', { dir: DEFAULT_DIR, fetchMissing: args.includes('--fetch'), log: (line) => console.log(`  ${line}`) });
  const areas = readBoundaries(zip);
  const index = areaIndex(areas);
  const listed = JSON.parse(await readFile(path.join(ROOT, 'data', 'geo', 'counties.json'), 'utf8')).counties;
  const checked = checkBoundaries(areas, index, listed);
  console.log(
    `  boundaries: ${SOURCES.boundaries.name}; ${areas.length} outlines; of ${listed.length} listed counties ${checked.inside} hold their own inside point and ${checked.offshore} have it in their own waters (${((Date.now() - loading) / 1000).toFixed(1)} s)`
  );

  const sql = postgres(url, { max: 1, connect_timeout: 15, onnotice: () => {} });
  try {
    const report = await assignKeys(sql, { areas, index, apply, nearKm });
    const file = option('--report');
    if (file) {
      await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`\nfull lists written to ${file}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`assign-keys: ${error.message}`);
    process.exit(1);
  });
}
