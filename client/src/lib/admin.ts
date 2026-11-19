import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { InviteRole, MembershipStatus } from './account';
import { queryString, request, retryUnlessClientError } from './http';
import { accountKeys, invalidate } from './queryKeys';

/**
 * Admin Tools' own data: what is waiting, company access, people, invites,
 * password reset links, career paths by state and the company type-ahead.
 * Records (add, correct, merge, delete, history) are in `records.ts`;
 * requests to add a company or plant in `employerCompanies.ts`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/**
 * How complete the plant data is in one state (or with no state): counts of
 * plants. What each one means is written in server/lib/quality.ts and under
 * the table that shows them.
 */
export interface QualityRow {
  /** The two-letter code; null for plants filed under no state. */
  state: string | null;
  plants: number;
  industry: number;
  code: number;
  county: number;
  people: number;
  address: number;
  outsideId: number;
  onePlantCompanies: number;
  duplicates: number;
  duplicateGroups: number;
}

export interface DataQuality {
  /** Every state added up, and how many companies have a plant. */
  total: QualityRow & { companies: number };
  /** Largest first. */
  states: QualityRow[];
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
const ADMIN_USERS_PAGE = 100;

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

const adminApi = {
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
  quality: () => request<DataQuality>('/admin/quality'),
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
// Hooks
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

/** How complete the plant data is, by state. Computed when asked, so it is asked for again each time the table is opened. */
export function useDataQuality() {
  return useQuery({
    queryKey: accountKeys.adminQuality,
    queryFn: adminApi.quality,
    staleTime: 0,
    retry: retryUnlessClientError,
  });
}

/** Company type-ahead for Admin Tools: fresh profile fields, from two letters. */
export function useAdminCompanies(q: string) {
  return useQuery({
    queryKey: accountKeys.adminCompaniesFor(q),
    queryFn: () => adminApi.companies(q),
    enabled: q.length >= 2,
    staleTime: 0,
    retry: retryUnlessClientError,
  });
}
