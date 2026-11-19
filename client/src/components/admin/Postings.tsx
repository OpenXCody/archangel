import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatFactoryName } from '@shared/displayName';
import { useDecidePlace, usePostingSources, useWaitingPlaces, type PostingSource, type WaitingPlace } from '../../lib/postings';
import { formatDayCapital } from '../../lib/dates';
import { Dot, ErrorNote, LoadError, RowsSkeleton, busyButtonClass, cardClass, fieldClass, outlineButtonClass, rowClass, textButtonClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import { useAdminNotice } from './AdminNotice';

const n = (value: number) => value.toLocaleString('en-US');

// ---------------------------------------------------------------------------
// Postings with no plant
// ---------------------------------------------------------------------------

/**
 * One place an employer's postings name where we list no plant of that
 * employer. Pointing it at a plant makes a job of every posting that names
 * it, at once; leaving it says it is not a plant we list (an office, a
 * customer's site), and it is not asked about again. Both can be taken back.
 */
function PlaceRow({ place, nextFocus }: { place: WaitingPlace; nextFocus?: string }) {
  const decide = useDecidePlace();
  const notice = useAdminNotice();
  const [plantId, setPlantId] = useState('');
  const where = `${place.city}, ${place.state}`;
  const key = { source: place.source, placeKey: place.placeKey };
  const selectId = `place-${place.source}-${place.placeKey}`.replace(/[^a-z0-9-]+/gi, '-');

  const takeBack = () => decide.mutate({ ...key, decision: 'wait' }, { onSuccess: () => notice.say(`${where} waits again.`) });
  const point = () => {
    if (decide.isPending || !plantId) return;
    decide.mutate(
      { ...key, decision: 'point', plantId },
      {
        onSuccess: (outcome) =>
          notice.say(`Pointed ${where} at ${formatFactoryName(outcome.plant?.name ?? '')}: ${n(outcome.jobs)} ${outcome.jobs === 1 ? 'job' : 'jobs'} listed.`, { undo: takeBack, focus: nextFocus }),
      }
    );
  };
  const leave = () => {
    if (decide.isPending) return;
    decide.mutate({ ...key, decision: 'leave' }, { onSuccess: () => notice.say(`Left ${where}.`, { undo: takeBack, focus: nextFocus }) });
  };

  return (
    <li className={cn(rowClass, 'p-4')} data-posting-place={place.placeKey}>
      <p className="break-words text-sm font-medium text-text-1">{where}</p>
      <p className="mt-0.5 break-words text-xs text-text-2">
        {place.employer}
        <Dot />
        {n(place.postings)} {place.postings === 1 ? 'posting' : 'postings'}
        {place.titles.length > 0 && (
          <>
            <Dot />
            {place.titles.join(', ')}
          </>
        )}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {place.plants.length > 0 ? (
          <>
            <label htmlFor={selectId} className="sr-only">
              The plant {where} is
            </label>
            <select id={selectId} value={plantId} onChange={(event) => setPlantId(event.target.value)} className={cn(fieldClass, 'w-full min-w-0 sm:w-auto sm:max-w-md sm:flex-1')}>
              <option value="">Choose a plant</option>
              {place.plants.map((plant) => (
                <option key={plant.id} value={plant.id}>
                  {[formatFactoryName(plant.name), plant.city ? formatFactoryName(plant.city) : null].filter(Boolean).join(', ')}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              aria-disabled={decide.isPending || !plantId}
              aria-busy={decide.isPending}
              onClick={point}
              className={cn('h-[42px] rounded-lg', outlineButtonClass, busyButtonClass)}
            >
              {decide.isPending && <Loader2 className="animate-spin" />}
              Point here
            </Button>
          </>
        ) : (
          <p className="min-w-0 basis-full text-xs text-text-2">
            The company has no plant in {place.state} in our data. Add the plant, and the next run places these postings.
          </p>
        )}
        <button type="button" onClick={leave} className={cn(textButtonClass, 'ml-1 min-h-[42px]')}>
          Leave
        </button>
      </div>
      <ErrorNote error={decide.error} className="mt-2" />
    </li>
  );
}

/** Where the list of places that wait lives: the Data tab, taken over by it. */
export const PLACES_PATH = '/admin?tab=data&postings=places';

/**
 * The way into the places employers' postings name where we list no plant of
 * theirs. Drawn only while some wait, and as one line: a first run leaves
 * dozens, and the tab is for more than them.
 */
export function PlacesWaiting() {
  const places = useWaitingPlaces();
  const total = places.data?.total ?? 0;
  if (total === 0) return null;
  return (
    <PageSection title="Postings with no plant" description="Places employers' postings name where we list no plant of theirs.">
      <Link
        to={PLACES_PATH}
        className={cn(cardClass, 'flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-hover')}
        data-posting-places-waiting
      >
        <span className="min-w-0 text-sm font-medium text-text-1">Open the list</span>
        <span className="shrink-0 text-xs tabular-nums text-text-2">
          {n(total)} {total === 1 ? 'place' : 'places'}
        </span>
      </Link>
    </PageSection>
  );
}

/**
 * The places themselves, the ones most postings name first: it is also the
 * best report of plants the data is missing.
 */
export function PlacesView() {
  const places = useWaitingPlaces();
  const rows = places.data?.places ?? [];
  const total = places.data?.total ?? 0;
  return (
    <>
      <Link to="/admin?tab=data" className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm text-text-2 transition-colors hover:text-text-1">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      <PageSection
        title="Postings with no plant"
        description="Employers' postings that name a place where we list no plant of theirs. Point the place at a plant, and every posting naming it becomes a job there."
      >
        {places.isLoading ? (
          <RowsSkeleton />
        ) : places.isError ? (
          <LoadError error={places.error} onRetry={() => void places.refetch()} retrying={places.isFetching} />
        ) : rows.length === 0 ? (
          <p className={cn(cardClass, 'px-4 py-6 text-center text-sm text-text-2')}>None yet.</p>
        ) : (
          <ul className={cardClass} data-posting-places>
            {rows.map((place, index) => (
              <PlaceRow
                key={`${place.source}:${place.placeKey}`}
                place={place}
                nextFocus={rows[index + 1] ? `[data-posting-place="${rows[index + 1].placeKey}"] select, [data-posting-place="${rows[index + 1].placeKey}"] button` : undefined}
              />
            ))}
          </ul>
        )}
        {total > rows.length && (
          <p className="mt-2 text-xs text-text-2">
            {n(rows.length)} of {n(total)} places, the ones most postings name.
          </p>
        )}
      </PageSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Each employer's latest run
// ---------------------------------------------------------------------------

/** What a run did, in the order the question is asked; or why it stopped. */
function RunLine({ source }: { source: PostingSource }) {
  const run = source.run;
  if (!run) return <>Not run yet</>;
  if (run.outcome === 'not listed') return <>Not in our data: {source.company}</>;
  // Read and kept are always said; what a quiet day leaves at nothing (new, changed, closed, waiting) is not.
  const figures = [
    run.read !== null ? `${n(run.read)} read` : null,
    run.kept !== null ? `${n(run.kept)} kept` : null,
    run.added ? `${n(run.added)} new` : null,
    run.changed ? `${n(run.changed)} changed` : null,
    run.closed ? `${n(run.closed)} closed` : null,
    run.waiting ? `${n(run.waiting)} waiting` : null,
  ].filter((figure): figure is string => figure !== null);
  // A listing that stopped short is said even when what stopped it is ordinary (the day's budget for the platform).
  const stopped =
    run.outcome === 'refused' ? 'Refused' : run.outcome === 'unreachable' ? 'Did not answer' : run.outcome === 'failed' ? 'Failed' : run.outcome === 'cut' ? 'Listed in part' : null;
  return (
    <>
      {stopped && (
        <span className="text-text-1" data-run-stopped={run.outcome}>
          {stopped}: {run.why}
        </span>
      )}
      {stopped && figures.length > 0 && <Dot />}
      <span className="tabular-nums" data-run-figures>
        {figures.map((figure, index) => (
          <span key={figure}>
            {index > 0 && <Dot />}
            {figure}
          </span>
        ))}
      </span>
      {run.undone && (
        <>
          <Dot />
          Undone
        </>
      )}
    </>
  );
}

/**
 * Every employer whose public postings the intake runner reads, with its
 * latest run: postings read and kept, jobs new, changed and closed, postings
 * waiting for a plant; or what refused. Drawn once a run has been made.
 */
export function PostingRuns() {
  const sources = usePostingSources();
  if (sources.isPending) return null;
  if (sources.isError) {
    return (
      <PageSection title="Postings">
        <LoadError error={sources.error} onRetry={() => void sources.refetch()} retrying={sources.isFetching} />
      </PageSection>
    );
  }
  if (sources.data.length === 0) return null;
  const open = sources.data.reduce((sum, source) => sum + source.openJobs, 0);
  return (
    <PageSection
      title="Postings"
      description={`Employers' public job postings, read every day by the intake runner. ${n(open)} ${open === 1 ? 'job is' : 'jobs are'} open from them.`}
    >
      {sources.isFetching && !sources.data ? (
        <RowsSkeleton rows={2} />
      ) : (
        <ul className={cardClass} data-posting-sources>
          {sources.data.map((source) => (
            <li key={source.slug} className={cn(rowClass, 'px-4 py-3')} data-posting-source={source.slug}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className="min-w-0 break-words text-sm font-medium text-text-1">{source.employer}</p>
                <p className="shrink-0 text-xs tabular-nums text-text-2">
                  {source.run ? formatDayCapital(source.run.startedAt) : ''}
                  {source.openJobs > 0 && (
                    <>
                      <Dot />
                      {n(source.openJobs)} open
                    </>
                  )}
                </p>
              </div>
              <p className="mt-0.5 break-words text-xs text-text-2">
                <RunLine source={source} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  );
}
