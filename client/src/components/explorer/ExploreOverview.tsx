import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  type ExploreArea,
  type ExploreCareer,
  type ExploreEmployer,
  type ExploreIndustry,
  type ExploreOverview as Overview,
  type ExploreSkillDomain,
  type ExploreState,
} from '../../lib/api';
import { formatCompanyName } from '@shared/displayName';
import { FOCUS_AREAS } from '@shared/scope';
import { industryLabel, shownIndustry } from '@shared/industry';
import { cn, companyFigure, focusRing, plural } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PageSection } from '../layout/Page';
import { LoadError } from '../account/parts';
import CompanyLogo from '../CompanyLogo';
import { exploreHref } from './ExploreNav';
import { LEVEL_NAME } from '../../lib/stages';
import { publicKeys } from '../../lib/queryKeys';
import { useExploreOverview } from '../../lib/queries';

const TILE = cn(
  'group flex min-w-0 rounded-xl border border-line bg-bg transition-colors',
  'hover:border-line-strong hover:bg-surface-hover',
  focusRing
);
const SECTION = 'mb-12 sm:mb-16';
const EYEBROW = 'text-[11px] font-medium uppercase tracking-[0.08em] text-text-2';
/** A row in a typographic list: a full-width link, tall enough to tap. */
const LIST_ROW = cn(
  'group flex min-h-11 items-baseline justify-between gap-4 py-2.5 text-[15px] leading-snug sm:min-h-0 sm:py-1.5',
  focusRing
);

function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn(
        '-my-3 inline-flex min-h-11 items-center text-sm text-text-2 transition-colors hover:text-text-1 hover:underline',
        focusRing
      )}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

function CompanyTile({ company, className }: { company: ExploreEmployer; className?: string }) {
  const name = formatCompanyName(company.name);
  // The industry most of its factories are in.
  const industry = shownIndustry(company.industry);
  return (
    <Link to={`/companies/${company.slug ?? company.id}`} className={cn(TILE, 'flex-col p-4 sm:p-5', className)}>
      <CompanyLogo name={name} domain={company.domain} size={40} />
      <h3 className="mt-4 line-clamp-2 break-words text-base font-semibold leading-snug text-text-1 sm:text-[17px]">
        {name}
      </h3>
      {/* Whole, on two lines if it takes them: half an industry's name says nothing. */}
      {industry && <p className="mt-1 line-clamp-2 text-xs leading-snug text-text-3">{industry}</p>}
      {/* Pinned to the foot, so the figures of a row of tiles sit on one line. */}
      <p className="mt-auto pt-3 text-sm text-text-2">
        <span className="whitespace-nowrap">{companyFigure({ people: company.people, openJobs: company.openJobs, factories: company.siteCount })}</span>
        {/* The two figures may part at the space between them, on the narrowest phones. */}
        {company.stateCount > 0 && ' '}
        {company.stateCount > 0 && (
          <span className="whitespace-nowrap">· {plural(company.stateCount, 'state', 'states')}</span>
        )}
      </p>
    </Link>
  );
}

