import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { recordAudit, type Actor } from './audit.js';
import { RecordRefusal } from './records.js';
import { rowsOf } from './rows.js';

/**
 * Intake as the server sees it (migration 0043; scripts/ingest/README.md has
 * the whole design). Large sources are staged, resolved and applied by the
 * runner, outside the deploy. The server reads what the runner left for
 * Admin Tools (the sources with their runs, the review queue) and decides
 * queue items. What a decision writes to a plant is the database's own
 * function, intake_apply_record, the same one the runner calls: one rule for
 * which value wins, wherever the decision is made.
 */

// ---------------------------------------------------------------------------
// Sources and their runs
// ---------------------------------------------------------------------------

export interface IntakeRun {
  id: number;
  state: string;
  startedAt: string;
  endedAt: string | null;
  input: string | null;
  /** Records that are plants of ours, by id or by rule. */
  matched: number | null;
  added: number | null;
  /** Plants that were there and had a fact filled or replaced. */
  changed: number | null;
  queued: number | null;
}

export interface IntakeSource {
  slug: string;
  name: string;
  publisher: string | null;
  url: string | null;
  terms: string | null;
  howFetched: string | null;
  unmatched: 'hold' | 'add';
  fill: 'empty' | 'ranked';
  /** Records staged and still at the source. */
  staged: number;
  /** Matches waiting for a person. */
  waiting: number;
  runs: IntakeRun[];
}

const RUNS_SHOWN = 3;

/** A count a run recorded, or null when it has not reached that stage. */
function counted(counts: Record<string, unknown>, ...keys: string[]): number | null {
  let total: number | null = null;
  for (const key of keys) {
    const value = counts[key];
    if (typeof value === 'number') total = (total ?? 0) + value;
  }
  return total;
}

/**
 * Every source of plants that has been staged, with its latest runs, newest
 * first. Employers' job postings are sources too (kind 'job'), one per
 * employer: they are listed on their own (`postingSources` in postings.ts).
 */
export async function intakeSources(): Promise<IntakeSource[]> {
  const sources = rowsOf<{
    slug: string;
    name: string;
    publisher: string | null;
    url: string | null;
    terms: string | null;
    how_fetched: string | null;
    unmatched: 'hold' | 'add';
    fill: 'empty' | 'ranked';
    staged: number;
    waiting: number;
  }>(
    await db.execute(sql`
      SELECT s.slug, s.name, s.publisher, s.url, s.terms, s.how_fetched, s.unmatched, s.fill,
             (SELECT count(*)::int FROM intake_records r WHERE r.source = s.slug AND r.gone_run_id IS NULL) AS staged,
             (SELECT count(*)::int FROM intake_review q WHERE q.source = s.slug AND q.status = 'waiting') AS waiting
      FROM intake_sources s WHERE s.kind <> 'job' ORDER BY s.name`)
  );
  const runs = rowsOf<{ id: number | string; source: string; state: string; started_at: string | Date; ended_at: string | Date | null; input: string | null; counts: Record<string, unknown> | null }>(
    await db.execute(sql`
      SELECT id, source, state, started_at, ended_at, input, counts FROM (
        SELECT r.*, row_number() OVER (PARTITION BY r.source ORDER BY r.id DESC) AS n FROM intake_runs r
        WHERE r.source IN (SELECT slug FROM intake_sources WHERE kind <> 'job')
      ) t WHERE n <= ${RUNS_SHOWN} ORDER BY id DESC`)
  );
  const iso = (value: string | Date) => new Date(value).toISOString();
  return sources.map((source) => ({
    slug: source.slug,
    name: source.name,
    publisher: source.publisher,
    url: source.url,
    terms: source.terms,
    howFetched: source.how_fetched,
    unmatched: source.unmatched,
    fill: source.fill,
    staged: source.staged,
    waiting: source.waiting,
    runs: runs
      .filter((run) => run.source === source.slug)
      .map((run) => {
        const counts = run.counts ?? {};
        return {
          id: Number(run.id),
          state: run.state,
          startedAt: iso(run.started_at),
          endedAt: run.ended_at ? iso(run.ended_at) : null,
          input: run.input,
          matched: counted(counts, 'byId', 'byRule'),
          added: counted(counts, 'added'),
          changed: counted(counts, 'plantsChanged'),
          queued: counted(counts, 'queued'),
        };
      }),
  }));
}

// ---------------------------------------------------------------------------
// The review queue
// ---------------------------------------------------------------------------

/** One side of a comparison: a plant as a source's record gives it, or as we have it. */
export interface ReviewPlant {
  name: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  industry: string | null;
  people: number | null;
}

export interface ReviewCandidate extends ReviewPlant {
  id: string;
  /** How it was found: 'same name', 'shared word', 'near', 'near, unrelated name'. */
  rule: string;
  metres: number | null;
}

