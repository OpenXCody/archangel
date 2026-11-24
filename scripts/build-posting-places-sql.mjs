#!/usr/bin/env node
// Builds the migration that decides, from data/employers/places.json, places
// employers' postings name that would otherwise wait for a person in Admin
// Tools (Review, "Postings with no factory").
//
//   node scripts/build-posting-places-sql.mjs --check
//   node scripts/build-posting-places-sql.mjs --out migrations/0067_posting_places.sql
//   node scripts/build-posting-places-sql.mjs --registry tests/api/postings/boards.json --out test.sql test-places.json
//
// Each place is an employer of the registry (data/employers/boards.json, by its
// `employer` or its `slug`), a city and a state as the postings write them, and
// a decision:
//   point  the place is a plant we list under another town's name: the plant by
//          its company and exact name (`plant`, with `plantCity` where the name
//          alone does not tell it), as a research file in data/employers/ names
//          it or, with `stored: true`, as the stored row is named
//   leave  the place is not a plant (`kind`: an office, a laboratory, a
//          warehouse): it is not asked about again
// The migration writes posting_places rows the way Admin Tools does, decided by
// the data: decided_at set and decided_by empty. A place a person decided is
// never changed: one with decided_by set, and one a person has decided before
// and taken back (Admin Tools' "waits again" leaves a line in the audit log by
// a person, and that is a decision too). A plant that is not found, or not one
// of the employer's in the place's state, is said with look = true and the
// place is left waiting. An employer whose postings have never been run on the
// database has its source registered as the runner registers it (the registry
// line through sourceOf, scripts/ingest/postings/registry.mjs; an existing
// source is never changed), so its places are decided too.
// It also replaces posting_decide (scripts/posting-decide.sql): a place set
// aside as no plant takes no plant by the near rule, and a posting another of
// whose places has its plant takes no second job by it. Then it brings the jobs in
// line with the data as it now stands, as Admin Tools does when it points a
// place: for each employer with an applied run, the waiting list is resolved
// (posting_resolve) and every place whose postings would now be placed
// otherwise is applied (posting_apply with the place, which closes nothing),
// journalled under that run. A job left on a plant that is not the employer's
// is said with look; the next run closes or moves it.
// Every decision is a line in load_log (load `posting-places`) and, as a
// person's is, a line in the audit log with no person named. Run twice, the
// second run changes nothing.
import { readFileSync } from 'node:fs';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { sourceOf } from './ingest/postings/registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
export const FILE = path.join(ROOT, 'data', 'employers', 'places.json');
export const REGISTRY = path.join(ROOT, 'data', 'employers', 'boards.json');
export const RESEARCH = path.join(ROOT, 'data', 'employers');
export const MIGRATION = path.join(ROOT, 'migrations', '0067_posting_places.sql');
export const LOAD = 'posting-places';
/** posting_decide as 0067 leaves it: 0054's, with the near rule kept off places set aside and off postings placed otherwise. */
export const DECIDE = path.join(HERE, 'posting-decide.sql');

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
/** A city as posting_city_key compares it (migration 0054): lower case, Saint, Fort and Mount short, no punctuation. */
export const cityKey = (city) =>
  String(city ?? '')
    .toLowerCase()
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bfort\b/g, 'ft')
    .replace(/\bmount\b/g, 'mt')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The research files' plants, by company: [{ company, name, city, state }]. Not corrections.json or the registry. */
export async function researchPlants(dir = RESEARCH) {
  const plants = [];
  for (const name of (await readdir(dir)).sort()) {
    if (!name.endsWith('.json') || ['corrections.json', 'boards.json', 'places.json', 'not-theirs.json'].includes(name)) continue;
    const file = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
    for (const c of Array.isArray(file?.companies) ? file.companies : []) {
      for (const p of Array.isArray(c?.plants) ? c.plants : []) plants.push({ file: name, company: c.name, name: p.name, city: p.city, state: p.state });
    }
  }
  return plants;
}

