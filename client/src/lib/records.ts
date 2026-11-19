import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { EntityType, SkillLevel, TaxonomyRef } from './api';
import { ApiError, queryString, request, retryUnlessClientError } from './http';
import { accountKeys, publicKeys } from './queryKeys';

/**
 * Keeping records by hand, from Admin Tools: adding, correcting, merging and
 * deleting a company, a factory, a career or a skill, and the history of what
 * admins changed. Each kind is written through its own validated endpoint
 * (see server/lib/records.ts); the server refuses a duplicate with 409 and
 * says which record is already there, and names the field a refusal is about.
 */

export type RecordKind = 'company' | 'factory' | 'career' | 'skill';

export const RECORD_KINDS: { kind: RecordKind; label: string }[] = [
  { kind: 'company', label: 'Company' },
  // On screen a factory is a plant; the kind, the route and the audit line keep `factory`.
  { kind: 'factory', label: 'Plant' },
  { kind: 'career', label: 'Career' },
  { kind: 'skill', label: 'Skill' },
];

/** Each kind as the API and the pages name it. A career is the occupation entity. */
const ENTITY: Record<RecordKind, EntityType> = {
  company: 'companies',
  factory: 'factories',
  career: 'occupations',
  skill: 'skills',
};

/** Where each kind is posted and browsed. */
const PATH: Record<RecordKind, string> = {
  company: `/${ENTITY.company}`,
  factory: `/${ENTITY.factory}`,
  career: `/${ENTITY.career}`,
  skill: `/${ENTITY.skill}`,
};

export type NewRecord =
  | { kind: 'company'; name: string; industry?: string }
  | {
      kind: 'factory';
      companyId: string;
      name: string;
      state: string;
      latitude: number;
      longitude: number;
      city?: string;
      address?: string;
    }
  | { kind: 'career'; title: string; description?: string }
  | { kind: 'skill'; name: string; /** The slug of its skill group, which fixes its domain. */ group: string; level: SkillLevel; description?: string; howLearned?: string; tools?: string[] };

/** A record as the page that links to it needs it. */
export interface RecordLink {
  kind: RecordKind;
  name: string;
  /** The record's own page. */
  href: string;
}

interface SavedRecord {
  id: string;
  name?: string;
  title?: string;
  slug?: string | null;
}

function linkTo(kind: RecordKind, record: SavedRecord): RecordLink {
  const page = kind === 'company' && record.slug ? record.slug : record.id;
  return { kind, name: record.name ?? record.title ?? '', href: `${PATH[kind]}/${page}` };
}

/**
 * The record a refused add would have repeated, when the server named it
 * (409 with `existing`). Null for any other failure.
 */
export function existingRecord(error: unknown, kind: RecordKind): RecordLink | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const existing = (error.payload as { existing?: unknown } | null)?.existing;
  if (!existing || typeof existing !== 'object') return null;
  const { id, name, slug } = existing as { id?: unknown; name?: unknown; slug?: unknown };
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  return linkTo(kind, { id, name, slug: typeof slug === 'string' ? slug : null });
}

/** The field a refused write is about, when the server named one. */
export function refusedField(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const field = (error.payload as { field?: unknown } | null)?.field;
  return typeof field === 'string' ? field : null;
}

