import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import GoalButton from '../components/account/GoalButton';
import SkillStatusButton, { SkillHeldToggle } from '../components/account/SkillStatusButton';
import { ErrorNote } from '../components/account/parts';
import { signInPath, useAccount, useMySkills, type SkillStatus } from '../lib/account';
import { useMarkSkill, type SkillMark } from '../lib/seeker';
import { usePostJobLink, useSeekerTools, useViewer } from '../lib/viewer';
import { editPath, type RecordKind } from '../lib/records';
import { formatPay } from '../lib/jobFormat';
import {
  ArrowLeft,
  Loader2,
  Building2,
  Factory,
  Briefcase,
  Wrench,
  ChevronRight,
} from 'lucide-react';
import {
  companiesApi,
  factoriesApi,
  occupationsApi,
  skillsApi,
  type EntityType,
  type CompanyDetail,
  type FactoryDetail,
  type OccupationDetail,
  type RelatedSkill,
  type CareerJob,
  type SkillDetail,
} from '../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { industryByName, industryLabel, industryPath } from '@shared/industry';
import CompanyLogo from '../components/CompanyLogo';
import FootprintMap from '../components/FootprintMap';
import { CompanyFamily, CompanyStanding, PlantFacts, SourceList, peopleCount } from '../components/RecordFacts';
import { useMapStore } from '../stores/mapStore';
import { STATE_CODE_TO_NAME, type StateCode } from '@shared/states';
import { PageContainer, EmptyState } from '../components/layout/Page';

// Entity type configs - monochrome with entity accent colors only on icons
const ENTITY_CONFIG: Record<
  EntityType,
  {
    icon: React.ElementType;
    label: string;
    badgeClass: string;
    iconClass: string;
    borderClass: string;
  }
> = {
  companies: {
    icon: Building2,
    label: 'Company',
    badgeClass: 'bg-tint/5 text-fg-muted border-tint/10',
    iconClass: 'text-fg-muted',
    borderClass: 'border-tint/10',
  },
  factories: {
    icon: Factory,
    label: 'Factory',
    badgeClass: 'bg-tint/5 text-fg-muted border-tint/10',
    iconClass: 'text-fg-muted',
    borderClass: 'border-tint/10',
  },
  occupations: {
    icon: Briefcase,
    label: 'Career',
    badgeClass: 'bg-tint/5 text-fg-muted border-tint/10',
    iconClass: 'text-fg-muted',
    borderClass: 'border-tint/10',
  },
  skills: {
    icon: Wrench,
    label: 'Skill',
    badgeClass: 'bg-tint/5 text-fg-muted border-tint/10',
    iconClass: 'text-fg-muted',
    borderClass: 'border-tint/10',
  },
};

/** What Admin Tools calls each kind of record, for the Edit link an admin sees. */
const RECORD_KIND: Record<EntityType, RecordKind> = {
  companies: 'company',
  factories: 'factory',
  occupations: 'career',
  skills: 'skill',
};

/** The kind of record a page shows is the first part of its address: /companies/:id, /factories/:id and so on. */
function getEntityType(pathname: string): EntityType {
  if (pathname.startsWith('/factories')) return 'factories';
  if (pathname.startsWith('/occupations')) return 'occupations';
  if (pathname.startsWith('/skills')) return 'skills';
  return 'companies';
}

// Section component for related entities

/** Returns to wherever you came from (explorer tab, map, search); falls back to the entity's tab. */
function BackButton({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={() => (canGoBack ? navigate(-1) : navigate(fallback))}
      className="-my-2 mb-2 inline-flex min-h-11 items-center gap-2 pr-2 text-sm text-fg-muted hover:text-fg-default"
    >
      <ArrowLeft className="w-4 h-4" />
      Back
    </button>
  );
}

