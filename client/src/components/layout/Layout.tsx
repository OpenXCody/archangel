import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Map, GitBranch, Layers, Upload, Search } from 'lucide-react';
import GlobalSearch from '../search/GlobalSearch';

const navItems = [
  { to: '/map', icon: Map, label: 'Map' },
  { to: '/tree', icon: GitBranch, label: 'Tree' },
  { to: '/explore', icon: Layers, label: 'Nodes' },
  { to: '/import', icon: Upload, label: 'Data' },
];

export default function Layout() {
  const location = useLocation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Hide global search on map view (it has its own search)
  const isMapView = location.pathname === '/map';

  // Tab / history / bookmark titles. Detail pages override with the entity name.
  useEffect(() => {
    const section = navItems.find((n) => location.pathname === n.to || location.pathname.startsWith(`${n.to}/`))?.label;
    const isDetail = /^\/(companies|factories|occupations|skills|refs|schools|programs)\/[^/]+$/.test(location.pathname);
    if (!isDetail) document.title = section ? `${section} · Archangel` : 'Archangel';
  }, [location.pathname]);

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
      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg-surface border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 gap-4">
            {/* Left: Navigation */}
            <nav className="flex items-center gap-1 flex-shrink-0">
              {navItems.map(({ to, icon: Icon, label }) => {
                const isActive = location.pathname === to ||
                  (to === '/explore' && location.pathname.startsWith('/explore'));

                return (
                  <NavLink
                    key={to}
                    to={to}
                    aria-label={label}
                    className={`
                      flex items-center gap-2 px-3 lg:px-4 py-2 rounded-full text-sm font-medium
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

            {/* Center: Logo - visible on tablet+ */}
            <div className="flex items-center justify-center flex-1 min-w-0">
              <span className="text-sm md:text-base lg:text-lg font-semibold tracking-tight text-fg-default whitespace-nowrap">
                ARCHANGEL
              </span>
            </div>

            {/* Right: Search button - hidden on map view */}
            {!isMapView && (
              <button
                onClick={() => setIsSearchOpen(true)}
                aria-label="Search"
                title="Search (⌘K)"
                className="flex h-10 items-center gap-2 px-3 rounded-full
                  bg-bg-elevated border border-border-subtle
                  text-sm text-fg-muted hover:text-fg-default
                  transition-colors flex-shrink-0"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5
                  bg-bg-surface rounded text-xs text-fg-soft">
                  <span className="text-[10px]">&#8984;</span>K
                </kbd>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Global search modal */}
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
