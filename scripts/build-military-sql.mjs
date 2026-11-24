// Turns the military careers' files (data/careers/military/) into idempotent SQL
// migrations.
//
//   node scripts/build-military-sql.mjs --check            validate the files; writes nothing
//   node scripts/build-military-sql.mjs --report           the same check, then the figures behind it
//   node scripts/build-military-sql.mjs employers [out]    the four services as companies (0062 first, 0077 now)
//   node scripts/build-military-sql.mjs careers [out]      the careers, each with its service and code (0063)
//   node scripts/build-military-sql.mjs paths [out]        each career's skills, every path a draft (0064)
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
// `descriptionWas`, when there, lists the file's earlier descriptions (none
// of them the description); `sources`, when there, are notes for the data on
// where the description was read, and are not loaded.
//
// careers.json: the careers. --check fails unless:
//   - every career has a title, a `what`, a home that is a domain of the
//     taxonomy, a service that has a code system, that system, a code and the
//     service's own title, and its title is that title with the service in
//     front ("Navy Electronics Technician");
//   - a title or other name appears once in the file, in any letter case, and
//     is not a title, a folded title, a removed title or an everyday name of
//     the civilian catalogue (data/careers/catalogue.json, aliases.json);
//   - a code appears once within its system;
//   - no career has `leadsTo`, `tags`, `kind`, `employer` or `reaches`: a
//     ladder is curated and none is yet, and the rest are derived or computed.
//
// paths.json: one path per career. --check fails unless every career has
// exactly one entry and no entry names anything else; every skill is a kept
// skill of the skills catalogue, placed in the taxonomy, once; a path has at
// least PATH_FLOOR skills (a military career is listed when five apply) and
// one from the career's home domain; and every entry says where it was read
// from (`basis`).
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
//   - its description is also replaced where it is still, word for word, one
//     of the file's earlier descriptions (`descriptionWas`): one a person
//     wrote is kept;
//   - a company that carries a different service under one of these names is
//     left alone, and said;
//   - it adds no plant: a service has none.
//
// The careers' migration (load 'military-careers'):
//   - a career is the stored career that already carries its code in its
//     system, else the one with exactly its title in any letter case, else a
//     new career. One found by title that is a civilian career (no service) is
//     left alone, and said: a military career never takes a civilian one over;
//   - it takes the file's title, `what`, home, service, code and the service's
//     own title. Its path, its path's state, its goals and jobs are not touched;
//   - each other name is added unless it is some career's title or another
//     career's other name, which is said;
//   - a career whose service is not stored is said and skipped; a stored
//     military career the file does not name is left alone, and said;
//   - it writes no ladder link and no industry: a military career is typical
//     of no industry, and is on no ladder until one is curated.
//
// The paths' migration (load 'military-paths') is the civilian paths' own
// (scripts/build-career-paths-sql.mjs): each career of the file gets exactly
// the file's skills and becomes a draft; a path a person approved is left
// exactly as it is and the log says what the file would change.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pathSql } from './build-career-paths-sql.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MILITARY_DIR = 'data/careers/military';
/** The services a company can be, as migration 0061's check and shared/military.ts name them. */
export const SERVICE_KEYS = ['navy', 'army', 'air-force', 'marine-corps'];

/**
 * The systems a career's code can be in, each one service's, with the service
 * as it stands in front of a title. As migration 0061's check and
 * shared/military.ts name them (a unit check holds the three together).
 */
export const CODE_SYSTEMS = [
  { key: 'navy-rating', service: 'navy', short: 'Navy' },
  { key: 'army-mos', service: 'army', short: 'Army' },
  { key: 'afsc', service: 'air-force', short: 'Air Force' },
];
/** The fewest skills a military career's path has: it is listed when five catalogue skills apply. */
export const PATH_FLOOR = 5;

