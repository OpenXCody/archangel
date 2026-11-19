import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryString, request, retryUnlessClientError } from './http';
import { accountKeys, invalidate } from './queryKeys';

/**
 * Jobs and applications: the open jobs anyone can read, applying to one, and
 * what a company's members do with a job (post, close, reopen, move an
 * application). Editing and deleting a job, and its applicants with their
 * skills, are in `employerJobs.ts`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApplicationStatus = 'applied' | 'reviewing' | 'interview' | 'offer' | 'hired' | 'declined' | 'withdrawn';

/** Stages a company moves an application through, in order. */
const PIPELINE_STATUSES: ApplicationStatus[] = ['applied', 'reviewing', 'interview', 'offer', 'hired'];

/** Everything a company can set: the pipeline, or declined. */
export const EMPLOYER_STATUSES: ApplicationStatus[] = [...PIPELINE_STATUSES, 'declined'];

const FINISHED_STATUSES: ReadonlySet<string> = new Set(['hired', 'declined', 'withdrawn']);

/** A finished application can no longer change. */
export function isFinished(status: string): boolean {
  return FINISHED_STATUSES.has(status);
}

export type PayPeriod = 'hour' | 'year';

export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'apprenticeship';

export type JobStatus = 'draft' | 'open' | 'closed';

export const EMPLOYMENT_TYPES: EmploymentType[] = ['full-time', 'part-time', 'contract', 'apprenticeship'];

export interface JobSummary {
  id: string;
  serial: number;
  title: string;
  employmentType: EmploymentType;
  shift: string | null;
  /** Integer cents. */
  payMin: number | null;
  /** Integer cents. */
  payMax: number | null;
  payPeriod: PayPeriod;
  status: JobStatus;
  postedAt: string;
  expiresAt: string;
  companyId: string;
  companyName: string;
  /** The company's web domain, for its logo. */
  companyDomain?: string | null;
  factoryId: string;
  factoryName: string;
  city: string | null;
  state: string | null;
  latitude: string | null;
  longitude: string | null;
  occupationId: string;
  occupationTitle: string;
  /** Miles from the place the list was asked for (`near`); absent otherwise. */
  miles?: number | null;
}

export interface JobDetail extends JobSummary {
  description: string | null;
  /** Set when people apply on the company's own site. */
  applyUrl: string | null;
  closedReason: string | null;
  /** Open and not expired. */
  isOpen: boolean;
  /** The company has its own version of the job's career. */
  hasVersion?: boolean;
}

export interface JobSkill {
  id: string;
  name: string;
  required: boolean;
  /** True when the signed-in person holds it; always false when signed out. */
  held: boolean;
}

export interface JobDetailResponse {
  job: JobDetail;
  skills: JobSkill[];
  myApplication: { id: string; status: ApplicationStatus; createdAt: string } | null;
  canManage: boolean;
}

export interface JobFilters {
  q?: string;
  /** Two-letter state code. */
  state?: string;
  occupationId?: string;
  companyId?: string;
  factoryId?: string;
  /** "latitude,longitude": only jobs within `within` miles of the point, nearest first. */
  near?: string;
  /** Miles; 50 when left out. */
  within?: number;
  limit?: number;
}

export interface NewJob {
  companyId: string;
  factoryId: string;
  occupationId: string;
  title?: string;
  description?: string | null;
  employmentType?: EmploymentType;
  shift?: string | null;
  /** Integer cents. */
  payMin: number;
  /** Integer cents. */
  payMax: number;
  payPeriod?: PayPeriod;
  /** An https link, or null to take applications in the app. */
  applyUrl?: string | null;
  /** The skills the job asks for. Left out, the job takes its career's skills. */
  skills?: { skillId: string; required: boolean }[];
}

export interface JobPatch {
  status?: 'open' | 'closed';
  closedReason?: string;
}

export interface Applicant {
  id: string;
  status: ApplicationStatus;
  note: string | null;
  employerNote: string | null;
  createdAt: string;
  applicant: { id: string; name: string; email: string; homeZip: string | null };
  heldRequired: number;
  totalRequired: number;
  heldOptional: number;
}

export interface ApplicationPatch {
  status?: ApplicationStatus;
  employerNote?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

const jobsApi = {
  list: (filters: JobFilters = {}) =>
    request<{ jobs: JobSummary[] }>(`/jobs${queryString({ ...filters })}`).then((r) => r.jobs),
  get: (id: string) => request<JobDetailResponse>(`/jobs/${id}`),
  create: (job: NewJob) => request<{ id: string; serial: number }>('/jobs', { method: 'POST', body: job }),
  update: (id: string, patch: JobPatch) => request<{ ok: true }>(`/jobs/${id}`, { method: 'PATCH', body: patch }),
  apply: (id: string, note?: string) =>
    request<{ id: string; status: ApplicationStatus }>(`/jobs/${id}/apply`, { method: 'POST', body: { note: note ?? '' } }),
  updateApplication: (applicationId: string, patch: ApplicationPatch) =>
    request<{ id: string; status: ApplicationStatus }>(`/jobs/applications/${applicationId}`, {
      method: 'PATCH',
      body: patch,
    }),
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useJobs(filters: JobFilters = {}) {
  return useQuery({
    queryKey: accountKeys.jobList(filters),
    queryFn: () => jobsApi.list(filters),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    retry: retryUnlessClientError,
  });
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: accountKeys.job(id ?? ''),
    queryFn: () => jobsApi.get(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: retryUnlessClientError,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.create,
    onSuccess: () => invalidate(queryClient, accountKeys.jobs, accountKeys.employer, accountKeys.adminOverview),
  });
}

/** Close or reopen a job. */
export function useUpdateJob(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: JobPatch) => jobsApi.update(jobId, patch),
    onSuccess: () =>
      invalidate(queryClient, accountKeys.jobs, accountKeys.employer, accountKeys.applications, accountKeys.adminOverview),
  });
}

export function useApply(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => jobsApi.apply(jobId, note),
    // Also refresh when it fails: "already applied" or "no longer open" means our copy is stale.
    onSettled: () =>
      invalidate(
        queryClient,
        accountKeys.job(jobId),
        accountKeys.applicants(jobId),
        accountKeys.applications,
        accountKeys.employer,
        accountKeys.adminOverview
      ),
  });
}

/** A company moves an application or notes it; the applicant withdraws. */
export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, patch }: { applicationId: string; patch: ApplicationPatch }) =>
      jobsApi.updateApplication(applicationId, patch),
    onSettled: () =>
      invalidate(queryClient, accountKeys.jobApplicants, accountKeys.jobDetails, accountKeys.applications, accountKeys.employer),
  });
}
