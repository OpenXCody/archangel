import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { recordAudit, type Actor, type Executor } from './audit.js';
import { NOT_FOUND, RecordRefusal } from './records.js';
import { containing } from './like.js';
import { int, rowsOf, text } from './rows.js';

/**
 * Two rows that may be one plant, as Admin Tools works on them (migration
 * 0051; scripts/ingest/README.md has the rules). The database decides and
 * does: which row to keep is `plant_keeps`, what the kept row takes is
 * `plant_merge_takes`, the merge itself `plant_merge`, the same functions the
 * cleanup migration calls. This reads pairs for a person to decide, merges
 * the ones they say are one plant and remembers the ones they say are two.
 */

/** One row of a pair, with what tells it from the other. */
export interface PlantSide {
  id: string;
  name: string;
  company: string | null;
  companyId: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  industry: string | null;
  people: number | null;
  products: string | null;
  openedYear: number | null;
  /** Written from sources, by a research file or an admin. */
  curated: boolean;
  jobs: number;
  /** The outside ids it carries, as "EPA_ECHO 110000308131". */
  ids: string[];
  /** The facts it would take from the other row if it were the one kept. */
  takes: string[];
}

export interface PlantPair {
  a: PlantSide;
  b: PlantSide;
  /** The row the rule would keep (`plant_keeps`): `a.id` or `b.id`. */
  keep: string;
  metres: number | null;
  /** How the pair was found: an outside id both carry, or their company and spot. */
  by: 'id' | 'spot' | null;
  /** The id both carry. */
  shared: string | null;
  /** Why the cleanup left it for a person, in its own word: 'two companies', 'far apart', ... Null when it never looked. */
  reason: string | null;
  /** An admin said they are two plants. */
  apart: boolean;
}

const SIDE = (alias: SQL, other: SQL) => sql`jsonb_build_object(
  'id', ${alias}.id, 'name', ${alias}.name, 'companyId', ${alias}.company_id,
  'company', (SELECT c.name FROM companies c WHERE c.id = ${alias}.company_id),
  'address', ${alias}.address, 'city', ${alias}.city, 'state', ${alias}.state, 'zip', ${alias}.zip_code,
  'industry', ${alias}.primary_naics_description, 'people', ${alias}.workforce_size, 'products', ${alias}.products,
  'openedYear', ${alias}.opened_year, 'curated', ${alias}.curated,
  'jobs', (SELECT count(*)::int FROM jobs j WHERE j.factory_id = ${alias}.id),
  'ids', (SELECT coalesce(jsonb_agg(x.source || ' ' || x.external_id ORDER BY x.source, x.external_id), '[]'::jsonb)
          FROM external_references x WHERE x.entity_type = 'factories' AND x.entity_id = ${alias}.id AND x.source <> 'CURATED'),
  'takes', to_jsonb(plant_merge_takes(${alias}.id, ${other}.id)))`;

/** Everything a pair's card shows, for rows aliased `fa` and `fb`. */
const PAIR_COLUMNS = sql`
  ${SIDE(sql`fa`, sql`fb`)} AS a,
  ${SIDE(sql`fb`, sql`fa`)} AS b,
  plant_keeps(fa.id, fb.id) AS keep,
  CASE WHEN fa.lat IS NOT NULL AND fa.lng IS NOT NULL AND fb.lat IS NOT NULL AND fb.lng IS NOT NULL
    THEN round(sqrt(power((fa.lat - fb.lat) * 111320, 2) + power((fa.lng - fb.lng) * 111320 * cos(radians(fa.lat)), 2)))::int END AS metres,
  (SELECT x.source || ' ' || x.external_id FROM external_references x
     JOIN external_references y ON y.entity_type = 'factories' AND y.source = x.source AND y.external_id = x.external_id AND y.entity_id = fb.id
   WHERE x.entity_type = 'factories' AND x.entity_id = fa.id AND x.source <> 'CURATED' ORDER BY 1 LIMIT 1) AS shared,
  (fa.company_id = fb.company_id AND round(fa.lat::numeric, 3) = round(fb.lat::numeric, 3) AND round(fa.lng::numeric, 3) = round(fb.lng::numeric, 3)) AS spot,
  (SELECT l.evidence->>'reason' FROM load_log l
   WHERE l.entity_id IN (fa.id, fb.id) AND l.action = 'left for review' AND l.evidence->>'other' IN (fa.id::text, fb.id::text)
   ORDER BY l.id DESC LIMIT 1) AS reason,
  EXISTS (SELECT 1 FROM plants_apart p WHERE p.a_id = least(fa.id, fb.id) AND p.b_id = greatest(fa.id, fb.id)) AS apart`;

interface PairRow {
  a: PlantSide;
  b: PlantSide;
  keep: string;
  metres: number | null;
  shared: string | null;
  spot: boolean | null;
  reason: string | null;
  apart: boolean;
}

function pairOf(row: PairRow): PlantPair {
  return {
    a: row.a,
    b: row.b,
    keep: row.keep,
    metres: row.metres === null ? null : int(row.metres),
    by: row.shared ? 'id' : row.spot ? 'spot' : null,
    shared: text(row.shared),
    reason: text(row.reason),
    apart: Boolean(row.apart),
  };
}

