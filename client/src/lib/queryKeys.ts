import type { QueryClient } from '@tanstack/react-query';
import type { MembershipStatus } from './account';
import type { PeopleRole } from './admin';
import type { EntityType } from './api';
import type { JobFilters } from './jobs';

/**
 * The keys the client's queries are cached under, in one place: every area
 * refreshes some of another's (approving a company's request touches the
 * admin lists, the account, the employer page, jobs and the news dot; an
 * admin's correction to a record touches every list and panel that shows
 * it), so they cannot each live with their own hooks.
 *
 * A key with arguments has a shorter one beside it that it starts with, for
 * refreshing everything under it: `jobs` covers every `job(id)`.
 */

/** What is a person's own, or needs one signed in. */
export const accountKeys = {
  account: ['account'] as const,
  authOptions: ['auth-options'] as const,
  invite: (token: string) => ['invite', token] as const,
  passwordReset: (token: string) => ['password-reset', token] as const,

  me: ['me'] as const,
  news: ['me', 'news'] as const,
  skills: ['me', 'skills'] as const,
  /** Under `skills` on purpose: whatever changes the person's skills refreshes the careers within reach. */
  reach: ['me', 'skills', 'reach'] as const,
  /** Not under `skills`, on purpose: marking a suggestion must not reshuffle the list under the finger. */
  suggestedSkills: ['me', 'suggested-skills'] as const,
  goals: ['me', 'goals'] as const,
  applications: ['me', 'applications'] as const,

  jobs: ['jobs'] as const,
  jobLists: ['jobs', 'list'] as const,
  jobList: (filters: JobFilters) => ['jobs', 'list', filters] as const,
  jobDetails: ['jobs', 'detail'] as const,
  job: (id: string) => ['jobs', 'detail', id] as const,
  jobApplicants: ['jobs', 'applicants'] as const,
  applicants: (jobId: string) => ['jobs', 'applicants', jobId] as const,

  employer: ['employer'] as const,
  companyRequests: ['employer', 'company-requests'] as const,

  admin: ['admin'] as const,
  adminOverview: ['admin', 'overview'] as const,
  adminMemberships: (status: MembershipStatus) => ['admin', 'memberships', status] as const,
  adminUsers: (q: string, role: PeopleRole | '' = '') => ['admin', 'users', q, role] as const,
  adminInvites: ['admin', 'invites'] as const,
  adminPastInvites: ['admin', 'invites', 'past'] as const,
  adminPaths: ['admin', 'paths'] as const,
  adminPathsIn: (status: 'draft' | 'approved') => ['admin', 'paths', status] as const,
  adminCompanies: ['admin', 'companies'] as const,
  adminCompaniesFor: (q: string) => ['admin', 'companies', q] as const,
  adminCompanyRequests: ['admin', 'company-requests'] as const,
  adminRecords: ['admin', 'records'] as const,
  adminRecordSearch: (kind: string, q: string) => ['admin', 'records', 'search', kind, q] as const,
  adminRecordSimilar: (kind: string, params: object) => ['admin', 'records', 'similar', kind, params] as const,
  /** `recordsChanged` in records.ts reads this key's shape: 'one' third, the id fifth. */
  adminRecord: (kind: string, id: string) => ['admin', 'records', 'one', kind, id] as const,
  adminAudit: ['admin', 'audit'] as const,
  adminAuditFor: (filter: object, pages: number) => ['admin', 'audit', filter, pages] as const,
};

/** What anyone can read. */
export const publicKeys = {
  /** Every record of a kind that is cached, under the kind's plural: ['companies']. */
  records: (entity: EntityType) => [entity] as const,
  /** One company, plant, career or skill: its page, the map's panel and a list row's prefetch read it here. */
  record: (entity: EntityType, id: string | null | undefined) => [entity, id] as const,
  counts: ['entity-counts'] as const,

  exploreOverview: ['explore-overview'] as const,
  exploreFacets: ['explore-facets'] as const,
  exploreLists: (entity: EntityType) => [`explore-${entity}`] as const,
  exploreList: (entity: EntityType, params: object) => [`explore-${entity}`, params] as const,
  industries: (state: string | null, area: string | null) => ['industries', state, area] as const,
  industry: (slug: string | undefined, state: string | null, area: string | null) => ['industry', slug, state, area] as const,

  search: ['search'] as const,
  searchFor: (q: string) => ['search', q] as const,
  mapSearch: ['map-search'] as const,
  mapSearchFor: (q: string) => ['map-search', q] as const,
  mapPlaces: (q: string) => ['map-places', q] as const,
  jobPlaces: (q: string) => ['job-places', q] as const,

  /** Type-aheads and the small lookups a form makes: ['picker', what, for]. */
  pickers: ['picker'] as const,
  picker: (what: string, q: string) => ['picker', what, q] as const,

  pins: ['factory-pins'] as const,
  stateCounts: ['state-counts'] as const,
  stateOverviews: ['state-overview'] as const,
  stateOverview: (code: string | null) => ['state-overview', code] as const,
  areaOverviews: ['area-overview'] as const,
  areaOverview: (id: string | null) => ['area-overview', id] as const,
  boundsOverview: (id: string | null) => ['bounds-overview', id] as const,
  /** Static files: the states' outline and the focus areas' boundaries. */
  statesOutline: ['states-geojson'] as const,
  areaBoundaries: ['focus-area-boundaries'] as const,
  areaBoundary: (url: string | undefined) => ['area-boundary', url] as const,
};

/** Mark everything cached under these keys as stale, and refetch what is on screen. */
export function invalidate(queryClient: QueryClient, ...keys: readonly (readonly unknown[])[]): Promise<void> {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))).then(() => undefined);
}
