import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn, focusRing } from '@/lib/utils';

/*
 * The contained system: the few parts every public page builds a compound
 * thing from, so what belongs together is drawn together and what opens says
 * so. Each part is for one thing:
 *
 * - `Panel`: the frame. A hairline edge (`--line`) with an 8px corner, no
 *   fill, no shadow. Anything made of several parts sits in one: a list of
 *   records, a skill group, the ladder, a call to act, a skill's preview. A
 *   panel never holds another panel; inside it, parts are parted by
 *   hairlines. `PanelHead` is its heading row.
 * - `Disclosure`: a panel whose heading row is the button that opens it. The
 *   chevron stands at the row's right end and points down while it is closed,
 *   up while it is open; open, the frame's edge strengthens and the body
 *   appears inside the same frame, under a hairline, on the page's own colour
 *   (an open thing is never told by a grey fill). Everything that opens in
 *   place on a page is one, and each starts closed.
 * - `Band`: the start of a long part of a page (a domain of the Skills list):
 *   a raised bar the width of the page, its name at section size, that opens
 *   its part with the same chevron, and while it is open holds under the
 *   header so nobody loses which part they are in. Bands stack as an index
 *   while closed. The raised fill marks the bar as the start of a part,
 *   whether it is open or not: it is never a state.
 * - `ActionPanel`: a sentence and one button, on one row from a tablet up,
 *   for a call to act (sign in to see your skills). Never a link in a line of
 *   text.
 * - `chosenClass`: a row inside a panel that is chosen rather than followed
 *   (a skill whose preview stands beside the list): no chevron; the chosen
 *   one has a bar of ink at its left edge and its name at medium weight.
 *
 * Two marks at a row's right end, each meaning one thing: a chevron pointing
 * down (up when open) opens something here; a chevron pointing right goes to
 * another page.
 *
 * Sections are headed with `SectionHeading` (`components/layout/Page.tsx`,
 * through `DetailSection`): 20px / 600, the same on every page.
 */

/** The frame: a hairline edge with an 8px corner. `overflow: clip` keeps the corners without stopping what holds still inside it. */
export const panelClass = 'min-w-0 overflow-clip rounded-lg border border-line';

/** A row inside a panel: its own padding, the hover reaching the frame (only where there is a pointer), the focus ring drawn inside it. */
export const panelRowClass = cn('flex min-h-12 w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover focus-visible:-outline-offset-2', focusRing);

/**
 * A row inside a panel that is chosen rather than followed: on the row's own
 * element (an `li`, so the bar runs down whatever opens under the row), a bar
 * of ink at its left edge while it is chosen. See the notes at the top of
 * this file.
 */
export function chosenClass(chosen: boolean): string {
  return cn("relative before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-0.5 before:content-['']", chosen ? 'before:bg-text-1' : 'before:bg-transparent');
}

/** The primary button: the inverse pair, a full finger tall on a phone. */
export const primaryActionClass = cn(
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-inverse-bg px-4 text-sm font-medium text-inverse-text transition-colors hover:bg-inverse-bg/90 sm:h-10',
  focusRing
);

/** The secondary button: a hairline on nothing. */
export const secondaryActionClass = cn(
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-medium text-text-1 transition-colors hover:bg-surface-hover sm:h-10',
  focusRing
);

/** The chevron of something that opens in place: down while closed, up while open. */
export function OpenChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <ChevronDown
      aria-hidden="true"
      className={cn('h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none', open ? 'rotate-180 text-text-1' : 'text-text-2', className)}
    />
  );
}

export function Panel({ className, children, ...rest }: { className?: string; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <div className={cn(panelClass, className)} data-panel="" {...rest}>
      {children}
    </div>
  );
}

/** A panel's heading row: its name, a figure or word at the right, and a hairline under it. */
export function PanelHead({ title, meta, as: Heading = 'h3', className }: { title: ReactNode; meta?: ReactNode; as?: 'h2' | 'h3' | 'h4' | 'p'; className?: string }) {
  return (
    <div className={cn('flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5', className)}>
      <Heading className="min-w-0 break-words text-[15px] font-semibold leading-snug text-text-1">{title}</Heading>
      {meta && <span className="shrink-0 text-[13px] tabular-nums text-text-3">{meta}</span>}
    </div>
  );
}

interface DisclosureProps {
  /** The heading row's name: what is inside. */
  title: ReactNode;
  /** A figure or word at the right of the heading row ("10 skills"). */
  meta?: ReactNode;
  /** A second line under the name, in meta ink. */
  detail?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Drawn inside the frame while open. */
  children: ReactNode;
  /** What a screen reader hears the opened part called; the title when it is text. */
  label?: string;
  /** The heading level the name is (the button stands inside it). */
  as?: 'h2' | 'h3' | 'h4';
  className?: string;
}

