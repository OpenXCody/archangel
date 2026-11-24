import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { sectionHeadingClass } from '@/lib/utils';

interface PanelProps {
  /** The panel's heading. Every panel has one unless it is the only thing on its page and the page's title says it. */
  title?: ReactNode;
  /** One line under the heading saying what the panel is for. */
  description?: ReactNode;
  /** Controls at the heading's end. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
  id?: string;
}

/**
 * A section of Admin Tools: one edged panel (the raised surface, a hairline
 * edge, an 8 px corner) holding a heading and then its content, so a form is
 * never loose fields in the page and a heading never stands over something
 * that is not its own. Fields inside it take the page's colour, which keeps
 * them apart from the panel they sit on. Admin Tools only: the public pages
 * part their sections with space.
 */
export default function Panel({ title, description, actions, className, children, id, ...rest }: PanelProps & Record<`data-${string}`, string | undefined>) {
  return (
    <section
      id={id}
      className={cn(
        'mb-4 scroll-mt-24 rounded-lg border border-line bg-surface p-4 last:mb-0 sm:mb-5 sm:p-5',
        '[&_input:not([type=checkbox]):not([type=file])]:bg-bg [&_textarea]:bg-bg [&_button[role=combobox]]:bg-bg',
        className
      )}
      data-admin-panel=""
      {...rest}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
          <div className="min-w-0">
            {title && <h2 className={sectionHeadingClass}>{title}</h2>}
            {description && <p className="mt-1 max-w-prose text-sm text-text-2">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
