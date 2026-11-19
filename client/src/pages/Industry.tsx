import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { industriesApi, type IndustryDetail, type IndustryEmployer } from '../lib/api';
import { industryBySlug, industryLabel } from '@shared/industry';
import { stateName, titleCase } from '../lib/places';
import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import { formatPay } from '../lib/jobFormat';
import { cn, focusRing, plural } from '@/lib/utils';
import CompanyLogo from '../components/CompanyLogo';
import {
  BackLink,
  DetailHeader,
  DetailSection,
  EmptyState,
  PageContainer,
  RecordList,
  RecordRow,
  ShowAll,
  detailActionClass,
  sectionLinkClass,
} from '../components/layout/Page';
import { LoadError } from '../components/account/parts';
import {
  FigureList,
  Figures,
  PlaceChoice,
  SourceLine,
  officialFigures,
  placeQuery,
  placeSearch,
  readPlace,
  type PagePlace,
} from '../components/industry/parts';

const CAREERS_SHOWN = 8;
/** The states (or a state's towns) listed before "Show all": the section sits near the top of the page, so it starts short. */
const STATES_SHOWN = 6;

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

/** The industry's plants on the map, in this place. */
function mapPath(industryName: string, place: PagePlace): string {
  const query = new URLSearchParams({ industry: industryName, ...placeQuery(place) });
  return `/map?${query}`;
}

