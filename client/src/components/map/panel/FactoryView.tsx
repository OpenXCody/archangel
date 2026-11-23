import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Factory, ChevronRight } from 'lucide-react';
import { type FactoryDetail } from '../../../lib/api';
import { useMapStore } from '../../../stores/mapStore';
import { cityState, titleCase } from '../../../lib/places';
import { milesBetween } from '@shared/scope';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import CompanyLogo from '../../CompanyLogo';
import { shownIndustry } from '@shared/industry';
import { usePins } from '../../../lib/queries';
import { Heading, Section, JobRows, MORE_LINK, CareerRows, More, RowList, NodeRow, PageLink, Figures, META_IN_ROW } from './parts';

/** How far "nearby" reaches, and how many factories it lists. */
const NEARBY_MILES = 30;
const NEARBY_COUNT = 5;

interface NearbyPlant {
  id: string;
  name: string;
  companyName: string | null;
  miles: number;
  lng: number;
  lat: number;
}

/**
 * The factories closest to one factory, from the pins the map already holds: the
 * same query the map reads, so nothing is requested and the list is there
 * with the panel.
 */
function useNearbyPlants(id: string, latitude: string, longitude: string): NearbyPlant[] {
  const { data: pins } = usePins();
  return useMemo(() => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!pins || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    // A degree of latitude is about 69 miles: skip the arithmetic for anything plainly out of reach.
    const reachLat = NEARBY_MILES / 69;
    const reachLng = reachLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    const near: NearbyPlant[] = [];
    for (const feature of pins.features) {
      const [pinLng, pinLat] = feature.geometry.coordinates;
      if (Math.abs(pinLat - lat) > reachLat || Math.abs(pinLng - lng) > reachLng) continue;
      const pin = feature.properties;
      if (pin.id === id) continue;
      const miles = milesBetween(lat, lng, pinLat, pinLng);
      if (miles <= NEARBY_MILES) near.push({ id: pin.id, name: pin.name, companyName: pin.companyName, miles, lng: pinLng, lat: pinLat });
    }
    return near.sort((a, b) => a.miles - b.miles).slice(0, NEARBY_COUNT);
  }, [pins, id, latitude, longitude]);
}

/** "0.4 miles", "12 miles". */
function milesAway(miles: number): string {
  if (miles < 0.1) return 'Next door';
  const shown = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  return `${shown} ${shown === 1 ? 'mile' : 'miles'}`;
}

