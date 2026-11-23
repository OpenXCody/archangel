// The intake pipeline: a source's file becomes staged records, the records
// are resolved to our plants, and their facts are applied. Each step is one
// function over a database handle (a connection, or the transaction a
// rehearsal runs in), so the same code rehearses and applies.
//
// What is written to a plant, and the rule for it, is not here: it is
// intake_apply_record and its neighbours in migrations/0043_intake.sql, which
// Admin Tools calls too. scripts/ingest/README.md describes the whole.
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline as pipe } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyLine } from './copy.mjs';
import { diffRun } from './diff.mjs';
import { fileHash, recordHash } from './hash.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Rows sent to the database in one COPY, and records applied in one transaction. */
const LOAD_BATCH = 5000;
const APPLY_BATCH = 1000;
/** Above this many changed records a run says how many changed instead of one line each. */
const CHANGED_LINES = 2000;

export const seconds = (since) => Math.round((Date.now() - since) / 100) / 10;

export function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** One transaction: its own on a connection, the surrounding one inside a rehearsal. */
export function inTransaction(db, work) {
  return typeof db.begin === 'function' ? db.begin(work) : work(db);
}

/** Checks an adapter's description of its source, so a mistake stops the run before the database is touched. */
export function checkSource(source) {
  const problems = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(source?.slug ?? '')) problems.push('slug is lower-case letters, digits and hyphens');
  for (const key of ['name', 'url', 'terms', 'howFetched', 'refSource']) {
    if (typeof source?.[key] !== 'string' || source[key].trim() === '') problems.push(`${key} is missing`);
  }
  if (source?.refSource === 'CURATED') problems.push('refSource "CURATED" is taken: those rows are not ids');
  if (source?.kind !== 'factory' && source?.kind !== 'job') problems.push('kind is "factory" (plants) or "job" (an employer\'s postings)');
  if (source?.kind === 'job' && (typeof source.company !== 'string' || source.company.trim() === '')) problems.push('a source of jobs names its company');
  if (!['known', 'all'].includes(source?.scope)) problems.push('scope is "known" or "all"');
  if (!['hold', 'add'].includes(source?.unmatched)) problems.push('unmatched is "hold" or "add"');
  if (!['empty', 'ranked'].includes(source?.fill)) problems.push('fill is "empty" or "ranked"');
  if (!Number.isInteger(source?.rank) || source.rank < 1 || source.rank > 99) problems.push('rank is a whole number from 1 to 99');
  if (problems.length > 0) throw new Error(`The adapter's source is not usable: ${problems.join('; ')}.`);
  return source;
}

/** The source as the adapter describes it, written to intake_sources: the adapter is where a source is defined. */
export async function registerSource(db, source) {
  checkSource(source);
  await db`
    INSERT INTO intake_sources (slug, name, publisher, url, terms, how_fetched, kind, ref_source, scope, unmatched, fill, rank, ranks)
    VALUES (${source.slug}, ${source.name}, ${source.publisher ?? null}, ${source.url}, ${source.terms}, ${source.howFetched},
            ${source.kind}, ${source.refSource}, ${source.scope}, ${source.unmatched}, ${source.fill}, ${source.rank}, ${db.json(source.ranks ?? {})})
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, publisher = EXCLUDED.publisher, url = EXCLUDED.url, terms = EXCLUDED.terms, how_fetched = EXCLUDED.how_fetched,
      kind = EXCLUDED.kind, ref_source = EXCLUDED.ref_source, scope = EXCLUDED.scope, unmatched = EXCLUDED.unmatched, fill = EXCLUDED.fill,
      rank = EXCLUDED.rank, ranks = EXCLUDED.ranks, updated_at = now()
    WHERE (intake_sources.name, intake_sources.publisher, intake_sources.url, intake_sources.terms, intake_sources.how_fetched, intake_sources.kind,
           intake_sources.ref_source, intake_sources.scope, intake_sources.unmatched, intake_sources.fill, intake_sources.rank, intake_sources.ranks)
      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.publisher, EXCLUDED.url, EXCLUDED.terms, EXCLUDED.how_fetched, EXCLUDED.kind,
           EXCLUDED.ref_source, EXCLUDED.scope, EXCLUDED.unmatched, EXCLUDED.fill, EXCLUDED.rank, EXCLUDED.ranks)`;
  // A source of jobs (migration 0054): the hiring system, the company as our data names it, and the companies it also hires for.
  if (source.kind === 'job') {
    await db`
      UPDATE intake_sources SET system = ${source.system ?? null}, company = ${source.company}, also = ${source.also?.length ? source.also : null}
      WHERE slug = ${source.slug}
        AND (system, company, also) IS DISTINCT FROM (${source.system ?? null}::text, ${source.company}::text, ${source.also?.length ? source.also : null}::text[])`;
  }
}

export async function runRow(db, runId) {
  const [run] = await db`
    SELECT r.*, s.ref_source, s.scope, s.unmatched, s.fill, s.kind FROM intake_runs r JOIN intake_sources s ON s.slug = r.source WHERE r.id = ${runId}`;
  if (!run) throw new Error(`There is no run ${runId}.`);
  return run;
}

