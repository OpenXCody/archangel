import { sql } from 'drizzle-orm';
import type { Executor } from './audit.js';

/**
 * Where a plant's facts came from, and which record was merged into which
 * (migration 0043). The writes an admin's own change makes: intake runs write
 * the same tables through the database's functions.
 */

/** The facts of a plant a source can fill, as fact_sources names them. */
export type PlantFact = 'industry' | 'address' | 'city' | 'zip' | 'coordinates' | 'headcount' | 'products' | 'opened' | 'status';

/** The fields of a plant an admin edits, and the fact each belongs to. */
const FIELD_FACT: Record<string, PlantFact> = {
  industry: 'industry',
  address: 'address',
  city: 'city',
  zipCode: 'zip',
  latitude: 'coordinates',
  longitude: 'coordinates',
  workforceSize: 'headcount',
  workforceYear: 'headcount',
  workforceSource: 'headcount',
  workforceNote: 'headcount',
  products: 'products',
  openedYear: 'opened',
  status: 'status',
};

/** The facts an edit touched, from the names of the fields it changed. */
export function factsOfFields(fields: readonly string[]): PlantFact[] {
  return [...new Set(fields.map((field) => FIELD_FACT[field]).filter((fact): fact is PlantFact => fact !== undefined))];
}

/**
 * Records that an admin set these facts of a plant. A value an admin typed
 * is never replaced by a source (intake_fact_wins), so this is written in the
 * same transaction as the change.
 */
export async function adminSetFacts(executor: Executor, factoryId: string, facts: readonly PlantFact[], actorId: string): Promise<void> {
  for (const fact of facts) {
    await executor.execute(sql`
      INSERT INTO fact_sources (factory_id, fact, source, rank, set_by, set_at)
      VALUES (${factoryId}, ${fact}, 'admin', 100, ${actorId}, now())
      ON CONFLICT (factory_id, fact) DO UPDATE
        SET source = 'admin', rank = 100, as_of = NULL, run_id = NULL, source_id = NULL, set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at`);
  }
}

/**
 * Records that one record was merged into another, so an id that pointed at
 * the one that is gone still leads somewhere (record_now in the database).
 */
export async function recordMerged(
  executor: Executor,
  merge: { kind: 'company' | 'career' | 'skill'; fromId: string; intoId: string; fromName: string; actorId: string }
): Promise<void> {
  await executor.execute(sql`
    INSERT INTO record_merges (kind, from_id, into_id, from_name, via, actor_id)
    VALUES (${merge.kind}, ${merge.fromId}, ${merge.intoId}, ${merge.fromName}, 'admin', ${merge.actorId})
    ON CONFLICT (kind, from_id) DO NOTHING`);
}
