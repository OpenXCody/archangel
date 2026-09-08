import type { ReactNode, ElementType } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Page shell primitives. Every routed page composes these so width, gutters,
 * vertical rhythm and header hierarchy are decided once. Adding a page means
 * picking a size and filling the slots — not re-deriving spacing.
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
          className="mb-4 inline-flex items-center gap-2 text-sm text-fg-muted transition-colors hover:text-fg-default"
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
