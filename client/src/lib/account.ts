import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ADMIN_HEADER, API_BASE } from './api';

/**
 * Accounts, jobs, applications, the employer area and the admin area.
 *
 * The session is an HttpOnly cookie set by the API, so every call here is a
 * plain same-origin fetch: no token is read or stored in the client.
 * Errors arrive as `{ error: string }` written for the person using the app;
 * `ApiError.message` carries that text and is safe to show as is.
 */

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

function messageFor(payload: unknown, status: number): string {
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const { error } = payload as { error: unknown };
    if (typeof error === 'string' && error) return error;
  }
  return `The request could not be completed (${status}).`;
}

async function request<T>(path: string, { method = 'GET', body, headers }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(messageFor(payload, response.status), response.status);
  return payload as T;
}

/** The text to show a person for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/** Retry once on network or server trouble; never on a 4xx, which will not change. */
function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  return !isClientError(error) && failureCount < 1;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  homeZip: string | null;
  about: string | null;
}

export type MembershipStatus = 'requested' | 'active';

export interface Membership {
  companyId: string;
  companyName: string;
  role: string;
  status: MembershipStatus;
}

/** `user` is null when nobody is signed in. */
export interface Account {
  user: AccountUser | null;
  memberships: Membership[];
  isEmployer: boolean;
}

export interface SignedInAccount extends Account {
  user: AccountUser;
}

export type SkillStatus = 'learning' | 'held';

export interface MySkill {
  skillId: string;
  name: string;
  status: SkillStatus;
  updatedAt: string;
}

export interface MyGoal {
  occupationId: string;
  title: string;
  createdAt: string;
  totalSkills: number;
  heldSkills: number;
}

export type ApplicationStatus = 'applied' | 'reviewing' | 'interview' | 'offer' | 'hired' | 'declined' | 'withdrawn';

/** Stages a company moves an application through, in order. */
export const PIPELINE_STATUSES: ApplicationStatus[] = ['applied', 'reviewing', 'interview', 'offer', 'hired'];
/** Everything a company can set: the pipeline, or declined. */
export const EMPLOYER_STATUSES: ApplicationStatus[] = [...PIPELINE_STATUSES, 'declined'];
const FINISHED_STATUSES: ReadonlySet<string> = new Set(['hired', 'declined', 'withdrawn']);

/** A finished application can no longer change. */
export function isFinished(status: string): boolean {
  return FINISHED_STATUSES.has(status);
}

export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  note: string | null;
  createdAt: string;
  statusChangedAt: string;
  jobId: string;
  jobSerial: number;
  jobTitle: string;
  jobStatus: JobStatus;
  companyId: string;
  companyName: string;
  city: string | null;
  state: string | null;
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
  factoryId: string;
  factoryName: string;
  city: string | null;
  state: string | null;
  latitude: string | null;
  longitude: string | null;
  occupationId: string;
  occupationTitle: string;
}

