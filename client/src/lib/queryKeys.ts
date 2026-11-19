import type { QueryClient } from '@tanstack/react-query';
import type { MembershipStatus } from './account';
import type { PeopleRole } from './admin';
import type { JobFilters } from './jobs';

/**
 * The keys the client's queries are cached under, in one place: every area
 * refreshes some of another's (approving a company's request touches the
 * admin lists, the account, the employer page, jobs and the news dot), so
 * they cannot each live with their own hooks.
 */

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

/** Mark everything cached under these keys as stale, and refetch what is on screen. */
export function invalidate(queryClient: QueryClient, ...keys: readonly (readonly unknown[])[]): Promise<void> {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(() => undefined);
}
