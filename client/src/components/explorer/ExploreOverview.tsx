import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import {
  exploreApi,
  type ExploreArea,
  type ExploreCareer,
  type ExploreEmployer,
  type ExploreIndustry,
  type ExploreOverview as Overview,
  type ExploreSkillGroup,
  type ExploreState,
} from '../../lib/api';
import { formatCompanyName } from '@shared/displayName';
import { FOCUS_AREAS } from '@shared/scope';
import { industryLabel } from '@shared/industry';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PageSection } from '../layout/Page';
import { LoadError } from '../account/parts';
import CompanyLogo from '../CompanyLogo';
import { exploreHref } from './ExploreNav';
import { SEARCH_SHORTCUT } from '../../lib/shortcut';

/** Industry value the bulk import stamped on nearly every company; it says nothing. */
const GENERIC_INDUSTRY = 'manufacturing';

const STAGE_NAME: Record<1 | 2 | 3, string> = { 1: 'Introduction', 2: 'Fundamentals', 3: 'Advanced' };

const count = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';
const TILE = cn(
  'group flex min-w-0 rounded-xl border border-border-subtle bg-bg-surface transition-colors',
  'hover:border-border-strong hover:bg-bg-elevated',
  FOCUS
);
const SECTION = 'mb-14 sm:mb-20';
/** The overview's section headings sit a step above the house section heading. */
const heading = (text: string) => <span className="text-xl tracking-tight sm:text-2xl">{text}</span>;
const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft';
/** A row in a typographic list: a full-width link, tall enough to tap. */
const LIST_ROW = cn(
  'group flex min-h-11 items-baseline justify-between gap-4 py-2.5 text-[15px] leading-snug sm:min-h-0 sm:py-1.5',
  FOCUS
);

function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        '-my-3 inline-flex min-h-11 items-center text-sm text-fg-muted underline-offset-4 transition-colors hover:text-fg-default hover:underline',
        FOCUS
      )}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Search: a field-sized button. The search itself is the global one.
// ---------------------------------------------------------------------------

/** Opens the global search the way its keyboard shortcut does (Layout listens for it). */
function openGlobalSearch() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
}

