import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Purpose } from '@shared/purpose';
import { ApiError, request, retryUnlessClientError } from './http';
import { accountKeys } from './queryKeys';

/**
 * Who is signed in: the account, signing in and out, invites and password
 * links, the person's own settings, and the news dot.
 *
 * What a person does once signed in lives beside it: `seeker.ts` (skills,
 * goals, applications), `jobs.ts`, `employer.ts`, `admin.ts`. The
 * transport is `http.ts` and the query keys are `queryKeys.ts`.
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

export type InviteRole = 'user' | 'employer' | 'admin';

export const INVITE_ROLES: InviteRole[] = ['user', 'employer', 'admin'];

/** What an invite grants, in the words used for roles everywhere: "Employer (Tesla)". */
export function inviteRoleLabel(role: InviteRole, companyName?: string | null): string {
  if (role === 'admin') return 'Admin';
  if (role === 'employer') return companyName ? `Employer (${companyName})` : 'Employer';
  return 'User';
}

/** What an invite link says before it is accepted. */
export interface InviteGrant {
  email: string;
  role: InviteRole;
  companyName: string | null;
  /** The admin who made the invite; null when that account is gone. */
  invitedBy?: string | null;
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

const meApi = {
  updateProfile: (patch: { name?: string; homeZip?: string; about?: string; emailNotices?: boolean; purpose?: Purpose }) =>
    request<{ user: AccountUser }>('/me', { method: 'PATCH', body: patch }),
  news: () => request<News>('/me/news'),
  /** The person has opened the page that shows this news. Answers with what is left. */
  seen: (what: Partial<Record<keyof News, true>>) => request<News>('/me/seen', { method: 'POST', body: what }),
  /** Deletes the person's own account, confirmed by their password. */
  deleteAccount: (password: string) => request<{ ok: true }>('/me', { method: 'DELETE', body: { password } }),
};

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hooks
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
