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
          <div className="flex items-center justify-between h-14">
            {/* Navigation */}
            <nav className="flex items-center gap-1">
              {navItems.map(({ to, icon: Icon, label }) => {
                const isActive = location.pathname === to ||
                  (to === '/explore' && location.pathname.startsWith('/explore'));

                return (
                  <NavLink
                    key={to}
                    to={to}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium
                      transition-colors
                      ${isActive
                        ? 'bg-bg-elevated text-fg-default'
                        : 'text-fg-muted hover:text-fg-default hover:bg-bg-elevated/50'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </NavLink>
                );
              })}
            </nav>

            {/* Logo */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
              <span className="text-lg font-semibold tracking-tight text-fg-default">
                ARCHANGEL
              </span>
            </div>

            {/* Search button - hidden on map view (has its own search) */}
            {!isMapView && (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full
                  bg-bg-elevated border border-border-subtle
                  text-sm text-fg-muted hover:text-fg-default
                  transition-colors"
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
