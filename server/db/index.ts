import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;

// Never throw at import time: on Vercel that turns a missing env var into
// FUNCTION_INVOCATION_FAILED for every route, including /api/health. Log it
// loudly and let individual queries fail with a clear message instead, so the
// health check can still report `hasDbUrl: false`.
if (!connectionString) {
  console.error('DATABASE_URL is not set — database queries will fail until it is configured.');
}

// Serverless-optimized settings: one connection per function instance.
const client = postgres(connectionString ?? 'postgresql://unset:unset@127.0.0.1:1/unset', {
  max: process.env.VERCEL ? 1 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create drizzle database instance with schema for relational queries
export const db = drizzle(client, { schema });

/** True when a database URL was provided (does not test connectivity). */
export const hasDatabaseUrl = Boolean(connectionString);

// Export schema for use in other files
export * from './schema.js';

// Export types inferred from schema
export type Database = typeof db;
