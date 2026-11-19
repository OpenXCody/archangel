#!/usr/bin/env node
// Builds this app's schema in an empty database, from nothing.
//
//   DATABASE_URL=postgresql://... node scripts/create-db.mjs            schema only
//   DATABASE_URL=postgresql://... node scripts/create-db.mjs --sample   schema, then sample data
//
// The database must exist and be empty (`createdb archangel`). The script:
//   1. turns on pg_trgm (the search indexes need it);
//   2. applies migrations 0000-0009, which predate the migration runner and
//      are in none of its records;
//   3. hands over to the runner (scripts/migrate.mjs) for 0010 onward.
// That is the same history production's schema went through, so a database
// built here has the same tables, columns, indexes and constraints.
//
// --sample then loads the sample companies, factories, careers and skills
// (`npm run db:seed`) and applies the runner's migrations a second time. The
// curated lists in them (career paths, company profiles, slugs, the careers
// typical of an industry) match records by name, so on the empty database of
// step 3 they matched nothing; over the sample data they do. Every migration
// is written to be safe to repeat, and this is where that is checked. Last, the
// sample's made-up companies are given their versions of a few careers
// (server/scripts/seed-versions.ts). Sample data only goes into a database on
// this machine.
//
// It refuses a database that already has tables: it creates, it never repairs.
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';
import { applyMigrations, MIGRATIONS_DIR } from './migrate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const withSample = process.argv.includes('--sample');
const url = process.env.DATABASE_URL;

function stop(message) {
  console.error(`create-db: ${message}`);
  process.exit(1);
}

if (!url) stop('DATABASE_URL is not set.');

let host = '';
try {
  host = new URL(url).hostname;
} catch {
  stop('DATABASE_URL is not a connection string.');
}
const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
if (withSample && !local) {
  stop(`--sample loads sample data, which is only for a database on this machine, not "${host}".`);
}

const connect = () => postgres(url, { max: 1, connect_timeout: 15, onnotice: () => {} });
let sql = connect();
let failed = false;
try {
  // Tables an extension owns (PostGIS keeps spatial_ref_sys in public) are not this app's.
  const [{ tables }] = await sql`
    SELECT count(*)::int AS tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')`;
  if (tables > 0) {
    stop(`this database already has ${tables} table${tables === 1 ? '' : 's'}. It builds an empty database; \`npm run db:migrate\` brings an existing one up to date.`);
  }

  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

  const early = (await readdir(MIGRATIONS_DIR)).filter((name) => /^000\d_.*\.sql$/.test(name)).sort();
  for (const name of early) {
    // Drizzle's `--> statement-breakpoint` markers are SQL comments. CREATE
    // INDEX CONCURRENTLY cannot run among other statements, and there is
    // nothing to keep readable while an index builds on an empty table.
    const text = (await readFile(path.join(MIGRATIONS_DIR, name), 'utf8')).replace(/\bCONCURRENTLY\b/g, '');
    if (text.trim()) await sql.begin((tx) => tx.unsafe(text));
    console.log(`create-db: applied ${name}`);
  }

  // Said for this session only: a migration that holds the stored records to a
  // curated file (0042, the skill taxonomy) has nothing to hold them to yet.
  // The second pass below, over the sample data, runs in a new session and is
  // checked like any other database.
  await sql`SELECT set_config('archangel.from_nothing', 'on', false)`;
  await applyMigrations(sql);

  if (withSample) {
    const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx');
    const seed = spawnSync(tsx, ['server/scripts/seed.ts', '--yes-wipe'], { cwd: ROOT, stdio: 'inherit', env: process.env });
    if (seed.status !== 0) throw new Error('the sample data did not load');
    // A new session, as a second run would have: some migrations keep
    // helpers in pg_temp, which lasts as long as the connection.
    await sql.end({ timeout: 5 });
    sql = connect();
    await applyMigrations(sql, { reapply: true });
    // Last, now that the catalogue is laid over the sample: the made-up companies' versions of a few careers.
    const versions = spawnSync(tsx, ['server/scripts/seed-versions.ts'], { cwd: ROOT, stdio: 'inherit', env: process.env });
    if (versions.status !== 0) throw new Error('the sample versions did not load');
  }

  const [counts] = await sql`
    SELECT (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public') AS tables,
           (SELECT count(*)::int FROM companies) AS companies,
           (SELECT count(*)::int FROM factories) AS factories,
           (SELECT count(*)::int FROM occupations) AS careers,
           (SELECT count(*)::int FROM skills) AS skills`;
  console.log(`create-db: done. ${counts.tables} tables; ${counts.companies} companies, ${counts.factories} factories, ${counts.careers} careers, ${counts.skills} skills.`);
} catch (err) {
  console.error('create-db: FAILED', err);
  failed = true;
} finally {
  await sql.end({ timeout: 5 });
}
if (failed) process.exit(1);
