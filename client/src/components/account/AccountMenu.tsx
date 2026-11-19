import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BriefcaseBusiness, ChevronDown, Loader2, LogIn, LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  accountRoles,
  signInPath,
  useAccount,
  useMarkSeen,
  useNews,
  useSessionExpiryWatch,
  useSignOut,
  type News,
} from '../../lib/account';
import { useJob } from '../../lib/jobs';
import { errorMessage } from '../../lib/http';
import { useViewer } from '../../lib/viewer';

/**
 * Titles for the account pages, for the browser tab. Null for any other path.
 * Admin Tools is named only for an admin: to anyone else the page does not exist.
 */
export function accountPageTitle(pathname: string, isAdmin: boolean): string | null {
  if (pathname === '/sign-in') return 'Sign in';
  if (pathname === '/me') return 'Profile';
  if (pathname === '/employer') return 'Your jobs';
  if (pathname === '/settings') return 'Settings';
  if (pathname === '/admin') return isAdmin ? 'Admin Tools' : null;
  return null;
}

const itemClass = 'cursor-pointer gap-2.5 px-2.5 py-2.5 text-sm text-fg-default focus:bg-bg-elevated';

/**
 * News stops being news when the page that shows it is opened: the employer
 * page or a job the person manages (applicants), and the access requests in
 * Admin Tools. A person's own applications are marked seen by their page,
 * once it has listed them (pages/Me.tsx). This lives here because the menu is
 * on every page.
 */
function useSeenOnVisit(news: News | undefined): void {
  const { pathname, search } = useLocation();
  const { mutate } = useMarkSeen();
  const jobId = /^\/jobs\/([0-9a-f-]{36})$/i.exec(pathname)?.[1];
  // The job page's own query, shared: no second request.
  const job = useJob(news?.applicants ? jobId : undefined);
  const seen: keyof News | null = !news
    ? null
    : news.applicants && (pathname === '/employer' || (jobId !== undefined && job.data?.canManage === true))
      ? 'applicants'
      : news.access && pathname === '/admin' && new URLSearchParams(search).get('tab') === 'access'
        ? 'access'
        : null;
  useEffect(() => {
    if (seen) mutate({ [seen]: true });
  }, [seen, mutate]);
}

/**
 * The account control at the end of the header nav: "Sign in" when signed
 * out; signed in, the person's name opening a small menu. Below `lg` it
 * collapses to an icon, as the nav items do.
 *
 * The menu leads with the person's own place: a seeker's profile, and Admin
 * Tools for an admin. Then settings and signing out, the same for everyone.
 * An employer's jobs are in the header ("Your jobs"), so the menu does not
 * say them again; it lists them only while applicants are waiting there, as
 * it lists a profile for someone here to hire only while an application has
 * news, so the dot always leads somewhere.
 */
