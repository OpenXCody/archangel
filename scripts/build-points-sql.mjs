#!/usr/bin/env node
// Builds the migration that puts right the points a research file took from a
// geocoder whose terms forbid keeping them: data/employers/points-replaced.json.
//
//   node scripts/build-points-sql.mjs --check
//   node scripts/build-points-sql.mjs --out migrations/0079_points_replaced.sql
//   node scripts/build-points-sql.mjs --rehearse --out rehearsal.sql   # the same, in a transaction rolled back
//
// data/employers/posting-employers.json placed thirteen plants at the ArcGIS
// World Geocoding Service's answer for their address. Migration 0065 is
// generated from that file and applied, so neither is edited (0065 is held to
// the file), and loading another research file cannot replace a point: the
// employer loader keeps one of two points by their order, not their source. So
// each plant the file names here is a row to put right:
//   latitude, longitude   the point of an allowed source: the Census Bureau's
//                         geocoder for the same house number and street, else
//                         the EPA registry's facility at the address, with its
//                         `source` (the query or the registry's page) and
//                         `coordinatesFrom` (what answered, in words)
//   left                  no allowed source places it: the point stays and the
//                         row is listed for a person, with why
// `was` is the point the research file (and so 0065) gave it.
// The migration decides in SQL on the database it meets and writes each
// decision to load_log (load `points-replaced`): a row is found by a citation
// 0065 wrote for that plant alone, and its point is changed only while it is
// still the point 0065 wrote, never one an admin set. A changed point is a line
// in the audit log with no person named (History reads it as "The data") and
// clears the row's county (the factories_keys trigger): run
// scripts/geo/assign-keys.mjs after it. Every citation of the World Geocoder is
// then dropped from the curated citations in external_references. Nothing else
// is changed and nothing is deleted but those citations. Run twice, the second
// run changes nothing and writes nothing.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
export const FILE = path.join(ROOT, 'data', 'employers', 'points-replaced.json');
export const RESEARCH = path.join(ROOT, 'data', 'employers', 'posting-employers.json');
export const MIGRATION = path.join(ROOT, 'migrations', '0079_points_replaced.sql');
export const LOAD = 'points-replaced';
/** The load whose citations find the rows: migration 0065, the research file's brief. */
export const FROM_LOAD = 'posting-employers';

/**
 * A source whose points are never kept, in a research file's `sources` or `coordinatesFrom`: the ArcGIS World
 * Geocoding Service (its hosts and its path), Esri named as the source, and OpenStreetMap's searches (Nominatim,
 * Photon). A government's own service that runs on ArcGIS software (a county's address locator, a state's address
 * points or parcels, on its own server or on ArcGIS Online) is not one of them: it is that government's data.
 */
export const FORBIDDEN = /geocode(?:-api)?\.arcgis\.com|\/World\/GeocodeServer|World Geocod|\bEsri\b|openstreetmap|nominatim|photon\.komoot|\bphoton\b/i;
/** The same, for SQL: the citations of the World Geocoder that the migration drops. */
const WORLD_GEOCODER_SQL = String.raw`x.url ~* '^https?://geocode(-api)?[.]arcgis[.]com/' OR x.url ~* '/World/GeocodeServer'`;
const CENSUS = /^https:\/\/geocoding\.geo\.census\.gov\/geocoder\/locations\/address\?/;
const EPA = /^https:\/\/(frs-public\.epa\.gov|data\.epa\.gov|echo\.epa\.gov|echodata\.epa\.gov)\//;

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
/** Metres between two points, as the employer loader measures them. */
export const metres = (a, b) =>
  Math.round(Math.sqrt(((a.latitude - b.latitude) * 111320) ** 2 + ((a.longitude - b.longitude) * 111320 * Math.cos((a.latitude * Math.PI) / 180)) ** 2));

/** A research file's plants: [{ company, plant }] with every field the plant has. */
export function plantsOf(research) {
  return (research?.companies ?? []).flatMap((c) => (Array.isArray(c?.plants) ? c.plants : []).map((p) => ({ company: c.name, ...p })));
}

/** Whether a plant names a forbidden source for its point. */
export const namesForbidden = (plant) => [...(plant?.sources ?? []), plant?.coordinatesFrom ?? ''].some((s) => FORBIDDEN.test(String(s)));

/** Every address a plant cites as 0065 wrote them (its sources and its headcount's source). */
const citesOf = (plant) => [...new Set([...(plant.sources ?? []), plant.employeesSource].filter((u) => text(u)).map((u) => u.trim()))];

/**
 * For each plant of the research file, the citations no other plant of the file carries: they find its row. A
 * citation of a forbidden source is not one of them: the migration drops it, so a second run could not find it.
 */
