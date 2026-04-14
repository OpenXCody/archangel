import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Building2, Factory, Briefcase, Wrench, Loader2, Layers, Search, ChevronDown } from 'lucide-react';
import {
  companiesApi,
  factoriesApi,
  occupationsApi,
  skillsApi,
  statsApi,
  type EntityType,
  type Company,
  type Factory as FactoryType,
  type Occupation,
  type Skill,
} from '../lib/api';
import EntityCard from '../components/explorer/EntityCard';

type TabType = 'all' | EntityType;

const TABS: { id: TabType; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'all', label: 'All', icon: Layers, color: 'text-fg-muted' },
  { id: 'companies', label: 'Companies', icon: Building2, color: 'text-amber-500' },
  { id: 'factories', label: 'Factories', icon: Factory, color: 'text-sky-400' },
  { id: 'occupations', label: 'Occupations', icon: Briefcase, color: 'text-violet-400' },
  { id: 'skills', label: 'Skills', icon: Wrench, color: 'text-emerald-500' },
];

const SECTION_CONFIG: Record<EntityType, {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string
}> = {
  companies: { label: 'Companies', icon: Building2, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  factories: { label: 'Factories', icon: Factory, color: 'text-sky-400', bgColor: 'bg-sky-400/10' },
  occupations: { label: 'Occupations', icon: Briefcase, color: 'text-violet-400', bgColor: 'bg-violet-400/10' },
  skills: { label: 'Skills', icon: Wrench, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
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

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabType) || 'all';

  // Fetch entity counts for tab badges
  const { data: counts } = useQuery({
    queryKey: ['entity-counts'],
    queryFn: statsApi.counts,
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

  // Companies query - offset-based pagination
  const {
    data: companiesData,
    fetchNextPage: fetchNextCompanies,
    hasNextPage: hasNextCompanies,
    isFetchingNextPage: isFetchingNextCompanies,
    isLoading: isLoadingCompanies,
    isFetching: isFetchingCompanies,
  } = useInfiniteQuery({
    queryKey: ['explore-companies'],
    queryFn: ({ pageParam = 0 }) =>
      companiesApi.list({ offset: pageParam, limit: PAGE_SIZE }),
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
    queryKey: ['explore-factories'],
    queryFn: ({ pageParam = 0 }) =>
      factoriesApi.list({ offset: pageParam, limit: PAGE_SIZE }),
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
    queryKey: ['explore-occupations'],
    queryFn: ({ pageParam = 0 }) =>
      occupationsApi.list({ offset: pageParam, limit: PAGE_SIZE }),
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
    queryKey: ['explore-skills'],
    queryFn: ({ pageParam = 0 }) =>
      skillsApi.list({ offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
    staleTime: 1000 * 60 * 5,
    enabled: activeTab === 'all' || activeTab === 'skills',
  });

  // Grouped data for "All" tab
  const groupedItems = useMemo(() => ({
    companies: companiesData?.pages.flatMap(p => p.data) ?? [],
    factories: factoriesData?.pages.flatMap(p => p.data) ?? [],
    occupations: occupationsData?.pages.flatMap(p => p.data) ?? [],
    skills: skillsData?.pages.flatMap(p => p.data) ?? [],
  }), [companiesData, factoriesData, occupationsData, skillsData]);

  // Combine data for single entity type tabs
  const items = useMemo(() => {
    type TaggedEntity =
      | { type: 'companies'; data: Company }
      | { type: 'factories'; data: FactoryType }
      | { type: 'occupations'; data: Occupation }
      | { type: 'skills'; data: Skill };

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
    }

    return result;
  }, [activeTab, companiesData, factoriesData, occupationsData, skillsData]);

  // Total items for "All" tab
  const totalGroupedItems = useMemo(() =>
    groupedItems.companies.length +
    groupedItems.factories.length +
    groupedItems.occupations.length +
    groupedItems.skills.length,
  [groupedItems]);

  // Loading states - check specific tab
  const isLoadingCurrentTab = useMemo(() => {
    if (activeTab === 'all') {
      // For "all" tab, show loading if any query is doing initial load
      return isLoadingCompanies || isLoadingFactories || isLoadingOccupations || isLoadingSkills;
    }
    // For specific tabs, check that tab's loading state
    switch (activeTab) {
      case 'companies': return isLoadingCompanies;
      case 'factories': return isLoadingFactories;
      case 'occupations': return isLoadingOccupations;
      case 'skills': return isLoadingSkills;
      default: return false;
    }
  }, [activeTab, isLoadingCompanies, isLoadingFactories, isLoadingOccupations, isLoadingSkills]);

  // Check if we're fetching (for background indicator)
  const isFetchingCurrentTab = useMemo(() => {
    if (activeTab === 'all') {
      return isFetchingCompanies || isFetchingFactories || isFetchingOccupations || isFetchingSkills;
    }
    switch (activeTab) {
      case 'companies': return isFetchingCompanies;
      case 'factories': return isFetchingFactories;
      case 'occupations': return isFetchingOccupations;
      case 'skills': return isFetchingSkills;
      default: return false;
    }
  }, [activeTab, isFetchingCompanies, isFetchingFactories, isFetchingOccupations, isFetchingSkills]);

  // Has more for current tab
  const hasMore = useMemo(() => {
    switch (activeTab) {
      case 'all': return hasNextCompanies || hasNextFactories || hasNextOccupations || hasNextSkills;
      case 'companies': return hasNextCompanies;
      case 'factories': return hasNextFactories;
      case 'occupations': return hasNextOccupations;
      case 'skills': return hasNextSkills;
      default: return false;
    }
  }, [activeTab, hasNextCompanies, hasNextFactories, hasNextOccupations, hasNextSkills]);

  const loadMore = () => {
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
    }
  };

  const getTabCount = (tab: TabType): number => {
    if (!counts) return 0;
    if (tab === 'all') return counts.total;
    return counts[tab] ?? 0;
  };

  // Render section with header and Load More
  const renderSection = (
    type: EntityType,
    items: (Company | FactoryType | Occupation | Skill)[],
    hasMore: boolean,
    isLoadingMore: boolean,
    onLoadMore: () => void
  ) => {
    if (items.length === 0) return null;

    const config = SECTION_CONFIG[type];
    const Icon = config.icon;
    const totalCount = counts?.[type] ?? items.length;

    return (
      <section key={type}>
        {/* Section Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.bgColor}`}>
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>
            <div>
              <h2 className="text-base font-medium text-fg-default">{config.label}</h2>
              <p className="text-xs text-fg-muted">
                {items.length} of {totalCount} loaded
              </p>
            </div>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <EntityCard key={item.id} type={type} data={item} />
          ))}
        </div>

        {/* Per-Section Load More */}
        {hasMore && (
          <div className="flex justify-center mt-4">
            <LoadMoreButton
              onClick={onLoadMore}
              isLoading={isLoadingMore}
              hasMore={hasMore}
              compact
            />
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header with search hint */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-fg-default mb-2">Node Explorer</h1>
            <p className="text-fg-muted flex items-center gap-2">
              Browse all entities or press
              <kbd className="inline-flex items-center gap-0.5 px-2 py-1 bg-bg-surface border border-border-subtle rounded text-xs text-fg-soft">
                <span className="text-[10px]">&#8984;</span>K
              </kbd>
              to search.
            </p>
          </div>
          {/* Background fetch indicator */}
          {isFetchingCurrentTab && !isLoadingCurrentTab && (
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <Loader2 className="w-3 h-3 animate-spin" />
              Syncing...
            </div>
          )}
        </div>
      </div>

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

      {/* Results */}
      {isLoadingCurrentTab ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-fg-muted animate-spin" />
        </div>
      ) : activeTab === 'all' ? (
        // Grouped view for "All" tab
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
            {renderSection(
              'companies',
              groupedItems.companies,
              hasNextCompanies ?? false,
              isFetchingNextCompanies,
              () => fetchNextCompanies()
            )}
            {renderSection(
              'factories',
              groupedItems.factories,
              hasNextFactories ?? false,
              isFetchingNextFactories,
              () => fetchNextFactories()
            )}
            {renderSection(
              'occupations',
              groupedItems.occupations,
              hasNextOccupations ?? false,
              isFetchingNextOccupations,
              () => fetchNextOccupations()
            )}
            {renderSection(
              'skills',
              groupedItems.skills,
              hasNextSkills ?? false,
              isFetchingNextSkills,
              () => fetchNextSkills()
            )}
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
        <>
          {/* Grid for single entity type tabs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <EntityCard
                key={`${item.type}-${item.data.id}`}
                type={item.type}
                data={item.data}
              />
            ))}
          </div>

          {/* Load More at bottom */}
          {hasMore && (
            <div className="flex justify-center mt-8">
              <LoadMoreButton
                onClick={loadMore}
                isLoading={
                  activeTab === 'companies' ? isFetchingNextCompanies :
                  activeTab === 'factories' ? isFetchingNextFactories :
                  activeTab === 'occupations' ? isFetchingNextOccupations :
                  isFetchingNextSkills
                }
                hasMore={hasMore}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