export interface JobDetail extends JobSummary {
  description: string | null;
  /** Set when people apply on the company's own site. */
  applyUrl: string | null;
  closedReason: string | null;
  /** Open and not expired. */
  isOpen: boolean;
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
  occupationId?: string;
  companyId?: string;
  factoryId?: string;
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

export interface ApplicantsResponse {
  skillsAreSelfReported: boolean;
  /** Already ranked by the server: most required skills held first. */
  applications: Applicant[];
}

export interface ApplicationPatch {
  status?: ApplicationStatus;
  employerNote?: string;
}

export interface EmployerFactory {
  id: string;
  companyId: string;
  name: string;
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
  applicants: number;
  newApplicants: number;
}

export interface EmployerCompany extends Membership {
  factories: EmployerFactory[];
  jobs: EmployerJob[];
}

export interface AdminOverview {
  users: number;
  pendingMemberships: number;
  openJobs: number;
  applications: number;
}

export interface AdminMembership {
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  status: MembershipStatus;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  companies: number;
  applications: number;
}

export type MembershipDecision = 'approve' | 'remove';

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const authApi = {
  me: () => request<Account>('/auth/me'),
  signUp: (input: { email: string; password: string; name: string }) =>
    request<Account>('/auth/sign-up', { method: 'POST', body: input }),
  signIn: (input: { email: string; password: string }) =>
    request<Account>('/auth/sign-in', { method: 'POST', body: input }),
  signOut: () => request<{ ok: true }>('/auth/sign-out', { method: 'POST' }),
  /** The admin key travels in the same header the import pipeline uses. */
  claimAdmin: (adminKey: string) =>
    request<Account>('/auth/claim-admin', { method: 'POST', headers: { [ADMIN_HEADER]: adminKey } }),
};

export const meApi = {
  updateProfile: (patch: { name?: string; homeZip?: string; about?: string }) =>
    request<{ user: AccountUser }>('/me', { method: 'PATCH', body: patch }),
  skills: () => request<{ skills: MySkill[] }>('/me/skills').then((r) => r.skills),
  setSkill: (skillId: string, status: SkillStatus) =>
    request<{ skillId: string; status: SkillStatus }>(`/me/skills/${skillId}`, { method: 'PUT', body: { status } }),
  removeSkill: (skillId: string) => request<{ ok: true }>(`/me/skills/${skillId}`, { method: 'DELETE' }),
  goals: () => request<{ goals: MyGoal[] }>('/me/goals').then((r) => r.goals),
  addGoal: (occupationId: string) =>
    request<{ occupationId: string }>(`/me/goals/${occupationId}`, { method: 'PUT' }),
  removeGoal: (occupationId: string) => request<{ ok: true }>(`/me/goals/${occupationId}`, { method: 'DELETE' }),
  applications: () => request<{ applications: MyApplication[] }>('/me/applications').then((r) => r.applications),
};

export const jobsApi = {
  list: (filters: JobFilters = {}) =>
    request<{ jobs: JobSummary[] }>(`/jobs${queryString({ ...filters })}`).then((r) => r.jobs),
  get: (id: string) => request<JobDetailResponse>(`/jobs/${id}`),
  create: (job: NewJob) => request<{ id: string; serial: number }>('/jobs', { method: 'POST', body: job }),
  update: (id: string, patch: JobPatch) => request<{ ok: true }>(`/jobs/${id}`, { method: 'PATCH', body: patch }),
  apply: (id: string, note?: string) =>
    request<{ id: string; status: ApplicationStatus }>(`/jobs/${id}/apply`, { method: 'POST', body: { note: note ?? '' } }),
  applicants: (id: string) => request<ApplicantsResponse>(`/jobs/${id}/applications`),
  updateApplication: (applicationId: string, patch: ApplicationPatch) =>
    request<{ id: string; status: ApplicationStatus }>(`/jobs/applications/${applicationId}`, {
      method: 'PATCH',
      body: patch,
    }),
};

export const employerApi = {
  get: () => request<{ companies: EmployerCompany[] }>('/employer').then((r) => r.companies),
  requestMembership: (companyId: string) =>
    request<{ companyId: string; status: MembershipStatus; role: string }>('/employer/memberships', {
      method: 'POST',
      body: { companyId },
    }),
  cancelMembership: (companyId: string) =>
    request<{ ok: true }>(`/employer/memberships/${companyId}`, { method: 'DELETE' }),
};

export const adminApi = {
  overview: () => request<AdminOverview>('/admin/overview'),
  memberships: (status: MembershipStatus) =>
    request<{ memberships: AdminMembership[] }>(`/admin/memberships?status=${status}`).then((r) => r.memberships),
  decideMembership: (input: { companyId: string; userId: string; decision: MembershipDecision }) =>
    request<{ status: string }>('/admin/memberships', { method: 'PATCH', body: input }),
  users: () => request<{ users: AdminUser[] }>('/admin/users').then((r) => r.users),
};

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const accountKeys = {
  account: ['account'] as const,
  me: ['me'] as const,
  skills: ['me', 'skills'] as const,
  goals: ['me', 'goals'] as const,
  applications: ['me', 'applications'] as const,
  jobs: ['jobs'] as const,
  jobList: (filters: JobFilters) => ['jobs', 'list', filters] as const,
  jobDetails: ['jobs', 'detail'] as const,
  job: (id: string) => ['jobs', 'detail', id] as const,
  jobApplicants: ['jobs', 'applicants'] as const,
  applicants: (jobId: string) => ['jobs', 'applicants', jobId] as const,
  employer: ['employer'] as const,
  admin: ['admin'] as const,
  adminOverview: ['admin', 'overview'] as const,
  adminMemberships: (status: MembershipStatus) => ['admin', 'memberships', status] as const,
  adminUsers: ['admin', 'users'] as const,
  /** Owned by AdminKeyGate; a signed-in admin counts as authorized there. */
  importStatus: ['import-status'] as const,
};

const SIGNED_OUT: Account = { user: null, memberships: [], isEmployer: false };

/**
 * A different person (or nobody) is now signed in: store who, drop everything
 * cached for the previous person, and refresh what is public but personalised.
 */
function identityChanged(queryClient: QueryClient, account: Account): void {
  queryClient.setQueryData(accountKeys.account, account);
  queryClient.removeQueries({ queryKey: accountKeys.me });
  queryClient.removeQueries({ queryKey: accountKeys.employer });
  queryClient.removeQueries({ queryKey: accountKeys.admin });
  void queryClient.invalidateQueries({ queryKey: accountKeys.jobs });
  void queryClient.invalidateQueries({ queryKey: accountKeys.importStatus });
}

function invalidate(queryClient: QueryClient, ...keys: readonly (readonly unknown[])[]): Promise<void> {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(() => undefined);
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/** Who is signed in. `data.user` is null when nobody is. */
export function useAccount() {
  return useQuery({
    queryKey: accountKeys.account,
    queryFn: authApi.me,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

/**
 * Notice a session that ended elsewhere (expired, or signed out in another
 * tab): when any signed-in call answers 401, re-check who is signed in so
 * gated pages send the person to sign in. Mount once, in the app shell.
 */
export function useSessionExpiryWatch(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const recheck = (error: unknown, isAccountQuery: boolean) => {
      if (isAccountQuery || !(error instanceof ApiError) || error.status !== 401) return;
      const current = queryClient.getQueryData<Account>(accountKeys.account);
      if (current?.user) void queryClient.invalidateQueries({ queryKey: accountKeys.account });
    };
    const offQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') {
        recheck(event.action.error, event.query.queryKey[0] === accountKeys.account[0]);
      }
    });
    const offMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') recheck(event.action.error, false);
    });
    return () => {
      offQueries();
      offMutations();
    };
  }, [queryClient]);
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.signIn,
    onSuccess: (account) => identityChanged(queryClient, account),
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.signUp,
    onSuccess: (account) => identityChanged(queryClient, account),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.signOut,
    onSuccess: () => identityChanged(queryClient, SIGNED_OUT),
  });
}

