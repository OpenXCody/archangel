import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminOverview } from '../../lib/admin';
import { rowClass, rowHoverClass } from '../account/parts';
import MatchReview from './MatchReview';
import Panel from './Panel';
import PathsList from './PathsList';
import { PairsView, pairsPath, usePairsWaiting } from './PlantPairs';
import { PLACES_PATH, PlacesView, usePlacesWaiting } from './Postings';

/** How many things wait in each of the four lists; undefined while a count is still on its way. */
export function useReviewCounts() {
  const overview = useAdminOverview();
  return {
    paths: overview.data?.draftPaths,
    pairs: usePairsWaiting(),
    places: usePlacesWaiting(),
    matches: overview.data?.waitingMatches,
  };
}

/** Everything that waits, added up: the figure beside Review on the index. Undefined until every count is known. */
export function useReviewTotal(): number | undefined {
  const counts = useReviewCounts();
  const all = [counts.paths, counts.pairs, counts.places, counts.matches];
  return all.some((count) => count === undefined) ? undefined : all.reduce<number>((sum, count) => sum + (count ?? 0), 0);
}

const back = (
  <Link to="/admin/review" className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm text-text-2 transition-colors hover:text-text-1">
    <ArrowLeft className="h-4 w-4" />
    Everything to review
  </Link>
);

/**
 * Review: everything that waits for a person's decision, and nothing else.
 * The page is four lines, each with how many wait; a line opens its list
 * (`?list=paths`, `?pairs=id`, `?postings=places`, `?list=matches`), which
 * takes the page over and leads back here.
 */
export default function ReviewPage() {
  const [searchParams] = useSearchParams();
  const counts = useReviewCounts();
  // Rows that may be one factory, worked through as a list: `pairs=id` (one registry id) or `pairs=spot` (one company, one spot).
  const pairs = searchParams.get('pairs');
  if (pairs === 'id' || pairs === 'spot') return <PairsView key={`${pairs}:${searchParams.get('state') ?? ''}`} list={pairs} />;
  // The places employers' postings name where we list no factory of theirs.
  if (searchParams.get('postings') === 'places') return <PlacesView />;
  const list = searchParams.get('list');
  if (list === 'paths') {
    return (
      <>
        {back}
        <PathsList />
      </>
    );
  }
  if (list === 'matches') {
    return (
      <>
        {back}
        <MatchReview always />
      </>
    );
  }

  const rows: { key: string; to: string; title: string; says: string; count: number | undefined }[] = [
    { key: 'paths', to: '/admin/review?list=paths', title: 'Draft career paths', says: 'Written but not yet read by a person. Open one, correct it, approve it.', count: counts.paths },
    { key: 'pairs', to: pairsPath('id'), title: 'Factories listed twice', says: 'Two rows that carry one registry id. Merge them, or say they are two factories.', count: counts.pairs },
    { key: 'places', to: PLACES_PATH, title: 'Postings with no factory', says: 'Places employers’ job postings name where we list no factory of theirs.', count: counts.places },
    { key: 'matches', to: '/admin/review?list=matches', title: 'Uncertain matches', says: 'A source’s record that may be one of our factories.', count: counts.matches },
  ];
  return (
    <Panel title="Waiting for a decision" data-review>
      <ul>
        {rows.map((row) => (
          <li key={row.key} className={rowClass}>
            <Link to={row.to} className={cn(rowHoverClass, 'flex items-center gap-4 py-3')} data-review-row={row.key} data-review-count={row.count ?? ''}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text-1">{row.title}</span>
                <span className="mt-0.5 block text-xs text-text-3">{row.says}</span>
              </span>
              <span className={cn('shrink-0 text-sm tabular-nums', row.count ? 'font-semibold text-text-1' : 'text-text-3')}>
                {row.count === undefined ? '' : row.count === 0 ? 'None' : row.count.toLocaleString('en-US')}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-3" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
