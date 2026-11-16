// Applies the additive SQL migrations listed below, once each, and records
// them in `app_migrations`. Runs before every build (see package.json), so a
// deploy and its schema changes ship together.
//
// - No DATABASE_URL (CI, previews without a database): skips quietly.
// - A failing migration fails the build, so the previous deployment stays live.
// - Only files named here are run. Migrations 0000-0009 predate this runner
//   and were applied by hand; they are never re-run.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postgres from 'postgres';

const MIGRATIONS = ['0010_accounts_jobs.sql', '0011_austin_career_paths.sql', '0012_company_profile.sql', '0013_company_profiles.sql', '0014_company_slugs.sql', '0015_invites.sql', '0016_career_paths_2.sql', '0017_remove_safety_careers.sql', '0018_career_paths_3.sql', '0019_company_descriptions.sql', '0020_password_resets.sql', '0021_industry_careers.sql'];

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('migrate: DATABASE_URL is not set, skipping.');
  process.exit(0);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const sql = postgres(url, { max: 1, connect_timeout: 15, onnotice: () => {} });

try {
  await sql`CREATE TABLE IF NOT EXISTS app_migrations (name text PRIMARY KEY, applied_at timestamp DEFAULT now() NOT NULL)`;
  const done = new Set((await sql`SELECT name FROM app_migrations`).map((r) => r.name));
  for (const name of MIGRATIONS) {
    if (done.has(name)) continue;
    const text = await readFile(path.join(dir, name), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`INSERT INTO app_migrations (name) VALUES (${name})`;
    });
    console.log(`migrate: applied ${name}`);
  }
  console.log('migrate: database is up to date.');
} catch (err) {
  console.error('migrate: FAILED', err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
