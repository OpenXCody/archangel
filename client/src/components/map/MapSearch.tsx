import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  X,
  Building2,
  Factory,
  Briefcase,
  Wrench,
  MapPin,
  Loader2,
  Filter,
} from 'lucide-react';
import {
  searchApi,
  type SearchEntityType,
  type SearchResultItem,
} from '../../lib/api';
import { useMapStore, type MapEntityType } from '../../stores/mapStore';
import { US_STATES } from '@shared/states';

// Map search entity type to map entity type
const searchToMapType: Record<Exclude<SearchEntityType, 'states'>, MapEntityType> = {
  companies: 'company',
  factories: 'factory',
  occupations: 'occupation',
  skills: 'skill',
};

const ENTITY_CONFIG: Record<
  SearchEntityType,
  { icon: React.ElementType; label: string; iconClass: string }
> = {
  companies: { icon: Building2, label: 'Company', iconClass: 'text-amber-500' },
  factories: { icon: Factory, label: 'Factory', iconClass: 'text-sky-400' },
  occupations: { icon: Briefcase, label: 'Occupation', iconClass: 'text-blue-800' },
  skills: { icon: Wrench, label: 'Skill', iconClass: 'text-emerald-500' },
  states: { icon: MapPin, label: 'State', iconClass: 'text-indigo-500' },
};