const text = (value) => typeof value === 'string' && value.trim().length > 0 && value === value.trim();
const sentence = (value) => text(value) && !/[\r\n]/.test(value);
const lower = (value) => String(value).toLowerCase();
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
    if (company.descriptionWas !== undefined) {
      if (!Array.isArray(company.descriptionWas) || !company.descriptionWas.every(sentence)) problems.push(`${where}: "descriptionWas" is a list of the file's earlier descriptions, each one line`);
      else if (company.descriptionWas.includes(company.description)) problems.push(`${where}: "descriptionWas" names the description itself`);
      else if (new Set(company.descriptionWas).size < company.descriptionWas.length) problems.push(`${where}: "descriptionWas" names a description twice`);
    }
    if (company.sources !== undefined && (!Array.isArray(company.sources) || !company.sources.every(sentence))) problems.push(`${where}: "sources" is a list of lines`);
    const hq = company.headquarters;
    if (!text(hq?.city) || !/^[A-Z]{2}$/.test(hq?.state ?? '') || !/^[A-Z]{2}$/.test(hq?.country ?? '')) {
      problems.push(`${where}: headquarters are a city, a two-letter state and a two-letter country`);
    }
    const extra = Object.keys(company).filter((key) => !['name', 'service', 'slug', 'domain', 'description', 'descriptionWas', 'headquarters', 'sources'].includes(key));
    if (extra.length > 0) problems.push(`${where}: unknown key ${extra.map((key) => `"${key}"`).join(', ')} (tags are derived from the service, and careers are counted)`);
  }
  return problems;
}

/** Every name the civilian catalogue uses for a career, in lower case: titles, folded titles, removed titles and everyday names. */
export function civilianNames(catalogue, aliases) {
  const names = new Set();
  for (const career of catalogue?.careers ?? []) {
    names.add(lower(career.title));
    for (const was of career.was ?? []) names.add(lower(was));
  }
  for (const group of catalogue?.removed ?? []) for (const title of group.titles ?? []) names.add(lower(title));
  for (const entry of aliases?.careers ?? []) {
    for (const key of ['names', 'aliases', 'not']) for (const name of Array.isArray(entry?.[key]) ? entry[key] : []) names.add(lower(name));
  }
  return names;
}

/** Everything wrong with the careers file, as sentences. None means it can be loaded. */
export function careerProblems(file, taxonomy, employers, civilian) {
  const problems = [];
  const careers = Array.isArray(file?.careers) ? file.careers : [];
  if (careers.length === 0) problems.push('"careers" is empty');
  const domains = new Set((taxonomy?.domains ?? []).map((domain) => domain.slug));
  const services = new Set((employers?.companies ?? []).map((company) => company.service));
  const used = new Map();
  const use = (name, where) => {
    if (!text(name)) {
      problems.push(`${where}: ${JSON.stringify(name)} is not a name`);
      return;
    }
    if (used.has(lower(name))) problems.push(`"${name}" is used twice: ${used.get(lower(name))} and ${where}`);
    else used.set(lower(name), where);
    if (civilian.has(lower(name))) problems.push(`"${name}" (${where}) is a name of the civilian catalogue: a military career's names are its own`);
  };
  const codes = new Set();
  for (const career of careers) {
    if (!text(career?.title)) {
      problems.push(`a career has no title: ${JSON.stringify(career?.title)}`);
      continue;
    }
    const where = `"${career.title}"`;
    use(career.title, 'a career');
    if (!text(career.what)) problems.push(`${where} needs a "what"`);
    if (!domains.has(career.home)) problems.push(`${where} has home ${JSON.stringify(career.home)}, which is not a domain of the taxonomy`);
    const system = CODE_SYSTEMS.find((item) => item.key === career.codeSystem);
    if (!system) problems.push(`${where} has code system ${JSON.stringify(career.codeSystem)}: a code system is one of ${CODE_SYSTEMS.map((item) => item.key).join(', ')}`);
    else if (system.service !== career.service) problems.push(`${where}: the code system "${career.codeSystem}" is not the service "${career.service}"'s`);
    if (!services.has(career.service)) problems.push(`${where} has service ${JSON.stringify(career.service)}, which is not an employer of employers.json`);
    if (!text(career.code) || career.code.length > 20) problems.push(`${where} needs a code of up to 20 characters`);
    else if (codes.has(`${career.codeSystem} ${lower(career.code)}`)) problems.push(`${where}: the code "${career.code}" is used twice in ${career.codeSystem}`);
    codes.add(`${career.codeSystem} ${lower(career.code ?? '')}`);
    if (!text(career.officialTitle)) problems.push(`${where} needs "officialTitle": the service's own name for the job`);
    else if (system && career.title !== `${system.short} ${career.officialTitle}`) problems.push(`${where}: a title is the service in front of the service's own title, "${system.short} ${career.officialTitle}"`);
    if (!Array.isArray(career.was)) problems.push(`${where}: "was" must be a list (an empty one when it has no other name)`);
    else for (const was of career.was) use(was, `"was" of ${where}`);
    if (career.source !== undefined && !sentence(career.source)) problems.push(`${where}: "source" is where the code and title were read from`);
    const extra = Object.keys(career).filter((key) => !['title', 'officialTitle', 'service', 'code', 'codeSystem', 'home', 'what', 'was', 'source'].includes(key));
    if (extra.length > 0) problems.push(`${where}: unknown key ${extra.map((key) => `"${key}"`).join(', ')} (tags and the words above the name are derived, the careers it reaches are computed, and it has no ladder)`);
  }
  for (const gone of Array.isArray(file?.dropped) ? file.dropped : []) {
    if (!text(gone?.code) || !text(gone?.why)) problems.push('an entry under "dropped" needs a code and a "why"');
    else if (codes.has(`${gone.codeSystem} ${lower(gone.code)}`)) problems.push(`"${gone.code}" is dropped and is also a career`);
  }
  return problems;
}

