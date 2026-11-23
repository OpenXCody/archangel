// Turns the military careers' files (data/careers/military/) into idempotent SQL
// migrations.
//
//   node scripts/build-military-sql.mjs --check            validate the files; writes nothing
//   node scripts/build-military-sql.mjs employers [out]    the four services as companies (0062)
//
// A military job (a Navy rating, an Army MOS, an Air Force specialty) is a
// career, and each service is an employer: a row in `companies` whose
// `service` says which (migration 0061). The files are kept apart from the
// civilian catalogue (data/careers/catalogue.json and paths.json), so nothing
// that reads the civilian files ever sees a military career.
//
// employers.json: the four services. --check fails unless each has a name, a
// service key that is one of the four (once each), a bare domain, a well
// formed slug, a description and a headquarters of city, state and country.
//
// Each migration cannot see the database it will run on, so it decides there,
// in SQL, and writes each decision to load_log (look = true on the lines a
// person should read). Applied a second time it changes nothing.
//
// The employers' migration (load 'military-employers'):
//   - a service is the company that already carries its key, else the company
//     with exactly its name, in any letter case, else a new company. It is
//     never found by a name that only resembles it ("US Marine" makes boats);
//   - the company's `service` is set; its slug, domain, description and
//     headquarters are filled only where it has none (a slug another company
//     has is left unset);
//   - a company that carries a different service under one of these names is
//     left alone, and said;
//   - it adds no plant: a service has none.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MILITARY_DIR = 'data/careers/military';
/** The services a company can be, as migration 0061's check and shared/military.ts name them. */
export const SERVICE_KEYS = ['navy', 'army', 'air-force', 'marine-corps'];

