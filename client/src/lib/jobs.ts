import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryString, request, retryUnlessClientError } from './http';
import { accountKeys, invalidate } from './queryKeys';
import type { CareerJob, SkillLevel, TaxonomyRef } from './api';

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
  /** Null only on a job from a company's careers site that does not say. */
  employmentType: EmploymentType | null;
  shift: string | null;
  /** Integer cents. Null where a job from a company's careers site states no pay. */
  payMin: number | null;
  /** Integer cents. */
  payMax: number | null;
  payPeriod: PayPeriod;
  status: JobStatus;
  postedAt: string;
  /** True where a posting from a careers site gives no date: `postedAt` is the day it was first seen. */
  undated?: boolean | null;
  expiresAt: string;
  companyId: string;
  companyName: string;
  /** The company's slug, for the job's address (`jobPath` in shared/jobs.ts). */
  companySlug?: string | null;
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
  /**
   * The job came from the company's own careers site and is kept in step with
   * it: people apply there (`applyUrl`), and nobody edits it here.
   */
  fromSource?: boolean;
  /** The level the title states ("II", "Senior"), where it states one. */
  levelWord?: string | null;
  levelRank?: number | null;
  /** What the posting asks for, as facts: only the keys that were said. */
  requirements?: JobRequirements | null;
  lastSeenAt?: string | null;
  /** The job's address as links are written today: the page puts it in place of an older one. */
  href?: string;
}

export interface JobRequirements {
  yearsMin?: number;
  yearsMax?: number;
  education?: string;
  certifications?: string[];
  clearance?: string;
  citizenship?: string;
}

export interface JobSkill {
  id: string;
  name: string;
  required: boolean;
  /** True when the signed-in person holds it; always false when signed out. */
  held: boolean;
  /** The makes of the skill the job names (the machines or software it is run on). */
  makes?: { id: string; name: string }[];
}

/** A skill on a job's page: its place in the taxonomy, and what this job and this reader say of it. */
export interface JobPathSkill {
  id: string;
  name: string;
  level: SkillLevel | null;
  group: TaxonomyRef | null;
  domain: TaxonomyRef | null;
  /** The posting's own words name it. Always false on a job posted here by hand. */
  named: boolean;
  /** On a job posted here by hand: good to have, not needed. */
  optional: boolean;
  /** The company's version of the career adds it to the standard path. */
  added: boolean;
  /** The signed-in reader holds it. */
  held: boolean;
  /** The makes of the skill the job names. */
  makes: { id: string; name: string }[];
}

/**
 * The skills a job's page draws (see `readJobPath` in server/routes/jobs.ts).
 * `skills` is, in path order: the company's version of the job's career
 * (`of: 'version'`) or the career's standard path (`'career'`) for a job from
 * a careers site; the skills the company chose (`'job'`) for one posted here.
 * `alsoNamed` is what a posting names that is not on that path.
 */
export interface JobPath {
  of: 'version' | 'career' | 'job';
  skills: JobPathSkill[];
  alsoNamed: JobPathSkill[];
}

export interface JobDetailResponse {
  job: JobDetail;
  /** The job's own skills (`job_skills`), by name. The page draws `path`. */
  skills: JobSkill[];
  path: JobPath;
  /** Other open jobs: for this career at this company, and for other careers at this factory. */
  others: { career: { jobs: CareerJob[]; total: number }; factory: { jobs: CareerJob[]; total: number } };
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
  /** The jobs that ask for a skill. */
  skillId?: string;
  /** "latitude,longitude": only jobs within `within` miles of the point, nearest first. */
  near?: string;
  /** Miles; 50 when left out. */
  within?: number;
  limit?: number;
  offset?: number;
}

/** A page of the jobs list, and how many jobs match in all. */
export interface JobPage {
  jobs: JobSummary[];
  total: number;
  limit: number;
  offset: number;
}

/** How many jobs are open, and the states that have some. */
export interface JobsSummary {
  total: number;
  states: { state: string; jobs: number }[];
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
  page: (filters: JobFilters = {}) => request<JobPage>(`/jobs${queryString({ ...filters })}`),
  summary: () => request<JobsSummary>('/jobs/summary'),
  get: (id: string) => request<JobDetailResponse>(`/jobs/${id}`),
  byNumber: (serial: number) => request<JobDetailResponse>(`/jobs/by-number/${serial}`),
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

/** How many jobs the list shows at first, and adds each time more are asked for. */
export const JOBS_PAGE = 40;

/**
 * The open jobs that match, a page at a time: `jobs` is every page fetched so
 * far, `total` how many match in all. Asking for more adds a page.
 */
export function useJobs(filters: JobFilters = {}) {
  const query = useInfiniteQuery({
    queryKey: accountKeys.jobList(filters),
    queryFn: ({ pageParam }) => jobsApi.page({ ...filters, limit: JOBS_PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const fetched = pages.reduce((sum, page) => sum + page.jobs.length, 0);
      return last.jobs.length > 0 && fetched < last.total ? fetched : undefined;
    },
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    retry: retryUnlessClientError,
  });
  const pages = query.data?.pages;
  return {
    ...query,
    jobs: pages?.flatMap((page) => page.jobs),
    total: pages?.[0]?.total ?? 0,
  };
}

/** How many jobs are open anywhere, and where: whether there is anything to filter, and the states on offer. */
export function useJobsSummary() {
  return useQuery({ queryKey: accountKeys.jobsSummary, queryFn: jobsApi.summary, staleTime: 60_000, retry: retryUnlessClientError });
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

/**
 * A job as its page reads it, by what the address gives: its number
 * (/jobs/<company>/<career>/<number>) or, on an older link, its id.
 */
export function useJobPage(ref: { serial: number } | { id: string } | null) {
  return useQuery({
    queryKey: accountKeys.job(ref ? ('serial' in ref ? `number:${ref.serial}` : ref.id) : ''),
    queryFn: () => ('serial' in ref! ? jobsApi.byNumber(ref.serial) : jobsApi.get(ref!.id)),
    enabled: Boolean(ref),
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
        // Every copy of the job: its page reads it by number, other places by id.
        accountKeys.jobDetails,
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