/** A record was added, changed, merged or deleted: everything that lists or shows records of its kind is stale. */
function recordsChanged(queryClient: QueryClient, kind: RecordKind, goneId?: string): void {
  const entity = ENTITY[kind];
  const stale: (readonly unknown[])[] = [
    publicKeys.counts,
    publicKeys.exploreOverview,
    publicKeys.exploreFacets,
    publicKeys.exploreLists(entity),
    publicKeys.records(entity),
    publicKeys.pickers,
    publicKeys.search,
    publicKeys.mapSearch,
    accountKeys.adminRecords,
    accountKeys.adminAudit,
    accountKeys.adminOverview,
  ];
  if (kind === 'company') stale.push(accountKeys.adminCompanies, publicKeys.records('factories'), accountKeys.jobs, accountKeys.employer);
  if (kind === 'company' || kind === 'factory') stale.push(publicKeys.pins, publicKeys.stateCounts, publicKeys.stateOverviews, publicKeys.areaOverviews);
  if (kind === 'career') stale.push(accountKeys.adminPaths, accountKeys.me);
  // A skill's name, group or level shows in every path it is on and in the taxonomy.
  if (kind === 'skill') stale.push(publicKeys.records('occupations'), publicKeys.exploreLists('occupations'), publicKeys.taxonomy, accountKeys.me);
  for (const queryKey of stale) {
    // A record that was just deleted or merged away is not asked for again: its editor is about to close.
    void queryClient.invalidateQueries({ queryKey, predicate: (query) => !(goneId && query.queryKey[2] === 'one' && query.queryKey[4] === goneId) });
  }
}

/** Add one record. Lists, counts, pickers and the map's pins are refreshed so it shows where it belongs. */
export function useAddRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, ...body }: NewRecord): Promise<RecordLink> =>
      linkTo(kind, await request<SavedRecord>(PATH[kind], { method: 'POST', body })),
    onSuccess: (_added, { kind }) => recordsChanged(queryClient, kind),
  });
}

// ---------------------------------------------------------------------------
// Correcting, merging and deleting
// ---------------------------------------------------------------------------

/** Where a record is corrected: Admin Tools, Data, with the record in the address. */
export function editPath(kind: RecordKind, id: string): string {
  return `/admin?tab=data&kind=${kind}&id=${id}`;
}

/** A record found by search, or one a name comes close to. */
export interface FoundRecord {
  id: string;
  name: string;
  /** One line that tells it from its neighbours. */
  detail: string | null;
  href: string;
  /** Skills: its level, so the path editor can show a skill it adds where it will sit. */
  level?: SkillLevel | null;
}

/** Counts of what points at a record: what a merge moves and a deletion takes. Zeroes are left out. */
export type Attached = Record<string, number>;

/** One record as its editor reads it. */
export interface RecordView {
  kind: RecordKind;
  id: string;
  name: string;
  /** The record's own page. */
  href: string;
  fields: Record<string, string | boolean | number | null>;
  /** Other names it is known by. */
  aliases: string[];
  attached: Attached;
  /** Factories: the industries a plant can be filed under. */
  industries?: string[];
  /** Careers: the skills on the path, each with its own level and group. */
  path?: PathSkill[];
  /** Skills: the tools, machines or software it is done with. */
  tools?: string[];
}

/**
 * One skill on a career's path, as the path editor reads it. It sits at its
 * own level; a path sets none. (Level and group are null only for a skill no
 * migration has placed: see `SkillPlace` in lib/api.ts.)
 */
export interface PathSkill {
  id: string;
  name: string;
  level: SkillLevel | null;
  group: TaxonomyRef | null;
  domain?: TaxonomyRef | null;
}

export interface MergeResult {
  kept: { id: string; name: string; href: string };
  merged: { id: string; name: string };
  moved: Attached;
}

/** One line of the record of what admins changed. */
export interface AuditEntry {
  id: string;
  at: string;
  actorName: string;
  /** company | factory | career | skill | person | access | invite */
  kind: string;
  recordId: string | null;
  recordName: string;
  action: string;
  detail: Record<string, unknown> | null;
}

export const AUDIT_KINDS: { kind: string; label: string }[] = [
  { kind: 'company', label: 'Companies' },
  { kind: 'factory', label: 'Plants' },
  { kind: 'career', label: 'Careers' },
  { kind: 'skill', label: 'Skills' },
  { kind: 'person', label: 'People' },
  { kind: 'access', label: 'Company access' },
  { kind: 'invite', label: 'Invites' },
];

const HISTORY_PAGE = 30;