const text = (value) => typeof value === 'string' && value.trim().length > 0 && value === value.trim();
const BARE_DOMAIN = /^(?!www\.)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Everything wrong with the employers file, as sentences. None means it can be loaded. */
export function employerProblems(file) {
  const problems = [];
  const companies = Array.isArray(file?.companies) ? file.companies : [];
  if (companies.length === 0) problems.push('"companies" is empty');
  const names = new Set();
  const services = new Set();
  const slugs = new Set();
  for (const company of companies) {
    if (!text(company?.name)) {
      problems.push(`a company has no name: ${JSON.stringify(company?.name)}`);
      continue;
    }
    const where = `"${company.name}"`;
    if (names.has(company.name.toLowerCase())) problems.push(`${where} is listed twice`);
    names.add(company.name.toLowerCase());
    if (!SERVICE_KEYS.includes(company.service)) problems.push(`${where} has service ${JSON.stringify(company.service)}: a service is one of ${SERVICE_KEYS.join(', ')}`);
    else if (services.has(company.service)) problems.push(`${where}: the service "${company.service}" is listed twice`);
    services.add(company.service);
    if (typeof company.slug !== 'string' || !SLUG.test(company.slug)) problems.push(`${where}: slug ${JSON.stringify(company.slug)} is not lowercase words joined by hyphens`);
    else if (slugs.has(company.slug)) problems.push(`${where}: the slug "${company.slug}" is used twice`);
    slugs.add(company.slug);
    if (typeof company.domain !== 'string' || !BARE_DOMAIN.test(company.domain)) problems.push(`${where}: ${JSON.stringify(company.domain)} is not a bare domain such as example.com`);
    if (!text(company.description)) problems.push(`${where} needs a description`);
    const hq = company.headquarters;
    if (!text(hq?.city) || !/^[A-Z]{2}$/.test(hq?.state ?? '') || !/^[A-Z]{2}$/.test(hq?.country ?? '')) {
      problems.push(`${where}: headquarters are a city, a two-letter state and a two-letter country`);
    }
    const extra = Object.keys(company).filter((key) => !['name', 'service', 'slug', 'domain', 'description', 'headquarters'].includes(key));
    if (extra.length > 0) problems.push(`${where}: unknown key ${extra.map((key) => `"${key}"`).join(', ')} (tags are derived from the service, and careers are counted)`);
  }
  return problems;
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
// One row to a line, so a diff of the migration reads like a diff of the file.
const values = (rows) => rows.map((row, i) => `  (${row.join(', ')})${i === rows.length - 1 ? ';' : ','}`);

/** The employers' migration. `source` is the file's name, for the header. */
export function employersSql(file, source) {
  const rows = file.companies.map((company, i) => [
    i + 1,
    q(company.name),
    q(company.service),
    q(company.slug),
    q(company.domain),
    q(company.description.trim()),
    q(company.headquarters.city),
    q(company.headquarters.state),
    q(company.headquarters.country),
  ]);
  return [
    `-- The military services as employers, generated from ${source}`,
    '-- by scripts/build-military-sql.mjs. Edit the JSON and regenerate; do not edit this file by hand.',
    '-- Idempotent: applied a second time it changes nothing.',
    '--',
    `-- ${rows.length} companies, one for each service, with no plants. A service is the company that already`,
    '-- carries its key (companies.service, migration 0061), else the company with exactly its name in any',
    '-- letter case, else a new company. What it decided on this database is in load_log (load',
    "-- 'military-employers'; the lines with look = true are the ones to read).",
    '',
    '-- The file, as rows -------------------------------------------------------------',
    '',
    'DROP TABLE IF EXISTS pg_temp.mil_employers;',
    'CREATE TEMP TABLE mil_employers (position integer PRIMARY KEY, name text NOT NULL, service text NOT NULL UNIQUE, slug text NOT NULL,',
    '  domain text NOT NULL, description text NOT NULL, hq_city text NOT NULL, hq_state text NOT NULL, hq_country text NOT NULL);',
    '',
    'INSERT INTO mil_employers (position, name, service, slug, domain, description, hq_city, hq_state, hq_country) VALUES',
    ...values(rows),
    '',
    '-- One line of the log.',
    `CREATE OR REPLACE FUNCTION pg_temp.mil_log(p_action text, p_look boolean, p_company text, p_detail text, p_id uuid) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO load_log (load, kind, action, look, company, detail, entity_id) VALUES ('military-employers', 'company', p_action, p_look, p_company, p_detail, p_id)
$f$;`,
    '',
    '-- The services --------------------------------------------------------------------',
    '',
    `DO $load$
DECLARE
  e record;
  v_id uuid;
  v_name text;
  v_service text;
  v_plants integer;
  v_filled text[];
  n_created integer := 0;
  n_found integer := 0;
  n_kept integer := 0;
  n_refused integer := 0;
BEGIN
  FOR e IN SELECT * FROM mil_employers ORDER BY position LOOP
    v_id := NULL;
    -- The company that already is this service, whatever it is called now.
    SELECT c.id, c.name, c.service INTO v_id, v_name, v_service FROM companies c WHERE c.service = e.service;
    IF v_id IS NULL THEN
      -- Else the company with exactly this name, in any letter case: the one written this way first.
      SELECT c.id, c.name, c.service INTO v_id, v_name, v_service FROM companies c
        WHERE lower(c.name) = lower(e.name)
        ORDER BY (c.name = e.name) DESC, c.created_at, c.id LIMIT 1;
      IF v_id IS NOT NULL AND v_service IS NOT NULL THEN
        -- It carries another service's key: neither is changed.
        n_refused := n_refused + 1;
        PERFORM pg_temp.mil_log('not set', true, v_name, format('%s is stored as the service "%s". It was not made "%s", and no company is', v_name, v_service, e.service), v_id);
        CONTINUE;
      END IF;
    END IF;

    IF v_id IS NULL THEN
      INSERT INTO companies (name, service, slug, domain, description, headquarters_city, headquarters_state, headquarters_country)
        VALUES (e.name, e.service, (SELECT e.slug WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.slug = e.slug)),
                e.domain, e.description, e.hq_city, e.hq_state, e.hq_country)
        RETURNING id INTO v_id;
      n_created := n_created + 1;
      PERFORM pg_temp.mil_log('created', false, e.name, format('%s: no company has that name. Created as the service "%s", with no plants', e.name, e.service), v_id);
      CONTINUE;
    END IF;

    SELECT COUNT(*)::int INTO v_plants FROM factories f WHERE f.company_id = v_id;
    -- What the stored company lacks and the file has.
    SELECT array_remove(ARRAY[
        CASE WHEN c.slug IS NULL AND NOT EXISTS (SELECT 1 FROM companies o WHERE o.slug = e.slug) THEN 'slug' END,
        CASE WHEN c.domain IS NULL OR btrim(c.domain) = '' THEN 'domain' END,
        CASE WHEN c.description IS NULL OR btrim(c.description) = '' THEN 'description' END,
        CASE WHEN c.headquarters_city IS NULL OR btrim(c.headquarters_city) = '' THEN 'headquarters' END
      ], NULL) INTO v_filled FROM companies c WHERE c.id = v_id;
    UPDATE companies c SET
        service = e.service,
        slug = CASE WHEN 'slug' = ANY (v_filled) THEN e.slug ELSE c.slug END,
        domain = CASE WHEN 'domain' = ANY (v_filled) THEN e.domain ELSE c.domain END,
        description = CASE WHEN 'description' = ANY (v_filled) THEN e.description ELSE c.description END,
        headquarters_city = CASE WHEN 'headquarters' = ANY (v_filled) THEN e.hq_city ELSE c.headquarters_city END,
        headquarters_state = CASE WHEN 'headquarters' = ANY (v_filled) THEN e.hq_state ELSE c.headquarters_state END,
        headquarters_country = CASE WHEN 'headquarters' = ANY (v_filled) THEN e.hq_country ELSE c.headquarters_country END,
        updated_at = now()
      WHERE c.id = v_id AND (c.service IS DISTINCT FROM e.service OR cardinality(v_filled) > 0);
    IF v_service = e.service THEN
      n_kept := n_kept + 1;
      -- Already the service: nothing to look at. Said only when something was filled or it goes by another name.
      IF cardinality(v_filled) > 0 OR lower(v_name) <> lower(e.name) THEN
        PERFORM pg_temp.mil_log('kept', false, v_name, format('%s is the service "%s"%s%s', v_name, e.service,
          CASE WHEN lower(v_name) <> lower(e.name) THEN format(' (the file calls it %s; the stored name is kept)', e.name) ELSE '' END,
          CASE WHEN cardinality(v_filled) > 0 THEN '; filled: ' || array_to_string(v_filled, ', ') ELSE '' END), v_id);
      END IF;
    ELSE
      n_found := n_found + 1;
      -- A company that was here before is now a service: somebody should look, most of all if it has plants.
      PERFORM pg_temp.mil_log('found', true, v_name, format('%s was stored already%s. It is now the service "%s"%s', v_name,
        CASE WHEN v_plants > 0 THEN format(', with %s plants, which a service does not have', v_plants) ELSE ', with no plants' END, e.service,
        CASE WHEN cardinality(v_filled) > 0 THEN '; filled: ' || array_to_string(v_filled, ', ') ELSE '' END), v_id);
    END IF;
  END LOOP;

  PERFORM pg_temp.mil_log('summary', false, NULL, format('%s services of the file: %s created, %s found by name, %s already stored as the service, %s not set; companies that are a service: %s',
    (SELECT COUNT(*) FROM mil_employers), n_created, n_found, n_kept, n_refused, (SELECT COUNT(*) FROM companies WHERE service IS NOT NULL)), NULL);
END $load$;`,
    '',
    'DROP FUNCTION pg_temp.mil_log(text, boolean, text, text, uuid);',
    'DROP TABLE pg_temp.mil_employers;',
    '',
  ].join('\n');
}

const json = async (file) => JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
const DEFAULT_OUTPUT = { employers: 'migrations/0062_military_employers.sql' };

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const [what, output] = args.filter((arg) => !arg.startsWith('--'));
  const employersFile = `${MILITARY_DIR}/employers.json`;
  const employers = await json(employersFile);
  const problems = employerProblems(employers).map((problem) => `${employersFile}: ${problem}`);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
    process.exit(1);
  }
  const summary = `${employers.companies.length} services`;
  if (checkOnly) {
    console.log(`${MILITARY_DIR}: valid. ${summary}.`);
    return;
  }
  if (what !== 'employers') {
    console.error('usage: node scripts/build-military-sql.mjs --check | employers [output.sql]');
    process.exit(1);
  }
  const out = output ?? DEFAULT_OUTPUT[what];
  const sql = employersSql(employers, employersFile);
  await writeFile(out, sql);
  console.log(`${out}: ${sql.split('\n').length} lines. ${summary}.`);
}

// Run only when started as a script: the unit checks import the functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
