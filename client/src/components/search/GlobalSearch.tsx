import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, X, Loader2 } from 'lucide-react';
import { searchApi, type SearchEntityType } from '../../lib/api';
import CompanyLogo from '../CompanyLogo';
import { readStored, removeStored, writeStored } from '../../lib/storage';
import { groupHeading, groupRows, noResults, recordRows, regionRows, ROWS_PER_GROUP, type SearchRow } from './results';
import { publicKeys } from '../../lib/queryKeys';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

/** What the API is asked for. States and focus areas are lists the page already has. */
const ASKED: SearchEntityType[] = ['industries', 'companies', 'factories', 'occupations', 'skills', 'jobs'];

/** Where choosing a row leads: a record's page, or the map for a place. */
function pageOf(row: SearchRow): string | null {
  switch (row.kind) {
    case 'area':
      return `/map?area=${encodeURIComponent(row.area.id)}`;
    case 'state':
      return `/map?state=${encodeURIComponent(row.code)}`;
    case 'industry':
      return `/industries/${row.slug}`;
    case 'company':
      return `/companies/${row.id}`;
    case 'factory':
      return `/factories/${row.id}`;
    case 'occupation':
      return `/occupations/${row.id}`;
    case 'skill':
      return `/skills/${row.id}`;
    case 'job':
      return `/jobs/${row.id}`;
    case 'place':
      return null;
  }
}

const RECENT_SEARCHES_KEY = 'archangel_recent_searches';
const MAX_RECENT_SEARCHES = 6;

