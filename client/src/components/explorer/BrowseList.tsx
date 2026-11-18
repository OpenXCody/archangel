import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import {
  companiesApi,
  exploreApi,
  factoriesApi,
  occupationsApi,
  skillsApi,
  type PaginatedResponse,
} from '../../lib/api';
import { US_STATES, type StateCode } from '@shared/states';
import { industryByName, industryBySlug, industryLabel, industryPath } from '@shared/industry';
import { Button } from '@/components/ui/button';
import { EmptyState } from '../layout/Page';
import { LoadError, outlineButtonClass } from '../account/parts';
import EntityRow, { EntityRowSkeleton, type BrowseEntity } from './EntityRow';
import FilterBar, { SORT_OPTIONS, type FilterState } from './FilterBar';
import type { BrowseTab } from './ExploreNav';

const PAGE_SIZE = 20;

// A type alias, not an interface: the list functions take an open set of query parameters.
type ListParams = {
  offset: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  state?: string;
  industry?: string;
  category?: string;
};

const LIST: Record<BrowseTab, (params: ListParams) => Promise<PaginatedResponse<BrowseEntity>>> = {
  companies: companiesApi.list,
  factories: factoriesApi.list,
  occupations: occupationsApi.list,
  skills: skillsApi.list,
};

/** What an empty list says it has none of. */
const MANY: Record<BrowseTab, string> = {
  companies: 'companies',
  factories: 'plants',
  occupations: 'careers',
  skills: 'skills',
};

/** Row height before it is measured: two or three lines of text (a phone gives a description two lines). */
const ROW_ESTIMATE: Record<BrowseTab, number> = {
  companies: 77,
  factories: 77,
  occupations: 101,
  skills: 101,
};

const isStateCode = (value: string | null): value is StateCode => US_STATES.some((s) => s.code === value);

