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
 *
 * The panel is the raised surface and has no boxes inside it: a section is a
 * label and what follows it, set apart by space; a list is rows parted by
 * hairlines that run the panel's width; the figures are one row parted by
 * upright hairlines.
 */

/** A label: a section's name, an eyebrow, the word over a column of figures. */
export const LABEL = 'text-xs font-medium uppercase tracking-[0.08em] text-text-2';
export const LABEL_SMALL = 'text-[11px] font-medium uppercase tracking-[0.08em] text-text-2';

/** A row of a list: the panel's width, a hairline under every row but the last. Give it its own vertical padding. */
export const ROW =
  'map-row map-list-row group -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 border-b border-line px-4 text-left transition-colors last:border-b-0 hover:bg-surface-hover';

/** Meta inside a row: it steps up while the row is under the pointer, where --text-3 would fall short of 4.5:1 on the hover fill. */
export const META_IN_ROW = 'text-text-3 transition-colors group-hover:text-text-2';

/** A button that is not the page's one action: an outline, no fill. Give it `flex` or `inline-flex`. */
export const SECONDARY_BUTTON =
  'map-row items-center justify-center rounded-lg border border-line-strong text-sm font-medium text-text-1 transition-colors hover:bg-surface-hover';

/** A small choice that leads elsewhere in the panel: a state, a related skill. */
export const CHIP =
  'map-row inline-flex items-center rounded-md border border-line-strong px-2.5 text-xs text-text-2 transition-colors hover:bg-surface-hover hover:text-text-1';

/** A titled part of a panel. `column` labels the figures down its right edge. */
export function Section({ title, column, children }: { title: string; column?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className={LABEL}>{title}</h3>
        {column && <span className={`shrink-0 ${LABEL_SMALL}`}>{column}</span>}
      </div>
      {children}
    </section>
  );
}

/** Labelled figures in one row, an upright hairline between them. Give it only figures that have something to say. */
export function Figures({ items }: { items: { label: string; value: number }[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="mb-8 flex">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 border-l border-line px-4 first:border-l-0 first:pl-0 last:pr-0">
          <dt className={`truncate ${LABEL_SMALL}`}>{item.label}</dt>
          <dd className="mt-1 truncate text-[28px] font-semibold leading-8 tabular-nums text-text-1">{item.value.toLocaleString()}</dd>
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
        <h2 className="break-words text-xl font-semibold leading-snug tracking-tight text-text-1">{title}</h2>
        {subtitle && <div className="mt-1 text-[15px] text-text-2">{subtitle}</div>}
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
      className={`${ROW} py-2.5`}
    >
      {logo ?? (Icon && <Icon className="h-4 w-4 shrink-0 text-text-2" aria-hidden="true" />)}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-text-1">{title}</span>
        {subtitle && <span className={`block truncate text-[13px] ${META_IN_ROW}`}>{subtitle}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-text-3 transition-colors group-hover:text-text-1" aria-hidden="true" />
    </button>
  );
}

/** Rows that belong together: hairlines between them, no box around them. */
export function RowList({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

/** The way on from a panel: the full page of what it is about. */
export function PageLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`mb-2 flex w-full px-4 py-2.5 ${SECONDARY_BUTTON}`}
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
          className={`${ROW} justify-between py-2.5`}
        >
          <span className="min-w-0">
            <span className="block truncate text-[15px] text-text-1">{job.title}</span>
            {/* The company where the panel is not one company's, then the pay where the posting states it: what is not said is not said. */}
            {(() => {
              const line = [
                company && job.companyName ? formatCompanyName(job.companyName) : null,
                job.payMin !== null && job.payMax !== null ? formatPay(job.payMin, job.payMax, job.payPeriod) : null,
              ].filter(Boolean);
              return line.length > 0 ? <span className={`block truncate text-[13px] tabular-nums ${META_IN_ROW}`}>{line.join(' · ')}</span> : null;
            })()}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-3 transition-colors group-hover:text-text-1" aria-hidden="true" />
        </Link>
      ))}
    </RowList>
  );
}

/** The link under a list to the rest of it. Text-sized for a mouse, tall enough for a finger. */
export const MORE_LINK =
  'mt-2 inline-flex items-center text-[13px] tabular-nums text-text-2 decoration-1 underline-offset-[3px] hover:text-text-1 hover:underline [@media(pointer:coarse)]:mt-0 [@media(pointer:coarse)]:min-h-11';

/** "and 12 more", when a list was cut short. */
export function More({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  if (total <= shown) return null;
  return <p className="mt-2 text-[13px] tabular-nums text-text-3">and {(total - shown).toLocaleString()} more {noun}</p>;
}
