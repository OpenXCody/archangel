/**
 * A guard for scripts that empty tables before loading data.
 *
 * Such a script runs against whatever DATABASE_URL is set, and deletes cascade
 * to jobs, applications, memberships and people's skills. It may only run
 * against a database on this machine, and only when asked to in so many words.
 */
export function assertSafeToWipe(scriptName: string): void {
  const url = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // An unparsable URL is not a local database.
  }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const confirmed = process.argv.includes('--yes-wipe');
  if (local && confirmed) return;

  console.error(`${scriptName} deletes every company, factory, career and skill before loading its sample data.`);
  if (!local) {
    console.error(`It refuses to run against "${host || 'an unset DATABASE_URL'}": only a database on localhost.`);
  }
  if (!confirmed) {
    console.error('Pass --yes-wipe to confirm.');
  }
  process.exit(1);
}
