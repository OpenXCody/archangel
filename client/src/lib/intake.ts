import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request, retryUnlessClientError } from './http';
import { accountKeys, invalidate } from './queryKeys';
import { recordsChanged } from './records';

/**
 * Intake in Admin Tools: the sources that come in through the runner
 * (scripts/ingest/run.mjs) with what their runs did, and the matches a run
 * was not sure of, which a person decides.
 */

export interface IntakeRun {
  id: number;
  /** 'staging' | 'staged' | 'resolved' | 'applying' | 'applied' | 'undone' | 'failed' */
  state: string;
  startedAt: string;
  endedAt: string | null;
  input: string | null;
  /** Null until the run reaches the stage that counts it. */
  matched: number | null;
  added: number | null;
  changed: number | null;
  queued: number | null;
}

export interface IntakeSource {
  slug: string;
  name: string;
  publisher: string | null;
  url: string | null;
  terms: string | null;
  howFetched: string | null;
  unmatched: 'hold' | 'add';
  fill: 'empty' | 'ranked';
  staged: number;
  waiting: number;
  runs: IntakeRun[];
}

/** A factory as a source's record gives it, or as we have it. */
export interface ReviewPlant {
  name: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  industry: string | null;
  people: number | null;
}

export interface ReviewCandidate extends ReviewPlant {
  id: string;
  rule: string;
  metres: number | null;
}

export interface ReviewItem {
  id: number;
  source: string;
  sourceName: string;
  sourceId: string;
  sourceUrl: string | null;
  reason: string;
  ifDifferent: 'hold' | 'add';
  record: ReviewPlant;
  candidates: ReviewCandidate[];
  createdAt: string;
  skipped: boolean;
}

export type ReviewDecision = 'same' | 'different' | 'skip';

export interface ReviewOutcome {
  status: 'same' | 'different' | 'waiting';
  plant: { id: string; name: string } | null;
  filled: string[];
  added: boolean;
}

/** How many matches the queue shows at a time. */
export const REVIEW_PAGE = 10;

const intakeApi = {
  sources: () => request<{ sources: IntakeSource[] }>('/admin/intake/sources').then((r) => r.sources),
  review: () => request<{ items: ReviewItem[]; total: number }>(`/admin/intake/review?limit=${REVIEW_PAGE}`),
  decide: ({ id, decision, plantId }: { id: number; decision: ReviewDecision; plantId?: string }) =>
    request<ReviewOutcome>(`/admin/intake/review/${id}`, { method: 'POST', body: { decision, plantId } }),
};

export function useIntakeSources() {
  return useQuery({ queryKey: accountKeys.adminIntakeSources, queryFn: intakeApi.sources, staleTime: 0, retry: retryUnlessClientError });
}

/** The first matches waiting, and how many wait in all. Deciding one brings the next into view. */
export function useReviewQueue() {
  return useQuery({
    queryKey: accountKeys.adminIntakeReview,
    queryFn: intakeApi.review,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: retryUnlessClientError,
  });
}

export function useDecideReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: intakeApi.decide,
    onSuccess: (outcome) => {
      // A factory that took a source's facts, or was added, shows them wherever it is shown.
      if (outcome.plant) recordsChanged(queryClient, 'factory');
    },
    onSettled: () => invalidate(queryClient, accountKeys.adminIntakeReview, accountKeys.adminIntakeSources, accountKeys.adminOverview, accountKeys.adminAudit),
  });
}

/** A distance as it is said: "40 m", "1.2 km". */
export function distance(metres: number): string {
  return metres < 1000 ? `${metres.toLocaleString('en-US')} m` : `${(Math.round(metres / 100) / 10).toLocaleString('en-US')} km`;
}
