import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn, focusRing } from '@/lib/utils';

/*
 * The contained system: the few parts a page builds a compound thing from, so
 * what belongs together is drawn together and what opens says so. Each part
 * is for one thing:
 *
 * - `Panel`: the frame. A hairline edge (`--line`) with an 8px corner, no
 *   fill, no shadow. Anything made of several parts sits in one: a list of
 *   records (`RecordList`), a skill group of the Skills list, a connector
 *   tree. A panel never holds another panel (but for a tree node's card,
 *   below); inside it, parts are parted by hairlines. `PanelHead` is its
 *   heading row, `PanelFooterLink` a last row that leads on.
 * - `Band`: the start of a long part of a page (a domain of the Skills list):
 *   a raised bar the width of the page, its name at section size, that opens
 *   its part, and while it is open holds under the header so nobody loses
 *   which part they are in. Bands stack as an index while closed. The raised
 *   fill marks the bar as the start of a part, whether it is open or not: it
 *   is never a state.
 * - `Tree` (`components/layout/Tree.tsx`): one thing and what hangs off it,
 *   as nodes joined by hairlines inside one panel (a career's skills, where
 *   it leads, the civilian careers a military one reaches). What a node is
 *   opens as its card (`TreeCard`), the one frame a panel holds: the node's
 *   own line runs into it, so it is never loose.
 *
 * Everything that opens in place starts closed. Two marks at a row's right
 * end, each meaning one thing: a chevron pointing down (up when open) opens
 * something here (`OpenChevron`); a chevron pointing right goes to another
 * page.
 *
 * Sections are headed with `SectionHeading` (`components/layout/Page.tsx`,
 * through `DetailSection`): 20px / 600, the same on every page.
 */

/** The frame: a hairline edge with an 8px corner. `overflow: clip` keeps the corners without stopping what holds still inside it. */
export const panelClass = 'min-w-0 overflow-clip rounded-lg border border-line';

/** A row inside a panel: its own padding, the hover reaching the frame (only where there is a pointer), the focus ring drawn inside it. */
export const panelRowClass = cn('flex min-h-12 w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover focus-visible:-outline-offset-2', focusRing);

/** The secondary button: a hairline on nothing. A full finger tall wherever a finger is used, at any width. */
export const secondaryActionClass = cn(
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-medium text-text-1 transition-colors hover:bg-surface-hover sm:h-10 [@media(pointer:coarse)]:min-h-11',
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

/** A link at a panel's foot that leads on: "All 12 open jobs". The panel's last row. */
export function PanelFooterLink({ to, children, ...rest }: { to: string; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <Link to={to} className={cn(panelRowClass, 'min-h-11 justify-between border-t border-line text-sm font-medium text-text-1')} {...rest}>
      <span>{children}</span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-2" />
    </Link>
  );
}