function Section({
  id: anchor,
  title,
  note,
  children,
}: {
  /** Anchor for deep links (#occupations). Defaults to a slug of the title; set it when the wording differs from the link. */
  id?: string;
  title: string;
  /** A quiet word beside the heading. A list says how long it is by being there, so there is no count. */
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = anchor ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return (
    <div id={id} className="mt-8 scroll-mt-20">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium text-fg-soft uppercase tracking-wider">{title}</h2>
        {note}
      </div>
      {children}
    </div>
  );
}

// Clickable pill for filtering - navigates to explore with filter
function FilterPill({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="
        inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm
        bg-tint/5 border border-tint/10 text-fg-muted
        transition-colors hover:bg-tint/10 hover:text-fg-default
      "
    >
      {children}
      <ChevronRight className="w-3 h-3" />
    </Link>
  );
}

// Mini card for related entities - glass morphism style
function RelatedCard({
  to,
  icon: Icon,
  iconClass,
  title,
  subtitle,
}: {
  to: string;
  icon: React.ElementType;
  iconClass: string;
  title: string;
  subtitle?: string | null;
}) {
  return (
    <Link
      to={to}
      className="
        group flex items-start gap-3 p-3 min-w-0
        bg-tint/[0.02] backdrop-blur-sm
        border border-tint/10 rounded-lg
        hover:bg-tint/[0.05] hover:border-tint/20
        transition-all duration-200
      "
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconClass}`} />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-fg-default truncate block">
          {title}
        </span>
        {subtitle && <p className="text-sm text-fg-soft truncate">{subtitle}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-fg-soft group-hover:text-fg-muted flex-shrink-0 mt-1" />
    </Link>
  );
}

// Company Detail View
/** How many sites are listed before "Show all". */
const SITES_SHOWN = 12;
const CAREERS_SHOWN = 8;

/** "ROUND ROCK" as "Round Rock": the source data shouts its city names. */
function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

/**
 * A company's page: who it is, where it is, whether it is hiring, and every
 * site. The footprint map is the picture of the company; the rest is text.
 */
function CompanyDetailView({ data }: { data: CompanyDetail }) {
  const navigate = useNavigate();
  const [showAllSites, setShowAllSites] = useState(false);
  const [showAllCareers, setShowAllCareers] = useState(false);
  const name = formatCompanyName(data.name);
  const sites = useMemo(() => data.factories ?? [], [data.factories]);
  const jobs = data.jobs ?? [];

  // Sites that can be placed, for the footprint and for framing them on the map.
  const placed = useMemo(
    () =>
      sites
        .map((site) => ({ site, latitude: parseFloat(site.latitude ?? ''), longitude: parseFloat(site.longitude ?? '') }))
        .filter((entry) => Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)),
    [sites]
  );

  // Sites per state, most first: "Texas 6 · California 2".
  const byState = useMemo(() => {
    const counts = new Map<string, number>();
    for (const site of sites) if (site.state) counts.set(site.state, (counts.get(site.state) ?? 0) + 1);
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count, name: STATE_CODE_TO_NAME[code as StateCode] ?? code }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [sites]);

  // Sites whose size is known come first, the largest first; the rest by state and name.
  const sortedSites = useMemo(
    () =>
      [...sites].sort(
        (a, b) =>
          (b.workforceSize ?? 0) - (a.workforceSize ?? 0) ||
          (a.state ?? 'ZZ').localeCompare(b.state ?? 'ZZ') ||
          formatFactoryName(a.name).localeCompare(formatFactoryName(b.name))
      ),
    [sites]
  );
  // People are counted at the sites that state a figure, and said so when that is not all of them.
  const sized = sites.filter((site) => (site.workforceSize ?? 0) > 0).length;
  const shownSites = showAllSites ? sortedSites : sortedSites.slice(0, SITES_SHOWN);

  // The industry most of the company's sites are classified in is a page of
  // its own; where the sites are all in one state, that state's page of it.
  const leadingIndustry = useMemo(() => {
    const counts = new Map<string, number>();
    for (const site of sites) if (industryByName(site.industry)) counts.set(site.industry as string, (counts.get(site.industry as string) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  }, [sites]);
  const industryPage = industryPath(leadingIndustry, { state: byState.length === 1 ? byState[0].code : null });
  // The company's own words for what it makes; where it has none (or only the
  // import's "Manufacturing"), the industry its sites are in.
  const ownIndustry = data.industry && data.industry.trim().toLowerCase() !== 'manufacturing' ? data.industry : null;
  const industries = ownIndustry ? [ownIndustry] : leadingIndustry ? [industryLabel(leadingIndustry)] : data.industry ? [data.industry] : [];
  const facts = [
    sites.length > 0 ? `${sites.length.toLocaleString()} ${sites.length === 1 ? 'site' : 'sites'}` : null,
    byState.length > 1 ? `${byState.length} states` : byState.length === 1 ? byState[0].name : null,
    (data.totalWorkforce ?? 0) > 0
      ? `${peopleCount(data.totalWorkforce ?? 0)}${sized > 0 && sized < sites.length ? ` at ${sized} ${sized === 1 ? 'site' : 'sites'}` : ''}`
      : null,
  ].filter(Boolean);

  // Show only this company's sites on the map, framed. The map reads both
  // from its store when it mounts.
  const openOnMap = () => {
    const store = useMapStore.getState();
    store.setFilters({ company: data.id, companyName: name, states: [] });
    if (placed.length > 0) {
      store.flyTo({ kind: 'points', points: placed.map((entry): [number, number] => [entry.longitude, entry.latitude]) });
    }
    navigate('/map');
  };

  return (
    <>
      {(facts.length > 0 || industries.length > 0) && (
        <p className="mt-4 text-sm text-fg-muted">
          {facts.join(' · ')}
          {facts.length > 0 && industries.length > 0 ? ' · ' : ''}
          {industries.map((industry, index) => (
            <span key={industry}>
              {index > 0 && ', '}
              <Link
                to={industryPage ?? `/explore?tab=companies&industry=${encodeURIComponent(industry)}`}
                className="underline-offset-4 hover:text-fg-default hover:underline"
              >
                {industry}
              </Link>
            </span>
          ))}
        </p>
      )}
      <CompanyStanding data={data} />

      {/* Footprint: where the sites are, and how many in each state */}
      {placed.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
          <div className="px-3 pt-4 sm:px-6 sm:pt-6">
            <FootprintMap
              points={placed.map((entry) => ({
                id: entry.site.id,
                latitude: entry.latitude,
                longitude: entry.longitude,
                label: formatFactoryName(entry.site.name),
              }))}
            />
          </div>
          <div className="flex flex-col gap-3 border-t border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="min-w-0 text-sm text-fg-muted">
              {byState.slice(0, 6).map((state, index) => (
                <span key={state.code}>
                  {index > 0 && ' · '}
                  <span className="text-fg-default">{state.name}</span> {state.count}
                </span>
              ))}
              {byState.length > 6 && ` · ${byState.length - 6} more`}
            </p>
            <button
              type="button"
              onClick={openOnMap}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-border-strong px-4 text-sm font-medium text-fg-default transition-colors hover:bg-bg-elevated"
            >
              Open on the map
            </button>
          </div>
        </div>
      )}

      {/* Open jobs: said only when there are some */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} empty="" showCareer />}

      {/* The companies that are part of this one */}
      {(data.subsidiaries?.length ?? 0) > 0 && (
        <Section id="companies" title="Companies">
          <CompanyFamily companies={data.subsidiaries ?? []} />
        </Section>
      )}

      {/* Every site: where it is and what it makes */}
      {sites.length > 0 && (
        <Section id="factories" title="Sites">
          <ul className="overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
            {shownSites.map((site) => {
              const place = [site.city ? titleCase(site.city) : null, site.state].filter(Boolean).join(', ');
              const detail = [
                place,
                site.status === 'under construction' ? 'Under construction' : null,
                site.workforceSize ? peopleCount(site.workforceSize) : null,
                site.products || (site.industry ? industryLabel(site.industry) : site.specialization),
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={site.id} className="border-b border-border-subtle last:border-b-0">
                  <Link
                    to={`/factories/${site.id}`}
                    className="group flex min-h-[56px] items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-bg-elevated"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg-default">{formatFactoryName(site.name)}</span>
                      {detail && <span className="block truncate text-xs text-fg-muted">{detail}</span>}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft group-hover:text-fg-default" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {sortedSites.length > SITES_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAllSites((value) => !value)}
              className="mt-3 text-sm font-medium text-fg-default underline underline-offset-4 hover:no-underline"
            >
              {showAllSites ? 'Show fewer' : `Show all ${sortedSites.length.toLocaleString()}`}
            </button>
          )}
        </Section>
      )}
      {/* Careers across this company's sites */}
      {(data.occupations?.length || 0) > 0 && (
        <Section id="occupations" title="Careers">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(showAllCareers ? data.occupations : data.occupations?.slice(0, CAREERS_SHOWN))?.map((occ) => (
              <RelatedCard
                key={occ.id}
                to={`/occupations/${occ.id}`}
                icon={Briefcase}
                iconClass="text-fg-muted"
                title={occ.title}
                subtitle={`${occ.factoryCount} ${occ.factoryCount === 1 ? 'site' : 'sites'}${occ.headcount ? ` · ${occ.headcount.toLocaleString()} people` : ''}`}
              />
            ))}
          </div>
          {(data.occupations?.length ?? 0) > CAREERS_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAllCareers((value) => !value)}
              className="mt-3 text-sm font-medium text-fg-default underline underline-offset-4 hover:no-underline"
            >
              {showAllCareers ? 'Show fewer' : `Show all ${data.occupations?.length.toLocaleString()}`}
            </button>
          )}
        </Section>
      )}

      <SourceList sources={data.sources} />
    </>
  );
}

// Factory Detail View
/**
 * A factory's page: where it is, who runs it, whether it is hiring, and the
 * company's other sites. The same story its panel on the map tells, with room
 * for all of it.
 */
function FactoryDetailView({ data }: { data: FactoryDetail }) {
  const [showAllCareers, setShowAllCareers] = useState(false);
  const company = data.company;
  const companyName = company ? formatCompanyName(company.name) : null;
  const place = [data.city ? titleCase(data.city) : null, data.state ? STATE_CODE_TO_NAME[data.state as StateCode] ?? data.state : null]
    .filter(Boolean)
    .join(', ');
  const industry = data.industry ? industryLabel(data.industry) : data.specialization;
  // The plant's industry is a page of its own, for the plant's state.
  const industryPage = industryPath(data.industry, { state: data.state });
  const underConstruction = data.status === 'under construction';
  const jobs = data.jobs ?? [];
  const nearby = useMemo(() => data.nearby ?? [], [data.nearby]);
  const latitude = parseFloat(data.latitude);
  const longitude = parseFloat(data.longitude);
  const located = Number.isFinite(latitude) && Number.isFinite(longitude);
  const siteCount = company?.siteCount ?? 0;
  const stateCount = company?.stateCount ?? 0;
  // A company whose one site this is, under the same name, would only repeat the heading.
  const companyIsThisSite =
    companyName !== null &&
    siteCount <= 1 &&
    !company?.description &&
    formatFactoryName(data.name).toLowerCase().startsWith(companyName.toLowerCase());

  // This site, marked, among the company's nearest others.
  const points = useMemo(
    () => [
      ...(located ? [{ id: data.id, latitude, longitude, label: formatFactoryName(data.name) }] : []),
      ...nearby
        .map((site) => ({ id: site.id, latitude: parseFloat(site.latitude), longitude: parseFloat(site.longitude), label: formatFactoryName(site.name) }))
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)),
    ],
    [data.id, data.name, located, latitude, longitude, nearby]
  );

  return (
    <>
      {(place || industry || underConstruction) && (
        <p className="mt-4 text-sm text-fg-muted">
          {place}
          {place && industry ? ' · ' : ''}
          {industry && industryPage ? (
            <Link to={industryPage} className="underline-offset-4 hover:text-fg-default hover:underline">
              {industry}
            </Link>
          ) : (
            industry
          )}
          {underConstruction ? `${place || industry ? ' · ' : ''}Under construction` : ''}
        </p>
      )}
      <PlantFacts factory={data} />

      {/* Where it is */}
      {located && (
        <div className="mt-6 overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
          <div className="px-3 pt-4 sm:px-6 sm:pt-6">
            <FootprintMap points={points} emphasis={data.id} className="mx-auto max-w-2xl" />
          </div>
          <div className="flex flex-col gap-3 border-t border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="min-w-0 text-sm text-fg-muted">
              {/* A curated plant's address was written by a person ("1530 FM 973") and is left as it is. */}
              {[data.address ? (data.curated ? data.address : titleCase(data.address)) : null, place].filter(Boolean).join(', ') || 'Location on record'}
            </p>
            <Link
              to={`/map?factory=${data.id}`}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-border-strong px-4 text-sm font-medium text-fg-default transition-colors hover:bg-bg-elevated"
            >
              Open on the map
            </Link>
          </div>
        </div>
      )}

      {/* Open jobs: said only when there are some */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} empty="" showCareer />}

      {/* Who runs it */}
      {company && companyName && !companyIsThisSite && (
        <Section title="Company">
          <Link
            to={`/companies/${company.slug ?? company.id}`}
            className="group flex items-start gap-4 rounded-xl border border-border-subtle bg-bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <CompanyLogo name={companyName} domain={company.domain} size={44} className="rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium text-fg-default">{companyName}</span>
              <span className="block text-sm text-fg-muted">
                {[
                  siteCount > 0 ? `${siteCount.toLocaleString()} ${siteCount === 1 ? 'site' : 'sites'}${stateCount > 1 ? ` in ${stateCount} states` : ''}` : null,
                  company.industry && company.industry !== 'Manufacturing' ? company.industry : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {company.description && <span className="mt-2 block text-sm leading-relaxed text-fg-muted">{company.description}</span>}
            </span>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-fg-soft group-hover:text-fg-default" />
          </Link>
        </Section>
      )}

      {/* The company's other sites, closest first */}
      {nearby.length > 0 && companyName && (
        <Section title={`Other ${companyName} sites`}>
          <ul className="overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
            {nearby.map((site) => (
              <li key={site.id} className="border-b border-border-subtle last:border-b-0">
                <Link
                  to={`/factories/${site.id}`}
                  className="group flex min-h-[56px] items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-bg-elevated"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg-default">{formatFactoryName(site.name)}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {[site.city ? titleCase(site.city) : null, site.state].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft group-hover:text-fg-default" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Careers recorded at this site */}
      {(data.occupations?.length ?? 0) === 0 && (data.typicalCareers?.length ?? 0) > 0 && (
        <Section id="occupations" title="Careers in this industry">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.typicalCareers?.map((career) => (
              <RelatedCard key={career.id} to={`/occupations/${career.id}`} icon={Briefcase} iconClass="text-fg-muted" title={career.title} />
            ))}
          </div>
        </Section>
      )}

      {data.occupations?.length > 0 && (
        <Section id="occupations" title="Careers here">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(showAllCareers ? data.occupations : data.occupations.slice(0, CAREERS_SHOWN)).map((occ) => (
              <RelatedCard key={occ.id} to={`/occupations/${occ.id}`} icon={Briefcase} iconClass="text-fg-muted" title={occ.title} />
            ))}
          </div>
          {data.occupations.length > CAREERS_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAllCareers((value) => !value)}
              className="mt-3 text-sm font-medium text-fg-default underline underline-offset-4 hover:no-underline"
            >
              {showAllCareers ? 'Show fewer' : `Show all ${data.occupations.length.toLocaleString()}`}
            </button>
          )}
        </Section>
      )}

      <SourceList sources={data.sources} />
    </>
  );
}

/** Open jobs at a company, a factory or for a career, with a way in for employers when there are none. */
function OpenJobsSection({ jobs, empty, showCareer = false }: { jobs: CareerJob[]; empty: string; showCareer?: boolean }) {
  // Offered to a visitor and to someone here to hire, never to a seeker.
  const postJob = usePostJobLink();
  return (
    <Section id="jobs" title="Open jobs">
      {jobs.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {jobs.map((job) => (
            <RelatedCard
              key={job.id}
              to={`/jobs/${job.id}`}
              icon={Briefcase}
              iconClass="text-fg-muted"
              title={job.title}
              subtitle={[
                // The career is said only when the job is not simply named after it.
                showCareer ? (job.occupationTitle !== job.title ? job.occupationTitle : null) : job.companyName,
                job.city,
                formatPay(job.payMin, job.payMax, job.payPeriod),
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-fg-soft">
          {empty}{' '}
          <Link to="/jobs" className="text-fg-muted underline underline-offset-2 hover:text-fg-default">
            See all open jobs
          </Link>
          {postJob && (
            <>
              {' · '}
              <Link to={postJob.to} className="text-fg-muted underline underline-offset-2 hover:text-fg-default">
                {postJob.visitor ? 'Hiring? Post a job' : 'Post a job'}
              </Link>
            </>
          )}
        </p>
      )}
    </Section>
  );
}

/** The three stages of a career's path, in the order they are learned. */
const PATH_STAGES: { stage: 1 | 2 | 3; label: string; hint: string }[] = [
  { stage: 1, label: 'Introduction', hint: 'Where to start' },
  { stage: 2, label: 'Fundamentals', hint: 'The core of the work' },
  { stage: 3, label: 'Advanced', hint: 'What sets you apart' },
];

/** The row a skill sits in on a career's path. A held skill stands out from the rest. */
function pathRowClass(status: SkillStatus | undefined): string {
  return status === 'held'
    ? 'bg-bg-elevated border-border-strong'
    : 'bg-tint/[0.02] border-tint/10 hover:bg-tint/[0.05] hover:border-tint/20';
}

/**
 * One skill on a career's path. Signed out, the row is a link to the skill.
 * Signed in, the mark at its head sets the skill held (or clears it) in
 * place, and the name is the link.
 */
function PathSkill({
  skill,
  status,
  onMark,
  disabled,
}: {
  skill: RelatedSkill;
  status: SkillStatus | undefined;
  /** Present for a signed-in person. */
  onMark?: (mark: SkillMark) => void;
  disabled?: boolean;
}) {
  const row = `group flex items-center min-w-0 rounded-lg border transition-all duration-200 ${pathRowClass(status)}`;
  const name = <span className="flex-1 min-w-0 font-medium leading-snug text-fg-default break-words">{skill.name}</span>;
  const chevron = <ChevronRight className="w-4 h-4 text-fg-soft group-hover:text-fg-muted flex-shrink-0" />;

  if (!onMark) {
    return (
      <Link to={`/skills/${skill.id}`} className={`${row} gap-3 p-3`}>
        <Wrench className="w-5 h-5 flex-shrink-0 text-fg-muted" />
        {name}
        {chevron}
      </Link>
    );
  }

  // The mark sits where the icon does on a signed-out row, so the name does not move.
  return (
    <div className={`${row} py-px`} data-path-skill={skill.id} data-status={status ?? 'none'}>
      <SkillHeldToggle label={skill.name} value={status ?? 'none'} onChange={onMark} disabled={disabled} />
      <Link to={`/skills/${skill.id}`} className="flex flex-1 min-w-0 items-center gap-3 self-stretch py-[11px] pr-3">
        {name}
        {chevron}
      </Link>
    </div>
  );
}

// Career (occupation) detail: the path of skills by stage, open jobs, and who employs it.
function OccupationDetailView({ data }: { data: OccupationDetail }) {
  const { data: account } = useAccount();
  // Marks and "You have N of M" are a seeker's: someone here to hire reads the path as a visitor does.
  const seekerTools = useSeekerTools();
  const signedIn = Boolean(account?.user) && seekerTools;
  const { data: mySkills, isPending: skillsPending } = useMySkills(signedIn);
  const statusBySkill = new Map((mySkills ?? []).map((s) => [s.skillId, s.status]));
  const markSkill = useMarkSkill();
  const { pathname, search } = useLocation();

  const skills = data.skills ?? [];
  const jobs = data.jobs ?? [];
  const heldCount = skills.filter((s) => statusBySkill.get(s.id) === 'held').length;
  const staged = PATH_STAGES.map((def) => ({ ...def, skills: skills.filter((s) => s.stage === def.stage) }));
  const unstaged = skills.filter((s) => !s.stage);
  const hasStages = staged.some((group) => group.skills.length > 0);

  const pathSkill = (skill: RelatedSkill) => (
    <PathSkill
      key={skill.id}
      skill={skill}
      status={statusBySkill.get(skill.id)}
      disabled={skillsPending}
      onMark={signedIn ? (mark) => markSkill.mutate({ skillId: skill.id, name: skill.name, mark }) : undefined}
    />
  );

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3 empty:hidden">
        <GoalButton occupationId={data.id} />
        {signedIn && skills.length > 0 && (
          <span className="text-sm text-fg-muted" data-held-count>
            You have <span className="text-fg-default font-medium tabular-nums">{heldCount}</span> of {skills.length} skills
          </span>
        )}
      </div>

      {/* The path: skills in the order they are learned */}
      {skills.length === 0 && (
        <Section id="skills" title="Path">
          <p className="text-sm text-fg-muted">Path not written yet.</p>
        </Section>
      )}
      {skills.length > 0 && (
        <Section
          id="skills"
          title={hasStages ? 'Path' : 'Skills'}
          note={
            hasStages && data.pathStatus === 'draft' ? (
              // Honest without undermining the page: one quiet word, with the sentence for anyone who asks.
              <details className="group text-xs text-fg-soft" data-draft-path>
                <summary className="inline-flex min-h-6 cursor-pointer list-none items-center underline decoration-dotted underline-offset-4 hover:text-fg-muted [&::-webkit-details-marker]:hidden">
                  Draft
                </summary>
                <p className="mt-1 max-w-prose text-sm text-fg-muted">A starting point that has not been reviewed by a person yet.</p>
              </details>
            ) : undefined
          }
        >
          {signedIn && <ErrorNote error={markSkill.error} className="mb-3" />}
          {hasStages ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {staged.map((group) => (
                <div key={group.stage} className="min-w-0">
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-xs font-medium text-fg-soft tabular-nums">{group.stage}</span>
                    <h3 className="text-sm font-semibold text-fg-default">{group.label}</h3>
                    <span className="text-xs text-fg-soft truncate">{group.hint}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {group.skills.length > 0 ? (
                      group.skills.map(pathSkill)
                    ) : (
                      <p className="rounded-lg border border-dashed border-tint/10 p-3 text-sm text-fg-soft">
                        Nothing at this stage yet.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {unstaged.length > 0 && (
            <div className={hasStages ? 'mt-6' : ''}>
              {hasStages && <h3 className="mb-2 text-sm font-semibold text-fg-default">Not yet placed on the path</h3>}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {unstaged.map(pathSkill)}
              </div>
            </div>
          )}
          {account && !signedIn && (
            <p className="mt-4 text-sm text-fg-soft">
              <Link
                to={signInPath(`${pathname}${search}`)}
                className="text-fg-muted underline underline-offset-2 hover:text-fg-default"
              >
                Sign in
              </Link>{' '}
              to mark the skills you have.
            </p>
          )}
        </Section>
      )}

      <WhereWorkIsDone data={data} />

      {/* Like the company and factory pages: a section only when there is a job to show. */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} empty="" />}

      {/* Factories that employ this career */}
      {data.factories?.length > 0 && (
        <Section id="factories" title="Factories that employ this career">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.factories.map((factory) => (
              <RelatedCard
                key={factory.id}
                to={`/factories/${factory.id}`}
                icon={Factory}
                iconClass="text-fg-muted"
                title={formatFactoryName(factory.name)}
                subtitle={factory.state}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/**
 * Where a career's work is done: the industries that typically have it, with
 * how many plants each has, and the states with the most of them (each opens
 * on the map). It describes industries, not what any one plant employs.
 */
function WhereWorkIsDone({ data }: { data: OccupationDetail }) {
  const industries = data.industries ?? [];
  const states = data.topStates ?? [];
  if (industries.length === 0 && !data.everywhere) return null;
  return (
    <Section id="where" title="Where this work is done">
      {data.everywhere ? (
        <p className="text-sm text-fg-muted">Plants of every industry.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {industries.map((industry) => (
                <li key={industry.name}>
                  <Link
                    to={industryPath(industry.name) ?? `/explore?tab=factories&industry=${encodeURIComponent(industry.name)}`}
                    className="flex items-baseline justify-between gap-4 py-2.5 text-sm transition-colors hover:text-fg-default"
                  >
                    <span className="min-w-0 text-fg-default">{industryLabel(industry.name)}</span>
                    <span className="shrink-0 tabular-nums text-fg-muted">
                      {industry.factoryCount.toLocaleString()} {industry.factoryCount === 1 ? 'plant' : 'plants'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {data.elsewhereToo && <p className="mt-2 text-xs text-fg-soft">And plants of every other industry.</p>}
          </div>
          {states.length > 0 && (
            <div className="min-w-0">
              <p className="mb-2 text-xs text-fg-soft">Most plants in these industries</p>
              <div className="flex flex-wrap gap-2">
                {states.map((state) => (
                  <Link
                    key={state.code}
                    to={`/map?state=${state.code}`}
                    className="rounded-md border border-border-strong px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:bg-tint/5 hover:text-fg-default"
                  >
                    {STATE_CODE_TO_NAME[state.code as StateCode] ?? state.code}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

/** Where a skill sits on the careers that use it, in the order it is met. */
const SKILL_STAGES: { stage: 1 | 2 | 3; label: string; hint: string }[] = [
  { stage: 1, label: 'Introduction', hint: 'Learned first' },
  { stage: 2, label: 'Fundamentals', hint: 'Core of the work' },
  { stage: 3, label: 'Advanced', hint: 'Learned later' },
];

/** One stage's careers on a skill's page: the first few, and the rest on request. */
function SkillCareers({ label, hint, careers }: { label?: string; hint?: string; careers: SkillDetail['occupations'] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? careers : careers.slice(0, CAREERS_SHOWN);
  return (
    <div className="min-w-0" data-skill-stage={label ?? 'none'}>
      {label && (
        <p className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium text-fg-default">{label}</span>
          {hint && <span className="text-fg-soft">{hint}</span>}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {shown.map((career) => (
          <RelatedCard key={career.id} to={`/occupations/${career.id}`} icon={Briefcase} iconClass="text-fg-muted" title={career.title} />
        ))}
      </div>
      {careers.length > CAREERS_SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-fg-default underline underline-offset-4 hover:no-underline sm:min-h-0"
        >
          {showAll ? 'Show fewer' : `Show all ${careers.length.toLocaleString()}`}
        </button>
      )}
    </div>
  );
}

/**
 * A skill's page: what it is (the header), how it is learned, what it is done
 * with, the careers that use it by where it comes on their paths, the
 * industries those careers work in, the skills that go with it, and open jobs
 * that ask for it. A part with nothing to say is not drawn.
 */
function SkillDetailView({ data }: { data: SkillDetail }) {
  const careers = data.occupations ?? [];
  const staged = SKILL_STAGES.map((def) => ({ ...def, careers: careers.filter((career) => career.stage === def.stage) })).filter(
    (group) => group.careers.length > 0
  );
  const unstaged = careers.filter((career) => !career.stage);
  const tools = data.tools ?? [];
  const industries = data.industries ?? [];
  const jobs = data.jobs ?? [];
  return (
    <>
      <div className="mt-5 empty:hidden">
        <SkillStatusButton skillId={data.id} />
      </div>
      {/* The category opens the skills list filtered to it. */}
      {data.category && (
        <div className="mt-4">
          <FilterPill to={`/explore?tab=skills&category=${encodeURIComponent(data.category)}`}>
            {data.category}
          </FilterPill>
        </div>
      )}

      {(data.howLearned || tools.length > 0) && (
        <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {data.howLearned && (
            <Section id="learned" title="How it is learned">
              <p className="text-fg-muted leading-relaxed" data-skill-learned>
                {data.howLearned}
              </p>
            </Section>
          )}
          {tools.length > 0 && (
            <Section id="tools" title="Done with">
              <ul className="space-y-1.5 text-fg-muted" data-skill-tools>
                {tools.map((tool) => (
                  <li key={tool} className="leading-snug">
                    {tool}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {careers.length > 0 && (
        <Section id="occupations" title="Careers that use it">
          <div className="space-y-6">
            {staged.map((group) => (
              <SkillCareers key={group.stage} label={group.label} hint={group.hint} careers={group.careers} />
            ))}
            {unstaged.length > 0 && <SkillCareers label={staged.length > 0 ? 'Other careers' : undefined} careers={unstaged} />}
          </div>
        </Section>
      )}

      {(industries.length > 0 || data.everywhere) && (
        <Section id="industries" title="Where those careers work">
          {industries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {industries.map((industry) => (
                <Link
                  key={industry.name}
                  to={industryPath(industry.name) ?? `/explore?tab=factories&industry=${encodeURIComponent(industry.name)}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 text-sm text-fg-muted transition-colors hover:bg-tint/5 hover:text-fg-default sm:min-h-9"
                >
                  {industryLabel(industry.name)}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-fg-muted">Plants of every industry.</p>
          )}
        </Section>
      )}

      {data.relatedSkills?.length > 0 && (
        <Section id="related" title="Skills that go with it">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.relatedSkills.map((skill) => (
              <RelatedCard
                key={skill.id}
                to={`/skills/${skill.id}`}
                icon={Wrench}
                iconClass="text-fg-muted"
                title={skill.name}
                // Its category is said only when it is another one: a row of the same words says nothing.
                subtitle={skill.category !== data.category ? skill.category : null}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Like the other pages: a section only when there is a job to show. */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} empty="" />}
    </>
  );
}

