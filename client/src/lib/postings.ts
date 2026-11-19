import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request, retryUnlessClientError } from './http';
import { accountKeys, invalidate } from './queryKeys';
import { recordsChanged } from './records';

/**
 * Employers' job postings in Admin Tools: each employer whose board the
 * intake runner reads, with what its latest run did, and the places their
 * postings name where we list no plant of theirs, which a person decides.
 */

export interface PostingRun {
  id: number;
  startedAt: string;
  /** 'read', 'refused', 'unreachable', 'cut', 'failed' or 'not listed'; null while a run is under way. */
  outcome: string | null;
  why: string | null;
  /** Whether the listing was read to its end; null for a run that listed nothing. */
  complete: boolean | null;
  undone: boolean;
  read: number | null;
  kept: number | null;
  added: number | null;
  changed: number | null;
  closed: number | null;
  waiting: number | null;
  requests: number | null;
}

export interface PostingSource {
  slug: string;
  employer: string;
  company: string | null;
  system: string | null;
  openJobs: number;
  waitingPlaces: number;
  run: PostingRun | null;
}

export interface WaitingPlace {
  source: string;
  placeKey: string;
  employer: string;
  city: string;
  state: string;
  postings: number;
  titles: string[];
  /** The company's plants in that state: what the place may be. */
  plants: { id: string; name: string; city: string | null; company: string }[];
}

export type PlaceDecision = 'point' | 'leave' | 'wait';

export interface PlaceOutcome {
  status: 'pointed' | 'left' | 'waiting';
  /** Jobs made by pointing, or closed by taking it back. */
  jobs: number;
  plant?: { id: string; name: string };
}

const postingsApi = {
  sources: () => request<{ sources: PostingSource[] }>('/admin/postings').then((r) => r.sources),
  places: () => request<{ places: WaitingPlace[]; total: number }>('/admin/postings/places'),
  decide: (body: { source: string; placeKey: string; decision: PlaceDecision; plantId?: string }) =>
    request<PlaceOutcome>('/admin/postings/places', { method: 'POST', body }),
};

export function usePostingSources() {
  return useQuery({ queryKey: accountKeys.adminPostings, queryFn: postingsApi.sources, staleTime: 0, retry: retryUnlessClientError });
}

export function useWaitingPlaces() {
  return useQuery({ queryKey: accountKeys.adminPostingPlaces, queryFn: postingsApi.places, staleTime: 0, refetchOnWindowFocus: true, retry: retryUnlessClientError });
}

export function useDecidePlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postingsApi.decide,
    onSuccess: (outcome) => {
      // Jobs appeared at a plant, or left it: every page that lists open jobs shows it.
      if (outcome.jobs > 0) recordsChanged(queryClient, 'factory');
    },
    onSettled: () => invalidate(queryClient, accountKeys.adminPostings, accountKeys.jobs, accountKeys.adminOverview, accountKeys.adminAudit),
  });
}
