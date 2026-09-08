import { memo, useCallback, type ElementType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2, Factory, Briefcase, Wrench, ChevronRight, MapPin, Boxes, GraduationCap, BookOpen, Clock, Tag, GitBranch, Award, Users,
} from 'lucide-react';
import type { Company, Factory as FactoryType, Occupation, Skill, Ref, School, Program, EntityType } from '../../lib/api';
import { companiesApi, factoriesApi, occupationsApi, skillsApi, refsApi, schoolsApi, programsApi } from '../../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { cn } from '@/lib/utils';

/**
 * The one card. Three fixed-height rows so every card in a grid is the same
 * size and every piece of information sits in the same place:
 *
 *   [icon]  Name                                   ›     32px
 *           one line of descriptive text                 20px  (occupations, skills, refs, schools, programs only)
 *           [tag] [tag] [tag]                            24px  (blank if none)
 *
 * Row 3 tags are, in order: classifiers (category, type, location), a linked
 * parent (company, school), then counts of linked entities. Count tags deep-
 * link into the matching section of the detail page.
 */

type BrowsableType = Exclude<EntityType, 'persons'>;

const ENTITY: Record<BrowsableType, { icon: ElementType; text: string; bg: string }> = {
  companies:   { icon: Building2,     text: 'text-amber-500',   bg: 'bg-amber-500/10' },
  factories:   { icon: Factory,       text: 'text-sky-400',     bg: 'bg-sky-400/10' },
  occupations: { icon: Briefcase,     text: 'text-violet-400',  bg: 'bg-violet-400/10' },
  skills:      { icon: Wrench,        text: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  refs:        { icon: Boxes,         text: 'text-teal-500',    bg: 'bg-teal-500/10' },
  schools:     { icon: GraduationCap, text: 'text-indigo-500',  bg: 'bg-indigo-500/10' },
  programs:    { icon: BookOpen,      text: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10' },
};

/** Industry value the bulk import stamped on nearly every company; not worth a line. */
const GENERIC_INDUSTRY = 'manufacturing';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

const TAG_BASE =
  'relative z-10 inline-flex h-6 shrink-0 select-none items-center gap-1 rounded border border-border-subtle bg-bg-base/60 px-1.5 text-[11px] leading-none';

/** Count of linked entities — icon in the target entity's colour, deep-links to that section. */
function CountTag({ type, count, one, many, to }: { type: BrowsableType; count?: number; one: string; many: string; to: string }) {
  if (!count) return null;
  const Icon = ENTITY[type].icon;
  return (
    <Link to={to} title={`${count.toLocaleString()} ${plural(count, one, many)}`} className={cn(TAG_BASE, 'transition-colors hover:border-border-strong hover:bg-bg-elevated')}>
      <Icon className={cn('h-3 w-3', ENTITY[type].text)} />
      <span className="font-medium tabular-nums text-fg-default">{formatCount(count)}</span>
      <span className="text-fg-soft">{plural(count, one, many)}</span>
    </Link>
  );
}

/** Classifier or location — muted, not clickable. */
function AttrTag({ icon: Icon, value, title }: { icon: ElementType; value?: string | null; title?: string }) {
  if (!value) return null;
  return (
    <span title={title ?? value} className={cn(TAG_BASE, 'min-w-0 max-w-[11rem] cursor-default text-fg-muted')}>
      <Icon className="h-3 w-3 shrink-0 text-fg-soft" />
      <span className="truncate">{value}</span>
    </span>
  );
}

/** Linked parent entity (company, school) — coloured icon, clickable. */
function LinkTag({ type, value, to }: { type: BrowsableType; value?: string | null; to?: string | null }) {
  if (!value || !to) return null;
  const Icon = ENTITY[type].icon;
  return (
    <Link to={to} title={value} className={cn(TAG_BASE, 'min-w-0 max-w-[11rem] transition-colors hover:border-border-strong hover:bg-bg-elevated')}>
      <Icon className={cn('h-3 w-3 shrink-0', ENTITY[type].text)} />
      <span className="truncate text-fg-default">{value}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

interface ShellProps {
  type: BrowsableType;
  to: string;
  name: string;
  /** Row 2, joined with " · " into one truncating line. Omit the prop entirely to drop the row (companies, factories). */
  meta?: (string | null | undefined | false)[];
  /** Row 3. */
  tags?: ReactNode;
  onMouseEnter?: () => void;
}

function CardShell({ type, to, name, meta, tags, onMouseEnter }: ShellProps) {
  const cfg = ENTITY[type];
  const Icon = cfg.icon;
  const metaText = (meta ?? []).filter((m): m is string => typeof m === 'string' && m.trim().length > 0).join(' · ');
  return (
    <article
      onMouseEnter={onMouseEnter}
      className="group relative flex h-full min-w-0 flex-col rounded-lg border border-border-subtle bg-bg-surface p-3 transition-colors hover:border-border-strong hover:bg-bg-elevated"
    >
      <div className="flex h-8 min-w-0 items-center gap-2.5">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', cfg.bg)}>
          <Icon className={cn('h-4 w-4', cfg.text)} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-medium leading-6 text-fg-default">
          {/* Stretched link: the pseudo-element makes the whole card the click target. */}
          <Link
            to={to}
            className="after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent-primary"
          >
            {name}
          </Link>
        </h3>
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" />
      </div>

      {meta !== undefined && (
        <p className="mt-1.5 h-5 truncate pl-[42px] text-xs leading-5 text-fg-muted" title={metaText || undefined}>
          {metaText}
        </p>
      )}

      {/* Fixed-height, wrapping row: tags that don't fit wrap onto a hidden second line instead of being cut mid-word. */}
      <div className="mt-2 flex h-6 min-w-0 flex-wrap content-start items-center gap-1.5 overflow-hidden pl-[42px]">
        {tags}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Per-type cards — only decide what fills the three rows
// ---------------------------------------------------------------------------

type CardProps<T> = { data: T; onMouseEnter?: () => void };

function CompanyCard({ data, onMouseEnter }: CardProps<Company>) {
  const industry = data.industry && data.industry.trim().toLowerCase() !== GENERIC_INDUSTRY ? data.industry : null;
  const base = `/companies/${data.id}`;
  return (
    <CardShell
      type="companies" to={base} name={formatCompanyName(data.name)} onMouseEnter={onMouseEnter}
      tags={
        <>
          <CountTag type="factories" count={data.factoryCount} one="factory" many="factories" to={`${base}#factories`} />
          <CountTag type="occupations" count={data.occupationCount} one="occupation" many="occupations" to={`${base}#occupations`} />
          {data.totalWorkforce ? (
            <span title={`${data.totalWorkforce.toLocaleString()} workforce`} className={cn(TAG_BASE, 'cursor-default text-fg-muted')}>
              <Users className="h-3 w-3 text-fg-soft" />
              <span className="font-medium tabular-nums text-fg-default">{formatCount(data.totalWorkforce)}</span>
              <span className="text-fg-soft">workforce</span>
            </span>
          ) : null}
          <AttrTag icon={Tag} value={industry} />
        </>
      }
    />
  );
}

function FactoryCard({ data, onMouseEnter }: CardProps<FactoryType>) {
  const base = `/factories/${data.id}`;
  return (
    <CardShell
      type="factories" to={base} name={formatFactoryName(data.name)} onMouseEnter={onMouseEnter}
      tags={
        <>
          <AttrTag icon={MapPin} value={data.state} />
          <LinkTag type="companies" value={data.companyName ? formatCompanyName(data.companyName) : null} to={data.companyId ? `/companies/${data.companyId}` : null} />
          <CountTag type="occupations" count={data.occupationCount} one="occupation" many="occupations" to={`${base}#occupations`} />
        </>
      }
    />
  );
}

function OccupationCard({ data, onMouseEnter }: CardProps<Occupation>) {
  const base = `/occupations/${data.id}`;
  return (
    <CardShell
      type="occupations" to={base} name={data.title} onMouseEnter={onMouseEnter}
      meta={[data.description]}
      tags={
        <>
          <CountTag type="skills" count={data.skillCount} one="skill" many="skills" to={`${base}#skills`} />
          <CountTag type="factories" count={data.factoryCount} one="factory" many="factories" to={`${base}#factories`} />
        </>
      }
    />
  );
}

function SkillCard({ data, onMouseEnter }: CardProps<Skill>) {
  const base = `/skills/${data.id}`;
  return (
    <CardShell
      type="skills" to={base} name={data.name} onMouseEnter={onMouseEnter}
      meta={[data.description]}
      tags={
        <>
          <AttrTag icon={Tag} value={data.category} />
          <CountTag type="occupations" count={data.occupationCount} one="occupation" many="occupations" to={`${base}#occupations`} />
          <CountTag type="programs" count={data.programCount} one="program" many="programs" to={`${base}#programs`} />
          {data.childCount ? (
            <span title={`${data.childCount} sub-skills`} className={cn(TAG_BASE, 'cursor-default text-fg-muted')}>
              <GitBranch className="h-3 w-3 text-fg-soft" />
              <span className="font-medium tabular-nums text-fg-default">{data.childCount}</span>
              <span className="text-fg-soft">{plural(data.childCount, 'sub-skill', 'sub-skills')}</span>
            </span>
          ) : null}
        </>
      }
    />
  );
}

function RefCard({ data, onMouseEnter }: CardProps<Ref>) {
  const base = `/refs/${data.id}`;
  return (
    <CardShell
      type="refs" to={base} name={data.name} onMouseEnter={onMouseEnter}
      meta={[data.description]}
      tags={
        <>
          <AttrTag icon={Tag} value={data.type} />
          <AttrTag icon={Building2} value={data.manufacturer} title={data.manufacturer ? `Manufacturer: ${data.manufacturer}` : undefined} />
          <CountTag type="skills" count={data.skillCount} one="skill" many="skills" to={`${base}#skills`} />
        </>
      }
    />
  );
}

function SchoolCard({ data, onMouseEnter }: CardProps<School>) {
  const base = `/schools/${data.id}`;
  return (
    <CardShell
      type="schools" to={base} name={data.name} onMouseEnter={onMouseEnter}
      meta={[data.description]}
      tags={
        <>
          <AttrTag icon={MapPin} value={data.state} />
          <AttrTag icon={Tag} value={data.schoolType} />
          <CountTag type="programs" count={data.programCount} one="program" many="programs" to={`${base}#programs`} />
        </>
      }
    />
  );
}

function ProgramCard({ data, onMouseEnter }: CardProps<Program>) {
  const base = `/programs/${data.id}`;
  return (
    <CardShell
      type="programs" to={base} name={data.title} onMouseEnter={onMouseEnter}
      meta={[data.description]}
      tags={
        <>
          <LinkTag type="schools" value={data.schoolName} to={data.schoolId ? `/schools/${data.schoolId}` : null} />
          <AttrTag icon={Award} value={data.credentialType} />
          <CountTag type="skills" count={data.skillCount} one="skill" many="skills" to={`${base}#skills`} />
          {data.durationHours ? (
            <span title={`${data.durationHours.toLocaleString()} hours`} className={cn(TAG_BASE, 'cursor-default text-fg-muted')}>
              <Clock className="h-3 w-3 text-fg-soft" />
              <span className="font-medium tabular-nums text-fg-default">{formatCount(data.durationHours)}</span>
              <span className="text-fg-soft">hours</span>
            </span>
          ) : null}
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Dispatcher + hover prefetch (detail pages use queryKey [type, id])
// ---------------------------------------------------------------------------

interface EntityCardProps {
  type: EntityType;
  data: Company | FactoryType | Occupation | Skill | Ref | School | Program;
}

const FETCHERS: Record<BrowsableType, (id: string) => Promise<unknown>> = {
  companies: companiesApi.get,
  factories: factoriesApi.get,
  occupations: occupationsApi.get,
  skills: skillsApi.get,
  refs: refsApi.get,
  schools: schoolsApi.get,
  programs: programsApi.get,
};

function EntityCardInner({ type, data }: EntityCardProps) {
  const queryClient = useQueryClient();
  const prefetch = useCallback(() => {
    if (type === 'persons') return;
    queryClient.prefetchQuery({ queryKey: [type, data.id], queryFn: () => FETCHERS[type](data.id), staleTime: 60_000 });
  }, [queryClient, type, data.id]);

  switch (type) {
    case 'companies':   return <CompanyCard data={data as Company} onMouseEnter={prefetch} />;
    case 'factories':   return <FactoryCard data={data as FactoryType} onMouseEnter={prefetch} />;
    case 'occupations': return <OccupationCard data={data as Occupation} onMouseEnter={prefetch} />;
    case 'skills':      return <SkillCard data={data as Skill} onMouseEnter={prefetch} />;
    case 'refs':        return <RefCard data={data as Ref} onMouseEnter={prefetch} />;
    case 'schools':     return <SchoolCard data={data as School} onMouseEnter={prefetch} />;
    case 'programs':    return <ProgramCard data={data as Program} onMouseEnter={prefetch} />;
    default:            return null;
  }
}

const EntityCard = memo(EntityCardInner);
export default EntityCard;
