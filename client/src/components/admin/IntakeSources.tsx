import { useIntakeSources, type IntakeRun, type IntakeSource } from '../../lib/intake';
import { formatDayCapital } from '../../lib/dates';
import { CardNote, Dot, LoadError, RowsSkeleton, cardClass, rowClass } from '../account/parts';
import Panel from './Panel';
import { cn } from '@/lib/utils';

/** A run's state in a word a person reads. */
const STATE: Record<string, string> = {
  staging: 'Reading',
  staged: 'Read, not yet applied',
  resolved: 'Matched, not yet applied',
  applying: 'Applying',
  applied: 'Applied',
  undone: 'Undone',
  failed: 'Failed',
};

const count = (value: number, one: string, many: string) => `${value.toLocaleString('en-US')} ${value === 1 ? one : many}`;

/** What a run did, in the order the question is asked: matched, changed, added, queued. */
function RunFigures({ run }: { run: IntakeRun }) {
  const figures = [
    run.matched !== null ? `${run.matched.toLocaleString('en-US')} matched` : null,
    run.changed !== null ? `${run.changed.toLocaleString('en-US')} changed` : null,
    run.added !== null ? `${run.added.toLocaleString('en-US')} added` : null,
    run.queued !== null ? `${run.queued.toLocaleString('en-US')} queued` : null,
  ].filter((figure): figure is string => figure !== null);
  if (figures.length === 0) return null;
  return (
    <span className="tabular-nums" data-run-figures>
      {figures.map((figure, index) => (
        <span key={figure}>
          {index > 0 && <Dot />}
          {figure}
        </span>
      ))}
    </span>
  );
}

function SourceRow({ source }: { source: IntakeSource }) {
  return (
    <li className={cn(rowClass, 'py-4')} data-intake-source={source.slug}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 break-words text-sm text-text-1">
          {source.url ? (
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {source.name}
            </a>
          ) : (
            source.name
          )}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-text-3">{count(source.staged, 'record', 'records')}</p>
      </div>
      <p className="mt-0.5 break-words text-xs text-text-3">
        {source.publisher}
        {source.publisher && <Dot />}
        {source.fill === 'empty' ? 'Fills only what a factory lacks' : 'Replaces older and lower-ranked values'}
        <Dot />
        {source.unmatched === 'add' ? 'Adds factories it finds no match for' : 'Adds no factories'}
      </p>
      {source.runs.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label={`Latest runs of ${source.name}`}>
          {source.runs.map((run, index) => (
            <li
              key={run.id}
              // The latest run is the one that describes the data as it is: earlier ones step back.
              className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs', index === 0 ? 'text-text-1' : 'text-text-2')}
              data-intake-run={run.id}
            >
              <span className="w-24 shrink-0">{formatDayCapital(run.startedAt)}</span>
              <span className="min-w-0">
                {STATE[run.state] ?? run.state}
                {run.matched !== null && <Dot />}
                <RunFigures run={run} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The sources that come in through the intake runner, outside the site's
 * deploy, each with its latest runs: when, and how many records matched a
 * factory, how many factories changed, how many were added, how many matches went
 * to review. A source appears here once it has been run.
 */
export default function IntakeSources() {
  const sources = useIntakeSources();
  return (
    <Panel title="Sources" description="Large sources are loaded by the intake runner, outside the site. Each is listed with its latest runs.">
      {sources.isPending ? (
        <RowsSkeleton rows={1} />
      ) : sources.isError ? (
        <LoadError error={sources.error} onRetry={() => void sources.refetch()} retrying={sources.isFetching} />
      ) : sources.data.length === 0 ? (
        <CardNote>None yet.</CardNote>
      ) : (
        <ul className={cardClass} data-intake-sources>
          {sources.data.map((source) => (
            <SourceRow key={source.slug} source={source} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
