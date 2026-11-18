import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, ChevronRight, Loader2 } from 'lucide-react';
import { industriesApi, type IndustryDetail, type IndustryEmployer } from '../lib/api';
import { industryBySlug, industryLabel } from '@shared/industry';
import { STATE_CODE_TO_NAME, type StateCode } from '@shared/states';
import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import { formatPay } from '../lib/jobFormat';
import { cn } from '@/lib/utils';
import CompanyLogo from '../components/CompanyLogo';
import { EmptyState, PageContainer } from '../components/layout/Page';
import { LoadError } from '../components/account/parts';
import {
  BackButton,
  CARD_LIST,
  CardRow,
  FOCUS,
  FigureList,
  Figures,
  OUTLINE_LINK,
  PlaceChoice,
  Section,
  SourceLine,
  TEXT_ACTION,
  officialFigures,
  placeQuery,
  placeSearch,
  readPlace,
  type PagePlace,
} from '../components/industry/parts';

const CAREERS_SHOWN = 8;
const STATES_SHOWN = 10;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "ROUND ROCK" as "Round Rock": the source data shouts its city names. */
function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

/**
 * What stands under an employer's name. A headcount recorded for only some of
 * its plants is said to be that, so the figure beside it is never read as the
 * company's size here.
 */
function employerLine(employer: IndustryEmployer): string {
  if (employer.people !== null && employer.counted < employer.plants) {
    return `People at ${employer.counted} of ${plural(employer.plants, 'plant', 'plants')}`;
  }
  return plural(employer.plants, 'plant', 'plants');
}

/** A link in a two-column grid: a career, or an open job. */
function GridLink({ to, title, subtitle }: { to: string; title: string; subtitle?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex min-w-0 items-start gap-3 rounded-lg border border-tint/10 bg-tint/[0.02] p-3 transition-colors hover:border-tint/20 hover:bg-tint/[0.05]',
        FOCUS
      )}
    >
      <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg-default">{title}</span>
        {subtitle && <span className="block truncate text-sm text-fg-soft">{subtitle}</span>}
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-fg-soft group-hover:text-fg-muted" aria-hidden="true" />
    </Link>
  );
}

/** The industry's plants on the map, in this place. */
function mapPath(industryName: string, place: PagePlace): string {
  const query = new URLSearchParams({ industry: industryName, ...placeQuery(place) });
  return `/map?${query}`;
}

