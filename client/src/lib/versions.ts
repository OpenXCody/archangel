import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CareerJob, SkillPlace } from './api';
import { ApiError, request, retryUnlessClientError } from './http';
import { accountKeys, invalidate, publicKeys } from './queryKeys';

/**
 * A company's version of a career: how the career is done at that company,
 * as changes against the standard. The standard's skills, without the ones
 * the company leaves out, with the ones it adds; and for a skill that has
 * makes, the makes the company runs.
 *
 * Reads are public. One of the company's own people, or an admin, writes;
 * every save sends whole lists (`added`, `leftOut`, `makes`).
 */

export interface VersionCompany {
  id: string;
  name: string;
  slug: string | null;
  domain: string | null;
}

/** A version as a list names it. */
export interface VersionSummary {
  company: VersionCompany;
  occupation: { id: string; title: string };
  /** "Boeing CNC Operator". */
  title: string;
  /** How many skills it adds to the standard, and how many of the standard's it leaves out. */
  added: number;
  leftOut: number;
  /** The makes it runs, by name, each once. */
  makes: string[];
}

export interface VersionMake {
  id: string;
  name: string;
  /** The company runs it. */
  runs: boolean;
}

/** A skill of a version. Its place can be null only where no taxonomy was loaded, as for any skill. */
export interface VersionSkill extends Omit<SkillPlace, 'level' | 'group' | 'domain'> {
  id: string;
  name: string;
  level: SkillPlace['level'] | null;
  group: SkillPlace['group'] | null;
  domain: SkillPlace['domain'] | null;
  /** How the skill is learned, in the catalogue's sentence. */
  howLearned?: string | null;
  /** What the skill is, in the catalogue's words. */
  description?: string | null;
  /** Not on the standard path: the company adds it. */
  added: boolean;
  /** Every make of the skill, each saying whether the company runs it. */
  makes: VersionMake[];
  /** Where the skill stands among all the version names, kept and left out together, in path order. */
  order: number;
}

/** One version as a path ready to draw. */
export interface Version {
  company: VersionCompany;
  occupation: { id: string; title: string; description: string | null };
  title: string;
  origin: 'member' | 'admin' | 'source';
  updatedAt: string;
  /** The version's path: the standard's skills it keeps and the ones it adds, in path order. */
  skills: VersionSkill[];
  /** The standard's skills it leaves out. */
  leftOut: VersionSkill[];
  /** Open jobs for this career at this company (on a read, not on a save's answer). */
  jobs?: CareerJob[];
}

/** What a save sends: each list whole. One left out stays as it is stored. */
export interface VersionChanges {
  added?: string[];
  leftOut?: string[];
  makes?: string[];
}

const base = (company: string) => `/companies/${encodeURIComponent(company)}/careers`;

export const versionsApi = {
  ofCompany: (company: string) => request<{ company: VersionCompany; versions: VersionSummary[] }>(base(company)).then((r) => r.versions),
  get: (company: string, occupationId: string) => request<Version>(`${base(company)}/${occupationId}`),
  add: (companyId: string, occupationId: string) => request<Version>(base(companyId), { method: 'POST', body: { occupationId } }),
  save: (companyId: string, occupationId: string, changes: VersionChanges) =>
    request<Version>(`${base(companyId)}/${occupationId}`, { method: 'PUT', body: changes }),
  remove: (companyId: string, occupationId: string) => request<{ ok: true; title: string }>(`${base(companyId)}/${occupationId}`, { method: 'DELETE' }),
};

/** The makes a version runs for a skill, by name. */
export const runMakes = (skill: VersionSkill): string[] => skill.makes.filter((make) => make.runs).map((make) => make.name);

/** How a version differs, in a few words: "2 skills added · 1 left out". Empty when it does not. */
export function versionDifference(version: { added: number; leftOut: number }): string {
  return [version.added > 0 ? `${version.added} ${version.added === 1 ? 'skill' : 'skills'} added` : null, version.leftOut > 0 ? `${version.leftOut} left out` : null]
    .filter(Boolean)
    .join(' · ');
}

/** The one grey line under a version in a list: the makes it runs, or else how it differs from the standard. */
export function versionLine(version: VersionSummary, most = 4): string | null {
  if (version.makes.length > 0) {
    const shown = version.makes.length > most + 1 ? version.makes.slice(0, most) : version.makes;
    const more = version.makes.length - shown.length;
    return `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
  }
  return versionDifference(version) || null;
}

/** A company's versions. Always asked afresh: the employer's page lists them right after one is added or deleted. */
export function useCompanyVersions(company: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: publicKeys.companyVersions(company ?? ''),
    queryFn: () => versionsApi.ofCompany(company as string),
    enabled: enabled && Boolean(company),
    staleTime: 30_000,
    retry: retryUnlessClientError,
  });
}

/** One version, by the company's id or slug and the career's id. A company with no version of the career is a 404. */
export function useVersion(company: string | null | undefined, occupationId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: publicKeys.version(company ?? '', occupationId ?? ''),
    queryFn: () => versionsApi.get(company as string, occupationId as string),
    enabled: enabled && Boolean(company) && Boolean(occupationId),
    staleTime: 30_000,
    retry: retryUnlessClientError,
  });
}

/** True for the answer "this company has no version of that career" (or no such company or career). */
export function isNoVersion(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 400);
}

/**
 * A version was added, changed or deleted: the lists that name versions (a
 * company's page, a career's page, the employer's page) and a job's link to
 * its version are stale. The version itself is written into the cache by
 * whoever saved it, so the editor is not read again under the person's hand.
 */
function versionsChanged(queryClient: QueryClient, occupationId: string, keepVersion?: readonly unknown[]): Promise<void> {
  void queryClient.invalidateQueries({
    queryKey: publicKeys.versions,
    predicate: (query) => !keepVersion || JSON.stringify(query.queryKey) !== JSON.stringify(keepVersion),
  });
  // The job form's starting skills are read through a picker's key.
  return invalidate(queryClient, publicKeys.records('companies'), publicKeys.record('occupations', occupationId), accountKeys.jobDetails, publicKeys.pickers);
}

/** Add a company's version of a career, with no changes yet. A 409 means it already has one. */
export function useAddVersion(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (occupationId: string) => versionsApi.add(companyId, occupationId),
    networkMode: 'always',
    onSuccess: (version) => {
      const key = publicKeys.version(companyId, version.occupation.id);
      queryClient.setQueryData(key, version);
      return versionsChanged(queryClient, version.occupation.id, key);
    },
  });
}

/** Save a version's changes. The answer is the version as it now stands. */
export function useSaveVersion(companyId: string, occupationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: VersionChanges) => versionsApi.save(companyId, occupationId, changes),
    networkMode: 'always',
    onSuccess: (version) => {
      const key = publicKeys.version(companyId, occupationId);
      queryClient.setQueryData(key, (current: Version | undefined) => ({ ...version, jobs: current?.jobs }));
      return versionsChanged(queryClient, occupationId, key);
    },
  });
}

export function useDeleteVersion(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (occupationId: string) => versionsApi.remove(companyId, occupationId),
    networkMode: 'always',
    onSuccess: (_gone, occupationId) => {
      queryClient.removeQueries({ queryKey: publicKeys.version(companyId, occupationId) });
      return versionsChanged(queryClient, occupationId);
    },
  });
}
