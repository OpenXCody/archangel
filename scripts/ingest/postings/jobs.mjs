// The intake pipeline for a source of jobs: an employer's board is read,
// each posting that is one of our careers is staged as what was read from
// it, the staged postings are resolved to a plant and a career, and the jobs
// are brought in line. The same steps as a source of plants, one employer to
// a run.
//
// What decides the plant and writes a job is not here: it is posting_decide,
// posting_resolve and posting_apply in migrations/0054_job_postings.sql,
// which Admin Tools calls too. What reads a posting is not here either:
// read/index.mjs. This file fetches, counts, stages and orchestrates.
// The text of a posting lives in this process's memory while it is read and
// nowhere else: not in staging, not in a file, not in a log.
import { createHash } from 'node:crypto';
import { canonical, recordHash } from '../lib/hash.mjs';
import { diffRun } from '../lib/diff.mjs';
import { chunks, inTransaction, note, registerSource, runRow, seconds } from '../lib/pipeline.mjs';
import { CeilingReached, FeedError, Refusal } from './fetch.mjs';
import { sourceOf } from './registry.mjs';
import { SYSTEMS } from './systems/index.mjs';

/** Raise it when what is staged for a posting changes shape: every posting is staged again. */
const VERSION = 1;
/** A posting whose text costs a request is read again after this many days even when its listing has not changed. */
const REREAD_DAYS = 30;
const NIL = '00000000-0000-0000-0000-000000000000';

const short = (text) => createHash('sha256').update(String(text ?? '')).digest('hex').slice(0, 32);