export function ownCitations(research) {
  const plants = plantsOf(research);
  const count = new Map();
  for (const p of plants) for (const u of citesOf(p)) count.set(u, (count.get(u) ?? 0) + 1);
  return new Map(plants.map((p) => [`${p.company}\u0000${p.name}`, citesOf(p).filter((u) => count.get(u) === 1 && !FORBIDDEN.test(u))]));
}

/** What is wrong with the file, one line each: nothing when it can be built. */
export function checkPoints(file, research) {
  const problems = [];
  const entries = Array.isArray(file?.plants) ? file.plants : null;
  if (!entries || entries.length === 0) return ['the file has no plants'];
  const plants = plantsOf(research);
  const own = ownCitations(research);
  const seen = new Set();
  entries.forEach((e, i) => {
    const where = `plant ${i + 1} (${e?.company ?? '?'} / ${e?.plant ?? '?'})`;
    const key = `${e?.company}\u0000${e?.plant}`;
    if (seen.has(key)) problems.push(`${where}: in the file twice`);
    seen.add(key);
    const found = plants.filter((p) => p.company === e?.company && p.name === e?.plant);
    if (found.length !== 1) {
      problems.push(`${where}: is not one plant of the research file`);
      return;
    }
    const [p] = found;
    if (!isNumber(e?.was?.latitude) || !isNumber(e?.was?.longitude) || e.was.latitude !== p.latitude || e.was.longitude !== p.longitude) {
      problems.push(`${where}: "was" is not the point the research file gives it (${p.latitude}, ${p.longitude})`);
    }
    if (!text(e?.wasFrom)) problems.push(`${where}: says not where the point it had came from ("wasFrom")`);
    if (!text(e?.address) || !e.address.startsWith(String(p.address ?? '').trim()) || !p.address) problems.push(`${where}: the address is not the plant's`);
    if ((own.get(key) ?? []).length === 0) problems.push(`${where}: carries no citation of its own, so its row cannot be found`);
    const placed = e?.latitude !== undefined || e?.longitude !== undefined || e?.source !== undefined || e?.coordinatesFrom !== undefined;
    if (placed === Boolean(text(e?.left))) problems.push(`${where}: needs a point with its source, or "left", and not both`);
    if (text(e?.left)) return;
    if (!isNumber(e?.latitude) || !isNumber(e?.longitude) || Math.abs(e.latitude) > 90 || Math.abs(e.longitude) > 180) {
      problems.push(`${where}: the point is not a latitude and a longitude`);
      return;
    }
    if (e.latitude === p.latitude && e.longitude === p.longitude) problems.push(`${where}: the point is the one it had`);
    // An address answered elsewhere is not this one: a point more than a kilometre off is a wrong match.
    if (isNumber(p.latitude) && metres(e, p) > 1000) problems.push(`${where}: the point is ${metres(e, p)} m from the one it had, too far to be the same address`);
    const source = text(e?.source) ?? '';
    const from = text(e?.coordinatesFrom) ?? '';
    if (!from) problems.push(`${where}: says not what answered ("coordinatesFrom")`);
    if (CENSUS.test(source)) {
      if (!/Census Bureau geocoder/.test(from)) problems.push(`${where}: a Census query whose coordinatesFrom does not say the Census Bureau geocoder`);
    } else if (EPA.test(source)) {
      if (!/^\d{12}$/.test(String(e?.registryId ?? '')) || !source.includes(String(e.registryId)) || !from.includes(String(e.registryId))) {
        problems.push(`${where}: an EPA point names its registry id in "registryId", its source and its coordinatesFrom`);
      }
    } else problems.push(`${where}: the source is neither the Census Bureau's geocoder nor the EPA registry`);
    if (FORBIDDEN.test(source) || FORBIDDEN.test(from)) problems.push(`${where}: the new point names a source whose points are not kept`);
  });
  // Every plant the research file places from a forbidden source is put right or listed here.
  for (const p of plants) {
    if (namesForbidden(p) && !seen.has(`${p.company}\u0000${p.name}`)) problems.push(`${p.company} / ${p.name}: names a source whose points are not kept, and is not in the file`);
  }
  return problems;
}

/** What the migration carries for each plant: only what the SQL reads. */
export function plantsForSql(file, research) {
  const own = ownCitations(research);
  return file.plants.map((e) => ({
    company: e.company,
    plant: e.plant,
    was: { latitude: e.was.latitude, longitude: e.was.longitude },
    cites: own.get(`${e.company}\u0000${e.plant}`),
    ...(text(e.left)
      ? { left: text(e.left) }
      : { to: { latitude: e.latitude, longitude: e.longitude }, from: text(e.coordinatesFrom), source: text(e.source), metres: metres(e, e.was) }),
  }));
}

