import { Factory } from 'lucide-react';
import { type CompanyDetail } from '../../../lib/api';
import { useMapStore } from '../../../stores/mapStore';
import { cityState } from '../../../lib/places';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import CompanyLogo from '../../CompanyLogo';
import { leadingIndustry, shownIndustry } from '@shared/industry';
import { Heading, Section, JobRows, More, RowList, NodeRow, PageLink, Figures, SECONDARY_BUTTON } from './parts';

export default function CompanyView({ company }: { company: CompanyDetail }) {
  const { flyTo, selectFactory, setHoveredFactory } = useMapStore();
  const name = formatCompanyName(company.name);
  const plants = company.factories ?? [];
  const states = new Set(plants.map((f) => f.state).filter(Boolean));
  const jobs = company.jobs ?? [];
  // The record lists the first few open jobs and says how many there are in all.
  const openJobs = company.openJobCount ?? jobs.length;
  const points = plants
    .filter((f) => f.latitude && f.longitude)
    .map((f): [number, number] => [parseFloat(f.longitude as string), parseFloat(f.latitude as string)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));

  return (
    <>
      {/* What is this */}
      <Heading
        title={name}
        logo={<CompanyLogo name={name} domain={company.domain} size={44} />}
        // The industry most of its plants are in.
        subtitle={shownIndustry(leadingIndustry(plants.map((plant) => plant.industry))) ?? undefined}
      />
      <Figures
        items={[
          ...(plants.length > 0 ? [{ label: 'Plants', value: plants.length }] : []),
          ...(states.size > 1 ? [{ label: 'States', value: states.size }] : []),
          ...(openJobs > 0 ? [{ label: 'Open jobs', value: openJobs }] : []),
        ]}
      />
      {company.description && (
        <Section title="About">
          <p className="text-[15px] leading-relaxed text-text-2">{company.description}</p>
        </Section>
      )}
      {plants.length === 0 && <p className="mb-8 text-[15px] text-text-2">No plants are listed for this company.</p>}

      {/* What work is here */}
      {jobs.length > 0 && (
        <Section title="Open jobs">
          <JobRows jobs={jobs} limit={4} />
          <More shown={Math.min(4, jobs.length)} total={openJobs} noun="on the company's page" />
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
                subtitle={[cityState(plant.city, plant.state), shownIndustry(plant.industry)].filter(Boolean).join(' · ') || undefined}
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
              className={`mt-3 flex w-full px-4 py-2.5 ${SECONDARY_BUTTON}`}
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