const recordsApi = {
  search: (kind: RecordKind, q: string) =>
    request<{ records: FoundRecord[] }>(`/admin/records/${kind}${queryString({ q })}`).then((r) => r.records),
  similar: (kind: RecordKind, params: { name: string; exclude?: string; company?: string; lat?: number; lng?: number }) =>
    request<{ records: FoundRecord[] }>(`/admin/records/${kind}/similar${queryString(params)}`).then((r) => r.records),
  get: (kind: RecordKind, id: string) => request<RecordView>(`/admin/records/${kind}/${id}`),
  change: (kind: RecordKind, id: string, body: Record<string, unknown>) =>
    request<SavedRecord>(`${PATH[kind]}/${id}`, { method: 'PUT', body }),
  remove: (kind: RecordKind, id: string) => request<{ id: string; removed: Attached }>(`${PATH[kind]}/${id}`, { method: 'DELETE' }),
  merge: (kind: RecordKind, id: string, into: string) =>
    request<MergeResult>(`/admin/records/${kind}/${id}/merge`, { method: 'POST', body: { into } }),
  audit: (params: { kind?: string; record?: string; offset?: number; limit?: number }) =>
    request<{ entries: AuditEntry[]; hasMore: boolean }>(`/admin/audit${queryString(params)}`),
  /** Sets a career's skills as a whole, and optionally the state of the path. Each skill sits at its own level. */
  savePath: (occupationId: string, body: { skills: { skillId: string }[]; replace?: boolean; status?: 'draft' | 'approved' }) =>
    request<{ occupationId: string }>(`/occupations/${occupationId}/path`, { method: 'PUT', body }),
};

/** Records of one kind by name, from two letters. */
export function useRecordSearch(kind: RecordKind, q: string) {
  return useQuery({
    queryKey: accountKeys.adminRecordSearch(kind, q),
    queryFn: () => recordsApi.search(kind, q),
    enabled: q.length >= 2,
    staleTime: 0,
    retry: retryUnlessClientError,
  });
}

/** Records a name comes close to. Asked only once there is enough of a name (or, for a factory, a place). */
export function useSimilarRecords(kind: RecordKind, params: { name: string; exclude?: string; company?: string; lat?: number; lng?: number }, enabled = true) {
  const ready = kind === 'factory' ? Boolean((params.company && params.name.length >= 3) || (params.lat !== undefined && params.lng !== undefined)) : params.name.length >= 3;
  return useQuery({
    queryKey: accountKeys.adminRecordSimilar(kind, params),
    queryFn: () => recordsApi.similar(kind, params),
    enabled: enabled && ready,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

/** One record with what hangs from it, for its editor. */
export function useRecord(kind: RecordKind, id: string) {
  return useQuery({
    queryKey: accountKeys.adminRecord(kind, id),
    queryFn: () => recordsApi.get(kind, id),
    staleTime: 0,
    retry: retryUnlessClientError,
  });
}

export function useChangeRecord(kind: RecordKind, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<RecordLink> => linkTo(kind, await recordsApi.change(kind, id, body)),
    onSuccess: () => recordsChanged(queryClient, kind),
  });
}

export function useDeleteRecord(kind: RecordKind, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => recordsApi.remove(kind, id),
    onSuccess: () => recordsChanged(queryClient, kind, id),
  });
}

export function useMergeRecord(kind: RecordKind, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (into: string) => recordsApi.merge(kind, id, into),
    onSuccess: () => recordsChanged(queryClient, kind, id),
  });
}

export function useSavePath(occupationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof recordsApi.savePath>[1]) => recordsApi.savePath(occupationId, body),
    onSuccess: () => recordsChanged(queryClient, 'career'),
  });
}

/** What admins changed, newest first; `kind` narrows it to one kind of record, `record` to one. */
export function useAudit(filter: { kind?: string; record?: string }, pages = 1) {
  return useQuery({
    queryKey: accountKeys.adminAuditFor(filter, pages),
    queryFn: () => recordsApi.audit({ ...filter, limit: HISTORY_PAGE * pages }),
    staleTime: 0,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}