const SQL = String.raw`
-- One line in load_log. A line marked once is written only when the same line is not there yet, so a run that finds
-- nothing to do writes nothing.
CREATE OR REPLACE FUNCTION pg_temp.pr_log(p_kind text, p_action text, p_look boolean, p_company text, p_plant text, p_detail text,
                                          p_id uuid, p_evidence jsonb, p_once boolean)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO load_log (load, kind, action, look, company, plant, detail, entity_id, evidence)
  SELECT 'points-replaced', p_kind, p_action, p_look, p_company, p_plant, p_detail, p_id, p_evidence
  WHERE NOT p_once OR NOT EXISTS (
    SELECT 1 FROM load_log l WHERE l.load = 'points-replaced' AND l.action = p_action AND l.entity_id IS NOT DISTINCT FROM p_id
      AND l.detail IS NOT DISTINCT FROM p_detail)
$f$;

-- A stored coordinate as a number, or null when the text is not one.
CREATE OR REPLACE FUNCTION pg_temp.pr_num(t text) RETURNS numeric LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN btrim(t) ~ '^-?[0-9]+([.][0-9]+)?$' THEN btrim(t)::numeric END
$f$;

CREATE OR REPLACE FUNCTION pg_temp.pr_apply(data jsonb) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  r jsonb;
  f record;
  d record;
  v_found boolean;
  v_held boolean;
  v_was text;
  v_now text;
BEGIN
  PERFORM set_config('client_min_messages', 'warning', true);
  FOR r IN SELECT x FROM jsonb_array_elements(data->'plants') x LOOP
    v_found := false;
    v_was := format('%s, %s', r->'was'->>'latitude', r->'was'->>'longitude');
    -- The plant's row: the one carrying a citation 0065 wrote for this plant alone (a merge moves citations with it).
    FOR f IN
      SELECT x.id, x.name, x.latitude, x.longitude, c.name AS company,
             pg_temp.pr_num(x.latitude) AS lat, pg_temp.pr_num(x.longitude) AS lng,
             EXISTS (SELECT 1 FROM fact_sources s WHERE s.factory_id = x.id AND s.fact = 'coordinates' AND s.source = 'admin') AS by_admin
      FROM factories x LEFT JOIN companies c ON c.id = x.company_id
      WHERE x.id IN (SELECT e.entity_id FROM external_references e
                     WHERE e.entity_type = 'factories' AND e.source = 'CURATED' AND e.external_id = 'posting-employers'
                       AND e.url IN (SELECT jsonb_array_elements_text(r->'cites')))
      ORDER BY x.id
    LOOP
      v_found := true;
      v_held := f.lat = (r->'was'->>'latitude')::numeric AND f.lng = (r->'was'->>'longitude')::numeric;
      IF r ? 'to' THEN
        -- Put right already.
        CONTINUE WHEN f.lat = (r->'to'->>'latitude')::numeric AND f.lng = (r->'to'->>'longitude')::numeric;
        IF NOT coalesce(v_held, false) THEN
          PERFORM pg_temp.pr_log('plant', 'left', true, f.company, f.name,
            format('holds %s, %s, not the point 0065 wrote (%s): left as it is', f.latitude, f.longitude, v_was), f.id, NULL, true);
          CONTINUE;
        END IF;
        IF f.by_admin THEN
          PERFORM pg_temp.pr_log('plant', 'left', true, f.company, f.name,
            format('an admin set this point (%s): left as it is', v_was), f.id, NULL, true);
          CONTINUE;
        END IF;
        v_now := format('%s, %s', r->'to'->>'latitude', r->'to'->>'longitude');
        UPDATE factories SET latitude = r->'to'->>'latitude', longitude = r->'to'->>'longitude', updated_at = now() WHERE id = f.id;
        INSERT INTO external_references (entity_type, entity_id, source, external_id, url)
          VALUES ('factories', f.id, 'CURATED', 'points-replaced', r->>'source')
        ON CONFLICT (entity_type, entity_id, url) WHERE source = 'CURATED' DO NOTHING;
        PERFORM pg_temp.pr_log('plant', 'point replaced', false, f.company, f.name,
          format('%s → %s: %s; %s m from the World Geocoder''s point', v_was, v_now, r->>'from', r->>'metres'), f.id,
          jsonb_build_object('was', r->'was', 'now', r->'to', 'source', r->>'source'), false);
        -- On the factory's History as an admin's change of its point reads, with no person: the data's decision.
        INSERT INTO audit_log (actor_id, actor_name, kind, record_id, record_name, action, detail)
          VALUES (NULL, '', 'factory', f.id, f.name, 'edited',
                  jsonb_build_object('changes', jsonb_build_object(
                    'latitude', jsonb_build_array(f.latitude, r->'to'->>'latitude'),
                    'longitude', jsonb_build_array(f.longitude, r->'to'->>'longitude'))));
      ELSIF coalesce(v_held, false) THEN
        PERFORM pg_temp.pr_log('plant', 'point left', true, f.company, f.name, format('%s: %s', v_was, r->>'left'), f.id, NULL, true);
      ELSE
        PERFORM pg_temp.pr_log('plant', 'left', false, f.company, f.name,
          format('holds %s, %s, not the point 0065 wrote (%s): nothing to put right', f.latitude, f.longitude, v_was), f.id, NULL, true);
      END IF;
    END LOOP;
    IF NOT v_found THEN
      PERFORM pg_temp.pr_log('plant', 'not found', true, r->>'company', r->>'plant',
        'no row carries a citation 0065 wrote for this plant: nothing done', NULL, NULL, true);
    END IF;
  END LOOP;

  -- The World Geocoder is the source of nothing kept: its addresses leave every curated citation.
  FOR d IN
    DELETE FROM external_references x WHERE x.source = 'CURATED' AND (${WORLD_GEOCODER_SQL})
    RETURNING x.entity_type, x.entity_id, x.url, x.external_id
  LOOP
    PERFORM pg_temp.pr_log(CASE WHEN d.entity_type = 'factories' THEN 'plant' ELSE 'company' END, 'citation dropped', false,
      coalesce((SELECT c.name FROM factories x JOIN companies c ON c.id = x.company_id WHERE d.entity_type = 'factories' AND x.id = d.entity_id),
               (SELECT c.name FROM companies c WHERE d.entity_type = 'companies' AND c.id = d.entity_id)),
      (SELECT x.name FROM factories x WHERE d.entity_type = 'factories' AND x.id = d.entity_id),
      format('%s (cited by load %s)', d.url, d.external_id), d.entity_id, NULL, false);
  END LOOP;
END $f$;
`;

