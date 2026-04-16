import type { Config } from 'drizzle-kit';

export default {
  schema: './server/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
  tablesFilter: ['!geography_columns', '!geometry_columns', '!spatial_ref_sys'],
  extensionsFilters: ['postgis'],
} satisfies Config;
