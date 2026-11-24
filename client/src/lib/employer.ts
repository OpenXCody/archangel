import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Membership, MembershipStatus } from './account';
import { request, retryUnlessClientError } from './http';
import type { JobStatus } from './jobs';
import { accountKeys, invalidate } from './queryKeys';

/**
 * The employer page's own data: a person's companies with their factories and
 * jobs, and asking to join a company or leaving one. Finding a company and
 * asking for a missing one are in `employerCompanies.ts`; a job's edits and
 * applicants in `employerJobs.ts`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmployerFactory {
  id: string;
  companyId: string;
  name: string;
  /** The street address, when on record. */
  address?: string | null;
  city: string | null;
  state: string | null;
}

export interface EmployerJob {
  id: string;
  serial: number;
  companyId: string;
  title: string;
  status: JobStatus;
  postedAt: string;
  expiresAt: string;
  factoryName: string;
  city: string | null;
  /** With the number, what the job's address is written from. */
  companyName?: string;
  companySlug?: string | null;
  occupationTitle?: string;
  applicants: number;
  newApplicants: number;
}

export interface EmployerCompany extends Membership {
  /** When an admin approved or declined the request. */
  decidedAt: string | null;
  /** For a declined request: when the person can ask again. */
  askAgainAt: string | null;
  factories: EmployerFactory[];
  /** The jobs the company's members posted here. */
  jobs: EmployerJob[];
  /** Open jobs that come from the company's own careers site: kept in step with it, not managed here. */
  listedJobs?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

const employerApi = {
  get: () => request<{ companies: EmployerCompany[] }>('/employer').then((r) => r.companies),
  requestMembership: (companyId: string) =>
    request<{ companyId: string; status: MembershipStatus; role: string }>('/employer/memberships', {
      method: 'POST',
      body: { companyId },
    }),
  cancelMembership: (companyId: string) =>
    request<{ ok: true }>(`/employer/memberships/${companyId}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useEmployer(enabled = true) {
  return useQuery({
    queryKey: accountKeys.employer,
    queryFn: employerApi.get,
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

export function useRequestMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => employerApi.requestMembership(companyId),
    // Also when refused: a request declined a moment ago is only known once the list is read again.
    onSettled: () =>
      invalidate(queryClient, accountKeys.employer, accountKeys.account, accountKeys.admin, accountKeys.jobs, accountKeys.news),
  });
}

/** Cancel a pending request, or leave a company. */
export function useCancelMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => employerApi.cancelMembership(companyId),
    onSuccess: () =>
      invalidate(queryClient, accountKeys.employer, accountKeys.account, accountKeys.admin, accountKeys.jobs, accountKeys.news),
  });
}
