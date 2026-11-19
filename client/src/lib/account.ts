import { useEffect } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Purpose } from '@shared/purpose';
import { ApiError, queryString, request, retryUnlessClientError } from './http';

/**
 * Accounts, jobs, applications, the employer area and the admin area.
 *
 * The session is an HttpOnly cookie set by the API, so every call here is a
 * plain same-origin fetch: no token is read or stored in the client.
 * Errors arrive as `{ error: string }` written for the person using the app;
 * `ApiError.message` carries that text and is safe to show as is.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What an account is for: finding work, or hiring. It decides which tools are drawn, never what is allowed. */
export type { Purpose };

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  homeZip: string | null;
  about: string | null;
  /** Whether the person takes emails about applications and company access. */
  emailNotices: boolean;
  /** What the account is for: set at sign-up or in settings, else read from the person's ties to a company. */
  purpose: Purpose;
}

/** `declined`: an admin refused the request. The record stays, and the person can ask again after a week. */
export type MembershipStatus = 'requested' | 'active' | 'declined';

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
  /** Set in this browser only: when the person signed out, or deleted their account, here (ms since the epoch). */
  leftAt?: number;
  /** The person asked for a company or a plant to be added and an admin has not answered yet. */
  hasCompanyRequest?: boolean;
}

export interface SignedInAccount extends Account {
  user: AccountUser;
}

/**
 * What this account is, in the order that matters: "Admin", "Employer (Tesla)".
 * Nothing when it is neither: a plain account needs no label. Roles are
 * relationships, so one account can hold more than one.
 */
export function accountRoles(account: Account): string[] {
  if (!account.user) return [];
  const roles: string[] = [];
  if (account.user.isAdmin) roles.push('Admin');
  const active = account.memberships.filter((m) => m.status === 'active');
  if (active.length === 1) roles.push(`Employer (${active[0].companyName})`);
  else if (active.length > 1) roles.push(`Employer (${active.length} companies)`);
  else if (account.memberships.some((m) => m.status === 'requested')) roles.push('Waiting for approval');
  return roles;
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

/** One step in an application's history: the stage it reached, and when. */
export interface ApplicationEvent {
  status: ApplicationStatus;
  at: string;
}

export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  note: string | null;
  createdAt: string;
  statusChangedAt: string;
  /** The company moved it since the person last opened their page. */
  changed: boolean;
  /** Its history, oldest first. */
  events: ApplicationEvent[];
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
  applicants: number;
  newApplicants: number;
}

export interface EmployerCompany extends Membership {
  /** When an admin approved or declined the request. */
  decidedAt: string | null;
  /** For a declined request: when the person can ask again. */
  askAgainAt: string | null;
  factories: EmployerFactory[];
  jobs: EmployerJob[];
}

export interface AdminOverview {
  users: number;
  pendingMemberships: number;
  openJobs: number;
  applications: number;
  /** Career paths not yet reviewed. */
  draftPaths: number;
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
  /** When it was approved or declined. */
  decidedAt: string | null;
  /** The company's web domain, when it has one on record. */
  companyDomain: string | null;
  /** The part of the person's address after the @. */
  emailDomain: string;
  /** Whether the person's address is at the company's domain. Null when the company has none on record. */
  domainMatches: boolean | null;
  /** How many people already have access to the company. */
  activeMembers: number;
  /** When the person's account was made. */
  userCreatedAt: string;
  /** Other companies the person already has access to. */
  otherCompanies: string[];
}

export interface AdminUserMembership {
  companyId: string;
  companyName: string;
  status: MembershipStatus;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  memberships: AdminUserMembership[];
  /** What deleting the account takes with it. */
  applications: number;
  jobsPosted: number;
  /** Sessions that can still be used. */
  sessions: number;
  /** The admin who has had the role longest: another admin cannot remove the role or the account. */
  isFirstAdmin: boolean;
}

/** The roles the People list can be narrowed to. `waiting`: a request to join a company not yet decided. */
export type PeopleRole = 'admin' | 'employer' | 'waiting' | 'user';

/** One page of people, newest first. */
export interface AdminUsersPage {
  users: AdminUser[];
  /** Everyone matching the search, not only this page. */
  total: number;
  hasMore: boolean;
}

/** How many people one page of the People list holds. */
export const ADMIN_USERS_PAGE = 100;