function SearchField() {
  return (
    <button
      type="button"
      onClick={openGlobalSearch}
      aria-label="Search companies, careers, skills"
      className={cn(
        'flex h-14 w-full max-w-2xl items-center gap-3 rounded-xl border border-border-subtle bg-bg-surface px-4 text-left transition-colors sm:h-16 sm:px-5',
        'hover:border-border-strong',
        'mb-12 mt-6 sm:mb-16 sm:mt-10',
        FOCUS
      )}
    >
      <Search className="h-5 w-5 shrink-0 text-fg-soft" />
      <span className="min-w-0 flex-1 truncate text-base text-fg-soft sm:text-lg">Companies, careers, skills</span>
      <kbd className="hidden shrink-0 items-center gap-0.5 rounded-md bg-bg-elevated px-2 py-1 text-xs text-fg-soft sm:inline-flex">
        {SEARCH_SHORTCUT}
      </kbd>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Employers
// ---------------------------------------------------------------------------

function EmployerTile({ employer }: { employer: ExploreEmployer }) {
  const name = formatCompanyName(employer.name);
  const industry =
    employer.industry && employer.industry.trim().toLowerCase() !== GENERIC_INDUSTRY ? employer.industry : null;
  return (
    <Link to={`/companies/${employer.slug ?? employer.id}`} className={cn(TILE, 'flex-col p-4 sm:p-5')}>
      <CompanyLogo name={name} domain={employer.domain} size={48} className="rounded-lg" />
      <h3 className="mb-3 mt-4 line-clamp-2 break-words text-base font-semibold leading-snug text-fg-default sm:text-[17px]">
        {name}
      </h3>
      <p className="mt-auto text-sm text-fg-muted">
        <span className="whitespace-nowrap">{count(employer.siteCount, 'site', 'sites')}</span>
        {employer.stateCount > 0 && (
          <span className="whitespace-nowrap"> · {count(employer.stateCount, 'state', 'states')}</span>
        )}
      </p>
      {industry && <p className="mt-0.5 truncate text-sm text-fg-soft">{industry}</p>}
    </Link>
  );
}

function Employers({ employers }: { employers: ExploreEmployer[] }) {
  if (employers.length === 0) return null;
  return (
    <PageSection title={heading('Employers')} actions={<TextLink to={exploreHref('companies')}>All companies</TextLink>} className={SECTION}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {employers.map((employer) => (
          <EmployerTile key={employer.id} employer={employer} />
        ))}
      </div>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Industries
// ---------------------------------------------------------------------------

/**
 * The largest industries, each to its own page: by people employed where
 * the official figure is published, else by the plants listed.
 */
function Industries({ industries, year }: { industries: ExploreIndustry[]; year: number | null }) {
  if (industries.length === 0) return null;
  const byPeople = industries.every((industry) => industry.employment !== null);
  const rows = Math.ceil(industries.length / 2);
  return (
    <PageSection title={heading('Industries')} actions={<TextLink to="/industries">All industries</TextLink>} className={SECTION}>
      <h3 className={cn(EYEBROW, 'mb-1 border-b border-border-subtle pb-2.5 sm:mb-2')}>
        {byPeople ? `People employed${year ? `, ${year}` : ''}` : 'Plants'}
      </h3>
      {/* One column on a phone; from there, ranked down the first column, then down the second. */}
      <ul
        className="grid grid-cols-1 gap-x-12 sm:grid-flow-col sm:grid-cols-2"
        style={{ gridTemplateRows: `repeat(${rows}, auto)` }}
      >
        {industries.map((industry, i) => (
          // A phone lists the first six.
          <li key={industry.slug} className={cn('min-w-0', i >= 6 && 'hidden sm:block')}>
            <Link to={`/industries/${industry.slug}`} className={LIST_ROW}>
              <span className="min-w-0 truncate text-fg-default underline-offset-4 group-hover:underline">{industryLabel(industry.name)}</span>
              <span className="shrink-0 text-sm tabular-nums text-fg-soft">
                {(byPeople ? (industry.employment ?? 0) : industry.plants).toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Careers
// ---------------------------------------------------------------------------

function CareerCard({ career, className }: { career: ExploreCareer; className?: string }) {
  return (
    <Link to={`/occupations/${career.id}`} className={cn(TILE, 'flex-col p-5', className)}>
      <h3 className="truncate text-[17px] font-semibold leading-snug text-fg-default">{career.title}</h3>
      {career.description && <p className="mt-1 truncate text-sm text-fg-muted">{career.description}</p>}
      {/* The path: three stages down a rail, each with what it holds. */}
      <ol className="mt-5 space-y-3.5">
        {career.stages.map((stage, i) => (
          <li
            key={stage.stage}
            className={cn(
              'relative min-w-0 pl-5 before:absolute before:left-0 before:top-[5px] before:h-[7px] before:w-[7px] before:rounded-full before:bg-fg-soft',
              // The rail runs from this stage's mark to the next one's.
              i < career.stages.length - 1 &&
                'after:absolute after:-bottom-[17px] after:left-[3px] after:top-[14px] after:w-px after:bg-border-strong'
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn(EYEBROW, 'text-fg-muted')}>{STAGE_NAME[stage.stage]}</span>
              <span className="shrink-0 text-xs tabular-nums text-fg-soft">{count(stage.count, 'skill', 'skills')}</span>
            </div>
            {/* One line of whole names: a name that does not fit wraps out of sight instead of being cut. */}
            {stage.skills.length > 0 && (
              <p className="mt-1 flex h-5 flex-wrap gap-x-1.5 overflow-hidden text-sm leading-5 text-fg-soft">
                {stage.skills.map((name, n) => (
                  <span key={name} className={n === 0 ? 'min-w-0 max-w-full truncate' : 'whitespace-nowrap'}>
                    {n > 0 && <span className="mr-1.5">·</span>}
                    {name}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Link>
  );
}

function Careers({ careers }: { careers: ExploreCareer[] }) {
  if (careers.length === 0) return null;
  return (
    <PageSection title={heading('Careers')} actions={<TextLink to={exploreHref('occupations')}>All careers</TextLink>} className={SECTION}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {careers.map((career, i) => (
          // A phone shows six; two columns show an even eight.
          <CareerCard
            key={career.id}
            career={career}
            className={i >= 8 ? 'hidden lg:flex' : i >= 6 ? 'hidden sm:flex' : undefined}
          />
        ))}
      </div>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

function Skills({ groups }: { groups: ExploreSkillGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <PageSection title={heading('Skills')} actions={<TextLink to={exploreHref('skills')}>All skills</TextLink>} className={SECTION}>
      <div className="grid grid-cols-1 gap-x-12 gap-y-8 pt-1 sm:grid-cols-2 sm:gap-y-10 sm:pt-2 lg:grid-cols-3">
        {groups.map((group) => (
          <div key={group.category} className="min-w-0">
            <h3 className={cn(EYEBROW, 'mb-1 border-b border-border-subtle pb-2.5 sm:mb-2')}>{group.category}</h3>
            <ul>
              {group.skills.map((skill, i) => (
                // A phone lists the first four of each category.
                <li key={skill.id} className={i >= 4 ? 'hidden sm:block' : undefined}>
                  <Link to={`/skills/${skill.id}`} className={LIST_ROW}>
                    <span className="min-w-0 truncate text-fg-default underline-offset-4 group-hover:underline">{skill.name}</span>
                    <span className="shrink-0 text-sm tabular-nums text-fg-soft">
                      in {count(skill.careerCount, 'career', 'careers')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

type Ring = [number, number][];

/** Outer rings of a boundary's polygons, as [lng, lat] pairs. */
function outerRings(geojson: unknown): Ring[] {
  const rings: Ring[] = [];
  const features = (geojson as { features?: { geometry?: { type?: string; coordinates?: unknown } }[] })?.features ?? [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const polygons =
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    for (const polygon of polygons as Ring[][]) {
      if (Array.isArray(polygon?.[0])) rings.push(polygon[0]);
    }
  }
  return rings;
}

/**
 * A focus area's boundary, drawn as the map draws it: an outline in the one
 * accent. Nothing is drawn until the boundary has loaded, or if it cannot be.
 */
function AreaOutline({ areaId }: { areaId: string }) {
  const url = FOCUS_AREAS.find((area) => area.id === areaId)?.boundaryUrl;
  const { data } = useQuery({
    queryKey: ['area-boundary', url],
    queryFn: async (): Promise<unknown> => {
      const response = await fetch(url as string);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    enabled: Boolean(url),
    staleTime: Infinity,
    retry: false,
  });

  const path = useMemo(() => {
    const rings = outerRings(data);
    const points = rings.flat();
    if (points.length < 3) return null;
    const lats = points.map((p) => p[1]);
    const lngs = points.map((p) => p[0]);
    const north = Math.max(...lats);
    const south = Math.min(...lats);
    const west = Math.min(...lngs);
    // A degree of longitude is shorter than one of latitude away from the equator.
    const squeeze = Math.cos((((north + south) / 2) * Math.PI) / 180);
    const width = (Math.max(...lngs) - west) * squeeze;
    const height = north - south;
    const scale = 92 / Math.max(width, height);
    const dx = (100 - width * scale) / 2;
    const dy = (100 - height * scale) / 2;
    return rings
      .map(
        (ring) =>
          ring
            .map(([lng, lat], i) => {
              const x = (dx + (lng - west) * squeeze * scale).toFixed(1);
              const y = (dy + (north - lat) * scale).toFixed(1);
              return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
            })
            .join('') + 'Z'
      )
      .join('');
  }, [data]);

  // An area with no boundary to draw gives its room to the text.
  if (!url) return null;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-24 w-24 shrink-0 sm:h-28 sm:w-28">
      {path && (
        <path
          d={path}
          className="fill-info/10 stroke-info"
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function AreaTile({ area }: { area: ExploreArea }) {
  return (
    <Link to={`/map?area=${encodeURIComponent(area.id)}`} className={cn(TILE, 'items-center gap-4 p-5 sm:p-6')}>
      <div className="min-w-0 flex-1">
        <p className={EYEBROW}>Focus area</p>
        <h3 className="mt-2 text-xl font-semibold leading-snug text-fg-default sm:text-2xl">{area.name}</h3>
        {area.description && <p className="mt-1.5 text-sm text-fg-muted">{area.description}</p>}
        {area.factoryCount > 0 && (
          <p className="mt-4 text-sm tabular-nums text-fg-soft">{count(area.factoryCount, 'factory', 'factories')}</p>
        )}
      </div>
      <AreaOutline areaId={area.id} />
    </Link>
  );
}

function Places({ areas, states }: { areas: ExploreArea[]; states: ExploreState[] }) {
  if (areas.length === 0 && states.length === 0) return null;
  const rows = Math.ceil(states.length / 2);
  return (
    <PageSection title={heading('Places')} actions={<TextLink to="/map">Open the map</TextLink>} className={SECTION}>
      <div
        className={cn(
          'grid grid-cols-1 gap-x-12 gap-y-8',
          areas.length > 0 && states.length > 0 && 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'
        )}
      >
        {areas.length > 0 && (
          <div className="grid grid-cols-1 content-start gap-3 sm:gap-4">
            {areas.map((area) => (
              <AreaTile key={area.id} area={area} />
            ))}
          </div>
        )}
        {states.length > 0 && (
          <div className="min-w-0">
            <h3 className={cn(EYEBROW, 'mb-1 border-b border-border-subtle pb-2.5 sm:mb-2')}>Factories by state</h3>
            {/* Ranked down the first column, then down the second. */}
            <ul className="grid grid-flow-col grid-cols-2 gap-x-8 sm:gap-x-12" style={{ gridTemplateRows: `repeat(${rows}, auto)` }}>
              {states.map((state) => (
                <li key={state.code} className="min-w-0">
                  <Link to={`/map?state=${encodeURIComponent(state.code)}`} className={LIST_ROW}>
                    <span className="min-w-0 truncate text-fg-default underline-offset-4 group-hover:underline">{state.name}</span>
                    <span className="shrink-0 text-sm tabular-nums text-fg-soft">{state.factoryCount.toLocaleString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Loading: the same layout, empty
// ---------------------------------------------------------------------------

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      <Skeleton className="mb-4 h-3 w-32" />
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4" style={{ width: `${45 + ((i * 17) % 30)}%` }} />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <PageSection title={heading('Employers')} className={SECTION}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="rounded-xl border border-border-subtle bg-bg-surface p-4 sm:p-5">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <Skeleton className="mt-5 h-4 w-3/4" />
              <Skeleton className="mt-5 h-3 w-1/2" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </PageSection>
      <PageSection title={heading('Careers')} className={SECTION}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className={cn(
                'rounded-xl border border-border-subtle bg-bg-surface p-5',
                i >= 8 ? 'hidden lg:block' : i >= 6 ? 'hidden sm:block' : undefined
              )}
            >
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="mt-2.5 h-3 w-4/5" />
              <div className="mt-6 space-y-5 border-l border-border-subtle pl-4">
                {[0, 1, 2].map((stage) => (
                  <div key={stage}>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-3 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageSection>
      <PageSection title={heading('Skills')} className={SECTION}>
        <div className="grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <ListSkeleton key={i} rows={6} />
          ))}
        </div>
      </PageSection>
    </div>
  );
}

// ---------------------------------------------------------------------------

const isEmpty = (data: Overview) =>
  data.employers.length + data.careers.length + data.skillGroups.length + data.areas.length + data.states.length === 0;

export function useExploreOverview() {
  return useQuery<Overview>({
    queryKey: ['explore-overview'],
    queryFn: exploreApi.overview,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * What /explore opens on: the shape of what is here and places to start.
 * A section with nothing to show is left out.
 */
export default function ExploreOverview() {
  const overview = useExploreOverview();
  const data = overview.data;

  return (
    <>
      <SearchField />
      {data && isEmpty(data) ? (
        <EmptyState title="Nothing here yet" description="Companies, careers and skills appear here once they are imported." />
      ) : data ? (
        <>
          <Employers employers={data.employers} />
          <Industries industries={data.industries ?? []} year={data.industriesYear ?? null} />
          <Careers careers={data.careers} />
          <Skills groups={data.skillGroups} />
          <Places areas={data.areas} states={data.states} />
        </>
      ) : overview.isError ? (
        <LoadError error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      ) : (
        <OverviewSkeleton />
      )}
    </>
  );
}