const quote = (body, tag) => {
  if (body.includes(`$${tag}$`)) throw new Error(`the text contains $${tag}$ and cannot be quoted with it`);
  return `$${tag}$${body}$${tag}$`;
};

/** The migration's SQL for a file. */
export function buildSql(file, research, source = 'data/employers/points-replaced.json') {
  return [
    `-- Points the research file took from the ArcGIS World Geocoding Service, put right, from ${source},`,
    '-- generated by scripts/build-points-sql.mjs. Edit the JSON and regenerate; do not edit this file by hand.',
    '-- A row takes the Census Bureau geocoder\'s or the EPA registry\'s point only while it holds the point 0065 wrote,',
    '-- and never over one an admin set; a plant no allowed source places is listed and left. The World Geocoder\'s',
    '-- addresses leave the curated citations. A changed point clears the county: run scripts/geo/assign-keys.mjs after.',
    "-- What it decided is in load_log (load 'points-replaced'; the lines with look = true are the ones to read).",
    '-- Safe to run again: a row already put right is left as it is, and nothing is written.',
    SQL.trimEnd(),
    '',
    `SELECT pg_temp.pr_apply(${quote(JSON.stringify({ plants: plantsForSql(file, research) }), 'pr_data')}::jsonb);`,
    '',
  ].join('\n');
}

/** The same SQL in a transaction that is rolled back, printing what it decided. Run it all at once, on one connection. */
export function rehearsalSql(file, research) {
  return [
    'BEGIN;',
    buildSql(file, research),
    "SELECT action, look, company, plant, detail FROM load_log WHERE load = 'points-replaced' AND run_at = now() ORDER BY id;",
    'ROLLBACK;',
    '',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let out = null;
  let check = false;
  let rehearse = false;
  let input = FILE;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--check') check = true;
    else if (args[i] === '--rehearse') rehearse = true;
    else if (args[i].startsWith('--')) throw new Error(`unknown option ${args[i]}`);
    else input = args[i];
  }
  const file = JSON.parse(await readFile(input, 'utf8'));
  const research = JSON.parse(await readFile(RESEARCH, 'utf8'));
  const problems = checkPoints(file, research);
  const placed = file.plants?.filter((e) => !text(e.left)) ?? [];
  console.error(`${path.basename(input)}: ${file.plants?.length ?? 0} plants, ${placed.length} given an allowed source's point and ${(file.plants?.length ?? 0) - placed.length} left for a person.`);
  for (const line of problems) console.error(`  problem: ${line}`);
  if (problems.length) process.exit(1);
  if (check) return;
  const sql = rehearse ? rehearsalSql(file, research) : buildSql(file, research, path.relative(ROOT, input));
  if (out) await writeFile(out, sql);
  else process.stdout.write(sql);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