export default function FactoryView({ factory }: { factory: FactoryDetail }) {
  const { selectEntity, selectFactory, flyTo, setHoveredFactory } = useMapStore();
  const company = factory.company;
  const factoryName = formatFactoryName(factory.name);
  const companyName = company ? formatCompanyName(company.name) : null;
  const place = cityState(factory.city, factory.state);
  // What the factory makes: its industry, else what its own record says it does. Never the company's free text.
  const industry = shownIndustry(factory.industry) ?? (factory.specialization || null);
  // A curated factory's address was written by a person ("1530 FM 973") and is left as it is.
  const street = factory.address?.trim() ?? '';
  const address = street && street.toLowerCase() !== (factory.city ?? '').trim().toLowerCase() ? (factory.curated ? street : titleCase(street)) : null;
  const jobs = factory.jobs ?? [];
  // The record lists the first few open jobs and says how many there are in all.
  const openJobs = factory.openJobCount ?? jobs.length;
  const underConstruction = factory.status === 'under construction';
  const nearby = factory.nearby ?? [];
  const siteCount = company?.siteCount ?? 0;
  const stateCount = company?.stateCount ?? 0;
  const recorded = factory.occupations ?? [];
  const typical = factory.typicalCareers ?? [];
  const sisters = new Set(nearby.map((site) => site.id));
  const neighbours = useNearbyPlants(factory.id, factory.latitude, factory.longitude).filter((plant) => !sisters.has(plant.id));
  // A company whose one factory this is, under the same name, would only repeat the heading.
  const companyIsThisPlant =
    companyName !== null && siteCount <= 1 && !company?.description && factoryName.toLowerCase().startsWith(companyName.toLowerCase());

  return (
    <>
      {/* What is this */}
      <Heading
        title={factoryName}
        logo={company ? <CompanyLogo name={companyName ?? factoryName} domain={company.domain} size={44} /> : undefined}
        subtitle={
          (place || industry || address) && (
            <>
              {(place || industry || underConstruction) && <p>{[place, industry, underConstruction ? 'Under construction' : null].filter(Boolean).join(' · ')}</p>}
              {address && <p className="mt-0.5 text-[13px] text-text-3">{address}</p>}
            </>
          )
        }
      />
      <Figures
        items={[
          ...(openJobs > 0 ? [{ label: 'Open jobs', value: openJobs }] : []),
          // The year says how current the figure is.
          ...(factory.workforceSize ? [{ label: factory.workforceYear ? `People, ${factory.workforceYear}` : 'People', value: factory.workforceSize }] : []),
        ]}
      />
      {factory.products && (
        <Section title="Makes">
          <p className="text-[15px] leading-relaxed text-text-1">{factory.products}</p>
        </Section>
      )}
      {factory.description && (
        <Section title="About this factory">
          <p className="text-[15px] leading-relaxed text-text-2">{factory.description}</p>
        </Section>
      )}

      {/* Who is here */}
      {company && companyName && !companyIsThisPlant && (
        <Section title="Company">
          <button
            type="button"
            onClick={() => selectEntity('company', company.id, companyName)}
            className="map-list-row group -mx-4 block w-[calc(100%+2rem)] px-4 py-2 text-left transition-colors hover:bg-surface-hover"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-[15px] text-text-1">{companyName}</span>
                {siteCount > 0 && (
                  <span className={`block text-[13px] tabular-nums ${META_IN_ROW}`}>
                    {siteCount.toLocaleString()} {siteCount === 1 ? 'factory' : 'factories'}
                    {stateCount > 1 ? ` in ${stateCount} states` : ''}
                  </span>
                )}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-3 transition-colors group-hover:text-text-1" aria-hidden="true" />
            </span>
            {company.description && (
              <span className="mt-2 line-clamp-3 block text-[15px] leading-relaxed text-text-2">{company.description}</span>
            )}
          </button>
        </Section>
      )}

      {/* What work is here */}
      {jobs.length > 0 && (
        <Section title="Open jobs">
          <JobRows jobs={jobs} limit={4} />
          {openJobs > 4 && (
            <Link to={`/jobs?plant=${factory.id}`} className={MORE_LINK}>
              All {openJobs.toLocaleString()} open jobs
            </Link>
          )}
        </Section>
      )}
      {recorded.length > 0 ? (
        <Section title="Careers here">
          <CareerRows
            careers={recorded.map((occ) => ({
              id: occ.id,
              title: occ.title,
              subtitle: occ.headcount ? `${occ.headcount.toLocaleString()} ${occ.headcount === 1 ? 'person' : 'people'}` : undefined,
            }))}
            limit={4}
          />
          <More shown={Math.min(4, recorded.length)} total={recorded.length} noun="on the factory's page" />
        </Section>
      ) : (
        typical.length > 0 && (
          // With none recorded for the factory, the careers typical of its industry.
          <Section title="Careers in this industry">
            <CareerRows careers={typical} limit={6} />
          </Section>
        )
      )}

      {/* Where next */}
      {nearby.length > 0 && companyName && (
        <Section title={`Other ${companyName} factories`}>
          <RowList>
            {nearby.map((site) => (
              <NodeRow
                key={site.id}
                icon={Factory}
                title={formatFactoryName(site.name)}
                subtitle={cityState(site.city, site.state) || undefined}
                onPress={() => {
                  selectFactory(site.id);
                  flyTo({ kind: 'point', lat: parseFloat(site.latitude), lng: parseFloat(site.longitude), zoom: 10 });
                }}
                onHover={(over) => setHoveredFactory(over ? site.id : null)}
              />
            ))}
          </RowList>
        </Section>
      )}
      {neighbours.length > 0 && (
        <Section title="Factories nearby">
          <RowList>
            {neighbours.map((plant) => {
              const name = formatFactoryName(plant.name);
              const owner = plant.companyName ? formatCompanyName(plant.companyName) : null;
              return (
                <NodeRow
                  key={plant.id}
                  icon={Factory}
                  title={name}
                  subtitle={[owner && !name.toLowerCase().startsWith(owner.toLowerCase()) ? owner : null, milesAway(plant.miles)].filter(Boolean).join(' · ')}
                  onPress={() => {
                    selectFactory(plant.id);
                    flyTo({ kind: 'point', lat: plant.lat, lng: plant.lng });
                  }}
                  onHover={(over) => setHoveredFactory(over ? plant.id : null)}
                />
              );
            })}
          </RowList>
        </Section>
      )}
      <PageLink to={`/factories/${factory.id}`}>Factory page</PageLink>
    </>
  );
}
