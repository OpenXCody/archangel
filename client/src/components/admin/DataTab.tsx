import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAdminOverview, useAdminPaths } from '../../lib/account';
import { RECORD_KINDS, editPath, type RecordKind } from '../../lib/records';
import { CardNote, LoadError, RowsSkeleton, cardClass, fieldClass, rowClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import Records from './AddRecord';
import RecordEditor from './RecordEditor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Data upkeep. With a record in the address (`kind` and `id`) the tab is that
 * record's editor; otherwise counts, finding or adding a record, and the
 * career paths waiting for review.
 */
export default function DataTab() {
  const [searchParams] = useSearchParams();
  const kind = RECORD_KINDS.find((option) => option.kind === searchParams.get('kind'))?.kind;
  const id = searchParams.get('id');
  if (kind && id && UUID.test(id)) return <RecordEditor key={`${kind}:${id}`} kind={kind} id={id} />;
  return (
    <>
      <CountsSection />
      <Records />
      <PathsSection />
    </>
  );
}

function CountsSection() {
  const overview = useAdminOverview();
  // A count leads to where its things are; applications have no list of their own.
  const tiles: { label: string; value: number | undefined; to?: string }[] = [
    { label: 'People', value: overview.data?.users, to: '/admin' },
    { label: 'Access requests', value: overview.data?.pendingMemberships, to: '/admin?tab=access' },
    { label: 'Open jobs', value: overview.data?.openJobs, to: '/jobs' },
    { label: 'Applications', value: overview.data?.applications },
  ];
  return (
    <PageSection title="Counts">
      {overview.isError ? (
        <LoadError error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      ) : (
        <dl className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => {
            const body = (
              <>
                <dt className="truncate text-sm text-fg-muted">{tile.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-fg-default">
                  {tile.value === undefined ? <Skeleton className="h-8 w-12" /> : tile.value.toLocaleString('en-US')}
                </dd>
              </>
            );
            return tile.to ? (
              <Link key={tile.label} to={tile.to} className={cn(cardClass, 'block min-w-0 p-4 transition-colors hover:border-border-strong')}>
                {body}
              </Link>
            ) : (
              <div key={tile.label} className={cn(cardClass, 'min-w-0 p-4')}>
                {body}
              </div>
            );
          })}
        </dl>
      )}
    </PageSection>
  );
}

const PATHS_SHOWN = 12;
type PathState = 'draft' | 'approved';

/**
 * Career paths by state. A draft opens in the career's editor, where its
 * skills are read stage by stage, corrected, and approved; the approved ones
 * are listed too, so one approved by mistake can be found and returned.
 */
function PathsSection() {
  const [state, setState] = useState<PathState>('draft');
  const paths = useAdminPaths(state);
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);

  const wanted = filter.trim().toLowerCase();
  const matching = (paths.data ?? []).filter((path) => !wanted || path.title.toLowerCase().includes(wanted));
  const shown = showAll || wanted ? matching : matching.slice(0, PATHS_SHOWN);
  const total = paths.data?.length ?? 0;

  return (
    <PageSection
      title="Career paths"
      description={
        state === 'draft'
          ? 'Drafts are written but not yet reviewed. Open one to read its skills by stage, correct it and approve it.'
          : 'Paths a person has reviewed.'
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Paths shown" className="grid h-[42px] grid-cols-2 gap-1 rounded-lg border border-border-strong bg-bg-elevated p-1">
          {(['draft', 'approved'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={state === option}
              onClick={() => {
                setState(option);
                setShowAll(false);
              }}
              className={cn(
                'rounded-md px-4 text-sm font-medium transition-colors',
                state === option ? 'bg-bg-surface text-fg-default' : 'text-fg-muted hover:text-fg-default'
              )}
            >
              {option === 'draft' ? 'Drafts' : 'Approved'}
            </button>
          ))}
        </div>
        {total > PATHS_SHOWN && (
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by career"
            aria-label="Filter paths by career"
            className={cn(fieldClass, 'w-auto min-w-0 flex-1 sm:max-w-xs')}
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
        <CardNote>None.</CardNote>
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
