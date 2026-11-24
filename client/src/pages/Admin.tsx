import { useEffect } from 'react';
import { Link, Navigate, NavLink, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn, labelClass, pageTitleClass } from '@/lib/utils';
import { type AccountUser } from '../lib/account';
import { accountKeys } from '../lib/queryKeys';
import { useAdminOverview } from '../lib/admin';
import { ADMIN_PAGES, adminPath, fromOldAdminAddress, type AdminPage } from '../lib/adminPages';
import { ApiError } from '../lib/http';
import { AccountGate } from '../components/account/parts';
import { PageContainer } from '../components/layout/Page';
import AccessTab from '../components/admin/AccessTab';
import ActivityPage from '../components/admin/ActivityPage';
import AddPage from '../components/admin/AddPage';
import AdminIndex, { useWaitingCounts } from '../components/admin/AdminIndex';
import { AdminNoticeBar, AdminNoticeProvider } from '../components/admin/AdminNotice';
import InvitesTab from '../components/admin/InvitesTab';
import PeopleTab from '../components/admin/PeopleTab';
import RecordsPage from '../components/admin/RecordsPage';
import ReviewPage from '../components/admin/ReviewPage';
import NotFound from './NotFound';

/**
 * Admin Tools, for a signed-in admin. Each page is one thing a person comes
 * to do, at its own address: `/admin` is the index, and `/admin/add`,
 * `/admin/records`, `/admin/review`, `/admin/people`, `/admin/access`,
 * `/admin/invites` and `/admin/activity` the pages (`ADMIN_PAGES` in
 * lib/admin.ts). An address from before the pages (`/admin?tab=data…`) is
 * sent to the page that does what its tab did.
 *
 * Signed out, the gate sends the person to sign in. Signed in without the
 * role, every one of these addresses is the same as one that does not exist.
 * The API enforces the same rule on every /api/admin route.
 */
export default function Admin() {
  return (
    <AccountGate>
      {({ user }) =>
        user.isAdmin ? (
          <AdminNoticeProvider>
            <AdminTools me={user} />
          </AdminNoticeProvider>
        ) : (
          <NotFound />
        )
      }
    </AccountGate>
  );
}

/** The role was taken away while a page was open: ask again who is signed in, and the page goes with the role. */
function useRoleStillHeld() {
  const overview = useAdminOverview();
  const queryClient = useQueryClient();
  const refused = overview.error instanceof ApiError && overview.error.status === 403;
  useEffect(() => {
    if (refused) void queryClient.invalidateQueries({ queryKey: accountKeys.account });
  }, [refused, queryClient]);
}

/**
 * The pages as one row of words, from a tablet up: where you are is in full
 * ink with a line under it, and a page where something waits says how many.
 * On a phone seven words do not fit, and the way between pages is the index.
 */
function AdminNav({ current }: { current: AdminPage }) {
  const waiting = useWaitingCounts();
  return (
    <nav aria-label="Admin Tools" className="mb-6 hidden border-b border-line sm:block" data-admin-nav>
      <ul className="flex gap-6">
        {ADMIN_PAGES.map((page) => {
          const count = waiting[page.slug];
          return (
            <li key={page.slug}>
              <NavLink
                to={adminPath(page.slug)}
                aria-current={page.slug === current ? 'page' : undefined}
                className={cn(
                  '-mb-px flex items-baseline gap-1.5 border-b-2 px-1 pb-3 pt-1.5 text-sm font-medium transition-colors focus-visible:-outline-offset-2',
                  page.slug === current ? 'border-[color:var(--text-1)] text-text-1' : 'border-transparent text-text-2 hover:text-text-1'
                )}
              >
                {page.label}
                {count ? <span className="text-xs tabular-nums text-text-2">{count.toLocaleString('en-US')}</span> : null}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AdminTools({ me }: { me: AccountUser }) {
  const { pathname, search, hash } = useLocation();
  useRoleStillHeld();
  const slug = pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '');
  const page = ADMIN_PAGES.find((option) => option.slug === slug);

  // The browser tab names the place: "Admin Tools · Invites".
  const label = page?.label;
  useEffect(() => {
    // After the layout has named the page, which it does on arrival.
    const timer = window.setTimeout(() => {
      document.title = label ? `Admin Tools · ${label} · Archangel` : 'Admin Tools · Archangel';
    }, 0);
    return () => window.clearTimeout(timer);
  }, [label]);

  // An address from before the pages lands on the page that does what its tab did.
  const moved = slug === '' ? fromOldAdminAddress(search, hash) : null;
  if (moved) return <Navigate to={moved} replace />;
  if (slug !== '' && !page) return <NotFound />;

  return (
    <PageContainer>
      <header className="mb-5 sm:mb-6">
        {page ? (
          <>
            <Link
              to="/admin"
              className={cn(labelClass, '-mt-2 mb-1 inline-flex min-h-11 items-center gap-2 pr-2 transition-colors hover:text-text-1')}
              data-admin-home
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Admin Tools
            </Link>
            <h1 className={pageTitleClass}>{page.label}</h1>
            <p className="mt-2 max-w-prose text-sm text-text-2">{page.says}</p>
          </>
        ) : (
          <>
            <h1 className={pageTitleClass}>Admin Tools</h1>
            <p className="mt-2 max-w-prose text-sm text-text-2">Choose what you came to do.</p>
          </>
        )}
      </header>
      {page && <AdminNav current={page.slug} />}
      {/* What the last action did: one bar, pinned over the page. */}
      <AdminNoticeBar />
      {!page && <AdminIndex />}
      {page?.slug === 'add' && <AddPage />}
      {page?.slug === 'records' && <RecordsPage />}
      {page?.slug === 'review' && <ReviewPage />}
      {page?.slug === 'people' && <PeopleTab me={me} />}
      {page?.slug === 'access' && <AccessTab />}
      {page?.slug === 'invites' && <InvitesTab />}
      {page?.slug === 'activity' && <ActivityPage />}
    </PageContainer>
  );
}
