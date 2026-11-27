import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type CompanyDetail } from '../../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { industryByName, industryLabel, industryPath } from '@shared/industry';
import { versionPath } from '@shared/versions';
import { versionLine } from '../../lib/versions';
import CompanyLogo from '../CompanyLogo';
import { CompanyFamily, CompanyStanding, PlantFacts, ownCareerLine, peopleCount } from './RecordFacts';
import { useMapStore } from '../../stores/mapStore';
import { cityState, stateName } from '../../lib/places';
import {
  DetailFacts,
  DetailHeader,
  DetailSection,
  RecordList,
  RecordRow,
  ShowAll,
  detailActionClass,
} from '../layout/Page';
import { cn, plural } from '@/lib/utils';
import { type Head, streetAddress, factLinkClass, Footprint, OpenJobsSection, CAREERS_SHOWN } from './parts';

/** How many factories are listed before "Show all". */
const PLANTS_SHOWN = 12;

/**
 * A company's page. Who it is, where it is, whether it is hiring, its factories
 * and the careers at them. About seven companies in ten have one factory: for
 * those the page leads with that factory's own facts and address, in place of
 * counting to one and listing one row.
 *
 * A military service is an employer with no factories: its page has no footprint
 * and no map action, and lists its careers (the ratings, MOS or specialties
 * that are its own) in place of factories.
 */
