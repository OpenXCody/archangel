import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountKeys, invalidate, publicKeys } from './queryKeys';
import { ApiError, request } from './http';

/**
 * Finding a company to post jobs for, and asking for one that is not in the
 * data (or a missing plant of one) to be added. The admin's side of those
 * requests is here too, so everything about them is in one file.
 */

// ---------------------------------------------------------------------------
// Company search
// ---------------------------------------------------------------------------

export interface FoundCompany {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  factoryCount: number;
  /** Where its plants are: "Austin, TX" for one, the states with the most for several. */
  where: string | null;
}

export interface CompanySearchResult {
  companies: FoundCompany[];
  /** How many companies match, not only the ones returned. */
  total: number;
  /** True when no name matched and these are the closest names instead. */
  close: boolean;
}

/** How many companies the search lists at once. */
export const COMPANY_SEARCH_LIMIT = 8;

/** Companies by name, tolerant of spelling, spacing, "&" and the legal form. From two letters. */
export function useCompanySearch(q: string) {
  return useQuery({
    queryKey: publicKeys.picker('companies', q),
    queryFn: () => request<CompanySearchResult>(`/employer/companies?q=${encodeURIComponent(q)}&limit=${COMPANY_SEARCH_LIMIT}`),
    enabled: q.length >= 2,
    staleTime: 60_000,
    // Asked even when the browser says it is offline, so the list says so rather than waiting.
    networkMode: 'always',
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Requests to add a company or a plant
// ---------------------------------------------------------------------------

export type CompanyRequestStatus = 'requested' | 'added' | 'declined';

export interface CompanyRequest {
  id: string;
  /** Set when the request is for a plant of a company already in the data. */
  companyId: string | null;
  /** The company's name: as the person wrote it, or the company the plant belongs to. */
  name: string;
  website: string | null;
  place: string;
  status: CompanyRequestStatus;
  createdAt: string;
  decidedAt: string | null;
  addedCompanyId: string | null;
}

export interface NewCompanyRequest {
  name?: string;
  website?: string;
  place: string;
  /** For a plant of a company the person posts jobs for. */
  companyId?: string;
}

/** A request as an admin reads it: with who asked. */
export interface AdminCompanyRequest extends CompanyRequest {
  /** For a plant: the company it belongs to. */
  companyName: string | null;
  userId: string;
  userName: string;
  userEmail: string;
}

/** Which field of the request form a refusal is about, when the server says. */
export function requestField(error: unknown): 'name' | 'website' | 'place' | null {
  if (!(error instanceof ApiError) || !error.payload || typeof error.payload !== 'object') return null;
  const { field } = error.payload as { field?: unknown };
  return field === 'name' || field === 'website' || field === 'place' ? field : null;
}

/** The person's own requests: those waiting, and those answered in the last 30 days. */
export function useCompanyRequests(enabled = true) {
  return useQuery({
    queryKey: accountKeys.companyRequests,
    queryFn: () => request<{ requests: CompanyRequest[] }>('/employer/company-requests').then((r) => r.requests),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useAskForCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewCompanyRequest) =>
      request<{ request: CompanyRequest }>('/employer/company-requests', { method: 'POST', body: input }).then((r) => r.request),
    onSuccess: () =>
      invalidate(queryClient, accountKeys.companyRequests, accountKeys.adminCompanyRequests, accountKeys.news),
  });
}

/** Withdraw a request that is still waiting. */
export function useWithdrawCompanyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<{ ok: true }>(`/employer/company-requests/${id}`, { method: 'DELETE' }),
    onSuccess: () =>
      invalidate(queryClient, accountKeys.companyRequests, accountKeys.adminCompanyRequests),
  });
}

/** For an admin: the requests that are waiting, oldest first. */
export function useAdminCompanyRequests(enabled = true) {
  return useQuery({
    queryKey: accountKeys.adminCompanyRequests,
    queryFn: () => request<{ requests: AdminCompanyRequest[] }>('/admin/company-requests').then((r) => r.requests),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * Answer a request. `add` with a company gives the person access to it; `add`
 * for a plant marks it done; `decline` refuses it.
 */
export function useAnswerCompanyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...answer }: { id: string; decision: 'add' | 'decline'; companyId?: string }) =>
      request<{ status: CompanyRequestStatus }>(`/admin/company-requests/${id}`, { method: 'PATCH', body: answer }),
    onSettled: () =>
      invalidate(queryClient, accountKeys.admin, accountKeys.account, accountKeys.employer, accountKeys.news),
  });
}