/** A reading's places without repeats: [{ city, state }]. */
function placesOf(lists) {
  const seen = new Set();
  const out = [];
  for (const place of lists.flat()) {
    const city = typeof place?.city === 'string' ? place.city.trim() : '';
    const state = typeof place?.state === 'string' ? place.state.trim().toUpperCase() : '';
    if (!city || !/^[A-Z]{2}$/.test(state)) continue;
    const key = `${city.toLowerCase()}|${state}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ city, state });
    }
  }
  return out;
}

/**
 * Reads an employer's board and returns what would be staged. Writes nothing.
 *
 *   read        postings the board lists
 *   abroad      of those, the ones the feed places outside the United States (not read further)
 *   notCareer   whose title is not one of our careers: never read further, never kept
 *   noPlace     one of our careers, but naming no US city and state
 *   kept        staged: one of our careers at a place
 *   deferred    kept by title, their text not read this run (the request ceiling): staged on a later run
 *
 * The reader decides by the title first, with no text, so that a system whose
 * text costs a request per posting is asked only for postings that will be
 * kept; and for those, only when the listing is new or has changed.
 */
export async function collect(db, entry, { session, reader, vocab, today = new Date().toISOString().slice(0, 10), again = false, log = () => {} }) {
  const adapter = SYSTEMS[entry.system];
  const source = sourceOf(entry);
  const started = Date.now();
  const tools = { get: session.get, post: session.post, today };

  // What staging holds: to tell a listing that has not changed, and to keep its reading.
  const previous = new Map();
  if (adapter.text) {
    for (const row of await db`SELECT source_id, hash, payload, facts FROM intake_records WHERE source = ${source.slug} AND gone_run_id IS NULL`) {
      previous.set(row.source_id, row);
    }
  }

  const listed = await adapter.list(entry.board, tools);
  const counts = { read: listed.length, abroad: 0, notCareer: 0, noPlace: 0, noAddress: 0, vanished: 0, texts: 0, kept: 0 };
  const kept = new Map();
  const deferred = new Set();
  // Set once no more may be asked of the site in this run: the ceiling, or the site's own refusal.
  let spent = false;
  let stopped = null;

  for (const posting of listed) {
    if (posting.country && posting.country !== 'US') {
      counts.abroad += 1;
      continue;
    }
    const base = { employer: entry.employer, title: posting.title, location: posting.location ?? '', department: posting.department ?? undefined };
    // By the title alone.
    if (!reader.readPosting({ ...base, text: '' }, vocab).career) {
      counts.notCareer += 1;
      continue;
    }
    let full = posting;
    if (adapter.text) {
      const listing = short(canonical({ title: posting.title, locations: posting.locations, path: posting.path ?? posting.url }));
      const before = previous.get(posting.id);
      const fresh = before && before.payload?.listing === listing && !again &&
        Date.parse(today) - Date.parse(before.facts?.readOn ?? '1970-01-01') < REREAD_DAYS * 86_400_000;
      if (fresh) {
        // As it was read: the record is the same, and no request is made.
        kept.set(posting.id, { same: true, hash: before.hash });
        continue;
      }
      if (spent) {
        deferred.add(posting.id);
        continue;
      }
      try {
        full = { ...posting, ...(await adapter.text(entry.board, posting, tools)), listing };
        counts.texts += 1;
      } catch (error) {
        // Listed a moment ago and gone now.
        if (error instanceof FeedError && (error.status === 404 || error.status === 410)) {
          counts.vanished += 1;
          continue;
        }
        // A changed shape is the adapter's to fix: the run fails. Anything else ends the asking, not the run:
        // what was read is staged, and the rest waits for the next run.
        if (error.shape || !(error instanceof CeilingReached || error instanceof Refusal || error instanceof FeedError)) throw error;
        spent = true;
        if (!(error instanceof CeilingReached)) stopped = { outcome: error instanceof Refusal ? 'refused' : 'failed', why: error.message };
        deferred.add(posting.id);
        continue;
      }
    }

    const reading = reader.readPosting({ ...base, location: full.location ?? '', department: full.department ?? undefined, text: full.text ?? '', postedAt: full.postedAt ?? undefined }, vocab);
    if (!reading?.career) {
      counts.notCareer += 1;
      continue;
    }
    // Every place the posting is at: what the reader found, and the feed's other location lines read the same way.
    const others = (full.locations ?? []).filter((line) => line !== full.location).map((line) => reader.readPosting({ ...base, location: line, text: '' }, vocab).places ?? []);
    const places = placesOf([reading.places ?? [], ...others]);
    if (places.length === 0) {
      counts.noPlace += 1;
      continue;
    }
    if (!full.url) {
      counts.noAddress += 1;
      continue;
    }
    // What the feed states as a field of its own stands where the text says nothing.
    const hints = full.hints ?? {};
    const requirements = { ...(reading.requirements ?? {}) };
    if (!requirements.employmentType && hints.employmentType) requirements.employmentType = hints.employmentType;
    if (!requirements.shift && hints.shift) requirements.shift = hints.shift;
    const read = { ...reading, places, requirements, pay: reading.pay ?? hints.pay ?? null };

    const payload = {
      id: posting.id, title: full.title, location: full.location ?? null, locations: full.locations ?? [], address: full.address ?? null,
      department: full.department ?? null, url: full.url, postedAt: full.postedAt ?? null,
      // What says the posting changed: a hash of its text (the text itself is let go here), and of its listing where the text costs a request.
      text: short(full.text), ...(full.listing ? { listing: full.listing } : {}),
    };
    const facts = {
      title: full.title, location: (full.locations?.length ? full.locations : [full.location]).filter(Boolean).join('; ') || null,
      address: full.address ?? null, department: full.department ?? null, url: full.url, postedAt: full.postedAt ?? null,
      reading: read, readOn: today,
    };
    kept.set(posting.id, { payload, facts, hash: recordHash({ payload, reading: read }, `${VERSION}.${adapter.version ?? 1}`) });
  }
  counts.kept = kept.size;
  log(`fetch: ${entry.employer}: ${counts.read.toLocaleString('en-US')} postings listed, ${counts.kept.toLocaleString('en-US')} kept, ${session.requests} requests in ${seconds(started)} s`);
  return { source, kept, deferred, counts, stopped, requests: session.requests, seconds: seconds(started) };
}

/** A new run of a job source, before anything is known about it. */
export async function openRun(db, entry, { startedBy = 'cli' } = {}) {
  const source = sourceOf(entry);
  await registerSource(db, source);
  const [run] = await db`
    INSERT INTO intake_runs (source, state, input, started_by) VALUES (${source.slug}, 'staging', ${source.url}, ${startedBy}) RETURNING id`;
  return run.id;
}

/**
 * Whether a company the registry names is in our data, found as the employer
 * loader finds one: by exact name or other name, in any letter case. Nothing
 * is asked of a board whose postings could not be placed.
 */
export async function companyListed(db, entry) {
  const names = [entry.company, ...(entry.also ?? [])].map((name) => name.toLowerCase());
  const [{ listed }] = await db`
    SELECT EXISTS (
      SELECT 1 FROM companies c
      WHERE lower(c.name) = ANY(${names}) OR EXISTS (SELECT 1 FROM unnest(c.aliases) a WHERE lower(a) = ANY(${names}))) AS listed`;
  return listed;
}

/** A run that read nothing, or not all of it: why, in the run's row and in a line. */
export async function closeRun(db, runId, entry, { outcome, why, requests = 0, took = 0 }) {
  const source = sourceOf(entry);
  await db`
    UPDATE intake_runs SET state = 'failed', ended_at = now(), note = ${why},
      counts = counts || ${db.json({ outcome, requests })}, timings = timings || ${db.json({ fetch: took })}
    WHERE id = ${runId}`;
  await db`
    INSERT INTO load_log (load, kind, action, look, company, detail, run_id)
    VALUES (${source.slug}, 'run', ${outcome}, true, ${entry.company}, ${why}, ${runId})`;
}

/**
 * Brings staging up to what was collected. A posting that is the same is not
 * touched; one that changed, left or came back is journalled as it stood
 * (intake_changes, op 'posting'), so undo puts staging back exactly. A posting
 * left for a later run is neither changed nor counted as gone.
 */
export async function stage(db, runId, collected, { log = console.log } = {}) {
  const { source, kept, deferred, counts } = collected;
  const started = Date.now();
  const previous = new Map();
  for (const row of await db`SELECT source_id, hash, gone_run_id IS NOT NULL AS gone FROM intake_records WHERE source = ${source.slug}`) {
    previous.set(row.source_id, { hash: row.hash, gone: row.gone });
  }
  const incoming = new Map();
  for (const [id, record] of kept) incoming.set(id, record.hash);
  // Not read this run: as it was, whatever that was.
  for (const id of deferred) if (previous.has(id) && !previous.get(id).gone) incoming.set(id, previous.get(id).hash);
  const diff = diffRun(previous, incoming);
  // A record kept as it was read before cannot be new or changed; one that came back unread is read on the next run.
  const fresh = diff.fresh.filter((id) => kept.get(id)?.payload);
  const changed = diff.changed.filter((id) => kept.get(id)?.payload);

  await inTransaction(db, async (tx) => {
    const touched = [...changed, ...diff.back, ...diff.gone];
    for (const batch of chunks(touched, 2000)) {
      await tx`
        INSERT INTO intake_changes (run_id, op, entity_id, fact, before)
        SELECT ${runId}, 'posting', ${NIL}::uuid, r.source_id,
               jsonb_build_object('changed_run_id', r.changed_run_id, 'gone_run_id', r.gone_run_id, 'payload', r.payload, 'facts', r.facts, 'hash', r.hash)
        FROM intake_records r WHERE r.source = ${source.slug} AND r.source_id = ANY(${batch})`;
    }
    for (const batch of chunks([...fresh, ...changed], 500)) {
      const rows = batch.map((id) => ({ source_id: id, payload: kept.get(id).payload, facts: kept.get(id).facts, hash: kept.get(id).hash }));
      await tx`
        INSERT INTO intake_records (source, source_id, first_run_id, changed_run_id, payload, facts, hash)
        SELECT ${source.slug}, t.source_id, ${runId}, ${runId}, t.payload, t.facts, t.hash
        FROM jsonb_to_recordset(${tx.json(rows)}) AS t(source_id text, payload jsonb, facts jsonb, hash text)
        ON CONFLICT (source, source_id) DO UPDATE SET
          changed_run_id = EXCLUDED.changed_run_id, gone_run_id = NULL, payload = EXCLUDED.payload, facts = EXCLUDED.facts, hash = EXCLUDED.hash`;
      await tx`
        INSERT INTO intake_links (source, source_id) SELECT ${source.slug}, t.source_id
        FROM jsonb_to_recordset(${tx.json(rows)}) AS t(source_id text) ON CONFLICT (source, source_id) DO NOTHING`;
    }
    for (const batch of chunks(diff.back, 2000)) {
      await tx`UPDATE intake_records SET gone_run_id = NULL WHERE source = ${source.slug} AND source_id = ANY(${batch})`;
    }
    for (const batch of chunks(diff.gone, 2000)) {
      await tx`UPDATE intake_records SET gone_run_id = ${runId} WHERE source = ${source.slug} AND source_id = ANY(${batch})`;
    }
  });

  // The site stopped answering part way through the texts: what was read is staged, and the run says so.
  if (collected.stopped) {
    await db`
      INSERT INTO load_log (load, kind, action, look, detail, run_id)
      VALUES (${source.slug}, 'run', ${collected.stopped.outcome}, true,
              ${`${collected.stopped.why}; ${deferred.size} postings are left for the next run`}, ${runId})`;
    await db`UPDATE intake_runs SET note = ${collected.stopped.why} WHERE id = ${runId}`;
  }
  const staged = {
    ...counts, outcome: collected.stopped ? collected.stopped.outcome : 'read', requests: collected.requests, deferred: deferred.size,
    new: fresh.length, changed: changed.length, same: diff.same.length, back: diff.back.length, gone: diff.gone.length,
  };
  await note(db, runId, { state: 'staged', counts: staged, timings: { fetch: collected.seconds, write: seconds(started) } });
  log(`stage: run ${runId}: ${counts.read.toLocaleString('en-US')} postings listed, ${counts.kept.toLocaleString('en-US')} kept ` +
    `(${fresh.length} new, ${changed.length} changed, ${diff.same.length} the same, ${diff.back.length} back, ${diff.gone.length} gone${deferred.size ? `, ${deferred.size} left for the next run` : ''})`);
  return staged;
}

/** Decides where each staged posting is (the places that wait are kept in posting_places). Nothing the site reads is written. */
export async function resolve(db, runId, { log = console.log } = {}) {
  const run = await runRow(db, runId);
  if (!['staged', 'resolved'].includes(run.state)) throw new Error(`Run ${runId} is ${run.state}: only a staged run is resolved.`);
  const started = Date.now();
  const [{ counts }] = await inTransaction(db, (tx) => tx`SELECT posting_resolve(${run.source}, ${runId}) AS counts`);
  const resolved = { placed: counts.placed ?? 0, waiting: counts.waiting ?? 0, waitingPlaces: counts.waitingPlaces ?? 0, noCareer: counts.noCareer ?? 0 };
  await note(db, runId, { state: 'resolved', counts: resolved, timings: { resolve: seconds(started) } });
  log(`resolve: run ${runId}: ${resolved.placed} postings at a plant, ${resolved.waiting} waiting on ${resolved.waitingPlaces} places with no plant` +
    `${resolved.noCareer ? `, ${resolved.noCareer} whose career is not stored` : ''} in ${seconds(started)} s`);
  return resolved;
}

/** Brings the jobs in line with the staged postings (posting_apply), in one transaction. */
export async function apply(db, runId, { log = console.log } = {}) {
  const run = await runRow(db, runId);
  if (!['resolved', 'applying', 'applied'].includes(run.state)) throw new Error(`Run ${runId} is ${run.state}: only a resolved run is applied.`);
  const started = Date.now();
  const [{ counts }] = await inTransaction(db, (tx) => tx`SELECT posting_apply(${run.source}, ${runId}) AS counts`);
  const applied = { jobsAdded: counts.added, jobsChanged: counts.changed, jobsReopened: counts.reopened, jobsClosed: counts.closed, jobsSeen: counts.seen, jobsOpen: counts.open };
  await note(db, runId, { state: 'applied', counts: applied, timings: { apply: seconds(started) }, ended: true });
  log(`apply: run ${runId}: ${counts.added} jobs added, ${counts.changed} changed, ${counts.reopened} reopened, ${counts.closed} closed; ${counts.open} open in ${seconds(started)} s`);
  return applied;
}

/** What a run of a job source did, as text a person reads. */
export async function report(db, runId, { everything = false, rehearsal = false } = {}) {
  const [run] = await db`
    SELECT r.*, s.name AS source_name, s.system, s.company FROM intake_runs r JOIN intake_sources s ON s.slug = r.source WHERE r.id = ${runId}`;
  if (!run) throw new Error(`There is no run ${runId}.`);
  const c = run.counts ?? {};
  const t = run.timings ?? {};
  const n = (value) => Number(value ?? 0).toLocaleString('en-US');
  const out = [];
  out.push(`${run.source} (${run.source_name}), run ${run.id}${rehearsal ? ', a rehearsal: nothing was kept' : `, ${run.state}`}`);
  out.push(`  board: ${run.input} (${SYSTEMS[run.system]?.name ?? run.system}); ${n(c.requests)} requests in ${t.fetch ?? 0} s`);
  if (run.note) out.push(`  ${c.outcome ?? 'stopped'}: ${run.note}`);
  if (c.read !== undefined) {
    out.push(`  read: ${n(c.read)} postings listed; ${n(c.notCareer)} not one of our careers, ${n(c.abroad)} outside the United States, ${n(c.noPlace)} naming no place` +
      `${c.vanished ? `, ${n(c.vanished)} gone before they were read` : ''}; kept ${n(c.kept)}`);
    out.push(`  staged: ${n(c.new)} new, ${n(c.changed)} changed, ${n(c.same)} the same, ${n(c.back)} back, ${n(c.gone)} gone since the last run` +
      `${c.deferred ? `; ${n(c.deferred)} left for the next run (the request ceiling)` : ''}`);
  }
  if (c.placed !== undefined) {
    out.push(`  placed: ${n(c.placed)} postings at a plant; ${n(c.waiting)} waiting on ${n(c.waitingPlaces)} places where we list no plant of the company` +
      `${c.noCareer ? `; ${n(c.noCareer)} whose career is not stored` : ''}`);
  }
  if (c.jobsAdded !== undefined) {
    out.push(`  jobs: ${n(c.jobsAdded)} added, ${n(c.jobsChanged)} changed, ${n(c.jobsReopened)} reopened, ${n(c.jobsClosed)} closed; ${n(c.jobsOpen)} open`);
  }
  if (c.undone) out.push(`  undone: ${n(c.undone.jobs)} jobs removed or put back, ${n(c.undone.ids)} ids taken back, ${n(c.undone.kept)} left because they changed since`);
  const stages = ['write', 'resolve', 'apply', 'undo'].filter((stage) => t[stage] !== undefined);
  if (stages.length > 0) out.push(`  seconds: ${stages.map((stage) => `${stage} ${t[stage]}`).join(', ')}`);

  const places = await db`
    SELECT pp.city, pp.state, count(DISTINCT r.source_id)::int AS postings
    FROM posting_places pp
    JOIN intake_records r ON r.source = pp.source AND r.gone_run_id IS NULL
    CROSS JOIN LATERAL jsonb_array_elements(r.facts->'reading'->'places') p
    WHERE pp.source = ${run.source} AND pp.status = 'waiting' AND posting_place_key(p->>'city', p->>'state') = pp.place_key
    GROUP BY pp.city, pp.state ORDER BY 3 DESC, 1 LIMIT 20`;
  if (places.length > 0) out.push(`  waiting most: ${places.map((place) => `${place.city}, ${place.state} ${n(place.postings)}`).join('; ')}`);

  const actions = await db`
    SELECT action, count(*)::int AS lines FROM load_log WHERE run_id = ${runId} AND (look OR ${everything}) GROUP BY action ORDER BY min(id)`;
  for (const { action, lines } of actions) {
    const rows = await db`
      SELECT kind, company, plant, detail FROM load_log
      WHERE run_id = ${runId} AND action = ${action} AND (look OR ${everything}) ORDER BY id LIMIT ${everything ? 100000 : 40}`;
    out.push('');
    out.push(`${action}: ${n(lines)} ${lines === 1 ? 'line' : 'lines'}${rows.length < lines ? `, the first ${rows.length} here (--all lists every line)` : ''}`);
    for (const row of rows) out.push(`  ${[row.kind, [row.company, row.plant].filter(Boolean).join(' / '), row.detail].filter(Boolean).join(' | ')}`);
  }
  return out.join('\n');
}

/**
 * One employer, start to finish: read the board, stage, resolve, apply.
 * Returns { runId, outcome, counts, text }. `outcome` is 'read', 'refused'
 * (the site said no: recorded, not an error), 'not listed' (the registry's
 * company is not in our data: nothing was asked) or 'failed' (the feed's
 * shape changed, or the site did not answer). With `rehearse` everything is
 * done in a transaction that is rolled back; `upTo` stops after 'stage' or
 * 'resolve'.
 */
export async function runEmployer(db, entry, { fetcher, reader, vocab, today, again = false, rehearse = false, upTo = 'apply', startedBy = 'cli', log = console.log, everything = false } = {}) {
  const begun = Date.now();
  const session = fetcher.session(entry.slug, { pace: SYSTEMS[entry.system].pace, ceiling: entry.ceiling });

  // Before the database is written: is the company ours, and what does the board say.
  let collected = null;
  let fail = null;
  if (!(await companyListed(db, entry))) {
    fail = { outcome: 'not listed', why: `the registry names ${entry.company}, which is not a company in our data: the board was not read` };
  } else {
    try {
      collected = await collect(db, entry, { session, reader, vocab, today, again, log });
    } catch (error) {
      if (error instanceof Refusal) fail = { outcome: 'refused', why: error.message };
      else if (error instanceof FeedError || error instanceof CeilingReached) fail = { outcome: 'failed', why: error.message };
      else throw error;
    }
  }
  if (fail) fail = { ...fail, requests: session.requests, took: seconds(begun) };

  const steps = async (tx) => {
    const runId = await openRun(tx, entry, { startedBy });
    if (fail) {
      await closeRun(tx, runId, entry, fail);
      return { runId, outcome: fail.outcome, counts: { outcome: fail.outcome, requests: fail.requests }, why: fail.why, text: await report(tx, runId, { rehearsal: rehearse, everything }) };
    }
    const counts = await stage(tx, runId, collected, { log });
    if (upTo !== 'stage') Object.assign(counts, await resolve(tx, runId, { log }));
    if (upTo === 'apply') Object.assign(counts, await apply(tx, runId, { log }));
    return { runId, outcome: counts.outcome, counts, why: collected.stopped?.why ?? null, text: await report(tx, runId, { rehearsal: rehearse, everything }) };
  };

  if (!rehearse) return steps(db);
  const ROLLBACK = new Error('rehearsal');
  let result = null;
  try {
    await db.begin(async (tx) => {
      result = await steps(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return result;
}
