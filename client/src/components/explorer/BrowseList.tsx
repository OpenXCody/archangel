import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useWindowVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import {
  companiesApi,
  factoriesApi,
  occupationsApi,
  skillsApi,
  type PaginatedResponse,
} from '../../lib/api';
import { US_STATES, type StateCode } from '@shared/states';
import { industryByName, industryBySlug, industryLabel, industryPath } from '@shared/industry';
import { isServiceKey, serviceShortName } from '@shared/military';
import { Button } from '@/components/ui/button';
import { EmptyState } from '../layout/Page';
import { LoadError, outlineButtonClass } from '../account/parts';
import EntityRow, { EntityRowSkeleton, type BrowseEntity } from './EntityRow';
import FilterBar, { SKILLS_BY_DOMAIN, SORT_OPTIONS, type FilterState } from './FilterBar';
import SkillTree from './SkillTree';
import SkillsViewSwitch from './SkillsViewSwitch';
import type { BrowseTab } from './ExploreNav';
import { stateName } from '../../lib/places';
import { publicKeys } from '../../lib/queryKeys';
import { useExploreFacets, useTaxonomy } from '../../lib/queries';

const PAGE_SIZE = 20;

// A type alias, not an interface: the list functions take an open set of query parameters.
type ListParams = {
  offset: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  state?: string;
  industry?: string;
  domain?: string;
  group?: string;
  /** Careers: the military careers, all (`military`) or one service's (`service`). */
  military?: number;
  service?: string;
};

const LIST: Record<BrowseTab, (params: ListParams) => Promise<PaginatedResponse<BrowseEntity>>> = {
  companies: companiesApi.list,
  factories: factoriesApi.list,
  occupations: occupationsApi.list,
  skills: skillsApi.list,
};

/** What each list holds, in the words the tabs use. */
export const LIST_NOUN: Record<BrowseTab, [one: string, many: string]> = {
  companies: ['company', 'companies'],
  factories: ['plant', 'plants'],
  occupations: ['career', 'careers'],
  skills: ['skill', 'skills'],
};

/** "1 plant", "43,914 plants". */
export const counted = (n: number, [one, many]: [string, string]) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

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
                    className="inline-flex min-h-11 items-center text-sm text-text-1 underline transition-colors"
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
 * skill, filtered and sorted from the address (?state=, ?industry=, ?domain=,
 * ?group=, ?sort=), so a filtered list can be linked to and survives Back. Between the
 * filters and the rows is one line: how many the list holds, filters applied.
 * The Skills list opens as the taxonomy's tree (`SkillTree`): the Atlas as a
 * list, with the one switch between the two.
 */