export default function MapSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const stateInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // State search
  const [stateQuery, setStateQuery] = useState('');
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);

  const { selectEntity, selectFactory, filters, setFilters } = useMapStore();

  // Filter states based on search query
  const filteredStates = useMemo(() => {
    if (!stateQuery.trim()) return US_STATES;
    const q = stateQuery.toLowerCase();
    return US_STATES.filter(
      s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [stateQuery]);

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Search query
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['map-search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery, { limit: 5 }),
    enabled: debouncedQuery.length >= 1,
    staleTime: 30000,
  });

  // Flatten results for keyboard navigation
  const flatResults = useCallback((): SearchResultItem[] => {
    if (!searchResults) return [];
    const order: SearchEntityType[] = ['states', 'factories', 'companies', 'occupations', 'skills'];
    return order.flatMap((type) => searchResults.results[type]?.items || []);
  }, [searchResults]);

  // Navigate to result - stay on map
  const navigateToResult = useCallback(
    (item: SearchResultItem) => {
      if (item.type === 'states') {
        // For states, add to the states filter
        const currentStates = filters.states;
        if (!currentStates.includes(item.id)) {
          setFilters({ states: [...currentStates, item.id] });
        }
        setQuery('');
        setIsFocused(false);
        return;
      }

      // If it's a company, also set the company filter to show only their factories
      if (item.type === 'companies') {
        setFilters({ company: item.id, companyName: item.name });
      }

      const mapType = searchToMapType[item.type];
      if (mapType === 'factory') {
        selectFactory(item.id);
      } else {
        selectEntity(mapType, item.id);
      }
      setQuery('');
      setIsFocused(false);
    },
    [selectEntity, selectFactory, setFilters, filters.states]
  );

  // Handle keyboard navigation
  useEffect(() => {
    if (!isFocused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const results = flatResults();

      switch (e.key) {
        case 'Escape':
          setIsFocused(false);
          inputRef.current?.blur();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            navigateToResult(results[selectedIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, flatResults, selectedIndex, navigateToResult]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsFocused(false);
        setStateDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = flatResults();
  const hasQuery = debouncedQuery.length >= 1;
  const hasResults = results.length > 0;
  const showDropdown = isFocused && (hasQuery || showFilters);

  const activeFilterCount = filters.states.length + (filters.company ? 1 : 0) + (filters.industry ? 1 : 0);

  const removeState = (stateCode: string) => {
    setFilters({ states: filters.states.filter(s => s !== stateCode) });
  };

  const addState = (stateCode: string) => {
    if (!filters.states.includes(stateCode)) {
      setFilters({ states: [...filters.states, stateCode] });
    }
    setStateQuery('');
    setStateDropdownOpen(false);
  };

  const clearFilter = (key: 'company' | 'industry') => {
    if (key === 'company') {
      setFilters({ company: null, companyName: null });
    } else {
      setFilters({ [key]: null });
    }
  };

  const clearAllFilters = () => {
    setFilters({ states: [], company: null, companyName: null, industry: null });
  };

  return (
    <div className="absolute top-4 left-4 z-40" ref={dropdownRef}>
      {/* Search container */}
      <div
        className={`
          bg-bg-surface/95 backdrop-blur-md
          border border-white/10
          transition-all duration-200
          ${showDropdown ? 'rounded-2xl' : 'rounded-xl'}
          ${isFocused ? 'ring-1 ring-sky-400/50' : ''}
        `}
        style={{ width: '360px' }}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Search className="w-5 h-5 text-fg-soft flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setStateDropdownOpen(false); // Close state dropdown when typing
            }}
            onFocus={() => {
              setIsFocused(true);
              setStateDropdownOpen(false); // Close state dropdown when focusing search
            }}
            placeholder="Search factories, companies, skills..."
            className="
              flex-1 bg-transparent text-fg-default
              placeholder:text-fg-soft
              text-sm
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
              onClick={() => setQuery('')}
              className="p-1 text-fg-soft hover:text-fg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`
              flex items-center gap-1 px-2 py-1 rounded-lg text-xs
              transition-colors
              ${showFilters || activeFilterCount > 0
                ? filters.company
                  ? 'bg-amber-500/10 text-amber-400' // Company filter = amber
                  : filters.states.length > 0
                    ? 'bg-indigo-500/10 text-indigo-400' // State filter = indigo
                    : 'bg-sky-400/10 text-sky-400' // Default
                : 'text-fg-soft hover:text-fg-muted hover:bg-white/5'
              }
            `}
          >
            <Filter className="w-3.5 h-3.5" />
            {activeFilterCount > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                filters.company
                  ? 'bg-amber-500/20'
                  : filters.states.length > 0
                    ? 'bg-indigo-500/20'
                    : 'bg-sky-400/20'
              }`}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="px-4 pb-3 border-t border-white/5">
            <div className="pt-3 space-y-3">
              {/* State multi-select search */}
              <div>
                <label className="text-xs text-fg-soft uppercase tracking-wider mb-1.5 block">
                  Filter by States
                </label>
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <input
                      ref={stateInputRef}
                      type="text"
                      value={stateQuery}
                      onChange={(e) => {
                        setStateQuery(e.target.value);
                        setStateDropdownOpen(true);
                      }}
                      onFocus={() => setStateDropdownOpen(true)}
                      placeholder="Search states..."
                      className="
                        flex-1
                        px-3 py-2 rounded-lg text-sm
                        bg-white/5 border border-white/10
                        text-fg-default placeholder:text-fg-soft
                        focus:outline-none focus:border-indigo-400/50
                      "
                    />
                  </div>

                  {/* State dropdown */}
                  {stateDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-bg-surface border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50">
                      {filteredStates.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-fg-soft">No states found</div>
                      ) : (
                        filteredStates.map(state => {
                          const isSelected = filters.states.includes(state.code);
                          return (
                            <button
                              key={state.code}
                              onClick={() => addState(state.code)}
                              disabled={isSelected}
                              className={`
                                w-full px-3 py-2 text-left text-sm flex items-center justify-between
                                ${isSelected
                                  ? 'bg-indigo-500/10 text-indigo-400 cursor-default'
                                  : 'hover:bg-white/5 text-fg-default'
                                }
                              `}
                            >
                              <span>{state.name}</span>
                              <span className="text-xs text-fg-soft">{state.code}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Selected states pills */}
                {filters.states.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {filters.states.map(stateCode => {
                      const stateName = US_STATES.find(s => s.code === stateCode)?.name || stateCode;
                      return (
                        <button
                          key={stateCode}
                          onClick={() => removeState(stateCode)}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                        >
                          {stateName}
                          <X className="w-3 h-3" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Active company/industry filters */}
              {(filters.company || filters.industry) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                  {filters.company && (
                    <button
                      onClick={() => clearFilter('company')}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                    >
                      <Building2 className="w-3 h-3" />
                      {filters.companyName || 'Company'}
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {filters.industry && (
                    <button
                      onClick={() => clearFilter('industry')}
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                    >
                      {filters.industry}
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Clear all button */}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="w-full px-3 py-2 rounded-lg text-xs text-fg-soft hover:text-fg-muted hover:bg-white/5 transition-colors border border-white/5"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search results dropdown */}
        {showDropdown && hasQuery && (
          <div className="border-t border-white/5 max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-6 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-fg-soft animate-spin" />
              </div>
            ) : hasResults ? (
              <div className="py-2">
                {(['states', 'factories', 'companies', 'occupations', 'skills'] as SearchEntityType[]).map((type) => {
                  const items = searchResults?.results[type]?.items || [];
                  if (items.length === 0) return null;

                  const config = ENTITY_CONFIG[type];
                  const Icon = config.icon;

                  return (
                    <div key={type} className="px-3 py-2">
                      <h4 className="text-[10px] font-medium text-fg-soft uppercase tracking-wider mb-1.5 px-1">
                        {type}
                      </h4>
                      <div className="space-y-0.5">
                        {items.map((item) => {
                          const globalIndex = results.findIndex(
                            (r) => r.id === item.id && r.type === item.type
                          );
                          const isSelected = globalIndex === selectedIndex;

                          return (
                            <button
                              key={`${item.type}-${item.id}`}
                              className={`
                                flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left
                                ${isSelected ? 'bg-white/10' : 'hover:bg-white/5'}
                                transition-colors
                              `}
                              onClick={() => navigateToResult(item)}
                              onMouseEnter={() => setSelectedIndex(globalIndex)}
                            >
                              <Icon className={`w-4 h-4 flex-shrink-0 ${config.iconClass}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-fg-default truncate">{item.name}</p>
                                {item.subtitle && (
                                  <p className="text-xs text-fg-soft truncate">{item.subtitle}</p>
                                )}
                              </div>
                              {item.meta && (
                                <span className="text-xs text-fg-soft flex-shrink-0">
                                  {item.meta}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-fg-muted">No results for "{debouncedQuery}"</p>
                <p className="text-xs text-fg-soft mt-1">Try a different search term</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
