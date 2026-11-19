#!/usr/bin/env node
// Turns curated research files (the contract in scripts/ingest/README.md) into
// one idempotent SQL migration that finds or creates each company, places each
// plant on the row that already is that plant or adds it, and records what it
// decided in load_log.
//
//   node scripts/build-employers-sql.mjs --out migrations/00NN_name.sql data/employers/a.json data/employers/b.json
//   node scripts/build-employers-sql.mjs --check data/employers/*.json
//   node scripts/build-employers-sql.mjs --rehearse --schema migrations/0030_depth_and_provenance.sql \
//        --out rehearsal.sql data/employers/a.json
//
//   --out <file>      where the SQL goes (default: standard output)
//   --check           validate and cross-check the files; write no SQL
//   --rehearse        SQL that does the whole load, returns a summary and the
//                     decisions worth reading, and undoes everything it did
//   --all             with --rehearse: every decision, not only those marked for a look
//   --schema <file>   with --rehearse: a schema migration to run first, inside
//                     the rehearsal (a copy of production that lacks it); repeatable
//   --with <file>     another research file whose companies are known but not
//                     loaded here; repeatable. Every other .json beside an input
//                     file is read this way without being asked.
//
// The database is production's, which this script cannot see, so the SQL makes
// every decision when it runs (scripts/employers-loader.sql). What is decided
// here is only what a file alone can show: a value of the wrong shape, a plant
// that is not loaded, a name listed as another name for a company that is a
// company of its own in the research.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The 21 manufacturing subsectors, named as factories.primary_naics_description names them. */
export const SUBSECTORS = [
  'Food Manufacturing',
  'Beverage and Tobacco Product Manufacturing',
  'Textile Mills',
  'Textile Product Mills',
  'Apparel Manufacturing',
  'Leather and Allied Product Manufacturing',
  'Wood Product Manufacturing',
  'Paper Manufacturing',
  'Printing and Related Support Activities',
  'Petroleum and Coal Products Manufacturing',
  'Chemical Manufacturing',
  'Plastics and Rubber Products Manufacturing',
  'Nonmetallic Mineral Product Manufacturing',
  'Primary Metal Manufacturing',
  'Fabricated Metal Product Manufacturing',
  'Machinery Manufacturing',
  'Computer and Electronic Product Manufacturing',
  'Electrical Equipment, Appliance, and Component Manufacturing',
  'Transportation Equipment Manufacturing',
  'Furniture and Related Product Manufacturing',
  'Miscellaneous Manufacturing',
];
const SUBSECTOR_BY_KEY = new Map(SUBSECTORS.map((name) => [name.toLowerCase().replace(/[^a-z]+/g, ' ').trim(), name]));

/**
 * NAICS codes, by their leading digits, that the map does not cover: material mixed or cast for a building site.
 * Ready-mix concrete (32732), concrete pipe, brick and block (32733), other concrete products (32739) and asphalt
 * paving mixtures (324121). Cement itself (32731) is made in a kiln plant and is covered.
 */
export const NOT_COVERED = ['32732', '32733', '32739', '324121'];

const LOADED_STATUSES = ['operating', 'under construction'];
const OTHER_STATUSES = ['announced', 'closed'];
const THIS_YEAR = new Date().getFullYear();

/** The states the app knows, from shared/states.ts: { TX: 'texas', ... }. */
export async function readStates() {
  const text = await readFile(path.join(HERE, '..', 'shared', 'states.ts'), 'utf8');
  const states = {};
  for (const [, code, name] of text.matchAll(/code:\s*'([A-Z]{2})',\s*name:\s*'([^']+)'/g)) states[code] = name.toLowerCase();
  return states;
}

const text = (value, max = 300) => {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
};
const url = (value) => {
  const clean = text(value, 2000);
  return clean && /^https?:\/\/[^\s]+$/i.test(clean) ? clean : null;
};
const urls = (value) => [...new Set((Array.isArray(value) ? value : []).map(url).filter(Boolean))];
const wholeNumber = (value, min, max) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value.replace(/,/g, '')) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : null;
};
/** A bare web domain: "https://www.TI.com/about" is "ti.com". Null when it is not one. */
export function cleanDomain(value) {
  const raw = text(value, 300);
  if (!raw) return null;
  const host = raw.toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  return /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : null;
}
/** Lower case, "&" as "and", anything else that is not a letter or digit as a space: as el_norm does in SQL. */
export const plain = (value) => String(value ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const without = (object) => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)));

