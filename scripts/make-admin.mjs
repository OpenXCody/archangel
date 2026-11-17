#!/usr/bin/env node
// Makes an existing account an admin. This is how the first admin exists;
// after that, admins make admins from Admin Tools (People).
//
//   DATABASE_URL=postgresql://... node scripts/make-admin.mjs person@example.com
//
// The person signs up in the app first. The script changes one row and
// nothing else, says what it did, and refuses when there is no such account.
import postgres from 'postgres';

const email = (process.argv[2] ?? '').trim().toLowerCase();
const url = process.env.DATABASE_URL;

if (!email || !email.includes('@') || process.argv.length > 3) {
  console.error('Usage: DATABASE_URL=postgresql://... node scripts/make-admin.mjs <email>');
  process.exit(2);
}
if (!url) {
  console.error('make-admin: DATABASE_URL is not set.');
  process.exit(2);
}

let host = 'the database';
try {
  const parsed = new URL(url);
  host = `${parsed.hostname}${parsed.pathname}`;
} catch {
  // An unusual connection string: postgres will say what is wrong with it.
}

const sql = postgres(url, { max: 1, connect_timeout: 15, onnotice: () => {} });
try {
  // Addresses are stored lower-cased.
  const [person] = await sql`SELECT id, name, is_admin FROM users WHERE email = ${email}`;
  if (!person) {
    console.error(`make-admin: no account for ${email} on ${host}. Sign up in the app first, then run this again.`);
    process.exitCode = 1;
  } else if (person.is_admin) {
    console.log(`make-admin: ${person.name} <${email}> is already an admin on ${host}. Nothing changed.`);
  } else {
    await sql`UPDATE users SET is_admin = true, updated_at = now() WHERE id = ${person.id}`;
    console.log(`make-admin: ${person.name} <${email}> is now an admin on ${host}.`);
  }
} catch (error) {
  console.error('make-admin: FAILED', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
