import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request, retryUnlessClientError } from './http';
import { accountKeys, publicKeys } from './queryKeys';

/**
 * A company's mark set by hand. The mark a company is shown with is found
 * from its domain (`CompanyLogo`); an admin can replace it with an image
 * uploaded on the company's record, which the API keeps and serves.
 */

/** A company whose mark was set by hand, and the version its image is served under. */
export interface HandMark {
  id: string;
  name: string;
  domain: string | null;
  version: string;
}

/** The largest image a mark can be, in bytes: the server's limit (server/lib/marks.ts). */
export const MARK_MAX_BYTES = 200 * 1024;

/** Where a mark set by hand is served from. The version makes a replaced mark a new address. */
export function markSource(mark: { id: string; version: string }): string {
  return `/api/companies/${mark.id}/mark?v=${mark.version}`;
}

/**
 * Every mark set by hand: one small list, read once and kept, which is how
 * `CompanyLogo` knows to ask for one. Nothing waits for it: until it arrives
 * a company shows the mark found from its domain.
 */
export function useHandMarks() {
  return useQuery({
    queryKey: publicKeys.marks,
    queryFn: () => request<{ marks: HandMark[] }>('/companies/marks').then((r) => r.marks),
    staleTime: 10 * 60_000,
    retry: retryUnlessClientError,
  });
}

/** Set a company's mark from an image (as a data address), or with null go back to the automatic one. */
export function useSetMark(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (image: string | null): Promise<HandMark | null> =>
      image === null
        ? request(`/companies/${companyId}/mark`, { method: 'DELETE' }).then(() => null)
        : request<HandMark>(`/companies/${companyId}/mark`, { method: 'PUT', body: { image } }),
    onSuccess: (mark) => {
      // The list is corrected here and now, from the answer: this browser shows the new mark without asking again.
      queryClient.setQueryData<HandMark[]>(publicKeys.marks, (marks = []) => [...marks.filter((item) => item.id !== companyId), ...(mark ? [mark] : [])]);
      void queryClient.invalidateQueries({ queryKey: accountKeys.adminAudit });
    },
  });
}