/** Each skill's level and domain, from the taxonomy. */
function placed(taxonomy) {
  const place = new Map();
  for (const domain of taxonomy?.domains ?? []) {
    for (const group of domain.groups ?? []) for (const skill of group.skills ?? []) place.set(skill.name, { level: skill.level, domain: domain.slug });
  }
  return place;
}

/** Everything wrong with the paths file, as sentences. None means it can be loaded. */
export function militaryPathProblems(paths, careers, skills, taxonomy) {
  const problems = [];
  const entries = Array.isArray(paths?.careers) ? paths.careers : null;
  if (!entries) return ['"careers" must be a list of { title, basis, skills }'];
  const home = new Map((careers?.careers ?? []).map((career) => [career.title, career.home]));
  const known = new Set((skills?.skills ?? []).map((skill) => skill.name));
  const place = placed(taxonomy);
  const seen = new Set();
  for (const entry of entries) {
    const title = entry?.title;
    if (!text(title)) {
      problems.push('an entry has no "title"');
      continue;
    }
    const where = `"${title}"`;
    if (!home.has(title)) problems.push(`${where} is not a career of careers.json`);
    if (seen.has(title)) problems.push(`${where} has two entries`);
    seen.add(title);
    if (!sentence(entry.basis)) problems.push(`${where} does not say where its path was read from ("basis")`);
    const list = Array.isArray(entry.skills) ? entry.skills : null;
    if (!list) {
      problems.push(`${where} has no "skills" list`);
      continue;
    }
    const names = new Set();
    let atHome = 0;
    for (const name of list) {
      if (!text(name)) {
        problems.push(`${where}: ${JSON.stringify(name)} is not a skill name`);
        continue;
      }
      if (names.has(name)) problems.push(`${where} lists "${name}" twice`);
      names.add(name);
      if (!known.has(name)) problems.push(`${where}: "${name}" is not a skill in the catalogue`);
      else if (!place.has(name)) problems.push(`${where}: "${name}" is not placed in the taxonomy`);
      else if (place.get(name).domain === home.get(title)) atHome += 1;
    }
    if (names.size < PATH_FLOOR) problems.push(`${where} has ${names.size} skills; a military career is listed when at least ${PATH_FLOOR} apply`);
    if (home.has(title) && atHome === 0) problems.push(`${where} has no skill from its home domain, "${home.get(title)}"`);
    const extra = Object.keys(entry).filter((key) => !['title', 'basis', 'skills'].includes(key));
    if (extra.length > 0) problems.push(`${where}: unknown key ${extra.map((key) => `"${key}"`).join(', ')} (every path loads as a draft)`);
  }
  for (const title of home.keys()) if (!seen.has(title)) problems.push(`"${title}" is a career of careers.json and has no path`);
  return problems;
}