/** A panel whose heading row is the button that opens it. See the notes at the top of this file. */
export function Disclosure({ title, meta, detail, open, onToggle, children, label, as: Heading = 'h3', className, ...rest }: DisclosureProps & Record<`data-${string}`, string | undefined>) {
  const id = useId();
  return (
    <div className={cn(panelClass, 'transition-colors', open && 'border-line-strong', className)} data-disclosure="" data-open={open || undefined} {...rest}>
      <Heading className="m-0">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className={cn(panelRowClass, 'min-h-14 gap-4 py-3')}>
          <span className="min-w-0 flex-1">
            <span className="block break-words text-[15px] font-semibold leading-snug text-text-1">{title}</span>
            {detail && <span className="mt-0.5 block break-words text-[13px] font-normal leading-[18px] text-text-3">{detail}</span>}
          </span>
          {meta && <span className={cn('shrink-0 text-right text-[13px] font-normal tabular-nums text-text-3', detail && 'self-start pt-0.5')}>{meta}</span>}
          <OpenChevron open={open} />
        </button>
      </Heading>
      <div id={id} role="region" aria-label={label ?? (typeof title === 'string' ? title : undefined)} hidden={!open} className="border-t border-line">
        {open && children}
      </div>
    </div>
  );
}

interface BandProps {
  /** The part's name, at section size. */
  title: ReactNode;
  /** A figure at the right ("105 skills · 21 groups"). */
  meta?: ReactNode;
  /** One sentence that stands under the bar once it is open (never cut short on a closed bar). */
  description?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** The way on from the part, a secondary button that ends it ("Materials on the atlas"). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The start of a long part of a page: a raised bar the width of the page that
 * opens the part, and holds under the header while the part is open. See the
 * notes at the top of this file.
 */
export function Band({ title, meta, description, open, onToggle, actions, children, className, ...rest }: BandProps & Record<`data-${string}`, string | undefined>) {
  const id = useId();
  return (
    <section className={cn('min-w-0', className)} data-band="" data-open={open || undefined} {...rest}>
      {/* The bar stands on the page's colour while it holds, so nothing scrolling under it shows round its corners. */}
      <div className={cn('bg-bg py-1', open && 'sticky top-[var(--header-height)] z-10')}>
        <h2 className="m-0">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={onToggle}
            data-band-toggle=""
            className={cn(
              'flex min-h-16 w-full min-w-0 items-center gap-4 rounded-lg border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-hover sm:px-5',
              open ? 'border-line-strong' : 'border-line',
              focusRing
            )}
          >
            <span className="min-w-0 flex-1 break-words text-xl font-semibold leading-7 text-text-1">{title}</span>
            {meta && <span className="shrink-0 text-right text-[13px] font-normal tabular-nums text-text-3">{meta}</span>}
            <OpenChevron open={open} className="h-5 w-5" />
          </button>
        </h2>
      </div>
      <div id={id} role="region" aria-label={typeof title === 'string' ? title : undefined} hidden={!open} className="pb-10 pt-3">
        {open && (
          <>
            {description && <p className="mb-5 max-w-3xl px-1 text-sm leading-relaxed text-text-2">{description}</p>}
            {children}
            {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
          </>
        )}
      </div>
    </section>
  );
}

interface ActionPanelProps {
  /** The sentence: first what it is about (in full ink), then what the button gives (in secondary ink). */
  children: ReactNode;
  /** The one button (a link styled as one, or a button). */
  action: ReactNode;
  /** A figure that leads the sentence (a seeker's ring). */
  lead?: ReactNode;
  className?: string;
}

/**
 * A sentence and one button, in a panel: a call to act. On one row from a
 * tablet up, the button at the right; on a phone the button under the
 * sentence, the full width. See the notes at the top of this file.
 */
export function ActionPanel({ children, action, lead, className, ...rest }: ActionPanelProps & Record<`data-${string}`, string | undefined>) {
  return (
    <div className={cn(panelClass, 'flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5', className)} data-action-panel="" {...rest}>
      <div className="flex min-w-0 items-center gap-3">
        {lead}
        <div className="min-w-0 text-sm leading-relaxed">{children}</div>
      </div>
      <div className="flex shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div>
    </div>
  );
}

/** A link at a panel's foot that leads on: "All 12 open jobs". The panel's last row. */
export function PanelFooterLink({ to, children, ...rest }: { to: string; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <Link to={to} className={cn(panelRowClass, 'min-h-11 justify-between border-t border-line text-sm font-medium text-text-1')} {...rest}>
      <span>{children}</span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-2" />
    </Link>
  );
}