/** One column on a phone or tablet, two from a laptop up (Tailwind's lg). */
function useColumnCount() {
  const [columns, setColumns] = useState(() => (window.innerWidth >= 1024 ? 2 : 1));
  useEffect(() => {
    const update = () => setColumns(window.innerWidth >= 1024 ? 2 : 1);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return columns;
}

const GRID = 'grid grid-cols-1 gap-x-12 lg:grid-cols-2';

function VirtualRows({
  tab,
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  tab: BrowseTab;
  items: BrowseEntity[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const columns = useColumnCount();

  const rows = useMemo(() => {
    const result: BrowseEntity[][] = [];
    for (let i = 0; i < items.length; i += columns) result.push(items.slice(i, i + columns));
    return result;
  }, [items, columns]);

  // One extra row at the end while there is more: placeholders, or a way to ask for it.
  const totalRows = hasMore ? rows.length + 1 : rows.length;

  // Rows are positioned in window-scroll space; scrollMargin is where the list
  // starts on the page. What sits above can change height (figures arriving,
  // filters wrapping), which changes the page's height: measure again then.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const top = Math.round((listRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY);
      setScrollMargin((current) => (current === top ? current : top));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: totalRows,
    estimateSize: () => ROW_ESTIMATE[tab],
    overscan: 6,
    scrollMargin,
  });
  const virtualItems = virtualizer.getVirtualItems();

  // Fetch the next page shortly before the end comes into view.
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= rows.length - 5 && hasMore && !isLoadingMore) onLoadMore();
  }, [virtualItems, rows.length, hasMore, isLoadingMore, onLoadMore]);

  return (
    <div ref={listRef}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {virtualItems.map((virtualRow: VirtualItem) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {row ? (
                <div className={GRID}>
                  {row.map((item) => (
                    <EntityRow key={item.id} type={tab} data={item} />
                  ))}
                </div>
              ) : isLoadingMore ? (
                <div className={GRID} aria-busy="true" aria-label="Loading">
                  {Array.from({ length: columns }, (_, i) => (
                    <EntityRowSkeleton key={i} type={tab} index={i} />
                  ))}
                </div>
              ) : (
                <div className="py-4">
                  <button
                    type="button"
                    onClick={onLoadMore}
                    className="inline-flex min-h-11 items-center text-sm text-fg-muted underline underline-offset-4 transition-colors hover:text-fg-default"
                  >
                    Show more
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A browse list behind the overview: every company, plant, career or
 * skill, filtered and sorted from the address (?state=, ?industry=, ?category=,
 * ?sort=), so a filtered list can be linked to and survives Back. `onCount`
 * hears how many rows the list holds with its filters applied.
 */
export default function BrowseList({ tab, onCount }: { tab: BrowseTab; onCount?: (count: number | undefined) => void }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const stateParam = searchParams.get('state');
  const industryParam = searchParams.get('industry');
  const categoryParam = searchParams.get('category');
  // An industry is one of the 21, by the name a plant carries or by its page's slug.
  // Anything else in the address (an old link's free text) is no filter at all.
  const industry = (industryByName(industryParam) ?? industryBySlug(industryParam))?.name;
  const filters: FilterState = useMemo(
    () => ({
      state: tab === 'factories' && isStateCode(stateParam) ? stateParam : undefined,
      industry: tab === 'companies' || tab === 'factories' ? industry : undefined,
      category: tab === 'skills' && categoryParam ? categoryParam : undefined,
    }),
    [tab, stateParam, industry, categoryParam]
  );
  const filtered = Boolean(filters.state || filters.industry || filters.category);

  const sortOptions = SORT_OPTIONS[tab];
  const sort = sortOptions.find((o) => o.value === searchParams.get('sort')) ?? sortOptions[0];

  const setParam = useCallback(
    (changes: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const params = useMemo(
    () => ({
      sort: sort.field,
      order: sort.order,
      ...(filters.state && { state: filters.state }),
      ...(filters.industry && { industry: filters.industry }),
      ...(filters.category && { category: filters.category }),
    }),
    [sort, filters]
  );

  const list = useInfiniteQuery({
    queryKey: [`explore-${tab}`, params],
    queryFn: ({ pageParam }) => LIST[tab]({ offset: pageParam, limit: PAGE_SIZE, ...params }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    staleTime: 1000 * 60 * 5,
  });

  // Choices for the industry and category filters: every value in use, not
  // just those on the first page of a list.
  const facets = useQuery({
    queryKey: ['explore-facets'],
    queryFn: exploreApi.facets,
    staleTime: 1000 * 60 * 10,
    enabled: tab === 'companies' || tab === 'factories' || tab === 'skills',
  });
  // Of the 21: those some plant carries, or those that are some company's industry.
  const industries = tab === 'factories' ? facets.data?.factoryIndustries : (facets.data?.industries?.companies ?? facets.data?.factoryIndustries);
  const categories = facets.data?.skillCategories;

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total;
  // Said under the page's heading, by the page.
  useEffect(() => {
    onCount?.(total);
  }, [total, onCount]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const clearFilters = () => setParam({ state: undefined, industry: undefined, category: undefined });
  // Plants filtered to one industry: that industry has a page of its own, for the same state.
  const industryPage = tab === 'factories' ? industryPath(filters.industry, { state: filters.state }) : null;

  return (
    <>
      <FilterBar
        activeTab={tab}
        sortValue={sort.value}
        onSortChange={(value) => setParam({ sort: value === sortOptions[0].value ? undefined : value })}
        filters={filters}
        onFilterChange={(next) => setParam({ state: next.state, industry: next.industry, category: next.category })}
        industries={industries}
        categories={categories}
      />

      {industryPage && filters.industry && (
        <p className="-mt-1 mb-3 text-sm sm:-mt-2">
          <Link to={industryPage} className="inline-flex min-h-11 items-center text-fg-muted underline underline-offset-4 hover:text-fg-default sm:min-h-0">
            About {industryLabel(filters.industry)}
            {filters.state ? ` in ${US_STATES.find((s) => s.code === filters.state)?.name ?? filters.state}` : ''}
          </Link>
        </p>
      )}

      {list.isLoading ? (
        <div className={GRID} aria-busy="true" aria-label="Loading">
          {Array.from({ length: 12 }, (_, i) => (
            <EntityRowSkeleton key={i} type={tab} index={i} />
          ))}
        </div>
      ) : list.isError && items.length === 0 ? (
        <LoadError error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState
          title={`No ${MANY[tab]}`}
          description={filtered ? 'Nothing matches these filters.' : undefined}
          action={
            filtered ? (
              <Button type="button" variant="outline" onClick={clearFilters} className={`h-10 rounded-lg ${outlineButtonClass}`}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <VirtualRows
          tab={tab}
          items={items}
          hasMore={Boolean(hasNextPage)}
          isLoadingMore={isFetchingNextPage}
          onLoadMore={loadMore}
        />
      )}
    </>
  );
}
