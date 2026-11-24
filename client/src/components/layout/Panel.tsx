import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn, focusRing } from '@/lib/utils';

/*
 * The contained system: the few parts every public page builds a compound
 * thing from, so what belongs together is drawn together and what opens says
 * so. Four parts, each for one thing:
 *
 * - `Panel`: the frame. A hairline edge (`--line`) with an 8px corner, no
 *   fill, no shadow. Anything made of several parts sits in one: a list of
 *   records, a skill group, the ladder, a call to sign in, a skill's preview.
 *   A panel never holds another panel; inside it, parts are parted by
 *   hairlines. `PanelHead` is its heading row.
 * - `Disclosure`: a panel whose heading row is the button that opens it. The
 *   chevron stands first and points right while it is closed and down while
 *   it is open; open, its body appears inside the same frame on the raised
 *   surface, under a hairline, and the frame's edge strengthens. Everything
 *   that opens on a page is one, and each starts closed.
 * - `Band`: the start of a long part of a page (a domain of the Skills list):
 *   one raised bar the width of the page, its name at section size, that
 *   opens its part and, while it is open, holds under the header so nobody
 *   loses which part they are in. Bands stack as an index while closed.
 * - `ActionPanel`: one sentence and one button, for a call to act (sign in to
 *   see your skills). Never a link in a line of text.
 *
 * Sections are headed with `SectionHeading` (`components/layout/Page.tsx`,
 * through `DetailSection`): 20px / 600, the same on every page.
 */

/** The frame: a hairline edge with an 8px corner, clipping what is drawn inside it. */
export const panelClass = 'min-w-0 overflow-hidden rounded-lg border border-line';

/** A row inside a panel: its own padding, the hover reaching the frame, the focus ring drawn inside it. */
export const panelRowClass = cn('flex min-h-12 w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover focus-visible:-outline-offset-2', focusRing);

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
  /** A figure or word at the right of the heading row ("10 skills", "2 of 10 held"). */
  meta?: ReactNode;
  /** A second line under the name, in meta ink. */
  detail?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Drawn inside the frame while open, on the raised surface. */
  children: ReactNode;
  /** What a screen reader hears the opened part called; the title when it is text. */
  label?: string;
  className?: string;
}

/** A panel whose heading row is the button that opens it. See the notes at the top of this file. */
export function Disclosure({ title, meta, detail, open, onToggle, children, label, className, ...rest }: DisclosureProps & Record<`data-${string}`, string | undefined>) {
  const id = useId();
  return (
    <div className={cn(panelClass, 'transition-colors', open && 'border-line-strong', className)} data-disclosure="" data-open={open || undefined} {...rest}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className={cn(panelRowClass, 'min-h-14 py-3')}>
        <ChevronRight
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0 text-text-2 transition-transform motion-reduce:transition-none', open && 'rotate-90 text-text-1')}
        />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[15px] font-semibold leading-snug text-text-1">{title}</span>
          {detail && <span className="mt-0.5 block break-words text-[13px] leading-[18px] text-text-3">{detail}</span>}
        </span>
        {meta && <span className={cn('shrink-0 text-[13px] tabular-nums text-text-3', detail && 'self-start pt-0.5')}>{meta}</span>}
      </button>
      <div id={id} role="region" aria-label={label ?? (typeof title === 'string' ? title : undefined)} hidden={!open} className="border-t border-line bg-surface">
        {open && children}
      </div>
    </div>
  );
}

interface BandProps {
  /** The part's name, at section size. */
  title: ReactNode;
  /** A figure at the right ("21 groups · 105 skills"). */
  meta?: ReactNode;
  /** One sentence under the name while closed (cut to one line), in full once open. */
  description?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Controls that stand at the top of the opened part ("On the atlas"). */
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
      <div className={cn('bg-bg py-1', open && 'sticky top-[57px] z-10')}>
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
          <ChevronRight
            aria-hidden="true"
            className={cn('h-5 w-5 shrink-0 text-text-2 transition-transform motion-reduce:transition-none', open && 'rotate-90 text-text-1')}
          />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-xl font-semibold leading-7 text-text-1">{title}</span>
            {description && !open && <span className="mt-0.5 hidden truncate text-[13px] leading-[18px] text-text-2 sm:block">{description}</span>}
          </span>
          {meta && <span className="shrink-0 text-right text-[13px] tabular-nums text-text-3">{meta}</span>}
        </button>
      </div>
      <div id={id} role="region" aria-label={typeof title === 'string' ? title : undefined} hidden={!open} className="pb-8 pt-3">
        {open && (
          <>
            {(description || actions) && (
              <div className="mb-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-3 px-1">
                {description && <p className="min-w-0 max-w-3xl flex-1 basis-80 text-sm leading-relaxed text-text-2">{description}</p>}
                {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
              </div>
            )}
            {children}
          </>
        )}
      </div>
    </section>
  );
}

interface ActionPanelProps {
  /** What the panel is about, as its heading row. */
  title: ReactNode;
  /** The one sentence: what pressing the button gives the person. */
  children: ReactNode;
  /** The one button (a link styled as one, or a button). */
  action: ReactNode;
  className?: string;
}

/** One sentence and one button, in a panel: a call to act. See the notes at the top of this file. */
export function ActionPanel({ title, children, action, className, ...rest }: ActionPanelProps & Record<`data-${string}`, string | undefined>) {
  return (
    <Panel className={className} data-action-panel="" {...rest}>
      <PanelHead title={title} />
      <div className="px-4 pb-4 pt-3">
        <p className="text-sm leading-relaxed text-text-2">{children}</p>
        <div className="mt-4 flex flex-wrap gap-2">{action}</div>
      </div>
    </Panel>
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