/** Two plants side by side, for the merge on a plant's record. Null when either is not there. */
export async function plantPair(aId: string, bId: string): Promise<PlantPair | null> {
  if (aId === bId) return null;
  const [row] = rowsOf<PairRow>(
    await db.execute(sql`SELECT ${PAIR_COLUMNS} FROM factories fa, factories fb WHERE fa.id = ${aId} AND fb.id = ${bId}`)
  );
  return row ? pairOf(row) : null;
}

/** Not said by an admin to be two plants. */
const NOT_APART = sql`NOT EXISTS (SELECT 1 FROM plants_apart p WHERE p.a_id = least(fa.id, fb.id) AND p.b_id = greatest(fa.id, fb.id))`;

/**
 * Pairs of rows that carry one outside id (the EPA registry id): the ones the
 * cleanup was not sure of, and any made since. `fa` is the row whose
 * reference is marked `duplicate`, `fb` the row that holds the id.
 */
const ID_PAIRS = sql`
  FROM external_references x
  JOIN external_references y ON y.entity_type = 'factories' AND y.source = x.source AND y.external_id = x.external_id AND NOT y.duplicate
  JOIN factories fa ON fa.id = x.entity_id
  JOIN factories fb ON fb.id = y.entity_id
  WHERE x.entity_type = 'factories' AND x.source <> 'CURATED' AND x.duplicate AND fa.id <> fb.id AND ${NOT_APART}`;

/** Pairs of rows of one company on one spot: coordinates equal to three decimal places. The quality table's "Duplicates". */
const SPOT_PAIRS = sql`
  FROM factories fa
  JOIN factories fb ON fb.company_id = fa.company_id AND fb.id > fa.id
    AND round(fb.lat::numeric, 3) = round(fa.lat::numeric, 3) AND round(fb.lng::numeric, 3) = round(fa.lng::numeric, 3)
  WHERE fa.lat IS NOT NULL AND fa.lng IS NOT NULL AND ${NOT_APART}`;

export type PairList = 'id' | 'spot';

/** How many pairs of rows carry one outside id and wait for a person. */
export async function waitingIdPairs(): Promise<number> {
  const [row] = rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n ${ID_PAIRS}`));
  return int(row?.n);
}

/**
 * One list of pairs for a person to decide, a page at a time: by state and
 * then by name, so a pair keeps its place while the ones before it are decided.
 * `state` narrows it to pairs with a row filed under that state ('none': under no state).
 */
export async function pairList(list: PairList, options: { state?: string | null; limit: number; offset: number }): Promise<{ pairs: PlantPair[]; total: number }> {
  const from = list === 'id' ? ID_PAIRS : SPOT_PAIRS;
  const inState =
    options.state === 'none'
      ? sql`AND (fa.state IS NULL OR fb.state IS NULL)`
      : options.state
        ? sql`AND (fa.state = ${options.state} OR fb.state = ${options.state})`
        : sql``;
  const [count] = rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n ${from} ${inState}`));
  const rows = rowsOf<PairRow>(
    await db.execute(sql`
      SELECT ${PAIR_COLUMNS} ${from} ${inState}
      ORDER BY fb.state NULLS LAST, lower(fb.name), fb.id, fa.id
      LIMIT ${options.limit} OFFSET ${options.offset}`)
  );
  return { pairs: rows.map(pairOf), total: int(count?.n) };
}

export interface NearPlant {
  id: string;
  name: string;
  /** "Company · City, ST · 120 m": what tells it from its neighbours. */
  detail: string | null;
  href: string;
}

/**
 * Plants a plant could be merged with: the ones of its company, and anyone's
 * within two kilometres. With a term, those whose name contains it; with
 * none, the likeliest first: a row that carries the same outside id, then the
 * nearest.
 */
export async function plantsNear(id: string, term: string, limit = 8): Promise<NearPlant[]> {
  const q = term.trim();
  const named = q.length >= 2 ? sql`AND o.name ILIKE ${containing(q)}` : sql``;
  const rows = rowsOf<{ id: string; name: string; company: string | null; city: string | null; state: string | null; metres: number | null; shares: boolean }>(
    await db.execute(sql`
      SELECT o.id, o.name, (SELECT c.name FROM companies c WHERE c.id = o.company_id) AS company, o.city, o.state, d.metres,
             EXISTS (SELECT 1 FROM external_references x JOIN external_references y ON y.entity_type = 'factories' AND y.source = x.source AND y.external_id = x.external_id
                     WHERE x.entity_type = 'factories' AND x.source <> 'CURATED' AND x.entity_id = f.id AND y.entity_id = o.id) AS shares
      FROM factories f
      JOIN factories o ON o.id <> f.id
      CROSS JOIN LATERAL (
        SELECT CASE WHEN f.lat IS NOT NULL AND f.lng IS NOT NULL AND o.lat IS NOT NULL AND o.lng IS NOT NULL
          THEN round(sqrt(power((f.lat - o.lat) * 111320, 2) + power((f.lng - o.lng) * 111320 * cos(radians(f.lat)), 2)))::int END AS metres) d
      WHERE f.id = ${id}
        AND (o.company_id = f.company_id
             OR (o.lat BETWEEN f.lat - 0.02 AND f.lat + 0.02 AND o.lng BETWEEN f.lng - 0.03 AND f.lng + 0.03 AND d.metres <= 2000))
        ${named}
      ORDER BY 7 DESC, d.metres NULLS LAST, o.name, o.id
      LIMIT ${limit}`)
  );
  return rows.map((row) => {
    const place = [text(row.city), text(row.state)].filter(Boolean).join(', ');
    const far = row.metres === null ? null : row.metres < 1000 ? `${row.metres} m` : `${(row.metres / 1000).toFixed(row.metres < 10_000 ? 1 : 0)} km`;
    return { id: row.id, name: row.name, detail: [text(row.company), place, far].filter(Boolean).join(' · ') || null, href: `/factories/${row.id}` };
  });
}