/**
 * The civilian careers each military career's path covers most: the share of
 * the civilian career's path its skills are on, as skills held of skills on
 * that path. Computed, never stored: the page computes the same from the
 * database. `top` is how many to give for each.
 */
export function reaches(militaryPaths, civilianPaths, top = 3) {
  const nameOf = (entry) => (typeof entry === 'string' ? entry : entry?.skill);
  const civilian = (civilianPaths?.careers ?? []).map((entry) => ({ career: entry.title, skills: new Set(entry.skills.map(nameOf)) }));
  const result = new Map();
  for (const entry of militaryPaths?.careers ?? []) {
    const mine = new Set(entry.skills);
    const ranked = civilian
      .map(({ career, skills }) => ({ career, held: [...skills].filter((skill) => mine.has(skill)).length, of: skills.size }))
      .filter((reach) => reach.held > 0)
      .sort((a, b) => b.held / b.of - a.held / a.of || b.held - a.held || a.career.localeCompare(b.career));
    result.set(entry.title, ranked.slice(0, top));
  }
  return result;
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
    `ARRAY[${(company.descriptionWas ?? []).map((was) => q(was.trim())).join(', ')}]::text[]`,
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
    '-- letter case, else a new company. Its slug, domain, description and headquarters are filled where it has',
    "-- none; its description is also replaced where it is still one of the file's earlier descriptions, and one",
    '-- a person wrote is kept. What it decided on this database is in load_log (load',
    "-- 'military-employers'; the lines with look = true are the ones to read).",
    '',
    '-- The file, as rows -------------------------------------------------------------',
    '',
    'DROP TABLE IF EXISTS pg_temp.mil_employers;',
    'CREATE TEMP TABLE mil_employers (position integer PRIMARY KEY, name text NOT NULL, service text NOT NULL UNIQUE, slug text NOT NULL,',
    '  domain text NOT NULL, description text NOT NULL, description_was text[] NOT NULL, hq_city text NOT NULL, hq_state text NOT NULL,',
    '  hq_country text NOT NULL);',
    '',
    'INSERT INTO mil_employers (position, name, service, slug, domain, description, description_was, hq_city, hq_state, hq_country) VALUES',
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
  v_newer boolean;
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
      ], NULL),
      -- A description the file gave before and nobody has changed since: the file's own words, brought up to date.
      coalesce(btrim(c.description) = ANY (e.description_was), false)
      INTO v_filled, v_newer FROM companies c WHERE c.id = v_id;
    UPDATE companies c SET
        service = e.service,
        slug = CASE WHEN 'slug' = ANY (v_filled) THEN e.slug ELSE c.slug END,
        domain = CASE WHEN 'domain' = ANY (v_filled) THEN e.domain ELSE c.domain END,
        description = CASE WHEN 'description' = ANY (v_filled) OR v_newer THEN e.description ELSE c.description END,
        headquarters_city = CASE WHEN 'headquarters' = ANY (v_filled) THEN e.hq_city ELSE c.headquarters_city END,
        headquarters_state = CASE WHEN 'headquarters' = ANY (v_filled) THEN e.hq_state ELSE c.headquarters_state END,
        headquarters_country = CASE WHEN 'headquarters' = ANY (v_filled) THEN e.hq_country ELSE c.headquarters_country END,
        updated_at = now()
      WHERE c.id = v_id AND (c.service IS DISTINCT FROM e.service OR cardinality(v_filled) > 0 OR v_newer);
    IF v_service = e.service THEN
      n_kept := n_kept + 1;
      -- Already the service: nothing to look at. Said only when something was filled or replaced, or it goes by another name.
      IF cardinality(v_filled) > 0 OR v_newer OR lower(v_name) <> lower(e.name) THEN
        PERFORM pg_temp.mil_log('kept', false, v_name, format('%s is the service "%s"%s%s%s', v_name, e.service,
          CASE WHEN lower(v_name) <> lower(e.name) THEN format(' (the file calls it %s; the stored name is kept)', e.name) ELSE '' END,
          CASE WHEN cardinality(v_filled) > 0 THEN '; filled: ' || array_to_string(v_filled, ', ') ELSE '' END,
          CASE WHEN v_newer THEN '; description: the file''s earlier one, replaced by the file''s' ELSE '' END), v_id);
      END IF;
    ELSE
      n_found := n_found + 1;
      -- A company that was here before is now a service: somebody should look, most of all if it has plants.
      PERFORM pg_temp.mil_log('found', true, v_name, format('%s was stored already%s. It is now the service "%s"%s%s', v_name,
        CASE WHEN v_plants > 0 THEN format(', with %s plants, which a service does not have', v_plants) ELSE ', with no plants' END, e.service,
        CASE WHEN cardinality(v_filled) > 0 THEN '; filled: ' || array_to_string(v_filled, ', ') ELSE '' END,
        CASE WHEN v_newer THEN '; description: the file''s earlier one, replaced by the file''s' ELSE '' END), v_id);
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