function IndustryBody({ data, place }: { data: IndustryDetail; place: PagePlace }) {
  const [allCareers, setAllCareers] = useState(false);
  const [allStates, setAllStates] = useState(false);
  const { industry } = data;
  const placeName = data.place.name;

  const figures = [
    ...officialFigures(data.stats),
    ...(data.plants > 0 ? [{ label: 'Plants listed', value: data.plants.toLocaleString() }] : []),
  ];
  // With no official figures the product's own count stands alone, beside how many companies it covers.
  if (figures.length < 3 && data.companies > 1) figures.push({ label: 'Companies', value: data.companies.toLocaleString() });

  // People are ranked on only when somebody's are recorded; otherwise this is who has the most plants.
  const ranked = data.employers.some((employer) => employer.people !== null);
  // Unranked, the figure is each company's plants; a column of ones says nothing and is left out.
  const counted = ranked || data.employers.some((employer) => employer.plants > 1);
  // A list a couple of rows longer than the cut is shown whole: "Show all 9" under eight rows is noise.
  const careersCut = data.careers.length > CAREERS_SHOWN + 2;
  const careers = allCareers || !careersCut ? data.careers : data.careers.slice(0, CAREERS_SHOWN);
  const states = data.states ?? [];
  const cities = (data.cities ?? []).filter((city) => city.box !== null);
  const plantsLink =
    data.plants > 0 && data.place.kind !== 'area'
      ? `/explore?${new URLSearchParams({ tab: 'factories', industry: industry.name, ...(data.place.kind === 'state' ? { state: data.place.code } : {}) })}`
      : null;

  return (
    <>
      {industry.summary && <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-fg-muted">{industry.summary}</p>}

      {/* How big */}
      <Figures items={figures} />
      {data.stats && <SourceLine stats={data.stats} />}
      {data.plants === 0 && (
        <p className="mt-6 text-sm text-fg-muted" data-nothing-listed>
          No plants in this industry are listed in {placeName}.
          {data.place.kind !== 'country' && (
            <>
              {' '}
              <Link to={`/industries/${industry.slug}`} className={cn('text-fg-default underline underline-offset-4 hover:no-underline', FOCUS)}>
                See it everywhere
              </Link>
            </>
          )}
        </p>
      )}

      {/* Who is here */}
      {data.employers.length > 0 && (
        <Section id="employers" title={ranked ? 'Leading employers' : 'Companies'} column={ranked ? 'People' : counted ? 'Plants' : undefined}>
          <ul className={CARD_LIST}>
            {data.employers.map((employer) => {
              const name = formatCompanyName(employer.name);
              return (
                <CardRow
                  key={employer.id}
                  to={`/companies/${employer.slug ?? employer.id}`}
                  lead={<CompanyLogo name={name} domain={employer.domain} size={32} className="rounded-md" />}
                  title={name}
                  subtitle={ranked ? employerLine(employer) : null}
                  figure={ranked ? employer.people : counted ? employer.plants : null}
                  figureLabel={ranked ? 'people' : 'plants'}
                />
              );
            })}
          </ul>
        </Section>
      )}

      {data.largestPlants.length > 0 && (
        <Section id="plants" title="Largest plants" column="People">
          <ul className={CARD_LIST}>
            {data.largestPlants.map((plant) => {
              const name = formatFactoryName(plant.name);
              const company = plant.companyName ? formatCompanyName(plant.companyName) : null;
              const where = [plant.city ? titleCase(plant.city) : null, data.place.kind === 'country' ? plant.state : null].filter(Boolean).join(', ');
              return (
                <CardRow
                  key={plant.id}
                  to={`/factories/${plant.id}`}
                  title={name}
                  // The company is said only when the plant is not simply named after it.
                  subtitle={[company && !name.toLowerCase().startsWith(company.toLowerCase()) ? company : null, where].filter(Boolean).join(' · ') || null}
                  figure={plant.people}
                  figureLabel="people"
                />
              );
            })}
          </ul>
        </Section>
      )}

      {/* What work is here */}
      {data.careers.length > 0 && (
        <Section id="careers" title="Careers in this industry">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {careers.map((career) => (
              <GridLink key={career.id} to={`/occupations/${career.id}`} title={career.title} />
            ))}
          </div>
          {careersCut && (
            <button type="button" onClick={() => setAllCareers((value) => !value)} className={TEXT_ACTION}>
              {allCareers ? 'Show fewer' : `Show all ${data.careers.length}`}
            </button>
          )}
        </Section>
      )}

      {data.jobs.length > 0 && (
        <Section id="jobs" title="Open jobs">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.jobs.map((job) => (
              <GridLink
                key={job.id}
                to={`/jobs/${job.id}`}
                title={job.title}
                subtitle={[formatCompanyName(job.companyName), job.city ? titleCase(job.city) : null, formatPay(job.payMin, job.payMax, job.payPeriod)]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </div>
          {data.openJobs > data.jobs.length && (
            <p className="mt-2 text-xs text-fg-soft">and {(data.openJobs - data.jobs.length).toLocaleString()} more</p>
          )}
        </Section>
      )}

      {/* Where: the states for the country, the cities for a state */}
      {states.length > 0 && (
        <Section id="where" title="Where">
          <FigureList
            rows={(allStates ? states : states.slice(0, STATES_SHOWN)).map((state) => ({
              key: state.code,
              to: `/industries/${industry.slug}?state=${state.code}`,
              label: state.name,
              people: state.employment,
              plants: state.plants,
            }))}
          />
          {states.length > STATES_SHOWN && (
            <button type="button" onClick={() => setAllStates((value) => !value)} className={TEXT_ACTION}>
              {allStates ? 'Show fewer' : `Show all ${states.length}`}
            </button>
          )}
        </Section>
      )}
      {cities.length > 0 && (
        <Section id="where" title="Where">
          <FigureList
            rows={cities.map((city) => {
              const name = titleCase(city.name);
              const within = city.state ? (STATE_CODE_TO_NAME[city.state as StateCode] ?? city.state) : placeName;
              // The map, on this city, showing this industry's plants.
              const query = new URLSearchParams({ industry: industry.name, place: name, in: within, box: (city.box ?? []).flat().join('_') });
              return { key: `${city.name}-${city.state ?? ''}`, to: `/map?${query}`, label: name, plants: city.plants };
            })}
          />
        </Section>
      )}

      {data.plants > 0 && (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to={mapPath(industry.name, place)} className={cn(OUTLINE_LINK, 'flex-1 sm:flex-none')} data-open-map>
            Open on the map
          </Link>
          {plantsLink && (
            <Link to={plantsLink} className={cn(OUTLINE_LINK, 'flex-1 whitespace-nowrap sm:flex-none')}>
              All {plural(data.plants, 'plant', 'plants')}
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/**
 * An industry's page: one of the 21, for the country or narrowed to a state
 * or a focus area from the address (?state=TX, ?area=austin). What it is, how
 * big it is, who leads it, its largest plants, its careers and where it is.
 * A part with nothing to say is left out.
 */
export default function IndustryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const industry = industryBySlug(slug);
  const place = readPlace(params);
  const label = industry ? industryLabel(industry.name) : null;
  const where = placeQuery(place);

  // The address says what the page is about, so the tab can say it at once.
  const placeTitle = place.kind === 'state' || place.kind === 'area' ? place.name : null;
  useEffect(() => {
    if (label) document.title = placeTitle ? `${label} in ${placeTitle} · Archangel` : `${label} · Industries · Archangel`;
  }, [label, placeTitle]);

  const query = useQuery({
    queryKey: ['industry', industry?.slug, where.state ?? null, where.area ?? null],
    queryFn: () => industriesApi.get(industry?.slug ?? '', where),
    enabled: Boolean(industry) && place.kind !== 'unknown',
    staleTime: 1000 * 60 * 5,
    // Changing the place keeps the page drawn until the new place's figures arrive.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === industry?.slug ? previous : undefined),
  });
  const data = query.data;

  // Links may name a part of the page (#employers); go there once it is drawn.
  useEffect(() => {
    if (!hash || !data) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash, data]);

  if (!industry || !label) {
    return (
      <PageContainer size="narrow">
        <BackButton fallback="/industries" />
        <EmptyState
          title="This industry is not listed"
          description="The link may be old."
          action={
            <Link to="/industries" className={OUTLINE_LINK}>
              All industries
            </Link>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="narrow">
      <BackButton fallback={`/industries${placeSearch(place)}`} />
      <header data-industry={industry.slug}>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft">Industry</p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg-default sm:text-3xl [text-wrap:balance]">{label}</h1>
        <PlaceChoice place={place} />
      </header>

      {place.kind === 'unknown' ? (
        <EmptyState
          title="That place is not listed"
          description={`“${place.asked}” is not a state.`}
          action={
            <Link to={`/industries/${industry.slug}`} className={OUTLINE_LINK}>
              {label} everywhere
            </Link>
          }
        />
      ) : data ? (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')} aria-busy={query.isPlaceholderData || undefined} data-industry-view>
          <IndustryBody data={data} place={place} />
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
