import type { ElementType, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AlertCircle, Briefcase, Building2, Factory, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { justLeft, signInPath, useAccount, type SignedInAccount } from '../../lib/account';
import { errorMessage } from '../../lib/http';
import { applicationStatusLabel } from '../../lib/jobFormat';
import { onGroupArrowKeys } from '../../lib/roving';
import { PageContainer } from '../layout/Page';
import { ShareRing } from '../path/HeldShare';

/** Small shared pieces for the account, jobs, employer and admin pages. */

/** The icon a picker shows beside a company, a plant or a career. The app is monochrome: an icon is never coloured by kind. */
export const KIND_ICON: Record<'company' | 'factory' | 'career', ElementType> = {
  company: Building2,
  factory: Factory,
  career: Briefcase,
};

/**
 * Text inputs and textareas share one look. 16px on phones stops iOS zooming
 * on focus; `border-solid` undoes the global `input { border: none }`.
 */
export const fieldClass =
  'block min-h-[42px] w-full rounded-lg border border-solid border-line-strong bg-surface px-3 py-2 text-base text-text-1 ' +
  'placeholder:text-text-3 transition-colors focus:border-[color:var(--text-2)] focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm';

/** A select's trigger and list, matched to the text fields beside them. */
export const selectTriggerClass =
  'h-[42px] rounded-lg border-line-strong bg-surface px-3 text-base text-text-1 sm:text-sm';
export const selectContentClass = 'max-w-[calc(100vw-2rem)] rounded-lg border-line-strong bg-surface';

/** A button that is busy keeps focus: it is marked, not disabled. */
export const busyButtonClass = 'aria-disabled:pointer-events-none aria-disabled:opacity-60';

export const cardClass = 'rounded-xl border border-line';

/** A row inside a card: a hairline between rows, none above the first. */
export const rowClass = 'border-t border-line first:border-t-0';

/** Outline buttons need a border that shows on the dark surface. */
export const outlineButtonClass = 'border-line-strong bg-transparent text-text-1 hover:bg-surface-hover';

/**
 * A plain text action inside a row. Destructive ones look the same: the
 * confirmation, not the button, carries the weight.
 */
export const textButtonClass =
  'text-sm font-medium text-text-2 underline underline-offset-4 transition-colors hover:text-text-1 ' +
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
      <Label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-text-2">
        {label}
        {optional && <span className="ml-1.5 font-normal text-text-3">optional</span>}
      </Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-text-2">{hint}</p>}
    </div>
  );
}

interface SegmentedChoiceProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** The group's name for a screen reader: the words, or the id of the element that says them. */
  label?: string;
  labelledBy?: string;
  /** The group is a grid: its columns and width. */
  className?: string;
  /** Added to each choice: its padding, whether it truncates. */
  optionClassName?: string;
}

/**
 * A few choices side by side in one control the height of a field. Tab
 * reaches it once; the arrow keys move between the choices.
 */
export function SegmentedChoice<T extends string>({ options, value, onChange, label, labelledBy, className, optionClassName }: SegmentedChoiceProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      onKeyDown={(event) => onGroupArrowKeys(event, options.map((option) => option.value), value, onChange)}
      className={cn('grid h-[42px] gap-1 rounded-lg border border-line p-1', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md text-sm font-medium transition-colors',
            optionClassName,
            value === option.value ? 'bg-inverse-bg text-inverse-text' : 'text-text-2 hover:text-text-1'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A problem with one field, said beside it. */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-xs text-danger">
      {message}
    </p>
  );
}

/** The dot between two facts on one line. */
export function Dot() {
  return (
    <span className="mx-1.5" aria-hidden="true">
      ·
    </span>
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
      <p className="flex min-w-0 items-start gap-2 text-sm text-text-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <span className="min-w-0 break-words">{errorMessage(error)}</span>
      </p>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-busy={retrying || undefined}
          aria-disabled={retrying || undefined}
          onClick={() => {
            if (!retrying) onRetry();
          }}
          className={cn('h-9 shrink-0', outlineButtonClass, busyButtonClass)}
        >
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
      <Loader2 className="h-8 w-8 animate-spin text-text-2" />
    </div>
  );
}

/** A quiet message inside a card: an empty list, or a short notice. */
export function CardNote({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(cardClass, 'px-4 py-6 text-center text-sm text-text-2', className)}>{children}</div>;
}

/**
 * A stage reads by brightness, not hue: the further along, the brighter, and
 * a finished application that went nowhere steps back.
 */
const STATUS_STYLE: Record<string, string> = {
  applied: 'border-line-strong text-text-2',
  reviewing: 'border-line-strong bg-surface text-text-2',
  interview: 'border-line-strong bg-surface text-text-1',
  offer: 'border-text-2 bg-surface text-text-1',
  hired: 'border-text-1 bg-text-1 text-inverse-text',
  declined: 'border-line text-text-3',
  withdrawn: 'border-line text-text-3',
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

/** How much is held: the ring every path uses, then "N of M" and what is counted. */
export function HeldMeter({ held, total, noun, className }: { held: number; total: number; noun: string; className?: string }) {
  return (
    <p className={cn('flex min-w-0 items-center gap-2 text-sm text-text-2', className)}>
      {total > 0 && <ShareRing share={{ held, learning: 0, total }} />}
      <span className="min-w-0">
        <span className="font-semibold tabular-nums text-text-1">
          {held} of {total}
        </span>{' '}
        {noun}
      </span>
    </p>
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
    // Someone who has just signed out here goes on to the map; anyone else is asked to sign in.
    return <Navigate to={justLeft(data) ? '/map' : signInPath(`${location.pathname}${location.search}`)} replace />;
  }
  return <>{children(data as SignedInAccount)}</>;
}
