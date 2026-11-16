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
  Navigation,
  Loader2,
  Filter,
} from 'lucide-react';
import { searchApi, type SearchResultItem } from '../../lib/api';
import { placeSearchAvailable, searchPlaces, type Place } from '../../lib/geocode';
import { useMapStore, type MapEntityType } from '../../stores/mapStore';
import { US_STATES } from '@shared/states';
import { FOCUS_AREAS } from '@shared/scope';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';

// Map-relevant entity types (refs, schools, programs are not map-related)
type MapSearchableEntityType = 'companies' | 'factories' | 'occupations' | 'skills' | 'states';
type ResultGroupId = MapSearchableEntityType | 'places';

// Map search entity type to map entity type
const searchToMapType: Record<Exclude<MapSearchableEntityType, 'states'>, MapEntityType> = {
  companies: 'company',
  factories: 'factory',
  occupations: 'occupation',
  skills: 'skill',
};

const GROUP_CONFIG: Record<ResultGroupId, { icon: React.ElementType; heading: string; iconClass: string }> = {
  states: { icon: MapPin, heading: 'States', iconClass: 'text-indigo-400' },
  places: { icon: Navigation, heading: 'Places', iconClass: 'text-fg-muted' },
  factories: { icon: Factory, heading: 'Factories', iconClass: 'text-sky-400' },
  companies: { icon: Building2, heading: 'Companies', iconClass: 'text-amber-500' },
  occupations: { icon: Briefcase, heading: 'Careers', iconClass: 'text-violet-400' },
  skills: { icon: Wrench, heading: 'Skills', iconClass: 'text-emerald-500' },
};

/** Somewhere to go first, then the things that are there. */
const GROUP_ORDER: ResultGroupId[] = ['states', 'places', 'factories', 'companies', 'occupations', 'skills'];

/** One row of the results list: something in our data, or a place on the map. */
type ResultRow =
  | { kind: 'entity'; key: string; item: SearchResultItem }
  | { kind: 'place'; key: string; place: Place };

/** The two-letter code of a state search result, which names the state and carries its code as the subtitle. */
function stateCodeOf(item: SearchResultItem): string | undefined {
  const subtitle = item.subtitle?.toUpperCase();
  return US_STATES.find((s) => s.code === subtitle || s.name === item.name)?.code;
}

/**
 * Focus areas: the regions being filled out in depth. One chip each, right
 * under the search box; choosing one does what clicking its label on the map
 * does. The row scrolls sideways rather than wrapping, so it stays one line
 * on a phone however many areas there are.
 */
function AreaChips() {
  const selectArea = useMapStore((s) => s.selectArea);
  const activeAreaId = useMapStore((s) => (s.selectedEntityType === 'area' ? s.selectedEntityId : null));

  return (
    <div role="group" aria-label="Focus areas" className="mt-2 flex gap-2 overflow-x-auto pb-1">
      {FOCUS_AREAS.map((area) => {
        const active = area.id === activeAreaId;
        return (
          <button
            key={area.id}
            type="button"
            onClick={() => selectArea(area.id)}
            aria-pressed={active}
            title={`Go to the ${area.name} focus area`}
            className={`map-overlay map-overlay-button inline-flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3 text-xs font-medium ${
              active ? 'border-sky-200/70' : ''
            }`}
          >
            {/* The same lit dot as the area's label on the map. */}
            <span className="h-[7px] w-[7px] rounded-full bg-sky-200 ring-[3px] ring-sky-300/30" aria-hidden="true" />
            {area.name}
          </button>
        );
      })}
    </div>
  );
}