export interface ReviewItem {
  id: number;
  source: string;
  sourceName: string;
  sourceId: string;
  /** The record at the source, when the source gives each one an address. */
  sourceUrl: string | null;
  /** Why the run was not sure. */
  reason: string;
  /** What happens to the record when an admin says it is none of the candidates. */
  ifDifferent: 'hold' | 'add';
  record: ReviewPlant;
  /** Our plants it may be, best first, as they are now. */
  candidates: ReviewCandidate[];
  createdAt: string;
  skipped: boolean;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const whole = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(number) ? number : null;
};

interface StoredCandidate {
  id?: unknown;
  rule?: unknown;
  metres?: unknown;
}

/** How many matches wait for a person. */
export async function waitingMatches(): Promise<number> {
  const [row] = rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM intake_review WHERE status = 'waiting'`));
  return row?.n ?? 0;
}

/**
 * The matches waiting for a person: the ones nobody has looked at first,
 * oldest first, then the ones skipped. Each carries the source's record and
 * our candidate plants as they are now (a candidate deleted since is left out).
 */
export async function reviewQueue(limit: number, offset: number): Promise<{ items: ReviewItem[]; total: number }> {
  const rows = rowsOf<{
    id: number | string;
    source: string;
    source_name: string;
    source_id: string;
    reason: string;
    unmatched: 'hold' | 'add';
    facts: Record<string, unknown>;
    candidates: StoredCandidate[] | null;
    created_at: string | Date;
    skipped_at: string | Date | null;
  }>(
    await db.execute(sql`
      SELECT q.id, q.source, s.name AS source_name, q.source_id, q.reason, s.unmatched, r.facts, q.candidates, q.created_at, q.skipped_at
      FROM intake_review q
      JOIN intake_sources s ON s.slug = q.source
      JOIN intake_records r ON r.source = q.source AND r.source_id = q.source_id
      WHERE q.status = 'waiting'
      ORDER BY q.skipped_at NULLS FIRST, q.id
      LIMIT ${limit} OFFSET ${offset}`)
  );
  const ids = [...new Set(rows.flatMap((row) => (row.candidates ?? []).map((candidate) => text(candidate.id)).filter((id): id is string => id !== null)))];
  const plants = new Map<string, ReviewPlant>();
  if (ids.length > 0) {
    const found = rowsOf<{ id: string; name: string; company: string | null; address: string | null; city: string | null; state: string | null; zip: string | null; industry: string | null; people: number | null }>(
      await db.execute(sql`
        SELECT f.id, f.name, c.name AS company, f.address, f.city, f.state, f.zip_code AS zip, f.primary_naics_description AS industry, f.workforce_size AS people
        FROM factories f LEFT JOIN companies c ON c.id = f.company_id
        WHERE f.id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`)
    );
    for (const { id, ...plant } of found) plants.set(id, plant);
  }
  return {
    total: await waitingMatches(),
    items: rows.map((row) => ({
      id: Number(row.id),
      source: row.source,
      sourceName: row.source_name,
      sourceId: row.source_id,
      sourceUrl: text(row.facts.url),
      reason: row.reason,
      ifDifferent: row.unmatched,
      record: {
        name: text(row.facts.name),
        company: text(row.facts.company),
        address: text(row.facts.address),
        city: text(row.facts.city),
        state: text(row.facts.state),
        zip: text(row.facts.zip),
        industry: text(row.facts.industry),
        people: whole(row.facts.people),
      },
      candidates: (row.candidates ?? []).flatMap((candidate) => {
        const id = text(candidate.id);
        const plant = id ? plants.get(id) : undefined;
        return id && plant ? [{ id, rule: text(candidate.rule) ?? 'near', metres: whole(candidate.metres), ...plant }] : [];
      }),
      createdAt: new Date(row.created_at).toISOString(),
      skipped: row.skipped_at !== null,
    })),
  };
}

export type ReviewDecision = 'same' | 'different' | 'skip';

export interface ReviewOutcome {
  status: 'same' | 'different' | 'waiting';
  /** The plant the record is now tied to: the one chosen, or the one added. */
  plant: { id: string; name: string } | null;
  /** The facts written onto it. */
  filled: string[];
  /** With 'different': whether the record was added as a new plant, or is held. */
  added: boolean;
}

/**
 * Decides one waiting match.
 *   same       the record is this plant of ours: the source's id is written to
 *              the crosswalk and the record's facts applied (intake_apply_record)
 *   different  it is none of the candidates: they are remembered so no run
 *              proposes them again, and the record is added as a new plant or
 *              held, as its source says
 *   skip       it stays waiting, after the ones nobody has looked at
 * Every decision writes its line in the audit log, in the same transaction.
 * Throws RecordRefusal.
 */
export async function decideReview(id: number, decision: ReviewDecision, candidateId: string | null, actor: Actor): Promise<ReviewOutcome> {
  return db.transaction(async (tx) => {
    const [item] = rowsOf<{ id: number | string; source: string; source_id: string; run_id: number | string; status: string; candidates: StoredCandidate[] | null; unmatched: string; name: string | null }>(
      await tx.execute(sql`
        SELECT q.id, q.source, q.source_id, q.run_id, q.status, q.candidates, s.unmatched, r.facts->>'name' AS name
        FROM intake_review q
        JOIN intake_sources s ON s.slug = q.source
        JOIN intake_records r ON r.source = q.source AND r.source_id = q.source_id
        WHERE q.id = ${id} FOR UPDATE OF q`)
    );
    if (!item) throw new RecordRefusal(404, 'Match not found');
    if (item.status !== 'waiting') throw new RecordRefusal(409, 'That match has already been decided.');
    const runId = Number(item.run_id);
    const candidates = (item.candidates ?? []).map((candidate) => text(candidate.id)).filter((value): value is string => value !== null);
    const recordName = item.name ?? item.source_id;
    const about = { source: item.source, sourceId: item.source_id, match: id };

    if (decision === 'skip') {
      await tx.execute(sql`UPDATE intake_review SET skipped_at = now() WHERE id = ${id}`);
      await recordAudit(tx, { actor, kind: 'factory', recordId: null, recordName, action: 'match skipped', detail: about });
      return { status: 'waiting', plant: null, filled: [], added: false };
    }

    if (decision === 'same') {
      if (!candidateId || !candidates.includes(candidateId)) throw new RecordRefusal(400, 'Choose one of the factories shown.');
      const [plant] = rowsOf<{ id: string; name: string }>(await tx.execute(sql`SELECT id, name FROM factories WHERE id = ${candidateId} FOR UPDATE`));
      if (!plant) throw new RecordRefusal(409, 'That factory is no longer there.');
      // One record of a source per plant: a plant that has taken another id of this source since is not this record.
      const [taken] = rowsOf<{ external_id: string }>(
        await tx.execute(sql`
          SELECT x.external_id FROM external_references x JOIN intake_sources s ON s.ref_source = x.source
          WHERE s.slug = ${item.source} AND x.entity_type = 'factories' AND x.entity_id = ${candidateId} AND NOT x.duplicate AND x.external_id <> ${item.source_id}
          LIMIT 1`)
      );
      if (taken) throw new RecordRefusal(409, `That factory already carries another record of this source (${taken.external_id}).`);
      await tx.execute(sql`
        UPDATE intake_links SET entity_id = ${candidateId}, resolution = 'matched', resolved_run_id = ${runId}
        WHERE source = ${item.source} AND source_id = ${item.source_id}`);
      const [applied] = rowsOf<{ facts: string[] | null }>(
        await tx.execute(sql`SELECT intake_apply_record(${item.source}, ${item.source_id}, ${runId}, ${id}, ${actor.id}::uuid) AS facts`)
      );
      const filled = applied?.facts ?? [];
      await tx.execute(sql`UPDATE intake_review SET status = 'same', entity_id = ${candidateId}, decided_at = now(), decided_by = ${actor.id} WHERE id = ${id}`);
      await tx.execute(sql`
        INSERT INTO load_log (load, kind, action, look, plant, detail, run_id, source_id, entity_id)
        VALUES (${item.source}, 'plant', 'matched', false, ${plant.name}, ${`an admin said the record "${recordName}" is this plant`}, ${runId}, ${item.source_id}, ${candidateId})`);
      await recordAudit(tx, { actor, kind: 'factory', recordId: plant.id, recordName: plant.name, action: 'matched to a source', detail: { ...about, record: recordName, filled } });
      return { status: 'same', plant, filled, added: false };
    }

    // Different: none of the candidates is this record.
    await tx.execute(sql`
      UPDATE intake_links SET
        not_ids = (SELECT coalesce(array_agg(DISTINCT x), '{}') FROM (
                     SELECT unnest(not_ids) AS x UNION SELECT y::uuid FROM jsonb_array_elements_text(${JSON.stringify(candidates)}::jsonb) AS y) n),
        resolution = 'held', resolved_run_id = ${runId}
      WHERE source = ${item.source} AND source_id = ${item.source_id}`);
    let plant: { id: string; name: string } | null = null;
    if (item.unmatched === 'add') {
      const [added] = rowsOf<{ id: string | null }>(
        await tx.execute(sql`SELECT intake_add_plant(${item.source}, ${item.source_id}, ${runId}, ${id}, ${actor.id}::uuid) AS id`)
      );
      if (added?.id) {
        [plant] = rowsOf<{ id: string; name: string }>(await tx.execute(sql`SELECT id, name FROM factories WHERE id = ${added.id}`));
      }
    }
    await tx.execute(sql`UPDATE intake_review SET status = 'different', entity_id = ${plant?.id ?? null}, decided_at = now(), decided_by = ${actor.id} WHERE id = ${id}`);
    if (!plant) {
      await tx.execute(sql`
        INSERT INTO load_log (load, kind, action, look, plant, detail, run_id, source_id)
        VALUES (${item.source}, 'plant', 'held', false, ${recordName}, 'an admin said it is none of the plants proposed', ${runId}, ${item.source_id})`);
    }
    await recordAudit(tx, {
      actor,
      kind: 'factory',
      recordId: plant?.id ?? null,
      recordName: plant?.name ?? recordName,
      action: plant ? 'added from a source' : 'match declined',
      detail: { ...about, notPlants: candidates },
    });
    return { status: 'different', plant, filled: [], added: plant !== null };
  });
}
