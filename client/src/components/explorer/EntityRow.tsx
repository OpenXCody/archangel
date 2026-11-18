import { memo, useCallback, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Company, Factory, Occupation, Skill } from '../../lib/api';
import { companiesApi, factoriesApi, occupationsApi, skillsApi } from '../../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { Skeleton } from '@/components/ui/skeleton';
import CompanyLogo from '../CompanyLogo';
import type { BrowseTab } from './ExploreNav';

/**
 * One row of a browse list. Every type reads the same way:
 *
 *   [logo]  Name
 *           what it is, in a line            (careers, skills)
 *           facts about it, as plain text
 *
 * No tags and no icons: a company is known by its logo, everything else by
 * the list it is in. The whole row is the link.
 */

export type BrowseEntity = Company | Factory | Occupation | Skill;

/** Industry value the bulk import stamped on nearly every company; not worth a line. */
const GENERIC_INDUSTRY = 'manufacturing';
/** Leftovers of the skill tree import in the category column; they say nothing. */
const JUNK_CATEGORIES = new Set(['', 'subcategory', 'category', 'skill', 'root']);

/** A skill category worth showing, or null. */
export function skillCategoryLabel(category: string | null | undefined): string | null {
  const value = category?.trim() ?? '';
  return JUNK_CATEGORIES.has(value.toLowerCase()) ? null : value;
}

const count = (n: number | null | undefined, one: string, many: string): string | null =>
  n ? `${n.toLocaleString()} ${n === 1 ? one : many}` : null;

type Part = string | null | undefined | false;
const joined = (parts: Part[]): string => parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).join(' · ');

interface RowProps {
  to: string;
  name: string;
  /** What it is, in one line. */
  summary?: string | null;
  /** Facts about it, joined into one line of plain text. */
  facts?: Part[];
  /** Leads the row (a company's logo). */
  leading?: ReactNode;
  /** Leads the facts line (a factory's company logo). */
  factsLeading?: ReactNode;
  /** Ends the facts line and is never cut short (a factory's people). */
  factsEnd?: string | null;
  onMouseEnter?: () => void;
}

function Row({ to, name, summary, facts, leading, factsLeading, factsEnd, onMouseEnter }: RowProps) {
  const factsText = joined(facts ?? []);
  return (
    <Link
      to={to}
      onMouseEnter={onMouseEnter}
      className="group flex h-full min-h-[4.25rem] min-w-0 items-center gap-4 border-b border-border-subtle py-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
    >
      {leading}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-medium leading-6 text-fg-default underline-offset-4 group-hover:underline">{name}</h3>
        {summary && <p className="truncate text-sm leading-6 text-fg-muted">{summary}</p>}
        {(factsText || factsLeading || factsEnd) && (
          <p className="flex min-w-0 items-center gap-2 text-sm leading-6 text-fg-soft">
            {factsLeading}
            <span className="min-w-0 truncate">{factsText}</span>
            {factsEnd && <span className="-ml-1 shrink-0 whitespace-nowrap">{factsText ? `· ${factsEnd}` : factsEnd}</span>}
          </p>
        )}
      </div>
    </Link>
  );
}

type Props<T> = { data: T; onMouseEnter?: () => void };

function CompanyRow({ data, onMouseEnter }: Props<Company>) {
  const name = formatCompanyName(data.name);
  const industry = data.industry && data.industry.trim().toLowerCase() !== GENERIC_INDUSTRY ? data.industry : null;
  return (
    <Row
      to={`/companies/${data.slug ?? data.id}`}
      name={name}
      leading={<CompanyLogo name={name} domain={data.domain} size={40} className="rounded-lg" />}
      facts={[count(data.factoryCount, 'site', 'sites'), industry]}
      onMouseEnter={onMouseEnter}
    />
  );
}