export default function CompanyDetailView({ data, head }: { data: CompanyDetail; head: Head }) {
  const navigate = useNavigate();
  const [showAllPlants, setShowAllPlants] = useState(false);
  const [showAllCareers, setShowAllCareers] = useState(false);
  const name = formatCompanyName(data.name);
  const plants = useMemo(() => data.factories ?? [], [data.factories]);
  const jobs = data.jobs ?? [];
  const only = plants.length === 1 ? plants[0] : null;

  // Factories that can be placed, for the footprint and for framing them on the map.
  const placed = useMemo(
    () =>
      plants
        .map((plant) => ({ plant, latitude: parseFloat(plant.latitude ?? ''), longitude: parseFloat(plant.longitude ?? '') }))
        .filter((entry) => Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)),
    [plants]
  );

  // Factories per state, most first: "Texas 6 · California 2".
  const byState = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plant of plants) if (plant.state) counts.set(plant.state, (counts.get(plant.state) ?? 0) + 1);
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count, name: stateName(code) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [plants]);

  // Factories whose size is known come first, the largest first; the rest by state and name.
  const sortedPlants = useMemo(
    () =>
      [...plants].sort(
        (a, b) =>
          (b.workforceSize ?? 0) - (a.workforceSize ?? 0) ||
          (a.state ?? 'ZZ').localeCompare(b.state ?? 'ZZ') ||
          formatFactoryName(a.name).localeCompare(formatFactoryName(b.name))
      ),
    [plants]
  );
  // People are counted at the factories that state a figure, and said so when that is not all of them.
  const sized = plants.filter((plant) => (plant.workforceSize ?? 0) > 0).length;
  const shownPlants = showAllPlants ? sortedPlants : sortedPlants.slice(0, PLANTS_SHOWN);

  // A company's industries are the ones its factories are in (the 21), the one
  // with most of its factories first. Each is a page of its own; where the factories
  // are all in one state, that state's page of it.
  const industries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const plant of plants) {
      const industry = industryByName(plant.industry);
      if (industry) counts.set(industry.name, (counts.get(industry.name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([industry]) => industry);
  }, [plants]);
  const oneState = byState.length === 1 ? byState[0].code : null;

  const facts = only
    ? [cityState(only.city, only.state), only.status === 'under construction' ? 'Under construction' : null].filter(Boolean)
    : [
        plants.length > 0 ? plural(plants.length, 'factory', 'factories') : null,
        byState.length > 1 ? `${byState.length} states` : byState.length === 1 ? byState[0].name : null,
        (data.totalWorkforce ?? 0) > 0
          ? `${peopleCount(data.totalWorkforce ?? 0)}${sized > 0 && sized < plants.length ? ` at ${plural(sized, 'factory', 'factories')}` : ''}`
          : null,
      ].filter(Boolean);

  // Show only this company's factories on the map, framed. The map reads both
  // from its store when it mounts.
  const openOnMap = () => {
    const store = useMapStore.getState();
    store.setFilters({ company: data.id, companyName: name, states: [] });
    if (placed.length > 0) {
      store.flyTo({ kind: 'points', points: placed.map((entry): [number, number] => [entry.longitude, entry.latitude]) });
    }
    navigate('/map');
  };

  // Its own careers, as the server orders them: those of its open jobs (with how many are open), then the
  // ones it has its own version of, then those recorded at its factories. A career it has a version of opens
  // that version. The careers typical of its industry are not the company's and are not listed here.
  const versions = new Map((data.versions ?? []).map((version) => [version.occupation.id, version]));
  const careers = (data.careers ?? []).map((career) => {
    const version = versions.get(career.id);
    return {
      id: career.id,
      title: career.title,
      to: version ? versionPath(career.id, data) : `/occupations/${career.id}`,
      line: [ownCareerLine(career), version ? versionLine(version) : null].filter(Boolean).join(' · ') || null,
      version: Boolean(version),
    };
  });
  // A military service: its careers are the page. Each keeps its full title, with its code and home in the grey line.
  const service = data.service ?? null;
  const serviceCareers = data.serviceCareers ?? [];
  if (service && serviceCareers.length > 0) facts.unshift(plural(serviceCareers.length, 'career', 'careers'));
  const onlyName = only ? formatFactoryName(only.name) : '';
  const onlyStreet = only ? streetAddress(only) : null;

  return (
    <>
      <DetailHeader
        {...head}
        kind={service ? 'Military service' : 'Company'}
        title={name}
        mark={<CompanyLogo name={name} domain={data.domain} size={44} />}
        description={data.description}
        action={
          placed.length > 0 ? (
            <button type="button" onClick={openOnMap} className={detailActionClass} data-open-map>
              Open on the map
            </button>
          ) : undefined
        }
      >
        {(facts.length > 0 || industries.length > 0) && (
          <DetailFacts>
            {facts.join(' · ')}
            {industries.slice(0, 2).map((industry, index) => (
              <span key={industry}>
                {index > 0 || facts.length > 0 ? ' · ' : ''}
                <Link to={industryPath(industry, { state: oneState }) ?? '/industries'} className={factLinkClass}>
                  {industryLabel(industry)}
                </Link>
              </span>
            ))}
          </DetailFacts>
        )}
        <CompanyStanding data={data} />
      </DetailHeader>

      {/* One factory: its own facts stand where a list of one would. */}
      {only && <PlantFacts factory={only} />}

      {/* Where: the footprint, and how many factories in each state (or the one factory, leading to its page) */}
      {placed.length > 0 && (
        <Footprint
          points={placed.map((entry) => ({
            id: entry.plant.id,
            latitude: entry.latitude,
            longitude: entry.longitude,
            label: formatFactoryName(entry.plant.name),
          }))}
        >
          {only ? (
            <ul className="border-t border-line" data-only-plant>
              <RecordRow
                to={`/factories/${only.id}`}
                label="Factory"
                // A factory that carries the company's own name is told by its address.
                title={onlyName.toLowerCase() === name.toLowerCase() ? (onlyStreet ?? onlyName) : onlyName}
                subtitle={onlyName.toLowerCase() === name.toLowerCase() ? null : onlyStreet}
              />
            </ul>
          ) : (
            <p className="border-t border-line py-3 text-sm text-text-2">
              {byState.slice(0, 6).map((state, index) => (
                <span key={state.code}>
                  {index > 0 && ' · '}
                  <span className="text-text-1">{state.name}</span> {state.count}
                </span>
              ))}
              {byState.length > 6 && ` · ${byState.length - 6} more`}
            </p>
          )}
        </Footprint>
      )}
      {only && placed.length === 0 && (
        <RecordList className="mt-6" data-only-plant="">
          <RecordRow to={`/factories/${only.id}`} label="Factory" title={onlyName} subtitle={onlyStreet} />
        </RecordList>
      )}

      {/* Open jobs: said only when there are some */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} said={{ company: true }} total={data.openJobCount} all={`/jobs?company=${data.id}`} />}

      {/* The companies that are part of this one */}
      {(data.subsidiaries?.length ?? 0) > 0 && (
        <DetailSection id="companies" title="Companies">
          <CompanyFamily companies={data.subsidiaries ?? []} />
        </DetailSection>
      )}

      {/* Under the heading and the map, the page's two lists stand side by side on a desktop: its factories on
          the left and its own careers on the right. One column on a phone. With no careers of its own there is
          no Careers section, and the factories take the width. */}
      <div className={cn('grid grid-cols-1 gap-x-12', plants.length > 1 && careers.length > 0 && 'lg:grid-cols-2')} data-company-lists>
        {/* Every factory: where it is and what it makes */}
        {plants.length > 1 && (
          <DetailSection id="factories" title="Factories" className="min-w-0">
            <RecordList>
              {shownPlants.map((plant) => (
                <RecordRow
                  key={plant.id}
                  to={`/factories/${plant.id}`}
                  title={formatFactoryName(plant.name)}
                  subtitle={
                    [
                      cityState(plant.city, plant.state),
                      plant.status === 'under construction' ? 'Under construction' : null,
                      plant.workforceSize ? peopleCount(plant.workforceSize) : null,
                      plant.products || (plant.industry ? industryLabel(plant.industry) : plant.specialization),
                    ]
                      .filter(Boolean)
                      .join(' · ') || null
                  }
                />
              ))}
            </RecordList>
            {sortedPlants.length > PLANTS_SHOWN && (
              <ShowAll open={showAllPlants} total={sortedPlants.length} onToggle={() => setShowAllPlants((value) => !value)} />
            )}
          </DetailSection>
        )}
        {careers.length > 0 && (
          <div className="min-w-0">
            {/* Its careers: the ones it has its own version of, then those recorded across its factories */}
            {careers.length > 0 && (
              <DetailSection id="occupations" title="Careers">
                <RecordList>
                  {(showAllCareers ? careers : careers.slice(0, CAREERS_SHOWN)).map((career) => (
                    <RecordRow
                      key={career.id}
                      to={career.to}
                      title={career.title}
                      subtitle={career.line}
                      data-company-version={career.version ? career.id : undefined}
                    />
                  ))}
                </RecordList>
                {careers.length > CAREERS_SHOWN && (
                  <ShowAll open={showAllCareers} total={careers.length} onToggle={() => setShowAllCareers((value) => !value)} />
                )}
              </DetailSection>
            )}
          </div>
        )}
      </div>
      {/* A service's careers: the ratings, MOS or specialties that are its own. One that has none yet says so. */}
      {service && (
        <DetailSection id="occupations" title="Careers">
          {serviceCareers.length === 0 ? (
            <p className="text-sm text-text-2" data-service-careers="">
              None yet.
            </p>
          ) : (
            <>
              <RecordList data-service-careers="">
                {(showAllCareers ? serviceCareers : serviceCareers.slice(0, CAREERS_SHOWN)).map((career) => (
                  <RecordRow
                    key={career.id}
                    to={`/occupations/${career.id}`}
                    title={career.title}
                    subtitle={[career.code, career.home].filter(Boolean).join(' · ') || null}
                    data-service-career={career.id}
                  />
                ))}
              </RecordList>
              {serviceCareers.length > CAREERS_SHOWN && (
                <ShowAll open={showAllCareers} total={serviceCareers.length} onToggle={() => setShowAllCareers((value) => !value)} />
              )}
            </>
          )}
        </DetailSection>
      )}

    </>
  );
}