/**
 * The header's search: one field over everything the product holds. With
 * nothing typed it shows nothing but the field (and what was searched for
 * before, if anything was). Results are grouped and worded as the map's
 * search groups and words them (./results.ts): no counts, no filters, a
 * company by its logo and every other row by the group it is in.
 */
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
      setDebouncedQuery(query.trim());
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
    }
  }, [isOpen]);

  const hasQuery = debouncedQuery.length >= 1;

  const { data: searchResults, isFetching } = useQuery({
    queryKey: publicKeys.searchFor(debouncedQuery),
    queryFn: () => searchApi.search(debouncedQuery, { types: ASKED, limit: ROWS_PER_GROUP }),
    enabled: hasQuery,
    staleTime: 30_000,
    // The list being read stays until the next answer is in: nothing flashes between letters.
    placeholderData: keepPreviousData,
  });

  // The groups as they are drawn; the arrow keys walk the same order.
  const groups = useMemo(
    () => (hasQuery ? groupRows({ regions: regionRows(debouncedQuery), ...recordRows(searchResults, debouncedQuery) }) : []),
    [hasQuery, debouncedQuery, searchResults]
  );
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

  // Save recent search
  const saveRecentSearch = useCallback((searchQuery: string) => {
    const term = searchQuery.trim();
    if (!term) return;
    setRecentSearches((prev) => {
      const updated = [term, ...prev.filter((s) => s !== term)].slice(0, MAX_RECENT_SEARCHES);
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
    inputRef.current?.focus();
  }, []);

  const chooseRow = useCallback(
    (row: SearchRow) => {
      const page = pageOf(row);
      if (!page) return;
      saveRecentSearch(query);
      onClose();
      navigate(page);
    },
    [navigate, onClose, query, saveRecentSearch]
  );

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
          setSelectedIndex((prev) => Math.min(prev + 1, Math.max(rows.length - 1, 0)));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          // From the search field only: Enter on a button presses that button.
          if (e.target !== inputRef.current) break;
          e.preventDefault();
          if (rows[selectedIndex]) chooseRow(rows[selectedIndex]);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, rows, selectedIndex, onClose, chooseRow]);

  // The highlight starts on the first row of every new answer.
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery, searchResults]);

  // Keep the highlighted row in view when the arrow keys move it.
  const activeKey = rows[selectedIndex]?.key;
  useEffect(() => {
    if (activeKey) document.getElementById(`search-${activeKey}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeKey]);

  if (!isOpen) return null;

  // An answer for what is typed now, not the one kept from the letters before.
  const settled = hasQuery && !isFetching && query.trim() === debouncedQuery;
  const showNoResults = settled && rows.length === 0;
  const showRecent = !query && recentSearches.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div aria-hidden="true" className="fixed inset-0 z-50 bg-bg/80" onClick={onClose} />

      {/* Modal */}
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-x-4 top-[12vh] z-50 mx-auto max-w-[600px]">
        <div
          // The field has no edge of its own: the panel it fills carries the focus ring for it.
          className="overflow-hidden rounded-xl border border-line-strong bg-bg has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent"
          onClick={(e) => e.stopPropagation()}>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Search className="h-5 w-5 flex-shrink-0 text-text-3" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={rows.length > 0}
              aria-controls="search-results"
              aria-autocomplete="list"
              aria-activedescendant={activeKey ? `search-${activeKey}` : undefined}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Company, plant, career or skill"
              aria-label="Company, plant, career or skill"
              className="min-w-0 flex-1 bg-transparent text-base text-text-1 placeholder:text-text-3"
              style={{ outline: 'none', border: 'none', boxShadow: 'none', WebkitAppearance: 'none' }}
            />
            {isFetching && hasQuery && <Loader2 className="h-4 w-4 animate-spin text-text-3" aria-hidden="true" />}
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="-my-2 flex h-11 w-9 items-center justify-center text-text-3 transition-colors hover:text-text-1"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <kbd className="hidden items-center gap-0.5 rounded border border-line bg-surface px-1.5 py-0.5 text-xs text-text-3 sm:flex">esc</kbd>
          </div>

          {/* What was searched for before, until something is typed */}
          {showRecent && (
            <div className="border-t border-line px-2 py-2">
              <div className="flex items-center justify-between px-2 pb-1">
                <h4 className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-2">Recent</h4>
                <button type="button" onClick={clearRecentSearches} className="-my-2 flex h-9 items-center text-xs text-text-2 transition-colors hover:text-text-1">
                  Clear
                </button>
              </div>
              <ul>
                {recentSearches.map((search) => (
                  <li key={search} className="group flex items-center rounded-lg hover:bg-surface-hover">
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(search);
                        inputRef.current?.focus();
                      }}
                      className="min-h-11 min-w-0 flex-1 truncate px-2 text-left text-sm text-text-1 sm:min-h-9"
                    >
                      {search}
                    </button>
                    <button
                      type="button"
                      aria-label={`Forget “${search}”`}
                      onClick={() => removeRecentSearch(search)}
                      className="flex h-11 w-10 shrink-0 items-center justify-center text-text-3 transition-colors hover:text-text-1 sm:h-9"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Results */}
          <div
            id="search-results"
            role="listbox"
            aria-label="Search results"
            hidden={rows.length === 0}
            className="max-h-[min(60vh,32rem)] overflow-y-auto border-t border-line"
          >
            <div className="py-1.5">
              {groups.map((group) => (
                <div key={group.id} role="group" aria-labelledby={`search-group-${group.id}`} className="px-2 py-1.5">
                  <div id={`search-group-${group.id}`} role="presentation" className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-text-2">
                    {groupHeading(group.id)}
                  </div>
                  {group.rows.map((row) => {
                    const index = rows.indexOf(row);
                    const active = index === selectedIndex;
                    return (
                      <div
                        key={row.key}
                        id={`search-${row.key}`}
                        role="option"
                        aria-selected={active}
                        // Keep the field focused: the pointer chooses, it does not move focus.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => chooseRow(row)}
                        onMouseMove={() => {
                          if (!active) setSelectedIndex(index);
                        }}
                        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 sm:min-h-0 ${active ? 'bg-surface-hover' : ''}`}
                      >
                        {row.kind === 'company' && <CompanyLogo name={row.title} domain={row.domain} size={24} className="rounded" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-text-1">{row.title}</span>
                          {row.subtitle && <span className="block truncate text-xs text-text-3">{row.subtitle}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Said, not only shown: a screen reader hears how the search came out. */}
          <p role="status" className={showNoResults ? 'border-t border-line px-4 py-3 text-sm text-text-2' : 'sr-only'}>
            {showNoResults ? noResults(debouncedQuery) : settled ? `${rows.length} ${rows.length === 1 ? 'result' : 'results'}.` : ''}
          </p>
        </div>
      </div>
    </>
  );
}