// What a missing record is called, and the list to go to instead.
const NOT_LISTED: Record<EntityType, string> = {
  companies: 'company', factories: 'factory', occupations: 'career', skills: 'skill',
};
const BROWSE_WORD: Record<EntityType, string> = {
  companies: 'companies', factories: 'factories', occupations: 'careers', skills: 'skills',
};

function getEntityFetcher(entityType: EntityType, id: string) {
  switch (entityType) {
    case 'companies':
      return () => companiesApi.get(id);
    case 'factories':
      return () => factoriesApi.get(id);
    case 'occupations':
      return () => occupationsApi.get(id);
    case 'skills':
      return () => skillsApi.get(id);
  }
}

// Union type for all entity details
type AnyEntityDetail = CompanyDetail | FactoryDetail | OccupationDetail | SkillDetail;

// Type guard helpers
function isCompanyDetail(data: AnyEntityDetail): data is CompanyDetail {
  // A career's response lists factories too: a company has no skills.
  return 'factories' in data && !('skills' in data);
}

function isFactoryDetail(data: AnyEntityDetail): data is FactoryDetail {
  return 'company' in data && 'occupations' in data && 'latitude' in data;
}

function isOccupationDetail(data: AnyEntityDetail): data is OccupationDetail {
  return 'skills' in data && 'factories' in data;
}

