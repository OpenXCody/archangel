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
import { BudgetSpent, CeilingReached, FeedError, Refusal } from './fetch.mjs';
import { sourceOf } from './registry.mjs';
import { SYSTEMS } from './systems/index.mjs';
import { isUnitedStates } from './systems/shared.mjs';

/** Raise it when what is staged for a posting changes shape: every posting is staged again. */
const VERSION = 2;
/** A posting whose text costs a request is read again after this many days even when its listing has not changed. */
const REREAD_DAYS = 30;
/** How many of the words the catalogue lacks a run's report keeps: the commonest. */
const UNKNOWN_KEPT = 30;
const NIL = '00000000-0000-0000-0000-000000000000';

const short = (text) => createHash('sha256').update(String(text ?? '')).digest('hex').slice(0, 32);

/** A reading's places without repeats: [{ city, state }]. */
function placesOf(places) {
  const seen = new Set();
  const out = [];
  for (const place of places ?? []) {
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

/** Every location line a feed gives for a posting, as the one line the reader takes: semicolons between places. */
const locationLine = (posting) => (posting.locations?.length ? posting.locations : [posting.location]).filter(Boolean).join('; ');

/**
 * Before a posting's text is asked for (where the text costs a request):
 * could its title be one of our careers? The reader answers with the career
 * when the title alone says it, and reaches for the text when the title could
 * be a career but the text has to bear it out (another name for a career, two
 * careers the same words spell). Either is worth the request. A title it
 * refuses outright it never reads the text of, and neither do we.
 *
 * Returns { could, places }: `places` is what the listing's location line
 * says, or null when the listing gives no line to read.
 */
export function beforeText(reader, posting, base, vocab) {
  let reached = false;
  const line = locationLine(posting);
  const probe = {
    ...base,
    // With no location line the reader would look for a place in the text: that is not what is being asked here.
    location: line || 'not given',
    get text() {
      reached = true;
      return '';
    },
  };
  const reading = reader.readPosting(probe, vocab);
  return { could: Boolean(reading?.career) || reached, places: line ? placesOf(reading?.places) : null };
}

/** Where a listing that was cut short is taken up from, when the system allows it: { next, seen } or null. */
async function resumeOf(db, source, adapter) {
  if (!adapter.resumes) return null;
  // The latest run of the source that listed anything (one that was refused before its first page says nothing).
  const [last] = await db`
    SELECT counts FROM intake_runs WHERE source = ${source.slug} AND state <> 'undone' AND counts ? 'read' ORDER BY id DESC LIMIT 1`;
  const resume = last?.counts?.resume;
  return resume && resume.next ? { next: resume.next, seen: Array.isArray(resume.seen) ? resume.seen : [] } : null;
}

/**
 * Reads an employer's board and returns what would be staged. Writes nothing.
 *
 *   read        postings the board listed in this run
 *   abroad      of those, the ones the feed places outside the United States (not read further)
 *   notCareer   whose title is not one of our careers: never read further, never kept
 *   noPlace     one of our careers, but naming no US city and state
 *   kept        one of our careers at a place: staged, or as it was staged before
 *   deferred    could be ours, their text not read this run (a ceiling, a budget, a refusal): read on a later run
 *   spared      read at an earlier run and not kept, their listing as it was: not asked about again
 *   complete    the listing was read to its end. Only then is a posting that is missing counted as missing
 *
 * A listing that is cut short (a refusal, a site that stopped answering, the
 * platform's budget for the run) is still read as far as it went: what it
 * listed is staged, and nothing it did not list is taken to be gone. Where
 * the system allows it, the next run takes the listing up where it stopped.
 *
 * Where the text costs a request it is asked for only when the title could be
 * one of our careers and the listing is new or has changed.
 */
export async function collect(db, entry, { session, reader, vocab, today = new Date().toISOString().slice(0, 10), again = false, log = () => {} }) {
  const adapter = SYSTEMS[entry.system];
  const source = sourceOf(entry);
  const started = Date.now();
  const tools = { get: session.get, post: session.post, today };

  // What staging holds: to tell a listing that has not changed, and to keep its reading. And the postings
  // whose text was read before and which were not kept: they are not asked about again while their listing stands.
  const previous = new Map();
  const passedBefore = new Map();
  const passes = new Map();
  if (adapter.text) {
    for (const row of await db`SELECT source_id, hash, payload, facts FROM intake_records WHERE source = ${source.slug} AND gone_run_id IS NULL`) {
      previous.set(row.source_id, row);
    }
    for (const row of await db`SELECT source_id, listing, read_on::text AS read_on FROM posting_passes WHERE source = ${source.slug}`) {
      passedBefore.set(row.source_id, row);
    }
  }

  const counts = { read: 0, abroad: 0, notCareer: 0, noPlace: 0, noAddress: 0, vanished: 0, texts: 0, spared: 0, kept: 0 };
  const kept = new Map();
  const deferred = new Set();
  const unknown = new Map();
  let stopped = null;
  // Set once no more texts may be asked for in this run: enough for one run, a ceiling, a budget, or the site's own refusal.
  let spent = false;
  const stop = (error) => ({
    outcome: error instanceof Refusal ? 'refused' : error instanceof BudgetSpent || error instanceof CeilingReached ? 'cut' : 'unreachable',
    why: error.message,
  });
  /** The errors that end the asking and not the run: what was read is staged, the rest waits. A changed shape is not one. */
  const ends = (error) => !error.shape && (error instanceof Refusal || error instanceof FeedError || error instanceof BudgetSpent || error instanceof CeilingReached);
  const reread = (adapter.rereadDays ?? REREAD_DAYS) * 86_400_000;

  /** One listed posting: counted, and kept when it is one of our careers at a place. */
  const take = async (posting) => {
    counts.read += 1;
    if (posting.country && !isUnitedStates(posting.country)) {
      counts.abroad += 1;
      return;
    }
    // The country, where the feed gives one, goes to the reader as the feed writes it ("Amsterdam, NH" is North
    // Holland); a feed that gives none passes nothing.
    const base = {
      employer: entry.employer, title: posting.title, department: posting.department ?? undefined,
      ...(posting.country ? { country: posting.country } : {}),
    };
    let full = posting;
    // Set where the text cost a request: if the posting is then not kept, that is noted (posting_passes).
    let mark = null;
    if (adapter.text) {
      const before = beforeText(reader, posting, base, vocab);
      if (!before.could) {
        counts.notCareer += 1;
        return;
      }
      // A listing that says where the work is, and it is nowhere in the United States, is not asked about further.
      if (before.places && before.places.length === 0) {
        counts.noPlace += 1;
        return;
      }
      const listing = short(canonical({ title: posting.title, locations: posting.locations, path: posting.path ?? posting.url }));
      const staged = previous.get(posting.id);
      const fresh = staged && staged.payload?.listing === listing && !again &&
        Date.parse(today) - Date.parse(staged.facts?.readOn ?? '1970-01-01') < reread;
      if (fresh) {
        // As it was read: the record is the same, and no request is made.
        kept.set(posting.id, { same: true, hash: staged.hash });
        return;
      }
      // Read before, not kept, and its line in the listing is as it was: not asked about again.
      mark = short(`${VERSION}.${adapter.version ?? 1}:${listing}`);
      const passed = passedBefore.get(posting.id);
      if (passed && passed.listing === mark && !again && Date.parse(today) - Date.parse(passed.read_on) < reread) {
        counts.spared += 1;
        return;
      }
      // Enough texts for one run: the rest wait for the next, staged as they were.
      if (counts.texts >= (adapter.textsPerRun ?? Infinity)) spent = true;
      if (spent) {
        deferred.add(posting.id);
        return;
      }
      try {
        full = { ...posting, ...(await adapter.text(entry.board, posting, tools)), listing };
        counts.texts += 1;
      } catch (error) {
        // Listed a moment ago and gone now.
        if (error instanceof FeedError && (error.status === 404 || error.status === 410)) {
          counts.vanished += 1;
          return;
        }
        if (!ends(error)) throw error;
        spent = true;
        stopped ??= stop(error);
        deferred.add(posting.id);
        return;
      }
    }

    const reading = reader.readPosting({
      ...base, location: locationLine(full), department: full.department ?? undefined, text: full.text ?? '', postedAt: full.postedAt ?? undefined,
      ...(full.country ? { country: full.country } : {}),
    }, vocab);
    // Nothing of a reading that has no career is used.
    if (!reading?.career) {
      counts.notCareer += 1;
      if (mark) passes.set(posting.id, mark);
      return;
    }
    const places = placesOf(reading.places);
    if (places.length === 0) {
      counts.noPlace += 1;
      if (mark) passes.set(posting.id, mark);
      return;
    }
    if (!full.url) {
      counts.noAddress += 1;
      if (mark) passes.set(posting.id, mark);
      return;
    }
    // The words the catalogue lacks are counted for the run's report and kept nowhere else.
    for (const word of reading.unknown ?? []) {
      const phrase = typeof word?.phrase === 'string' ? word.phrase.trim().slice(0, 40) : '';
      if (phrase) unknown.set(phrase, (unknown.get(phrase) ?? 0) + 1);
    }
    // What the feed states as a field of its own stands where the text says nothing.
    const hints = full.hints ?? {};
    const requirements = { ...(reading.requirements ?? {}) };
    if (!requirements.employmentType && hints.employmentType) requirements.employmentType = hints.employmentType;
    if (!requirements.shift && hints.shift) requirements.shift = hints.shift;
    const read = {
      career: reading.career, level: reading.level ?? null, places, skills: reading.skills ?? [], makes: reading.makes ?? [],
      requirements, pay: reading.pay ?? hints.pay ?? null,
    };

    const payload = {
      id: posting.id, title: full.title, location: full.location ?? null, locations: full.locations ?? [], address: full.address ?? null,
      department: full.department ?? null, url: full.url, postedAt: full.postedAt ?? null,
      // What says the posting changed: a hash of its text (the text itself is let go here), and of its listing where the text costs a request.
      text: short(full.text), ...(full.listing ? { listing: full.listing } : {}),
    };
    const facts = {
      title: full.title, location: locationLine(full) || null,
      address: full.address ?? null, department: full.department ?? null, url: full.url, postedAt: full.postedAt ?? null,
      reading: read, readOn: today,
    };
    kept.set(posting.id, { payload, facts, hash: recordHash({ payload, reading: read }, `${VERSION}.${adapter.version ?? 1}`) });
  };

  // The listing, a page at a time, from where an earlier run was cut if it was. Each page's postings are read
  // before the next page is asked for, so a listing that is cut has read everything up to the cut.
  const from = await resumeOf(db, source, adapter);
  let next = from?.next ?? null;
  let complete = false;
  try {
    for await (const page of adapter.pages(entry.board, tools, from?.next ?? null)) {
      for (const posting of page.postings) await take(posting);
      next = page.next;
      if (page.next === null) complete = true;
      // The texts could not all be asked for: a listing that can be taken up again stops here, and the next run
      // lists this page again with the ones after it.
      else if (stopped && adapter.resumes) break;
    }
  } catch (error) {
    // A changed shape is the adapter's to fix, and anything else unexpected is ours: the run fails.
    if (!ends(error)) throw error;
    // Nothing was listed and no listing waits to be taken up: there is nothing to stage.
    if (counts.read === 0 && !from) throw error;
    stopped ??= stop(error);
  }
  counts.kept = kept.size;

  // Every posting of ours the listing has shown, over as many runs as the listing took.
  const present = new Set([...(from?.seen ?? []), ...kept.keys(), ...deferred]);
  const resume = complete || !adapter.resumes || !next ? null : { next, seen: [...present] };
  const words = [...unknown].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, UNKNOWN_KEPT);
  log(`fetch: ${entry.employer}: ${counts.read.toLocaleString('en-US')} postings listed${complete ? '' : ' (the listing was cut short)'}, ` +
    `${counts.kept.toLocaleString('en-US')} kept, ${session.requests} requests in ${seconds(started)} s`);
  return {
    source, kept, deferred, present, passes, today, complete, resume, resumed: Boolean(from), stopped, counts, unknown: words,
    requests: session.requests, seconds: seconds(started),
  };
}

/**
 * The order boards are read in. Those with no budget first, as the registry
 * lists them. Then the boards of a platform that has a budget for the run,
 * which is spent where it is most needed: a listing an earlier run left cut
 * first (it is taken up where it stopped), then a board never listed to its
 * end, then the board whose last complete listing is oldest. The registry's
 * order settles a tie, so the order is the same for the same history.
 */
export async function inTurn(db, entries) {
  const free = [];
  const held = [];
  for (const [at, entry] of entries.entries()) {
    if (!SYSTEMS[entry.system].budget) {
      free.push(entry);
      continue;
    }
    const { slug } = sourceOf(entry);
    const [last] = await db`
      SELECT counts FROM intake_runs WHERE source = ${slug} AND state <> 'undone' AND counts ? 'read' ORDER BY id DESC LIMIT 1`;
    const [whole] = await db`
      SELECT max(started_at) AS at FROM intake_runs WHERE source = ${slug} AND state <> 'undone' AND counts->>'complete' = 'true'`;
    held.push({ entry, at, cut: last?.counts?.resume?.next ? 1 : 0, whole: whole?.at ? new Date(whole.at).getTime() : 0 });
  }
  held.sort((a, b) => b.cut - a.cut || a.whole - b.whole || a.at - b.at);
  return [...free, ...held.map((board) => board.entry)];
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
 *
 * A posting is gone only against a listing that was read to its end. One that
 * was cut, refused or could not be reached is no evidence of anything it did
 * not list: nothing is marked gone, and (posting_apply reads `complete` from
 * the run) no job is closed and no job's last sighting is moved.
 */
export async function stage(db, runId, collected, { log = console.log } = {}) {
  const { source, kept, deferred, present, complete, counts } = collected;
  const started = Date.now();
  const previous = new Map();
  for (const row of await db`SELECT source_id, hash, gone_run_id IS NOT NULL AS gone FROM intake_records WHERE source = ${source.slug}`) {
    previous.set(row.source_id, { hash: row.hash, gone: row.gone });
  }
  const incoming = new Map();
  for (const [id, record] of kept) incoming.set(id, record.hash);
  // Listed and not read in this run (left for the next, or seen by the run this listing was taken up from): as it
  // was, whatever that was.
  for (const id of present) if (!incoming.has(id) && previous.has(id) && !previous.get(id).gone) incoming.set(id, previous.get(id).hash);
  const diff = diffRun(previous, incoming);
  // What a listing that stopped short did not show is not gone: it was not looked at.
  if (!complete) diff.gone = [];
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
    // The postings whose text was read and which were not kept: noted, as each note stood before (for undo).
    for (const batch of chunks([...collected.passes], 1000)) {
      const rows = batch.map(([id, listing]) => ({ source_id: id, listing }));
      await tx`
        INSERT INTO intake_changes (run_id, op, entity_id, fact, before)
        SELECT ${runId}, 'pass', ${NIL}::uuid, t.source_id, (SELECT to_jsonb(p) FROM posting_passes p WHERE p.source = ${source.slug} AND p.source_id = t.source_id)
        FROM jsonb_to_recordset(${tx.json(rows)}) AS t(source_id text, listing text)`;
      await tx`
        INSERT INTO posting_passes (source, source_id, listing, read_on, run_id)
        SELECT ${source.slug}, t.source_id, t.listing, ${collected.today}::date, ${runId}
        FROM jsonb_to_recordset(${tx.json(rows)}) AS t(source_id text, listing text)
        ON CONFLICT (source, source_id) DO UPDATE SET listing = EXCLUDED.listing, read_on = EXCLUDED.read_on, run_id = EXCLUDED.run_id`;
    }
  });

  // The listing or the texts were cut short: what was read is staged, and the run says so.
  if (collected.stopped) {
    const rest = [
      complete ? null : collected.resume ? 'the listing is taken up at the next run where it stopped' : 'the listing starts again at the next run',
      deferred.size ? `${deferred.size} postings are left to be read` : null,
      complete ? null : 'nothing is taken to be gone',
    ].filter(Boolean).join('; ');
    await db`
      INSERT INTO load_log (load, kind, action, look, detail, run_id)
      VALUES (${source.slug}, 'run', ${collected.stopped.outcome}, true, ${`${collected.stopped.why}${rest ? `; ${rest}` : ''}`}, ${runId})`;
    await db`UPDATE intake_runs SET note = ${collected.stopped.why} WHERE id = ${runId}`;
  }
  const staged = {
    ...counts, outcome: collected.stopped ? collected.stopped.outcome : 'read', requests: collected.requests, deferred: deferred.size,
    // `complete` is what posting_apply reads; `resume` is where the next run takes the listing up, with the ids seen so far.
    complete, resumed: collected.resumed, resume: collected.resume, unknown: collected.unknown,
    new: fresh.length, changed: changed.length, same: diff.same.length, back: diff.back.length, gone: diff.gone.length,
  };
  await note(db, runId, { state: 'staged', counts: staged, timings: { fetch: collected.seconds, write: seconds(started) } });
  log(`stage: run ${runId}: ${counts.read.toLocaleString('en-US')} postings listed${complete ? '' : ', not to the end'}, ${counts.kept.toLocaleString('en-US')} kept ` +
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
    out.push(`  listing: ${c.resumed ? 'taken up where the last run stopped; ' : ''}` +
      `${c.complete === false ? `not read to its end${c.resume ? ' (the next run takes it up there)' : ' (the next run starts it again)'}: nothing is taken to be gone` : 'read to its end'}`);
    out.push(`  read: ${n(c.read)} postings listed; ${n(c.notCareer)} not one of our careers, ${n(c.abroad)} outside the United States, ${n(c.noPlace)} naming no place` +
      `${c.vanished ? `, ${n(c.vanished)} gone before they were read` : ''}; kept ${n(c.kept)}${c.texts ? `; ${n(c.texts)} texts asked for` : ''}` +
      `${c.spared ? `; ${n(c.spared)} read before and not ours, not asked about again` : ''}`);
    out.push(`  staged: ${n(c.new)} new, ${n(c.changed)} changed, ${n(c.same)} the same, ${n(c.back)} back, ${n(c.gone)} gone since the last complete listing` +
      `${c.deferred ? `; ${n(c.deferred)} left to be read at a later run` : ''}`);
  }
  if (c.placed !== undefined) {
    out.push(`  placed: ${n(c.placed)} postings at a plant; ${n(c.waiting)} waiting on ${n(c.waitingPlaces)} places where we list no plant of the company` +
      `${c.noCareer ? `; ${n(c.noCareer)} whose career is not stored` : ''}`);
  }
  if (c.jobsAdded !== undefined) {
    out.push(`  jobs: ${n(c.jobsAdded)} added, ${n(c.jobsChanged)} changed, ${n(c.jobsReopened)} reopened, ${n(c.jobsClosed)} closed; ${n(c.jobsOpen)} open`);
  }
  if (c.undone) out.push(`  undone: ${n(c.undone.jobs)} jobs removed or put back, ${n(c.undone.ids)} ids taken back, ${n(c.undone.kept)} left because they changed since`);
  // Words the postings ask for that the catalogue has no skill or make for: how the catalogue learns. Only here.
  if (Array.isArray(c.unknown) && c.unknown.length > 0) {
    out.push(`  asked for and not in the catalogue (the ${c.unknown.length} commonest, with how many postings): ${c.unknown.map(([phrase, count]) => `${phrase} ${count}`).join(', ')}`);
  }
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
 * Returns { runId, outcome, counts, text }. `outcome` is 'read'; 'refused'
 * (the site said no: recorded, not an error), 'unreachable' (it did not
 * answer, or answered an error: the next run tries again) or 'cut' (a budget
 * or a ceiling ended the asking), each of which may still have staged what
 * was read before it; 'not listed' (the registry's company is not in our
 * data: nothing was asked); 'not reached' (the platform's budget for the run
 * was spent before this board: no run is recorded) or 'failed' (the feed's
 * shape changed: the adapter needs a person). With `rehearse` everything is
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
      // The platform's budget went before this board listed anything: there is no run to record.
      if (error instanceof BudgetSpent) {
        return { runId: null, outcome: 'not reached', counts: { outcome: 'not reached', requests: session.requests }, why: error.message, text: `${sourceOf(entry).slug}: not reached (${error.message})` };
      }
      if (error instanceof Refusal) fail = { outcome: 'refused', why: error.message };
      // The site did not answer, or answered an error: tomorrow is another day. A changed shape needs a person:
      // that is a failure.
      else if (error instanceof CeilingReached) fail = { outcome: 'cut', why: error.message };
      else if (error instanceof FeedError && !error.shape) fail = { outcome: 'unreachable', why: error.message };
      else if (error instanceof FeedError) fail = { outcome: 'failed', why: error.message };
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
