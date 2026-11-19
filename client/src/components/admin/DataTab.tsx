import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAdminPaths } from '../../lib/admin';
import { RECORD_KINDS, editPath, type RecordKind } from '../../lib/records';
import { CardNote, LoadError, RowsSkeleton, cardClass, fieldClass, rowClass, SegmentedChoice } from '../account/parts';
import { PageSection } from '../layout/Page';
import Records from './Records';
import RecordEditor from './RecordEditor';
import QualityTable from './QualityTable';
import IntakeSources from './IntakeSources';
import MatchReview from './MatchReview';
import { PairsView, PairsWaiting } from './PlantPairs';
import { isUuid } from '../../lib/validation';

/**
 * Data upkeep. With a record in the address (`kind` and `id`) the tab is that
 * record's editor, and with `pairs` a list of rows that may be one plant
 * (`PlantPairs.tsx`); otherwise the matches a source's run was not sure of (when
 * any wait), the way into the plants listed twice (when any wait), finding or adding a record, the career paths waiting for review,
 * the sources that come in through the intake runner, and how complete the
 * plant data is, state by state (`QualityTable`). (Counts of people, requests, jobs and applications are
 * not data upkeep and are not here: People and Access are a tab away.)
 */
export default function DataTab() {
  const [searchParams] = useSearchParams();
  const kind = RECORD_KINDS.find((option) => option.kind === searchParams.get('kind'))?.kind;
  const id = searchParams.get('id');
  if (kind && id && isUuid(id)) return <RecordEditor key={`${kind}:${id}`} kind={kind} id={id} />;
  // Rows that may be one plant, worked through as a list: `pairs=id` (one registry id) or `pairs=spot` (one company, one spot).
  const pairs = searchParams.get('pairs');
  if (pairs === 'id' || pairs === 'spot') return <PairsView key={`${pairs}:${searchParams.get('state') ?? ''}`} list={pairs} />;
  return (
    <>
      {/* Matches a source's run was not sure of come first, and only when some wait: someone's load is held up on them. */}
      <MatchReview />
      {/* Then rows that carry one registry id and may be one plant: again only while some wait. */}
      <PairsWaiting />
      <Records />
      <PathsSection />
      <IntakeSources />
      <QualityTable />
    </>
  );
}

const PATHS_SHOWN = 12;
type PathState = 'draft' | 'approved';
const PATH_STATES: readonly { value: PathState; label: string }[] = [
  { value: 'draft', label: 'Drafts' },
  { value: 'approved', label: 'Approved' },
];

/**
 * Career paths by state. A draft opens in the career's editor, where its
 * skills are read level by level, corrected, and approved; the approved ones
 * are listed too, so one approved by mistake can be found and returned.
 */
function PathsSection() {
  const [state, setState] = useState<PathState>('draft');
  const paths = useAdminPaths(state);
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const choose = (next: PathState) => {
    setState(next);
    setShowAll(false);
  };

  const wanted = filter.trim().toLowerCase();
  const matching = (paths.data ?? []).filter((path) => !wanted || path.title.toLowerCase().includes(wanted));
  const shown = showAll || wanted ? matching : matching.slice(0, PATHS_SHOWN);
  const total = paths.data?.length ?? 0;

  return (
    <PageSection
      title="Career paths"
      description={
        state === 'draft'
          ? 'Drafts are written but not yet reviewed. Open one to read its skills by level, correct it and approve it.'
          : 'Paths a person has reviewed.'
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SegmentedChoice label="Paths shown" options={PATH_STATES} value={state} onChange={choose} className="grid-cols-2" optionClassName="px-4" />
        {total > PATHS_SHOWN && (
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by career"
            aria-label="Filter paths by career"
            className={cn(fieldClass, 'w-auto min-w-[9rem] flex-1 sm:max-w-xs')}
          />
        )}
        {paths.data && (
          <p className="text-xs tabular-nums text-fg-muted" data-path-count>
            {total.toLocaleString('en-US')}
          </p>
        )}
      </div>
      {paths.isPending ? (
        <RowsSkeleton rows={3} />
      ) : paths.isError ? (
        <LoadError error={paths.error} onRetry={() => void paths.refetch()} retrying={paths.isFetching} />
      ) : total === 0 ? (
        <CardNote>None yet.</CardNote>
      ) : matching.length === 0 ? (
        <CardNote>No match.</CardNote>
      ) : (
        <>
          <ul className={cardClass}>
            {shown.map((path) => (
              <li key={path.id} className={rowClass} data-path-row={path.id}>
                <Link
                  to={`${editPath('career' as RecordKind, path.id)}#path`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-bg-elevated"
                >
                  <span className="min-w-0 break-words text-sm font-medium text-fg-default">{path.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                    {path.skillCount} {path.skillCount === 1 ? 'skill' : 'skills'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {!showAll && !wanted && matching.length > PATHS_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 flex min-h-9 items-center text-sm font-medium text-fg-muted underline underline-offset-4 hover:text-fg-default"
            >
              Show all {matching.length.toLocaleString('en-US')}
            </button>
          )}
        </>
      )}
    </PageSection>
  );
}