/** Metres between two points, as the SQL measures them. */
export function metres(lat1, lng1, lat2, lng2) {
  return Math.round(Math.hypot((lat1 - lat2) * 111320, (lng1 - lng2) * 111320 * Math.cos((lat1 * Math.PI) / 180)));
}

/**
 * One research file as the loader takes it: values of the right shape, plants
 * that are not loaded set aside, nothing empty. `problems` says what was
 * changed or left out, one line each; none of them stops the load.
 */
export function normaliseFile(raw, states, label = raw?.brief ?? 'file') {
  const problems = [];
  const say = (where, what) => problems.push(`${label}: ${where}: ${what}`);
  const brief = text(raw?.brief, 80) ?? label;
  const companies = [];
  const seenCompanies = new Set();

  for (const c of Array.isArray(raw?.companies) ? raw.companies : []) {
    const name = text(c?.name, 200);
    if (!name) {
      say('a company', 'has no name and was left out');
      continue;
    }
    if (seenCompanies.has(name.toLowerCase())) {
      say(name, 'is in the file twice; the second was left out');
      continue;
    }
    seenCompanies.add(name.toLowerCase());

    const seenNames = new Set([name.toLowerCase()]);
    const alsoKnownAs = [];
    for (const item of Array.isArray(c.alsoKnownAs) ? c.alsoKnownAs : []) {
      const other = text(item, 200);
      if (!other || seenNames.has(other.toLowerCase())) continue;
      seenNames.add(other.toLowerCase());
      alsoKnownAs.push(other);
    }
    let parent = text(c.parent, 200);
    if (parent && parent.toLowerCase() === name.toLowerCase()) parent = null;
    const domain = cleanDomain(c.domain);
    if (c.domain && !domain) say(name, `domain "${c.domain}" is not a domain and was left out`);
    const hq = c.headquarters && typeof c.headquarters === 'object' ? c.headquarters : {};
    const hqState = text(hq.state, 2)?.toUpperCase() ?? null;
    const headquarters = text(hq.city, 120) ? without({ city: text(hq.city, 120), state: hqState && states[hqState] ? hqState : null, country: text(hq.country, 60) }) : null;

    const people = [];
    for (const e of Array.isArray(c.stateEmployees) ? c.stateEmployees : c.stateEmployees ? [c.stateEmployees] : []) {
      const state = text(e?.state, 2)?.toUpperCase();
      const count = wholeNumber(e?.count, 1, 5_000_000);
      if (!state || !states[state] || count === null) {
        if (e && (e.count !== null && e.count !== undefined)) say(name, 'stateEmployees needs a state code and a whole number; left out');
        continue;
      }
      people.push(without({ state, count, year: wholeNumber(e.year, 1990, THIS_YEAR + 1), source: url(e.source), note: text(e.note, 300) }));
    }

    // A different company that has one of this company's names (our addition to the contract).
    const setAside = [];
    for (const x of Array.isArray(c.setAside) ? c.setAside : []) {
      const [other, withPlant, renameTo] = [text(x?.name, 200), text(x?.withPlant, 300), text(x?.renameTo, 200)];
      if (other && withPlant && renameTo && renameTo.toLowerCase() !== other.toLowerCase()) setAside.push({ name: other, withPlant, renameTo });
      else say(name, 'setAside needs name, withPlant and a different renameTo; left out');
    }

    const plants = [];
    const notLoaded = [];
    const seenPlants = new Set();
    for (const p of Array.isArray(c.plants) ? c.plants : []) {
      const plantName = text(p?.name, 300);
      const where = `${name} / ${plantName ?? 'a plant'}`;
      if (!plantName) {
        say(where, 'has no name and was left out');
        continue;
      }
      const status = (text(p.status, 40) ?? 'operating').toLowerCase();
      if (OTHER_STATUSES.includes(status)) {
        notLoaded.push(`${plantName} (${status})`);
        continue;
      }
      if (!LOADED_STATUSES.includes(status)) {
        say(where, `status "${p.status}" is not one of ${[...LOADED_STATUSES, ...OTHER_STATUSES].join(', ')}; left out`);
        continue;
      }
      const state = text(p.state, 2)?.toUpperCase();
      // Puerto Rico is asked about first: it is no longer in the app's list of states.
      if (state === 'PR') {
        say(where, 'is in Puerto Rico, which the map does not cover; not loaded');
        notLoaded.push(`${plantName} (Puerto Rico)`);
        continue;
      }
      if (!state || !states[state]) {
        say(where, `state "${p.state}" is not a state code; left out`);
        continue;
      }
      const city = text(p.city, 120);
      if (!city) {
        say(where, 'has no city; left out');
        continue;
      }
      const latitude = typeof p.latitude === 'number' ? Math.round(p.latitude * 1e5) / 1e5 : NaN;
      const longitude = typeof p.longitude === 'number' ? Math.round(p.longitude * 1e5) / 1e5 : NaN;
      if (!(latitude >= 17 && latitude <= 72 && longitude >= -180 && longitude <= -64)) {
        say(where, `coordinates ${p.latitude}, ${p.longitude} are not a place in the United States; left out`);
        continue;
      }
      const subsector = SUBSECTOR_BY_KEY.get(String(p.subsector ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim());
      if (!subsector) {
        say(where, `subsector "${p.subsector}" is not one of the 21; left out`);
        continue;
      }
      const key = plain(plantName);
      if (seenPlants.has(key)) {
        say(where, 'is listed twice for this company; the second was left out');
        continue;
      }
      seenPlants.add(key);

      let naics = p.naics === null || p.naics === undefined ? null : String(p.naics).trim();
      if (naics && !/^3[1-3]\d{4}$/.test(naics)) {
        say(where, `NAICS "${p.naics}" is not a six-digit manufacturing code; left out`);
        naics = null;
      }
      // Construction materials are not manufacturing here: concrete (ready-mix, block, pipe, precast) and asphalt
      // paving mixtures were taken off the map and do not come back through a file. A cement plant is covered.
      if (naics && NOT_COVERED.some((code) => naics.startsWith(code))) {
        say(where, `is construction materials (NAICS ${naics}), which the map does not cover; not loaded`);
        notLoaded.push(`${plantName} (construction materials, NAICS ${naics})`);
        seenPlants.delete(key);
        continue;
      }
      let employees = wholeNumber(p.employees, 1, 200_000);
      if (p.employees !== null && p.employees !== undefined && employees === null) say(where, `employees "${p.employees}" is not a whole number; left out`);
      const employeesYear = employees === null ? null : wholeNumber(p.employeesYear, 1990, THIS_YEAR + 1);
      const employeesSource = employees === null ? null : url(p.employeesSource);
      if (employees !== null && employeesYear === null) say(where, 'has a headcount with no year');
      if (employees !== null && !employeesSource) {
        say(where, 'has a headcount with no source, which the contract does not allow; the headcount was left out');
        employees = null;
      }
      const opened = wholeNumber(p.opened, 1700, THIS_YEAR + 1);
      if (p.opened !== null && p.opened !== undefined && opened === null) say(where, `opened "${p.opened}" is not a year; left out`);

      plants.push(
        without({
          name: plantName,
          city,
          state,
          address: text(p.address, 300),
          zip: /^\d{5}(-\d{4})?$/.test(String(p.zip ?? '').trim()) ? String(p.zip).trim() : null,
          latitude,
          longitude,
          subsector,
          naics,
          products: text(p.products, 300),
          employees,
          employeesYear: employees === null ? null : employeesYear,
          employeesSource: employees === null ? null : employeesSource,
          employeesNote: employees === null ? null : text(p.employeesNote, 300),
          opened,
          status,
          sources: urls(p.sources),
          // The existing plant this one is, by its exact name, when the corrections say so.
          sameAs: text(p.sameAs, 300),
          // No existing plant is this one, when the corrections say so: the nearby rows are other plants.
          isNew: p.isNew === true ? true : null,
        })
      );
    }
    // The company's only plant in its city, whatever its status: the loader may then look further for it.
    const cities = (Array.isArray(c.plants) ? c.plants : []).map((p) => `${plain(p?.city)}|${String(p?.state ?? '').toUpperCase()}`);
    for (const p of plants) {
      if (cities.filter((key) => key === `${plain(p.city)}|${p.state}`).length === 1) p.alone = true;
    }

    companies.push(
      without({
        name,
        alsoKnownAs,
        parent,
        domain,
        industry: text(c.industry, 80),
        description: text(c.description, 600),
        headquarters,
        people,
        setAside,
        sources: urls(c.sources),
        plants,
        notLoaded,
      })
    );
  }
  // A company another names as its parent goes first, so that what the parent gathers (rows merged into it) is
  // there when its companies look for their plants under it.
  const byName = new Map(companies.map((c) => [c.name.toLowerCase(), c]));
  const ordered = [];
  const placed = new Set();
  const place = (c, depth = 0) => {
    if (placed.has(c)) return;
    const parent = c.parent ? byName.get(c.parent.toLowerCase()) : null;
    if (parent && depth < 8) place(parent, depth + 1);
    if (!placed.has(c)) {
      placed.add(c);
      ordered.push(c);
    }
  };
  for (const c of companies) place(c);
  return { file: { brief, retrieved: text(raw?.retrieved, 20), companies: ordered }, problems };
  // (A file's `source` note, where it has one, stays in the JSON: it is for people, and the SQL has no use for it.)
}

/**
 * Lays our corrections over a research file as it was delivered, so a newer
 * delivery of the file keeps them. `corrections.companies` is keyed by the
 * company's name as the research file has it:
 *   rename            the name to load it under
 *   addAlsoKnownAs    names to add to alsoKnownAs (rows to find and merge)
 *   dropAlsoKnownAs   names to take out of it (a different company)
 *   setAside          [{ name, withPlant, renameTo }]: a different company that
 *                     has one of this company's names; it is renamed
 *   set               company fields to replace (parent, domain, ...)
 *   dropPlants        plants to leave out, by name
 *   plants            { "<plant name>": { field: value } }: plant fields to replace;
 *                     `sameAs` names the existing plant this one is, by its exact name;
 *                     `isNew: true` says no existing plant is this one
 * Every entry carries `why`.
 */
export function applyCorrections(raw, corrections) {
  const byName = new Map(Object.entries(corrections?.companies ?? {}).map(([name, fix]) => [name.toLowerCase(), fix]));
  const used = new Set();
  const companies = (Array.isArray(raw?.companies) ? raw.companies : []).map((c) => {
    const fix = byName.get(String(c?.name ?? '').toLowerCase());
    if (!fix) return c;
    used.add(String(c.name).toLowerCase());
    const drop = new Set((fix.dropAlsoKnownAs ?? []).map((n) => n.toLowerCase()));
    const dropPlants = new Set((fix.dropPlants ?? []).map((n) => n.toLowerCase()));
    return {
      ...c,
      ...(fix.set ?? {}),
      name: fix.rename ?? c.name,
      alsoKnownAs: [...(c.alsoKnownAs ?? []).filter((n) => !drop.has(String(n).toLowerCase())), ...(fix.rename ? [c.name] : []), ...(fix.addAlsoKnownAs ?? [])],
      setAside: [...(c.setAside ?? []), ...(fix.setAside ?? [])],
      plants: (c.plants ?? [])
        .filter((p) => !dropPlants.has(String(p?.name ?? '').toLowerCase()))
        .map((p) => {
          const change = Object.entries(fix.plants ?? {}).find(([name]) => name.toLowerCase() === String(p?.name ?? '').toLowerCase());
          return change ? { ...p, ...change[1] } : p;
        }),
    };
  });
  return { raw: { ...raw, companies }, used };
}

/**
 * Names that are companies of their own in the research: every company and
 * every parent in every file. The loader never takes one of them as another
 * name for a different company, whatever a file's alsoKnownAs says.
 */
export function protectedNames(files) {
  const names = new Set();
  for (const file of files) {
    for (const c of file.companies) {
      names.add(c.name.toLowerCase());
      if (c.parent) names.add(c.parent.toLowerCase());
    }
  }
  return [...names].sort();
}

/**
 * What a person should settle in the files before they load: a name listed as
 * another name for a company that is a company of its own; one company
 * described differently in two files; one plant in two files under different
 * companies or names.
 */
export function crossCheck(files) {
  const notes = [];
  const guard = new Set(protectedNames(files));
  const seen = new Map();
  const plants = [];
  for (const file of files) {
    for (const c of file.companies) {
      for (const other of c.alsoKnownAs ?? []) {
        if (other.toLowerCase() !== c.name.toLowerCase() && guard.has(other.toLowerCase())) {
          notes.push(`${file.brief}: ${c.name}: "${other}" is listed as another name but is a company of its own in the research; it will not be used to find or merge rows`);
        }
      }
      const earlier = seen.get(c.name.toLowerCase());
      if (earlier) {
        for (const field of ['domain', 'parent']) {
          if (earlier.c[field] && c[field] && String(earlier.c[field]).toLowerCase() !== String(c[field]).toLowerCase()) {
            notes.push(`${c.name}: ${field} is "${earlier.c[field]}" in ${earlier.brief} and "${c[field]}" in ${file.brief}; the first to load is kept`);
          }
        }
        const [a, b] = [earlier.c.headquarters, c.headquarters];
        if (a && b && plain(a.city) !== plain(b.city)) notes.push(`${c.name}: headquarters is ${a.city} in ${earlier.brief} and ${b.city} in ${file.brief}; the first to load is kept`);
      } else {
        seen.set(c.name.toLowerCase(), { c, brief: file.brief });
      }
      for (const p of c.plants ?? []) plants.push({ brief: file.brief, company: c.name, p });
    }
  }
  for (let i = 0; i < plants.length; i += 1) {
    for (let j = i + 1; j < plants.length; j += 1) {
      const [a, b] = [plants[i], plants[j]];
      if (a.brief === b.brief && a.company === b.company) continue;
      const d = metres(a.p.latitude, a.p.longitude, b.p.latitude, b.p.longitude);
      const sameCompany = a.company.toLowerCase() === b.company.toLowerCase();
      if (!(d <= 250 || (sameCompany && d <= 3000))) continue;
      if (sameCompany && a.brief === b.brief) continue;
      const differs = [];
      if (!sameCompany) differs.push('company');
      if (plain(a.p.name) !== plain(b.p.name)) differs.push('name');
      if ((a.p.employees ?? null) !== (b.p.employees ?? null)) differs.push('headcount');
      notes.push(
        `${d} m apart: ${a.brief}: ${a.company} / ${a.p.name}${a.p.employees ? ` (${a.p.employees}, ${a.p.employeesYear})` : ''}  and  ${b.brief}: ${b.company} / ${b.p.name}${b.p.employees ? ` (${b.p.employees}, ${b.p.employeesYear})` : ''}` +
          (differs.length ? `; differ in ${differs.join(', ')}` : '; agree')
      );
    }
  }
  return notes;
}

const quote = (body, tag) => {
  if (body.includes(`$${tag}$`)) throw new Error(`the text contains $${tag}$ and cannot be quoted with it`);
  return `$${tag}$${body}$${tag}$`;
};

/** The SQL for a load, or for its rehearsal. */
export function buildSql({ files, known = [], states, loaderSql, sources = [], rehearse = false, everything = false, schemaSql = null }) {
  const data = {
    protect: protectedNames([...files, ...known]),
    states,
    hints: rehearse,
    files,
  };
  const json = quote(JSON.stringify(data), 'el_data');
  const head = [
    `-- Employers and plants from ${sources.join(', ') || 'research files'},`,
    '-- generated by scripts/build-employers-sql.mjs. Edit the JSON and regenerate;',
    '-- do not edit this file by hand.',
  ];
  if (!rehearse) {
    return [
      ...head,
      '-- Safe to run again: a company or plant already loaded is found, not added twice.',
      '-- What it decided is in load_log (the lines with look = true are the ones to read).',
      '',
      loaderSql.trim(),
      '',
      `SELECT pg_temp.el_load(${json}::jsonb);`,
      '',
    ].join('\n');
  }
  return [
    ...head,
    '--',
    '-- A REHEARSAL. It does the whole load, returns what it decided (a summary,',
    `-- then ${everything ? 'every decision' : 'the decisions a person should read'}) and undoes everything it did before it`,
    '-- returns. Nothing is changed whether this transaction is committed or rolled back.',
    '-- Run it all at once, on one connection. Then: ROLLBACK;',
    'BEGIN;',
    // The functions may name tables and columns that only the schema run inside the rehearsal adds.
    'SET LOCAL check_function_bodies = off;',
    '',
    loaderSql.trim(),
    '',
    `SELECT * FROM pg_temp.el_rehearse(${json}::jsonb, ${schemaSql ? quote(schemaSql, 'el_schema') : 'NULL'}, ${everything}) AS report;`,
    '',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const inputs = [];
  const withFiles = [];
  const schemas = [];
  let out = null;
  let rehearse = false;
  let everything = false;
  let check = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out') out = args[++i];
    else if (arg === '--with') withFiles.push(args[++i]);
    else if (arg === '--schema') schemas.push(args[++i]);
    else if (arg === '--rehearse') rehearse = true;
    else if (arg === '--all') everything = true;
    else if (arg === '--check') check = true;
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    // Not research files: our corrections, and the registry of job boards (scripts/ingest/postings/registry.mjs).
    else if (path.basename(arg) !== 'corrections.json' && path.basename(arg) !== 'boards.json') inputs.push(arg);
  }
  if (inputs.length === 0) {
    console.error('usage: node scripts/build-employers-sql.mjs [--out file.sql] [--check | --rehearse [--all] [--schema file.sql]] [--with file.json] <file.json...>');
    process.exit(1);
  }

  // Every other research file beside an input is known, though not loaded.
  const inputPaths = new Set(inputs.map((file) => path.resolve(file)));
  const knownPaths = new Set(withFiles.map((file) => path.resolve(file)));
  const correctionPaths = new Set();
  for (const dir of new Set([...inputPaths].map((file) => path.dirname(file)))) {
    for (const name of await readdir(dir)) {
      const file = path.join(dir, name);
      if (name === 'corrections.json') correctionPaths.add(file);
      else if (name.endsWith('.json') && name !== 'boards.json' && !inputPaths.has(file)) knownPaths.add(file);
    }
  }
  // Our corrections to the research (data/employers/corrections.json), laid over every file.
  const corrections = { companies: {} };
  for (const file of correctionPaths) Object.assign(corrections.companies, JSON.parse(await readFile(file, 'utf8')).companies ?? {});
  const corrected = new Set();

  const states = await readStates();
  const problems = [];
  const read = async (file) => {
    const fixed = applyCorrections(JSON.parse(await readFile(file, 'utf8')), corrections);
    for (const name of fixed.used) corrected.add(name);
    const normalised = normaliseFile(fixed.raw, states, path.basename(file, '.json'));
    problems.push(...normalised.problems);
    return normalised.file;
  };
  const files = [];
  for (const file of inputPaths) files.push(await read(file));
  const loadedProblems = problems.length;
  const known = [];
  for (const file of knownPaths) known.push(await read(file));
  const notes = crossCheck([...files, ...known]);

  const count = (list, pick) => list.reduce((n, file) => n + file.companies.reduce((m, c) => m + pick(c), 0), 0);
  const report = [
    `${files.length} file${files.length === 1 ? '' : 's'} to load: ${count(files, () => 1)} companies, ${count(files, (c) => c.plants?.length ?? 0)} plants ` +
      `(${count(files, (c) => (c.plants ?? []).filter((p) => p.employees).length)} with a headcount), ${count(files, (c) => c.notLoaded?.length ?? 0)} not loaded (closed, announced, or not covered).`,
    correctionPaths.size ? `${corrected.size} of ${Object.keys(corrections.companies).length} corrections applied.` : null,
    ...Object.keys(corrections.companies).filter((name) => !corrected.has(name.toLowerCase())).map((name) => `  check: a correction names "${name}", which is in none of these files`),
    known.length ? `${known.length} more known for their names: ${[...knownPaths].map((file) => path.basename(file)).join(', ')}.` : null,
    ...problems.slice(0, loadedProblems).map((line) => `  changed: ${line}`),
    ...notes.map((line) => `  check: ${line}`),
  ].filter(Boolean);
  console.error(report.join('\n'));
  if (check) return;

  const schemaSql = schemas.length ? (await Promise.all(schemas.map((file) => readFile(file, 'utf8')))).join('\n') : null;
  const sql = buildSql({
    files,
    known,
    states,
    loaderSql: await readFile(path.join(HERE, 'employers-loader.sql'), 'utf8'),
    sources: [...inputPaths].map((file) => path.relative(path.join(HERE, '..'), file)),
    rehearse,
    everything,
    schemaSql,
  });
  if (out) {
    await writeFile(out, sql);
    console.error(`${out}: ${(sql.length / 1024).toFixed(0)} KB`);
  } else {
    process.stdout.write(sql);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
