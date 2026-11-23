import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import { cn, focusRing } from '@/lib/utils';
import { cityState } from '../../lib/places';
import CompanyLogo from '../CompanyLogo';

/*
 * A record named in a page's heading block, as a tag that opens it: the
 * company a job or a factory belongs to, the factory a job is at, the career
 * it is for. One shape wherever a heading says whose or where: a hairline
 * edge, an 8px corner, no fill; the name in full ink, at most a few quiet
 * words after it. 44px tall under a finger, 36px under a pointer.
 *
 * The kind of record is said to a screen reader ("Company: Caterpillar"); on
 * screen a company is told by its mark, a factory by its place.
 */

interface RecordTagProps {
  to: string;
  /** What kind of record it is, for a screen reader: "Company", "Factory", "Career". */
  kind: string;
  /** A company's mark. */
  lead?: ReactNode;
  name: ReactNode;
  /** A few quiet words after the name: a factory's "City, ST". */
  detail?: ReactNode;
  className?: string;
}

export function RecordTag({ to, kind, lead, name, detail, className, ...rest }: RecordTagProps & Record<`data-${string}`, string | undefined>) {
  return (
    <li className="min-w-0 max-w-full">
      <Link
        to={to}
        className={cn(
          'inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm leading-snug text-text-1 transition-colors hover:border-line-strong hover:bg-surface-hover sm:min-h-9',
          focusRing,
          className
        )}
        data-record-tag={kind.toLowerCase()}
        {...rest}
      >
        {lead}
        <span className="min-w-0 break-words">
          <span className="sr-only">{kind}: </span>
          {name}
          {detail && <span className="text-text-3"> · {detail}</span>}
        </span>
      </Link>
    </li>
  );
}

/** The tags of a heading block, in a row that wraps. */
export function RecordTags({ children, className, ...rest }: { children: ReactNode; className?: string } & Record<`data-${string}`, string | undefined>) {
  return (
    <ul className={cn('mt-3 flex flex-wrap gap-2', className)} data-record-tags {...rest}>
      {children}
    </ul>
  );
}

/** A company, by its mark and name. */
export function CompanyTag({ company, ...rest }: { company: { id: string; slug?: string | null; name: string; domain?: string | null } } & Record<`data-${string}`, string | undefined>) {
  const name = formatCompanyName(company.name);
  return <RecordTag to={`/companies/${company.slug ?? company.id}`} kind="Company" lead={<CompanyLogo name={name} domain={company.domain} size={20} />} name={name} {...rest} />;
}

/** A factory, by its name and "City, ST". */
export function FactoryTag({ factory }: { factory: { id: string; name: string; city?: string | null; state?: string | null } }) {
  const name = formatFactoryName(factory.name);
  const place = cityState(factory.city, factory.state);
  // A factory named for its town alone says the town once.
  return <RecordTag to={`/factories/${factory.id}`} kind="Factory" name={name} detail={place && place.toLowerCase() !== name.toLowerCase() ? place : undefined} />;
}

/** A career, by its title; `to` where the tag leads to a company's version of it. */
export function CareerTag({ career, to, ...rest }: { career: { id: string; title: string }; to?: string } & Record<`data-${string}`, string | undefined>) {
  return <RecordTag to={to ?? `/occupations/${career.id}`} kind="Career" name={career.title} {...rest} />;
}