function IndustryBody({ data }: { data: IndustryDetail }) {
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
      {/* What it is: how big */}
      <Figures items={figures} />
      {data.stats && <SourceLine stats={data.stats} />}
      {data.plants === 0 && (
        <p className="mt-6 text-sm text-fg-muted" data-nothing-listed>
          No plants in this industry are listed in {placeName}.
          {data.place.kind !== 'country' && (
            <>
              {' '}
              <Link to={`/industries/${industry.slug}`} className={cn('text-fg-default underline underline-offset-4 hover:no-underline', focusRing)}>
                See it everywhere
              </Link>
            </>
          )}
        </p>
      )}

      {/* Where: the states for the country, the cities for a state */}
      {states.length > 0 && (
        <DetailSection id="where" title="Where">
          <FigureList
            rows={(allStates ? states : states.slice(0, STATES_SHOWN)).map((state) => ({
              key: state.code,
              to: `/industries/${industry.slug}?state=${state.code}`,
              label: state.name,
              people: state.employment,
              plants: state.plants,
            }))}
          />
          {states.length > STATES_SHOWN && <ShowAll open={allStates} total={states.length} onToggle={() => setAllStates((value) => !value)} />}
        </DetailSection>
      )}
      {cities.length > 0 && (
        <DetailSection id="where" title="Where">
          <FigureList
            rows={(allStates ? cities : cities.slice(0, STATES_SHOWN)).map((city) => {
              const name = titleCase(city.name);
              const within = city.state ? stateName(city.state) : placeName;
              // The map, on this city, showing this industry's plants.
              const query = new URLSearchParams({ industry: industry.name, place: name, in: within, box: (city.box ?? []).flat().join('_') });
              return { key: `${city.name}-${city.state ?? ''}`, to: `/map?${query}`, label: name, plants: city.plants };
            })}
          />
          {cities.length > STATES_SHOWN && <ShowAll open={allStates} total={cities.length} onToggle={() => setAllStates((value) => !value)} />}
        </DetailSection>
      )}

      {data.jobs.length > 0 && (
        <DetailSection id="jobs" title="Open jobs">
          <RecordList>
            {data.jobs.map((job) => (
              <RecordRow
                key={job.id}
                to={`/jobs/${job.id}`}
                title={job.title}
                subtitle={[formatCompanyName(job.companyName), job.city ? titleCase(job.city) : null, formatPay(job.payMin, job.payMax, job.payPeriod)]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </RecordList>
          {data.openJobs > data.jobs.length && (
            <p className="mt-2 text-xs text-fg-soft">and {(data.openJobs - data.jobs.length).toLocaleString()} more</p>
          )}
        </DetailSection>
      )}

      {/* Who is here. The column says how they are ranked: by people where that is recorded, else by plants. */}
      {data.employers.length > 0 && (
        <DetailSection id="employers" title="Companies" column={ranked ? 'People' : counted ? 'Plants' : undefined}>
          <RecordList>
            {data.employers.map((employer) => {
              const name = formatCompanyName(employer.name);
              return (
                <RecordRow
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
          </RecordList>
        </DetailSection>
      )}

      {/* The largest plants where people are recorded, and the way to all of them */}
      {(data.largestPlants.length > 0 || plantsLink) && (
        <DetailSection
          id="plants"
          title="Plants"
          column={data.largestPlants.length > 0 ? 'People' : undefined}
          action={
            plantsLink ? (
              <Link to={plantsLink} className={sectionLinkClass} data-all-plants>
                All {plural(data.plants, 'plant', 'plants')}
              </Link>
            ) : undefined
          }
        >
          {data.largestPlants.length > 0 && (
            <RecordList>
              {data.largestPlants.map((plant) => {
                const name = formatFactoryName(plant.name);
                const company = plant.companyName ? formatCompanyName(plant.companyName) : null;
                const where = [plant.city ? titleCase(plant.city) : null, data.place.kind === 'country' ? plant.state : null].filter(Boolean).join(', ');
                return (
                  <RecordRow
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
            </RecordList>
          )}
          {data.largestPlants.length > 0 && plantsLink && (
            <Link to={plantsLink} className={cn(sectionLinkClass, 'mt-1 inline-flex min-h-11 items-center')}>
              All {plural(data.plants, 'plant', 'plants')}
            </Link>
          )}
        </DetailSection>
      )}

      {/* What work is here */}
      {data.careers.length > 0 && (
        <DetailSection id="careers" title="Careers in this industry">
          <RecordList>
            {careers.map((career) => (
              <RecordRow key={career.id} to={`/occupations/${career.id}`} title={career.title} />
            ))}
          </RecordList>
          {careersCut && <ShowAll open={allCareers} total={data.careers.length} onToggle={() => setAllCareers((value) => !value)} />}
        </DetailSection>
      )}
    </>
  );
}

/**
 * An industry's page: one of the 21, for the country or narrowed to a state
 * or a focus area from the address (?state=TX, ?area=austin). What it is and
 * how big, where it is, open jobs, its companies, its largest plants and its
 * careers. A part with nothing to say is left out.
 */
export default function IndustryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const industry = industryBySlug(slug);
  const place = readPlace(params);
  const label = industry ? industryLabel(industry.name) : null;
  const where = placeQuery(place);

  // The address says what the page is about, so the tab can say it at once, in the heading's words.
  const placeTitle = place.kind === 'state' || place.kind === 'area' ? place.name : null;
  useEffect(() => {
    // An address that names no industry still leaves the title of the page before it behind.
    document.title = !label ? 'Industries · Archangel' : placeTitle ? `${label} in ${placeTitle} · Archangel` : `${label} · Archangel`;
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
        <div className="-mt-2">
          <BackLink fallback="/industries" />
        </div>
        <EmptyState
          title="This industry is not listed"
          description="The link may be old."
          action={
            <Link to="/industries" className={detailActionClass}>
              All industries
            </Link>
          }
        />
      </PageContainer>
    );
  }

  // The heading block is drawn before the answer arrives; what the answer adds (what the industry is, the way to the map) joins it.
  const header = (loaded?: IndustryDetail) => (
    <div data-industry={industry.slug}>
      <DetailHeader
        back={{ fallback: `/industries${placeSearch(place)}` }}
        kind="Industry"
        title={label}
        qualifier={<PlaceChoice place={place} />}
        description={loaded?.industry.summary}
        action={
          loaded && loaded.plants > 0 ? (
            <Link to={mapPath(industry.name, place)} className={detailActionClass} data-open-map>
              Open on the map
            </Link>
          ) : undefined
        }
      />
    </div>
  );

  return (
    <PageContainer size="narrow">
      {place.kind === 'unknown' ? (
        <>
          {header()}
          <EmptyState
            title="That place is not listed"
            description={`“${place.asked}” is not a state.`}
            action={
              <Link to={`/industries/${industry.slug}`} className={detailActionClass}>
                {label} everywhere
              </Link>
            }
          />
        </>
      ) : data ? (
        <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')} aria-busy={query.isPlaceholderData || undefined} data-industry-view>
          {header(data)}
          <IndustryBody data={data} />
        </div>
      ) : query.isError ? (
        <>
          {header()}
          <LoadError error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} className="mt-6" />
        </>
      ) : (
        <>
          {header()}
          <div className="flex min-h-[320px] items-center justify-center" aria-busy="true" aria-label="Loading">
            <Loader2 className="h-6 w-6 animate-spin text-fg-muted" />
          </div>
        </>
      )}
    </PageContainer>
  );
}
