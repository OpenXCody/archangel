import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { industriesApi, type IndustryList } from '../lib/api';
import { industryLabel } from '@shared/industry';
import { cn } from '@/lib/utils';
import { EmptyState, PageContainer } from '../components/layout/Page';
import { LoadError } from '../components/account/parts';
import {
  BackButton,
  FigureList,
  Figures,
  OUTLINE_LINK,
  PlaceChoice,
  SourceLine,
  officialFigures,
  placeQuery,
  placeSearch,
  readPlace,
  type PagePlace,
} from '../components/industry/parts';

function IndustriesBody({ data, place }: { data: IndustryList; place: PagePlace }) {
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

/**
 * Every manufacturing industry, largest first, for the country or narrowed
 * to a state or a focus area from the address (?state=TX, ?area=austin).
 * Above the list: manufacturing as a whole in that place.
 */
export default function IndustriesPage() {
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
    <PageContainer size="narrow">
      <BackButton fallback="/explore" />
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-fg-default sm:text-3xl">Industries</h1>
        <PlaceChoice place={place} />
      </header>

      {place.kind === 'unknown' ? (
        <EmptyState
          title="That place is not listed"
          description={`“${place.asked}” is not a state.`}
          action={
            <Link to="/industries" className={OUTLINE_LINK}>
              Industries everywhere
            </Link>
          }
        />
      ) : data ? (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')} aria-busy={query.isPlaceholderData || undefined} data-industries-view>
          <IndustriesBody data={data} place={place} />
        </div>
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} className="mt-6" />
      ) : (
        <div className="flex min-h-[320px] items-center justify-center" aria-busy="true" aria-label="Loading">
          <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
        </div>
      )}
    </PageContainer>
  );
}
