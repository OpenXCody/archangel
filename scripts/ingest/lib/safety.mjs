// Which database a command is about to touch, and whether it may.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '']);

/** What a connection string points at: { host, database, local }. Throws when it is not one. */
export function databaseTarget(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL is not a connection string.');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL is not a Postgres connection string.');
  }
  const host = parsed.hostname.toLowerCase();
  return { host, database: decodeURIComponent(parsed.pathname.replace(/^\//, '')), local: LOCAL_HOSTS.has(host) };
}

/**
 * The rule every command follows before it connects: a database on this
 * machine is fine; any other is refused unless `--yes-this-database` names
 * its host exactly. Returns the target; throws the refusal.
 */
export function checkDatabase(url, yesThisDatabase) {
  if (!url) throw new Error('DATABASE_URL is not set.');
  const target = databaseTarget(url);
  if (target.local) return target;
  const named = typeof yesThisDatabase === 'string' ? yesThisDatabase.trim().toLowerCase() : '';
  if (!named) {
    throw new Error(
      `Refusing: the database is on "${target.host}", not this machine. To run against it on purpose, add --yes-this-database ${target.host}`
    );
  }
  if (named !== target.host) {
    throw new Error(`Refusing: --yes-this-database names "${named}", but DATABASE_URL points at "${target.host}".`);
  }
  return target;
}

/**
 * The connection string as the driver takes it. Neon's console adds
 * `channel_binding=require`, which is an instruction to libpq: this driver
 * would send it to the server as a setting, and the server knows none by that
 * name. It is dropped; everything else stays as written.
 */
export function connectionString(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete('channel_binding');
  return parsed.toString();
}
