import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Map, Layers, Search, BriefcaseBusiness } from 'lucide-react';
import GlobalSearch from '../search/GlobalSearch';
import AccountMenu, { accountPageTitle } from '../account/AccountMenu';
import ViewAsSign from '../account/ViewAsSign';
import { useAccount } from '../../lib/account';
import { useViewer } from '../../lib/viewer';
import { SEARCH_SHORTCUT } from '../../lib/shortcut';

interface NavItem {
  to: string;
  icon: typeof Map;
  label: string;
  /** What a screen reader hears, when it is more than the label. */
  name?: string;
  /** Other paths this item stands for. */
  also?: string[];
}

// The map and Explore are for everyone. Jobs is the list of open jobs for a visitor and a
// seeker; for someone here to hire it is their own jobs, with the open list one link below
// them. A person's own page, settings and Admin Tools are in the account menu.
const navItems: NavItem[] = [
  { to: '/map', icon: Map, label: 'Map' },
  { to: '/explore', icon: Layers, label: 'Explore' },
  { to: '/jobs', icon: BriefcaseBusiness, label: 'Jobs' },
];
const employerJobs: NavItem = { to: '/employer', icon: BriefcaseBusiness, label: 'Jobs', name: 'Your jobs', also: ['/jobs'] };

function isAt(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function Layout() {
  const location = useLocation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { data: account } = useAccount();
  const isAdmin = Boolean(account?.user?.isAdmin);
  const viewer = useViewer();
  const shownNav = viewer.employer ? navItems.map((item) => (item.to === '/jobs' ? employerJobs : item)) : navItems;

  // Hide global search on map view (it has its own search)
  const isMapView = location.pathname === '/map';

  // Tab / history / bookmark titles. Detail pages override with the entity name.
  const section =
    navItems.find((n) => isAt(location.pathname, n.to))?.label ??
    accountPageTitle(location.pathname, isAdmin);
  const isDetail = /^\/(companies|factories|occupations|skills)\/[^/]+$/.test(location.pathname);
  // The industry pages name themselves too: the industry, and the place.
  const namesItself = isDetail || /^\/industries(\/[^/]+)?$/.test(location.pathname);
  const title = namesItself ? null : section ? `${section} · Archangel` : 'Archangel';
  // Set on arrival, and again only if the title itself changes (an admin's
  // account loading), so a page that names itself afterwards keeps its title.
  useEffect(() => {
    if (title) document.title = title;
  }, [location.pathname, title]);

  // Global keyboard shortcut for search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't open global search on map view
      if (isMapView) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMapView]);

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* First stop for the Tab key: past the header, into the page. Seen only when it has focus. */}
      <a
        href="#main"
        onClick={(event) => {
          // Focus is moved by hand: the address fragment belongs to the page (the map keeps its camera there).
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-2 focus:z-[60] focus:rounded-lg focus:border focus:border-border-strong
          focus:bg-bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-fg-default"
      >
        Skip to content
      </a>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg-surface border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Three columns. From tablet up the outer two are equal, so the wordmark sits at the
              centre of every page; a phone has no room for that, and centres it in what is left. */}
          <div className="grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4">
            {/* Left: Navigation */}
            <nav className="flex min-w-0 items-center gap-1">
              {shownNav.map(({ to, icon: Icon, label, name, also }) => {
                const isActive = [to, ...(also ?? [])].some((path) => isAt(location.pathname, path));

                return (
                  <NavLink
                    key={to}
                    to={to}
                    aria-label={name ?? label}
                    className={`
                      flex items-center justify-center gap-2 px-3 lg:px-4 py-2 rounded-full text-sm font-medium
                      min-h-11 min-w-11 lg:min-h-0 lg:min-w-0
                      transition-colors
                      ${isActive
                        ? 'bg-bg-elevated text-fg-default'
                        : 'text-fg-muted hover:text-fg-default hover:bg-bg-elevated/50'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden lg:inline">{label}</span>
                  </NavLink>
                );
              })}
            </nav>

            {/* Center: Logo, or the sign that an admin is viewing as someone else */}
            <div className="flex min-w-0 items-center justify-center">
              {viewer.viewingAs ? (
                <ViewAsSign />
              ) : (
                <span className="text-sm md:text-base lg:text-lg font-semibold tracking-tight text-fg-default whitespace-nowrap">
                  ARCHANGEL
                </span>
              )}
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-4">
            {/* On a phone the map keeps the search button's room, so the wordmark does not shift between pages. */}
            {isMapView && <span className="w-10 shrink-0 sm:hidden" aria-hidden="true" />}
            {/* Right: Search button - hidden on map view */}
            {!isMapView && (
              <button
                onClick={() => setIsSearchOpen(true)}
                aria-label="Search"
                title={`Search (${SEARCH_SHORTCUT})`}
                className="flex h-11 min-w-11 items-center justify-center gap-2 px-3 rounded-full sm:h-10
                  bg-bg-elevated border border-border-subtle
                  text-sm text-fg-muted hover:text-fg-default
                  transition-colors flex-shrink-0"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5
                  bg-bg-surface rounded text-xs text-fg-soft">
                  {SEARCH_SHORTCUT}
                </kbd>
              </button>
            )}

            {/* End of the nav: sign in, or the signed-in person's menu */}
            <AccountMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>

      {/* Global search modal */}
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