/** Become an admin by presenting the deployment's admin key. */
export function useClaimAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.claimAdmin,
    onSuccess: (account) => {
      queryClient.setQueryData(accountKeys.account, account);
      return invalidate(queryClient, accountKeys.admin, accountKeys.jobs, accountKeys.employer, accountKeys.importStatus);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: meApi.updateProfile,
    onSuccess: ({ user }) => {
      queryClient.setQueryData<Account>(accountKeys.account, (current) =>
        current ? { ...current, user } : { ...SIGNED_OUT, user }
      );
    },
  });
}

// ---------------------------------------------------------------------------
// My skills, goals and applications
// ---------------------------------------------------------------------------

export function useMySkills(enabled = true) {
  return useQuery({ queryKey: accountKeys.skills, queryFn: meApi.skills, enabled, retry: retryUnlessClientError });
}

/** Which skills count as held changes goal progress and the marks on job pages. */
function skillsChanged(queryClient: QueryClient): Promise<void> {
  return invalidate(queryClient, accountKeys.skills, accountKeys.goals, accountKeys.jobDetails, accountKeys.jobApplicants);
}

export function useSetSkillStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, status }: { skillId: string; status: SkillStatus }) => meApi.setSkill(skillId, status),
    onSuccess: () => skillsChanged(queryClient),
  });
}

export function useRemoveSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) => meApi.removeSkill(skillId),
    onSuccess: () => skillsChanged(queryClient),
  });
}

export function useMyGoals(enabled = true) {
  return useQuery({ queryKey: accountKeys.goals, queryFn: meApi.goals, enabled, retry: retryUnlessClientError });
}

export function useAddGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (occupationId: string) => meApi.addGoal(occupationId),
    onSuccess: () => invalidate(queryClient, accountKeys.goals),
  });
}

export function useRemoveGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (occupationId: string) => meApi.removeGoal(occupationId),
    onSuccess: () => invalidate(queryClient, accountKeys.goals),
  });
}

export function useMyApplications(enabled = true) {
  return useQuery({
    queryKey: accountKeys.applications,
    queryFn: meApi.applications,
    enabled,
    // Stages move on the company's side, so do not sit on an old answer.
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

// ---------------------------------------------------------------------------
// Jobs and applications
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

export function useJobApplicants(jobId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: accountKeys.applicants(jobId ?? ''),
    queryFn: () => jobsApi.applicants(jobId as string),
    enabled: enabled && Boolean(jobId),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
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

// ---------------------------------------------------------------------------
// Employer
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
    onSuccess: () => invalidate(queryClient, accountKeys.employer, accountKeys.account, accountKeys.admin, accountKeys.jobs),
  });
}

/** Cancel a pending request, or leave a company. */
export function useCancelMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => employerApi.cancelMembership(companyId),
    onSuccess: () => invalidate(queryClient, accountKeys.employer, accountKeys.account, accountKeys.admin, accountKeys.jobs),
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function useAdminOverview(enabled = true) {
  return useQuery({
    queryKey: accountKeys.adminOverview,
    queryFn: adminApi.overview,
    enabled,
    staleTime: 0,
    retry: retryUnlessClientError,
  });
}

export function useAdminMemberships(status: MembershipStatus, enabled = true) {
  return useQuery({
    queryKey: accountKeys.adminMemberships(status),
    queryFn: () => adminApi.memberships(status),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

export function useDecideMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.decideMembership,
    onSettled: () => invalidate(queryClient, accountKeys.admin, accountKeys.account, accountKeys.employer, accountKeys.jobs),
  });
}

export function useAdminUsers(enabled = true) {
  return useQuery({
    queryKey: accountKeys.adminUsers,
    queryFn: adminApi.users,
    enabled,
    staleTime: 0,
    retry: retryUnlessClientError,
  });
}

// ---------------------------------------------------------------------------
// Sign-in links
// ---------------------------------------------------------------------------

/**
 * A `next` value is only followed when it is a path on this site: it must
 * resolve to our own origin, and never back to the sign-in page itself.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname === '/sign-in') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** The sign-in page, returning to `next` (a path on this site) afterwards. */
export function signInPath(next?: string | null, mode?: 'create'): string {
  const params = new URLSearchParams();
  if (mode) params.set('mode', mode);
  const safe = safeNextPath(next);
  if (safe) params.set('next', safe);
  const text = params.toString();
  return text ? `/sign-in?${text}` : '/sign-in';
}
