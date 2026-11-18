import { useEffect, useMemo, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  ChevronUp,
  ChevronDown,
  Factory,
  Building2,
  Briefcase,
  Wrench,
  MapPin,
  ChevronRight,
  Loader2,
  ArrowLeft,
  MapPinned,
  Navigation,
} from 'lucide-react';
import {
  factoriesApi,
  type FactoryDetail,
  type CompanyDetail,
  type OccupationDetail,
  type SkillDetail,
  type StateOverview,
  type AreaOverview,
  type BoundsOverview,
  type RegionOverview,
  type CareerJob,
} from '../../lib/api';
import { useMapStore, type MapEntityType, type MapPlace, type SheetDetent } from '../../stores/mapStore';
import { US_STATES } from '@shared/states';
import { milesBetween } from '@shared/scope';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import CompanyLogo from '../CompanyLogo';
import { formatPay } from '../../lib/jobFormat';
import { PANEL_WIDTH_PX, SHEET_BAR_PX, SHEET_FULL_VH, sheetPeekPx } from './camera';
import { industryLabel } from '@shared/industry';
import { isNotFound, useSelection } from './selection';

/*
 * Words, the same in every panel:
 *   plant   a factory, wherever the panel speaks about a place of work
 *   people  how many work somewhere (never "workforce", "workers", "headcount", "positions")
 *   career  an occupation
 * Every number sits under or beside a label, and a section with nothing to
 * say is left out rather than shown as "0".
 *
 * Every panel runs in the order a person asks: what is this, who is here,
 * what work is here, where next.
 */

const STATE_NAMES: Record<string, string> = Object.fromEntries(US_STATES.map((s) => [s.code, s.name]));

/** "ROUND ROCK" as "Round Rock": the source data shouts its city names. */
function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

function cityAndState(city: string | null | undefined, state: string | null | undefined): string {
  return [city ? titleCase(city) : null, state].filter(Boolean).join(', ');
}

// ─── Parts ─────────────────────────────────────────────────────────────────

/** A titled part of a panel. `column` labels the figures down its right edge. */
function Section({ title, column, children }: { title: string; column?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted">{title}</h3>
        {column && <span className="shrink-0 text-[11px] uppercase tracking-wider text-fg-soft">{column}</span>}
      </div>
      {children}
    </section>
  );
}

