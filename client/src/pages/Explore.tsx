import { useMemo, useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { Building2, Factory, Briefcase, Wrench, Loader2, Layers, Search, ChevronDown, ChevronRight, Boxes, GraduationCap, BookOpen } from 'lucide-react';
import {
  companiesApi,
  factoriesApi,
  occupationsApi,
  skillsApi,
  refsApi,
  schoolsApi,
  programsApi,
  statsApi,
  type EntityType,
  type Company,
  type Factory as FactoryType,
  type Occupation,
  type Skill,
  type Ref,
  type School,
  type Program,
} from '../lib/api';
import EntityCard from '../components/explorer/EntityCard';
import FilterBar, { type FilterState, SORT_OPTIONS } from '../components/explorer/FilterBar';
import { PageContainer, PageHeader } from '../components/layout/Page';

type TabType = 'all' | EntityType;

const TABS: { id: TabType; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'all', label: 'All', icon: Layers, color: 'text-fg-muted' },
  { id: 'companies', label: 'Companies', icon: Building2, color: 'text-amber-500' },
  { id: 'factories', label: 'Factories', icon: Factory, color: 'text-sky-400' },
  { id: 'occupations', label: 'Occupations', icon: Briefcase, color: 'text-violet-400' },
  { id: 'skills', label: 'Skills', icon: Wrench, color: 'text-emerald-500' },
  { id: 'refs', label: 'Refs', icon: Boxes, color: 'text-teal-500' },
  { id: 'schools', label: 'Schools', icon: GraduationCap, color: 'text-indigo-500' },
  { id: 'programs', label: 'Programs', icon: BookOpen, color: 'text-fuchsia-500' },
];

// Only include browsable entity types (not persons)
type BrowsableEntityType = Exclude<EntityType, 'persons'>;