/** A person's roles as the People list shows them: "Admin", "Employer (Tesla, Samsung)". None for a plain account: it has no role label. */
export function personRoles(person: AdminUser): string[] {
  const roles: string[] = [];
  if (person.isAdmin) roles.push('Admin');
  const active = person.memberships.filter((m) => m.status === 'active');
  if (active.length > 0) roles.push(`Employer (${active.map((m) => m.companyName).join(', ')})`);
  const waiting = person.memberships.filter((m) => m.status === 'requested');
  if (waiting.length > 0) roles.push(`Waiting for approval (${waiting.map((m) => m.companyName).join(', ')})`);
  return roles;
}

/**
 * `decline` refuses a request and keeps the record; `reopen` takes an approval or a
 * decline back, so the request waits again; `remove` deletes the row, whatever its state.
 */
export type MembershipDecision = 'approve' | 'decline' | 'reopen' | 'remove';

export type InviteRole = 'user' | 'employer' | 'admin';

export const INVITE_ROLES: InviteRole[] = ['user', 'employer', 'admin'];

/** What an invite grants, in the words used for roles everywhere: "Employer (Tesla)". */
export function inviteRoleLabel(role: InviteRole, companyName?: string | null): string {
  if (role === 'admin') return 'Admin';
  if (role === 'employer') return companyName ? `Employer (${companyName})` : 'Employer';
  return 'User';
}

/** An invite that can still be used. */
export interface Invite {
  id: string;
  email: string;
  role: InviteRole;
  companyId: string | null;
  companyName: string | null;
  createdAt: string;
  expiresAt: string;
  /** Who made it; null when that account is gone. */
  invitedBy?: string | null;
  acceptedAt?: string | null;
}

/** An invite that can no longer be used: accepted, or run out. */
export interface PastInvite extends Invite {
  state: 'accepted' | 'expired';
}

/** A new invite with its link. The token exists in this response only. */
export interface CreatedInvite {
  invite: Invite;
  token: string;
  /** The path of the sign-up link: `/sign-in?invite=<token>`. */
  path: string;
  /** The link was also emailed to the invited address. */
  emailed: boolean;
  /** An earlier invite for the address was still open: its link no longer works. */
  replaced?: boolean;
}

/** What an invite link says before it is accepted. */
export interface InviteGrant {
  email: string;
  role: InviteRole;
  companyName: string | null;
  /** The admin who made the invite; null when that account is gone. */
  invitedBy?: string | null;
}

/** How long a password reset link works. The server sets the real expiry; this is for the copy beside the link. */
export const RESET_HOURS = 24;

/** A new password reset link. The token exists in this response only. */
export interface CreatedResetLink {
  /** The path of the link: `/sign-in?reset=<token>`. */
  link: string;
  expiresAt: string;
  /** The link was also emailed to the person. */
  emailed: boolean;
}

/** What the sign-in pages can offer. `email`: the app can send mail. */
export interface AuthOptions {
  email: boolean;
}

/** Whether there is something the person has not seen. Never a count. */
export interface News {
  /** The company moved one of their applications. */
  applications: boolean;
  /** Someone applied to a job they manage. */
  applicants: boolean;
  /** For an admin: a request to join a company is waiting. */
  access: boolean;
}

/** Whose password a reset link sets. */
export interface ResetGrant {
  email: string;
}

/** A career whose path is waiting for review. */
export interface DraftPath {
  id: string;
  title: string;
  pathStatus: 'draft' | 'approved';
  skillCount: number;
}