export default function BrowseList({ tab }: { tab: BrowseTab }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const stateParam = searchParams.get('state');
  const industryParam = searchParams.get('industry');
  const domainParam = searchParams.get('domain');
  const groupParam = searchParams.get('group');
  // Careers: `?military=1` is the military careers, `?service=navy` one service's. Anything else is the civilian list.
  const serviceParam = searchParams.get('service');
  const militaryParam = searchParams.get('military');
  // An industry is one of the 21, by the name a plant carries or by its page's slug.
  // Anything else in the address (an old link's free text) is no filter at all.
  const industry = (industryByName(industryParam) ?? industryBySlug(industryParam))?.name;
  const filters: FilterState = useMemo(
    () => ({
      state: tab === 'factories' && isStateCode(stateParam) ? stateParam : undefined,
      industry: tab === 'companies' || tab === 'factories' ? industry : undefined,
      // Skills are narrowed to a domain and then a group; careers to the domain that is their home.
      domain: (tab === 'skills' || tab === 'occupations') && domainParam ? domainParam : undefined,
      group: tab === 'skills' && groupParam ? groupParam : undefined,
      military: tab !== 'occupations' ? undefined : isServiceKey(serviceParam) ? serviceParam : militaryParam === '1' ? 'all' : undefined,
    }),
    [tab, stateParam, industry, domainParam, groupParam, serviceParam, militaryParam]
  );
  const filtered = Boolean(filters.state || filters.industry || filters.domain || filters.group || filters.military);

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
      ...(filters.domain && { domain: filters.domain }),
      ...(filters.group && { group: filters.group }),
      ...(filters.military === 'all' ? { military: 1 } : filters.military ? { service: filters.military } : {}),
    }),
    [sort, filters]
  );

  // The Skills list opens in the taxonomy's own order, which is not a sort of
  // rows but the tree itself: every domain, its groups, their skills, from the
  // one answer the Atlas draws.
  const tree = tab === 'skills' && sort.value === SKILLS_BY_DOMAIN;
  // Choices for the industry, domain and group filters: every value in use,
  // not just those on the first page of a list.
  const facets = useExploreFacets();
  // A group the filter does not offer (only military careers use its skills) is reached by its own link: the
  // taxonomy names it, so the filter can say what the list is narrowed to.
  const groupOffered = facets.data?.skillDomains.some((domain) => domain.groups.some((group) => group.slug === filters.group));
  const groupByLink = tab === 'skills' && Boolean(filters.group) && Boolean(facets.data) && !groupOffered;
  const taxonomy = useTaxonomy(tree || groupByLink);
  const treeDomains = useMemo(() => {
    if (!tree || !taxonomy.data) return undefined;
    return taxonomy.data.domains
      .filter((domain) => !filters.domain || domain.slug === filters.domain)
      .map((domain) => ({
        ...domain,
        groups: domain.groups
          .filter((group) => !filters.group || group.slug === filters.group)
          // The list is of skills a civilian career uses, or none yet, as its other orders are (GET /api/skills):
          // a skill only military careers use is listed when the list is narrowed to its group, and not before.
          .map((group) => (filters.group ? group : { ...group, skills: group.skills.filter((skill) => skill.careers > 0 || !skill.militaryCareers) }))
          .filter((group) => group.skills.length > 0),
      }))
      .filter((domain) => domain.groups.length > 0);
  }, [tree, taxonomy.data, filters.domain, filters.group]);
  const treeTotal = treeDomains?.reduce((sum, domain) => sum + domain.groups.reduce((n, group) => n + group.skills.length, 0), 0);

  const list = useInfiniteQuery({
    queryKey: publicKeys.exploreList(tab, params),
    queryFn: ({ pageParam }) => LIST[tab]({ offset: pageParam, limit: PAGE_SIZE, ...params }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined),
    staleTime: 5 * 60_000,
    enabled: !tree,
  });

  // Of the 21: those some plant carries, or those that are some company's industry.
  const industries = tab === 'factories' ? facets.data?.factoryIndustries : (facets.data?.industries?.companies ?? facets.data?.factoryIndustries);
  const taxonomyDomains = taxonomy.data?.domains;
  const domains = useMemo(() => {
    const found = facets.data;
    if (!found) return undefined;
    if (tab === 'occupations') {
      if (!filters.military) return found.careerDomains;
      // Narrowed to one service, only the homes that service has a career in: no choice leads to an empty list.
      const service = filters.military === 'all' ? null : filters.military;
      if (!found.militaryCareerDomains) return found.careerDomains;
      return found.militaryCareerDomains.filter((domain) => !service || !domain.services || domain.services.includes(service));
    }
    if (!groupByLink) return found.skillDomains;
    const home = taxonomyDomains?.find((domain) => domain.groups.some((group) => group.slug === filters.group));
    const group = home?.groups.find((each) => each.slug === filters.group);
    if (!home || !group) return found.skillDomains;
    const named = { slug: group.slug, name: group.name };
    return found.skillDomains.some((domain) => domain.slug === home.slug)
      ? found.skillDomains.map((domain) => (domain.slug === home.slug ? { ...domain, groups: [...domain.groups, named] } : domain))
      : [...found.skillDomains, { slug: home.slug, name: home.name, groups: [named] }];
  }, [facets.data, tab, filters.military, filters.group, groupByLink, taxonomyDomains]);
  // What the count says is listed: careers, or the military ones, or one service's.
  const service = filters.military && filters.military !== 'all' ? serviceShortName(filters.military) : null;
  const noun: [string, string] = service ? [`${service} career`, `${service} careers`] : filters.military ? ['military career', 'military careers'] : LIST_NOUN[tab];

  const items = useMemo(() => {
    const rows = list.data?.pages.flatMap((page) => page.data) ?? [];
    // Careers narrowed to one domain: every row's home is the filter above them, so the rows do not repeat it.
    return tab === 'occupations' && filters.domain ? rows.map((row) => ({ ...row, home: null })) : rows;
  }, [list.data, tab, filters.domain]);
  const total = tree ? treeTotal : list.data?.pages[0]?.total;
  const failed = tree ? taxonomy.isError && !taxonomy.data : list.isError && items.length === 0;
  // Said under the page's heading, by the page.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const clearFilters = () => setParam({ state: undefined, industry: undefined, domain: undefined, group: undefined, military: undefined, service: undefined });
  const industryPage = tab === 'factories' ? industryPath(filters.industry, { state: filters.state }) : null;

  return (
    <>
      <FilterBar
        activeTab={tab}
        sortValue={sort.value}
        onSortChange={(value) => setParam({ sort: value === sortOptions[0].value ? undefined : value })}
        filters={filters}
        onFilterChange={(next) =>
          setParam({
            state: next.state,
            industry: next.industry,
            domain: next.domain,
            group: next.group,
            military: next.military === 'all' ? '1' : undefined,
            service: next.military && next.military !== 'all' ? next.military : undefined,
          })
        }
        industries={industries}
        domains={domains}
        leading={tab === 'skills' ? <SkillsViewSwitch current="list" domain={filters.domain} group={filters.group} /> : undefined}
      />

      {/* How many, with the filters applied; the line holds its place while the answer is on its way. */}
      {!failed && (
        <div className="mb-1 flex min-h-11 flex-wrap items-center justify-between gap-x-6 text-sm text-text-2 sm:mb-2 sm:min-h-9">
          <p role="status" className="tabular-nums" data-explore-count>
            {total === undefined ? (
              <span aria-hidden="true" className="inline-block h-3.5 w-28 animate-pulse rounded bg-surface align-middle" />
            ) : (
              counted(total, noun)
            )}
          </p>
          {/* Plants filtered to one industry: that industry has a page of its own, for the same state. */}
          {industryPage && filters.industry && (
            <Link to={industryPage} className="inline-flex min-h-11 items-center underline hover:text-text-1 sm:min-h-0">
              About {industryLabel(filters.industry)}
              {filters.state ? ` in ${stateName(filters.state)}` : ''}
            </Link>
          )}
        </div>
      )}

      {tree ? (
        taxonomy.isError && !taxonomy.data ? (
          <LoadError error={taxonomy.error} onRetry={() => void taxonomy.refetch()} retrying={taxonomy.isFetching} />
        ) : !treeDomains ? (
          <div className={GRID} aria-busy="true" aria-label="Loading">
            {Array.from({ length: 12 }, (_, i) => (
              <EntityRowSkeleton key={i} type="companies" index={i} />
            ))}
          </div>
        ) : treeDomains.length === 0 ? (
          <EmptyState
            title="No skills"
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
          <SkillTree domains={treeDomains} />
        )
      ) : list.isLoading ? (
        <div className={GRID} aria-busy="true" aria-label="Loading">
          {Array.from({ length: 12 }, (_, i) => (
            <EntityRowSkeleton key={i} type={tab} index={i} />
          ))}
        </div>
      ) : list.isError && items.length === 0 ? (
        <LoadError error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState
          title={`No ${LIST_NOUN[tab][1]}`}
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
