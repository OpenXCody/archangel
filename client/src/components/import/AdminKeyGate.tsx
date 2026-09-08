import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LockOpen, LogOut } from 'lucide-react';
import { API_BASE, adminFetch, getAdminSecret, setAdminSecret, clearAdminSecret, type ImportStatus } from '../../lib/api';

async function fetchStatus(): Promise<ImportStatus> {
  const res = await adminFetch(`${API_BASE}/import/status`);
  if (!res.ok) throw new Error('Could not check admin status');
  return res.json();
}

/**
 * Wraps admin-only UI. When the deployment requires an admin key and this
 * browser doesn't have a valid one, shows a single field to enter it. In
 * local dev with no ADMIN_SECRET configured, renders children directly.
 */
export default function AdminKeyGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['import-status'], queryFn: fetchStatus, staleTime: 60_000 });
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['import-status'] });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const key = draft.trim();
    if (!key) return;
    setSubmitting(true);
    setFeedback(null);
    setAdminSecret(key);
    try {
      const status = await fetchStatus();
      if (status.authorized) {
        setDraft('');
        await invalidate();
      } else {
        clearAdminSecret();
        setFeedback('That key was not accepted.');
      }
    } catch {
      clearAdminSecret();
      setFeedback('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = () => {
    clearAdminSecret();
    invalidate();
  };

  if (isLoading) return null;

  if (isError) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-lg border border-border-subtle bg-bg-surface p-4 text-sm text-fg-muted">
        Could not reach the API to check admin access.
      </div>
    );
  }

  if (data && data.authRequired && !data.authorized) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-border-subtle bg-bg-surface p-6 px-4 sm:px-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated">
            <KeyRound className="h-5 w-5 text-fg-muted" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-fg-default">Admin key required</h2>
            <p className="text-sm text-fg-muted">Data changes on this deployment need the admin key. It stays in this browser.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Admin key"
            aria-label="Admin key"
            className="flex-1 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-fg-default placeholder:text-fg-soft focus:border-border-strong"
          />
          <button
            type="submit"
            disabled={submitting || !draft.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            <LockOpen className="h-4 w-4" />
            Unlock
          </button>
        </form>
        {feedback && <p className="mt-3 text-sm text-red-400">{feedback}</p>}
      </div>
    );
  }

  return (
    <>
      {data?.authRequired && getAdminSecret() && (
        <div className="mb-4 flex items-center justify-end">
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 text-xs text-fg-soft hover:text-fg-default"
          >
            <LogOut className="h-3.5 w-3.5" />
            Forget admin key
          </button>
        </div>
      )}
      {children}
    </>
  );
}