/** A company as Admin Tools reads and edits it. */
export interface AdminCompany {
  id: string;
  name: string;
  slug: string | null;
  /** Website domain; the logo is looked up from it. */
  domain: string | null;
  featured: boolean;
  industry: string | null;
  /** One line on what the company makes. */
  description: string | null;
  /** How many factories it has, where a search result carries it. */
  factoryCount?: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const authApi = {
  me: () => request<Account>('/auth/me'),
  /** `invite` is the token from an invite link; the email must be the invited one. */
  signUp: (input: { email: string; password: string; name: string; invite?: string; purpose?: Purpose }) =>
    request<Account>('/auth/sign-up', { method: 'POST', body: input }),
  signIn: (input: { email: string; password: string }) =>
    request<Account>('/auth/sign-in', { method: 'POST', body: input }),
  signOut: () => request<{ ok: true }>('/auth/sign-out', { method: 'POST' }),
  /** What an invite link grants. Fails with 404 when the link is unknown, used or expired. */
  invite: (token: string) => request<InviteGrant>(`/auth/invite/${encodeURIComponent(token)}`),
  /** Ends the person's other sessions; this one carries on. */
  changePassword: (input: { current: string; next: string }) =>
    request<{ ok: true }>('/auth/password', { method: 'POST', body: input }),
  /** Whose password a reset link sets. Fails with 404 when the link is unknown, used or expired. */
  reset: (token: string) => request<ResetGrant>(`/auth/reset/${encodeURIComponent(token)}`),
  /** Sets the password through a reset link and signs the person in. */
  resetPassword: (input: { token: string; password: string }) =>
    request<Account>('/auth/reset', { method: 'POST', body: input }),
  options: () => request<AuthOptions>('/auth/options'),
  /** Emails a reset link to the address if it has an account. The answer is the same either way. */
  forgotPassword: (email: string) => request<{ ok: true }>('/auth/forgot', { method: 'POST', body: { email } }),
  /** Changes the address the person signs in with, confirmed by their password. Ends their other sessions. */
  changeEmail: (input: { email: string; password: string }) =>
    request<Account>('/auth/email', { method: 'POST', body: input }),
};

export const meApi = {
  updateProfile: (patch: { name?: string; homeZip?: string; about?: string; emailNotices?: boolean; purpose?: Purpose }) =>
    request<{ user: AccountUser }>('/me', { method: 'PATCH', body: patch }),
  news: () => request<News>('/me/news'),
  /** The person has opened the page that shows this news. Answers with what is left. */
  seen: (what: Partial<Record<keyof News, true>>) => request<News>('/me/seen', { method: 'POST', body: what }),
  skills: () => request<{ skills: MySkill[] }>('/me/skills').then((r) => r.skills),
  setSkill: (skillId: string, status: SkillStatus) =>
    request<{ skillId: string; status: SkillStatus }>(`/me/skills/${skillId}`, { method: 'PUT', body: { status } }),
  removeSkill: (skillId: string) => request<{ ok: true }>(`/me/skills/${skillId}`, { method: 'DELETE' }),
  goals: () => request<{ goals: MyGoal[] }>('/me/goals').then((r) => r.goals),
  addGoal: (occupationId: string) =>
    request<{ occupationId: string }>(`/me/goals/${occupationId}`, { method: 'PUT' }),
  removeGoal: (occupationId: string) => request<{ ok: true }>(`/me/goals/${occupationId}`, { method: 'DELETE' }),
  applications: () => request<{ applications: MyApplication[] }>('/me/applications').then((r) => r.applications),
  /** Deletes the person's own account, confirmed by their password. */
  deleteAccount: (password: string) => request<{ ok: true }>('/me', { method: 'DELETE', body: { password } }),
};

export const jobsApi = {
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
  addMembership: (input: { companyId: string; userId: string }) =>
    request<{ status: MembershipStatus }>('/admin/memberships', { method: 'POST', body: input }),
  users: (params: { q?: string; role?: PeopleRole; offset?: number; limit?: number }) =>
    request<AdminUsersPage>(`/admin/users${queryString(params)}`),
  /** Correct a person's name or email address. */
  correctUser: (userId: string, patch: { name?: string; email?: string }) =>
    request<{ id: string; name: string; email: string; isAdmin: boolean }>(`/admin/users/${userId}`, { method: 'PATCH', body: patch }),
  /** End a person's sessions; for the admin's own account, every session but this one. */
  signOutUser: (userId: string) => request<{ ended: number }>(`/admin/users/${userId}/sign-out`, { method: 'POST' }),
  pastInvites: () => request<{ invites: PastInvite[] }>('/admin/invites/past').then((r) => r.invites),
  paths: (status: 'draft' | 'approved') => request<{ paths: DraftPath[] }>(`/admin/paths?status=${status}`).then((r) => r.paths),
  setAdmin: (userId: string, isAdmin: boolean) =>
    request<{ id: string; isAdmin: boolean }>(`/admin/users/${userId}`, { method: 'PATCH', body: { isAdmin } }),
  deleteUser: (userId: string) => request<{ ok: true }>(`/admin/users/${userId}`, { method: 'DELETE' }),
  /** A new link replaces the person's unused one. */
  createResetLink: (userId: string) =>
    request<CreatedResetLink>(`/admin/users/${userId}/reset-link`, { method: 'POST' }),
  invites: () => request<{ invites: Invite[]; accepted: number }>('/admin/invites'),
  createInvite: (input: { email: string; role: InviteRole; companyId?: string }) =>
    request<CreatedInvite>('/admin/invites', { method: 'POST', body: input }),
  revokeInvite: (inviteId: string) => request<{ ok: true }>(`/admin/invites/${inviteId}`, { method: 'DELETE' }),
  companies: (q: string) =>
    request<{ companies: AdminCompany[] }>(`/admin/companies${queryString({ q })}`).then((r) => r.companies),
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
  news: ['me', 'news'] as const,
  authOptions: ['auth-options'] as const,
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
  adminUsers: (q: string, role: PeopleRole | '' = '') => ['admin', 'users', q, role] as const,
  adminInvites: ['admin', 'invites'] as const,
  adminPastInvites: ['admin', 'invites', 'past'] as const,
  adminPathsIn: (status: 'draft' | 'approved') => ['admin', 'paths', status] as const,
  adminCompanies: (q: string) => ['admin', 'companies', q] as const,
  invite: (token: string) => ['invite', token] as const,
  passwordReset: (token: string) => ['password-reset', token] as const,
};

const SIGNED_OUT: Account = { user: null, memberships: [], isEmployer: false };

/** Written when someone signs in or out, so the browser's other tabs check who is signed in. */
const IDENTITY_SIGNAL = 'archangel.identity';

/**
 * True for a moment after the person signs out (or deletes their account) in
 * this browser. A page that needs an account then sends them on to the map
 * rather than to the sign-in form, which would read as "sign in again".
 */
export function justLeft(account: Account): boolean {
  return account.user === null && account.leftAt !== undefined && Date.now() - account.leftAt < 5000;
}

/**
 * A different person (or nobody) is now signed in: store who, drop everything
 * cached for the previous person, and refresh what is public but personalised.
 */
function identityChanged(queryClient: QueryClient, account: Account): void {
  queryClient.setQueryData(accountKeys.account, account);
  // Tell this browser's other tabs (see useSessionExpiryWatch). The value only has to change.
  try {
    window.localStorage.setItem(IDENTITY_SIGNAL, String(Date.now()));
  } catch {
    // Storage is unavailable: the other tabs find out when they next ask.
  }
  queryClient.removeQueries({ queryKey: accountKeys.me });
  queryClient.removeQueries({ queryKey: accountKeys.employer });
  queryClient.removeQueries({ queryKey: accountKeys.admin });
  void queryClient.invalidateQueries({ queryKey: accountKeys.jobs });
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
    // Signed in or out in another tab of this browser: this tab asks who is signed in now.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== IDENTITY_SIGNAL) return;
      void queryClient.invalidateQueries({ queryKey: accountKeys.account });
      // A job page says whether its reader manages it: that may no longer hold.
      void queryClient.invalidateQueries({ queryKey: accountKeys.jobDetails });
    };
    window.addEventListener('storage', onStorage);
    return () => {
      offQueries();
      offMutations();
      window.removeEventListener('storage', onStorage);
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
    // Marked, so a page that needs an account sends the person on, not to the sign-in form.
    onSuccess: () => identityChanged(queryClient, { ...SIGNED_OUT, leftAt: Date.now() }),
  });
}

