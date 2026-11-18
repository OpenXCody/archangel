import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatCompanyName } from '@shared/displayName';
import { STATE_CODE_TO_NAME, type StateCode } from '@shared/states';
import type { CompanyDetail, FactoryDetail, RecordSource } from '../lib/api';
import CompanyLogo from './CompanyLogo';

/**
 * The deeper facts a plant or a company has when its record was written from
 * sources: how many people, what is made, when it opened, what it is part of,
 * and where each of those was read. Every piece shows only when it is known,
 * so a bare record's page is as it was.
 */

const quietLink = 'underline decoration-border-strong underline-offset-4 transition-colors hover:text-fg-default hover:decoration-fg-muted';

/** "https://www.example.com/page" as "example.com". */
function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

/** A source named by its site, opening the page it is stated on. */
function SourceLink({ url, label }: { url: string; label?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={quietLink}>
      {label ?? siteOf(url)}
    </a>
  );
}

/** "4,500 people". */
export function peopleCount(people: number): string {
  return `${people.toLocaleString()} ${people === 1 ? 'person' : 'people'}`;
}

/**
 * A plant's facts, said plainly: "4,500 people, 2024" with where that was
 * read, then what it makes and the year it opened.
 */
export function PlantFacts({ factory }: { factory: Pick<FactoryDetail, 'workforceSize' | 'workforceYear' | 'workforceSource' | 'workforceNote' | 'products' | 'openedYear'> }) {
  const people = factory.workforceSize && factory.workforceSize > 0 ? factory.workforceSize : null;
  const rows: [string, string][] = [];
  if (factory.products) rows.push(['Makes', factory.products]);
  if (factory.openedYear) rows.push(['Opened', String(factory.openedYear)]);
  if (!people && rows.length === 0) return null;
  return (
    <div className="mt-6" data-plant-facts>
      {people && (
        <>
          <p className="text-2xl font-medium leading-tight tracking-tight text-fg-default">
            {peopleCount(people)}
            {factory.workforceYear && <span className="text-fg-muted">, {factory.workforceYear}</span>}
          </p>
          {(factory.workforceSource || factory.workforceNote) && (
            <p className="mt-1 text-sm text-fg-muted">
              {factory.workforceSource && <SourceLink url={factory.workforceSource} />}
              {factory.workforceSource && factory.workforceNote && ' · '}
              {factory.workforceNote}
            </p>
          )}
        </>
      )}
      {rows.length > 0 && (
        <dl className={`grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm ${people ? 'mt-4' : ''}`}>
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-fg-soft">{label}</dt>
              <dd className="min-w-0 break-words text-fg-default">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Where a page's facts came from, quietly, at its foot. */
export function SourceList({ sources }: { sources: RecordSource[] | undefined }) {
  if (!sources || sources.length === 0) return null;
  return (
    <p className="mt-10 break-words text-xs leading-relaxed text-fg-soft" data-sources>
      {sources.length === 1 ? 'Source' : 'Sources'}:{' '}
      {sources.map((source, index) => (
        <span key={source.url}>
          {index > 0 && ', '}
          <SourceLink url={source.url} label={source.label} />
        </span>
      ))}
    </p>
  );
}

/** "Fort Worth, Texas", or "Geneva, Switzerland" for a headquarters outside the country. */
function placeOf(headquarters: NonNullable<CompanyDetail['headquarters']>): string {
  const state = headquarters.state ? (STATE_CODE_TO_NAME[headquarters.state as StateCode] ?? headquarters.state) : null;
  const country = headquarters.country && !/^(us|usa|united states)$/i.test(headquarters.country) ? headquarters.country : null;
  return [headquarters.city, state ?? country].filter(Boolean).join(', ');
}

/**
 * Where a company stands: what it is part of, where its headquarters are, and
 * how many people it has in a state when a source says so. One quiet line
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
        <Link to={`/companies/${parent.slug ?? parent.id}`} className={`text-fg-default ${quietLink}`}>
          {formatCompanyName(parent.name)}
        </Link>
      </span>
    );
  }
  if (headquarters) parts.push(<span key="hq">Headquarters in {placeOf(headquarters)}</span>);
  for (const entry of people.slice(0, 3)) {
    const where = STATE_CODE_TO_NAME[entry.state as StateCode] ?? entry.state;
    parts.push(
      <span key={entry.state}>
        {entry.source ? (
          <SourceLink url={entry.source} label={`${peopleCount(entry.people)} in ${where}`} />
        ) : (
          `${peopleCount(entry.people)} in ${where}`
        )}
        {entry.year ? `, ${entry.year}` : ''}
      </span>
    );
  }
  return (
    <p className="mt-1.5 text-sm text-fg-muted" data-company-standing>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && ' · '}
          {part}
        </span>
      ))}
    </p>
  );
}

/** The companies that are part of this one. */
export function CompanyFamily({ companies }: { companies: NonNullable<CompanyDetail['subsidiaries']> }) {
  return (
    <ul className="overflow-hidden rounded-xl border border-border-subtle bg-bg-surface" data-company-family>
      {companies.map((company) => {
        const name = formatCompanyName(company.name);
        const detail = [
          company.factoryCount > 0 ? `${company.factoryCount.toLocaleString()} ${company.factoryCount === 1 ? 'site' : 'sites'}` : null,
          company.industry && company.industry !== 'Manufacturing' ? company.industry : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={company.id} className="border-b border-border-subtle last:border-b-0">
            <Link
              to={`/companies/${company.slug ?? company.id}`}
              className="group flex min-h-[56px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-elevated"
            >
              <CompanyLogo name={name} domain={company.domain} size={32} className="rounded-md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg-default">{name}</span>
                {detail && <span className="block truncate text-xs text-fg-muted">{detail}</span>}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft group-hover:text-fg-default" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
