import { useQuery } from '@tanstack/react-query';
import { API_BASE, adminFetch, type ImportStatus } from './api';

/** Query key for the admin status, shared so a key entered in one place updates every reader. */
export const ADMIN_STATUS_QUERY_KEY = ['import-status'] as const;

/** Asks the server whether this deployment needs an admin key and whether this browser has a valid one. */
export async function fetchAdminStatus(): Promise<ImportStatus> {
  const res = await adminFetch(`${API_BASE}/import/status`);
  if (!res.ok) throw new Error('Could not check admin status');
  return res.json();
}

/** True when this browser may use admin-only UI: no key is required here, or it holds a valid one. */
export function isAdminAuthorized(status: ImportStatus | undefined): boolean {
  return !!status && (!status.authRequired || status.authorized);
}

/**
 * Admin status from GET /api/import/status. One query, shared by
 * AdminKeyGate (which gates the pages) and the nav (which hides the link).
 */
export function useAdminStatus() {
  const query = useQuery({ queryKey: ADMIN_STATUS_QUERY_KEY, queryFn: fetchAdminStatus, staleTime: 60_000 });
  return { ...query, isAdmin: isAdminAuthorized(query.data) };
}
