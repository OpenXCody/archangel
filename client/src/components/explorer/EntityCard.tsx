import { memo, useCallback, type ElementType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2, Factory, Briefcase, Wrench, ChevronRight, MapPin, Users, Boxes, GraduationCap, BookOpen, Clock,
} from 'lucide-react';
import type { Company, Factory as FactoryType, Occupation, Skill, Ref, School, Program, EntityType } from '../../lib/api';
import { companiesApi, factoriesApi, occupationsApi, skillsApi, refsApi, schoolsApi, programsApi } from '../../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { cn } from '@/lib/utils';

/**
 * One card layout for every entity type — three fixed rows so a grid of
 * mixed cards lines up and virtualized rows measure identically:
 *
 *   [icon] Name ........................................ ›
 *          one line of context (industry, location, description)
 *          [chip] [chip]   ← counts of linked entities, each a deep link
 */

type BrowsableType = Exclude<EntityType, 'persons'>;

const ENTITY: Record<BrowsableType, { icon: ElementType; text: string; accent: string; hover: string }> = {
  companies:   { icon: Building2,     text: 'text-amber-500',   accent: 'border-l-amber-500',   hover: 'hover:border-amber-500/30' },
  factories:   { icon: Factory,       text: 'text-sky-400',     accent: 'border-l-sky-400',     hover: 'hover:border-sky-400/30' },
  occupations: { icon: Briefcase,     text: 'text-violet-400',  accent: 'border-l-violet-400',  hover: 'hover:border-violet-400/30' },
  skills:      { icon: Wrench,        text: 'text-emerald-500', accent: 'border-l-emerald-500', hover: 'hover:border-emerald-500/30' },
  refs:        { icon: Boxes,         text: 'text-teal-500',    accent: 'border-l-teal-500',    hover: 'hover:border-teal-500/30' },
  schools:     { icon: GraduationCap, text: 'text-indigo-500',  accent: 'border-l-indigo-500',  hover: 'hover:border-indigo-500/30' },
  programs:    { icon: BookOpen,      text: 'text-fuchsia-500', accent: 'border-l-fuchsia-500', hover: 'hover:border-fuchsia-500/30' },
};

/** Industry value the bulk import stamped on nearly every company; not worth a line. */
const GENERIC_INDUSTRY = 'manufacturing';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

interface ChipProps {
  icon: ElementType;
  iconClass: string;
  value: ReactNode;
  label?: string;
  to?: string;
  title?: string;
}

/** Linked-entity count. Sits above the card's stretched link so it's independently clickable. */
function Chip({ icon: Icon, iconClass, value, label, to, title }: ChipProps) {
  const cls = cn(
    'relative z-10 inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.03] px-2 text-xs',
    to && 'transition-colors hover:border-white/10 hover:bg-white/[0.07]',
  );
  const body = (
    <>
      <Icon className={cn('h-3 w-3 shrink-0', iconClass)} />
      <span className="min-w-0 truncate font-medium text-fg-default tabular-nums">{value}</span>
      {label && <span className="shrink-0 text-fg-soft">{label}</span>}
    </>
  );
  return to ? (
    <Link to={to} title={title} className={cls}>{body}</Link>
  ) : (
    <span title={title} className={cls}>{body}</span>
  );
}

/** Count chip that renders nothing when there's nothing to count. */
function CountChip({ type, count, one, many, to }: { type: BrowsableType; count?: number; one: string; many: string; to: string }) {
  if (!count) return null;
  return (
    <Chip
      icon={ENTITY[type].icon}
      iconClass={ENTITY[type].text}
      value={formatCount(count)}
      label={plural(count, one, many)}
      to={to}
      title={`${count.toLocaleString()} ${plural(count, one, many)}`}
    />
  );
}

/** "A • B" with nulls dropped. */
function Meta({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter((p) => p !== null && p !== undefined && p !== '' && p !== false);
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((part, i) => (
        <span key={i} className="inline-flex min-w-0 items-center gap-1">
          {i > 0 && <span className="mx-1 text-fg-soft">•</span>}
          <span className="truncate">{part}</span>
        </span>
      ))}
    </>
  );
}

interface ShellProps {
  type: BrowsableType;
  to: string;
  name: string;
  meta?: ReactNode;
  chips?: ReactNode;
  onMouseEnter?: () => void;
}

