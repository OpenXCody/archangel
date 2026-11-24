import type { ReactNode, ElementType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { cn, focusRing, labelClass, pageTitleClass, sectionHeadingClass } from '@/lib/utils';
import { panelClass, panelRowClass } from './Panel';

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
 * - THE DETAIL PAGE: a company, a factory, a career, a skill, an industry, a
 *   job. All six are one template, top to bottom:
 *
 *   1. `DetailHeader`
 *      - the way back, alone on the first line (an admin's Edit at its end);
 *      - the kind, in small capitals above the name: COMPANY, FACTORY, CAREER,
 *        SKILL, INDUSTRY, JOB. Never a pill after the name, never an icon
 *        tile: the word says it once, in the same place on every page;
 *      - the name (h1). A company's mark stands before it on the company's
 *        own page: it is who, not what kind;
 *      - the records the page belongs to, as tags that open them
 *        (`RecordTag.tsx`): a job's company, factory and career, a factory's
 *        company, the company and the standard career on a company's version
 *        of a career, a military career's service. Where a tag names the
 *        company or a service its mark is in the tag;
 *      - one paragraph saying what it is, when the record has one;
 *      - one or two quiet lines of facts (where it is, how big, its industry);
 *      - the page's one action, last in the block and always in this place:
 *        Open on the map (company, factory, industry). A career's and a
 *        skill's page have none: a goal is set and a skill is marked on
 *        Profile, and a career's page only says how much of it a seeker
 *        holds. A job's action is Apply: on a job from a company's careers
 *        site a button in its facts panel that opens the company's page; on
 *        a job posted here a form, so it is the Apply section that follows
 *        the job's facts.
 *   2. Sections (`DetailSection`, headed by `SectionHeading`: 20px / 600, the
 *      section size of every page, no counts), always in this order, leaving
 *      out what the page does not have:
 *      a. what it is: the page's own content (a factory's people and what it
 *         makes, a career's path, how a skill is learned, an industry's
 *         figures, a job's terms);
 *      b. where: the footprint and address, or the places and industries;
 *      c. open jobs;
 *      d. the records it leads to, in the product's own order (the order
 *         of Explore's tabs): companies, factories, careers, skills;
 *      (Where a fact was read is not shown on the page.)
 *   3. Every list of records is a `RecordList` of `RecordRow`s: one panel
 *      (`Panel.tsx`: a hairline frame, 8px corner) holding rows with a
 *      hairline between them, the name, at most one grey line under it, and a
 *      chevron (or the row's figure) at the right. No icon per row: a list
 *      under the heading Careers does not need a briefcase on every line. A
 *      company's mark may lead its row, and a skill's row may carry the mark
 *      that says whether the person has it. A list longer than its cut ends
 *      in `ShowAll`, and a list that leads on to a fuller one in
 *      `PanelFooterLink`, each the panel's last row (`footer`). Two other shapes exist, each for one thing: a table of
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
          className="-mt-2 mb-2 inline-flex min-h-11 items-center gap-2 pr-2 text-sm text-text-2 transition-colors hover:text-text-1"
        >
          <ArrowLeft className="h-4 w-4" />
          {backTo.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && <Icon className={cn('mt-1.5 h-5 w-5 shrink-0', iconClassName ?? 'text-text-2')} />}
          <div className="min-w-0">
            {eyebrow && (
              <div className={cn(labelClass, 'mb-1.5')}>{eyebrow}</div>
            )}
            <h1 className={cn(pageTitleClass, '[text-wrap:balance]')}>{title}</h1>
            {description && <p className="mt-2 max-w-prose text-sm text-text-2">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// ─── The detail page ───────────────────────────────────────────────────────

const EYEBROW = labelClass;
const BACK = cn('-ml-0.5 inline-flex min-h-11 items-center gap-2 pr-2 text-sm text-text-2 transition-colors hover:text-text-1', focusRing);

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
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-medium text-text-1 transition-colors hover:bg-surface-hover sm:h-10',
  focusRing
);

interface DetailHeaderProps {
  /** The way back: a named link, or the history with a fallback. */
  back: { to: string; label: string } | { fallback: string };
  /** What kind of thing the page is about, said once: "Company", "Factory", "Job". */
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
  /**
   * A name that is a sentence more often than not (a job's title): on a phone
   * it keeps the smaller size, where 40px would run to four lines and more.
   */
  longTitle?: boolean;
  /** Quiet lines of facts under the description. */
  children?: ReactNode;
  className?: string;
}

/** The heading block of a detail page. See the template at the top of this file. */
export function DetailHeader({ back, kind, title, mark, qualifier, description, action, edit, longTitle, children, className }: DetailHeaderProps) {
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
        <h1 className={cn(pageTitleClass, 'min-w-0 break-words [text-wrap:balance]', longTitle && 'max-sm:text-2xl max-sm:leading-8')}>{title}</h1>
      </div>
      {qualifier}
      {description && <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-text-2">{description}</p>}
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
  return <p className={cn('mt-2 break-words text-sm text-text-2', className)}>{children}</p>;
}

interface DetailSectionProps {
  /** Anchor for links to this part of the page (#jobs). */
  id?: string;
  title: ReactNode;
  /** A quiet word beside the heading. A list says how long it is by being there, so there is no count. */
  note?: ReactNode;
  /** Labels the figures down the right edge of the section's rows ("People"). */
  column?: ReactNode;
  /** A link at the right of the heading ("All 230 factories"). */
  action?: ReactNode;
  /** One sentence under the heading, for a section that needs explaining. */
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * A section's heading row, on every page: the name at section size (20px /
 * 600), a quiet word or figure beside it, an action at the right. What follows
 * it is the section's own, in panels.
 */
export function SectionHeading({
  id,
  title,
  note,
  action,
  description,
  className,
}: {
  id?: string;
  title: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4', className)} data-section-heading>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={id} className={sectionHeadingClass}>
            {title}
          </h2>
          {note}
        </div>
        {action}
      </div>
      {description && <p className="mt-0.5 max-w-prose text-sm text-text-2">{description}</p>}
    </div>
  );
}

/** A titled part of a detail page: its heading at section size, the same on all six. */
export function DetailSection({ id, title, note, column, action, description, className, children }: DetailSectionProps) {
  return (
    <section id={id} className={cn('mt-14 scroll-mt-20', className)}>
      <SectionHeading
        title={title}
        note={note}
        description={description}
        action={column ? <span className={cn(labelClass, 'shrink-0 self-end')}>{column}</span> : action}
      />
      {children}
    </section>
  );
}

/** A link at the right of a section's heading. */
export const sectionLinkClass = cn('shrink-0 text-sm text-text-1 underline transition-colors', focusRing);

/**
 * A list of records: one panel (`Panel.tsx`), its rows parted by hairlines.
 * The rows carry the lines (`RecordRow`, or `rowClass`); the panel is the
 * frame. Kept by name for the footprint's map, which stands in the same frame.
 */
export const recordListClass = panelClass;

/**
 * A row that is one link or button, under the pointer: the fill reaches a
 * little past the words on both sides, so they keep their place on the page's
 * left edge and the hairlines stay the width of the column.
 */
export const rowHoverClass = '-mx-3 rounded-lg px-3 transition-colors hover:bg-surface-hover';

export function RecordList({
  children,
  footer,
  className,
  ...rest
}: { children: ReactNode; footer?: ReactNode; className?: string } & Record<`data-${string}`, string | undefined>) {
  return (
    <div className={cn(panelClass, className)} data-record-list>
      <ul {...rest}>{children}</ul>
      {footer}
    </div>
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
  /** A small word above the name, where rows of different kinds share a list ("Company", "Factory"). */
  label?: string;
  title: ReactNode;
  /** One grey line of facts. Two lines at most on a phone. */
  subtitle?: ReactNode;
  /** A number at the right in place of the chevron. */
  figure?: number | null;
  /** What the figure counts, for a screen reader ("people"). */
  figureLabel?: string;
  /** The name in secondary ink: a skill the person does not hold, among ones they do. */
  quiet?: boolean;
  /**
   * What stands under the link, in the row and not part of it: a line that is
   * not cut short, which may hold a link of its own (the skills a career within
   * reach still asks for, and the way to compare the two). Not for a row with a `control`.
   */
  below?: ReactNode;
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
  quiet,
  below,
  className,
  ...rest
}: RecordRowProps & Record<`data-${string}`, string | undefined>) {
  return (
    <li className={cn('border-t border-line first:border-t-0', below ? 'block' : 'flex items-stretch', className)} {...rest}>
      {control && <span className="flex shrink-0 items-center pl-1">{control}</span>}
      <Link
        to={to}
        state={state}
        className={cn(
          'group flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 transition-colors hover:bg-surface-hover focus-visible:-outline-offset-2',
          control ? 'pl-1' : 'pl-4'
        )}
      >
        {lead}
        <span className="min-w-0 flex-1">
          {label && <span className={cn(labelClass, 'mb-0.5 block text-[11px]')}>{label}</span>}
          <span className={cn('block break-words text-sm leading-snug', quiet ? 'text-text-2' : 'text-text-1')}>{title}</span>
          {subtitle && <span className="mt-0.5 line-clamp-2 break-words text-xs text-text-3">{subtitle}</span>}
        </span>
        {figure != null ? (
          <span className="shrink-0 text-sm tabular-nums text-text-1">
            {figure.toLocaleString()}
            {figureLabel && <span className="sr-only"> {figureLabel}</span>}
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-text-3 group-hover:text-text-1" aria-hidden="true" />
        )}
      </Link>
      {below && <div className="-mt-1 min-w-0 px-4 pb-3">{below}</div>}
    </li>
  );
}

/**
 * The way to the rest of a list that was cut: "Show all 19", then "Show
 * fewer". Inside a panel (a `RecordList`'s `footer`) it is the panel's last
 * row; under a stack of panels (`alone`) it is one more panel-shaped button.
 */
export function ShowAll({ open, total, onToggle, alone = false }: { open: boolean; total: number; onToggle: () => void; alone?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        panelRowClass,
        'min-h-11 justify-between text-sm font-medium text-text-1',
        alone ? 'mt-2 rounded-lg border border-line' : 'border-t border-line'
      )}
      data-show-all
    >
      <span>{open ? 'Show fewer' : `Show all ${total.toLocaleString()}`}</span>
      <ChevronRight aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-text-2 transition-transform motion-reduce:transition-none', open ? '-rotate-90' : 'rotate-90')} />
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
    <section className={cn('mb-12 last:mb-0', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className={sectionHeadingClass}>{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-text-2">{description}</p>}
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

/**
 * A page that has nothing to show: the thing asked for is not here. (A list
 * with nothing in it is one line of secondary text: `CardNote`.)
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-16 text-center sm:py-20', className)}>
      {Icon && <Icon className="mb-4 h-7 w-7 text-text-3" />}
      <h2 className={sectionHeadingClass}>{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm text-text-2">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
