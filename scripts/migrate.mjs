// Applies the SQL migrations listed below, once each, and records them in
// `app_migrations`.
//
//   npm run db:migrate                 apply to the database DATABASE_URL names
//   node scripts/migrate.mjs --build   what `npm run build` runs first
//
// Inside a build it applies migrations only when the build is Vercel's
// production build (VERCEL_ENV=production), so a deploy and its schema changes
// ship together. A preview build, or a build on a developer's machine or in
// CI, never changes a database just because it can see one: there the schema
// is changed on purpose, with `npm run db:migrate`.
//
// - No DATABASE_URL: skips quietly.
// - A failing migration fails the build, so the previous deployment stays live.
// - Two runs at once (two builds, or a build and a person) take turns: each
//   migration is applied under a lock, and the second run finds it recorded.
// - Only files named here are run. Migrations 0000-0009 predate this runner
//   and are never re-run; `scripts/create-db.mjs` applies them when it builds
//   a database from nothing.
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';

export const MIGRATIONS = ['0010_accounts_jobs.sql', '0011_austin_career_paths.sql', '0012_company_profile.sql', '0013_company_profiles.sql', '0014_company_slugs.sql', '0015_invites.sql', '0016_career_paths_2.sql', '0017_remove_safety_careers.sql', '0018_career_paths_3.sql', '0019_company_descriptions.sql', '0020_password_resets.sql', '0021_industry_careers.sql', '0022_data_cleanup.sql', '0023_remove_legacy.sql', '0024_email_notices.sql', '0025_admin_upkeep.sql', '0026_company_requests.sql', '0027_career_aliases.sql', '0028_indexes_and_checks.sql', '0029_remove_puerto_rico.sql', '0030_depth_and_provenance.sql', '0033_skills_catalogue.sql', '0034_account_purpose.sql', '0035_industries.sql', '0036_industry_stats.sql', '0037_company_domains.sql', '0038_remove_construction_materials.sql', '0039_restore_cement_plants.sql', '0040_texas_employers.sql', '0041_largest_plants.sql', '0042_skill_taxonomy.sql', '0043_intake.sql', '0044_geo_keys.sql', '0045_company_domains_2.sql', '0046_careers_catalogue.sql', '0047_career_lists.sql', '0048_skills_catalogue_2.sql', '0049_skill_taxonomy_2.sql', '0050_skill_makes.sql', '0051_plant_duplicates.sql', '0052_career_paths.sql', '0053_company_careers.sql', '0054_job_postings.sql',
  // The vocabulary pass for reading postings: careers' other names, skills' other names, makes.
  '0056_career_lists_2.sql', '0057_skills_catalogue_3.sql', '0058_skill_makes_2.sql',
  // Military careers. First the skills they need: 66 added to the catalogue, then placed in 11 new groups.
  '0059_skills_catalogue_4.sql', '0060_skill_taxonomy_3.sql',
  // What says a career belongs to a service (columns only), then the four services as companies.
  '0061_career_service.sql', '0062_military_employers.sql',
  // The military careers, then their paths, every one a draft.
  '0063_military_careers.sql', '0064_military_paths.sql',
  // The plants behind employers' postings: the plants we lacked and four employers we did not list (a research file),
  // rows filed under an employer that are another firm's, and the places postings name that are decided by the data.
  '0065_posting_employers.sql', '0066_rows_not_theirs.sql', '0067_posting_places.sql',
  // The domains in a new order, Safety last. No group or skill moves.
  '0068_skill_taxonomy_4.sql',

  // A company's mark set by hand (one table, no rows).
  '0069_company_marks.sql',
  // The trades of the industries the catalogue lacked: the skills, placed in their groups, and their makes;
  '0070_skills_catalogue_5.sql', '0071_skill_taxonomy_5.sql', '0072_skill_makes_3.sql',
  // then the careers, their industries and other names, and every career's path.
  '0073_careers_catalogue_2.sql', '0074_career_lists_3.sql', '0075_career_paths_2.sql',

  // Texas completed hub by hub: Austin and its ring, Houston and Beaumont, Dallas-Fort Worth, San Antonio
  // and the Valley, the rest of Texas (data/employers/texas-hubs.json).
  '0076_texas_hubs.sql',
  // The four services' descriptions, replaced where each is still the file's earlier one.
  '0077_military_employers_2.sql',
  // The military careers' paths again, with the skills the catalogue gained in 0070 (data/careers/military/paths.json).
  '0078_military_paths_2.sql',
  // The places postings name, decided by the data again (data/employers/places.json): GE Aerospace's Evendale, the
  // village its factory filed under Cincinnati stands in, pointed at that factory. Numbered 0081 because 0079 and 0080
  // were taken on other branches first (the list is ordered, not contiguous).
  '0081_posting_places_2.sql',
  // The Texas factories texas-hubs.json left waiting for a location, placed (data/employers/texas-hubs-2.json).
  '0082_texas_hubs_2.sql',
  // The skill groups re-cut to the Atlas's: seven new groups of skills already placed, 27 skills moved, 127 groups renamed.
  '0083_skill_taxonomy_6.sql',
  // Cleaning a plant and preparing food by hand leave the catalogue (Sanitation Technician, Meat Cutter, Slaughterer,
  // Baker), with their jobs and what the postings pipeline kept of them; then the lists and the paths without them.
  '0084_careers_catalogue_3.sql', '0085_career_lists_4.sql', '0086_career_paths_3.sql',
  // A job from a careers site is named by its career's title alone, held by the database; the title its employer posted it
  // under is kept beside it (jobs.posted_as), out of sight.
  '0088_job_names.sql'];

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

