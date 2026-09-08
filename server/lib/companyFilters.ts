import { sql, type SQL } from 'drizzle-orm';
import { companies } from '../db/schema.js';

/**
 * Excludes junk rows that arrived as "companies" during bulk imports:
 * pure numeric facility codes (0145000399), hash-prefixed IDs (#1110),
 * paren leaders ((former Woods...)), and address-like names
 * ("1 Commerce Drive", "10/120 S Main"). Production has applied this to
 * the companies list, global search and headline counts since the Pillar
 * import — keep every consumer on this one definition.
 */
export const browsableCompanyFilter: SQL = sql`(
  ${companies.name} ~ '[A-Za-z]{2,}'
  AND ${companies.name} !~ '^[#(]'
  AND ${companies.name} !~ '^\\d+\\s'
  AND ${companies.name} !~ '^\\d+/\\d'
)`;

/** Same predicate as raw SQL text, for hand-written queries that alias the table. */
export function browsableCompanyNameSql(column: string): string {
  return `(${column} ~ '[A-Za-z]{2,}' AND ${column} !~ '^[#(]' AND ${column} !~ '^\\d+\\s' AND ${column} !~ '^\\d+/\\d')`;
}