/**
 * What an invite link grants, asked once. An invite stops answering the
 * moment it is accepted, so the answer is never refreshed: the page that
 * accepted it still needs to know where to send the person.
 */
export function useInvite(token: string | null) {
  return useQuery({
    queryKey: accountKeys.invite(token ?? ''),
    queryFn: () => authApi.invite(token as string),
    enabled: Boolean(token),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: retryUnlessClientError,
  });
}

/**
 * Whose password a reset link sets, asked once. Like an invite, the link
 * stops answering the moment it is used, so the answer is never refreshed.
 */
export function usePasswordReset(token: string | null) {
  return useQuery({
    queryKey: accountKeys.passwordReset(token ?? ''),
    queryFn: () => authApi.reset(token as string),
    enabled: Boolean(token),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: retryUnlessClientError,
  });
}

/** Choose a new password through a reset link. The person is signed in by it. */
export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: (account) => identityChanged(queryClient, account),
  });
}

/** Change the signed-in person's own password. */
export function useChangePassword() {
  return useMutation({ mutationFn: authApi.changePassword });
}

/** Change the address the signed-in person signs in with. The answer is the account as it now is. */
export function useChangeEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.changeEmail,
    onSuccess: (account) => queryClient.setQueryData(accountKeys.account, account),
  });
}

/** Delete the signed-in person's own account. Afterwards nobody is signed in here. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => meApi.deleteAccount(password),
    onSuccess: () => identityChanged(queryClient, { ...SIGNED_OUT, leftAt: Date.now() }),
  });
}

/** Whether the app can send mail. It changes only with the deployment, so it is asked rarely. */
export function useAuthOptions() {
  return useQuery({
    queryKey: accountKeys.authOptions,
    queryFn: authApi.options,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: retryUnlessClientError,
  });
}

/** True only once the server has said mail is on: until then, and on failure, the app behaves as it did without email. */
export function useEmailOn(): boolean {
  return useAuthOptions().data?.email === true;
}

/** Ask for a reset link by email. */
export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => authApi.forgotPassword(email) });
}

