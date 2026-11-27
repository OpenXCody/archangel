import { Factory } from 'lucide-react';
import { type FactoryDetail } from '../../../lib/api';
import { useMapStore } from '../../../stores/mapStore';
import { cityState, titleCase } from '../../../lib/places';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import CompanyLogo from '../../CompanyLogo';
import { shownIndustry } from '@shared/industry';
import { Heading, Section, JobRows, CareerRows, More, RowList, NodeRow, PageLinks, ListLink, Figures, ownCareerLine } from './parts';

/**
 * A factory's panel. It is about this factory and shows only what is known of
 * it, in one order on a phone and a desktop: its name, place and industry;
 * the two ways on, as buttons ("Factory page", "Company page"), with the
 * company's paragraph under them; its figures; what it makes; its open jobs;
 * its own careers; more of its company's factories. Nothing about its
 * industry in general and nothing about other companies.
 */
export default function FactoryView({ factory }: { factory: FactoryDetail }) {
  const { selectFactory, flyTo, setHoveredFactory } = useMapStore();
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
  const careers = factory.careers ?? [];
  const pages = [
    { to: `/factories/${factory.id}`, label: 'Factory page' },
    ...(company ? [{ to: `/companies/${company.slug ?? company.id}`, label: 'Company page' }] : []),
  ];

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
      {/* The way on, at the top, named for where it goes. The company's paragraph sits with its button. */}
      <PageLinks links={pages} />
      {company?.description && (
        <p className="-mt-2 mb-6 line-clamp-4 text-[15px] leading-relaxed text-text-2" data-company-says>
          {companyName && <span className="text-text-1">{companyName}. </span>}
          {company.description}
        </p>
      )}
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

      {/* Its open jobs, and the way to all of them */}
      {jobs.length > 0 && (
        <Section title="Open jobs">
          <JobRows jobs={jobs} limit={4} said={{ factory: true }} />
          {openJobs > 4 && <ListLink to={`/jobs?plant=${factory.id}`}>All {openJobs.toLocaleString()} open jobs</ListLink>}
        </Section>
      )}

      {/* Its own careers: of its open jobs, its company's versions, those recorded for it. None of its own, no section. */}
      {careers.length > 0 && (
        <Section title="Careers here">
          <CareerRows careers={careers.map((career) => ({ id: career.id, title: career.title, subtitle: ownCareerLine(career) }))} limit={6} />
          <More shown={Math.min(6, careers.length)} total={careers.length} noun="on the factory's page" />
        </Section>
      )}

      {/* More of the same company, nearest first. Never another company's. */}
      {nearby.length > 0 && companyName && (
        <Section title={`More ${companyName} factories`}>
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
    </>
  );
}