function FactoryRow({ data, onMouseEnter }: Props<Factory>) {
  const company = data.companyName ? formatCompanyName(data.companyName) : null;
  // Cities arrive in capitals ("ROUND ROCK").
  const city = data.city ? formatCompanyName(data.city) : null;
  const place = city && data.state ? `${city}, ${data.state}` : city || data.state;
  return (
    <Row
      to={`/factories/${data.id}`}
      name={formatFactoryName(data.name)}
      factsLeading={company && data.companyDomain ? <CompanyLogo name={company} domain={data.companyDomain} size={20} className="rounded" /> : null}
      facts={[company, place]}
      factsEnd={data.workforceSize ? `${data.workforceSize.toLocaleString()} people` : null}
      onMouseEnter={onMouseEnter}
    />
  );
}

const STAGE_NAMES = ['Introduction', 'Fundamentals', 'Advanced'];

function OccupationRow({ data, onMouseEnter }: Props<Occupation>) {
  const stages = data.pathStatus && data.stageCounts ? data.stageCounts.map((n, i) => (n ? `${STAGE_NAMES[i]} ${n}` : null)) : [];
  return (
    <Row
      to={`/occupations/${data.id}`}
      name={data.title}
      summary={data.description}
      facts={[count(data.skillCount, 'skill', 'skills'), ...stages]}
      onMouseEnter={onMouseEnter}
    />
  );
}

function SkillRow({ data, onMouseEnter }: Props<Skill>) {
  const careers = count(data.occupationCount, 'career', 'careers');
  return (
    <Row
      to={`/skills/${data.id}`}
      name={data.name}
      summary={data.description}
      facts={[skillCategoryLabel(data.category), careers && `in ${careers}`]}
      onMouseEnter={onMouseEnter}
    />
  );
}

// Detail pages read queryKey [type, id]: warm it on hover so the page opens filled.
const FETCHERS: Record<BrowseTab, (id: string) => Promise<unknown>> = {
  companies: companiesApi.get,
  factories: factoriesApi.get,
  occupations: occupationsApi.get,
  skills: skillsApi.get,
};

function EntityRowInner({ type, data }: { type: BrowseTab; data: BrowseEntity }) {
  const queryClient = useQueryClient();
  const prefetch = useCallback(() => {
    void queryClient.prefetchQuery({ queryKey: [type, data.id], queryFn: () => FETCHERS[type](data.id), staleTime: 60_000 });
  }, [queryClient, type, data.id]);

  switch (type) {
    case 'companies':   return <CompanyRow data={data as Company} onMouseEnter={prefetch} />;
    case 'factories':   return <FactoryRow data={data as Factory} onMouseEnter={prefetch} />;
    case 'occupations': return <OccupationRow data={data as Occupation} onMouseEnter={prefetch} />;
    case 'skills':      return <SkillRow data={data as Skill} onMouseEnter={prefetch} />;
  }
}

const EntityRow = memo(EntityRowInner);
export default EntityRow;

/** How many text lines a type's rows have, so its placeholder is the same height. */
const LINES: Record<BrowseTab, 2 | 3> = {
  companies: 2,
  factories: 2,
  occupations: 3,
  skills: 3,
};

/** A row's placeholder while its list loads: the same height and shape. */
export function EntityRowSkeleton({ type, index = 0 }: { type: BrowseTab; index?: number }) {
  return (
    <div className="flex min-h-[4.25rem] items-center gap-4 border-b border-border-subtle py-3.5">
      {type === 'companies' && <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />}
      <div className="min-w-0 flex-1">
        <div className="flex h-6 items-center">
          <Skeleton className="h-4" style={{ width: `${32 + ((index * 13) % 28)}%` }} />
        </div>
        {LINES[type] === 3 && (
          <div className="flex h-6 items-center">
            <Skeleton className="h-3" style={{ width: `${60 + ((index * 7) % 30)}%` }} />
          </div>
        )}
        <div className="flex h-6 items-center">
          <Skeleton className="h-3" style={{ width: `${24 + ((index * 11) % 20)}%` }} />
        </div>
      </div>
    </div>
  );
}