/** The featured companies, in the order every list of companies has. */
function Companies({ companies }: { companies: ExploreEmployer[] }) {
  if (companies.length === 0) return null;
  return (
    <PageSection title="Companies" actions={<TextLink to={exploreHref('companies')}>All companies</TextLink>} className={SECTION}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {companies.map((company, i) => (
          // A phone shows six.
          <CompanyTile key={company.id} company={company} className={i >= 6 ? 'hidden sm:flex' : undefined} />
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
 * the official figure is published, else by the factories listed.
 */
function Industries({ industries, year }: { industries: ExploreIndustry[]; year: number | null }) {
  if (industries.length === 0) return null;
  const byPeople = industries.every((industry) => industry.employment !== null);
  const rows = Math.ceil(industries.length / 2);
  return (
    <PageSection title="Industries" actions={<TextLink to={exploreHref('industries')}>All industries</TextLink>} className={SECTION}>
      <h3 className={cn(EYEBROW, 'mb-1 border-b border-line pb-2.5 sm:mb-2')}>
        {byPeople ? `People employed${year ? `, ${year}` : ''}` : 'Factories'}
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
              <span className="min-w-0 truncate text-text-1 group-hover:underline">{industryLabel(industry.name)}</span>
              <span className="shrink-0 text-xs tabular-nums text-text-3">
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
      <h3 className="truncate text-[17px] font-semibold leading-snug text-text-1">{career.title}</h3>
      {career.description && <p className="mt-1 line-clamp-2 text-sm leading-snug text-text-2">{career.description}</p>}
      {/* The path: three levels down a rail, each with what it holds. (An answer cached before levels has none.) */}
      <ol className="mt-5 space-y-3.5">
        {(career.levels ?? []).map((level, i, levels) => (
          <li
            key={level.level}
            className={cn(
              'relative min-w-0 pl-5 before:absolute before:left-0 before:top-[5px] before:h-[7px] before:w-[7px] before:rounded-full before:bg-text-3',
              // The rail runs from this level's mark to the next one's.
              i < levels.length - 1 &&
                'after:absolute after:-bottom-[17px] after:left-[3px] after:top-[14px] after:w-px after:bg-line-strong'
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn(EYEBROW, 'text-text-2')}>{LEVEL_NAME[level.level]}</span>
              <span className="shrink-0 text-xs tabular-nums text-text-3">{plural(level.count, 'skill', 'skills')}</span>
            </div>
            {/* One line of whole names: a name that does not fit wraps out of sight instead of being cut. */}
            {level.skills.length > 0 && (
              <p className="mt-1 flex h-5 flex-wrap gap-x-1.5 overflow-hidden text-sm leading-5 text-text-3">
                {level.skills.map((name, n) => (
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
    <PageSection title="Careers" actions={<TextLink to={exploreHref('occupations')}>All careers</TextLink>} className={SECTION}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {careers.map((career, i) => (
          // A phone shows three; two columns show an even eight.
          <CareerCard
            key={career.id}
            career={career}
            className={i >= 8 ? 'hidden lg:flex' : i >= 3 ? 'hidden sm:flex' : undefined}
          />
        ))}
      </div>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** The skills the most careers use, under the domains careers draw on most. */
function Skills({ domains }: { domains: ExploreSkillDomain[] }) {
  if (domains.length === 0) return null;
  return (
    <PageSection
      title="Skills"
      // Every skill as a list, and as one drawing: the Atlas.
      actions={
        <span className="flex items-center gap-x-5">
          <TextLink to={exploreHref('atlas')}>Atlas</TextLink>
          <TextLink to={exploreHref('skills')}>All skills</TextLink>
        </span>
      }
      className={SECTION}
    >
      <div className="grid grid-cols-1 gap-x-12 gap-y-8 pt-1 sm:grid-cols-2 sm:gap-y-10 sm:pt-2 lg:grid-cols-3">
        {domains.map((domain, d) => (
          // A phone lists the first four domains.
          <div key={domain.slug} className={cn('min-w-0', d >= 4 && 'hidden sm:block')}>
            <h3 className={cn(EYEBROW, 'mb-1 border-b border-line pb-2.5 sm:mb-2')}>{domain.name}</h3>
            <ul>
              {domain.skills.map((skill, i) => (
                // A phone lists the first four of each domain.
                <li key={skill.id} className={i >= 4 ? 'hidden sm:block' : undefined}>
                  <Link to={`/skills/${skill.id}`} className={LIST_ROW}>
                    <span className="min-w-0 truncate text-text-1 group-hover:underline">{skill.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-text-3">
                      in {plural(skill.careerCount, 'career', 'careers')}
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
// Factories: where they are. Each place opens on the map; the list of every
// factory is the Factories tab.
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
    queryKey: publicKeys.areaBoundary(url),
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
          className="fill-accent/[0.06] stroke-accent"
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
        <h3 className="mt-2 text-xl font-semibold leading-snug text-text-1 sm:text-2xl">{area.name}</h3>
        {area.description && <p className="mt-1.5 text-sm text-text-2">{area.description}</p>}
        {area.factoryCount > 0 && (
          <p className="mt-4 text-xs tabular-nums text-text-3">{plural(area.factoryCount, 'factory', 'factories')}</p>
        )}
      </div>
      <AreaOutline areaId={area.id} />
    </Link>
  );
}

function Plants({ areas, states }: { areas: ExploreArea[]; states: ExploreState[] }) {
  if (areas.length === 0 && states.length === 0) return null;
  const rows = Math.ceil(states.length / 2);
  return (
    <PageSection title="Factories" actions={<TextLink to={exploreHref('factories')}>All factories</TextLink>} className={SECTION}>
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
            <h3 className={cn(EYEBROW, 'mb-1 border-b border-line pb-2.5 sm:mb-2')}>By state</h3>
            {/* Ranked down the first column, then down the second. */}
            <ul className="grid grid-flow-col grid-cols-2 gap-x-8 sm:gap-x-12" style={{ gridTemplateRows: `repeat(${rows}, auto)` }}>
              {states.map((state) => (
                <li key={state.code} className="min-w-0">
                  <Link to={`/map?state=${encodeURIComponent(state.code)}`} className={LIST_ROW}>
                    <span className="min-w-0 truncate text-text-1 group-hover:underline">{state.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-text-3">{state.factoryCount.toLocaleString()}</span>
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
      <PageSection title="Industries" className={SECTION}>
        <div className="grid grid-cols-1 gap-x-12 sm:grid-cols-2">
          <ListSkeleton rows={5} />
          <div className="hidden sm:block">
            <ListSkeleton rows={5} />
          </div>
        </div>
      </PageSection>
      <PageSection title="Companies" className={SECTION}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={cn('rounded-xl border border-line bg-bg p-4 sm:p-5', i >= 6 && 'hidden sm:block')}>
              <Skeleton className="h-12 w-12 rounded-lg" />
              <Skeleton className="mt-5 h-4 w-3/4" />
              <Skeleton className="mt-5 h-3 w-1/2" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </PageSection>
      <PageSection title="Careers" className={SECTION}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className={cn(
                'rounded-xl border border-line bg-bg p-5',
                i >= 8 ? 'hidden lg:block' : i >= 3 ? 'hidden sm:block' : undefined
              )}
            >
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="mt-2.5 h-3 w-4/5" />
              <div className="mt-6 space-y-5 border-l border-line pl-4">
                {[0, 1, 2].map((level) => (
                  <div key={level}>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-3 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageSection>
    </div>
  );
}

// ---------------------------------------------------------------------------

const isEmpty = (data: Overview) =>
  data.employers.length + data.careers.length + (data.skillDomains ?? []).length + data.areas.length + data.states.length === 0;

/**
 * What /explore opens on: the shape of what is here and places to start, one
 * section per tab, under the tab's word and in the tabs' order, each with the
 * one link to its tab. A section with nothing to show is left out.
 */
export default function ExploreOverview() {
  const overview = useExploreOverview();
  const data = overview.data;

  return (
    <div className="mt-8 sm:mt-10">
      {data && isEmpty(data) ? (
        <EmptyState title="Nothing here yet" description="Companies, careers and skills appear here once they are imported." />
      ) : data ? (
        <>
          {/* The tabs' words, in the tabs' order. */}
          <Industries industries={data.industries ?? []} year={data.industriesYear ?? null} />
          <Companies companies={data.employers} />
          <Plants areas={data.areas} states={data.states} />
          <Careers careers={data.careers} />
          <Skills domains={data.skillDomains ?? []} />
        </>
      ) : overview.isError ? (
        <LoadError error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      ) : (
        <OverviewSkeleton />
      )}
    </div>
  );
}
