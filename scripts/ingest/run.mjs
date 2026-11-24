#!/usr/bin/env node
// The intake runner: brings a large source in outside the website's deploy.
//
//   node scripts/ingest/run.mjs list                       sources and their runs
//   node scripts/ingest/run.mjs fetch <source> [--to dir]  download the source's file to a folder outside the repository
//   node scripts/ingest/run.mjs rehearse <source> <file>   stage, resolve and apply in a transaction that is rolled back; prints the report
//   node scripts/ingest/run.mjs stage <source> <file>      read the file into staging: a new run
//   node scripts/ingest/run.mjs resolve <run> [--again]    decide which of our plants each staged record is
//   node scripts/ingest/run.mjs apply <run> [--all]        write the ids and facts the run decided
//   node scripts/ingest/run.mjs load <source> <file>       stage, resolve and apply, one after the other
//   node scripts/ingest/run.mjs report <run> [--all]       what a run did
//   node scripts/ingest/run.mjs undo <run>                 take back what a run changed
//   node scripts/ingest/run.mjs forget <source>            remove a source and all intake holds for it (not while a run is applied)
//
// Employers' job postings (data/employers/boards.json; a source is "postings-<slug>" and has no file: its board is read):
//   node scripts/ingest/run.mjs postings [--only a,b] [--rehearse] [--again]   every employer in the registry, one run each
//   node scripts/ingest/run.mjs postings --check           hold the registry to its shape; no request, no database
//   node scripts/ingest/run.mjs fetch postings-<slug>      read the board and say what it lists; no database
//   node scripts/ingest/run.mjs rehearse|stage|load postings-<slug>
//
// It reads DATABASE_URL. A database that is not on this machine is refused
// unless `--yes-this-database <host>` names its host. `--report <file>` also
// writes the report to a file; `--adapter <file.mjs>` reads a source that is
// not in scripts/ingest/sources/. For postings: `--registry <file.json>` reads
// another registry, `--budget <n>` gives a platform that has a budget for a
// run n requests in place of its own number (a gentler run; tests), and
// `--feeds http://127.0.0.1:<port>` sends every request to a local server
// standing in for the feeds (tests, and runs over saved boards; `--paced` keeps
// each system's pacing there, to time a run as it would be). Every command
// says what it is about to do before it does it. scripts/ingest/README.md
// describes the pipeline.
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDatabase, connectionString } from './lib/safety.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');

/** The command line as { command, args, options }: `--name value`, or `--name` alone for a switch. */
export function parseArgs(argv) {
  const SWITCHES = new Set(['all', 'again', 'help', 'rehearse', 'check', 'paced']);
  const args = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i];
    if (word.startsWith('--')) {
      const name = word.slice(2);
      if (SWITCHES.has(name)) options[name] = true;
      else {
        if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`--${name} needs a value.`);
        options[name] = argv[i + 1];
        i += 1;
      }
    } else args.push(word);
  }
  return { command: args[0] ?? 'help', args: args.slice(1), options };
}

/** Where a source's file is downloaded to: never inside the repository. */
export function fetchDir(slug, to) {
  const dir = path.resolve(to ?? path.join(tmpdir(), 'archangel-ingest', slug));
  const inside = path.relative(ROOT, dir);
  if (inside === '' || (!inside.startsWith('..') && !path.isAbsolute(inside))) {
    throw new Error(`Refusing to download into the repository (${dir}). Name a folder outside it with --to.`);
  }
  return dir;
}