/** The careers' migration. `source` is the file's name, for the header. */
export function careersSql(file, source) {
  const insert = (table, columns, rows) => (rows.length > 0 ? [`INSERT INTO ${table} (${columns}) VALUES`, ...values(rows), ''] : []);
  const careerRows = file.careers.map((career, i) => [
    i + 1,
    q(career.title),
    q(career.officialTitle),
    q(career.service),
    q(career.code),
    q(career.codeSystem),
    q(career.home),
    q(career.what.trim()),
  ]);
  const wasRows = file.careers.flatMap((career) => career.was.map((was) => [q(career.title), q(was)]));
  return [
    `-- The military careers, generated from ${source}`,
    '-- by scripts/build-military-sql.mjs. Edit the JSON and regenerate; do not edit this file by hand.',
    '-- Idempotent: applied a second time it changes nothing.',
    '--',
    `-- ${careerRows.length} careers, each with its service, its code and the service's own title (migration 0061), and`,
    `-- ${wasRows.length} other names. Applied after the services (0062). A career is the stored career that already`,
    '-- carries its code, else the one with exactly its title in any letter case, else a new career. It writes',
    '-- no path (0064 does), no ladder link and no industry. What it decided on this database is in load_log',
    "-- (load 'military-careers'; the lines with look = true are the ones to read).",
    '',
    '-- The file, as rows -------------------------------------------------------------',
    '',
    'DROP TABLE IF EXISTS pg_temp.mil_careers, pg_temp.mil_was;',
    'CREATE TEMP TABLE mil_careers (position integer PRIMARY KEY, title text NOT NULL UNIQUE, official_title text NOT NULL, service text NOT NULL,',
    '  code text NOT NULL, code_system text NOT NULL, home text NOT NULL, what text NOT NULL, UNIQUE (code_system, code));',
    'CREATE TEMP TABLE mil_was (title text NOT NULL, was text NOT NULL);',
    '',
    ...insert('mil_careers', 'position, title, official_title, service, code, code_system, home, what', careerRows),
    ...insert('mil_was', 'title, was', wasRows),
    '-- One line of the log.',
    `CREATE OR REPLACE FUNCTION pg_temp.mil_log(p_action text, p_look boolean, p_detail text, p_id uuid) RETURNS void LANGUAGE sql AS $f$
  INSERT INTO load_log (load, kind, action, look, detail, entity_id) VALUES ('military-careers', 'career', p_action, p_look, p_detail, p_id)
$f$;`,
    '',
    '-- The careers -------------------------------------------------------------------',
    '',
    `DO $load$
DECLARE
  c record;
  m record;
  v_id uuid;
  v_title text;
  v_service uuid;
  v_employer uuid;
  v_other uuid;
  v_changed integer;
  -- A database with no military career is being loaded for the first time: a new career is nothing to look at.
  n_created integer := 0;
  n_found integer := 0;
  n_same integer := 0;
  n_skipped integer := 0;
  n_names integer := 0;
BEGIN
  FOR c IN SELECT * FROM mil_careers ORDER BY position LOOP
    -- Its employer: the company that is the service.
    v_employer := NULL;
    SELECT s.id INTO v_employer FROM companies s WHERE s.service = c.service;
    IF v_employer IS NULL THEN
      n_skipped := n_skipped + 1;
      PERFORM pg_temp.mil_log('no service', true, format('%s: no company is stored as the service "%s". The career was not written', c.title, c.service), NULL);
      CONTINUE;
    END IF;

    -- The career that already carries the code, else the one with exactly the title, in any letter case.
    v_id := NULL;
    SELECT o.id, o.title, o.service_company_id INTO v_id, v_title, v_service FROM occupations o
      WHERE o.code_system = c.code_system AND lower(o.code) = lower(c.code);
    IF v_id IS NULL THEN
      SELECT o.id, o.title, o.service_company_id INTO v_id, v_title, v_service FROM occupations o
        WHERE lower(o.title) = lower(c.title)
        ORDER BY (o.title = c.title) DESC, o.id LIMIT 1;
      IF v_id IS NOT NULL AND v_service IS NULL THEN
        -- A civilian career has the title. A military career never takes one over.
        n_skipped := n_skipped + 1;
        PERFORM pg_temp.mil_log('title taken', true, format('"%s" is stored as a civilian career. It was left as it is, and %s %s was not written', v_title, c.code_system, c.code), v_id);
        CONTINUE;
      END IF;
    ELSE
      -- It carries the code under another title. The file's title is taken unless another career has it.
      SELECT o.id INTO v_other FROM occupations o WHERE lower(o.title) = lower(c.title) AND o.id <> v_id LIMIT 1;
      IF v_other IS NOT NULL THEN
        n_skipped := n_skipped + 1;
        PERFORM pg_temp.mil_log('title taken', true, format('"%s" carries %s %s, and another career is titled "%s". Neither was changed', v_title, c.code_system, c.code, c.title), v_id);
        CONTINUE;
      END IF;
    END IF;

    IF v_id IS NULL THEN
      INSERT INTO occupations (title, description, home_domain, service_company_id, code, code_system, official_title)
        VALUES (c.title, c.what, (SELECT slug FROM skill_domains WHERE slug = c.home), v_employer, c.code, c.code_system, c.official_title)
        RETURNING id INTO v_id;
      n_created := n_created + 1;
      PERFORM pg_temp.mil_log('created', false, format('%s (%s %s)', c.title, c.code_system, c.code), v_id);
    ELSE
      UPDATE occupations o SET title = c.title, description = c.what, home_domain = (SELECT slug FROM skill_domains WHERE slug = c.home),
          service_company_id = v_employer, code = c.code, code_system = c.code_system, official_title = c.official_title
        WHERE o.id = v_id
          AND (o.title, o.description, o.home_domain, o.service_company_id, o.code, o.code_system, o.official_title)
            IS DISTINCT FROM (c.title, c.what, (SELECT slug FROM skill_domains WHERE slug = c.home), v_employer, c.code, c.code_system, c.official_title);
      GET DIAGNOSTICS v_changed = ROW_COUNT;
      IF v_changed = 0 THEN
        n_same := n_same + 1;
      ELSE
        n_found := n_found + 1;
        PERFORM pg_temp.mil_log('found', true, format('%s (%s %s) was stored already%s. Its title, description, home, service and code are now the file''s', c.title, c.code_system, c.code,
          CASE WHEN v_title <> c.title THEN format(' as "%s"', v_title) ELSE '' END), v_id);
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM skill_domains WHERE slug = c.home) THEN
      PERFORM pg_temp.mil_log('no home', true, format('%s: the domain "%s" is not stored', c.title, c.home), v_id);
    END IF;

    -- Its other names. One that is a career's title, or another career's other name, stays where it is.
    FOR m IN SELECT w.was FROM mil_was w WHERE w.title = c.title ORDER BY w.was COLLATE "C" LOOP
      IF EXISTS (SELECT 1 FROM occupation_aliases a WHERE lower(a.alias_text) = lower(m.was) AND a.canonical_occupation_id = v_id) THEN
        CONTINUE;
      ELSIF EXISTS (SELECT 1 FROM occupations o WHERE lower(o.title) = lower(m.was)) THEN
        PERFORM pg_temp.mil_log('name not added', true, format('"%s" was not added to %s: it is a career''s own title', m.was, c.title), v_id);
      ELSIF EXISTS (SELECT 1 FROM occupation_aliases a WHERE lower(a.alias_text) = lower(m.was)) THEN
        PERFORM pg_temp.mil_log('name not added', true, format('"%s" was not added to %s: it is another name of %s', m.was, c.title,
          (SELECT o.title FROM occupation_aliases a INNER JOIN occupations o ON o.id = a.canonical_occupation_id WHERE lower(a.alias_text) = lower(m.was) LIMIT 1)), v_id);
      ELSE
        INSERT INTO occupation_aliases (alias_text, canonical_occupation_id) VALUES (m.was, v_id);
        n_names := n_names + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- A military career the file does not name is left alone, and said.
  PERFORM pg_temp.mil_log('not in the file', true, format('"%s" (%s %s) is a military career the file does not name. Left as it is', o.title, o.code_system, o.code), o.id)
    FROM occupations o
    WHERE o.service_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mil_careers k WHERE k.title = o.title)
    ORDER BY o.title COLLATE "C";

  PERFORM pg_temp.mil_log('summary', false, format(
    '%s careers of the file: %s created, %s found and brought to the file''s, %s already as the file has them, %s not written; other names added: %s; military careers stored: %s, of them not in the file: %s; civilian careers: %s',
    (SELECT COUNT(*) FROM mil_careers), n_created, n_found, n_same, n_skipped, n_names,
    (SELECT COUNT(*) FROM occupations WHERE service_company_id IS NOT NULL),
    (SELECT COUNT(*) FROM occupations o WHERE o.service_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mil_careers k WHERE k.title = o.title)),
    (SELECT COUNT(*) FROM occupations WHERE service_company_id IS NULL)), NULL);
END $load$;`,
    '',
    'DROP FUNCTION pg_temp.mil_log(text, boolean, text, uuid);',
    'DROP TABLE pg_temp.mil_careers, pg_temp.mil_was;',
    '',
  ].join('\n');
}