export default function AccountMenu() {
  const location = useLocation();
  const { data, isPending } = useAccount();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const viewer = useViewer();
  const news = useNews().data;
  useSessionExpiryWatch();
  useSeenOnVisit(news);

  if (isPending && !data) {
    // Hold the control's place so the header does not shift when the answer arrives.
    return <div className="h-11 w-11 shrink-0 lg:h-10 lg:w-10" aria-hidden="true" />;
  }

  const user = data?.user ?? null;
  if (!user) {
    const here = `${location.pathname}${location.search}`;
    const onSignIn = location.pathname === '/sign-in';
    return (
      <Link
        to={onSignIn ? here : signInPath(here)}
        aria-label="Sign in"
        aria-current={onSignIn ? 'page' : undefined}
        className={cn(
          'flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium transition-colors lg:h-10 lg:px-4',
          onSignIn ? 'bg-bg-elevated text-fg-default' : 'text-fg-muted hover:bg-bg-elevated/50 hover:text-fg-default'
        )}
      >
        <LogIn className="h-4 w-4" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || '?';
  const roles = data ? accountRoles(data) : [];
  // A seeker's profile; for anyone else only while it has news. Jobs only while applicants
  // are waiting: an employer's header already leads there. An admin viewing as someone
  // else sees exactly that person's menu.
  const showsPage = viewer.seeker || Boolean(news?.applications && !viewer.viewingAs);
  const showsJobs = Boolean(news?.applicants) && (viewer.employer || !viewer.viewingAs);
  // One dot, never a count. In the menu the page with the news stays bright and the others step back.
  const hasNews = Boolean(
    news && ((news.applications && showsPage) || (news.applicants && showsJobs) || (news.access && viewer.admin))
  );
  const pageItemClass = (lit: boolean | undefined) => cn(itemClass, hasNews && (lit ? 'font-medium' : 'text-fg-muted'));
  const restItemClass = cn(itemClass, hasNews && 'text-fg-muted');
  const pageIconClass = (lit: boolean | undefined) => (hasNews && lit ? 'text-fg-default' : 'text-fg-muted');

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) signOut.reset();
      }}
    >
      <DropdownMenuTrigger
        aria-label={`Account menu for ${user.name}`}
        aria-describedby={hasNews ? 'account-news' : undefined}
        className="flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-full border border-border-subtle bg-bg-elevated
          p-1 text-sm font-medium text-fg-default transition-colors hover:border-border-strong lg:pr-3"
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-surface text-xs font-semibold text-fg-default">
          {initial}
          {hasNews && (
            <span id="account-news" data-account-news className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-elevated bg-info">
              <span className="sr-only">Something new</span>
            </span>
          )}
        </span>
        <span className="hidden max-w-[140px] truncate lg:inline">{user.name}</span>
        <ChevronDown className={cn('hidden h-4 w-4 shrink-0 text-fg-muted transition-transform lg:block', open && 'rotate-180')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl border-border-strong bg-bg-surface p-1.5">
        <DropdownMenuLabel className="px-2.5 py-2 font-normal">
          <span className="block truncate text-sm font-semibold text-fg-default">{user.name}</span>
          <span className="block truncate text-xs text-fg-muted">{user.email}</span>
          {/* A plain account has no label: only a role is worth naming. */}
          {viewer.viewingAs ? (
            <span className="mt-1.5 block truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-info">
              Viewing as {viewer.viewingAs}
            </span>
          ) : (
            roles.length > 0 && (
              <span className="mt-1.5 block truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft">
                {roles.join(' · ')}
              </span>
            )
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[color:var(--color-border-subtle)]" />
        {showsPage && (
          <DropdownMenuItem asChild className={pageItemClass(news?.applications)}>
            <Link to="/me" data-has-news={news?.applications || undefined}>
              <UserRound className={pageIconClass(news?.applications)} />
              Profile
            </Link>
          </DropdownMenuItem>
        )}
        {showsJobs && (
          <DropdownMenuItem asChild className={pageItemClass(news?.applicants)}>
            <Link to="/employer" data-has-news={news?.applicants || undefined}>
              <BriefcaseBusiness className={pageIconClass(news?.applicants)} />
              Your jobs
            </Link>
          </DropdownMenuItem>
        )}
        {viewer.admin && (
          <DropdownMenuItem asChild className={pageItemClass(news?.access)}>
            {/* With a request waiting, straight to the requests. */}
            <Link to={news?.access ? '/admin?tab=access' : '/admin'} data-has-news={news?.access || undefined}>
              <ShieldCheck className={pageIconClass(news?.access)} />
              Admin Tools
            </Link>
          </DropdownMenuItem>
        )}
        {(showsPage || showsJobs || viewer.admin) && <DropdownMenuSeparator className="bg-[color:var(--color-border-subtle)]" />}
        {/* The account itself, the theme, what the account is for and, for an admin, "View as". */}
        <DropdownMenuItem asChild className={restItemClass}>
          <Link to="/settings">
            <Settings className="text-fg-muted" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className={restItemClass}
          // Busy, not disabled: a disabled item would drop the keyboard's place in the menu.
          aria-busy={signOut.isPending || undefined}
          onSelect={(event) => {
            // Keep the menu open until the session has really ended, so a failure can be shown here.
            event.preventDefault();
            if (signOut.isPending) return;
            signOut.mutate(undefined, { onSuccess: () => setOpen(false) });
          }}
        >
          {signOut.isPending ? <Loader2 className="animate-spin text-fg-muted" /> : <LogOut className="text-fg-muted" />}
          Sign out
        </DropdownMenuItem>
        {signOut.isError && (
          <p role="alert" className="px-2.5 pb-1.5 pt-1 text-xs text-danger">
            {errorMessage(signOut.error)}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