// One fixed key for pg_advisory_xact_lock. It is taken inside each
// migration's own transaction and released when that ends, so it is safe
// behind a connection pooler (a session lock is not).
const LOCK_KEY = 4127001;

/**
 * Applies every listed migration the ledger does not have yet, in order.
 * `reapply` runs them all again whatever the ledger says: every migration is
 * written to be safe to repeat, and `scripts/create-db.mjs` relies on that to
 * lay the curated lists over freshly loaded sample data.
 */
export async function applyMigrations(sql, { reapply = false, log = console.log } = {}) {
  await sql`CREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY, applied_at timestamp DEFAULT now() NOT NULL)`;
  const done = new Set((await sql`SELECT name FROM app_migrations`).map((r) => r.name));
  for (const name of MIGRATIONS) {
    if (done.has(name) && !reapply) continue;
    const text = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
    const applied = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
      // Another run may have applied it while this one waited for the lock.
      const [recorded] = await tx`SELECT 1 FROM app_migrations WHERE name = ${name}`;
      if (recorded && !reapply) return false;
      await tx.unsafe(text);
      await tx`INSERT INTO app_migrations (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING`;
      return true;
    });
    if (applied) log(`migrate: ${reapply && done.has(name) ? 'applied again' : 'applied'} ${name}`);
  }
}

/**
 * Whether a run started by `npm run build` should touch the database, and
 * why not when it should not.
 */
export function buildDecision(env, cwd) {
  if (env.VERCEL_ENV === 'production') return { run: true };
  if (env.VERCEL_ENV) {
    return { run: false, why: `this is a ${env.VERCEL_ENV} build, not production` };
  }
  // Vercel builds in /vercel/path0 and sets VERCEL=1. With no VERCEL_ENV
  // there is no telling production from preview. Every build migrated before
  // this rule existed, and shipping code without its schema is worse than
  // migrating from a preview, so it migrates and says how to narrow it.
  if (env.VERCEL || cwd.startsWith('/vercel/')) {
    return {
      run: true,
      why: 'this looks like a Vercel build but VERCEL_ENV is not set, so production cannot be told from preview. Migrating, as every build used to. Turn on "Automatically expose System Environment Variables" in the project settings to limit this to production',
    };
  }
  return { run: false, why: "this is not Vercel's production build" };
}

async function main() {
  const inBuild = process.argv.includes('--build');
  if (inBuild) {
    // Decided before looking for a database, so a build's log always says
    // which kind of build it took itself for.
    const decision = buildDecision(process.env, process.cwd());
    if (!decision.run) {
      console.log(`migrate: ${decision.why}, so the database is left alone. \`npm run db:migrate\` applies migrations on purpose.`);
      return;
    }
    if (decision.why) console.warn(`migrate: ${decision.why}.`);
    else console.log("migrate: this is Vercel's production build.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('migrate: DATABASE_URL is not set, skipping.');
    return;
  }

  const sql = postgres(url, { max: 1, connect_timeout: 15, onnotice: () => {} });
  try {
    await applyMigrations(sql);
    console.log('migrate: database is up to date.');
  } catch (err) {
    console.error('migrate: FAILED', err);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Run only when started as a script, not when create-db.mjs imports the list.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
