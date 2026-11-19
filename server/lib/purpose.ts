import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { rowsOf } from './rows.js';

/**
 * What an account is for: finding work, or hiring (`users.purpose`, and the
 * rules in shared/purpose.ts). It decides which tools the interface draws for
 * the person and nothing else: what a person may do is still decided by their
 * relationships (a company membership, `isAdmin`).
 *
 * A person says it when they sign up to hire, or in settings. Until they have
 * said, it is read from what they have: see `hasCompanyTie`.
 */
export { isPurpose, purposeFrom, type Purpose } from '../../shared/purpose.js';

/** Whether the person has, or has asked for, anything to do with a company, whatever became of it. */
export async function hasCompanyTie(userId: string): Promise<boolean> {
  const rows = rowsOf<{ tie: boolean }>(
    await db.execute(sql`
    SELECT (EXISTS (SELECT 1 FROM company_members WHERE user_id = ${userId})
         OR EXISTS (SELECT 1 FROM company_requests WHERE user_id = ${userId})) AS tie`)
  );
  return rows[0]?.tie === true;
}
