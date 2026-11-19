import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { industriesApi, type IndustryList as Industries } from '../../lib/api';
import { industryLabel } from '@shared/industry';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, detailActionClass } from '../layout/Page';
import { LoadError } from '../account/parts';
import {
  FigureList,
  Figures,
  PlaceChoice,
  SourceLine,
  officialFigures,
  placeQuery,
  placeSearch,
  readPlace,
  type PagePlace,
} from '../industry/parts';

function Body({ data, place }: { data: Industries; place: PagePlace }) {
  const figures = [
    ...officialFigures(data.manufacturing),
    ...(data.plants > 0 ? [{ label: 'Plants listed', value: data.plants.toLocaleString() }] : []),
  ];
  const search = placeSearch(place);
  if (data.industries.length === 0) {
    return <p className="mt-6 text-sm text-fg-muted">No plants are listed in {data.place.name}.</p>;
  }
  return (
    <>
      <Figures items={figures} />
      {data.manufacturing && <SourceLine stats={data.manufacturing} />}
      <div className="mt-8">
        <FigureList
          rows={data.industries.map((industry) => ({
            key: industry.slug,
            to: `/industries/${industry.slug}${search}`,
            label: industryLabel(industry.name),
            people: industry.employment,
            plants: industry.plants,
          }))}
        />
      </div>
    </>
  );
}

/** The same shape while the first answer is on its way: four figures, then rows. */
function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
        ))}
      </div>
      <div className="mt-12 space-y-7">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4" style={{ width: `${30 + ((i * 17) % 30)}%` }} />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Explore's Industries view (/industries): every manufacturing industry,
 * largest first, for the country or narrowed to a state or a focus area from
 * the address (?state=TX, ?area=austin). Above the list: manufacturing as a
 * whole in that place.
 */
export default function IndustryList() {
  const [params] = useSearchParams();
  const place = readPlace(params);
  const where = placeQuery(place);

  const placeTitle = place.kind === 'state' || place.kind === 'area' ? place.name : null;
  useEffect(() => {
    document.title = placeTitle ? `Industries in ${placeTitle} · Archangel` : 'Industries · Archangel';
  }, [placeTitle]);

  const query = useQuery({
    queryKey: ['industries', where.state ?? null, where.area ?? null],
    queryFn: () => industriesApi.list(where),
    enabled: place.kind !== 'unknown',
    staleTime: 1000 * 60 * 5,
    // Changing the place keeps the list drawn until the new place's figures arrive.
    placeholderData: (previous) => previous,
  });
  const data = query.data;

  return (
    // The figures read across a column, not across the whole page.
    <div className="max-w-3xl">
      <div className="my-2 sm:my-4">
        <PlaceChoice place={place} />
      </div>

      {place.kind === 'unknown' ? (
        <EmptyState
          title="That place is not listed"
          description={`“${place.asked}” is not a state.`}
          action={
            <Link to="/industries" className={detailActionClass}>
              Industries everywhere
            </Link>
          }
        />
      ) : data ? (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')} aria-busy={query.isPlaceholderData || undefined} data-industries-view>
          <Body data={data} place={place} />
        </div>
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} className="mt-6" />
      ) : (
        <Loading />
      )}
    </div>
  );
}