/** What is wrong with the file, one line each: nothing when it can be built. */
export function checkPlaces(file, registry, plants) {
  const problems = [];
  const places = Array.isArray(file?.places) ? file.places : null;
  if (!places) return ['the file has no places'];
  const employers = new Map();
  for (const e of registry?.employers ?? []) {
    employers.set(String(e.employer).toLowerCase(), e);
    employers.set(String(e.slug).toLowerCase(), e);
  }
  const seen = new Set();
  places.forEach((place, i) => {
    const where = `place ${i + 1} (${place?.employer ?? '?'}: ${place?.city ?? '?'}, ${place?.state ?? '?'})`;
    const employer = employers.get(String(place?.employer ?? '').toLowerCase());
    if (!employer) problems.push(`${where}: the employer is not in the registry of boards`);
    if (!text(place?.city) || !/^[A-Z]{2}$/.test(String(place?.state ?? ''))) problems.push(`${where}: needs a city and a state code`);
    const key = `${employer?.slug ?? place?.employer}|${cityKey(place?.city)}|${place?.state}`;
    if (seen.has(key)) problems.push(`${where}: the same place is in the file twice`);
    seen.add(key);
    if (!text(place?.why)) problems.push(`${where}: says no why`);
    if (!Array.isArray(place?.sources) || place.sources.length === 0) problems.push(`${where}: names no source`);
    for (const source of Array.isArray(place?.sources) ? place.sources : []) {
      if (!/^https?:\/\/\S+$/.test(String(source))) problems.push(`${where}: source "${source}" is not an address`);
    }
    if (place?.decision === 'leave') {
      if (!text(place.kind)) problems.push(`${where}: a place left says what kind of site it is`);
      if (place.plant || place.company) problems.push(`${where}: a place left names no plant`);
    } else if (place?.decision === 'point') {
      if (!text(place.company) || !text(place.plant)) problems.push(`${where}: pointing needs the plant's company and name`);
      else if (!place.stored) {
        const named = plants.filter(
          (p) =>
            String(p.company).toLowerCase() === place.company.toLowerCase() &&
            String(p.name).toLowerCase() === place.plant.toLowerCase() &&
            (!place.plantCity || cityKey(p.city) === cityKey(place.plantCity))
        );
        if (named.length !== 1) problems.push(`${where}: "${place.plant}" of ${place.company} is named ${named.length} times in the research files, not once`);
        else if (named[0].state !== place.state) problems.push(`${where}: "${place.plant}" is in ${named[0].state}, not ${place.state}`);
      }
    } else {
      problems.push(`${where}: the decision is "${place?.decision}", not point or leave`);
    }
  });
  return problems;
}