/** What a run of postings needs besides a database: the registry, the fetcher, and the reading of a posting. */
async function postingTools(options) {
  const registry = await import('./postings/registry.mjs');
  const { createFetcher, rewriteTo, USER_AGENT } = await import('./postings/fetch.mjs');
  const employers = registry.loadRegistry(options.registry ? path.resolve(options.registry) : undefined);
  let rewrite = null;
  if (options.feeds) {
    if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(options.feeds)) throw new Error('--feeds names a server on this machine, such as http://127.0.0.1:5999.');
    rewrite = rewriteTo(options.feeds);
  }
  const reader = await import('./postings/read/index.mjs');
  // A platform's budget for the whole run, across every board on it (Workday's: see systems/workday.mjs).
  const { SYSTEMS } = await import('./postings/systems/index.mjs');
  const budgets = {};
  for (const system of Object.values(SYSTEMS)) {
    if (!system.budget) continue;
    if (options.budget !== undefined && !/^[1-9]\d{0,4}$/.test(options.budget)) throw new Error('--budget is a number of requests, such as 300.');
    budgets[system.budget.platform] = options.budget !== undefined ? Number(options.budget) : system.budget.requests;
  }
  return {
    registry, employers, reader, vocab: reader.loadVocabulary(ROOT), userAgent: USER_AGENT, standIn: Boolean(rewrite), systems: SYSTEMS,
    // A stand-in on this machine is not paced (there is nobody to be polite to) unless --paced asks, to time a run as it would be.
    fetcher: createFetcher(rewrite ? { rewrite, unpaced: !options.paced, budgets } : { budgets }),
    entry(slug) {
      const entry = registry.entryOf(employers, slug);
      if (!entry) throw new Error(`There is no employer "${slug.slice(registry.SOURCE_PREFIX.length)}" in the registry (data/employers/boards.json).`);
      return entry;
    },
  };
}

const isPostings = (slug) => typeof slug === 'string' && slug.startsWith('postings-');

async function loadAdapter(slug, options) {
  const file = options.adapter ? path.resolve(options.adapter) : path.join(HERE, 'sources', `${slug}.mjs`);
  let adapter;
  try {
    adapter = await import(pathToFileURL(file).href);
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && !options.adapter) throw new Error(`There is no source "${slug}" in scripts/ingest/sources/.`);
    throw error;
  }
  if (adapter.source?.slug !== slug) throw new Error(`${file} describes the source "${adapter.source?.slug}", not "${slug}".`);
  return adapter;
}

const runNumber = (text) => {
  if (!/^\d+$/.test(text ?? '')) throw new Error('Name the run by its number (see `list`).');
  return Number(text);
};

const USAGE = `Usage: node scripts/ingest/run.mjs <command>
  list | fetch <source> [--to dir] | rehearse <source> <file> | stage <source> <file> | resolve <run> [--again]
  apply <run> [--all] | load <source> <file> | report <run> [--all] | undo <run> | forget <source>
  postings [--only a,b] [--system workday] [--rehearse] [--again] [--check]     (a posting source, postings-<slug>, takes no file)
Options: --yes-this-database <host>  --report <file>  --adapter <file.mjs>  --registry <file.json>  --budget <requests>  --feeds <local server>`;

