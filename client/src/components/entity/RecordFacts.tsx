import { Link } from 'react-router-dom';
import { formatCompanyName } from '@shared/displayName';
import { stateName } from '../../lib/places';
import type { CompanyDetail, FactoryDetail, OwnCareer } from '../../lib/api';
import CompanyLogo from '../CompanyLogo';
import { RecordList, RecordRow } from '../layout/Page';

/**
 * The deeper facts a factory or a company has when its record was written from
 * sources: how many people, what is made, when it opened, what it is part of.
 * Every piece shows only when it is known, so a bare record's page is as it
 * was. Where a fact was read is kept with the record (the API still gives it,
 * and an admin sees it in the editor); the page states the fact and no more.
 */

const quietLink = 'underline transition-colors hover:text-text-1';

/** "4,500 people". */
export function peopleCount(people: number): string {
  return `${people.toLocaleString()} ${people === 1 ? 'person' : 'people'}`;
}

/** A factory's facts, said plainly: "4,500 people, 2024", then what it makes and the year it opened. */
export function PlantFacts({
  factory,
}: {
  factory: Partial<Pick<FactoryDetail, 'workforceSize' | 'workforceYear' | 'products' | 'openedYear'>>;
}) {
  const people = factory.workforceSize && factory.workforceSize > 0 ? factory.workforceSize : null;
  const rows: [string, string][] = [];
  if (factory.products) rows.push(['Makes', factory.products]);
  if (factory.openedYear) rows.push(['Opened', String(factory.openedYear)]);
  if (!people && rows.length === 0) return null;
  return (
    <div className="mt-6" data-plant-facts>
      {people && (
        <p className="text-2xl font-medium leading-tight tracking-tight text-text-1">
          {peopleCount(people)}
          {factory.workforceYear && <span className="text-text-2">, {factory.workforceYear}</span>}
        </p>
      )}
      {rows.length > 0 && (
        <dl className={`grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm ${people ? 'mt-4' : ''}`}>
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text-3">{label}</dt>
              <dd className="min-w-0 break-words text-text-1">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** "Fort Worth, Texas", or "Geneva, Switzerland" for a headquarters outside the country. */
function placeOf(headquarters: NonNullable<CompanyDetail['headquarters']>): string {
  const state = headquarters.state ? stateName(headquarters.state) : null;
  const country = headquarters.country && !/^(us|usa|united states)$/i.test(headquarters.country) ? headquarters.country : null;
  return [headquarters.city, state ?? country].filter(Boolean).join(', ');
}

/**
 * Where a company stands: what it is part of, where its headquarters are, and
 * how many people it has in a state when that is known. One quiet line
 * under the company's facts.
 */
export function CompanyStanding({ data }: { data: CompanyDetail }) {
  const parent = data.parent ?? null;
  const headquarters = data.headquarters ?? null;
  const people = data.peopleByState ?? [];
  if (!parent && !headquarters && people.length === 0) return null;
  const parts: React.ReactNode[] = [];
  if (parent) {
    parts.push(
      <span key="parent">
        Part of{' '}
        <Link to={`/companies/${parent.slug ?? parent.id}`} className={`text-text-1 ${quietLink}`}>
          {formatCompanyName(parent.name)}
        </Link>
      </span>
    );
  }
  if (headquarters) parts.push(<span key="hq">Headquarters in {placeOf(headquarters)}</span>);
  for (const entry of people.slice(0, 3)) {
    const where = stateName(entry.state);
    parts.push(
      <span key={entry.state}>
        {`${peopleCount(entry.people)} in ${where}`}
        {entry.year ? `, ${entry.year}` : ''}
      </span>
    );
  }
  return (
    <p className="mt-1.5 text-sm text-text-2" data-company-standing>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && ' · '}
          {part}
        </span>
      ))}
    </p>
  );
}

/** The companies that are part of this one, each with how many factories it has. */
export function CompanyFamily({ companies }: { companies: NonNullable<CompanyDetail['subsidiaries']> }) {
  return (
    <RecordList data-company-family="">
      {companies.map((company) => {
        const name = formatCompanyName(company.name);
        return (
          <RecordRow
            key={company.id}
            to={`/companies/${company.slug ?? company.id}`}
            lead={<CompanyLogo name={name} domain={company.domain} size={32} />}
            title={name}
            subtitle={company.factoryCount > 0 ? `${company.factoryCount.toLocaleString()} ${company.factoryCount === 1 ? 'factory' : 'factories'}` : null}
          />
        );
      })}
    </RecordList>
  );
}

/**
 * What stands under one of a subject's own careers: how many jobs are open for
 * it ("12 open"), else how many people are recorded in it. Null when the
 * career is listed only because the company has its own version of it.
 */
export function ownCareerLine(career: OwnCareer): string | null {
  if (career.openJobs > 0) return `${career.openJobs.toLocaleString()} open`;
  if (career.people) return peopleCount(career.people);
  return null;
}
