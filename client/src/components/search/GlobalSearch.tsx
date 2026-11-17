import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  X,
  Building2,
  Factory,
  Briefcase,
  BriefcaseBusiness,
  Wrench,
  MapPin,
  Clock,
  Layers,
  Loader2,
} from 'lucide-react';
import { searchApi, type SearchEntityType, type SearchResultItem } from '../../lib/api';
import CompanyLogo from '../CompanyLogo';
import { readStored, removeStored, writeStored } from '../../lib/storage';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

const ENTITY_CONFIG: Record<
  SearchEntityType,
  { icon: React.ElementType; label: string; iconClass: string; path: string }
> = {
  companies: {
    icon: Building2,
    label: 'Company',
    iconClass: 'text-fg-muted',
    path: '/companies',
  },
  factories: {
    icon: Factory,
    label: 'Factory',
    iconClass: 'text-fg-muted',
    path: '/factories',
  },
  occupations: {
    icon: Briefcase,
    label: 'Career',
    iconClass: 'text-fg-muted',
    path: '/occupations',
  },
  // Open jobs sit beside the careers they are for.
  jobs: {
    icon: BriefcaseBusiness,
    label: 'Job',
    iconClass: 'text-fg-muted',
    path: '/jobs',
  },
  skills: {
    icon: Wrench,
    label: 'Skill',
    iconClass: 'text-fg-muted',
    path: '/skills',
  },
  states: {
    icon: MapPin,
    label: 'State',
    iconClass: 'text-fg-muted',
    path: '/states',
  },
};

const QUICK_LINKS = [
  { type: 'companies' as const, label: 'Browse all companies', path: '/explore?tab=companies' },
  { type: 'factories' as const, label: 'Browse all factories', path: '/explore?tab=factories' },
  { type: 'occupations' as const, label: 'Browse all careers', path: '/explore?tab=occupations' },
  { type: 'skills' as const, label: 'Browse all skills', path: '/explore?tab=skills' },
];

/** Name shown for a result group. The data type stays "occupations"; people read "careers". */
const groupName = (type: SearchEntityType): string => (type === 'occupations' ? 'careers' : type);

const RECENT_SEARCHES_KEY = 'archangel_recent_searches';
const MAX_RECENT_SEARCHES = 10;

