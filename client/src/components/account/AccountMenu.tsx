import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Building2, ChevronDown, Loader2, LogIn, LogOut, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { accountRoles, errorMessage, signInPath, useAccount, useSessionExpiryWatch, useSignOut } from '../../lib/account';
import { setTheme, useTheme } from '../../lib/theme';

/**
 * Titles for the account pages, for the browser tab. Null for any other path.
 * Admin Tools is named only for an admin: to anyone else the page does not exist.
 */
export function accountPageTitle(pathname: string, isAdmin: boolean): string | null {
  if (pathname === '/sign-in') return 'Sign in';
  if (pathname === '/me') return 'Profile';
  if (pathname === '/employer') return 'Employer';
  if (pathname === '/admin') return isAdmin ? 'Admin Tools' : null;
  return null;
}

const itemClass = 'cursor-pointer gap-2.5 px-2.5 py-2.5 text-sm text-fg-default focus:bg-bg-elevated';

/**
 * The account control at the end of the header nav: "Sign in" when signed
 * out; signed in, the person's name opening a small menu. Below `lg` it
 * collapses to an icon, as the nav items do.
 */
export default function AccountMenu() {
  const location = useLocation();
  const { data, isPending } = useAccount();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  useSessionExpiryWatch();

  if (isPending && !data) {
    // Hold the control's place so the header does not shift when the answer arrives.
    return <div className="h-10 w-10 shrink-0" aria-hidden="true" />;
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
          'flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors lg:px-4',
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
  // Anyone with a company, approved or waiting, has an employer page.
  const hasCompany = (data?.memberships.length ?? 0) > 0;

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
        className="flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-full border border-border-subtle bg-bg-elevated
          p-1 text-sm font-medium text-fg-default transition-colors hover:border-border-strong lg:pr-3"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-surface text-xs font-semibold text-fg-default">
          {initial}
        </span>
        <span className="hidden max-w-[140px] truncate lg:inline">{user.name}</span>
        <ChevronDown className={cn('hidden h-4 w-4 shrink-0 text-fg-muted transition-transform lg:block', open && 'rotate-180')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-xl border-border-strong bg-bg-surface p-1.5">
        <DropdownMenuLabel className="px-2.5 py-2 font-normal">
          <span className="block truncate text-sm font-semibold text-fg-default">{user.name}</span>
          <span className="block truncate text-xs text-fg-muted">{user.email}</span>
          <span className="mt-1.5 block truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft">
            {roles.join(' · ')}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[color:var(--color-border-subtle)]" />
        <DropdownMenuItem asChild className={itemClass}>
          <Link to="/me">
            <UserRound className="text-fg-muted" />
            Profile
          </Link>
        </DropdownMenuItem>
        {hasCompany && (
          <DropdownMenuItem asChild className={itemClass}>
            <Link to="/employer">
              <Building2 className="text-fg-muted" />
              Employer
            </Link>
          </DropdownMenuItem>
        )}
        {user.isAdmin && (
          <DropdownMenuItem asChild className={itemClass}>
            <Link to="/admin">
              <ShieldCheck className="text-fg-muted" />
              Admin Tools
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="bg-[color:var(--color-border-subtle)]" />
        {!hasCompany && (
          <DropdownMenuItem asChild className={cn(itemClass, 'text-fg-muted')}>
            <Link to="/employer">
              <Building2 className="text-fg-muted" />
              Hire for a company
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className={itemClass}
          onSelect={(event) => {
            // Stay open: the change is visible behind the menu, and easy to undo.
            event.preventDefault();
            setTheme(theme === 'light' ? 'dark' : 'light');
          }}
        >
          {theme === 'light' ? <Moon className="text-fg-muted" /> : <Sun className="text-fg-muted" />}
          {theme === 'light' ? 'Dark mode' : 'Light mode'}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={itemClass}
          disabled={signOut.isPending}
          onSelect={(event) => {
            // Keep the menu open until the session has really ended, so a failure can be shown here.
            event.preventDefault();
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