export default function MapSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const stateInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // State search
  const [stateQuery, setStateQuery] = useState('');
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);

  const { selectEntity, selectFactory, selectState, flyTo, filters, setFilters } = useMapStore();

  // Filter states based on search query
  const filteredStates = useMemo(() => {
    if (!stateQuery.trim()) return US_STATES;
    const q = stateQuery.trim().toLowerCase();
    return US_STATES.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }, [stateQuery]);

  // Debounce the query: briefly for our own API, longer for the geocoder,
  // which is a metered third-party service.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const timer = setTimeout(() => setPlaceQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  // Search query
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['map-search', debouncedQuery],
    // Only the types the map can act on — skipping refs/schools/programs cuts the query fan-out by ~40%.
    queryFn: () => searchApi.search(debouncedQuery, { limit: 5, types: ['companies', 'factories', 'occupations', 'skills', 'states'] }),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000,
  });

  // Places (addresses, cities, counties). Only with a map key. The query
  // function takes the signal, so a lookup the user has typed past is
  // cancelled; a failed lookup just leaves the group out.
  const placesEnabled = placeSearchAvailable() && placeQuery.length >= 3;
  const { data: places, isFetching: placesLoading } = useQuery({
    queryKey: ['map-places', placeQuery],
    queryFn: ({ signal }) => searchPlaces(placeQuery, signal),
    enabled: placesEnabled,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const hasQuery = debouncedQuery.length >= 2;

  // Results by group, in display order; keyboard navigation walks the same order.
  const groups = useMemo(() => {
    if (!hasQuery) return [];
    return GROUP_ORDER.map((id) => {
      const rows: ResultRow[] =
        id === 'places'
          ? (placesEnabled ? places ?? [] : []).map((place) => ({ kind: 'place', key: `place-${place.id}`, place }))
          : (searchResults?.results[id]?.items ?? []).map((item) => ({
              kind: 'entity',
              key: `${item.type}-${item.id}`,
              item,
            }));
      return { id, rows };
    }).filter((group) => group.rows.length > 0);
  }, [hasQuery, searchResults, places, placesEnabled]);
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

  // Act on a result - stay on map
  const chooseRow = useCallback(
    (row: ResultRow) => {
      setQuery('');
      setIsFocused(false);
      inputRef.current?.blur();

      if (row.kind === 'place') {
        // Go there. The camera frames the place's extent, or closes in on a point.
        const { place } = row;
        flyTo(
          place.bounds
            ? { kind: 'bounds', bounds: place.bounds }
            : { kind: 'point', lng: place.center[0], lat: place.center[1], zoom: place.zoom }
        );
        return;
      }

      const { item } = row;
      if (item.type === 'states') {
        // Same as clicking the state on the map: frame it and open its overview.
        const code = stateCodeOf(item);
        if (code) selectState(code);
        return;
      }

      // If it's a company, also set the company filter to show only their factories
      if (item.type === 'companies') {
        setFilters({ company: item.id, companyName: formatCompanyName(item.name) });
      }

      const mapType = searchToMapType[item.type as Exclude<MapSearchableEntityType, 'states'>];
      if (mapType === 'factory') {
        selectFactory(item.id);
      } else {
        selectEntity(mapType, item.id);
      }
    },
    [selectEntity, selectFactory, selectState, flyTo, setFilters]
  );

  // Handle keyboard navigation
  useEffect(() => {
    if (!isFocused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          // Escape clears and closes in one press — the box is blurred after,
          // so there is no second keystroke to catch.
          setQuery('');
          setIsFocused(false);
          inputRef.current?.blur();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, rows.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (rows[selectedIndex]) {
            chooseRow(rows[selectedIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, rows, selectedIndex, chooseRow]);

  // Reset selection when the search changes. Places arriving a moment after
  // the first results must not move the highlight off what is being read.
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

  const hasResults = rows.length > 0;
  const stillSearching = isLoading || (placesEnabled && placesLoading);
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
    <div className="absolute top-4 left-4 right-4 z-40 sm:right-auto sm:w-[360px]" ref={dropdownRef}>
      {/* Search container */}
      <div
        className={`
          map-overlay
          transition-[border-radius] duration-200
          ${showDropdown ? 'rounded-2xl' : 'rounded-xl'}
          ${isFocused ? 'ring-1 ring-sky-400/60' : ''}
        `}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Search className="w-5 h-5 text-fg-muted flex-shrink-0" />
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
            placeholder="Search a place, factory, company..."
            aria-label="Search places, factories, companies, careers and skills"
            className="
              flex-1 min-w-0 text-ellipsis bg-transparent text-fg-default
              placeholder:text-fg-muted
              text-sm
            "
            style={{
              outline: 'none',
              border: 'none',
              boxShadow: 'none',
              WebkitAppearance: 'none',
            }}
          />
          {isLoading && <Loader2 className="w-4 h-4 text-fg-muted animate-spin" />}
          {query && !isLoading && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="p-1 text-fg-muted hover:text-fg-default transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-label="Filters"
            aria-expanded={showFilters}
            className={`
              flex items-center gap-1 px-2 py-1 rounded-lg text-xs
              transition-colors
              ${showFilters || activeFilterCount > 0
                ? filters.company
                  ? 'bg-amber-500/10 text-amber-400' // Company filter = amber
                  : filters.states.length > 0
                    ? 'bg-indigo-500/10 text-indigo-400' // State filter = indigo
                    : 'bg-sky-400/10 text-sky-400' // Default
                : 'text-fg-muted hover:text-fg-default hover:bg-white/5'
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
          <div className="px-4 pb-3 border-t border-border-strong">
            <div className="pt-3 space-y-3">
              {/* State multi-select search */}
              <div>
                <label className="text-xs text-fg-muted uppercase tracking-wider mb-1.5 block">
                  Filter by States
                </label>
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-indigo-400 flex-shrink-0" />
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
                        flex-1 min-w-0
                        px-3 py-2 rounded-lg text-sm
                        bg-bg-base border border-border-strong
                        text-fg-default placeholder:text-fg-muted
                        focus:outline-none focus:border-indigo-400/60
                      "
                    />
                  </div>

                  {/* State dropdown */}
                  {stateDropdownOpen && (
                    <div className="map-overlay absolute top-full left-0 right-0 mt-1 rounded-lg max-h-48 overflow-y-auto z-50">
                      {filteredStates.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-fg-muted">No states found</div>
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
                                  ? 'bg-indigo-500/10 text-indigo-300 cursor-default'
                                  : 'hover:bg-white/5 text-fg-default'
                                }
                              `}
                            >
                              <span>{state.name}</span>
                              <span className="text-xs text-fg-muted">{state.code}</span>
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
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20 transition-colors"
                        >
                          {stateName}
                          <X className="w-3 h-3" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Company filter — own labeled section, parallel to states */}
              {filters.company && (
                <div className="pt-3 border-t border-border-strong">
                  <label className="text-xs text-fg-muted uppercase tracking-wider mb-1.5 block">
                    Filter by Company
                  </label>
                  <button
                    onClick={() => clearFilter('company')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                  >
                    <Building2 className="w-3 h-3" />
                    {filters.companyName || 'Company'}
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Industry filter — own labeled section */}
              {filters.industry && (
                <div className="pt-3 border-t border-border-strong">
                  <label className="text-xs text-fg-muted uppercase tracking-wider mb-1.5 block">
                    Filter by Industry
                  </label>
                  <button
                    onClick={() => clearFilter('industry')}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                  >
                    {filters.industry}
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Clear all button */}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="w-full px-3 py-2 rounded-lg text-xs text-fg-muted hover:text-fg-default hover:bg-white/5 transition-colors border border-border-strong"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search results dropdown */}
        {showDropdown && hasQuery && (
          <div className="border-t border-border-strong max-h-[min(400px,55vh)] overflow-y-auto">
            {hasResults ? (
              <div className="py-2">
                {groups.map((group) => {
                  const config = GROUP_CONFIG[group.id];
                  const Icon = config.icon;

                  return (
                    <div key={group.id} className="px-3 py-2">
                      <h4 className="text-[10px] font-medium text-fg-muted uppercase tracking-wider mb-1.5 px-1">
                        {config.heading}
                      </h4>
                      <div className="space-y-0.5">
                        {group.rows.map((row) => {
                          const index = rows.indexOf(row);
                          const title =
                            row.kind === 'place'
                              ? row.place.name
                              : row.item.type === 'factories'
                                ? formatFactoryName(row.item.name)
                                : row.item.type === 'companies'
                                  ? formatCompanyName(row.item.name)
                                  : row.item.name;
                          const subtitle = row.kind === 'place' ? row.place.context : row.item.subtitle;
                          const meta = row.kind === 'place' ? undefined : row.item.meta;

                          return (
                            <button
                              key={row.key}
                              className={`
                                flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left
                                ${index === selectedIndex ? 'bg-white/10' : 'hover:bg-white/5'}
                                transition-colors
                              `}
                              onClick={() => chooseRow(row)}
                              onMouseEnter={() => setSelectedIndex(index)}
                            >
                              <Icon className={`w-4 h-4 flex-shrink-0 ${config.iconClass}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-fg-default truncate">{title}</p>
                                {subtitle && <p className="text-xs text-fg-muted truncate">{subtitle}</p>}
                              </div>
                              {meta && <span className="text-xs text-fg-muted flex-shrink-0">{meta}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : stillSearching ? (
              <div className="px-4 py-6 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-fg-muted animate-spin" />
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-fg-default">No results for "{debouncedQuery}"</p>
                <p className="text-xs text-fg-muted mt-1">Try a different search term</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Focus areas, out of the way while results or filters are open */}
      {!showDropdown && <AreaChips />}
    </div>
  );
}
