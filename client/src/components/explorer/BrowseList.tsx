import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import {
  companiesApi,
  exploreApi,
  factoriesApi,
  occupationsApi,
  skillsApi,
  refsApi,
  schoolsApi,
  programsApi,
  type PaginatedResponse,
} from '../../lib/api';
import { US_STATES, type StateCode } from '@shared/states';
import { Button } from '@/components/ui/button';
import { EmptyState } from '../layout/Page';
import { LoadError, outlineButtonClass } from '../account/parts';
import EntityRow, { EntityRowSkeleton, type BrowseEntity } from './EntityRow';
import FilterBar, { SORT_OPTIONS, type FilterState } from './FilterBar';
import { BROWSE_LABEL, FOLDED_ON_PHONE, MORE_TABS as IN_MORE, type BrowseTab } from './ExploreNav';

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
  refs: refsApi.list,
  schools: schoolsApi.list,
  programs: programsApi.list,
};

const NOUN: Record<BrowseTab, [one: string, many: string]> = {
  companies: ['company', 'companies'],
  factories: ['factory', 'factories'],
  occupations: ['career', 'careers'],
  skills: ['skill', 'skills'],
  refs: ['element', 'elements'],
  schools: ['school', 'schools'],
  programs: ['program', 'programs'],
};

/** Row height before it is measured: two or three lines of text. */
const ROW_ESTIMATE: Record<BrowseTab, number> = {
  companies: 77,
  factories: 77,
  occupations: 101,
  skills: 101,
  refs: 101,
  schools: 101,
  programs: 101,
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
 * A browse list behind the overview: every company, factory, career and so
 * on, filtered and sorted from the address (?state=, ?industry=, ?category=,
 * ?sort=), so a filtered list can be linked to and survives Back.
 */
export default function BrowseList({ tab }: { tab: BrowseTab }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const stateParam = searchParams.get('state');
  const industryParam = searchParams.get('industry');
  const categoryParam = searchParams.get('category');
  const filters: FilterState = useMemo(
    () => ({
      state: tab === 'factories' && isStateCode(stateParam) ? stateParam : undefined,
      industry: (tab === 'companies' || tab === 'factories') && industryParam ? industryParam : undefined,
      category: tab === 'skills' && categoryParam ? categoryParam : undefined,
    }),
    [tab, stateParam, industryParam, categoryParam]
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
  const industries = tab === 'factories' ? facets.data?.factoryIndustries : facets.data?.companyIndustries;
  const categories = facets.data?.skillCategories;

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const clearFilters = () => setParam({ state: undefined, industry: undefined, category: undefined });
  const [one, many] = NOUN[tab];

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
        summary={total === undefined ? null : `${total.toLocaleString()} ${total === 1 ? one : many}`}
        title={IN_MORE.includes(tab) || tab === FOLDED_ON_PHONE ? BROWSE_LABEL[tab] : undefined}
      />

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
          title={`No ${many}`}
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