/** Labelled figures, side by side. Give it only figures that have something to say. */
function Figures({ items }: { items: { label: string; value: number }[] }) {
  if (items.length === 0) return null;
  return (
    <dl className={`mb-6 grid gap-2 ${items.length >= 3 ? 'grid-cols-3' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5">
          <dt className="truncate text-[11px] uppercase tracking-wider text-fg-muted">{item.label}</dt>
          <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums text-fg-default">{item.value.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The panel's title block. */
function Heading({ title, subtitle, logo }: { title: string; subtitle?: ReactNode; logo?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {logo}
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-xl font-semibold leading-snug tracking-tight text-fg-default">{title}</h2>
        {subtitle && <div className="mt-1 text-sm text-fg-muted">{subtitle}</div>}
      </div>
    </div>
  );
}

/** A row that leads somewhere in the panel: a company, a career, a skill, a plant. */
function NodeRow({
  icon: Icon,
  logo,
  title,
  subtitle,
  onPress,
  onHover,
}: {
  icon?: typeof Factory;
  logo?: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  onHover?: (over: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
      className="map-row group flex w-full items-center gap-3 border-b border-border-subtle bg-bg-elevated px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-tint/5"
    >
      {logo ?? (Icon && <Icon className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />)}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg-default">{title}</span>
        {subtitle && <span className="block truncate text-xs text-fg-muted">{subtitle}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft transition-colors group-hover:text-fg-default" aria-hidden="true" />
    </button>
  );
}

/** Rows that belong together, as one bordered list. */
function RowList({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-lg border border-border-subtle">{children}</div>;
}

/** The way on from a panel: the full page of what it is about. */
function PageLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="map-row mb-2 flex w-full items-center justify-center rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-fg-default transition-colors hover:bg-bg-elevated"
    >
      {children}
    </Link>
  );
}

function CareerRows({ careers, limit }: { careers: { id: string; title: string; subtitle?: string }[]; limit: number }) {
  const selectEntity = useMapStore((s) => s.selectEntity);
  return (
    <RowList>
      {careers.slice(0, limit).map((career) => (
        <NodeRow
          key={career.id}
          icon={Briefcase}
          title={career.title}
          subtitle={career.subtitle}
          onPress={() => selectEntity('occupation', career.id, career.title)}
        />
      ))}
    </RowList>
  );
}

/** `company`: name the company on each row, where the panel is not about one. */
function JobRows({ jobs, limit, company = false }: { jobs: CareerJob[]; limit: number; company?: boolean }) {
  return (
    <RowList>
      {jobs.slice(0, limit).map((job) => (
        <Link
          key={job.id}
          to={`/jobs/${job.id}`}
          className="map-row group flex items-center justify-between gap-3 border-b border-border-subtle bg-bg-elevated px-3 py-2.5 transition-colors last:border-b-0 hover:bg-tint/5"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm text-fg-default">{job.title}</span>
            <span className="block truncate text-xs text-fg-muted">
              {company && job.companyName ? `${formatCompanyName(job.companyName)} · ` : ''}
              {formatPay(job.payMin, job.payMax, job.payPeriod)}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft group-hover:text-fg-default" aria-hidden="true" />
        </Link>
      ))}
    </RowList>
  );
}

/** How many open jobs a region's panel lists before sending the person to the jobs list. */
const REGION_JOBS_SHOWN = 4;

/** The jobs list narrowed to a point: what "open jobs here" opens for a focus area or a place. */
function jobsNear(lat: number, lng: number, name: string): string {
  return `/jobs?${new URLSearchParams({ near: `${lat.toFixed(4)},${lng.toFixed(4)}`, place: name })}`;
}

/** "and 12 more", when a list was cut short. */
function More({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  if (total <= shown) return null;
  return <p className="mt-2 text-xs text-fg-soft">and {(total - shown).toLocaleString()} more {noun}</p>;
}

// ─── A state, a focus area, a place ────────────────────────────────────────

/** `jobsLink`: the jobs list narrowed to this region, for when it has more open jobs than the panel lists. */
function RegionBody({ data, jobsLink, children }: { data: RegionOverview; jobsLink: string; children?: ReactNode }) {
  const selectEntity = useMapStore((s) => s.selectEntity);
  if (data.totalFactories === 0) {
    return <p className="text-sm text-fg-muted">No plants are listed here.</p>;
  }
  const jobs = data.jobs ?? [];
  const openJobs = data.openJobs ?? jobs.length;
  return (
    <>
      <Figures
        items={[
          { label: 'Plants', value: data.totalFactories },
          ...(data.totalCompanies > 0 ? [{ label: 'Companies', value: data.totalCompanies }] : []),
          ...(openJobs > 0 ? [{ label: 'Open jobs', value: openJobs }] : []),
        ]}
      />

      {/* Who is hiring here: said only when someone is */}
      {jobs.length > 0 && (
        <Section title="Open jobs">
          <JobRows jobs={jobs} limit={REGION_JOBS_SHOWN} company />
          {openJobs > REGION_JOBS_SHOWN && (
            <Link to={jobsLink} className="mt-2 block text-xs text-fg-muted underline-offset-4 hover:underline">
              All {openJobs.toLocaleString()} open jobs
            </Link>
          )}
        </Section>
      )}

      {/* Who is here */}
      {data.topCompanies.length > 0 && (
        <Section title="Companies" column="Plants here">
          <div>
            {data.topCompanies.slice(0, 8).map((c) => {
              const name = formatCompanyName(c.name);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectEntity('company', c.id, name)}
                  className="map-row group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-tint/5"
                >
                  <CompanyLogo name={name} domain={c.domain} size={28} />
                  <span className="min-w-0 flex-1 truncate text-fg-default">{name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-fg-muted">{c.count.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {children}

      {/* What work is here */}
      {data.topIndustries.length > 0 && (
        <Section title="Industries" column="Plants">
          <div>
            {data.topIndustries.map((industry) => (
              <div key={industry.label} className="flex items-baseline justify-between gap-3 py-1 text-sm">
                <span className="min-w-0 truncate text-fg-default">{industryLabel(industry.label)}</span>
                <span className="shrink-0 text-xs tabular-nums text-fg-muted">{industry.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
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

function StateView({ data }: { data: StateOverview }) {
  const name = STATE_NAMES[data.code] ?? data.code;
  return (
    <>
      <Heading title={name} />
      <RegionBody data={data} jobsLink={`/jobs?state=${data.code}`} />
      {data.totalFactories > 0 && <PageLink to={`/explore?tab=factories&state=${data.code}`}>All plants in {name}</PageLink>}
    </>
  );
}

function AreaView({ data }: { data: AreaOverview }) {
  return (
    <>
      <Heading title={data.name} subtitle={data.description} />
      <RegionBody
        data={data}
        jobsLink={jobsNear((data.bounds[0][1] + data.bounds[1][1]) / 2, (data.bounds[0][0] + data.bounds[1][0]) / 2, data.name)}
      />
    </>
  );
}

/** What a place found by search holds: the same overview, and the plants themselves. */
function PlaceView({ place, data }: { place: MapPlace; data: BoundsOverview }) {
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
          <Section title="Plants">
            <RowList>
              {shown.map((plant) => {
                const company = plant.companyName ? formatCompanyName(plant.companyName) : null;
                const name = formatFactoryName(plant.name);
                return (
                  <NodeRow
                    key={plant.id}
                    logo={company ? <CompanyLogo name={company} domain={plant.companyDomain} size={24} /> : undefined}
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

// ─── A plant ───────────────────────────────────────────────────────────────

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
  const { data: pins } = useQuery({
    queryKey: ['factory-pins'],
    queryFn: () => factoriesApi.pins(),
    staleTime: 5 * 60 * 1000,
  });
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

function FactoryView({ factory }: { factory: FactoryDetail }) {
  const { selectEntity, selectFactory, flyTo, setHoveredFactory } = useMapStore();
  const company = factory.company;
  const factoryName = formatFactoryName(factory.name);
  const companyName = company ? formatCompanyName(company.name) : null;
  const place = cityAndState(factory.city, factory.state);
  const industry = factory.industry
    ? industryLabel(factory.industry)
    : factory.specialization || (company && company.industry !== 'Manufacturing' ? company.industry : null);
  const address = factory.address && factory.address.trim().toLowerCase() !== (factory.city ?? '').trim().toLowerCase() ? titleCase(factory.address.trim()) : null;
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
                    {company.industry && company.industry !== 'Manufacturing' ? ` · ${company.industry}` : ''}
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
            <Link to={`/factories/${factory.id}`} className="mt-2 block text-xs text-fg-muted underline-offset-4 hover:underline">
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
                subtitle={cityAndState(site.city, site.state) || undefined}
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

// ─── A company ─────────────────────────────────────────────────────────────

function CompanyView({ company }: { company: CompanyDetail }) {
  const { flyTo, selectFactory, setHoveredFactory } = useMapStore();
  const name = formatCompanyName(company.name);
  const plants = company.factories ?? [];
  const states = new Set(plants.map((f) => f.state).filter(Boolean));
  const jobs = company.jobs ?? [];
  const points = plants
    .filter((f) => f.latitude && f.longitude)
    .map((f): [number, number] => [parseFloat(f.longitude as string), parseFloat(f.latitude as string)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));

  return (
    <>
      {/* What is this */}
      <Heading
        title={name}
        logo={<CompanyLogo name={name} domain={company.domain} size={44} className="rounded-lg" />}
        subtitle={company.industry && company.industry !== 'Manufacturing' ? company.industry : undefined}
      />
      <Figures
        items={[
          ...(plants.length > 0 ? [{ label: 'Plants', value: plants.length }] : []),
          ...(states.size > 1 ? [{ label: 'States', value: states.size }] : []),
          ...(jobs.length > 0 ? [{ label: 'Open jobs', value: jobs.length }] : []),
        ]}
      />
      {company.description && (
        <Section title="About">
          <p className="text-sm leading-relaxed text-fg-muted">{company.description}</p>
        </Section>
      )}
      {plants.length === 0 && <p className="mb-6 text-sm text-fg-muted">No plants are listed for this company.</p>}

      {/* What work is here */}
      {jobs.length > 0 && (
        <Section title="Open jobs">
          <JobRows jobs={jobs} limit={4} />
          <More shown={Math.min(4, jobs.length)} total={jobs.length} noun="on the company's page" />
        </Section>
      )}

      {/* Where */}
      {plants.length > 0 && (
        <Section title="Plants">
          <RowList>
            {plants.slice(0, 6).map((plant) => (
              <NodeRow
                key={plant.id}
                icon={Factory}
                title={formatFactoryName(plant.name)}
                subtitle={[cityAndState(plant.city, plant.state), plant.industry ? industryLabel(plant.industry) : null].filter(Boolean).join(' · ') || undefined}
                onPress={() => {
                  selectFactory(plant.id);
                  if (plant.latitude && plant.longitude) {
                    flyTo({ kind: 'point', lat: parseFloat(plant.latitude), lng: parseFloat(plant.longitude), zoom: 10 });
                  }
                }}
                onHover={(over) => setHoveredFactory(over ? plant.id : null)}
              />
            ))}
          </RowList>
          <More shown={Math.min(6, plants.length)} total={plants.length} noun="on the map" />
          {points.length > 1 && (
            <button
              type="button"
              onClick={() => flyTo({ kind: 'points', points })}
              className="map-row mt-3 flex w-full items-center justify-center rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-fg-default transition-colors hover:bg-bg-elevated"
            >
              Show all {points.length.toLocaleString()} on the map
            </button>
          )}
        </Section>
      )}

      {/* Where next */}
      <PageLink to={`/companies/${company.slug || company.id}`}>Company page</PageLink>
    </>
  );
}

// ─── A career ──────────────────────────────────────────────────────────────

function OccupationView({ occupation }: { occupation: OccupationDetail }) {
  const { selectState, selectEntity, selectFactory, flyTo, setHoveredFactory } = useMapStore();
  const skills = occupation.skills ?? [];
  const stages = [1, 2, 3].map((stage) => skills.filter((skill) => skill.stage === stage).length);
  const staged = stages.some((n) => n > 0);
  const industries = occupation.industries ?? [];
  const states = occupation.topStates ?? [];
  const plants = occupation.factories ?? [];
  const jobs = occupation.jobs ?? [];
  return (
    <>
      {/* What is this */}
      <Heading title={occupation.title} subtitle={occupation.description || undefined} />

      {/* Where the work is done: by industry, since few plants list their careers. */}
      {(industries.length > 0 || occupation.everywhere) && (
        <Section title="Where this work is done" column={occupation.everywhere ? undefined : 'Plants'}>
          {occupation.everywhere ? (
            <p className="text-sm text-fg-muted">Plants of every industry.</p>
          ) : (
            <div>
              {industries.map((industry) => (
                <div key={industry.name} className="flex items-baseline justify-between gap-3 py-1 text-sm">
                  <span className="min-w-0 truncate text-fg-default">{industryLabel(industry.name)}</span>
                  {industry.factoryCount > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-fg-muted">{industry.factoryCount.toLocaleString()}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {occupation.elsewhereToo && <p className="mt-1 text-xs text-fg-soft">And plants of every other industry.</p>}
          {!occupation.everywhere && industries.length > 0 && (
            <p className="mt-2 text-xs text-fg-soft">Plants in these industries are lit on the map.</p>
          )}
          {states.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-fg-muted">States with the most of these plants</p>
              <div className="flex flex-wrap gap-1.5">
                {states.map((state) => (
                  <button
                    key={state.code}
                    type="button"
                    onClick={() => selectState(state.code)}
                    title={`${state.factoryCount.toLocaleString()} plants in these industries`}
                    className="map-row inline-flex items-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-tint/5 hover:text-fg-default"
                  >
                    {STATE_NAMES[state.code] ?? state.code}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Plants that record this career */}
      {plants.length > 0 && (
        <Section title="Plants that list this career">
          <RowList>
            {plants.slice(0, 3).map((plant) => (
              <NodeRow
                key={plant.id}
                icon={Factory}
                title={formatFactoryName(plant.name)}
                subtitle={[
                  plant.headcount ? `${plant.headcount.toLocaleString()} ${plant.headcount === 1 ? 'person' : 'people'}` : null,
                  plant.state ? (STATE_NAMES[plant.state] ?? plant.state) : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined}
                onPress={() => {
                  selectFactory(plant.id);
                  if (plant.latitude && plant.longitude) {
                    flyTo({ kind: 'point', lat: parseFloat(plant.latitude), lng: parseFloat(plant.longitude), zoom: 10 });
                  }
                }}
                onHover={(over) => setHoveredFactory(over ? plant.id : null)}
              />
            ))}
          </RowList>
          <More shown={Math.min(3, plants.length)} total={plants.length} noun="on the career's page" />
        </Section>
      )}

      {/* What the work takes */}
      {jobs.length > 0 && (
        <Section title="Open jobs">
          <JobRows jobs={jobs} limit={3} />
          <More shown={Math.min(3, jobs.length)} total={jobs.length} noun="on the career's page" />
        </Section>
      )}
      {skills.length > 0 && (
        <Section title="Skills">
          {staged && (
            <p className="mb-2 text-xs tabular-nums text-fg-muted">
              Introduction {stages[0]} · Fundamentals {stages[1]} · Advanced {stages[2]}
            </p>
          )}
          <RowList>
            {skills.slice(0, 5).map((skill) => (
              <NodeRow
                key={skill.id}
                icon={Wrench}
                title={skill.name}
                subtitle={skill.category || undefined}
                onPress={() => selectEntity('skill', skill.id)}
              />
            ))}
          </RowList>
          <More shown={Math.min(5, skills.length)} total={skills.length} noun="on the career's page" />
        </Section>
      )}

      {/* Where next */}
      <PageLink to={`/occupations/${occupation.id}`}>Career page</PageLink>
    </>
  );
}

// ─── A skill ───────────────────────────────────────────────────────────────

function SkillView({ skill }: { skill: SkillDetail }) {
  const selectEntity = useMapStore((s) => s.selectEntity);
  const careers = skill.occupations ?? [];
  const related = skill.relatedSkills ?? [];
  return (
    <>
      <Heading title={skill.name} subtitle={skill.category || undefined} />
      {skill.description && (
        <Section title="About">
          <p className="text-sm leading-relaxed text-fg-muted">{skill.description}</p>
        </Section>
      )}

      {careers.length > 0 && (
        <Section title="Careers that use it">
          <CareerRows careers={careers.map((occ) => ({ id: occ.id, title: occ.title }))} limit={5} />
          <More shown={Math.min(5, careers.length)} total={careers.length} noun="on the skill's page" />
        </Section>
      )}

      {related.length > 0 && (
        <Section title="Related skills">
          <div className="flex flex-wrap gap-1.5">
            {related.slice(0, 8).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectEntity('skill', s.id)}
                className="map-row inline-flex items-center rounded-md border border-border-strong px-2.5 text-xs text-fg-muted transition-colors hover:bg-tint/5 hover:text-fg-default"
              >
                {s.name}
              </button>
            ))}
          </div>
        </Section>
      )}

      <PageLink to={`/skills/${skill.id}`}>Skill page</PageLink>
    </>
  );
}

// ─── The panel ─────────────────────────────────────────────────────────────

const KIND: Record<MapEntityType, { icon: typeof Factory; label: string; missing: string }> = {
  factory: { icon: Factory, label: 'Plant', missing: 'That plant is not listed.' },
  company: { icon: Building2, label: 'Company', missing: 'That company is not listed.' },
  occupation: { icon: Briefcase, label: 'Career', missing: 'That career is not listed.' },
  skill: { icon: Wrench, label: 'Skill', missing: 'That skill is not listed.' },
  state: { icon: MapPin, label: 'State', missing: 'That state was not found.' },
  area: { icon: MapPinned, label: 'Focus area', missing: 'That focus area was not found.' },
  place: { icon: Navigation, label: 'Place', missing: 'That place was not found.' },
};

interface MapDetailPanelProps {
  isMobile?: boolean;
}

/** The sheet's resting heights on a phone, in px, smallest first. */
function detentHeights(): Record<SheetDetent, number> {
  return {
    bar: SHEET_BAR_PX,
    peek: sheetPeekPx(),
    full: Math.min(Math.round((window.innerHeight * SHEET_FULL_VH) / 100), window.innerHeight - 72),
  };
}

export default function MapDetailPanel({ isMobile = false }: MapDetailPanelProps) {
  const selection = useSelection();
  const { type, id, name, isLoading, error } = selection;
  const setSidebarOpen = useMapStore((s) => s.setSidebarOpen);
  const goBack = useMapStore((s) => s.goBack);
  const canGoBack = useMapStore((s) => s.navigationHistory.length > 0);
  const notFound = useMapStore((s) => s.notFound);
  const detent = useMapStore((s) => s.sheetDetent);
  const setDetent = useMapStore((s) => s.setSheetDetent);
  const asideRef = useRef<HTMLElement>(null);

  const kind = type ? KIND[type] : null;
  const Icon = kind?.icon ?? Factory;

  // A link to something that does not exist: say so beside the search and
  // show the country, rather than an empty panel that reads as an outage.
  const missing = error !== null && isNotFound(error);
  useEffect(() => {
    if (missing && kind) notFound(kind.missing);
  }, [missing, kind, notFound]);

  // A sheet opens at its resting height, and one folded to its bar opens
  // again for whatever is chosen next.
  useEffect(() => {
    setDetent('peek');
  }, [setDetent]);
  useEffect(() => {
    if (useMapStore.getState().sheetDetent === 'bar') setDetent('peek');
  }, [type, id, setDetent]);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSidebarOpen]);

  // The sheet follows the finger on its header and settles on the nearest
  // resting height when let go. The height is set on the element while
  // dragging, so nothing re-renders per frame.
  const drag = useRef<{ pointer: number; startY: number; startHeight: number; moved: boolean } | null>(null);
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile || e.pointerType === 'mouse' || !asideRef.current) return;
    drag.current = { pointer: e.pointerId, startY: e.clientY, startHeight: asideRef.current.getBoundingClientRect().height, moved: false };
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const sheet = asideRef.current;
    if (!d || !sheet || e.pointerId !== d.pointer) return;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < 8) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      sheet.style.transition = 'none';
    }
    const heights = detentHeights();
    sheet.style.height = `${Math.min(Math.max(d.startHeight - dy, heights.bar), heights.full)}px`;
  };
  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const sheet = asideRef.current;
    drag.current = null;
    if (!d || !d.moved || !sheet) return;
    const dy = e.clientY - d.startY;
    const height = sheet.getBoundingClientRect().height;
    sheet.style.transition = '';
    sheet.style.height = '';
    const heights = detentHeights();
    const order: SheetDetent[] = ['bar', 'peek', 'full'];
    // A nudge leaves it where it was. A real swipe goes to the next resting
    // height in its direction from where the finger let go.
    let next = detent;
    if (Math.abs(dy) >= 40) {
      const slack = 24;
      next =
        dy < 0
          ? (order.find((each) => heights[each] >= height - slack) ?? 'full')
          : ([...order].reverse().find((each) => heights[each] <= height + slack) ?? 'bar');
    }
    setDetent(next);
  };

  const toggle = () => setDetent(detent === 'full' ? 'peek' : detent === 'bar' ? 'peek' : 'full');
  const folded = isMobile && detent === 'bar';
  const headerText = folded && name ? name : (kind?.label ?? 'Details');
  const headerButton =
    'map-search-button flex shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-tint/10 hover:text-fg-default';

  return (
    <aside
      ref={asideRef}
      data-detent={isMobile ? detent : undefined}
      className={`z-50 flex flex-col overflow-hidden border-border-subtle bg-bg-surface ${
        isMobile
          ? 'map-sheet fixed inset-x-0 bottom-0 rounded-t-2xl border-t animate-in slide-in-from-bottom duration-300'
          : 'absolute right-0 top-0 h-full border-l animate-in slide-in-from-right duration-300'
      }`}
      style={isMobile ? undefined : { width: PANEL_WIDTH_PX }}
      aria-label={name ? `${kind?.label ?? 'Details'}: ${name}` : (kind?.label ?? 'Details')}
    >
      <div
        className={isMobile ? 'touch-none' : undefined}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        {isMobile && (
          <div className="flex justify-center pt-2" aria-hidden="true">
            <span className="block h-1 w-10 rounded-full bg-tint/25" />
          </div>
        )}
        {/* Header */}
        <div className={`flex items-center justify-between gap-2 border-b border-border-subtle ${isMobile ? 'px-2 pb-1.5 pt-0.5' : 'p-3'}`}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {canGoBack && (
              <button type="button" onClick={goBack} className={headerButton} aria-label="Back" title="Back">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <Icon className={`h-4 w-4 shrink-0 text-fg-muted ${canGoBack ? '' : 'ml-2'}`} aria-hidden="true" />
            <span
              className={
                folded && name
                  ? 'min-w-0 truncate text-sm font-medium text-fg-default'
                  : 'min-w-0 truncate text-xs font-medium uppercase tracking-wider text-fg-muted'
              }
            >
              {headerText}
            </span>
          </div>
          <div className="flex shrink-0 items-center">
            {isMobile && (
              <button
                type="button"
                onClick={toggle}
                className={headerButton}
                aria-label={detent === 'full' ? 'Make the panel smaller' : 'Make the panel larger'}
                aria-expanded={detent === 'full'}
              >
                {detent === 'full' ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
              </button>
            )}
            <button type="button" onClick={() => setSidebarOpen(false)} className={headerButton} aria-label="Close" title="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4" hidden={folded}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-fg-muted" aria-label="Loading" />
          </div>
        ) : error && !missing ? (
          <div className="py-10 text-center">
            <p className="text-sm text-fg-muted">This could not be loaded.</p>
            <button
              type="button"
              onClick={selection.retry}
              className="map-row mt-3 inline-flex items-center rounded-lg border border-border-strong px-4 text-sm font-medium text-fg-default transition-colors hover:bg-bg-elevated"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {type === 'factory' && selection.factory && <FactoryView factory={selection.factory} />}
            {type === 'company' && selection.company && <CompanyView company={selection.company} />}
            {type === 'occupation' && selection.occupation && <OccupationView occupation={selection.occupation} />}
            {type === 'skill' && selection.skill && <SkillView skill={selection.skill} />}
            {type === 'state' && selection.state && <StateView data={selection.state} />}
            {type === 'area' && selection.area && <AreaView data={selection.area} />}
            {type === 'place' && selection.place && selection.placeOverview && (
              <PlaceView place={selection.place} data={selection.placeOverview} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}
