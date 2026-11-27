import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { type FactoryDetail } from '../../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { industryLabel, industryPath } from '@shared/industry';
import { versionPath } from '@shared/versions';
import CompanyLogo from '../CompanyLogo';
import { ownCareerLine } from './RecordFacts';
import { PlantFacts } from './RecordFacts';
import CountyLine from './CountyLine';
import { cityState } from '../../lib/places';
import {
  DetailFacts,
  DetailHeader,
  DetailSection,
  RecordList,
  RecordRow,
  ShowAll,
  detailActionClass,
} from '../layout/Page';
import { CompanyTag, RecordTags } from '../layout/RecordTag';
import { type Head, streetAddress, factLinkClass, Footprint, OpenJobsSection, CAREERS_SHOWN } from './parts';

/**
 * A factory's page. It is about this factory and shows only what is known of
 * it: headed Factory, with its company as a tag under the name (the way to
 * the company's page); how many people, what it makes; where it is, drawn
 * alone on the map so the page is not taken for the company's; its open jobs;
 * its own careers (of its open jobs, its company's versions, those recorded
 * for it); more of the company's factories. Nothing about its industry in
 * general, and nothing about other companies. The same story its panel on the
 * map tells, with room for all of it.
 */
export default function FactoryDetailView({ data, head }: { data: FactoryDetail; head: Head }) {
  const [showAllCareers, setShowAllCareers] = useState(false);
  const name = formatFactoryName(data.name);
  const company = data.company;
  const companyName = company ? formatCompanyName(company.name) : null;
  const place = cityState(data.city, data.state);
  const industry = data.industry ? industryLabel(data.industry) : data.specialization;
  // The factory's industry is a page of its own, for the factory's state.
  const industryPage = industryPath(data.industry, { state: data.state });
  const underConstruction = data.status === 'under construction';
  const jobs = data.jobs ?? [];
  const nearby = useMemo(() => data.nearby ?? [], [data.nearby]);
  const latitude = parseFloat(data.latitude);
  const longitude = parseFloat(data.longitude);
  const located = Number.isFinite(latitude) && Number.isFinite(longitude);
  const plantCount = company?.siteCount ?? 0;
  // A company whose one factory this is, under the same name, would only repeat the heading.
  const companyIsThisPlant =
    companyName !== null && plantCount <= 1 && !company?.description && name.toLowerCase().startsWith(companyName.toLowerCase());
  const street = streetAddress(data);
  const careers = data.careers ?? [];

  // This factory alone: a map of the company's factories is the company's page.
  const points = useMemo(
    () => (located ? [{ id: data.id, latitude, longitude, label: formatFactoryName(data.name) }] : []),
    [data.id, data.name, located, latitude, longitude]
  );

  return (
    <>
      <DetailHeader
        {...head}
        kind="Factory"
        title={name}
        // The company's mark stands before the name only where no tag under it names the company.
        mark={companyName && companyIsThisPlant ? <CompanyLogo name={companyName} domain={company?.domain} size={44} /> : undefined}
        description={data.description}
        action={
          located ? (
            <Link to={`/map?factory=${data.id}`} className={detailActionClass} data-open-map>
              Open on the map
            </Link>
          ) : undefined
        }
      >
        {(place || industry || underConstruction) && (
          <DetailFacts>
            {place}
            {place && industry ? ' · ' : ''}
            {industry && industryPage ? (
              <Link to={industryPage} className={factLinkClass}>
                {industry}
              </Link>
            ) : (
              industry
            )}
            {underConstruction ? `${place || industry ? ' · ' : ''}Under construction` : ''}
          </DetailFacts>
        )}
        {/* Who runs it: the company, as the tag every heading names a company with. */}
        {company && !companyIsThisPlant && (
          <RecordTags>
            <CompanyTag company={company} data-factory-company="" />
          </RecordTags>
        )}
      </DetailHeader>

      {/* What it is: how many people, what it makes, since when */}
      <PlantFacts factory={data} />

      {/* Where it is. The town is in the heading; the street is said here, once. */}
      {located && (
        <Footprint points={points} emphasis={data.id}>
          {street && <p className="border-t border-line px-4 py-3 text-sm text-text-2">{street}</p>}
          {/* The county it stands in, and manufacturing there: official figures, about the county. */}
          <CountyLine factoryId={data.id} className="border-t border-line px-4 py-3" />
        </Footprint>
      )}

      {/* Open jobs: said only when there are some */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} said={{ factory: true }} total={data.openJobCount} all={`/jobs?plant=${data.id}`} />}

      {/* Its own careers: of its open jobs (with how many are open), its company's versions, those recorded for it */}
      {careers.length > 0 && (
        <DetailSection id="occupations" title="Careers here">
          <RecordList footer={careers.length > CAREERS_SHOWN && <ShowAll open={showAllCareers} total={careers.length} onToggle={() => setShowAllCareers((value) => !value)} />}>
            {(showAllCareers ? careers : careers.slice(0, CAREERS_SHOWN)).map((career) => (
              <RecordRow
                key={career.id}
                to={career.version && company ? versionPath(career.id, company) : `/occupations/${career.id}`}
                title={career.title}
                subtitle={ownCareerLine(career)}
              />
            ))}
          </RecordList>
        </DetailSection>
      )}

      {/* More of the same company, nearest first. Never another company's. */}
      {nearby.length > 0 && companyName && (
        <DetailSection title={`More ${companyName} factories`}>
          <RecordList>
            {nearby.map((plant) => (
              <RecordRow key={plant.id} to={`/factories/${plant.id}`} title={formatFactoryName(plant.name)} subtitle={cityState(plant.city, plant.state) || null} />
            ))}
          </RecordList>
        </DetailSection>
      )}
    </>
  );
}
