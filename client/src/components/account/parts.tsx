import { useEffect, useState, type ElementType, type KeyboardEvent, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AlertCircle, Briefcase, Building2, Factory, Loader2, RotateCw, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { errorMessage, signInPath, useAccount, type SignedInAccount } from '../../lib/account';
import { applicationStatusLabel } from '../../lib/jobFormat';
import { PageContainer } from '../layout/Page';

/** Small shared pieces for the account, jobs, employer and admin pages. */

/** Icons for the kinds of record. The app is monochrome: kinds differ by icon, not hue. A career is the occupation entity. */
export const ENTITY: Record<'company' | 'factory' | 'career' | 'skill', { icon: ElementType; text: string; badge: string }> = {
  company: { icon: Building2, text: 'text-fg-muted', badge: 'bg-bg-elevated text-fg-muted' },
  factory: { icon: Factory, text: 'text-fg-muted', badge: 'bg-bg-elevated text-fg-muted' },
  career: { icon: Briefcase, text: 'text-fg-muted', badge: 'bg-bg-elevated text-fg-muted' },
  skill: { icon: Wrench, text: 'text-fg-muted', badge: 'bg-bg-elevated text-fg-muted' },
};

/**
 * Text inputs and textareas share one look. 16px on phones stops iOS zooming
 * on focus; `border-solid` undoes the global `input { border: none }`.
 */
export const fieldClass =
  'block min-h-[42px] w-full rounded-lg border border-solid border-input bg-bg-elevated px-3 py-2 text-base text-fg-default ' +
  'placeholder:text-fg-soft transition-colors focus:border-[color:var(--color-fg-muted)] focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm';

/** A select's trigger and list, matched to the text fields beside them. */
export const selectTriggerClass =
  'h-[42px] rounded-lg border-border-strong bg-bg-elevated px-3 text-base text-fg-default shadow-none sm:text-sm';
export const selectContentClass = 'max-w-[calc(100vw-2rem)] rounded-lg border-border-strong bg-bg-surface';

/** A button that is busy keeps focus: it is marked, not disabled. */
export const busyButtonClass = 'aria-disabled:pointer-events-none aria-disabled:opacity-60';

export const cardClass = 'rounded-xl border border-border-subtle bg-bg-surface';

/** A row inside a card: a hairline between rows, none above the first. */
export const rowClass = 'border-t border-border-subtle first:border-t-0';

/** Outline buttons need a border that shows on the dark surface. */
export const outlineButtonClass = 'border-border-strong bg-transparent text-fg-default shadow-none hover:bg-bg-elevated';

/**
 * A plain text action inside a row. Destructive ones look the same: the
 * confirmation, not the button, carries the weight.
 */
export const textButtonClass =
  'text-sm font-medium text-fg-muted underline underline-offset-4 transition-colors hover:text-fg-default ' +
  'disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50';

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, optional, className, children }: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <Label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-fg-muted">
        {label}
        {optional && <span className="ml-1.5 font-normal text-fg-soft">optional</span>}
      </Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

/** An error from a form or an action, in the words the server chose. */
export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className={cn('flex items-start gap-2 text-sm text-danger', className)}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{typeof error === 'string' ? error : errorMessage(error)}</span>
    </p>
  );
}

/** A list or section that failed to load, with a way to try again. */
export function LoadError({ error, onRetry, retrying, className }: { error: unknown; onRetry?: () => void; retrying?: boolean; className?: string }) {
  return (
    <div role="alert" className={cn(cardClass, 'flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <p className="flex min-w-0 items-start gap-2 text-sm text-fg-muted">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <span className="min-w-0 break-words">{errorMessage(error)}</span>
      </p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying} className={cn('h-9 shrink-0', outlineButtonClass)}>
          <RotateCw className={cn(retrying && 'animate-spin')} />
          Try again
        </Button>
      )}
    </div>
  );
}

/** Placeholder rows while a list loads. */
export function RowsSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cardClass} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn(rowClass, 'flex items-center gap-3 p-4', className)}>
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[400px] items-center justify-center" role="status" aria-label={label}>
      <Loader2 className="h-8 w-8 animate-spin text-fg-muted" />
    </div>
  );
}

/** A quiet message inside a card: an empty list, or a short notice. */
export function CardNote({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(cardClass, 'px-4 py-6 text-center text-sm text-fg-muted', className)}>{children}</div>;
}

const STATUS_STYLE: Record<string, string> = {
  applied: 'border-border-strong text-fg-default',
  reviewing: 'border-border-strong bg-bg-elevated text-fg-muted',
  interview: 'border-warning/30 bg-warning/10 text-warning',
  offer: 'border-success/30 bg-success/10 text-success',
  hired: 'border-success/40 bg-success/20 text-success',
  declined: 'border-danger/30 bg-danger/10 text-danger',
  withdrawn: 'border-border-subtle text-fg-muted',
};

export function ApplicationStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        STATUS_STYLE[status] ?? STATUS_STYLE.applied,
        className
      )}
    >
      {applicationStatusLabel(status)}
    </span>
  );
}

/** "N of M" with a thin bar. Renders the words alone when there is nothing to measure. */
export function HeldMeter({ held, total, noun, className }: { held: number; total: number; noun: string; className?: string }) {
  const percent = total > 0 ? Math.round((Math.min(held, total) / total) * 100) : 0;
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-sm text-fg-muted">
        <span className="font-semibold tabular-nums text-fg-default">
          {held} of {total}
        </span>{' '}
        {noun}
      </p>
      {total > 0 && (
        <div className="mt-1.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-bg-elevated" aria-hidden="true">
          <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * Renders its children only for a signed-in person. While the session is
 * being checked it shows a loader; signed out, it sends the person to sign in
 * and brings them back here afterwards.
 */
export function AccountGate({ children }: { children: (account: SignedInAccount) => ReactNode }) {
  const location = useLocation();
  const { data, error, refetch, isFetching } = useAccount();

  if (!data) {
    if (error) {
      return (
        <PageContainer size="narrow">
          <LoadError error={error} onRetry={() => void refetch()} retrying={isFetching} />
        </PageContainer>
      );
    }
    return <PageLoading label="Checking who is signed in" />;
  }
  if (!data.user) {
    return <Navigate to={signInPath(`${location.pathname}${location.search}`)} replace />;
  }
  return <>{children(data as SignedInAccount)}</>;
}

/** The value, a beat after it stops changing. For search-as-you-type. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Arrow keys for a group of buttons that act as radios or tabs: the next or
 * previous one is chosen and takes focus. Goes on the group; each button in
 * it takes `tabIndex={selected ? 0 : -1}`, so the group is one tab stop.
 */
export function arrowKeyChoice<T extends string>(values: readonly T[], current: T, onChange: (value: T) => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    onChange(values[(values.indexOf(current) + step + values.length) % values.length]);
    const group = event.currentTarget;
    window.setTimeout(
      () => group.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], [role="tab"][aria-selected="true"]')?.focus(),
      0
    );
  };
}