export default function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // What had the focus when the dialog opened; it gets it back when the dialog closes.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (isOpen) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    const opener = openerRef.current;
    openerRef.current = null;
    // Only when the focus was left nowhere: choosing a result moves on to another page.
    if (opener && opener.isConnected && (document.activeElement === document.body || document.activeElement === null)) opener.focus();
  }, [isOpen]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [typeFilter, setTypeFilter] = useState<SearchEntityType | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = readStored(RECENT_SEARCHES_KEY);
    if (!saved) return;
    try {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) setRecentSearches(parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX_RECENT_SEARCHES));
    } catch {
      // Not a list: start with none.
    }
  }, []);

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setDebouncedQuery('');
      setSelectedIndex(0);
      setTypeFilter(null);
    }
  }, [isOpen]);

  // Search query
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['search', debouncedQuery, typeFilter],
    queryFn: () =>
      searchApi.search(debouncedQuery, {
        types: typeFilter ? [typeFilter] : undefined,
        limit: 5,
      }),
    enabled: debouncedQuery.length >= 1,
    staleTime: 30000,
  });

  // Flatten results for keyboard navigation
  const flatResults = useCallback((): SearchResultItem[] => {
    if (!searchResults) return [];
    // The order the groups are drawn in, so the arrow keys reach every row.
    return (Object.keys(ENTITY_CONFIG) as SearchEntityType[]).flatMap((type) => searchResults.results[type]?.items || []);
  }, [searchResults]);

  // Save recent search
  const saveRecentSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s !== searchQuery);
      const updated = [searchQuery, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      writeStored(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Remove recent search
  const removeRecentSearch = useCallback((searchQuery: string) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => s !== searchQuery);
      writeStored(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Clear all recent searches
  const clearRecentSearches = useCallback(() => {
    removeStored(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
  }, []);

  // Navigate to result
  const navigateToResult = useCallback(
    (item: SearchResultItem) => {
      saveRecentSearch(query);
      const config = ENTITY_CONFIG[item.type];
      onClose();
      // A state has no page of its own: it opens on the map.
      if (item.type === 'states') navigate(`/map?state=${encodeURIComponent(item.subtitle ?? '')}`);
      else navigate(`${config.path}/${item.id}`);
    },
    [navigate, onClose, query, saveRecentSearch]
  );

  // Navigate to quick link
  const navigateToQuickLink = useCallback(
    (path: string) => {
      onClose();
      navigate(path);
    },
    [navigate, onClose]
  );

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const results = flatResults();

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'Tab': {
          // Focus stays inside the dialog: Tab from the last control goes to the first.
          const box = boxRef.current;
          if (!box) break;
          const stops = [...box.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]:not([tabindex="-1"])')].filter(
            (el) => !el.hasAttribute('disabled')
          );
          if (stops.length === 0) break;
          const at = stops.indexOf(document.activeElement as HTMLElement);
          const next = at === -1 ? 0 : (at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length;
          e.preventDefault();
          stops[next].focus();
          break;
        }
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          // From the search field only: Enter on a button presses that button.
          if (e.target !== inputRef.current) break;
          e.preventDefault();
          if (results[selectedIndex]) {
            navigateToResult(results[selectedIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatResults, selectedIndex, onClose, navigateToResult]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  if (!isOpen) return null;

  const results = flatResults();
  const hasQuery = debouncedQuery.length >= 1;
  const hasResults = results.length > 0;
  const showNoResults = hasQuery && !isLoading && !hasResults;

  return (
    <>
      {/* Backdrop */}
      <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-x-4 top-[15vh] z-50 mx-auto max-w-[600px]">
        <div
          className="
            overflow-hidden rounded-xl
            bg-bg-surface
            border border-tint/10
            shadow-2xl
          "
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-tint/10 px-4 py-3">
            <Search className="w-5 h-5 text-fg-soft flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Archangel..."
              className="
                flex-1 bg-transparent text-fg-default
                placeholder:text-fg-soft
                text-base
              "
              style={{
                outline: 'none',
                border: 'none',
                boxShadow: 'none',
                WebkitAppearance: 'none',
              }}
            />
            {isLoading && <Loader2 className="w-4 h-4 text-fg-soft animate-spin" />}
            {query && !isLoading && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="p-1 text-fg-soft hover:text-fg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-tint/5 text-xs text-fg-soft border border-tint/10">
              esc
            </kbd>
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 border-b border-tint/5 [&>button]:shrink-0">
            <button
              onClick={() => setTypeFilter(null)}
              className={`
                px-2.5 py-1 text-xs rounded-full transition-colors
                ${!typeFilter
                  ? 'bg-tint/10 text-fg-default'
                  : 'text-fg-soft hover:text-fg-muted hover:bg-tint/5'
                }
              `}
            >
              All
            </button>
            {(Object.keys(ENTITY_CONFIG) as SearchEntityType[]).map((type) => {
              const config = ENTITY_CONFIG[type];
              const Icon = config.icon;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                  className={`
                    flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full transition-colors
                    ${typeFilter === type
                      ? 'bg-tint/10 text-fg-default'
                      : 'text-fg-soft hover:text-fg-muted hover:bg-tint/5'
                    }
                  `}
                >
                  <Icon className={`w-3.5 h-3.5 ${config.iconClass}`} />
                  <span className="capitalize">{groupName(type)}</span>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="max-h-[50vh] overflow-y-auto">
            {/* Recent searches (when no query) */}
            {!hasQuery && recentSearches.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-fg-soft uppercase tracking-wider">
                    Recent Searches
                  </h4>
                  <button
                    onClick={clearRecentSearches}
                    className="text-xs text-fg-soft hover:text-fg-muted transition-colors"
                  >
                    Clear all
                  </button>
                </div>
                <div className="space-y-1">
                  {recentSearches.map((search) => (
                    <div
                      key={search}
                      className="
                        flex items-center gap-3 px-3 py-2 rounded-lg
                        hover:bg-tint/5 cursor-pointer group
                      "
                      onClick={() => setQuery(search)}
                    >
                      <Clock className="w-4 h-4 text-fg-soft" />
                      <span className="flex-1 text-sm text-fg-muted">{search}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecentSearch(search);
                        }}
                        className="p-1 opacity-0 group-hover:opacity-100 text-fg-soft hover:text-fg-muted transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links (when no query) */}
            {!hasQuery && (
              <div className="px-4 py-3 border-t border-tint/5">
                <h4 className="text-xs font-medium text-fg-soft uppercase tracking-wider mb-2">
                  Quick Links
                </h4>
                <div className="space-y-1">
                  {QUICK_LINKS.map((link) => {
                    const config = ENTITY_CONFIG[link.type];
                    const Icon = config.icon;
                    return (
                      <div
                        key={link.path}
                        className="
                          flex items-center gap-3 px-3 py-2 rounded-lg
                          hover:bg-tint/5 cursor-pointer
                        "
                        onClick={() => navigateToQuickLink(link.path)}
                      >
                        <Icon className={`w-4 h-4 ${config.iconClass}`} />
                        <span className="text-sm text-fg-muted">{link.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search results */}
            {hasQuery && hasResults && (
              <div className="py-2">
                {(Object.keys(ENTITY_CONFIG) as SearchEntityType[]).map((type) => {
                  const items = searchResults?.results[type]?.items || [];
                  if (items.length === 0) return null;

                  const config = ENTITY_CONFIG[type];
                  const Icon = config.icon;

                  return (
                    <div key={type} className="px-4 py-2">
                      <h4 className="text-xs font-medium text-fg-soft uppercase tracking-wider mb-2">
                        {groupName(type)}
                        <span className="ml-2 text-fg-soft">
                          {searchResults?.results[type]?.count || 0}
                        </span>
                      </h4>
                      <div className="space-y-1">
                        {items.map((item) => {
                          const globalIndex = results.findIndex(
                            (r) => r.id === item.id && r.type === item.type
                          );
                          const isSelected = globalIndex === selectedIndex;

                          return (
                            <div
                              key={`${item.type}-${item.id}`}
                              role="option"
                              aria-selected={isSelected}
                              className={`
                                flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
                                ${isSelected ? 'bg-tint/10' : 'hover:bg-tint/5'}
                              `}
                              onClick={() => navigateToResult(item)}
                              onMouseEnter={() => setSelectedIndex(globalIndex)}
                            >
                              {item.type === 'companies' && item.domain ? (
                                <CompanyLogo name={item.name} domain={item.domain} size={20} className="rounded" />
                              ) : (
                                <Icon className={`w-4 h-4 flex-shrink-0 ${config.iconClass}`} />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-fg-default truncate">
                                  {item.type === 'companies'
                                    ? formatCompanyName(item.name)
                                    : item.type === 'factories'
                                      ? formatFactoryName(item.name)
                                      : item.name}
                                </p>
                                {item.subtitle && (
                                  <p className="text-xs text-fg-soft truncate">{item.subtitle}</p>
                                )}
                              </div>
                              {item.meta && (
                                <span className="text-xs text-fg-soft flex-shrink-0">
                                  {item.meta}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* No results */}
            {showNoResults && (
              <div className="px-4 py-8 text-center">
                <Layers className="w-12 h-12 text-fg-soft mx-auto mb-3" />
                <h4 className="text-fg-muted font-medium mb-1">
                  No results for "{debouncedQuery}"
                </h4>
                <p className="text-sm text-fg-soft mb-4">
                  Try checking your spelling or using different terms
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK_LINKS.map((link) => (
                    <button
                      key={link.path}
                      onClick={() => navigateToQuickLink(link.path)}
                      className="
                        px-3 py-1.5 text-sm rounded-lg
                        bg-tint/5 text-fg-muted
                        hover:bg-tint/10 transition-colors
                      "
                    >
                      Browse {link.type}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading */}
            {hasQuery && isLoading && (
              <div className="px-4 py-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-fg-soft animate-spin" />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-tint/5 text-xs text-fg-soft">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-tint/5 border border-tint/10">
                <span className="text-[10px]">&#8593;&#8595;</span>
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-tint/5 border border-tint/10">
                <span className="text-[10px]">&#9166;</span>
              </kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-tint/5 border border-tint/10">esc</kbd>
              Close
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
