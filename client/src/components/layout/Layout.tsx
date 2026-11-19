import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import GlobalSearch from '../search/GlobalSearch';
import AccountMenu, { accountPageTitle } from '../account/AccountMenu';
import ViewAsSign from '../account/ViewAsSign';
import { useAccount } from '../../lib/account';
import { useViewer } from '../../lib/viewer';
import { SEARCH_SHORTCUT } from '../../lib/shortcut';

interface NavItem {
  to: string;
  label: string;
  /** Other paths this item stands for. */
  also?: string[];
}

// The three places, by their words at every width: the header says where you
// are. The map and Explore are for everyone; Explore stands for everything
// reached through it (the industries and every company, plant, career and
// skill page). Jobs is the list of open jobs for a visitor and a seeker; for
// someone here to hire it is "Your jobs", their own, with the open list one
// link below them. A person's own page, settings and Admin Tools are in the
// account menu.
const navItems: NavItem[] = [
  { to: '/map', label: 'Map' },
  { to: '/explore', label: 'Explore', also: ['/industries', '/atlas', '/companies', '/factories', '/occupations', '/skills'] },
  { to: '/jobs', label: 'Jobs' },
];
const employerJobs: NavItem = { to: '/employer', label: 'Your jobs', also: ['/jobs'] };

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
  // So does a page that is not there ("Not found"), which has no section.
  const namesItself = isDetail || /^\/(industries(\/[^/]+)?|atlas)$/.test(location.pathname);
  const title = namesItself || !section ? null : `${section} · Archangel`;
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
    <div className="min-h-screen bg-bg flex flex-col">
      {/* First stop for the Tab key: past the header, into the page. Seen only when it has focus. */}
      <a
        href="#main"
        onClick={(event) => {
          // Focus is moved by hand: the address fragment belongs to the page (the map keeps its camera there).
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-2 focus:z-[60] focus:rounded-lg focus:border focus:border-line-strong
          focus:bg-bg focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-text-1"
      >
        Skip to content
      </a>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Three columns. From tablet up the outer two are equal, so the wordmark sits at the
              centre of every page. A phone has no room for it beside three words: there the
              middle column holds nothing, unless an admin is viewing as someone else. */}
          <div className="grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4">
            {/* Left: Navigation */}
            <nav aria-label="Main" className="-ml-2 flex min-w-0 items-center max-[339px]:-ml-1.5 sm:ml-0 sm:gap-1">
              {shownNav.map(({ to, label, also }) => {
                const isActive = [to, ...(also ?? [])].some((path) => isAt(location.pathname, path));

                return (
                  <Link
                    key={to}
                    to={to}
                    // Lit, and said to be current, for everything the item stands for, not only its own address.
                    aria-current={isActive ? 'page' : undefined}
                    className={`
                      flex min-h-11 items-center whitespace-nowrap rounded-full px-2 text-sm font-medium max-[339px]:px-1.5 xs:px-3
                      transition-colors lg:min-h-0 lg:px-4 lg:py-2
                      ${isActive
                        ? 'bg-surface text-text-1'
                        : 'text-text-2 hover:text-text-1 hover:bg-surface'
                      }
                    `}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>

            {/* Center: the wordmark, which leads to the map; or the sign that an admin is viewing as someone else */}
            <div className="flex min-w-0 items-center justify-center">
              {viewer.viewingAs ? (
                <ViewAsSign />
              ) : (
                <Link
                  to="/map"
                  aria-label="Archangel: the map"
                  className="hidden whitespace-nowrap rounded-md text-base font-semibold tracking-tight text-text-1 sm:block lg:text-lg"
                >
                  ARCHANGEL
                </Link>
              )}
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-4">
            {/* Right: Search button - hidden on map view */}
            {!isMapView && (
              <button
                onClick={() => setIsSearchOpen(true)}
                aria-label="Search"
                title={`Search (${SEARCH_SHORTCUT})`}
                // The narrowest phones (320 px) have room for the view-as sign or for this, not both: the sign stays.
                className={`flex ${viewer.viewingAs ? 'max-[339px]:hidden' : ''} h-11 min-w-11 items-center justify-center gap-2 px-3 rounded-full sm:h-10
                  bg-surface
                  text-sm text-text-2 hover:text-text-1
                  transition-colors flex-shrink-0`}
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5
                  rounded text-xs text-text-3">
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
