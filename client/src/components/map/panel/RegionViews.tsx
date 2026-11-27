import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Factory } from 'lucide-react';
import {
  type StateOverview,
  type AreaOverview,
  type BoundsOverview,
  type RegionOverview,
} from '../../../lib/api';
import { useMapStore, type MapPlace } from '../../../stores/mapStore';
import { stateName, titleCase } from '../../../lib/places';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import CompanyLogo from '../../CompanyLogo';
import { industryPath, shownIndustry } from '@shared/industry';
import { companyFigure } from '../../../lib/utils';
import { Section, JobRows, MORE_LINK, CareerRows, Heading, PageLink, RowList, NodeRow, More, Figures, ROW, META_IN_ROW } from './parts';

/** How many open jobs a region's panel lists before sending the person to the jobs list. */
const REGION_JOBS_SHOWN = 4;

/** The jobs list narrowed to a point: what "open jobs here" opens for a focus area or a place. */
function jobsNear(lat: number, lng: number, name: string): string {
  return `/jobs?${new URLSearchParams({ near: `${lat.toFixed(4)},${lng.toFixed(4)}`, place: name })}`;
}

/**
 * `jobsLink`: the jobs list narrowed to this region, for when it has more open jobs than the panel lists.
 * `industryIn`: the state or focus area an industry's row opens that industry's page for.
 * `oneState`: the panel is a state's or a focus area's, so a job's place is its city alone.
 */
function RegionBody({
  data,
  jobsLink,
  industryIn,
  oneState = false,
  children,
}: {
  data: RegionOverview;
  jobsLink: string;
  industryIn?: { state?: string; area?: string };
  oneState?: boolean;
  children?: ReactNode;
}) {
  const selectEntity = useMapStore((s) => s.selectEntity);
  if (data.totalFactories === 0) {
    return <p className="text-[15px] text-text-2">No factories are listed here.</p>;
  }
  const jobs = data.jobs ?? [];
  const openJobs = data.openJobs ?? jobs.length;
  return (
    <>
      <Figures
        items={[
          { label: 'Factories', value: data.totalFactories },
          ...(data.totalCompanies > 0 ? [{ label: 'Companies', value: data.totalCompanies }] : []),
          ...(openJobs > 0 ? [{ label: 'Open jobs', value: openJobs }] : []),
        ]}
      />

      {/* Who is hiring here: said only when someone is */}
      {jobs.length > 0 && (
        <Section title="Open jobs">
          <JobRows jobs={jobs} limit={REGION_JOBS_SHOWN} said={{ state: oneState }} />
          {openJobs > REGION_JOBS_SHOWN && (
            <Link to={jobsLink} className={MORE_LINK}>
              All {openJobs.toLocaleString()} open jobs
            </Link>
          )}
        </Section>
      )}

      {/* Who is here */}
      {data.topCompanies.length > 0 && (
        <Section title="Companies">
          <RowList>
            {data.topCompanies.slice(0, 8).map((c) => {
              const name = formatCompanyName(c.name);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectEntity('company', c.id, name)}
                  className={`${ROW} py-1.5`}
                >
                  <CompanyLogo name={name} domain={c.domain} size={32} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-text-1">{name}</span>
                  {/* Its people here where known, else its open jobs here, else its factories here: what the list is ranked on. */}
                  <span className={`shrink-0 text-[13px] tabular-nums ${META_IN_ROW}`}>{companyFigure({ people: c.people, openJobs: c.openJobs, factories: c.factories ?? c.count })}</span>
                </button>
              );
            })}
          </RowList>
        </Section>
      )}

      {children}

      {/* What work is here */}
      {data.topIndustries.length > 0 && (
        <Section title="Industries" column="Factories">
          <RowList>
            {data.topIndustries.map((industry) => {
              // Each industry opens its page for this place. Only the 21 are industries.
              const page = industryPath(industry.label, industryIn);
              if (!page) return null;
              return (
                <Link
                  key={industry.label}
                  to={page}
                  className={`${ROW} justify-between py-1`}
                >
                  <span className="min-w-0 truncate text-[15px] text-text-1">{shownIndustry(industry.label)}</span>
                  <span className={`shrink-0 text-[13px] tabular-nums ${META_IN_ROW}`}>{industry.count.toLocaleString()}</span>
                </Link>
              );
            })}
          </RowList>
          {/* The panel lists the largest; the rest are a page away, for the same place. */}
          {industryIn && data.topIndustries.length >= 8 && (
            <Link
              to={`/industries?${new URLSearchParams(industryIn.area ? { area: industryIn.area } : { state: industryIn.state ?? '' })}`}
              className={MORE_LINK}
            >
              All industries
            </Link>
          )}
        </Section>
      )}

      {data.careers && data.careers.length > 0 && (
        <Section title="Careers in these industries">
          <CareerRows careers={data.careers} limit={6} />
        </Section>
      )}
    </>
  );
}

export function StateView({ data }: { data: StateOverview }) {
  const name = stateName(data.code);
  return (
    <>
      <Heading title={name} />
      <RegionBody data={data} jobsLink={`/jobs?state=${data.code}`} industryIn={{ state: data.code }} oneState />
      {data.totalFactories > 0 && <PageLink to={`/explore?tab=factories&state=${data.code}`}>All factories in {name}</PageLink>}
    </>
  );
}

export function AreaView({ data }: { data: AreaOverview }) {
  return (
    <>
      <Heading title={data.name} subtitle={data.description} />
      <RegionBody
        data={data}
        jobsLink={jobsNear((data.bounds[0][1] + data.bounds[1][1]) / 2, (data.bounds[0][0] + data.bounds[1][0]) / 2, data.name)}
        industryIn={{ area: data.id }}
        oneState
      />
    </>
  );
}

/** What a place found by search holds: the same overview, and the factories themselves. */
export function PlaceView({ place, data }: { place: MapPlace; data: BoundsOverview }) {
  const { selectFactory, flyTo, setHoveredFactory } = useMapStore();
  const shown = data.plants.slice(0, 8);
  return (
    <>
      <Heading title={place.name} subtitle={place.context || undefined} />
      <RegionBody
        data={data}
        jobsLink={jobsNear((data.bounds[0][1] + data.bounds[1][1]) / 2, (data.bounds[0][0] + data.bounds[1][0]) / 2, place.name)}
      >
        {shown.length > 0 && (
          <Section title="Factories">
            <RowList>
              {shown.map((plant) => {
                const company = plant.companyName ? formatCompanyName(plant.companyName) : null;
                const name = formatFactoryName(plant.name);
                return (
                  <NodeRow
                    key={plant.id}
                    logo={company ? <CompanyLogo name={company} domain={plant.companyDomain} size={32} /> : undefined}
                    icon={Factory}
                    title={name}
                    subtitle={[company && !name.toLowerCase().startsWith(company.toLowerCase()) ? company : null, plant.city ? titleCase(plant.city) : null]
                      .filter(Boolean)
                      .join(' · ') || undefined}
                    onPress={() => {
                      selectFactory(plant.id);
                      flyTo({ kind: 'point', lat: parseFloat(plant.latitude), lng: parseFloat(plant.longitude), zoom: 12 });
                    }}
                    onHover={(over) => setHoveredFactory(over ? plant.id : null)}
                  />
                );
              })}
            </RowList>
            <More shown={shown.length} total={data.totalFactories} noun="on the map" />
          </Section>
        )}
      </RegionBody>
    </>
  );
}
