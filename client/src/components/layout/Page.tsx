import type { ReactNode, ElementType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Page shell primitives. Every routed page composes these so width, gutters,
 * vertical rhythm and header hierarchy are decided once. Adding a page means
 * picking a size and filling the slots, not re-deriving spacing.
 *
 * Two families of page are built from them:
 *
 * - List and account pages (Explore, Jobs, Profile, Your jobs, Settings,
 *   Admin Tools, sign-in): `PageHeader`, then `PageSection`s with
 *   sentence-case headings. These are places a person works in.
 *
 * - THE DETAIL PAGE: a company, a plant, a career, a skill, an industry, a
 *   job. All six are one template, top to bottom:
 *
 *   1. `DetailHeader`
 *      - the way back, alone on the first line (an admin's Edit at its end);
 *      - the kind, in small capitals above the name: COMPANY, PLANT, CAREER,
 *        SKILL, INDUSTRY, JOB. Never a pill after the name, never an icon
 *        tile: the word says it once, in the same place on every page;
 *      - the name (h1). A company's mark stands before it on the pages that
 *        belong to one company (company, plant, job): it is who, not what kind;
 *      - one paragraph saying what it is, when the record has one;
 *      - one or two quiet lines of facts (where it is, how big, its industry);
 *      - the page's one action, last in the block and always in this place:
 *        Open on the map (company, plant, industry), Set as goal (career),
 *        Not held / Learning / Held (skill). A job's action is a form, so it
 *        is the Apply section that follows the job's terms (for a person
 *        marking skills, the skills first: the company ranks on them).
 *   2. Sections (`DetailSection`: small grey capitals, no counts), always in
 *      this order, leaving out what the page does not have:
 *      a. what it is: the page's own content (a plant's people and what it
 *         makes, a career's path, how a skill is learned, an industry's
 *         figures, a job's terms);
 *      b. where: the footprint and address, or the places and industries;
 *      c. open jobs;
 *      d. the records it leads to, in the product's own order (the order
 *         of Explore's tabs): companies, plants, careers, skills;
 *      e. sources, as one quiet line at the foot.
 *   3. Every list of records is a `RecordList` of `RecordRow`s: one card,
 *      hairlines between rows, the name, at most one grey line under it, and
 *      a chevron (or the row's figure) at the right. No icon per row: a list
 *      under the heading CAREERS does not need a briefcase on every line. A
 *      company's mark may lead its row, and a skill's row may carry the mark
 *      that says whether the person has it. A list longer than its cut ends
 *      in `ShowAll`. Two other shapes exist, each for one thing: a table of
 *      figures by place (`FigureList` in `components/industry/parts.tsx`),
 *      and chips for places that open on the map (a career's leading states).
 *   4. Words: a place is "City, ST"; the tab is the page's name and
 *      "· Archangel", nothing between.
 */

type PageSize = 'narrow' | 'default' | 'wide' | 'full';

const SIZE_CLASS: Record<PageSize, string> = {
  narrow: 'max-w-4xl',   // forms, detail pages, import
  default: 'max-w-6xl',  // lists, explorers
  wide: 'max-w-7xl',     // matches the app header
  full: 'max-w-none',    // map and other edge-to-edge surfaces
};

interface PageContainerProps {
  size?: PageSize;
  /** Remove vertical padding for pages that manage their own (e.g. the map). */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

export function PageContainer({ size = 'default', flush = false, className, children }: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 sm:px-6',
        !flush && 'py-6 sm:py-8',
        'pb-[max(1.5rem,var(--safe-area-bottom))]',
        SIZE_CLASS[size],
        className,
      )}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Small uppercase label above the title (entity type, section, status). */
  eyebrow?: ReactNode;
  /** Optional leading icon, tinted by the caller. */
  icon?: ElementType;
  iconClassName?: string;
  /** Right-aligned controls; wraps under the title on narrow screens. */
  actions?: ReactNode;
  /** Renders a back link above the title. */
  backTo?: { to: string; label: string };
  className?: string;
}

export function PageHeader({ title, description, eyebrow, icon: Icon, iconClassName, actions, backTo, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 sm:mb-8', className)}>
      {backTo && (
        <Link
          to={backTo.to}
          className="-mt-2 mb-2 inline-flex min-h-11 items-center gap-2 pr-2 text-sm text-fg-muted transition-colors hover:text-fg-default"
        >
          <ArrowLeft className="h-4 w-4" />
          {backTo.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-elevated">
              <Icon className={cn('h-5 w-5', iconClassName ?? 'text-fg-muted')} />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft">{eyebrow}</div>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-fg-default sm:text-3xl [text-wrap:balance]">
              {title}
            </h1>
            {description && <p className="mt-2 max-w-prose text-sm text-fg-muted sm:text-base">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// ─── The detail page ───────────────────────────────────────────────────────

const EYEBROW = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft';
const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';
const BACK = cn('-ml-0.5 inline-flex min-h-11 items-center gap-2 pr-2 text-sm text-fg-muted transition-colors hover:text-fg-default', FOCUS_RING);

/**
 * The way back at the top of a page. With `to` it is a link to a named place
 * ("All jobs"). Without, it returns to wherever the person came from, and
 * with no history (a link opened cold) goes to `fallback`.
 */
export function BackLink({ to, label = 'Back', fallback = '/explore' }: { to?: string; label?: string; fallback?: string }) {
  const navigate = useNavigate();
  if (to) {
    return (
      <Link to={to} className={BACK}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {label}
      </Link>
    );
  }
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  return (
    <button type="button" onClick={() => (canGoBack ? navigate(-1) : navigate(fallback))} className={BACK}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

/** The look of a detail page's one action when it is a plain button or link. */
export const detailActionClass = cn(
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border-strong px-4 text-sm font-medium text-fg-default transition-colors hover:bg-bg-elevated sm:h-10',
  FOCUS_RING
);

interface DetailHeaderProps {
  /** The way back: a named link, or the history with a fallback. */
  back: { to: string; label: string } | { fallback: string };
  /** What kind of thing the page is about, said once: "Company", "Plant", "Job". */
  kind: ReactNode;
  title: ReactNode;
  /** A company's mark, on the pages that belong to one company. */
  mark?: ReactNode;
  /** What narrows the name, directly under it: the place an industry's page is about. */
  qualifier?: ReactNode;
  /** One paragraph on what it is. */
  description?: ReactNode;
  /** The page's one action. */
  action?: ReactNode;
  /** An admin's way to the record's editor, at the end of the first line. */
  edit?: ReactNode;
  /** Quiet lines of facts under the description. */
  children?: ReactNode;
  className?: string;
}

/** The heading block of a detail page. See the template at the top of this file. */
export function DetailHeader({ back, kind, title, mark, qualifier, description, action, edit, children, className }: DetailHeaderProps) {
  return (
    <header className={cn('min-w-0', className)} data-detail-header>
      <div className="-mt-2 mb-1 flex items-center justify-between gap-3">
        {'to' in back ? <BackLink to={back.to} label={back.label} /> : <BackLink fallback={back.fallback} />}
        {edit}
      </div>
      <p className={cn(EYEBROW, 'mb-1.5')} data-detail-kind>
        {kind}
      </p>
      <div className="flex min-w-0 items-center gap-3">
        {mark}
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-fg-default sm:text-3xl [text-wrap:balance]">{title}</h1>
      </div>
      {qualifier}
      {description && <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-fg-muted">{description}</p>}
      {children}
      {action && (
        <div className="mt-4 flex flex-wrap items-center gap-3 empty:hidden" data-detail-action>
          {action}
        </div>
      )}
    </header>
  );
}

/** A quiet line of facts in a detail page's heading block. */
export function DetailFacts({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mt-2 break-words text-sm text-fg-muted', className)}>{children}</p>;
}

interface DetailSectionProps {
  /** Anchor for links to this part of the page (#jobs). */
  id?: string;
  title: ReactNode;
  /** A quiet word beside the heading. A list says how long it is by being there, so there is no count. */
  note?: ReactNode;
  /** Labels the figures down the right edge of the section's rows ("People"). */
  column?: ReactNode;
  /** A link at the right of the heading ("All 230 plants"). */
  action?: ReactNode;
  /** One sentence under the heading, for a section that needs explaining. */
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A titled part of a detail page: small grey capitals, the same on all six. */
export function DetailSection({ id, title, note, column, action, description, className, children }: DetailSectionProps) {
  return (
    <section id={id} className={cn('mt-8 scroll-mt-20', className)}>
      <div className={cn('flex items-baseline justify-between gap-3', description ? 'mb-1' : 'mb-3')}>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium uppercase tracking-wider text-fg-soft">{title}</h2>
          {note}
        </div>
        {column ? <span className="shrink-0 pr-4 text-[11px] uppercase tracking-wider text-fg-soft">{column}</span> : action}
      </div>
      {description && <p className="mb-3 text-sm text-fg-muted">{description}</p>}
      {children}
    </section>
  );
}

/** A link at the right of a section's heading. */
export const sectionLinkClass = cn('shrink-0 text-sm text-fg-muted underline underline-offset-4 transition-colors hover:text-fg-default', FOCUS_RING);

/** The card a list of records sits in. */
export const recordListClass = 'overflow-hidden rounded-xl border border-border-subtle bg-bg-surface';

export function RecordList({ children, className, ...rest }: { children: ReactNode; className?: string } & Record<`data-${string}`, string | undefined>) {
  return (
    <ul className={cn(recordListClass, className)} {...rest}>
      {children}
    </ul>
  );
}

interface RecordRowProps {
  to: string;
  /** Passed to the link (where a list was opened from, for the way back). */
  state?: unknown;
  /** A company's mark. Never an icon for the kind of record. */
  lead?: ReactNode;
  /** A control that is not part of the link, before it: the mark a person sets on a skill. */
  control?: ReactNode;
  /** A small word above the name, where rows of different kinds share a list ("Company", "Plant"). */
  label?: string;
  title: ReactNode;
  /** One grey line of facts. Two lines at most on a phone. */
  subtitle?: ReactNode;
  /** A number at the right in place of the chevron. */
  figure?: number | null;
  /** What the figure counts, for a screen reader ("people"). */
  figureLabel?: string;
  className?: string;
}

/** One record in a `RecordList`: its name, one line of facts, and the way to its page. */
export function RecordRow({
  to,
  state,
  lead,
  control,
  label,
  title,
  subtitle,
  figure,
  figureLabel,
  className,
  ...rest
}: RecordRowProps & Record<`data-${string}`, string | undefined>) {
  return (
    <li className={cn('flex items-stretch border-b border-border-subtle last:border-b-0', className)} {...rest}>
      {control && <span className="flex shrink-0 items-center">{control}</span>}
      <Link
        to={to}
        state={state}
        className={cn(
          'group flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 transition-colors hover:bg-bg-elevated focus-visible:bg-bg-elevated focus-visible:outline-none',
          control ? 'pl-0' : 'pl-4'
        )}
      >
        {lead}
        <span className="min-w-0 flex-1">
          {label && <span className="block text-xs text-fg-soft">{label}</span>}
          <span className="block break-words text-sm font-medium leading-snug text-fg-default">{title}</span>
          {subtitle && <span className="mt-0.5 line-clamp-2 break-words text-xs text-fg-muted">{subtitle}</span>}
        </span>
        {figure != null ? (
          <span className="shrink-0 text-sm tabular-nums text-fg-default">
            {figure.toLocaleString()}
            {figureLabel && <span className="sr-only"> {figureLabel}</span>}
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-fg-soft group-hover:text-fg-default" aria-hidden="true" />
        )}
      </Link>
    </li>
  );
}

/** The text action under a list that was cut: "Show all 19", then "Show fewer". */
export function ShowAll({ open, total, onToggle }: { open: boolean; total: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn('mt-1 inline-flex min-h-11 items-center text-sm font-medium text-fg-default underline underline-offset-4 hover:no-underline', FOCUS_RING)}
    >
      {open ? 'Show fewer' : `Show all ${total.toLocaleString()}`}
    </button>
  );
}

// ─── List and account pages ────────────────────────────────────────────────

interface PageSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function PageSection({ title, description, actions, className, children }: PageSectionProps) {
  return (
    <section className={cn('mb-8 last:mb-0', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-fg-default sm:text-lg">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

interface EmptyStateProps {
  icon?: ElementType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-16 text-center sm:py-20', className)}>
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-elevated">
          <Icon className="h-7 w-7 text-fg-soft" />
        </div>
      )}
      <h2 className="text-lg font-semibold text-fg-default">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
