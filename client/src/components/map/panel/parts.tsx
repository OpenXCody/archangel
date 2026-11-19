import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Factory, Briefcase, ChevronRight } from 'lucide-react';
import { type CareerJob } from '../../../lib/api';
import { useMapStore } from '../../../stores/mapStore';
import { formatCompanyName } from '@shared/displayName';
import { formatPay } from '../../../lib/jobFormat';

/*
 * Words, the same in every panel:
 *   plant   a factory, wherever the panel speaks about a place of work
 *   people  how many work somewhere (never "workforce", "workers", "headcount", "positions")
 *   career  an occupation
 *   industry  one of the 21, by its short name (`shownIndustry`); a company's is the
 *             one most of its plants are in, never the free text on its record
 * Every number sits under or beside a label, and a section with nothing to
 * say is left out rather than shown as "0".
 *
 * Every panel runs in the order a person asks: what is this, who is here,
 * what work is here, where next.
 */

/** A titled part of a panel. `column` labels the figures down its right edge. */
export function Section({ title, column, children }: { title: string; column?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-fg-muted">{title}</h3>
        {column && <span className="shrink-0 text-[11px] uppercase tracking-wider text-fg-soft">{column}</span>}
      </div>
      {children}
    </section>
  );
}

/** Labelled figures, side by side. Give it only figures that have something to say. */
export function Figures({ items }: { items: { label: string; value: number }[] }) {
  if (items.length === 0) return null;
  return (
    <dl className={`mb-6 grid gap-2 ${items.length >= 3 ? 'grid-cols-3' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2.5">
          <dt className="truncate text-[11px] uppercase tracking-wider text-fg-muted">{item.label}</dt>
          <dd className="mt-0.5 truncate text-lg font-semibold tabular-nums text-fg-default">{item.value.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The panel's title block. */
export function Heading({ title, subtitle, logo }: { title: string; subtitle?: ReactNode; logo?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {logo}
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-xl font-semibold leading-snug tracking-tight text-fg-default">{title}</h2>
        {subtitle && <div className="mt-1 text-sm text-fg-muted">{subtitle}</div>}
      </div>
    </div>
  );
}

/** A row that leads somewhere in the panel: a company, a career, a skill, a plant. */
export function NodeRow({
  icon: Icon,
  logo,
  title,
  subtitle,
  onPress,
  onHover,
}: {
  icon?: typeof Factory;
  logo?: ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  onHover?: (over: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
      className="map-row group flex w-full items-center gap-3 border-b border-border-subtle bg-bg-elevated px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-tint/5"
    >
      {logo ?? (Icon && <Icon className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />)}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg-default">{title}</span>
        {subtitle && <span className="block truncate text-xs text-fg-muted">{subtitle}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft transition-colors group-hover:text-fg-default" aria-hidden="true" />
    </button>
  );
}

/** Rows that belong together, as one bordered list. */
export function RowList({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-lg border border-border-subtle">{children}</div>;
}

/** The way on from a panel: the full page of what it is about. */
export function PageLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="map-row mb-2 flex w-full items-center justify-center rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-fg-default transition-colors hover:bg-bg-elevated"
    >
      {children}
    </Link>
  );
}

export function CareerRows({ careers, limit }: { careers: { id: string; title: string; subtitle?: string }[]; limit: number }) {
  const selectEntity = useMapStore((s) => s.selectEntity);
  return (
    <RowList>
      {careers.slice(0, limit).map((career) => (
        <NodeRow
          key={career.id}
          icon={Briefcase}
          title={career.title}
          subtitle={career.subtitle}
          onPress={() => selectEntity('occupation', career.id, career.title)}
        />
      ))}
    </RowList>
  );
}

/** `company`: name the company on each row, where the panel is not about one. */
export function JobRows({ jobs, limit, company = false }: { jobs: CareerJob[]; limit: number; company?: boolean }) {
  return (
    <RowList>
      {jobs.slice(0, limit).map((job) => (
        <Link
          key={job.id}
          to={`/jobs/${job.id}`}
          className="map-row group flex items-center justify-between gap-3 border-b border-border-subtle bg-bg-elevated px-3 py-2.5 transition-colors last:border-b-0 hover:bg-tint/5"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm text-fg-default">{job.title}</span>
            <span className="block truncate text-xs text-fg-muted">
              {company && job.companyName ? `${formatCompanyName(job.companyName)} · ` : ''}
              {formatPay(job.payMin, job.payMax, job.payPeriod)}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft group-hover:text-fg-default" aria-hidden="true" />
        </Link>
      ))}
    </RowList>
  );
}

/** The link under a list to the rest of it. Text-sized for a mouse, tall enough for a finger. */
export const MORE_LINK =
  'mt-2 inline-flex items-center text-xs text-fg-muted underline-offset-4 hover:underline [@media(pointer:coarse)]:mt-0 [@media(pointer:coarse)]:min-h-11';

/** "and 12 more", when a list was cut short. */
export function More({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  if (total <= shown) return null;
  return <p className="mt-2 text-xs text-fg-soft">and {(total - shown).toLocaleString()} more {noun}</p>;
}