/** What the database's own refusals mean to the person who asked (plant_merge raises them). */
const REFUSED: Record<string, number> = { PM400: 400, PM404: 404, PM409: 409 };

/** What plant_merge answers. */
export interface MergeOutcome {
  kept: { id: string; name: string };
  merged: { id: string; name: string };
  took: string[];
  moved: Record<string, number>;
  metres: number | null;
}

/**
 * Merges plant `fromId` into plant `intoId` (plant_merge) and writes the
 * audit line, in one transaction. Throws RecordRefusal: 404 when either is
 * not there, 409 for a plant written from sources into one that was not.
 */
export async function mergePlants(fromId: string, intoId: string, actor: Actor): Promise<MergeOutcome> {
  if (fromId === intoId) throw new RecordRefusal(400, 'Choose a different plant to merge into.');
  try {
    return await db.transaction(async (tx) => {
      const [row] = rowsOf<{ merged: MergeOutcome }>(
        await tx.execute(sql`SELECT plant_merge(${intoId}::uuid, ${fromId}::uuid, 'admin', ${actor.id}::uuid, 'plant-merge', 'an admin said they are one plant') AS merged`)
      );
      const outcome = row.merged;
      // An id both rows carried did not move: it is held once. The log line says so; the history counts what moved.
      const { sharedIds: _held, ...moved } = outcome.moved;
      await recordAudit(tx, {
        actor,
        kind: 'factory',
        recordId: intoId,
        recordName: outcome.kept.name,
        action: 'merged',
        detail: {
          merged: outcome.merged,
          ...(outcome.took.length > 0 ? { took: outcome.took } : {}),
          ...(Object.keys(moved).length > 0 ? { moved } : {}),
        },
      });
      return outcome;
    });
  } catch (error) {
    // The database's own refusal, as it worded it (the driver's error, or one wrapped around it).
    const raised = [error, (error as { cause?: unknown }).cause].find(
      (candidate): candidate is { code: string; message: string } =>
        typeof (candidate as { code?: unknown } | undefined)?.code === 'string' && (candidate as { code: string }).code in REFUSED
    );
    if (raised) throw new RecordRefusal(REFUSED[raised.code], raised.message);
    throw error;
  }
}

async function namesOf(executor: Executor, aId: string, bId: string): Promise<{ a: { id: string; name: string }; b: { id: string; name: string } }> {
  const rows = rowsOf<{ id: string; name: string }>(await executor.execute(sql`SELECT id, name FROM factories WHERE id IN (${aId}, ${bId})`));
  const a = rows.find((row) => row.id === aId);
  const b = rows.find((row) => row.id === bId);
  if (!a || !b) throw new RecordRefusal(404, NOT_FOUND.factory);
  return { a, b };
}

/**
 * Remembers that two rows are two plants, or (`apart` false) takes that back.
 * Nothing about either plant changes: they are only no longer offered as one,
 * by the lists in Admin Tools or by a later cleanup. Audited as a `factory` line.
 */
export async function setApart(aId: string, bId: string, apart: boolean, actor: Actor): Promise<{ apart: boolean }> {
  if (aId === bId) throw new RecordRefusal(400, 'Two different plants are needed.');
  const [low, high] = aId < bId ? [aId, bId] : [bId, aId];
  return db.transaction(async (tx) => {
    const { a, b } = await namesOf(tx, aId, bId);
    const changed = apart
      ? rowsOf(await tx.execute(sql`INSERT INTO plants_apart (a_id, b_id, decided_by) VALUES (${low}, ${high}, ${actor.id}) ON CONFLICT (a_id, b_id) DO NOTHING RETURNING a_id`))
      : rowsOf(await tx.execute(sql`DELETE FROM plants_apart WHERE a_id = ${low} AND b_id = ${high} RETURNING a_id`));
    if (changed.length > 0) {
      await recordAudit(tx, {
        actor,
        kind: 'factory',
        recordId: a.id,
        recordName: a.name,
        action: apart ? 'kept apart' : 'no longer kept apart',
        detail: { other: b },
      });
    }
    return { apart };
  });
}
