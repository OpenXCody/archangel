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
// It reads DATABASE_URL. A database that is not on this machine is refused
// unless `--yes-this-database <host>` names its host. `--report <file>` also
// writes the report to a file; `--adapter <file.mjs>` reads a source that is
// not in scripts/ingest/sources/. Every command says what it is about to do
// before it does it. scripts/ingest/README.md describes the pipeline.
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDatabase } from './lib/safety.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');

/** The command line as { command, args, options }: `--name value`, or `--name` alone for a switch. */
export function parseArgs(argv) {
  const SWITCHES = new Set(['all', 'again', 'help']);
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
Options: --yes-this-database <host>  --report <file>  --adapter <file.mjs>`;

async function main() {
  const { command, args, options } = parseArgs(process.argv.slice(2));
  const say = (line) => console.log(line);
  if (command === 'help' || options.help) return say(USAGE);

  // The one command that touches no database.
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
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 20, onnotice: () => {} });
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
            `  staged ${c.staged ?? '-'}, by id ${c.byId ?? '-'}, changed ${c.plantsChanged ?? '-'}, added ${c.added ?? '-'}, queued ${c.queued ?? '-'}`);
        }
      }
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
      say('  will decide which plant each staged record is: writes the decisions and the review queue; the plants are not touched');
      await pipeline.resolve(sql, runId, { log: say, again: Boolean(options.again) });
      await finish(await report(sql, runId));
    } else if (command === 'apply') {
      const runId = runNumber(args[0]);
      say('  will write the ids and facts the run decided onto the plants, a batch to a transaction');
      await pipeline.apply(sql, runId, { log: say, all: Boolean(options.all) });
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
