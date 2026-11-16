import { useEffect, useState, type ElementType, type ReactNode } from 'react';
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

/** Entity colours (CLAUDE.md). A career is the occupation entity. */
export const ENTITY: Record<'company' | 'factory' | 'career' | 'skill', { icon: ElementType; text: string; badge: string }> = {
  company: { icon: Building2, text: 'text-amber-500', badge: 'bg-amber-500/10 text-amber-500' },
  factory: { icon: Factory, text: 'text-blue-400', badge: 'bg-blue-400/10 text-blue-400' },
  career: { icon: Briefcase, text: 'text-blue-500', badge: 'bg-blue-800/20 text-blue-400' },
  skill: { icon: Wrench, text: 'text-emerald-500', badge: 'bg-emerald-500/10 text-emerald-500' },
};

/**
 * Text inputs and textareas share one look. 16px on phones stops iOS zooming
 * on focus; `border-solid` undoes the global `input { border: none }`.
 */
export const fieldClass =
  'block min-h-[42px] w-full rounded-lg border border-solid border-border-strong bg-bg-elevated px-3 py-2 text-base text-fg-default ' +
  'placeholder:text-fg-soft transition-colors focus:border-[color:var(--color-fg-muted)] focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm';

export const cardClass = 'rounded-xl border border-border-subtle bg-bg-surface';

/** A row inside a card: a hairline between rows, none above the first. */
export const rowClass = 'border-t border-border-subtle first:border-t-0';

/** Outline buttons need a border that shows on the dark surface. */
export const outlineButtonClass = 'border-border-strong bg-transparent text-fg-default shadow-none hover:bg-bg-elevated';

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
    <p role="alert" className={cn('flex items-start gap-2 text-sm text-red-400', className)}>
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
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
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
  reviewing: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
  interview: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  offer: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  hired: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300',
  declined: 'border-red-500/30 bg-red-500/10 text-red-300',
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
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
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
