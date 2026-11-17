import { type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { getAdminSecret, clearAdminSecret } from '../../lib/api';
import { ADMIN_STATUS_QUERY_KEY, isAdminAuthorized, useAdminStatus } from '../../lib/adminStatus';
import { AccountGate } from '../account/parts';
import NotFound from '../../pages/NotFound';

/**
 * Wraps the import pages, which are for admins. Who counts is the server's
 * answer (GET /api/import/status): a signed-in admin, or a browser holding a
 * valid admin key from an earlier session. Anyone else gets what Admin Tools
 * gives them: the sign-in page, or the not-found page.
 */
export default function AdminKeyGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useAdminStatus();
  const signOut = () => {
    clearAdminSecret();
    void queryClient.invalidateQueries({ queryKey: ADMIN_STATUS_QUERY_KEY });
  };

  if (isLoading) return null;

  if (isError) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-lg border border-border-subtle bg-bg-surface p-4 text-sm text-fg-muted">
        Could not reach the API to check admin access.
      </div>
    );
  }

  // Not an admin here: the same as Admin Tools. Signed out, the account gate
  // sends the person to sign in and back; signed in without the role, the page
  // does not exist. (A signed-in admin never reaches this branch: the server
  // counts the session as authorized.)
  if (data && !isAdminAuthorized(data)) {
    return <AccountGate>{({ user }) => (user.isAdmin ? <>{children}</> : <NotFound />)}</AccountGate>;
  }

  return (
    <>
      {data?.authRequired && getAdminSecret() && (
        <div className="mx-auto flex w-full max-w-4xl items-center justify-end px-4 pt-3 sm:px-6">
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
