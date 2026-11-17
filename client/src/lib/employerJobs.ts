import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from './api';
import { ApiError, accountKeys, type Applicant, type EmploymentType, type PayPeriod } from './account';
import { parseDollars } from './jobFormat';

/**
 * What a company does with its own jobs beyond posting and closing: edit one,
 * delete one nobody applied to, and read applicants with their skills. Also
 * the checks the job form runs before it sends anything.
 *
 * Calls go to the same API as `account.ts`, with the same session cookie and
 * the same errors (`ApiError`, whose message is written for the person).
 */

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function send<T>(path: string, method: 'GET' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const said = payload && typeof payload === 'object' && 'error' in payload ? (payload as { error: unknown }).error : null;
    const message =
      response.status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : typeof said === 'string' && said
          ? said
          : `The request could not be completed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  const refused = error instanceof ApiError && error.status >= 400 && error.status < 500;
  return !refused && failureCount < 1;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The parts of a job that can change after it is posted. Company, factory and career cannot. */
export interface JobEdit {
  title?: string;
  description?: string | null;
  employmentType?: EmploymentType;
  shift?: string | null;
  /** Integer cents. Sent together with `payMax`. */
  payMin?: number;
  /** Integer cents. */
  payMax?: number;
  payPeriod?: PayPeriod;
  /** A web address, or null to take applications in the app. */
  applyUrl?: string | null;
  /** The whole list: a skill left out is no longer asked for. */
  skills?: { skillId: string; required: boolean }[];
}

/** One skill the job asks for, as the applicant list names it. */
export interface ApplicantSkill {
  id: string;
  name: string;
  required: boolean;
}

export interface RankedApplicant extends Applicant {
  statusChangedAt: string;
  /** Ids of the job's skills this person holds. */
  heldSkillIds: string[];
  /** Ids of the job's skills this person is learning. */
  learningSkillIds: string[];
}

export interface JobApplicants {
  skillsAreSelfReported: boolean;
  /** The job's skills, required first. */
  skills: ApplicantSkill[];
  /** Already ranked by the server: most required skills held first. */
  applications: RankedApplicant[];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** A job's applicants, each with which of the job's skills they hold and are learning. */
export function useApplicantList(jobId: string | undefined) {
  return useQuery({
    queryKey: accountKeys.applicants(jobId ?? ''),
    queryFn: () => send<JobApplicants>(`/jobs/${jobId as string}/applications`, 'GET'),
    enabled: Boolean(jobId),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

/** Change a posted job's fields and skills. */
export function useEditJob(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (edit: JobEdit) => send<{ ok: true }>(`/jobs/${jobId}`, 'PATCH', edit),
    // The listing, the lists it appears in, and the applicants' standing all follow.
    onSuccess: () =>
      Promise.all(
        [accountKeys.jobs, accountKeys.employer, accountKeys.applications].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      ),
  });
}

/** Delete a job nobody has applied to. The server refuses one with applications. */
export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => send<{ ok: true }>(`/jobs/${jobId}`, 'DELETE'),
    onSuccess: (_result, jobId) => {
      // Nothing is left to refetch for the job itself.
      queryClient.removeQueries({ queryKey: accountKeys.job(jobId) });
      queryClient.removeQueries({ queryKey: accountKeys.applicants(jobId) });
      return Promise.all(
        [['jobs', 'list'], accountKeys.employer, accountKeys.adminOverview].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      );
    },
    // Refused because someone has applied since: the lists are stale.
    onError: () => queryClient.invalidateQueries({ queryKey: accountKeys.employer }),
  });
}

// ---------------------------------------------------------------------------
// The job form's checks
// ---------------------------------------------------------------------------

export const DESCRIPTION_MAX = 8000;
/** The count is shown once this few characters are left. */
export const DESCRIPTION_WARN = 1000;

/** The most the API takes for either end of a pay range. */
const PAY_MAX_CENTS = 100_000_000;

function dollarsText(cents: number): string {
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** Cents as the text a person would type into a pay field: "24.50", "52,000". */
export function payInputText(cents: number | null): string {
  return cents === null ? '' : dollarsText(cents);
}

export interface PayCheck {
  /** Integer cents, or null while that end is missing or unreadable. */
  min: number | null;
  max: number | null;
  minError: string | null;
  maxError: string | null;
  /** Both ends are readable but the lowest is above the highest. */
  rangeError: string | null;
  /**
   * The amount and the period look mismatched ("$52,000 per hour"). Not an
   * error: the person says which period they meant.
   */
  question: string | null;
}

function checkAmount(text: string, which: 'lowest' | 'highest'): { cents: number | null; error: string | null } {
  if (!text.trim()) return { cents: null, error: `Enter the ${which} pay.` };
  const cents = parseDollars(text);
  if (cents === null) return { cents: null, error: 'Enter an amount in dollars, such as 24.50.' };
  if (cents > PAY_MAX_CENTS) return { cents: null, error: 'Enter an amount up to $1,000,000.' };
  return { cents, error: null };
}

/** Read the two pay fields. Problems are worded for the field they belong to. */
export function checkPay(minText: string, maxText: string, period: PayPeriod): PayCheck {
  const low = checkAmount(minText, 'lowest');
  const high = checkAmount(maxText, 'highest');
  const both = low.cents !== null && high.cents !== null;
  const rangeError = both && (high.cents as number) < (low.cents as number) ? 'The lowest is above the highest.' : null;

  let question: string | null = null;
  if (both && !rangeError) {
    // More than $500 an hour, or less than $10,000 a year, is usually the other period.
    if (period === 'hour' && (high.cents as number) > 500_00) question = `$${dollarsText(high.cents as number)} per hour.`;
    if (period === 'year' && (low.cents as number) < 10_000_00) question = `$${dollarsText(low.cents as number)} per year.`;
  }
  return { min: low.cents, max: high.cents, minError: low.error, maxError: high.error, rangeError, question };
}

/**
 * The application link as it will be stored: https, added when the address
 * was typed without it. Null when the text is not a web address.
 */
export function normalizeLink(text: string): string | null {
  const typed = text.trim();
  if (!typed || /\s/.test(typed)) return null;
  const bare = typed.replace(/^https?:\/\//i, '');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(bare)) return null;
  const link = `https://${bare}`;
  if (link.length > 500) return null;
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && url.hostname.includes('.') && !url.username && !url.password ? link : null;
  } catch {
    return null;
  }
}
