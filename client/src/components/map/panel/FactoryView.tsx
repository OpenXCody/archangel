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
import { Heading, Section, JobRows, MORE_LINK, CareerRows, More, RowList, NodeRow, PageLink, Figures } from './parts';

/** How far "nearby" reaches, and how many plants it lists. */
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
 * The plants closest to one plant, from the pins the map already holds: the
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
  // What the plant makes: its industry, else what its own record says it does. Never the company's free text.
  const industry = shownIndustry(factory.industry) ?? (factory.specialization || null);
  // A curated plant's address was written by a person ("1530 FM 973") and is left as it is.
  const street = factory.address?.trim() ?? '';
  const address = street && street.toLowerCase() !== (factory.city ?? '').trim().toLowerCase() ? (factory.curated ? street : titleCase(street)) : null;
  const jobs = factory.jobs ?? [];
  const underConstruction = factory.status === 'under construction';
  const nearby = factory.nearby ?? [];
  const siteCount = company?.siteCount ?? 0;
  const stateCount = company?.stateCount ?? 0;
  const recorded = factory.occupations ?? [];
  const typical = factory.typicalCareers ?? [];
  const sisters = new Set(nearby.map((site) => site.id));
  const neighbours = useNearbyPlants(factory.id, factory.latitude, factory.longitude).filter((plant) => !sisters.has(plant.id));
  // A company whose one plant this is, under the same name, would only repeat the heading.
  const companyIsThisPlant =
    companyName !== null && siteCount <= 1 && !company?.description && factoryName.toLowerCase().startsWith(companyName.toLowerCase());

  return (
    <>
      {/* What is this */}
      <Heading
        title={factoryName}
        logo={company ? <CompanyLogo name={companyName ?? factoryName} domain={company.domain} size={44} className="rounded-lg" /> : undefined}
        subtitle={
          (place || industry || address) && (
            <>
              {(place || industry || underConstruction) && <p>{[place, industry, underConstruction ? 'Under construction' : null].filter(Boolean).join(' · ')}</p>}
              {address && <p className="mt-0.5 text-xs text-fg-soft">{address}</p>}
            </>
          )
        }
      />
      <Figures
        items={[
          ...(jobs.length > 0 ? [{ label: 'Open jobs', value: jobs.length }] : []),
          // The year says how current the figure is.
          ...(factory.workforceSize ? [{ label: factory.workforceYear ? `People, ${factory.workforceYear}` : 'People', value: factory.workforceSize }] : []),
        ]}
      />
      {factory.products && (
        <Section title="Makes">
          <p className="text-sm leading-relaxed text-fg-default">{factory.products}</p>
        </Section>
      )}
      {factory.description && (
        <Section title="About this plant">
          <p className="text-sm leading-relaxed text-fg-muted">{factory.description}</p>
        </Section>
      )}

      {/* Who is here */}
      {company && companyName && !companyIsThisPlant && (
        <Section title="Company">
          <button
            type="button"
            onClick={() => selectEntity('company', company.id, companyName)}
            className="group w-full rounded-lg border border-border-subtle bg-bg-elevated p-3 text-left transition-colors hover:border-border-strong"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-fg-default">{companyName}</span>
                {siteCount > 0 && (
                  <span className="block text-xs text-fg-muted">
                    {siteCount.toLocaleString()} {siteCount === 1 ? 'plant' : 'plants'}
                    {stateCount > 1 ? ` in ${stateCount} states` : ''}
                  </span>
                )}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft group-hover:text-fg-default" aria-hidden="true" />
            </span>
            {company.description && (
              <span className="mt-2 line-clamp-3 block text-sm leading-relaxed text-fg-muted">{company.description}</span>
            )}
          </button>
        </Section>
      )}

      {/* What work is here */}
      {jobs.length > 0 && (
        <Section title="Open jobs">
          <JobRows jobs={jobs} limit={4} />
          {jobs.length > 4 && (
            <Link to={`/factories/${factory.id}`} className={MORE_LINK}>
              All {jobs.length} open jobs
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
          <More shown={Math.min(4, recorded.length)} total={recorded.length} noun="on the plant's page" />
        </Section>
      ) : (
        typical.length > 0 && (
          // With none recorded for the plant, the careers typical of its industry.
          <Section title="Careers in this industry">
            <CareerRows careers={typical} limit={6} />
          </Section>
        )
      )}

      {/* Where next */}
      {nearby.length > 0 && companyName && (
        <Section title={`Other ${companyName} plants`}>
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
        <Section title="Plants nearby">
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
      <PageLink to={`/factories/${factory.id}`}>Plant page</PageLink>
    </>
  );
}