/** The paths' migration: the civilian paths' own statements, logged as 'military-paths'. */
export function militaryPathsSql(paths, source) {
  const lines = paths.careers.reduce((sum, career) => sum + career.skills.length, 0);
  return pathSql(paths, source, {
    load: 'military-paths',
    military: true,
    header: [
      `-- The skill path of every military career, generated from ${source}`,
      '-- by scripts/build-military-sql.mjs. Edit the JSON and regenerate; do not edit this file by hand.',
      '-- Idempotent: applied a second time it changes nothing.',
      '--',
      `-- ${paths.careers.length} careers, ${lines} path lines. Every path is written as a draft; one a person has approved is left`,
      '-- exactly as it is. A path names skills and sets no level: each line takes its skill\'s level from the',
      '-- trigger occupation_skills_stage_is_level (0042). Applied after the military careers (0063) and the',
      '-- skills catalogue and taxonomy that hold their skills (0059, 0060). The statements are the civilian',
      "-- paths' own (scripts/build-career-paths-sql.mjs). What it decided on this database is in load_log",
      "-- (load 'military-paths'; the lines with look = true are the ones to read).",
    ],
  });
}

const json = async (file) => JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
const DEFAULT_OUTPUT = {
  employers: 'migrations/0077_military_employers_2.sql',
  careers: 'migrations/0063_military_careers.sql',
  paths: 'migrations/0064_military_paths.sql',
};