const SECTION_CONFIG: Record<BrowsableEntityType, {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string
}> = {
  companies: { label: 'Companies', icon: Building2, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  factories: { label: 'Factories', icon: Factory, color: 'text-sky-400', bgColor: 'bg-sky-400/10' },
  occupations: { label: 'Occupations', icon: Briefcase, color: 'text-violet-400', bgColor: 'bg-violet-400/10' },
  skills: { label: 'Skills', icon: Wrench, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  refs: { label: 'Elements', icon: Boxes, color: 'text-teal-500', bgColor: 'bg-teal-500/10' },
  schools: { label: 'Schools', icon: GraduationCap, color: 'text-indigo-500', bgColor: 'bg-indigo-500/10' },
  programs: { label: 'Programs', icon: BookOpen, color: 'text-fuchsia-500', bgColor: 'bg-fuchsia-500/10' },
};

// Reusable Load More button component
function LoadMoreButton({
  onClick,
  isLoading,
  hasMore,
  compact = false
}: {
  onClick: () => void;
  isLoading: boolean;
  hasMore: boolean;
  compact?: boolean;
}) {
  if (!hasMore) return null;

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={`
        flex items-center justify-center gap-2
        ${compact ? 'px-4 py-2 text-xs' : 'px-6 py-2.5 text-sm'}
        bg-bg-elevated/50 border border-border-subtle rounded-full
        font-medium text-fg-muted
        hover:bg-bg-elevated hover:text-fg-default hover:border-border-strong
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors
      `}
    >
      {isLoading ? (
        <>
          <Loader2 className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} animate-spin`} />
          Loading...
        </>
      ) : (
        <>
          <ChevronDown className={`${compact ? 'w-3 h-3' : 'w-4 h-4'}`} />
          Load More
        </>
      )}
    </button>
  );
}

// Hook to track responsive column count
function useColumnCount() {
  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const updateColumnCount = () => {
      // Match Tailwind breakpoints: sm:640px, lg:1024px
      if (window.innerWidth >= 1024) {
        setColumnCount(3);
      } else if (window.innerWidth >= 640) {
        setColumnCount(2);
      } else {
        setColumnCount(1);
      }
    };

    updateColumnCount();
    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
  }, []);

  return columnCount;
}

// Virtualized grid component for single entity type tabs
type TaggedEntity =
  | { type: 'companies'; data: Company }
  | { type: 'factories'; data: FactoryType }
  | { type: 'occupations'; data: Occupation }
  | { type: 'skills'; data: Skill }
  | { type: 'refs'; data: Ref }
  | { type: 'schools'; data: School }
  | { type: 'programs'; data: Program };

function VirtualizedGrid({
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  items: TaggedEntity[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const columnCount = useColumnCount();

  // Group items into rows based on column count
  const rows = useMemo(() => {
    const result: TaggedEntity[][] = [];
    for (let i = 0; i < items.length; i += columnCount) {
      result.push(items.slice(i, i + columnCount));
    }
    return result;
  }, [items, columnCount]);

  // Add one extra row for the Load More button if needed
  const totalRows = hasMore ? rows.length + 1 : rows.length;

  // Rows are positioned in window-scroll space; scrollMargin is where the list
  // starts on the page. Read after layout and re-render once so it's exact.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop ?? 0);
  }, [columnCount]);
  const virtualizer = useWindowVirtualizer({
    count: totalRows,
    estimateSize: () => 126, // 114px card + 12px row gap; measureElement corrects it
    overscan: 5,
    scrollMargin,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Auto-load more when nearing the end
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    // If we're within 5 rows of the end and there's more to load
    if (lastItem.index >= rows.length - 5 && hasMore && !isLoadingMore) {
      onLoadMore();
    }
  }, [virtualItems, rows.length, hasMore, isLoadingMore, onLoadMore]);

  return (
    <div ref={listRef}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow: VirtualItem) => {
          const isLoadMoreRow = virtualRow.index === rows.length;
          const row = rows[virtualRow.index];

          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="pb-3"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {isLoadMoreRow ? (
                <div className="flex justify-center py-4">
                  <LoadMoreButton
                    onClick={onLoadMore}
                    isLoading={isLoadingMore}
                    hasMore={hasMore}
                  />
                </div>
              ) : (
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  }}
                >
                  {row?.map((item) => (
                    <EntityCard
                      key={`${item.type}-${item.data.id}`}
                      type={item.type}
                      data={item.data}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Overview section for the "All" tab: a taste of each type plus a link to
// the full tab. (Nested scroll boxes per type were the old approach — the
// page should be the only thing that scrolls.)
function OverviewSection({
  type,
  items,
  totalCount,
}: {
  type: BrowsableEntityType;
  items: (Company | FactoryType | Occupation | Skill | Ref | School | Program)[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  totalCount: number;
}) {
  const columnCount = useColumnCount();
  const config = SECTION_CONFIG[type];
  const Icon = config.icon;
  if (items.length === 0) return null;
  const shown = items.slice(0, columnCount * 2);
  const remaining = Math.max(totalCount - shown.length, 0);

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.bgColor}`}>
            <Icon className={`w-4 h-4 ${config.color}`} />
          </div>
          <div>
            <h2 className="text-base font-medium text-fg-default">{config.label}</h2>
            <p className="text-xs text-fg-muted">{totalCount.toLocaleString()} total</p>
          </div>
        </div>
        {remaining > 0 && (
          <Link
            to={`/explore?tab=${type}`}
            className="inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg-default"
          >
            View all {totalCount.toLocaleString()}
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((item) => (
          <EntityCard key={item.id} type={type} data={item} />
        ))}
      </div>
    </section>
  );
}

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabType) || 'all';

  // Filter and sort state. Companies default to factory-count so the big
  // manufacturers surface before the long tail of 1-factory bulk-import rows.
  const defaultSortFor = (tab: TabType) => tab === 'companies' ? 'factories-desc' : 'name-asc';
  const [sortValue, setSortValue] = useState(() => defaultSortFor(activeTab));
  const [filters, setFilters] = useState<FilterState>({});

  // Reset filters when tab changes
  useEffect(() => {
    setFilters({});
    setSortValue(defaultSortFor(activeTab));
  }, [activeTab]);

  // Get current sort config
  const sortConfig = useMemo(() => {
    // Only use sort options for browsable tabs (not persons)
    const tabKey = activeTab === 'persons' ? 'all' : activeTab;
    const options = SORT_OPTIONS[tabKey as keyof typeof SORT_OPTIONS] || SORT_OPTIONS.all;
    return options.find((o: typeof options[number]) => o.value === sortValue) || options[0];
  }, [activeTab, sortValue]);

  // Fetch entity counts for tab badges
  const { data: counts } = useQuery({
    queryKey: ['entity-counts'],
    queryFn: statsApi.counts,
    staleTime: 1000 * 60 * 10,
  });

  // Fetch unique industries for filter dropdown
  const { data: industries } = useQuery({
    queryKey: ['industries-list'],
    queryFn: async () => {
      // Fetch companies and extract unique industries
      const response = await companiesApi.list({ limit: 1000 });
      const uniqueIndustries = [...new Set(
        response.data
          .map(c => c.industry)
          .filter((i): i is string => Boolean(i))
      )].sort();
      return uniqueIndustries;
    },
    staleTime: 1000 * 60 * 10,
  });

  // Fetch unique skill categories for filter dropdown
  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async () => {
      const response = await skillsApi.list({ limit: 1000 });
      const uniqueCategories = [...new Set(
        response.data
          .map(s => s.category)
          .filter((c): c is string => Boolean(c))
      )].sort();
      return uniqueCategories;
    },
    staleTime: 1000 * 60 * 10,
  });

  const setActiveTab = (tab: TabType) => {
    const params = new URLSearchParams(searchParams);
    if (tab === 'all') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    setSearchParams(params);
  };

  const PAGE_SIZE = 20;

  // Build query params with filters and sort
  const companiesQueryParams = useMemo(() => ({
    sort: sortConfig.field,
    order: sortConfig.order,
    ...(filters.industry && { industry: filters.industry }),
  }), [sortConfig, filters.industry]);

  const factoriesQueryParams = useMemo(() => ({
    sort: sortConfig.field,
    order: sortConfig.order,
    ...(filters.state && { state: filters.state }),
    ...(filters.industry && { industry: filters.industry }),
  }), [sortConfig, filters.state, filters.industry]);

  const skillsQueryParams = useMemo(() => ({
    sort: sortConfig.field,
    order: sortConfig.order,
    ...(filters.category && { category: filters.category }),
  }), [sortConfig, filters.category]);

  const occupationsQueryParams = useMemo(() => ({
    sort: sortConfig.field,
    order: sortConfig.order,
  }), [sortConfig]);

  // Companies query - offset-based pagination
  const {
    data: companiesData,
    fetchNextPage: fetchNextCompanies,
    hasNextPage: hasNextCompanies,
    isFetchingNextPage: isFetchingNextCompanies,
    isLoading: isLoadingCompanies,
    isFetching: isFetchingCompanies,
  } = useInfiniteQuery({
    queryKey: ['explore-companies', companiesQueryParams],
    queryFn: ({ pageParam = 0 }) =>
      companiesApi.list({ offset: pageParam, limit: PAGE_SIZE, ...companiesQueryParams }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    staleTime: 1000 * 60 * 5,
    enabled: activeTab === 'all' || activeTab === 'companies',
  });

  // Factories query - offset-based pagination
  const {
    data: factoriesData,
    fetchNextPage: fetchNextFactories,
    hasNextPage: hasNextFactories,
    isFetchingNextPage: isFetchingNextFactories,
    isLoading: isLoadingFactories,
    isFetching: isFetchingFactories,
  } = useInfiniteQuery({
    queryKey: ['explore-factories', factoriesQueryParams],
    queryFn: ({ pageParam = 0 }) =>
      factoriesApi.list({ offset: pageParam, limit: PAGE_SIZE, ...factoriesQueryParams }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    staleTime: 1000 * 60 * 5,
    enabled: activeTab === 'all' || activeTab === 'factories',
  });

  // Occupations query - offset-based pagination
  const {
    data: occupationsData,
    fetchNextPage: fetchNextOccupations,
    hasNextPage: hasNextOccupations,
    isFetchingNextPage: isFetchingNextOccupations,
    isLoading: isLoadingOccupations,
    isFetching: isFetchingOccupations,
  } = useInfiniteQuery({
    queryKey: ['explore-occupations', occupationsQueryParams],
    queryFn: ({ pageParam = 0 }) =>
      occupationsApi.list({ offset: pageParam, limit: PAGE_SIZE, ...occupationsQueryParams }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    staleTime: 1000 * 60 * 5,
    enabled: activeTab === 'all' || activeTab === 'occupations',
  });

  // Skills query - offset-based pagination
  const {
    data: skillsData,
    fetchNextPage: fetchNextSkills,
    hasNextPage: hasNextSkills,
    isFetchingNextPage: isFetchingNextSkills,
    isLoading: isLoadingSkills,
    isFetching: isFetchingSkills,
  } = useInfiniteQuery({
    queryKey: ['explore-skills', skillsQueryParams],
    queryFn: ({ pageParam = 0 }) =>
      skillsApi.list({ offset: pageParam, limit: PAGE_SIZE, ...skillsQueryParams }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    staleTime: 1000 * 60 * 5,
    enabled: activeTab === 'all' || activeTab === 'skills',
  });

  // Refs query
  const {
    data: refsData,
    fetchNextPage: fetchNextRefs,
    hasNextPage: hasNextRefs,
    isFetchingNextPage: isFetchingNextRefs,
    isLoading: isLoadingRefs,
    isFetching: isFetchingRefs,
  } = useInfiniteQuery({
    queryKey: ['explore-refs', sortConfig],
    queryFn: ({ pageParam = 0 }) =>
      refsApi.list({ offset: pageParam, limit: PAGE_SIZE, sort: sortConfig.field, order: sortConfig.order }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    staleTime: 1000 * 60 * 5,
    enabled: activeTab === 'all' || activeTab === 'refs',
  });

  // Schools query
  const {
    data: schoolsData,
    fetchNextPage: fetchNextSchools,
    hasNextPage: hasNextSchools,
    isFetchingNextPage: isFetchingNextSchools,
    isLoading: isLoadingSchools,
    isFetching: isFetchingSchools,
  } = useInfiniteQuery({
    queryKey: ['explore-schools', sortConfig],
    queryFn: ({ pageParam = 0 }) =>
      schoolsApi.list({ offset: pageParam, limit: PAGE_SIZE, sort: sortConfig.field, order: sortConfig.order }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    staleTime: 1000 * 60 * 5,
    enabled: activeTab === 'all' || activeTab === 'schools',
  });

  // Programs query
  const {
    data: programsData,
    fetchNextPage: fetchNextPrograms,
    hasNextPage: hasNextPrograms,
    isFetchingNextPage: isFetchingNextPrograms,
    isLoading: isLoadingPrograms,
    isFetching: isFetchingPrograms,
  } = useInfiniteQuery({
    queryKey: ['explore-programs', sortConfig],
    queryFn: ({ pageParam = 0 }) =>
      programsApi.list({ offset: pageParam, limit: PAGE_SIZE, sort: sortConfig.field, order: sortConfig.order }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    staleTime: 1000 * 60 * 5,
    enabled: activeTab === 'all' || activeTab === 'programs',
  });

  // Grouped data for "All" tab
  const groupedItems = useMemo(() => ({
    companies: companiesData?.pages.flatMap(p => p.data) ?? [],
    factories: factoriesData?.pages.flatMap(p => p.data) ?? [],
    occupations: occupationsData?.pages.flatMap(p => p.data) ?? [],
    skills: skillsData?.pages.flatMap(p => p.data) ?? [],
    refs: refsData?.pages.flatMap(p => p.data) ?? [],
    schools: schoolsData?.pages.flatMap(p => p.data) ?? [],
    programs: programsData?.pages.flatMap(p => p.data) ?? [],
  }), [companiesData, factoriesData, occupationsData, skillsData, refsData, schoolsData, programsData]);

  // Combine data for single entity type tabs
  const items = useMemo(() => {
    type TaggedEntity =
      | { type: 'companies'; data: Company }
      | { type: 'factories'; data: FactoryType }
      | { type: 'occupations'; data: Occupation }
      | { type: 'skills'; data: Skill }
      | { type: 'refs'; data: Ref }
      | { type: 'schools'; data: School }
      | { type: 'programs'; data: Program };

    const result: TaggedEntity[] = [];

    if (activeTab === 'companies') {
      companiesData?.pages.forEach((page) => {
        page.data.forEach((item) => result.push({ type: 'companies', data: item }));
      });
    } else if (activeTab === 'factories') {
      factoriesData?.pages.forEach((page) => {
        page.data.forEach((item) => result.push({ type: 'factories', data: item }));
      });
    } else if (activeTab === 'occupations') {
      occupationsData?.pages.forEach((page) => {
        page.data.forEach((item) => result.push({ type: 'occupations', data: item }));
      });
    } else if (activeTab === 'skills') {
      skillsData?.pages.forEach((page) => {
        page.data.forEach((item) => result.push({ type: 'skills', data: item }));
      });
    } else if (activeTab === 'refs') {
      refsData?.pages.forEach((page) => {
        page.data.forEach((item) => result.push({ type: 'refs', data: item }));
      });
    } else if (activeTab === 'schools') {
      schoolsData?.pages.forEach((page) => {
        page.data.forEach((item) => result.push({ type: 'schools', data: item }));
      });
    } else if (activeTab === 'programs') {
      programsData?.pages.forEach((page) => {
        page.data.forEach((item) => result.push({ type: 'programs', data: item }));
      });
    }

    return result;
  }, [activeTab, companiesData, factoriesData, occupationsData, skillsData, refsData, schoolsData, programsData]);

  // Total items for "All" tab
  const totalGroupedItems = useMemo(() =>
    groupedItems.companies.length +
    groupedItems.factories.length +
    groupedItems.occupations.length +
    groupedItems.skills.length +
    groupedItems.refs.length +
    groupedItems.schools.length +
    groupedItems.programs.length,
  [groupedItems]);

  // Loading states - check specific tab
  const isLoadingCurrentTab = useMemo(() => {
    if (activeTab === 'all') {
      // For "all" tab, show loading if any query is doing initial load
      return isLoadingCompanies || isLoadingFactories || isLoadingOccupations || isLoadingSkills || isLoadingRefs || isLoadingSchools || isLoadingPrograms;
    }
    // For specific tabs, check that tab's loading state
    switch (activeTab) {
      case 'companies': return isLoadingCompanies;
      case 'factories': return isLoadingFactories;
      case 'occupations': return isLoadingOccupations;
      case 'skills': return isLoadingSkills;
      case 'refs': return isLoadingRefs;
      case 'schools': return isLoadingSchools;
      case 'programs': return isLoadingPrograms;
      default: return false;
    }
  }, [activeTab, isLoadingCompanies, isLoadingFactories, isLoadingOccupations, isLoadingSkills, isLoadingRefs, isLoadingSchools, isLoadingPrograms]);

  // Check if we're fetching (for background indicator)
  const isFetchingCurrentTab = useMemo(() => {
    if (activeTab === 'all') {
      return isFetchingCompanies || isFetchingFactories || isFetchingOccupations || isFetchingSkills || isFetchingRefs || isFetchingSchools || isFetchingPrograms;
    }
    switch (activeTab) {
      case 'companies': return isFetchingCompanies;
      case 'factories': return isFetchingFactories;
      case 'occupations': return isFetchingOccupations;
      case 'skills': return isFetchingSkills;
      case 'refs': return isFetchingRefs;
      case 'schools': return isFetchingSchools;
      case 'programs': return isFetchingPrograms;
      default: return false;
    }
  }, [activeTab, isFetchingCompanies, isFetchingFactories, isFetchingOccupations, isFetchingSkills, isFetchingRefs, isFetchingSchools, isFetchingPrograms]);

  // Has more for current tab
  const hasMore = useMemo(() => {
    switch (activeTab) {
      case 'all': return hasNextCompanies || hasNextFactories || hasNextOccupations || hasNextSkills || hasNextRefs || hasNextSchools || hasNextPrograms;
      case 'companies': return hasNextCompanies;
      case 'factories': return hasNextFactories;
      case 'occupations': return hasNextOccupations;
      case 'skills': return hasNextSkills;
      case 'refs': return hasNextRefs;
      case 'schools': return hasNextSchools;
      case 'programs': return hasNextPrograms;
      default: return false;
    }
  }, [activeTab, hasNextCompanies, hasNextFactories, hasNextOccupations, hasNextSkills, hasNextRefs, hasNextSchools, hasNextPrograms]);

  const loadMore = useCallback(() => {
    switch (activeTab) {
      case 'companies':
        if (hasNextCompanies) fetchNextCompanies();
        break;
      case 'factories':
        if (hasNextFactories) fetchNextFactories();
        break;
      case 'occupations':
        if (hasNextOccupations) fetchNextOccupations();
        break;
      case 'skills':
        if (hasNextSkills) fetchNextSkills();
        break;
      case 'refs':
        if (hasNextRefs) fetchNextRefs();
        break;
      case 'schools':
        if (hasNextSchools) fetchNextSchools();
        break;
      case 'programs':
        if (hasNextPrograms) fetchNextPrograms();
        break;
    }
  }, [activeTab, hasNextCompanies, hasNextFactories, hasNextOccupations, hasNextSkills, hasNextRefs, hasNextSchools, hasNextPrograms, fetchNextCompanies, fetchNextFactories, fetchNextOccupations, fetchNextSkills, fetchNextRefs, fetchNextSchools, fetchNextPrograms]);

  const getTabCount = (tab: TabType): number => {
    if (!counts) return 0;
    if (tab === 'all') return counts.total;
    return counts[tab] ?? 0;
  };

  // Memoized load more callbacks for sections
  const loadMoreCompanies = useCallback(() => {
    if (hasNextCompanies) fetchNextCompanies();
  }, [hasNextCompanies, fetchNextCompanies]);

  const loadMoreFactories = useCallback(() => {
    if (hasNextFactories) fetchNextFactories();
  }, [hasNextFactories, fetchNextFactories]);

  const loadMoreOccupations = useCallback(() => {
    if (hasNextOccupations) fetchNextOccupations();
  }, [hasNextOccupations, fetchNextOccupations]);

  const loadMoreSkills = useCallback(() => {
    if (hasNextSkills) fetchNextSkills();
  }, [hasNextSkills, fetchNextSkills]);

  const loadMoreRefs = useCallback(() => {
    if (hasNextRefs) fetchNextRefs();
  }, [hasNextRefs, fetchNextRefs]);

  const loadMoreSchools = useCallback(() => {
    if (hasNextSchools) fetchNextSchools();
  }, [hasNextSchools, fetchNextSchools]);

  const loadMorePrograms = useCallback(() => {
    if (hasNextPrograms) fetchNextPrograms();
  }, [hasNextPrograms, fetchNextPrograms]);

  return (
    <PageContainer>
      <PageHeader
        title="Node Explorer"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Browse all entities or press
            <kbd className="inline-flex items-center gap-0.5 rounded border border-border-subtle bg-bg-surface px-2 py-1 text-xs text-fg-soft">
              <span className="text-[10px]">&#8984;</span>K
            </kbd>
            to search.
          </span>
        }
        actions={
          isFetchingCurrentTab && !isLoadingCurrentTab ? (
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <Loader2 className="w-3 h-3 animate-spin" />
              Syncing...
            </div>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2 p-1 bg-bg-surface rounded-xl border border-border-subtle">
          {TABS.map(({ id, label, icon: Icon, color }) => {
            const isActive = activeTab === id;
            const count = getTabCount(id);

            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium
                  transition-all
                  ${isActive
                    ? 'bg-bg-elevated text-fg-default shadow-sm'
                    : 'text-fg-muted hover:text-fg-default hover:bg-bg-elevated/50'
                  }
                `}
              >
                <Icon className={`w-4 h-4 ${isActive ? color : ''}`} />
                <span>{label}</span>
                {count > 0 && (
                  <span
                    className={`
                      ml-1 px-2 py-0.5 rounded-full text-xs
                      ${isActive
                        ? 'bg-bg-surface text-fg-muted'
                        : 'bg-bg-elevated text-fg-soft'
                      }
                    `}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Bar */}
      {activeTab !== 'all' && activeTab !== 'persons' && (
        <div className="mb-6">
          <FilterBar
            activeTab={activeTab as BrowsableEntityType}
            sortValue={sortValue}
            onSortChange={setSortValue}
            filters={filters}
            onFilterChange={setFilters}
            industries={industries}
            categories={categories}
          />
        </div>
      )}

      {/* Results */}
      {isLoadingCurrentTab ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-fg-muted animate-spin" />
        </div>
      ) : activeTab === 'all' ? (
        // Grouped view for "All" tab with virtualized sections
        totalGroupedItems === 0 ? (
          <div className="text-center py-20">
            <Search className="w-12 h-12 text-fg-soft mx-auto mb-3" />
            <p className="text-fg-muted mb-2">No entities found</p>
            <p className="text-sm text-fg-soft">
              Import data to start building your knowledge graph.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            <OverviewSection
              type="companies"
              items={groupedItems.companies}
              hasMore={hasNextCompanies ?? false}
              isLoadingMore={isFetchingNextCompanies}
              onLoadMore={loadMoreCompanies}
              totalCount={counts?.companies ?? groupedItems.companies.length}
            />
            <OverviewSection
              type="factories"
              items={groupedItems.factories}
              hasMore={hasNextFactories ?? false}
              isLoadingMore={isFetchingNextFactories}
              onLoadMore={loadMoreFactories}
              totalCount={counts?.factories ?? groupedItems.factories.length}
            />
            <OverviewSection
              type="occupations"
              items={groupedItems.occupations}
              hasMore={hasNextOccupations ?? false}
              isLoadingMore={isFetchingNextOccupations}
              onLoadMore={loadMoreOccupations}
              totalCount={counts?.occupations ?? groupedItems.occupations.length}
            />
            <OverviewSection
              type="skills"
              items={groupedItems.skills}
              hasMore={hasNextSkills ?? false}
              isLoadingMore={isFetchingNextSkills}
              onLoadMore={loadMoreSkills}
              totalCount={counts?.skills ?? groupedItems.skills.length}
            />
            <OverviewSection
              type="refs"
              items={groupedItems.refs}
              hasMore={hasNextRefs ?? false}
              isLoadingMore={isFetchingNextRefs}
              onLoadMore={loadMoreRefs}
              totalCount={counts?.refs ?? groupedItems.refs.length}
            />
            <OverviewSection
              type="schools"
              items={groupedItems.schools}
              hasMore={hasNextSchools ?? false}
              isLoadingMore={isFetchingNextSchools}
              onLoadMore={loadMoreSchools}
              totalCount={counts?.schools ?? groupedItems.schools.length}
            />
            <OverviewSection
              type="programs"
              items={groupedItems.programs}
              hasMore={hasNextPrograms ?? false}
              isLoadingMore={isFetchingNextPrograms}
              onLoadMore={loadMorePrograms}
              totalCount={counts?.programs ?? groupedItems.programs.length}
            />
          </div>
        )
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <Search className="w-12 h-12 text-fg-soft mx-auto mb-3" />
          <p className="text-fg-muted mb-2">No {activeTab} found</p>
          <p className="text-sm text-fg-soft">
            Import data to start building your knowledge graph.
          </p>
        </div>
      ) : (
        // Virtualized grid for single entity type tabs
        <VirtualizedGrid
          items={items}
          hasMore={hasMore}
          isLoadingMore={
            activeTab === 'companies' ? isFetchingNextCompanies :
            activeTab === 'factories' ? isFetchingNextFactories :
            activeTab === 'occupations' ? isFetchingNextOccupations :
            activeTab === 'skills' ? isFetchingNextSkills :
            activeTab === 'refs' ? isFetchingNextRefs :
            activeTab === 'schools' ? isFetchingNextSchools :
            activeTab === 'programs' ? isFetchingNextPrograms :
            false
          }
          onLoadMore={loadMore}
        />
      )}
    </PageContainer>
  );
}