/** The sources of the employers the file names, as the runner registers them (sourceOf), for a database that has none yet. */
export function sourcesForSql(file, registry) {
  const employers = new Map();
  for (const e of registry.employers) {
    employers.set(String(e.employer).toLowerCase(), e);
    employers.set(String(e.slug).toLowerCase(), e);
  }
  const seen = new Map();
  for (const place of file.places) {
    const entry = employers.get(place.employer.toLowerCase());
    if (seen.has(entry.slug)) continue;
    const s = sourceOf(entry);
    seen.set(entry.slug, {
      slug: s.slug, name: s.name, publisher: s.publisher, url: s.url, terms: s.terms, how_fetched: s.howFetched, kind: s.kind,
      ref_source: s.refSource, scope: s.scope, unmatched: s.unmatched, fill: s.fill, rank: s.rank, system: s.system, company: s.company,
      also: s.also?.length ? s.also : null,
    });
  }
  return [...seen.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** What the migration carries for each place: only what the SQL reads. */
export function placesForSql(file, registry) {
  const employers = new Map();
  for (const e of registry.employers) {
    employers.set(String(e.employer).toLowerCase(), e);
    employers.set(String(e.slug).toLowerCase(), e);
  }
  return file.places.map((place) => {
    const employer = employers.get(place.employer.toLowerCase());
    return {
      source: `postings-${employer.slug}`,
      employer: employer.employer,
      city: text(place.city),
      state: place.state,
      decision: place.decision,
      ...(place.decision === 'point'
        ? { company: text(place.company), plant: text(place.plant), ...(place.plantCity ? { plantCity: text(place.plantCity) } : {}) }
        : { kind: text(place.kind) }),
    };
  });
}

const SQL = String.raw`
-- One line in load_log. A line marked once is written only when the same line is not there yet, so a run that finds
-- nothing to do writes nothing.
CREATE OR REPLACE FUNCTION pg_temp.pp_log(p_action text, p_look boolean, p_company text, p_plant text, p_detail text, p_source text, p_id uuid, p_once boolean)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO load_log (load, kind, action, look, company, plant, detail, source_id, entity_id)
  SELECT 'posting-places', 'place', p_action, p_look, p_company, p_plant, p_detail, p_source, p_id
  WHERE NOT p_once OR NOT EXISTS (
    SELECT 1 FROM load_log l WHERE l.load = 'posting-places' AND l.action = p_action AND l.source_id IS NOT DISTINCT FROM p_source
      AND l.detail IS NOT DISTINCT FROM p_detail)
$f$;

-- Whether a person has decided this place in Admin Tools: pointed it, left it, or took a decision back (a decision too).
-- The audit line is the mark: Admin Tools writes one for each, with the person, the employer and the place.
CREATE OR REPLACE FUNCTION pg_temp.pp_person_decided(p_employer text, p_where text) RETURNS boolean LANGUAGE sql STABLE AS $f$
  SELECT EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.kind IN ('factory', 'company')
      AND a.action IN ('postings pointed here', 'postings place left', 'postings place waits again')
      AND (a.actor_id IS NOT NULL OR btrim(a.actor_name) <> '')
      AND lower(a.detail->>'place') = lower(p_where)
      AND lower(a.detail->>'employer') = lower(p_employer))
$f$;

-- The employers' sources, for a database whose runner has not met them yet: written as the runner writes them, and an
-- existing one is never changed.
CREATE OR REPLACE FUNCTION pg_temp.pp_sources(data jsonb) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  s jsonb;
BEGIN
  FOR s IN SELECT x FROM jsonb_array_elements(data->'sources') x LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM intake_sources WHERE slug = s->>'slug');
    INSERT INTO intake_sources (slug, name, publisher, url, terms, how_fetched, kind, ref_source, scope, unmatched, fill, rank, ranks, system, company, also)
      VALUES (s->>'slug', s->>'name', s->>'publisher', s->>'url', s->>'terms', s->>'how_fetched', s->>'kind', s->>'ref_source', s->>'scope',
              s->>'unmatched', s->>'fill', (s->>'rank')::smallint, '{}'::jsonb, s->>'system', s->>'company',
              CASE WHEN jsonb_typeof(s->'also') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(s->'also')) END)
      ON CONFLICT (slug) DO NOTHING;
    PERFORM pg_temp.pp_log('source registered', false, s->>'company', NULL,
      'the employer''s postings had not been run on this database: its source is written as the runner writes it, so its places are decided',
      s->>'slug', NULL, true);
  END LOOP;
END $f$;

CREATE OR REPLACE FUNCTION pg_temp.pp_decide(data jsonb) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  p jsonb;
  v_key text;
  v_where text;
  r posting_places%ROWTYPE;
  v_plant uuid;
  v_name text;
  v_found integer;
  v_company record;
  v_written integer;
BEGIN
  PERFORM set_config('client_min_messages', 'warning', true);
  FOR p IN SELECT x FROM jsonb_array_elements(data->'places') x LOOP
    v_key := posting_place_key(p->>'city', p->>'state');
    v_where := format('%s, %s', p->>'city', p->>'state');
    IF NOT EXISTS (SELECT 1 FROM intake_sources WHERE slug = p->>'source') THEN
      PERFORM pg_temp.pp_log('no source', true, p->>'employer', NULL,
        format('%s: the employer has no source here: nothing written', v_where), p->>'source', NULL, true);
      CONTINUE;
    END IF;
    SELECT * INTO r FROM posting_places WHERE source = p->>'source' AND place_key = v_key;
    IF r.decided_by IS NOT NULL OR pg_temp.pp_person_decided(p->>'employer', v_where) THEN
      PERFORM pg_temp.pp_log('left as a person decided', false, p->>'employer', NULL,
        format('%s: %s in Admin Tools; the file would have it %s', v_where, coalesce(r.status, 'decided'), CASE WHEN p->>'decision' = 'point' THEN 'pointed' ELSE 'left' END),
        p->>'source', r.factory_id, true);
      CONTINUE;
    END IF;

    IF p->>'decision' = 'point' THEN
      -- The plant, by its company and exact name, among the employer's own companies (posting_companies) and in the place's state.
      SELECT count(*), min(f.id::text)::uuid, min(f.name) INTO v_found, v_plant, v_name
      FROM factories f JOIN companies c ON c.id = f.company_id
      WHERE (lower(c.name) = lower(p->>'company') OR EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE lower(a) = lower(p->>'company')))
        AND c.id IN (SELECT company_id FROM posting_companies(p->>'source'))
        AND lower(f.name) = lower(p->>'plant')
        AND (p->>'plantCity' IS NULL OR posting_city_key(f.city) = posting_city_key(p->>'plantCity'))
        AND f.state = p->>'state';
      IF v_found <> 1 THEN
        PERFORM pg_temp.pp_log('plant not found', true, p->>'company', p->>'plant',
          format('%s: %s plants of "%s" in %s are named so%s; the place is left waiting', v_where, v_found, p->>'company', p->>'state',
                 coalesce(' in ' || (p->>'plantCity'), '')), p->>'source', NULL, true);
        CONTINUE;
      END IF;
      CONTINUE WHEN r.status = 'pointed' AND record_now('factory', r.factory_id) = v_plant;
      INSERT INTO posting_places (source, place_key, city, state, status, factory_id, decided_at, decided_by)
        VALUES (p->>'source', v_key, p->>'city', p->>'state', 'pointed', v_plant, now(), NULL)
      ON CONFLICT (source, place_key) DO UPDATE SET status = 'pointed', factory_id = EXCLUDED.factory_id, decided_at = now(), decided_by = NULL
        WHERE posting_places.decided_by IS NULL;
      GET DIAGNOSTICS v_written = ROW_COUNT;
      CONTINUE WHEN v_written = 0;
      PERFORM pg_temp.pp_log('pointed', false, p->>'company', v_name, format('%s is this plant: its postings are jobs here', v_where), p->>'source', v_plant, false);
      INSERT INTO audit_log (actor_id, actor_name, kind, record_id, record_name, action, detail)
        VALUES (NULL, '', 'factory', v_plant, v_name, 'postings pointed here', jsonb_build_object('employer', p->>'employer', 'place', v_where));
    ELSE
      CONTINUE WHEN r.status = 'left';
      INSERT INTO posting_places (source, place_key, city, state, status, factory_id, decided_at, decided_by)
        VALUES (p->>'source', v_key, p->>'city', p->>'state', 'left', NULL, now(), NULL)
      ON CONFLICT (source, place_key) DO UPDATE SET status = 'left', factory_id = NULL, decided_at = now(), decided_by = NULL
        WHERE posting_places.decided_by IS NULL;
      GET DIAGNOSTICS v_written = ROW_COUNT;
      CONTINUE WHEN v_written = 0;
      PERFORM pg_temp.pp_log('left', false, p->>'employer', NULL, format('%s is not a plant: %s', v_where, p->>'kind'), p->>'source', NULL, false);
      SELECT c.id, c.name INTO v_company FROM companies c JOIN posting_companies(p->>'source') pc ON pc.company_id = c.id AND pc.named ORDER BY c.name LIMIT 1;
      INSERT INTO audit_log (actor_id, actor_name, kind, record_id, record_name, action, detail)
        VALUES (NULL, '', 'company', v_company.id, coalesce(v_company.name, p->>'employer'), 'postings place left',
                jsonb_build_object('employer', p->>'employer', 'place', v_where, 'kind', p->>'kind'));
    END IF;
  END LOOP;
END $f$;

-- The jobs, in line with the data as it now stands (the plants 0065 added, the rows 0066 moved, the places above), for
-- every employer with an applied run: what Admin Tools does when a person points a place, journalled under that run.
-- The waiting list is resolved first; then each place whose postings would be placed otherwise than their jobs are
-- (no job yet, or the job on another plant) is applied, which closes nothing. A job that is left on a plant that is
-- not the employer's is said with look: the next run closes or moves it.
CREATE OR REPLACE FUNCTION pg_temp.pp_jobs() RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  s record;
  v_place text;
  v_ref text;
  v_places integer;
  v_left integer;
  v_got jsonb;
  n_added integer;
  n_changed integer;
BEGIN
  FOR s IN SELECT r.source, max(r.id) AS run FROM intake_runs r JOIN intake_sources x ON x.slug = r.source AND x.kind = 'job'
           WHERE r.state = 'applied' GROUP BY r.source ORDER BY r.source LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM posting_companies(s.source) WHERE named);
    -- posting_resolve leaves what posting_decide says of every posting in posting_decided: the plan to compare with.
    PERFORM posting_resolve(s.source, s.run);
    SELECT ref_source INTO v_ref FROM intake_sources WHERE slug = s.source;
    v_places := 0; n_added := 0; n_changed := 0;
    FOR v_place IN
      SELECT DISTINCT d.place_key FROM posting_decided d
      LEFT JOIN external_references x ON x.source = v_ref AND x.entity_type = 'jobs' AND NOT x.duplicate AND x.external_id = d.source_id || '@' || d.place_key
      LEFT JOIN jobs j ON j.id = x.entity_id
      WHERE d.factory_id IS NOT NULL AND d.occupation_id IS NOT NULL
        AND (j.id IS NULL OR j.factory_id IS DISTINCT FROM d.factory_id OR j.company_id IS DISTINCT FROM d.company_id
             -- A job a run closed for want of a plant, whose posting the data now places: opened again, as the run would.
             OR (j.status <> 'open' AND j.closed_reason = 'No longer on the company''s careers site'))
      ORDER BY 1
    LOOP
      v_got := posting_apply(s.source, s.run, v_place);
      n_added := n_added + (v_got->>'added')::integer;
      n_changed := n_changed + (v_got->>'changed')::integer + (v_got->>'reopened')::integer;
      v_places := v_places + 1;
    END LOOP;
    IF v_places > 0 THEN
      PERFORM pg_temp.pp_log('jobs in line', false, (SELECT company FROM intake_sources WHERE slug = s.source), NULL,
        format('%s %s, under run %s: %s %s added, %s moved or opened again', v_places, CASE WHEN v_places = 1 THEN 'place' ELSE 'places' END,
               s.run, n_added, CASE WHEN n_added = 1 THEN 'job' ELSE 'jobs' END, n_changed), s.source, NULL, false);
    END IF;
    SELECT count(*) INTO v_left FROM jobs j JOIN factories f ON f.id = j.factory_id
      WHERE j.source = s.source AND j.status = 'open' AND f.company_id NOT IN (SELECT company_id FROM posting_companies(s.source));
    IF v_left > 0 THEN
      PERFORM pg_temp.pp_log('jobs on another firm''s plant', true, (SELECT company FROM intake_sources WHERE slug = s.source), NULL,
        format('%s open %s on a plant that is not the employer''s now: the next run closes or moves %s', v_left,
               CASE WHEN v_left = 1 THEN 'job is' ELSE 'jobs are' END, CASE WHEN v_left = 1 THEN 'it' ELSE 'them' END), s.source, NULL, true);
    END IF;
  END LOOP;
END $f$;
`;

const quote = (body, tag) => {
  if (body.includes(`$${tag}$`)) throw new Error(`the text contains $${tag}$ and cannot be quoted with it`);
  return `$${tag}$${body}$${tag}$`;
};

/** The migration's SQL for a file. */
export function buildSql(file, registry, source = 'data/employers/places.json') {
  return [
    `-- Places employers' postings name, decided by the data: ${source},`,
    '-- generated by scripts/build-posting-places-sql.mjs. Edit the JSON and regenerate; do not edit this file by hand.',
    "-- A place is pointed at the plant it is, or left (not a plant), as Admin Tools would; a person's decision is never changed.",
    '-- posting_decide takes one rule more (scripts/posting-decide.sql), and the jobs are brought in line with the data.',
    "-- What it decided is in load_log (load 'posting-places'; the lines with look = true are the ones to read).",
    '-- Safe to run again: a place already decided so is left as it is, and nothing is written.',
    '',
    readFileSync(DECIDE, 'utf8').trimEnd(),
    SQL.trimEnd(),
    '',
    `SELECT pg_temp.pp_sources(${quote(JSON.stringify({ sources: sourcesForSql(file, registry) }), 'pp_sources')}::jsonb);`,
    `SELECT pg_temp.pp_decide(${quote(JSON.stringify({ places: placesForSql(file, registry) }), 'pp_data')}::jsonb);`,
    'SELECT pg_temp.pp_jobs();',
    '',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let out = null;
  let check = false;
  let input = FILE;
  let registryFile = REGISTRY;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--check') check = true;
    else if (args[i] === '--registry') registryFile = args[++i];
    else if (args[i].startsWith('--')) throw new Error(`unknown option ${args[i]}`);
    else input = args[i];
  }
  const [file, registry, plants] = await Promise.all([
    readFile(input, 'utf8').then(JSON.parse),
    readFile(registryFile, 'utf8').then(JSON.parse),
    researchPlants(),
  ]);
  const problems = checkPlaces(file, registry, plants);
  const count = (decision) => file.places?.filter((place) => place.decision === decision).length ?? 0;
  console.error(`${path.basename(input)}: ${file.places?.length ?? 0} places, ${count('point')} pointed at a plant and ${count('leave')} left.`);
  for (const line of problems) console.error(`  problem: ${line}`);
  if (problems.length) process.exit(1);
  if (check) return;
  const sql = buildSql(file, registry, path.relative(ROOT, input));
  if (out) await writeFile(out, sql);
  else process.stdout.write(sql);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