/**
 * Whether there is something the signed-in person has not seen. Fetched with
 * the account: when the app opens, and when its tab comes back into view.
 */
export function useNews() {
  const account = useAccount();
  return useQuery({
    queryKey: accountKeys.news,
    queryFn: meApi.news,
    enabled: Boolean(account.data?.user),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

/** The person has opened the page that shows some news: it is no longer news. */
export function useMarkSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: meApi.seen,
    onSuccess: (news) => queryClient.setQueryData(accountKeys.news, news),
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

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function useAdminOverview(enabled = true) {
  return useQuery({
    queryKey: accountKeys.adminOverview,
    queryFn: adminApi.overview,
    enabled,
    staleTime: 0,
    // What is waiting changes while the page is open in another tab.
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

/**
 * Company memberships in one state. Read again whenever the tab comes back
 * into view; `everyMs` also reads it on a timer while the list is on screen,
 * so a request that arrives while the page is open shows up.
 */
export function useAdminMemberships(status: MembershipStatus, { enabled = true, everyMs }: { enabled?: boolean; everyMs?: number } = {}) {
  return useQuery({
    queryKey: accountKeys.adminMemberships(status),
    queryFn: () => adminApi.memberships(status),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: everyMs,
    retry: retryUnlessClientError,
  });
}

export function useDecideMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.decideMembership,
    onSettled: () =>
      invalidate(queryClient, accountKeys.admin, accountKeys.account, accountKeys.employer, accountKeys.jobs, accountKeys.news),
  });
}

/** People matching `q` (name, email or company) in `role`, newest first, a page at a time. */
export function useAdminUsers(q: string, role: PeopleRole | '' = '') {
  return useInfiniteQuery({
    queryKey: accountKeys.adminUsers(q, role),
    queryFn: ({ pageParam }) => adminApi.users({ q, role: role || undefined, offset: pageParam, limit: ADMIN_USERS_PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.reduce((count, page) => count + page.users.length, 0) : undefined,
    staleTime: 0,
    // Keep the list on screen while the next search loads.
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

/** A change to a person: their row, and whatever they see of themselves if it is this account. */
function personChanged(queryClient: QueryClient): Promise<void> {
  return invalidate(queryClient, accountKeys.admin, accountKeys.account, accountKeys.employer, accountKeys.jobs);
}

/** Give or take the admin role. */
export function useSetAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => adminApi.setAdmin(userId, isAdmin),
    onSettled: () => personChanged(queryClient),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId),
    onSettled: () => personChanged(queryClient),
  });
}

/** A password reset link for a person. Nothing shown elsewhere changes, so nothing is refreshed. */
export function useCreateResetLink() {
  return useMutation({ mutationFn: (userId: string) => adminApi.createResetLink(userId) });
}

/** Correct a person's name or email address. */
export function useCorrectUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, patch }: { userId: string; patch: { name?: string; email?: string } }) => adminApi.correctUser(userId, patch),
    onSuccess: () => personChanged(queryClient),
  });
}

/** End a person's sessions. */
export function useSignOutUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => adminApi.signOutUser(userId),
    onSuccess: () => invalidate(queryClient, accountKeys.admin),
  });
}

/** Add a person to a company, active at once. */
export function useAddMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.addMembership,
    onSettled: () => personChanged(queryClient),
  });
}

export function useAdminInvites() {
  return useQuery({
    queryKey: accountKeys.adminInvites,
    queryFn: adminApi.invites,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

/** Invites that were accepted or ran out, newest first. */
export function useAdminPastInvites() {
  return useQuery({
    queryKey: accountKeys.adminPastInvites,
    queryFn: adminApi.pastInvites,
    staleTime: 0,
    retry: retryUnlessClientError,
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.createInvite,
    onSettled: () => invalidate(queryClient, accountKeys.adminInvites),
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => adminApi.revokeInvite(inviteId),
    onSettled: () => invalidate(queryClient, accountKeys.adminInvites),
  });
}

/** Careers whose path is in one state: drafts to review, or the ones approved. */
export function useAdminPaths(status: 'draft' | 'approved', enabled = true) {
  return useQuery({
    queryKey: accountKeys.adminPathsIn(status),
    queryFn: () => adminApi.paths(status),
    enabled,
    staleTime: 0,
    retry: retryUnlessClientError,
  });
}

/** Company type-ahead for Admin Tools: fresh profile fields, from two letters. */
export function useAdminCompanies(q: string) {
  return useQuery({
    queryKey: accountKeys.adminCompanies(q),
    queryFn: () => adminApi.companies(q),
    enabled: q.length >= 2,
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