function isSkillDetail(data: AnyEntityDetail): data is SkillDetail {
  return 'relatedSkills' in data;
}

// Main EntityDetail component
export default function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  const { pathname, hash } = useLocation();
  const entityType = getEntityType(pathname);

  const { data, isLoading, error } = useQuery<AnyEntityDetail>({
    queryKey: [entityType, id],
    queryFn: getEntityFetcher(entityType, id!),
    enabled: !!id,
  });

  // Tab title = the entity's name while you're on its page.
  useEffect(() => {
    const name = data && ('name' in data ? data.name : 'title' in data ? data.title : null);
    if (name) document.title = `${name} · Archangel`;
  }, [data]);

  // A company with a short name is shown under it: /companies/tesla.
  const navigate = useNavigate();
  const slug = data && entityType === 'companies' && 'slug' in data ? data.slug : null;
  useEffect(() => {
    if (slug && id !== slug) navigate(`/companies/${slug}${window.location.hash}`, { replace: true });
  }, [slug, id, navigate]);

  // Cards deep-link to sections (#factories, #occupations, …); scroll once the data is on the page.
  useEffect(() => {
    if (!hash || !data) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, data]);

  const config = ENTITY_CONFIG[entityType];
  const Icon = config.icon;
  // An admin corrects a record from its own page: Edit opens it in Admin Tools.
  const { data: viewer } = useAccount();
  // Not while the admin is looking at the product as someone else.
  const adminView = useViewer().admin;
  const canEdit = adminView && Boolean(viewer?.user?.isAdmin);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 text-fg-muted animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <PageContainer size="narrow">
        <BackButton fallback={`/explore?tab=${entityType}`} />
        <EmptyState
          title={`This ${NOT_LISTED[entityType]} is not listed`}
          description="The link may be old, or the record was removed."
          action={
            <Link
              to={`/explore?tab=${entityType}`}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-fg-default hover:bg-bg-elevated"
            >
              Browse {BROWSE_WORD[entityType]}
            </Link>
          }
        />
      </PageContainer>
    );
  }

  // Get name and description based on entity type
  const rawName = 'title' in data ? data.title : 'name' in data ? data.name : '';
  const name = entityType === 'factories'
    ? formatFactoryName(rawName)
    : entityType === 'companies'
    ? formatCompanyName(rawName)
    : rawName;
  const description = 'description' in data ? data.description : null;

  return (
    <PageContainer size="narrow">
      <BackButton fallback={`/explore?tab=${entityType}`} />

      {/* Header - glass morphism card */}
      <div className="flex items-start gap-4">
        {entityType === 'companies' && isCompanyDetail(data) ? (
          <CompanyLogo name={name} domain={data.domain} size={58} className="rounded-xl" />
        ) : entityType === 'factories' && isFactoryDetail(data) && data.company?.domain ? (
          <CompanyLogo name={formatCompanyName(data.company.name)} domain={data.company.domain} size={58} className="rounded-xl" />
        ) : (
          <div className="p-3 rounded-xl bg-tint/[0.02] backdrop-blur-sm border border-tint/10">
            <Icon className={`w-8 h-8 ${config.iconClass}`} />
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-fg-default">{name}</h1>
            {entityType !== 'companies' && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${config.badgeClass}`}>
                {config.label}
              </span>
            )}
            {canEdit && (
              <Link
                to={editPath(RECORD_KIND[entityType], data.id)}
                className="ml-auto text-sm font-medium text-fg-muted underline underline-offset-4 hover:text-fg-default"
                data-admin-edit
              >
                Edit
              </Link>
            )}
          </div>
          {description && <p className="text-fg-muted">{description}</p>}
        </div>
      </div>

      {/* Entity-specific content */}
      {/* The address says which kind of record this is; the shape checks only
          narrow the type. A response that gains a field can then never draw
          another kind's page. `data-entity-view` names the view for tests. */}
      <div className="contents" data-entity-view={entityType}>
        {entityType === 'companies' && isCompanyDetail(data) && <CompanyDetailView data={data} />}
        {entityType === 'factories' && isFactoryDetail(data) && <FactoryDetailView data={data} />}
        {entityType === 'occupations' && isOccupationDetail(data) && <OccupationDetailView data={data} />}
        {entityType === 'skills' && isSkillDetail(data) && <SkillDetailView data={data} />}
      </div>
    </PageContainer>
  );
}