export async function note(db, runId, { state, counts, timings, ended = false }) {
  await db`
    UPDATE intake_runs SET
      state = COALESCE(${state ?? null}, state),
      counts = counts || ${db.json(counts ?? {})},
      timings = timings || ${db.json(timings ?? {})},
      ended_at = CASE WHEN ${ended} THEN now() ELSE ended_at END
    WHERE id = ${runId}`;
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

/**
 * Reads a source's file and brings staging up to it. Returns the run's id.
 *
 * The file is read once, in a stream. A source read by id (`scope: 'known'`)
 * keeps only the records whose id we hold, and counts the rest under the
 * labels its adapter gives them. What is kept is compared with what staging
 * holds (diffRun), and only records that are new or changed are sent, by
 * COPY, a batch to a transaction; the others are not touched. A run that
 * stopped part way is taken up again by staging the same file: every write
 * here can be made twice.
 */
export async function stage(db, adapter, file, { log = console.log, startedBy = 'cli' } = {}) {
  const source = checkSource(adapter.source);
  await registerSource(db, source);
  const { sha256, bytes } = await fileHash(file);
  const asOf = adapter.asOfFile ? await adapter.asOfFile(file) : new Date().toISOString().slice(0, 10);

  let [run] = await db`
    SELECT id FROM intake_runs WHERE source = ${source.slug} AND state = 'staging' AND input_sha256 = ${sha256} ORDER BY id DESC LIMIT 1`;
  if (run) {
    await db`DELETE FROM intake_load WHERE run_id = ${run.id}`;
    log(`stage: taking up run ${run.id} again`);
  } else {
    [run] = await db`
      INSERT INTO intake_runs (source, state, input, input_sha256, input_bytes, started_by)
      VALUES (${source.slug}, 'staging', ${path.basename(file)}, ${sha256}, ${bytes}, ${startedBy}) RETURNING id`;
  }
  const runId = run.id;

  const previous = new Map();
  for (const row of await db`SELECT source_id, hash, gone_run_id IS NOT NULL AS gone FROM intake_records WHERE source = ${source.slug}`) {
    previous.set(row.source_id, { hash: row.hash, gone: row.gone });
  }
  const held = new Set();
  for (const row of await db`
    SELECT x.external_id FROM external_references x
    WHERE x.source = ${source.refSource} AND x.entity_type = 'factories' AND NOT x.duplicate`) {
    held.add(row.external_id);
  }

  // Read.
  let started = Date.now();
  const kept = new Map();
  const outside = new Map();
  let read = 0;
  let noId = 0;
  let repeated = 0;
  const everything = source.scope === 'all';
  for await (const row of adapter.rows(file)) {
    read += 1;
    const id = adapter.idOf(row);
    if (!id) {
      noId += 1;
    } else if (everything || held.has(id) || previous.has(id)) {
      // A file that says one id twice: the first row is the record.
      if (kept.has(id)) repeated += 1;
      else {
        // Through JSON and back: a field cut from a large file still holds the piece of the file it was cut from,
        // and tens of thousands of kept records would hold most of the file in memory.
        const record = JSON.parse(JSON.stringify(await adapter.read(row, { asOf })));
        kept.set(String(id), { payload: record.payload, facts: record.facts, hash: recordHash(record.payload, adapter.version ?? 1) });
      }
    } else if (adapter.classify) {
      for (const label of adapter.classify(row)) {
        if (!outside.has(label)) outside.set(label, new Set());
        outside.get(label).add(id);
      }
    }
  }
  const readSeconds = seconds(started);

  // Compare, then write.
  started = Date.now();
  const incoming = new Map();
  for (const [id, record] of kept) incoming.set(id, record.hash);
  const diff = diffRun(previous, incoming);
  const missing = [...held].filter((id) => !incoming.has(id)).sort();

  const changedFacts = new Map();
  if (diff.changed.length > 0 && diff.changed.length <= CHANGED_LINES) {
    for (const row of await db`SELECT source_id, facts FROM intake_records WHERE source = ${source.slug} AND source_id = ANY(${diff.changed})`) {
      changedFacts.set(row.source_id, row.facts);
    }
  }

  const toLoad = [...diff.fresh, ...diff.changed];
  let seq = 0;
  for (const batch of chunks(toLoad, LOAD_BATCH)) {
    const lines = batch.map((id) => {
      const record = kept.get(id);
      seq += 1;
      return copyLine([runId, seq, id, record.payload, record.facts, record.hash]);
    });
    await inTransaction(db, async (tx) => {
      const writable = await tx`COPY intake_load (run_id, seq, source_id, payload, facts, hash) FROM STDIN`.writable();
      await pipe(Readable.from(lines), writable);
    });
  }
  for (let from = 1; from <= seq; from += LOAD_BATCH * 2) {
    await db`
      INSERT INTO intake_records (source, source_id, first_run_id, changed_run_id, payload, facts, hash)
      SELECT ${source.slug}, l.source_id, ${runId}, ${runId}, l.payload, l.facts, l.hash
      FROM intake_load l WHERE l.run_id = ${runId} AND l.seq >= ${from} AND l.seq < ${from + LOAD_BATCH * 2}
      ON CONFLICT (source, source_id) DO UPDATE SET
        changed_run_id = EXCLUDED.changed_run_id, gone_run_id = NULL,
        payload = EXCLUDED.payload, facts = EXCLUDED.facts, hash = EXCLUDED.hash`;
    // The short row beside each record, where what is decided about it is kept.
    await db`
      INSERT INTO intake_links (source, source_id)
      SELECT ${source.slug}, l.source_id FROM intake_load l WHERE l.run_id = ${runId} AND l.seq >= ${from} AND l.seq < ${from + LOAD_BATCH * 2}
      ON CONFLICT (source, source_id) DO NOTHING`;
  }
  // A record that is the same is left alone: that it has no gone_run_id says it is still at the source.
  for (const batch of chunks(diff.back, LOAD_BATCH * 2)) {
    await db`UPDATE intake_records SET gone_run_id = NULL WHERE source = ${source.slug} AND source_id = ANY(${batch})`;
  }
  for (const batch of chunks(diff.gone, LOAD_BATCH * 2)) {
    await db`UPDATE intake_records SET gone_run_id = ${runId} WHERE source = ${source.slug} AND source_id = ANY(${batch})`;
  }
  await db`DELETE FROM intake_load WHERE run_id = ${runId}`;

  // The lines: a record that changed says what changed; an id of ours the
  // source no longer has is said once, the first time it is missed.
  if (changedFacts.size > 0) {
    const rows = [];
    for (const [id, before] of changedFacts) {
      const after = kept.get(id).facts;
      const evidence = {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (key !== 'asOf' && JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) evidence[key] = [before[key] ?? null, after[key] ?? null];
      }
      rows.push({ load: source.slug, kind: 'plant', action: 'changed', look: false, plant: after.name ?? before.name ?? null,
        detail: `the source changed: ${Object.keys(evidence).join(', ') || 'nothing we read'}`, run_id: runId, source_id: id, evidence });
    }
    for (const batch of chunks(rows, 500)) {
      await db`
        INSERT INTO load_log (load, kind, action, look, plant, detail, run_id, source_id, evidence)
        SELECT load, kind, action, look, plant, detail, run_id, source_id, evidence
        FROM jsonb_to_recordset(${db.json(batch)}) AS t(load text, kind text, action text, look boolean, plant text, detail text, run_id bigint, source_id text, evidence jsonb)`;
    }
  } else if (diff.changed.length > 0) {
    await db`
      INSERT INTO load_log (load, kind, action, look, detail, run_id)
      VALUES (${source.slug}, 'run', 'changed', true, ${`${diff.changed.length} records changed at the source: too many to list one by one`}, ${runId})`;
  }
  for (const batch of chunks(missing, LOAD_BATCH * 2)) {
    await db`
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id, entity_id)
      SELECT ${source.slug}, 'plant', 'gone', true, co.name, f.name, 'the source no longer has the record this plant carries the id of', ${runId}, x.external_id, f.id
      FROM external_references x JOIN factories f ON f.id = x.entity_id LEFT JOIN companies co ON co.id = f.company_id
      WHERE x.source = ${source.refSource} AND x.entity_type = 'factories' AND NOT x.duplicate AND x.external_id = ANY(${batch})
        AND NOT EXISTS (SELECT 1 FROM load_log l WHERE l.load = ${source.slug} AND l.action = 'gone' AND l.source_id = x.external_id)`;
  }

  const counts = {
    read, noId, repeated, ourIds: held.size, staged: kept.size,
    new: diff.fresh.length, changed: diff.changed.length, same: diff.same.length, back: diff.back.length, gone: diff.gone.length,
    missing: missing.length,
    outside: Object.fromEntries([...outside].map(([label, ids]) => [label, ids.size])),
    asOf,
  };
  await note(db, runId, { state: 'staged', counts, timings: { read: readSeconds, write: seconds(started) } });
  log(`stage: run ${runId}: read ${read.toLocaleString('en-US')} rows in ${readSeconds} s; staged ${kept.size.toLocaleString('en-US')} ` +
    `(${counts.new.toLocaleString('en-US')} new, ${counts.changed.toLocaleString('en-US')} changed, ${counts.same.toLocaleString('en-US')} the same, ${counts.gone.toLocaleString('en-US')} gone) in ${seconds(started)} s`);
  return runId;
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

let loaderSql = null;
/** The employer loader's functions (pg_temp.el_norm, el_bare, el_words, el_share, el_refers, el_metres): the one matcher. */
async function matcherSql() {
  if (!loaderSql) loaderSql = await readFile(path.join(HERE, '..', '..', 'employers-loader.sql'), 'utf8');
  return loaderSql;
}

/**
 * Decides which of our plants each staged record is. It writes only to the
 * intake tables and load_log: nothing the site reads changes here.
 *
 * 1. By id: the crosswalk has the source's id for one of our plants. A plant
 *    merged away since is followed to the one it became (record_now).
 * 2. By rule, for the rest: the employer loader's rules (company by exact
 *    name or other name, in any letter case; plant by company, name and
 *    distance), through its own functions. A candidate the loader would take
 *    without flagging it is taken; one it would flag for a look, or two that
 *    fit equally, goes to the review queue with the evidence; a record with
 *    no candidate is held, or marked to be added, as the source says.
 * `again` also reconsiders records held by an earlier run.
 */
export async function resolve(db, runId, { log = console.log, again = false } = {}) {
  const run = await runRow(db, runId);
  if (!['staged', 'resolved'].includes(run.state)) throw new Error(`Run ${runId} is ${run.state}: only a staged run is resolved.`);
  const started = Date.now();
  const slug = run.source;

  // A plant that has gone since an earlier run decided: the one it was merged into, or undecided again.
  await db`
    UPDATE intake_links r SET
      entity_id = n.id,
      resolution = CASE WHEN n.id IS NULL THEN NULL ELSE r.resolution END,
      resolved_run_id = CASE WHEN n.id IS NULL THEN NULL ELSE r.resolved_run_id END
    FROM (
      SELECT r2.source_id, (SELECT f.id FROM factories f WHERE f.id = record_now('factory', r2.entity_id)) AS id
      FROM intake_links r2
      WHERE r2.source = ${slug} AND r2.entity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM factories f WHERE f.id = r2.entity_id)
    ) n
    WHERE r.source = ${slug} AND r.source_id = n.source_id`;

  const byIdDirect = await db`
    UPDATE intake_links r SET entity_id = x.entity_id, resolution = 'id', resolved_run_id = ${runId}
    FROM external_references x JOIN factories f ON f.id = x.entity_id, intake_records s
    WHERE r.source = ${slug} AND r.entity_id IS NULL
      AND s.source = r.source AND s.source_id = r.source_id AND s.gone_run_id IS NULL
      AND x.source = ${run.ref_source} AND x.entity_type = 'factories' AND x.external_id = r.source_id AND NOT x.duplicate`;
  const byIdMerged = await db`
    UPDATE intake_links r SET entity_id = f.id, resolution = 'id', resolved_run_id = ${runId}
    FROM external_references x JOIN factories f ON f.id = record_now('factory', x.entity_id), intake_records s
    WHERE r.source = ${slug} AND r.entity_id IS NULL
      AND s.source = r.source AND s.source_id = r.source_id AND s.gone_run_id IS NULL
      AND x.source = ${run.ref_source} AND x.entity_type = 'factories' AND x.external_id = r.source_id AND NOT x.duplicate
      AND NOT EXISTS (SELECT 1 FROM factories g WHERE g.id = x.entity_id)`;
  const byId = byIdDirect.count + byIdMerged.count;
  if (byId > 0) {
    await db`
      INSERT INTO load_log (load, kind, action, look, detail, run_id)
      VALUES (${slug}, 'run', 'matched by id', false, ${`${byId} records are plants whose id we hold`}, ${runId})`;
  }

  const sql = await matcherSql();
  const byRule = await inTransaction(db, async (tx) => {
    await tx.unsafe(sql);
    await tx.unsafe(`
      DROP TABLE IF EXISTS in_rec, in_co, in_pos, in_cand;
      CREATE TEMP TABLE in_co ON COMMIT DROP AS
        SELECT id, lower(name) AS key FROM companies
        UNION SELECT c.id, lower(a) FROM companies c, unnest(c.aliases) a;
      CREATE INDEX ON in_co (key);
      CREATE TEMP TABLE in_pos ON COMMIT DROP AS
        SELECT id, latitude::float8 AS lat, longitude::float8 AS lng FROM factories
        WHERE latitude ~ '^-?[0-9]+([.][0-9]+)?$' AND longitude ~ '^-?[0-9]+([.][0-9]+)?$';
      CREATE INDEX ON in_pos (lat);
      CREATE INDEX ON in_pos (id);
      ANALYZE in_pos;`);
    await tx`
      CREATE TEMP TABLE in_rec ON COMMIT DROP AS
      SELECT r.source_id, r.facts, r.not_ids,
             NULLIF(btrim(r.facts->>'name'), '') AS name,
             NULLIF(btrim(r.facts->>'company'), '') AS company,
             CASE WHEN r.facts->>'latitude' ~ '^-?[0-9]+([.][0-9]+)?$' AND r.facts->>'longitude' ~ '^-?[0-9]+([.][0-9]+)?$'
                  THEN (r.facts->>'latitude')::float8 END AS lat,
             CASE WHEN r.facts->>'latitude' ~ '^-?[0-9]+([.][0-9]+)?$' AND r.facts->>'longitude' ~ '^-?[0-9]+([.][0-9]+)?$'
                  THEN (r.facts->>'longitude')::float8 END AS lng,
             '{}'::uuid[] AS companies, '{}'::uuid[] AS parents, '{}'::uuid[] AS family,
             '{}'::text[] AS keys, '{}'::text[] AS bare, '{}'::text[] AS drop_words, '{}'::text[] AS words, ''::text AS nname
      FROM intake_staged r
      WHERE r.source = ${slug} AND r.gone_run_id IS NULL AND r.entity_id IS NULL
        AND (r.resolution IS NULL OR (${again} AND r.resolution IN ('held', 'new')))`;
    await tx.unsafe(`
      UPDATE in_rec p SET companies = coalesce((SELECT array_agg(DISTINCT k.id) FROM in_co k WHERE k.key = lower(p.company)), '{}');
      UPDATE in_rec p SET
        parents = coalesce((SELECT array_agg(DISTINCT co.parent_company_id) FROM companies co
                            WHERE co.id = ANY (p.companies) AND co.parent_company_id IS NOT NULL), '{}'),
        keys = coalesce((SELECT array_agg(DISTINCT n) FROM (
                  SELECT pg_temp.el_norm(a) AS n FROM companies co, unnest(ARRAY[co.name] || coalesce(co.aliases, '{}')) a WHERE co.id = ANY (p.companies)
                  UNION SELECT pg_temp.el_norm(p.company) WHERE p.company IS NOT NULL) s WHERE length(n) >= 3), '{}'),
        drop_words = regexp_split_to_array(pg_temp.el_norm(coalesce(p.company, '') || ' ' || coalesce(p.facts->>'city', '') || ' ' || coalesce(p.facts->>'state', '')), ' '),
        nname = pg_temp.el_bare(p.name);
      UPDATE in_rec p SET
        bare = coalesce((SELECT array_agg(DISTINCT pg_temp.el_bare(k)) FROM unnest(p.keys) k), '{}'),
        words = pg_temp.el_words(p.name, p.drop_words),
        family = p.companies || p.parents || coalesce((SELECT array_agg(co.id) FROM companies co WHERE co.parent_company_id = ANY (p.companies)), '{}');
      CREATE INDEX ON in_rec (source_id);

      -- Every plant that could be the record: anyone's within about 300 m, and the plants of its company, its
      -- company's parent and its company's parts within 10 km. A plant an admin said it is not is left out, and so
      -- is one that already carries another id of this source.
      CREATE TEMP TABLE in_cand ON COMMIT DROP AS
      SELECT t.*,
             CASE
               WHEN rel IN (0, 1) THEN d <= CASE class WHEN 0 THEN 5000 WHEN 1 THEN 3000 ELSE 1500 END AND NOT (class = 3 AND curated)
               WHEN rel = 2 THEN (class = 0 AND d <= 5000) OR (class = 1 AND d <= 1500) OR (refers AND d <= CASE class WHEN 1 THEN 3000 ELSE 1500 END)
               WHEN has_company THEN d <= 250 AND (class = 0 OR names_us OR same_site)
               -- A record that names no company is known by its own name and place only.
               ELSE (class = 0 AND d <= 5000) OR (d <= 250 AND (class = 1 OR same_site))
             END AS usual,
             CASE
               WHEN has_company THEN rel <> 0 OR (curated AND class <> 0) OR (class = 3 AND NOT refers AND d > 500) OR d > 1500
               ELSE NOT (class = 0 AND d <= 250)
             END AS look
      FROM (
        SELECT b.*,
               CASE WHEN pg_temp.el_bare(b.fname) = b.nname THEN 0
                    WHEN pg_temp.el_share(b.words, fw.words) THEN 1
                    WHEN cardinality(b.words) = 0 OR cardinality(fw.words) = 0 THEN 2
                    ELSE 3 END AS class,
               pg_temp.el_refers(b.fname, b.keys) AS refers,
               coalesce((SELECT max(length(key)) FROM unnest(b.keys) key WHERE position(' ' || key || ' ' IN ' ' || pg_temp.el_norm(b.fname) || ' ') > 0), 0)
                 > CASE WHEN position(' ' || pg_temp.el_bare(b.cname) || ' ' IN ' ' || pg_temp.el_norm(b.fname) || ' ') > 0 THEN length(pg_temp.el_bare(b.cname)) ELSE 0 END
                 OR pg_temp.el_bare(b.cname) = ANY (b.bare) AS names_us,
               cardinality(b.words) >= 2 AND b.words <@ fw.words AS same_site
        FROM (
          SELECT p.source_id, p.nname, p.words, p.drop_words, p.keys, p.bare, p.company IS NOT NULL AS has_company,
                 f.id, f.name AS fname, f.city AS fcity, f.state AS fstate, f.curated, f.company_id, oc.name AS cname,
                 CASE WHEN f.company_id = ANY (p.companies) THEN 0
                      WHEN oc.parent_company_id = ANY (p.companies) THEN 1
                      WHEN f.company_id = ANY (p.parents) THEN 2 ELSE 3 END AS rel,
                 pg_temp.el_metres(p.lat, p.lng, x.lat, x.lng) AS d
          FROM in_rec p
          CROSS JOIN LATERAL (
            SELECT x.id FROM in_pos x
              WHERE x.lat BETWEEN p.lat - 0.003 AND p.lat + 0.003 AND x.lng BETWEEN p.lng - 0.004 AND p.lng + 0.004
            UNION
            SELECT f2.id FROM factories f2 WHERE f2.company_id = ANY (p.family)
            UNION
            SELECT f3.id FROM factories f3 WHERE p.company IS NULL AND f3.name = p.name
          ) near
          JOIN in_pos x ON x.id = near.id
          JOIN factories f ON f.id = near.id
          LEFT JOIN companies oc ON oc.id = f.company_id
          WHERE p.name IS NOT NULL AND p.lat IS NOT NULL
            AND pg_temp.el_metres(p.lat, p.lng, x.lat, x.lng) <= 10000
            AND f.id <> ALL (p.not_ids)
          OFFSET 0
        ) b
        CROSS JOIN LATERAL (SELECT pg_temp.el_words(b.fname, b.drop_words) AS words) fw
      ) t;`);
    // A plant that already carries an id of this source is another of its records.
    await tx`
      DELETE FROM in_cand c USING external_references x
      WHERE x.source = ${run.ref_source} AND x.entity_type = 'factories' AND x.entity_id = c.id AND NOT x.duplicate`;

    // The best candidate of each record; then what to make of it.
    await tx.unsafe(`
      DROP TABLE IF EXISTS in_best;
      CREATE TEMP TABLE in_best ON COMMIT DROP AS
      SELECT s.*, count(*) OVER (PARTITION BY s.id) AS takers
      FROM (
        SELECT c.*, row_number() OVER w AS pick,
               count(*) OVER (PARTITION BY c.source_id, c.class) AS of_class,
               count(*) OVER (PARTITION BY c.source_id) AS options
        FROM in_cand c WHERE c.usual
        WINDOW w AS (PARTITION BY c.source_id ORDER BY c.class, c.rel, c.d, c.id)
      ) s WHERE s.pick = 1;`);
    // The rule a candidate was found by, in the loader's words. A fragment is made for each place it is used.
    const ruleOf = () => tx`CASE b.class WHEN 0 THEN 'same name' WHEN 1 THEN 'shared word' WHEN 2 THEN 'near' ELSE CASE WHEN b.refers THEN 'near' ELSE 'near, unrelated name' END END`;

    const matched = await tx`
      WITH sure AS (
        SELECT b.* FROM in_best b WHERE NOT b.look AND b.of_class = 1 AND b.takers = 1
      ), done AS (
        UPDATE intake_links r SET entity_id = s.id, resolution = 'matched', resolved_run_id = ${runId}
        FROM sure s WHERE r.source = ${slug} AND r.source_id = s.source_id
        RETURNING r.source_id
      )
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, metres, run_id, source_id, entity_id, evidence)
      SELECT ${slug}, 'plant', 'matched', false, p.company, p.name,
             format('%s: "%s" at %s m', ${ruleOf()}, b.fname, b.d), b.d, ${runId}, b.source_id, b.id,
             jsonb_build_object('rule', ${ruleOf()}, 'metres', b.d, 'ours', b.fname, 'company', b.cname)
      FROM sure b JOIN in_rec p ON p.source_id = b.source_id JOIN done d ON d.source_id = b.source_id`;

    const queued = await tx`
      WITH unsure AS (
        SELECT b.*,
               concat_ws('; ',
                 CASE WHEN b.takers > 1 THEN 'another record of this source fits the same factory' END,
                 CASE WHEN b.of_class > 1 THEN b.of_class || ' factories fit equally' END,
                 CASE WHEN b.has_company AND b.rel = 2 THEN 'the factory is filed under the parent company'
                      WHEN b.has_company AND b.rel = 3 THEN 'the factory is filed under another company'
                      WHEN b.has_company AND b.rel = 1 THEN 'the factory is filed under a company that is part of this one' END,
                 CASE WHEN b.curated AND b.class <> 0 THEN 'the factory is already described under another name' END,
                 CASE WHEN b.class = 3 AND NOT b.refers AND b.d > 500 THEN 'the names have nothing in common' END,
                 CASE WHEN NOT b.has_company AND b.class <> 0 THEN 'the names differ' END,
                 CASE WHEN b.d > 1500 OR (NOT b.has_company AND b.d > 250) THEN b.d || ' m apart' END) AS why
        FROM in_best b WHERE b.look OR b.of_class > 1 OR b.takers > 1
      ), held AS (
        UPDATE intake_links r SET resolution = 'review', resolved_run_id = ${runId}
        FROM unsure u WHERE r.source = ${slug} AND r.source_id = u.source_id
        RETURNING r.source_id
      ), item AS (
        INSERT INTO intake_review (source, source_id, run_id, reason, candidates)
        SELECT ${slug}, u.source_id, ${runId}, coalesce(NULLIF(u.why, ''), 'not sure'),
               (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'rule', c.rule, 'metres', c.d, 'name', c.fname, 'company', c.cname, 'city', c.fcity, 'state', c.fstate) ORDER BY c.class, c.rel, c.d, c.id)
                FROM (SELECT c.*, CASE c.class WHEN 0 THEN 'same name' WHEN 1 THEN 'shared word' WHEN 2 THEN 'near' ELSE CASE WHEN c.refers THEN 'near' ELSE 'near, unrelated name' END END AS rule
                      FROM in_cand c WHERE c.source_id = u.source_id AND c.usual ORDER BY c.class, c.rel, c.d, c.id LIMIT 3) c)
        FROM unsure u JOIN held h ON h.source_id = u.source_id
        ORDER BY u.source_id
        ON CONFLICT (source, source_id) WHERE status = 'waiting' DO NOTHING
        RETURNING source_id
      )
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, metres, run_id, source_id, entity_id)
      SELECT ${slug}, 'plant', 'queued', true, p.company, p.name,
             format('%s: "%s" at %s m. %s', ${ruleOf()}, b.fname, b.d, b.why), b.d, ${runId}, b.source_id, b.id
      FROM unsure b JOIN in_rec p ON p.source_id = b.source_id JOIN item i ON i.source_id = b.source_id`;

    // No candidate: held, or marked to be added when the run is applied. The nearest plant is said when there is one close by.
    const rest = await tx`
      WITH none AS (
        SELECT p.source_id, p.name, p.company, p.lat IS NULL OR p.name IS NULL AS unplaced,
               (SELECT format('"%s" at %s m', f.name, s.d) FROM (
                  SELECT x.id, pg_temp.el_metres(p.lat, p.lng, x.lat, x.lng) AS d FROM in_pos x
                  WHERE x.lat BETWEEN p.lat - 0.003 AND p.lat + 0.003 AND x.lng BETWEEN p.lng - 0.004 AND p.lng + 0.004 ORDER BY 2 LIMIT 1) s
                JOIN factories f ON f.id = s.id WHERE s.d <= 250) AS beside
        FROM in_rec p WHERE NOT EXISTS (SELECT 1 FROM in_best b WHERE b.source_id = p.source_id)
      ), done AS (
        UPDATE intake_links r SET
          resolution = CASE WHEN ${run.unmatched} = 'add' AND NOT n.unplaced THEN 'new' ELSE 'held' END, resolved_run_id = ${runId}
        FROM none n WHERE r.source = ${slug} AND r.source_id = n.source_id
        RETURNING r.source_id, r.resolution
      )
      INSERT INTO load_log (load, kind, action, look, company, plant, detail, run_id, source_id)
      SELECT ${slug}, 'plant', CASE d.resolution WHEN 'new' THEN 'new' ELSE 'held' END, n.beside IS NOT NULL OR n.unplaced, n.company, n.name,
             concat_ws('; ', CASE WHEN n.unplaced THEN 'the record has no name or no coordinates' ELSE 'none of our plants fits' END,
                             'a plant under another name beside it: ' || n.beside),
             ${runId}, n.source_id
      FROM none n JOIN done d ON d.source_id = n.source_id
      -- A record that will simply be added says so when it is: only one beside another plant is worth a line now.
      WHERE d.resolution = 'held' OR n.beside IS NOT NULL
      RETURNING action`;
    const [tally] = await tx`
      SELECT count(*) FILTER (WHERE r.resolution = 'new')::int AS fresh, count(*) FILTER (WHERE r.resolution = 'held')::int AS held
      FROM intake_links r JOIN in_rec p ON p.source_id = r.source_id WHERE r.source = ${slug} AND r.resolved_run_id = ${runId}`;
    void rest;
    return { matched: matched.count, queued: queued.count, fresh: tally.fresh, held: tally.held };
  });

  const counts = { byId, byRule: byRule.matched, queued: byRule.queued, toAdd: byRule.fresh, held: byRule.held };
  await note(db, runId, { state: 'resolved', counts, timings: { resolve: seconds(started) } });
  log(`resolve: run ${runId}: ${byId.toLocaleString('en-US')} by id, ${counts.byRule} by rule, ${counts.queued} queued, ${counts.toAdd} to add, ${counts.held} held in ${seconds(started)} s`);
  return counts;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Writes what a resolved run decided: the plants it adds, then every
 * resolved record's id and facts (intake_apply_record), a batch of records to
 * a transaction, so the tables the site reads are never held for long. Only
 * records not yet applied in their present version are written, which is
 * also what lets an apply that stopped be started again. `all` writes every
 * record of the source again (after a rule or a rank changed).
 */
export async function apply(db, runId, { log = console.log, all = false } = {}) {
  const run = await runRow(db, runId);
  if (!['resolved', 'applying', 'applied'].includes(run.state)) throw new Error(`Run ${runId} is ${run.state}: only a resolved run is applied.`);
  const started = Date.now();
  const slug = run.source;
  await note(db, runId, { state: 'applying' });
  if (all) await db`UPDATE intake_links SET applied_hash = NULL WHERE source = ${slug} AND entity_id IS NOT NULL`;

  let added = 0;
  if (run.unmatched === 'add') {
    let last = '';
    for (;;) {
      const rows = await inTransaction(db, (tx) => tx`
        SELECT t.source_id, intake_add_plant(${slug}, t.source_id, ${runId}) AS id
        FROM (SELECT source_id FROM intake_staged
              WHERE source = ${slug} AND resolution = 'new' AND gone_run_id IS NULL AND source_id > ${last}
              ORDER BY source_id LIMIT ${APPLY_BATCH}) t`);
      if (rows.length === 0) break;
      last = rows[rows.length - 1].source_id;
      added += rows.filter((row) => row.id).length;
    }
  }

  let records = 0;
  // In id order, each batch starting after the last: a record whose plant has gone is passed over, not met again.
  let after = '';
  for (;;) {
    const rows = await inTransaction(db, (tx) => tx`
      SELECT t.source_id, intake_apply_record(${slug}, t.source_id, ${runId}) AS facts
      FROM (SELECT source_id FROM intake_staged
            WHERE source = ${slug} AND entity_id IS NOT NULL AND gone_run_id IS NULL AND applied_hash IS DISTINCT FROM hash
              AND source_id > ${after}
            ORDER BY source_id LIMIT ${APPLY_BATCH}) t`);
    if (rows.length === 0) break;
    after = rows[rows.length - 1].source_id;
    records += rows.length;
  }
  const [{ ids }] = await db`SELECT count(*)::int AS ids FROM intake_changes WHERE run_id = ${runId} AND op = 'id' AND undone_at IS NULL`;
  const [{ unfilled }] = await db`SELECT count(*)::int AS unfilled FROM load_log WHERE run_id = ${runId} AND action = 'not filled'`;
  // A plant the run added came with its facts: "changed" and "filled" are about plants that were there.
  const [{ changed }] = await db`
    SELECT count(DISTINCT c.entity_id)::int AS changed FROM intake_changes c
    WHERE c.run_id = ${runId} AND c.op = 'fact' AND c.undone_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM intake_changes a WHERE a.run_id = c.run_id AND a.op = 'plant' AND a.entity_id = c.entity_id)`;
  const filled = Object.fromEntries((await db`
    SELECT c.fact, count(*)::int AS n FROM intake_changes c
    WHERE c.run_id = ${runId} AND c.op = 'fact' AND c.undone_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM intake_changes a WHERE a.run_id = c.run_id AND a.op = 'plant' AND a.entity_id = c.entity_id)
    GROUP BY c.fact ORDER BY c.fact`).map((row) => [row.fact, row.n]));

  const counts = { applied: records + added, added, plantsChanged: changed, filled, idsWritten: ids, notFilled: unfilled };
  await note(db, runId, { state: 'applied', counts, timings: { apply: seconds(started) }, ended: true });
  log(`apply: run ${runId}: ${counts.applied.toLocaleString('en-US')} records written, ${changed.toLocaleString('en-US')} plants changed ` +
    `(${Object.entries(filled).map(([fact, n]) => `${fact} ${n.toLocaleString('en-US')}`).join(', ') || 'no fact filled'}), ${added} added in ${seconds(started)} s`);
  return counts;
}

// ---------------------------------------------------------------------------
// Undo, forget, list
// ---------------------------------------------------------------------------

/** Takes back what a run changed (intake_undo_run), in one transaction. Returns what it restored and what it left. */
export async function undo(db, runId, { log = console.log } = {}) {
  const run = await runRow(db, runId);
  if (run.state === 'undone') throw new Error(`Run ${runId} is already undone.`);
  // Newest first: a later run of the source may have built on this one's values.
  const [later] = await db`SELECT id FROM intake_runs WHERE source = ${run.source} AND id > ${runId} AND state IN ('applying', 'applied') ORDER BY id DESC LIMIT 1`;
  if (later) throw new Error(`Run ${later.id} of ${run.source} was applied after run ${runId}. Undo run ${later.id} first.`);
  const started = Date.now();
  const result = await inTransaction(db, async (tx) => {
    const [{ done }] = await tx`SELECT intake_undo_run(${runId}) AS done`;
    await tx`
      INSERT INTO load_log (load, kind, action, look, detail, run_id)
      VALUES (${run.source}, 'run', 'undone', ${done.kept > 0},
              ${run.kind === 'job'
                ? `${done.jobs} jobs removed or put back, ${done.ids} ids taken back, ${done.kept} left because they changed since`
                : `${done.restored} facts restored, ${done.ids} ids taken back, ${done.plants} plants and ${done.companies} companies removed, ${done.kept} left because they changed since`}, ${runId})`;
    await tx`
      UPDATE intake_runs SET state = 'undone', ended_at = now(), counts = counts || ${tx.json({ undone: done })},
                             timings = timings || ${tx.json({ undo: seconds(started) })} WHERE id = ${runId}`;
    return done;
  });
  log(run.kind === 'job'
    ? `undo: run ${runId}: ${result.jobs} jobs removed or put back, ${result.ids} ids taken back, ${result.kept} left because they changed since, in ${seconds(started)} s`
    : `undo: run ${runId}: ${result.restored} facts restored, ${result.ids} ids taken back, ${result.plants} plants and ${result.companies} companies removed, ${result.kept} left because they changed since, in ${seconds(started)} s`);
  return result;
}

/**
 * Removes a source and everything intake holds for it: its runs, staged
 * records, queue and lines. Refused while one of its runs is applied and not
 * undone, because the plants would keep facts whose origin is gone.
 */
export async function forget(db, slug, { log = console.log } = {}) {
  const [live] = await db`SELECT id FROM intake_runs WHERE source = ${slug} AND state IN ('applying', 'applied') LIMIT 1`;
  if (live) throw new Error(`Run ${live.id} of ${slug} is applied. Undo it first.`);
  await inTransaction(db, async (tx) => {
    await tx`DELETE FROM load_log WHERE run_id IN (SELECT id FROM intake_runs WHERE source = ${slug})`;
    await tx`DELETE FROM intake_changes WHERE run_id IN (SELECT id FROM intake_runs WHERE source = ${slug})`;
    await tx`DELETE FROM intake_review WHERE source = ${slug}`;
    await tx`DELETE FROM intake_load WHERE run_id IN (SELECT id FROM intake_runs WHERE source = ${slug})`;
    await tx`DELETE FROM intake_sources WHERE slug = ${slug}`;
  });
  log(`forget: ${slug} and its runs, staged records, queue and lines are gone`);
}

/** The sources and their latest runs, newest first. */
export async function list(db, { runs = 5 } = {}) {
  const sources = await db`SELECT * FROM intake_sources ORDER BY slug`;
  const out = [];
  for (const source of sources) {
    out.push({
      ...source,
      staged: (await db`SELECT count(*)::int AS n FROM intake_records WHERE source = ${source.slug} AND gone_run_id IS NULL`)[0].n,
      waiting: (await db`SELECT count(*)::int AS n FROM intake_review WHERE source = ${source.slug} AND status = 'waiting'`)[0].n,
      runs: await db`SELECT * FROM intake_runs WHERE source = ${source.slug} ORDER BY id DESC LIMIT ${runs}`,
    });
  }
  return out;
}
