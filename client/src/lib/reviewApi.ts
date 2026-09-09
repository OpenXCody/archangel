import { API_BASE, adminFetch } from './api';

/** Why a factory is in the queue (set by scripts/enrich-naics.mjs). */
export type ReviewReason = 'no_naics' | 'non_manufacturing' | 'not_in_echo';
export type ReviewResolution = 'keep' | 'quarantine';

export interface ReviewItem {
  factoryId: string;
  reason: ReviewReason;
  naics: string | null;
  naicsAll: string | null;
  sicAll: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolution: ReviewResolution | null;
  name: string;
  state: string | null;
  city: string | null;
  naicsDescription: string | null;
  companyId: string | null;
  companyName: string | null;
  registryId: string | null;
}

export interface ReviewList {
  data: ReviewItem[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface ReviewSummary {
  byReason: { reason: ReviewReason; pending: number; resolved: number }[];
  quarantined: number;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const REASON_LABEL: Record<ReviewReason, string> = {
  no_naics: 'No NAICS at EPA',
  non_manufacturing: 'Non-manufacturing NAICS',
  not_in_echo: 'Not found in ECHO',
};

export const reviewApi = {
  summary: () => adminFetch(`${API_BASE}/review/summary`).then(asJson<ReviewSummary>),
  list: (params: { status?: 'pending' | 'resolved'; reason?: ReviewReason | ''; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.reason) qs.set('reason', params.reason);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    return adminFetch(`${API_BASE}/review?${qs.toString()}`).then(asJson<ReviewList>);
  },
  resolve: (factoryId: string, resolution: ReviewResolution) =>
    adminFetch(`${API_BASE}/review/${factoryId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution }),
    }).then(asJson<{ ok: true; factoryId: string; resolution: ReviewResolution }>),
};

/** EPA's public facility report — the fastest way to eyeball what a site really is. */
export const echoReportUrl = (registryId: string) =>
  `https://echo.epa.gov/detailed-facility-report?fid=${encodeURIComponent(registryId)}`;
