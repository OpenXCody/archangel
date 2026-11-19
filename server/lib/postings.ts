import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { recordAudit, type Actor } from './audit.js';
import { RecordRefusal } from './records.js';
import { rowsOf } from './rows.js';

/**
 * Employers' job postings as the server sees them (migration 0054;
 * scripts/ingest/README.md has the design). The intake runner reads each
 * employer's board and keeps the jobs in step with it, outside the deploy.
 * The server reads what the runs left for Admin Tools (each employer's latest
 * run, and the places that wait for a plant) and decides those places. What
 * a decision writes is the database's own function, posting_apply, the same
 * one the runner calls.
 */

// ---------------------------------------------------------------------------
// Each employer's latest run
// ---------------------------------------------------------------------------

export interface PostingSource {
  slug: string;
  employer: string;
  /** The company as the registry names it. */
  company: string | null;
  system: string | null;
  /** Jobs from this employer that are open now. */
  openJobs: number;
  /** Places its postings name where we list no plant of the company. */
  waitingPlaces: number;
  run: {
    id: number;
    startedAt: string;
    /** 'read', 'refused', 'failed' or 'not listed'; null while a run is under way. */
    outcome: string | null;
    /** Why a run that was refused, failed or found no company stopped. */
    why: string | null;
    undone: boolean;
    read: number | null;
    kept: number | null;
    added: number | null;
    changed: number | null;
    closed: number | null;
    /** Postings that name only places with no plant. */
    waiting: number | null;
    requests: number | null;
  } | null;
}

const figure = (counts: Record<string, unknown>, key: string): number | null => (typeof counts[key] === 'number' ? (counts[key] as number) : null);

/** Every employer whose postings have been run, by name, with its latest run. */
export async function postingSources(): Promise<PostingSource[]> {
  const rows = rowsOf<{
    slug: string;
    employer: string | null;
    name: string;
    company: string | null;
    system: string | null;
    open_jobs: number;
    waiting_places: number;
    run_id: number | string | null;
    started_at: string | Date | null;
    state: string | null;
    note: string | null;
    counts: Record<string, unknown> | null;
  }>(
    await db.execute(sql`
      SELECT s.slug, s.publisher AS employer, s.name, s.company, s.system,
             (SELECT count(*)::int FROM jobs j WHERE j.source = s.slug AND j.status = 'open' AND j.expires_at > now()) AS open_jobs,
             (SELECT count(*)::int FROM posting_places p WHERE p.source = s.slug AND p.status = 'waiting') AS waiting_places,
             r.id AS run_id, r.started_at, r.state, r.note, r.counts
      FROM intake_sources s
      LEFT JOIN LATERAL (SELECT * FROM intake_runs r WHERE r.source = s.slug ORDER BY r.id DESC LIMIT 1) r ON true
      WHERE s.kind = 'job'
      ORDER BY lower(coalesce(s.publisher, s.name))`)
  );
  return rows.map((row) => {
    const counts = row.counts ?? {};
    return {
      slug: row.slug,
      employer: row.employer ?? row.name,
      company: row.company,
      system: row.system,
      openJobs: row.open_jobs,
      waitingPlaces: row.waiting_places,
      run:
        row.run_id === null || row.started_at === null
          ? null
          : {
              id: Number(row.run_id),
              startedAt: new Date(row.started_at).toISOString(),
              outcome: typeof counts.outcome === 'string' ? counts.outcome : null,
              why: row.note,
              undone: row.state === 'undone',
              read: figure(counts, 'read'),
              kept: figure(counts, 'kept'),
              added: figure(counts, 'jobsAdded'),
              changed: figure(counts, 'jobsChanged'),
              closed: figure(counts, 'jobsClosed'),
              waiting: figure(counts, 'waiting'),
              requests: figure(counts, 'requests'),
            },
    };
  });
}

// ---------------------------------------------------------------------------
// Postings with no plant
// ---------------------------------------------------------------------------

export interface WaitingPlace {
  source: string;
  placeKey: string;
  employer: string;
  city: string;
  state: string;
  /** How many postings name the place, and the titles most of them carry. */
  postings: number;
  titles: string[];
  /** The company's plants in that state, nearest the top where a distance is known: what the place is most likely to be. */
  plants: { id: string; name: string; city: string | null; company: string }[];
}

/** The places that wait for a person, the ones most postings name first. */
export async function waitingPlaces(limit = 50): Promise<{ places: WaitingPlace[]; total: number }> {
  const rows = rowsOf<{
    source: string;
    place_key: string;
    employer: string | null;
    city: string;
    state: string;
    postings: number;
    titles: string[] | null;
    plants: WaitingPlace['plants'] | null;
    total: number;
  }>(
    await db.execute(sql`
      SELECT p.source, p.place_key, s.publisher AS employer, p.city, p.state, n.postings, n.titles,
             (SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'city', f.city, 'company', co.name) ORDER BY f.city, f.name)
              FROM (SELECT f.* FROM factories f WHERE f.state = p.state AND f.company_id IN (SELECT company_id FROM posting_companies(p.source))
                    ORDER BY f.city, f.name LIMIT 12) f
              JOIN companies co ON co.id = f.company_id) AS plants,
             count(*) OVER ()::int AS total
      FROM posting_places p
      JOIN intake_sources s ON s.slug = p.source
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS postings,
               (SELECT array_agg(title ORDER BY uses DESC, title) FROM (
                  SELECT r2.facts->>'title' AS title, count(*) AS uses FROM intake_records r2
                  WHERE r2.source = p.source AND r2.gone_run_id IS NULL
                    AND EXISTS (SELECT 1 FROM jsonb_array_elements(r2.facts->'reading'->'places') x WHERE posting_place_key(x->>'city', x->>'state') = p.place_key)
                  GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 3) t) AS titles
        FROM intake_records r
        WHERE r.source = p.source AND r.gone_run_id IS NULL
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.facts->'reading'->'places') x WHERE posting_place_key(x->>'city', x->>'state') = p.place_key)
      ) n
      WHERE p.status = 'waiting'
      ORDER BY n.postings DESC, lower(coalesce(s.publisher, p.source)), p.city
      LIMIT ${limit}`)
  );
  return {
    total: rows[0]?.total ?? 0,
    places: rows.map((row) => ({
      source: row.source,
      placeKey: row.place_key,
      employer: row.employer ?? row.source,
      city: row.city,
      state: row.state,
      postings: row.postings,
      titles: row.titles ?? [],
      plants: row.plants ?? [],
    })),
  };
}

