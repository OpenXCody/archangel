import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { type FactoryDetail } from '../../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { industryLabel, industryPath } from '@shared/industry';
import CompanyLogo from '../CompanyLogo';
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
import { plural } from '@/lib/utils';
import { type Head, streetAddress, factLinkClass, Footprint, OpenJobsSection, CAREERS_SHOWN, TypicalCareers } from './parts';

/**
 * A plant's page: where it is, how many people, what it makes, who runs it,
 * whether it is hiring, the company's other plants and the careers there.
 * The same story its panel on the map tells, with room for all of it.
 */
export default function FactoryDetailView({ data, head }: { data: FactoryDetail; head: Head }) {
  const [showAllCareers, setShowAllCareers] = useState(false);
  const name = formatFactoryName(data.name);
  const company = data.company;
  const companyName = company ? formatCompanyName(company.name) : null;
  const place = cityState(data.city, data.state);
  const industry = data.industry ? industryLabel(data.industry) : data.specialization;
  // The plant's industry is a page of its own, for the plant's state.
  const industryPage = industryPath(data.industry, { state: data.state });
  const underConstruction = data.status === 'under construction';
  const jobs = data.jobs ?? [];
  const nearby = useMemo(() => data.nearby ?? [], [data.nearby]);
  const latitude = parseFloat(data.latitude);
  const longitude = parseFloat(data.longitude);
  const located = Number.isFinite(latitude) && Number.isFinite(longitude);
  const plantCount = company?.siteCount ?? 0;
  const stateCount = company?.stateCount ?? 0;
  // A company whose one plant this is, under the same name, would only repeat the heading.
  const companyIsThisPlant =
    companyName !== null && plantCount <= 1 && !company?.description && name.toLowerCase().startsWith(companyName.toLowerCase());
  const street = streetAddress(data);
  const careers = data.occupations ?? [];
  const counted = careers.some((career) => (career.headcount ?? 0) > 0);

  // This plant, marked, among the company's nearest others.
  const points = useMemo(
    () => [
      ...(located ? [{ id: data.id, latitude, longitude, label: formatFactoryName(data.name) }] : []),
      ...nearby
        .map((plant) => ({ id: plant.id, latitude: parseFloat(plant.latitude), longitude: parseFloat(plant.longitude), label: formatFactoryName(plant.name) }))
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)),
    ],
    [data.id, data.name, located, latitude, longitude, nearby]
  );

  return (
    <>
      <DetailHeader
        {...head}
        kind="Plant"
        title={name}
        mark={companyName ? <CompanyLogo name={companyName} domain={company?.domain} size={44} className="rounded-lg" /> : undefined}
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
      </DetailHeader>

      {/* What it is: how many people, what it makes, since when */}
      <PlantFacts factory={data} />

      {/* Where it is. The town is in the heading; the street is said here, once. */}
      {located && (
        <Footprint points={points} emphasis={data.id}>
          {street && <p className="border-t border-border-subtle px-4 py-3 text-sm text-fg-muted sm:px-6">{street}</p>}
          {/* The county it stands in, and manufacturing there: official figures, about the county. */}
          <CountyLine factoryId={data.id} className="border-t border-border-subtle px-4 py-3 sm:px-6" />
        </Footprint>
      )}

      {/* Open jobs: said only when there are some */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} showCareer />}

      {/* Who runs it */}
      {company && companyName && !companyIsThisPlant && (
        <DetailSection title="Company">
          <RecordList>
            <RecordRow
              to={`/companies/${company.slug ?? company.id}`}
              lead={<CompanyLogo name={companyName} domain={company.domain} size={32} className="rounded-md" />}
              title={companyName}
              // One plant is this one: counting it says nothing.
              subtitle={plantCount > 1 ? `${plural(plantCount, 'plant', 'plants')}${stateCount > 1 ? ` in ${stateCount} states` : ''}` : null}
            />
          </RecordList>
        </DetailSection>
      )}

      {/* The company's other plants, closest first */}
      {nearby.length > 0 && companyName && (
        <DetailSection title={`Other ${companyName} plants`}>
          <RecordList>
            {nearby.map((plant) => (
              <RecordRow key={plant.id} to={`/factories/${plant.id}`} title={formatFactoryName(plant.name)} subtitle={cityState(plant.city, plant.state) || null} />
            ))}
          </RecordList>
        </DetailSection>
      )}

      {/* Careers recorded at this plant, with how many people where that is known; else its industry's */}
      {careers.length > 0 && (
        <DetailSection id="occupations" title="Careers here" column={counted ? 'People' : undefined}>
          <RecordList>
            {(showAllCareers ? careers : careers.slice(0, CAREERS_SHOWN)).map((career) => (
              <RecordRow
                key={career.id}
                to={`/occupations/${career.id}`}
                title={career.title}
                figure={counted ? (career.headcount ?? 0) || null : undefined}
                figureLabel="people"
              />
            ))}
          </RecordList>
          {careers.length > CAREERS_SHOWN && (
            <ShowAll open={showAllCareers} total={careers.length} onToggle={() => setShowAllCareers((value) => !value)} />
          )}
        </DetailSection>
      )}
      {careers.length === 0 && (data.typicalCareers?.length ?? 0) > 0 && <TypicalCareers careers={data.typicalCareers ?? []} />}

    </>
  );
}
