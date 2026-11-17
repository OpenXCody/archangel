import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, request } from './account';

/**
 * Adding one record by hand, from Admin Tools: a company, a factory, a career
 * or a skill. Each kind posts to its own validated endpoint (see
 * server/lib/writes.ts); the server refuses a duplicate with 409 and says
 * which record is already there.
 */

export type RecordKind = 'company' | 'factory' | 'career' | 'skill';

export const RECORD_KINDS: { kind: RecordKind; label: string }[] = [
  { kind: 'company', label: 'Company' },
  { kind: 'factory', label: 'Factory' },
  { kind: 'career', label: 'Career' },
  { kind: 'skill', label: 'Skill' },
];

/** Where each kind is posted and browsed. A career is the occupation entity. */
const PATH: Record<RecordKind, string> = {
  company: '/companies',
  factory: '/factories',
  career: '/occupations',
  skill: '/skills',
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
  | { kind: 'skill'; name: string; category?: string; description?: string };

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

/** Add one record. Lists, counts, pickers and the map's pins are refreshed so it shows where it belongs. */
export function useAddRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, ...body }: NewRecord): Promise<RecordLink> =>
      linkTo(kind, await request<SavedRecord>(PATH[kind], { method: 'POST', body })),
    onSuccess: (_added, { kind }) => {
      const stale: (readonly unknown[])[] = [
        ['entity-counts'],
        ['explore-overview'],
        ['explore-facets'],
        [`explore-${PATH[kind].slice(1)}`],
        ['picker'],
        ['search'],
        ['map-search'],
      ];
      if (kind === 'company') stale.push(['admin', 'companies']);
      if (kind === 'factory') stale.push(['factory-pins'], ['state-counts'], ['state-overview'], ['area-overview']);
      for (const queryKey of stale) void queryClient.invalidateQueries({ queryKey });
    },
  });
}