async function main() {
  const { command, args, options } = parseArgs(process.argv.slice(2));
  const say = (line) => console.log(line);
  if (command === 'help' || options.help) return say(USAGE);

  // The registry alone: no request, no database.
  if (command === 'postings' && options.check) {
    const { employers } = await postingTools(options);
    return say(`postings: the registry is usable: ${employers.employers.length} employers are read, ${employers.leftOut.length} are left out.`);
  }

  // The one command that touches no database.
  if (command === 'fetch' && isPostings(args[0])) {
    const tools = await postingTools(options);
    const entry = tools.entry(args[0]);
    const adapter = tools.systems[entry.system];
    const { listAll } = await import('./postings/systems/shared.mjs');
    const { beforeText } = await import('./postings/jobs.mjs');
    say(`ingest: fetch ${args[0]}: ${adapter.feed(entry.board)}`);
    say(`  ${adapter.name}. ${adapter.how} Asked as "${tools.userAgent}".`);
    const session = tools.fetcher.session(entry.slug, { pace: adapter.pace, ceiling: entry.ceiling });
    const listed = await listAll(adapter, entry.board, { get: session.get, post: session.post, today: new Date().toISOString().slice(0, 10) });
    const ours = listed.filter((posting) => beforeText(tools.reader, posting, { employer: entry.employer, title: posting.title }, tools.vocab).could);
    return say(`fetched: ${listed.length.toLocaleString('en-US')} postings listed, ${ours.length.toLocaleString('en-US')} with a title that could be one of our careers, in ${session.requests} requests. Nothing was kept.`);
  }
  if (command === 'fetch') {
    const [slug] = args;
    if (!slug) throw new Error('fetch <source>');
    const adapter = await loadAdapter(slug, options);
    if (!adapter.fetchFile) throw new Error(`${slug} has no fetch: its file is brought here by hand.`);
    const dir = fetchDir(slug, options.to);
    say(`ingest: fetch ${slug} into ${dir}`);
    say(`  ${adapter.source.howFetched}`);
    say(`  terms: ${adapter.source.terms}`);
    const file = await adapter.fetchFile({ dir, log: say });
    return say(`fetched: ${file}`);
  }

  const target = checkDatabase(process.env.DATABASE_URL, options['yes-this-database']);
  say(`ingest: ${[command, ...args].join(' ')} on ${target.host || 'this machine'}/${target.database}${target.local ? ' (this machine)' : ' (named with --yes-this-database)'}`);
  const { default: postgres } = await import('postgres');
  const pipeline = await import('./lib/pipeline.mjs');
  const { report } = await import('./lib/report.mjs');
  // One connection; unnamed statements, so a pooled address works too.
  const sql = postgres(connectionString(process.env.DATABASE_URL), { max: 1, prepare: false, connect_timeout: 20, onnotice: () => {} });
  const startedBy = process.env.GITHUB_ACTIONS ? `github-actions:${process.env.GITHUB_RUN_ID ?? ''}` : 'cli';
  const finish = async (text) => {
    say('');
    say(text);
    if (options.report) {
      await writeFile(options.report, `${text}\n`);
      say(`\nreport written to ${options.report}`);
    }
  };

  try {
    if (command === 'list') {
      const sources = await pipeline.list(sql);
      if (sources.length === 0) say('No source has been staged yet. The adapters are in scripts/ingest/sources/.');
      for (const source of sources) {
        say(`${source.slug}: ${source.name}. ${source.staged.toLocaleString('en-US')} records staged, ${source.waiting} waiting for review.`);
        say(`  ${source.how_fetched}`);
        say(`  terms: ${source.terms}`);
        say(`  records with no candidate are ${source.unmatched === 'add' ? 'added' : 'held'}; it ${source.fill === 'empty' ? 'fills only what is empty' : 'replaces lower-ranked values'}; rank ${source.rank}`);
        for (const run of source.runs) {
          const c = run.counts ?? {};
          say(`  run ${run.id}  ${run.state.padEnd(8)}  ${new Date(run.started_at).toISOString().slice(0, 16).replace('T', ' ')}  ${run.input ?? ''}` +
            (source.kind === 'job'
              ? `  ${c.outcome ?? '-'}: listed ${c.read ?? '-'}, kept ${c.kept ?? '-'}, jobs added ${c.jobsAdded ?? '-'}, changed ${c.jobsChanged ?? '-'}, closed ${c.jobsClosed ?? '-'}, waiting ${c.waiting ?? '-'}`
              : `  staged ${c.staged ?? '-'}, by id ${c.byId ?? '-'}, changed ${c.plantsChanged ?? '-'}, added ${c.added ?? '-'}, queued ${c.queued ?? '-'}`));
        }
      }
    } else if (command === 'postings' || ((command === 'rehearse' || command === 'stage' || command === 'load') && isPostings(args[0]))) {
      // Employers' postings: one run per employer. One failure does not stop the rest.
      const tools = await postingTools(options);
      const jobs = await import('./postings/jobs.mjs');
      const one = command !== 'postings';
      const only = one ? null : options.only ? new Set(String(options.only).split(',').map((slug) => slug.trim()).filter(Boolean)) : null;
      // --system names hiring systems, with commas between: only their boards are read (a run between the daily ones
      // that spends a platform's budget and asks nothing of the others).
      const systems = one || !options.system ? null : new Set(String(options.system).split(',').map((name) => name.trim()).filter(Boolean));
      if (systems) for (const name of systems) if (!Object.hasOwn(tools.systems, name)) throw new Error(`There is no hiring system "${name}" (there are: ${Object.keys(tools.systems).sort().join(', ')}).`);
      const named = one ? [tools.entry(args[0])] : tools.employers.employers.filter((entry) => (!only || only.has(entry.slug)) && (!systems || systems.has(entry.system)));
      if (only) for (const slug of only) if (!tools.employers.employers.some((entry) => entry.slug === slug)) throw new Error(`There is no employer "${slug}" in the registry.`);
      if (named.length === 0) throw new Error('No employer in the registry is on a board that was asked for.');
      // The boards of a platform with a budget come last, the one whose complete listing is oldest first.
      const entries = await jobs.inTurn(sql, named);
      const rehearse = command === 'rehearse' || Boolean(options.rehearse);
      const upTo = command === 'stage' ? 'stage' : 'apply';
      say(rehearse
        ? `  will read ${entries.length === 1 ? `${entries[0].employer}'s board` : `${entries.length} employers' boards`}, stage, resolve and apply inside a transaction each, print what it did, and roll all of it back`
        : upTo === 'stage'
          ? `  will read ${entries[0].employer}'s board into staging as a new run; no job is touched`
          : `  will read ${entries.length === 1 ? `${entries[0].employer}'s board` : `${entries.length} employers' boards`} and bring the jobs in line: jobs change. \`undo <run>\` takes a run back`);
      say(`  asked as "${tools.userAgent}"${tools.standIn ? `, of the stand-in at ${options.feeds}` : ''}; robots files are read first and obeyed; a refusal ends that employer for this run`);
      for (const [platform, budget] of Object.entries(tools.fetcher.budgets)) say(`  ${platform}: at most ${budget} requests in this run, across all of its boards`);
      // Every employer that is to be read is a source from now on, whether or not this run reaches its board: one the
      // platform's budget does not reach has no run yet, and Admin Tools lists it as waiting for its first.
      if (!rehearse) for (const entry of entries) await pipeline.registerSource(sql, tools.registry.sourceOf(entry));
      const started = Date.now();
      const lines = [];
      const texts = [];
      const whole = [];
      const part = [];
      const unreached = [];
      let failed = 0;
      for (const entry of entries) {
        const began = Date.now();
        const budget = tools.systems[entry.system].budget;
        let result;
        if (budget && tools.fetcher.budgetLeft(budget.platform) <= 0) {
          // Nothing is asked and no run is recorded: it stands first in line at the next run.
          result = { runId: null, outcome: 'not reached', counts: { requests: 0 }, why: `the run's budget of ${tools.fetcher.budgets[budget.platform]} requests to ${budget.platform} is spent`, text: null };
        } else {
          try {
            result = await jobs.runEmployer(sql, entry, { ...tools, again: Boolean(options.again), rehearse, upTo, startedBy, log: one ? say : () => {}, everything: Boolean(options.all) });
          } catch (error) {
            // The database, or a bug: said, counted, and the next employer is still read.
            failed += 1;
            lines.push(`  ${entry.slug.padEnd(18)} FAILED  ${error.message}`);
            say(lines[lines.length - 1]);
            continue;
          }
        }
        const c = result.counts;
        if (result.outcome === 'failed') failed += 1;
        const took = Math.round((Date.now() - began) / 100) / 10;
        let line;
        if (result.outcome === 'not reached') {
          unreached.push(entry.slug);
          line = `  ${entry.slug.padEnd(18)} NOT REACHED: ${result.why}`;
        } else if (c.read === undefined) {
          line = `  ${entry.slug.padEnd(18)} run ${String(result.runId).padEnd(5)} ${result.outcome.toUpperCase()}: ${result.why}  (${c.requests ?? 0} requests, ${took} s)`;
          if (result.outcome !== 'not listed') part.push(`${entry.slug} (${result.outcome}, nothing listed: ${result.why})`);
        } else {
          if (c.complete) whole.push(entry.slug);
          else part.push(`${entry.slug} (${result.outcome} after ${c.read} postings: ${result.why}; ${c.resume ? 'taken up there next run' : 'starts again next run'})`);
          line = `  ${entry.slug.padEnd(18)} run ${String(result.runId).padEnd(5)} ${c.complete ? 'whole' : 'part '}  listed ${String(c.read).padStart(5)}  kept ${String(c.kept).padStart(4)}  ` +
            `new ${String(c.new).padStart(4)}  changed ${String(c.changed).padStart(3)}  gone ${String(c.gone).padStart(3)}  ` +
            `jobs +${c.jobsAdded ?? 0} ~${c.jobsChanged ?? 0} -${c.jobsClosed ?? 0}  waiting ${String(c.waiting ?? 0).padStart(4)}  ${String(c.requests).padStart(4)} requests  ${took} s` +
            (result.outcome === 'read' ? '' : `  ${result.outcome.toUpperCase()}: ${result.why}`) + (c.deferred ? `  (${c.deferred} left to be read)` : '');
        }
        lines.push(line);
        if (!one) say(line);
        if (result.text) texts.push(result.text);
      }
      const { requests, refusals, platforms } = tools.fetcher.totals;
      const summary = [
        `postings: ${entries.length} ${entries.length === 1 ? 'employer' : 'employers'}, ${requests.toLocaleString('en-US')} requests, ` +
          `${refusals} ${refusals === 1 ? 'refusal' : 'refusals'}, ${failed} failed, in ${Math.round((Date.now() - started) / 1000)} s${rehearse ? ' (a rehearsal: nothing was kept)' : ''}`,
        `  requests by platform: ${Object.entries(platforms).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([platform, count]) => `${platform} ${count}${platform in tools.fetcher.budgets ? ` of ${tools.fetcher.budgets[platform]}` : ''}`).join(', ') || 'none'}`,
        `  listed in full (${whole.length}): ${whole.join(', ') || 'none'}`,
        `  cut short (${part.length}): ${part.join('; ') || 'none'}`,
        ...(unreached.length > 0 ? [`  not reached, first in line next run (${unreached.length}): ${unreached.join(', ')}`] : []),
      ].join('\n');
      await finish(one ? `${texts.join('\n\n')}\n\n${summary}` : [summary, ...lines, '', texts.join('\n\n')].join('\n'));
      if (failed > 0) process.exitCode = 1;
    } else if (command === 'rehearse' || command === 'stage' || command === 'load') {
      const [slug, file] = args;
      if (!slug || !file) throw new Error(`${command} <source> <file>`);
      const adapter = await loadAdapter(slug, options);
      if (command === 'rehearse') {
        say(`  will read ${file}, stage, resolve and apply it inside one transaction, print what it did, and roll all of it back`);
        const ROLLBACK = new Error('rehearsal');
        let text = '';
        try {
          await sql.begin(async (tx) => {
            const runId = await pipeline.stage(tx, adapter, file, { log: say, startedBy });
            await pipeline.resolve(tx, runId, { log: say });
            await pipeline.apply(tx, runId, { log: say });
            text = await report(tx, runId, { rehearsal: true, everything: Boolean(options.all) });
            throw ROLLBACK;
          });
        } catch (error) {
          if (error !== ROLLBACK) throw error;
        }
        await finish(text);
      } else {
        say(command === 'stage'
          ? `  will read ${file} into staging as a new run; the plants are not touched`
          : `  will read ${file} into staging, resolve it and apply it: plants change. \`undo <run>\` takes it back`);
        const runId = await pipeline.stage(sql, adapter, file, { log: say, startedBy });
        if (command === 'load') {
          await pipeline.resolve(sql, runId, { log: say });
          await pipeline.apply(sql, runId, { log: say });
        }
        await finish(await report(sql, runId, { everything: Boolean(options.all) }));
      }
    } else if (command === 'resolve') {
      const runId = runNumber(args[0]);
      if ((await pipeline.runRow(sql, runId)).kind === 'job') {
        say('  will decide which plant each staged posting is at: writes the places that wait; no job is touched');
        await (await import('./postings/jobs.mjs')).resolve(sql, runId, { log: say });
      } else {
        say('  will decide which plant each staged record is: writes the decisions and the review queue; the plants are not touched');
        await pipeline.resolve(sql, runId, { log: say, again: Boolean(options.again) });
      }
      await finish(await report(sql, runId));
    } else if (command === 'apply') {
      const runId = runNumber(args[0]);
      if ((await pipeline.runRow(sql, runId)).kind === 'job') {
        say('  will bring the jobs in line with the staged postings, in one transaction');
        await (await import('./postings/jobs.mjs')).apply(sql, runId, { log: say });
      } else {
        say('  will write the ids and facts the run decided onto the plants, a batch to a transaction');
        await pipeline.apply(sql, runId, { log: say, all: Boolean(options.all) });
      }
      await finish(await report(sql, runId));
    } else if (command === 'undo') {
      const runId = runNumber(args[0]);
      say('  will restore what the run changed, wherever it has not been changed since');
      await pipeline.undo(sql, runId, { log: say });
      await finish(await report(sql, runId));
    } else if (command === 'report') {
      await finish(await report(sql, runNumber(args[0]), { everything: Boolean(options.all) }));
    } else if (command === 'forget') {
      if (!args[0]) throw new Error('forget <source>');
      say('  will remove the source with its runs, staged records, queue and lines');
      await pipeline.forget(sql, args[0], { log: say });
    } else {
      say(USAGE);
      process.exitCode = 2;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Run only when started as a script, not when a test imports its helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`ingest: ${error.message}`);
    process.exitCode = 1;
  });
}