async function main() {
  const args = process.argv.slice(2);
  const report = args.includes('--report');
  const checkOnly = args.includes('--check') || report;
  const [what, output] = args.filter((arg) => !arg.startsWith('--'));
  const files = { employers: `${MILITARY_DIR}/employers.json`, careers: `${MILITARY_DIR}/careers.json`, paths: `${MILITARY_DIR}/paths.json` };
  const [employers, careers, paths, taxonomy, skills, catalogue, aliases, civilianPaths] = await Promise.all([
    json(files.employers),
    json(files.careers),
    json(files.paths),
    json('data/skills/taxonomy.json'),
    json('data/skills/catalogue.json'),
    json('data/careers/catalogue.json'),
    json('data/careers/aliases.json'),
    json('data/careers/paths.json'),
  ]);
  const problems = [
    ...employerProblems(employers).map((problem) => `${files.employers}: ${problem}`),
    ...careerProblems(careers, taxonomy, employers, civilianNames(catalogue, aliases)).map((problem) => `${files.careers}: ${problem}`),
    ...militaryPathProblems(paths, careers, skills, taxonomy).map((problem) => `${files.paths}: ${problem}`),
  ];
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
    process.exit(1);
  }
  const sizes = paths.careers.map((career) => career.skills.length).sort((a, b) => a - b);
  const lines = sizes.reduce((sum, size) => sum + size, 0);
  const perService = employers.companies.map((company) => `${careers.careers.filter((career) => career.service === company.service).length} ${company.name}`).join(', ');
  const summary = `${employers.companies.length} services; ${careers.careers.length} careers (${perService}), ${careers.careers.reduce((sum, career) => sum + career.was.length, 0)} other names; ${lines} path lines (${sizes[0]} to ${sizes[sizes.length - 1]} a path)`;
  if (report) {
    const reach = reaches(paths, civilianPaths);
    const pct = (r) => `${Math.round((r.held / r.of) * 100)}%`.padStart(4);
    const third = [...reach].filter(([, list]) => list.length > 0 && list[0].held / list[0].of >= 1 / 3).length;
    const used = new Set(paths.careers.flatMap((career) => career.skills));
    const civilianUsed = new Set(civilianPaths.careers.flatMap((career) => career.skills.map((skill) => (typeof skill === 'string' ? skill : skill.skill))));
    console.log(`${MILITARY_DIR}: valid. ${summary}.\n`);
    console.log(`Skills on a military path: ${used.size}, of them on no civilian path: ${[...used].filter((name) => !civilianUsed.has(name)).length}\n`);
    console.log(`Careers that reach a civilian career by a third of its path: ${third} of ${reach.size}\n`);
    console.log(`The civilian careers each covers most, as skills held of skills on that path:\n${[...reach]
      .map(([title, list]) => `  ${title}\n${list.map((r) => `    ${pct(r)}  ${r.held} of ${r.of}  ${r.career}`).join('\n') || '    none'}`)
      .join('\n')}`);
    return;
  }
  if (checkOnly) {
    console.log(`${MILITARY_DIR}: valid. ${summary}.`);
    return;
  }
  if (!(what in DEFAULT_OUTPUT)) {
    console.error('usage: node scripts/build-military-sql.mjs --check | --report | employers|careers|paths [output.sql]');
    process.exit(1);
  }
  const out = output ?? DEFAULT_OUTPUT[what];
  const sql = what === 'employers' ? employersSql(employers, files.employers) : what === 'careers' ? careersSql(careers, files.careers) : militaryPathsSql(paths, files.paths);
  await writeFile(out, sql);
  console.log(`${out}: ${sql.split('\n').length} lines. ${summary}.`);
}

// Run only when started as a script: the unit checks import the functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