function CardShell({ type, to, name, meta, chips, onMouseEnter }: ShellProps) {
  const cfg = ENTITY[type];
  const Icon = cfg.icon;
  return (
    <article
      onMouseEnter={onMouseEnter}
      className={cn(
        'group relative flex h-full min-w-0 flex-col gap-2 rounded-xl border border-l-4 border-white/10 bg-white/[0.02] p-3.5 transition-colors hover:bg-white/[0.04]',
        cfg.accent, cfg.hover,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
          <Icon className={cn('h-4 w-4', cfg.text)} />
        </span>
        <h3 className="min-w-0 flex-1 truncate font-medium text-fg-default group-hover:text-white">
          {/* Stretched link: the pseudo-element covers the whole card. */}
          <Link to={to} className="after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-accent-primary">
            {name}
          </Link>
        </h3>
        <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" />
      </div>

      <div className="flex min-h-5 min-w-0 items-center overflow-hidden pl-[42px] text-xs text-fg-muted">
        {meta}
      </div>

      <div className="flex min-h-7 min-w-0 items-center gap-1.5 overflow-hidden pl-[42px]">
        {chips}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Per-type cards: only decide what goes in the three rows
// ---------------------------------------------------------------------------

type CardProps<T> = { data: T; onMouseEnter?: () => void };

function CompanyCard({ data, onMouseEnter }: CardProps<Company>) {
  const industry = data.industry && data.industry.trim().toLowerCase() !== GENERIC_INDUSTRY ? data.industry : null;
  const workforce = data.totalWorkforce && data.totalWorkforce > 0 ? (
    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{formatCount(data.totalWorkforce)} workforce</span>
  ) : null;
  return (
    <CardShell
      type="companies"
      to={`/companies/${data.id}`}
      name={formatCompanyName(data.name)}
      onMouseEnter={onMouseEnter}
      meta={<Meta parts={[industry, workforce]} />}
      chips={
        <>
          <CountChip type="factories" count={data.factoryCount} one="factory" many="factories" to={`/companies/${data.id}#factories`} />
          <CountChip type="occupations" count={data.occupationCount} one="occupation" many="occupations" to={`/companies/${data.id}#occupations`} />
        </>
      }
    />
  );
}

function FactoryCard({ data, onMouseEnter }: CardProps<FactoryType>) {
  const location = data.state ? (
    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{data.state}</span>
  ) : null;
  return (
    <CardShell
      type="factories"
      to={`/factories/${data.id}`}
      name={formatFactoryName(data.name)}
      onMouseEnter={onMouseEnter}
      meta={<Meta parts={[location, data.specialization]} />}
      chips={
        <>
          {data.companyId && data.companyName && (
            <Chip
              icon={ENTITY.companies.icon}
              iconClass={ENTITY.companies.text}
              value={formatCompanyName(data.companyName)}
              to={`/companies/${data.companyId}`}
              title={`Company: ${data.companyName}`}
            />
          )}
          <CountChip type="occupations" count={data.occupationCount} one="occupation" many="occupations" to={`/factories/${data.id}#occupations`} />
        </>
      }
    />
  );
}

function OccupationCard({ data, onMouseEnter }: CardProps<Occupation>) {
  return (
    <CardShell
      type="occupations"
      to={`/occupations/${data.id}`}
      name={data.title}
      onMouseEnter={onMouseEnter}
      meta={<Meta parts={[data.description]} />}
      chips={
        <>
          <CountChip type="skills" count={data.skillCount} one="skill" many="skills" to={`/occupations/${data.id}#skills`} />
          <CountChip type="factories" count={data.factoryCount} one="factory" many="factories" to={`/occupations/${data.id}#factories`} />
        </>
      }
    />
  );
}

function SkillCard({ data, onMouseEnter }: CardProps<Skill & { programCount?: number }>) {
  return (
    <CardShell
      type="skills"
      to={`/skills/${data.id}`}
      name={data.name}
      onMouseEnter={onMouseEnter}
      meta={<Meta parts={[data.category, data.description]} />}
      chips={
        <>
          <CountChip type="occupations" count={data.occupationCount} one="occupation" many="occupations" to={`/skills/${data.id}#occupations`} />
          <CountChip type="programs" count={data.programCount} one="program" many="programs" to={`/skills/${data.id}#programs`} />
        </>
      }
    />
  );
}

function RefCard({ data, onMouseEnter }: CardProps<Ref>) {
  return (
    <CardShell
      type="refs"
      to={`/refs/${data.id}`}
      name={data.name}
      onMouseEnter={onMouseEnter}
      meta={<Meta parts={[data.type, data.manufacturer]} />}
      chips={<CountChip type="skills" count={data.skillCount} one="skill" many="skills" to={`/refs/${data.id}#skills`} />}
    />
  );
}

function SchoolCard({ data, onMouseEnter }: CardProps<School>) {
  const location = data.state ? (
    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{data.state}</span>
  ) : null;
  return (
    <CardShell
      type="schools"
      to={`/schools/${data.id}`}
      name={data.name}
      onMouseEnter={onMouseEnter}
      meta={<Meta parts={[location, data.schoolType]} />}
      chips={<CountChip type="programs" count={data.programCount} one="program" many="programs" to={`/schools/${data.id}#programs`} />}
    />
  );
}

function ProgramCard({ data, onMouseEnter }: CardProps<Program>) {
  const hours = data.durationHours && data.durationHours > 0 ? (
    <Chip icon={Clock} iconClass="text-fg-muted" value={formatCount(data.durationHours)} label="hours" />
  ) : null;
  return (
    <CardShell
      type="programs"
      to={`/programs/${data.id}`}
      name={data.title}
      onMouseEnter={onMouseEnter}
      meta={<Meta parts={[data.schoolName, data.credentialType]} />}
      chips={
        <>
          <CountChip type="skills" count={data.skillCount} one="skill" many="skills" to={`/programs/${data.id}#skills`} />
          {hours}
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

function EntityCardInner({ type, data }: EntityCardProps) {
  const queryClient = useQueryClient();
  const prefetch = useCallback(() => {
    const fetchers: Record<BrowsableType, (id: string) => Promise<unknown>> = {
      companies: companiesApi.get,
      factories: factoriesApi.get,
      occupations: occupationsApi.get,
      skills: skillsApi.get,
      refs: refsApi.get,
      schools: schoolsApi.get,
      programs: programsApi.get,
    };
    if (type === 'persons') return;
    queryClient.prefetchQuery({ queryKey: [type, data.id], queryFn: () => fetchers[type](data.id), staleTime: 60_000 });
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