/** How many places wait: what Admin Tools counts before it draws the list. */
export async function waitingPlaceCount(): Promise<number> {
  const [row] = rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM posting_places WHERE status = 'waiting'`));
  return row?.n ?? 0;
}

export type PlaceDecision = 'point' | 'leave' | 'wait';

/**
 * Decides a place an employer's postings name:
 *   point  it is the plant `plantId`: every posting naming it becomes a job there, now
 *   leave  it is not a plant we list: it is not asked about again
 *   wait   takes either back: the place waits again, and jobs made by pointing it are closed
 * The jobs are written by posting_apply, journalled under the employer's
 * latest run, so undoing that run takes them back too. Audited.
 */
export async function decidePlace(source: string, placeKey: string, decision: PlaceDecision, plantId: string | null, actor: Actor) {
  return db.transaction(async (tx) => {
    const [place] = rowsOf<{ city: string; state: string; status: string; factory_id: string | null; company: string | null; employer: string | null }>(
      await tx.execute(sql`
        SELECT p.city, p.state, p.status, p.factory_id, s.company, s.publisher AS employer
        FROM posting_places p JOIN intake_sources s ON s.slug = p.source
        WHERE p.source = ${source} AND p.place_key = ${placeKey} FOR UPDATE OF p`)
    );
    if (!place) throw new RecordRefusal(404, 'That place is not on the list.');
    const [run] = rowsOf<{ id: number | string }>(
      await tx.execute(sql`SELECT id FROM intake_runs WHERE source = ${source} AND state = 'applied' ORDER BY id DESC LIMIT 1`)
    );
    if (!run) throw new RecordRefusal(409, 'This employer has no run that is applied. Its postings follow at the next run.');
    const where = `${place.city}, ${place.state}`;
    const employer = place.employer ?? source;

    if (decision === 'point') {
      const [plant] = rowsOf<{ id: string; name: string; state: string | null }>(
        await tx.execute(sql`SELECT id, name, state FROM factories WHERE id = ${plantId}`)
      );
      if (!plant) throw new RecordRefusal(400, 'Choose a plant.', { field: 'plantId' });
      if (plant.state !== place.state) throw new RecordRefusal(400, `That plant is not in ${place.state}.`, { field: 'plantId' });
      await tx.execute(sql`
        UPDATE posting_places SET status = 'pointed', factory_id = ${plant.id}, decided_by = ${actor.id}, decided_at = now()
        WHERE source = ${source} AND place_key = ${placeKey}`);
      const [applied] = rowsOf<{ counts: { added: number; changed: number; reopened: number } }>(
        await tx.execute(sql`SELECT posting_apply(${source}, ${Number(run.id)}, ${placeKey}) AS counts`)
      );
      const jobs = applied.counts.added + applied.counts.changed + applied.counts.reopened;
      await recordAudit(tx, {
        actor,
        kind: 'factory',
        recordId: plant.id,
        recordName: plant.name,
        action: 'postings pointed here',
        detail: { employer, place: where, jobs },
      });
      return { status: 'pointed' as const, jobs, plant: { id: plant.id, name: plant.name } };
    }

    const [company] = rowsOf<{ id: string; name: string }>(
      await tx.execute(sql`
        SELECT c.id, c.name FROM companies c JOIN posting_companies(${source}) pc ON pc.company_id = c.id AND pc.named ORDER BY c.name LIMIT 1`)
    );
    if (decision === 'leave') {
      if (place.status === 'left') return { status: 'left' as const, jobs: 0 };
      await tx.execute(sql`
        UPDATE posting_places SET status = 'left', factory_id = NULL, decided_by = ${actor.id}, decided_at = now()
        WHERE source = ${source} AND place_key = ${placeKey}`);
    } else {
      if (place.status === 'waiting') return { status: 'waiting' as const, jobs: 0 };
      await tx.execute(sql`
        UPDATE posting_places SET status = 'waiting', factory_id = NULL, decided_by = NULL, decided_at = NULL
        WHERE source = ${source} AND place_key = ${placeKey}`);
    }
    // A place that is no longer pointed at a plant: the jobs made by pointing it have nothing behind them.
    let closed = 0;
    if (place.status === 'pointed') {
      const [applied] = rowsOf<{ counts: { closed: number } }>(await tx.execute(sql`SELECT posting_apply(${source}, ${Number(run.id)}) AS counts`));
      closed = applied.counts.closed;
    }
    await recordAudit(tx, {
      actor,
      kind: 'company',
      recordId: company?.id ?? null,
      recordName: company?.name ?? place.company ?? employer,
      action: decision === 'leave' ? 'postings place left' : 'postings place waits again',
      detail: { employer, place: where, ...(closed ? { jobsClosed: closed } : {}) },
    });
    return { status: decision === 'leave' ? ('left' as const) : ('waiting' as const), jobs: closed };
  });
}
