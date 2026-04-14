import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create postgres client
// For query purposes (standard connection)
// Serverless-optimized settings
const client = postgres(connectionString, {
  max: process.env.VERCEL ? 1 : 10, // Single connection in serverless
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create drizzle database instance with schema for relational queries
export const db = drizzle(client, { schema });

// Export schema for use in other files
export * from './schema';

// Export types inferred from schema
export type Database = typeof db;
