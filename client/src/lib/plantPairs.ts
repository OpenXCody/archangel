import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryString, request, retryUnlessClientError } from './http';
import { accountKeys, invalidate } from './queryKeys';
import { recordsChanged, type FoundRecord, type MergeResult } from './records';

/**
 * Two rows that may be one plant, in Admin Tools: the pairs that wait for a
 * person (rows that carry one outside id, rows of one company on one spot),
 * two plants side by side for the merge on a plant's record, merging them
 * and keeping them apart. The server decides which row the rule would keep
 * and what it would take (server/lib/plantPairs.ts).
 */

export interface PlantSide {
  id: string;
  name: string;
  company: string | null;
  companyId: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  industry: string | null;
  people: number | null;
  products: string | null;
  openedYear: number | null;
  /** Written from sources, by a research file or an admin. */
  curated: boolean;
  jobs: number;
  /** The outside ids it carries, as "EPA_ECHO 110000308131". */
  ids: string[];
  /** The facts it would take from the other row if it were the one kept. */
  takes: string[];
}

export interface PlantPair {
  a: PlantSide;
  b: PlantSide;
  /** The row the rule would keep. */
  keep: string;
  metres: number | null;
  by: 'id' | 'spot' | null;
  /** The outside id both carry. */
  shared: string | null;
  /** Why the cleanup left it for a person, in its own word. */
  reason: string | null;
  apart: boolean;
}

export type PairList = 'id' | 'spot';

/** How many pairs a list shows at a time. */
export const PAIRS_PAGE = 10;

interface PairPage {
  pairs: PlantPair[];
  total: number;
}

const pairsApi = {
  list: (list: PairList, state: string | null, offset: number, limit = PAIRS_PAGE) =>
    request<PairPage>(`/admin/plants/pairs${queryString({ list, state: state ?? undefined, limit, offset: offset || undefined })}`),
  pair: (a: string, b: string) => request<PlantPair>(`/admin/plants/pair${queryString({ a, b })}`),
  near: (id: string, q: string) => request<{ plants: FoundRecord[] }>(`/admin/plants/${id}/near${queryString({ q: q || undefined })}`).then((r) => r.plants),
  apart: (body: { a: string; b: string; apart: boolean }) => request<{ apart: boolean }>('/admin/plants/apart', { method: 'POST', body }),
  merge: ({ from, into }: { from: string; into: string }) =>
    request<MergeResult>(`/admin/records/factory/${from}/merge`, { method: 'POST', body: { into } }),
};

/** One page of a list of pairs, and how many wait in all. Deciding one brings the next into view. */
export function usePairList(list: PairList, state: string | null, offset: number, limit = PAIRS_PAGE) {
  return useQuery({
    queryKey: [...accountKeys.adminPlantPairList(list, state, offset), limit],
    queryFn: () => pairsApi.list(list, state, offset, limit),
    staleTime: 0,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

/** Two plants side by side. */
export function usePlantPair(a: string, b: string | null) {
  return useQuery({
    queryKey: accountKeys.adminPlantPair(a, b ?? ''),
    queryFn: () => pairsApi.pair(a, b as string),
    enabled: Boolean(b),
    staleTime: 0,
    retry: retryUnlessClientError,
  });
}

/** The plants one could be merged with: its company's and the ones near it. With no term, the likeliest first. */
export function usePlantsNear(id: string, q: string, enabled = true) {
  return useQuery({
    queryKey: accountKeys.adminPlantsNear(id, q),
    queryFn: () => pairsApi.near(id, q),
    enabled,
    staleTime: 0,
    retry: retryUnlessClientError,
  });
}

/** Merge one plant into another. Everything that lists or shows plants is refreshed. */
export function useMergePlants() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pairsApi.merge,
    onSuccess: (_merged, { from }) => {
      recordsChanged(queryClient, 'factory', from);
      invalidate(queryClient, accountKeys.adminPlantPairs, accountKeys.adminQuality);
    },
  });
}

/** Say two rows are two plants, or take that back. */
export function useKeepApart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pairsApi.apart,
    onSettled: () => invalidate(queryClient, accountKeys.adminPlantPairs, accountKeys.adminQuality, accountKeys.adminAudit),
  });
}
