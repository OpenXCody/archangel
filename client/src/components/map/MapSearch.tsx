import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
  useId,
  type KeyboardEvent,
  type ElementType,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  X,
  Building2,
  Factory,
  Briefcase,
  Wrench,
  MapPin,
  MapPinned,
  Navigation,
  Loader2,
  Filter,
  Check,
} from 'lucide-react';
import { exploreApi, searchApi, type SearchResultItem } from '../../lib/api';
import { placeSearchAvailable, searchPlaces, type Place } from '../../lib/geocode';
import { useMapStore, type MapPlace } from '../../stores/mapStore';
import { US_STATES } from '@shared/states';
import { FOCUS_AREAS, type Bounds, type FocusArea } from '@shared/scope';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { industryLabel } from '@shared/industry';
import { readStored, writeStored } from '../../lib/storage';

/** The sentence a first visit is given, once. */
// client/index.html carries the same sentence as the page's description.
const INTRODUCTION = 'Plants, careers and the skills they take, across US manufacturing.';
/** Set in this browser once the map has been used, so the introduction is not said again. */
const SEEN_KEY = 'archangel.map.seen';
/** Storage can be unavailable (private mode): then the introduction is said once per page load. */
let seenThisLoad = false;

function seenBefore(): boolean {
  return seenThisLoad || readStored(SEEN_KEY) !== null;
}

function markSeen(): void {
  seenThisLoad = true;
  writeStored(SEEN_KEY, '1');
}

type GroupId = 'regions' | 'companies' | 'occupations' | 'factories' | 'skills' | 'places';

const GROUPS: Record<GroupId, { icon: ElementType; heading: string }> = {
  regions: { icon: MapPin, heading: 'States and areas' },
  companies: { icon: Building2, heading: 'Companies' },
  occupations: { icon: Briefcase, heading: 'Careers' },
  factories: { icon: Factory, heading: 'Plants' },
  skills: { icon: Wrench, heading: 'Skills' },
  places: { icon: Navigation, heading: 'Places' },
};

/**
 * The order groups fall back to when their best matches are equally good.
 * What we hold comes first, in the order a person is likeliest to mean it;
 * places from the geocoder always come last, whatever they match.
 */
const OWN_GROUPS: Exclude<GroupId, 'places'>[] = ['regions', 'companies', 'occupations', 'factories', 'skills'];

/** One row of the results. */
type ResultRow = { key: string; title: string; subtitle?: string; score: number } & (
  | { kind: 'area'; area: FocusArea }
  | { kind: 'state'; code: string }
  | { kind: 'company' | 'occupation' | 'factory' | 'skill'; id: string }
  | { kind: 'place'; place: Place }
);

const STATE_NAME: Record<string, string> = Object.fromEntries(US_STATES.map((s) => [s.code, s.name]));

/** A name as it is said: "Tesla Inc." is "tesla", "Austin, TX" is "austin". */
function spoken(name: string): string {
  return name
    .replace(/,.*$/, '')
    .replace(/\s+(inc|incorporated|corp|corporation|co|company|llc|ltd|lp|plc)\.?$/i, '')
    .trim();
}

/** How well a name answers what was typed: 4 it is the name, 3 it starts it, 2 it starts a word, 1 it is inside. */
function matchScore(name: string, query: string): number {
  const n = name.toLowerCase();
  if (n === query || spoken(n) === query) return 4;
  if (n.startsWith(query)) return 3;
  if (n.split(/[\s,./&()-]+/).some((word) => word.startsWith(query))) return 2;
  if (n.includes(query)) return 1;
  return 0;
}

/** A box about three miles across around a point, for a place that is only a point (a street address). */
function boxAround([lng, lat]: [number, number]): Bounds {
  const dLat = 0.022;
  const dLng = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return [[lng - dLng, lat - dLat], [lng + dLng, lat + dLat]];
}

function toMapPlace(place: Place): MapPlace {
  return { name: place.name, context: place.context, bounds: place.bounds ?? boxAround(place.center) };
}

/** A chip under the search box: one or two buttons on one pill. */
function Chip({
  label,
  icon: Icon,
  pressed,
  title,
  onPress,
  onRemove,
  removeLabel,
}: {
  label: string;
  icon?: ElementType;
  pressed?: boolean;
  title?: string;
  onPress?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span className="map-chip text-xs font-medium">
      <span className="map-overlay map-chip-surface" aria-hidden="true" />
      <button
        type="button"
        onClick={onPress}
        aria-pressed={pressed}
        title={title}
        className={`max-w-[220px] gap-1.5 rounded-full pl-3 ${onRemove ? 'pr-1' : 'pr-3'}`}
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel} title={removeLabel} className="map-chip-close rounded-full">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

/**
 * Under the search box, in one row that scrolls sideways: what the map is
 * showing right now, each with the one control that turns it off, then the
 * focus areas, which are somewhere to go.
 */
function Chips() {
  const filters = useMapStore((s) => s.filters);
  const setFilters = useMapStore((s) => s.setFilters);
  const endSubject = useMapStore((s) => s.endSubject);
  const openSubject = useMapStore((s) => s.openSubject);
  const selectArea = useMapStore((s) => s.selectArea);
  const activeAreaId = useMapStore((s) => (s.selectedEntityType === 'area' ? s.selectedEntityId : null));

  const subject = filters.company
    ? { icon: Building2, name: filters.companyName ?? 'Company' }
    : filters.career
      ? { icon: Briefcase, name: filters.careerTitle ?? 'Career' }
      : null;

  return (
    <div className="map-chip-row">
      {(subject || filters.industry || filters.states.length > 0) && (
        <div role="group" aria-label="Showing on the map" className="flex gap-2">
          {subject && (
            <Chip
              icon={subject.icon}
              label={subject.name}
              pressed
              title={`Showing ${subject.name}`}
              onPress={openSubject}
              onRemove={endSubject}
              removeLabel={`Stop showing ${subject.name}`}
            />
          )}
          {filters.industry && (
            <Chip
              label={industryLabel(filters.industry)}
              pressed
              title={`Only ${industryLabel(filters.industry)} plants`}
              onRemove={() => setFilters({ industry: null })}
              removeLabel={`Show every industry, not only ${industryLabel(filters.industry)}`}
            />
          )}
          {filters.states.map((code) => (
            <Chip
              key={code}
              label={STATE_NAME[code] ?? code}
              pressed
              title={`Only plants in ${STATE_NAME[code] ?? code}`}
              onRemove={() => setFilters({ states: filters.states.filter((s) => s !== code) })}
              removeLabel={`Stop limiting the map to ${STATE_NAME[code] ?? code}`}
            />
          ))}
        </div>
      )}
      <div role="group" aria-label="Focus areas" className="flex gap-2">
        {FOCUS_AREAS.map((area) => (
          <Chip
            key={area.id}
            label={area.name}
            pressed={area.id === activeAreaId}
            title={`Go to the ${area.name} focus area`}
            onPress={() => selectArea(area.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The filter panel: which plants are drawn at all. States (any number) and
 * one industry. Both are applied to pins the map already holds.
 */
function Filters({ id }: { id: string }) {
  const filters = useMapStore((s) => s.filters);
  const setFilters = useMapStore((s) => s.setFilters);
  const [stateQuery, setStateQuery] = useState('');

  // The industries plants are filed under, from the same list Explore filters by.
  const { data: facets } = useQuery({
    queryKey: ['explore-facets'],
    queryFn: () => exploreApi.facets(),
    staleTime: 10 * 60_000,
  });
  const industries = facets?.factoryIndustries ?? [];

  const q = stateQuery.trim().toLowerCase();
  const matchingStates = q
    ? US_STATES.filter((s) => s.name.toLowerCase().startsWith(q) || s.code.toLowerCase() === q).slice(0, 6)
    : [];

  const toggleState = (code: string) => {
    const has = filters.states.includes(code);
    setFilters({ states: has ? filters.states.filter((s) => s !== code) : [...filters.states, code] });
    setStateQuery('');
  };

  return (
    <div id={id} className="border-t border-border-strong px-2 pb-2 pt-3">
      <div role="group" aria-labelledby={`${id}-industry`}>
        <h4 id={`${id}-industry`} className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          Industry
        </h4>
        <div className="max-h-[min(304px,36vh)] overflow-y-auto">
          {industries.map((industry) => {
            const chosen = filters.industry === industry;
            return (
              <button
                key={industry}
                type="button"
                aria-pressed={chosen}
                onClick={() => setFilters({ industry: chosen ? null : industry })}
                className={`map-row flex w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm transition-colors hover:bg-tint/5 ${
                  chosen ? 'text-fg-default' : 'text-fg-muted'
                }`}
              >
                <span className="min-w-0 truncate">{industryLabel(industry)}</span>
                {chosen && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
          {facets && industries.length === 0 && <p className="px-2 py-2 text-sm text-fg-muted">No industries listed.</p>}
        </div>
      </div>

      <div role="group" aria-labelledby={`${id}-states`} className="mt-3 border-t border-border-subtle pt-3">
        <h4 id={`${id}-states`} className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          States
        </h4>
        <input
          type="text"
          value={stateQuery}
          onChange={(e) => setStateQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matchingStates[0]) toggleState(matchingStates[0].code);
          }}
          placeholder="Add a state"
          aria-label="Add a state to the filter"
          className="map-field map-row w-full rounded-lg border border-border-strong bg-bg-base px-3 text-fg-default placeholder:text-fg-muted focus:outline-none focus-visible:border-fg-muted"
        />
        {matchingStates.length > 0 && (
          <div className="mt-1">
            {matchingStates.map((state) => {
              const chosen = filters.states.includes(state.code);
              return (
                <button
                  key={state.code}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => toggleState(state.code)}
                  className={`map-row flex w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm transition-colors hover:bg-tint/5 ${
                    chosen ? 'text-fg-default' : 'text-fg-muted'
                  }`}
                >
                  <span>{state.name}</span>
                  {chosen && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
        {q && matchingStates.length === 0 && <p className="px-2 pt-2 text-sm text-fg-muted">No state starts with “{stateQuery.trim()}”.</p>}
        {filters.states.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 px-1">
            {filters.states.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => toggleState(code)}
                aria-label={`Remove ${STATE_NAME[code] ?? code}`}
                className="map-row inline-flex items-center gap-1.5 rounded-full border border-border-strong px-3 text-xs text-fg-muted transition-colors hover:text-fg-default"
              >
                {STATE_NAME[code] ?? code}
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MapSearch() {
  const baseId = useId();
  const listId = `${baseId}-results`;
  const filtersId = `${baseId}-filters`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [introduce, setIntroduce] = useState(() => !seenBefore());

  const selectEntity = useMapStore((s) => s.selectEntity);
  const selectFactory = useMapStore((s) => s.selectFactory);
  const selectState = useMapStore((s) => s.selectState);
  const selectArea = useMapStore((s) => s.selectArea);
  const selectPlace = useMapStore((s) => s.selectPlace);
  const notice = useMapStore((s) => s.notice);
  const setNotice = useMapStore((s) => s.setNotice);
  const filtersActive = useMapStore((s) => s.filters.industry !== null || s.filters.states.length > 0);

  // The introduction and any notice are said until the person does something.
  // Whatever they do first (a tap on the map, a key, the wheel) ends the
  // introduction for good in this browser.
  const caption = notice ?? (introduce ? INTRODUCTION : null);
  useEffect(() => {
    if (!caption) return;
    // A notice raised by this very click or key press must outlive it.
    const armedAt = performance.now();
    const dismiss = () => {
      if (performance.now() - armedAt < 400) return;
      if (introduce) {
        markSeen();
        setIntroduce(false);
      }
      if (notice) setNotice(null);
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const name of events) window.addEventListener(name, dismiss, { capture: true, passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, dismiss, { capture: true });
    };
  }, [caption, introduce, notice, setNotice]);

  // Debounce the query: briefly for our own API, longer for the geocoder,
  // which is a metered third-party service.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const timer = setTimeout(() => setPlaceQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const hasQuery = debouncedQuery.length >= 2;

  // Our own data: only the kinds the map can act on. States and focus areas
  // are short fixed lists the client already has, so they need no request.
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['map-search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery, { limit: 5, types: ['companies', 'factories', 'occupations', 'skills'] }),
    enabled: hasQuery,
    staleTime: 30000,
  });

  // Places (towns, counties, ZIP codes, addresses). Only with a map key. The
  // query function takes the signal, so a lookup the user has typed past is
  // cancelled; a failed lookup just leaves the group out.
  const placesEnabled = placeSearchAvailable() && placeQuery.length >= 3;
  const { data: places, isFetching: placesLoading } = useQuery({
    queryKey: ['map-places', placeQuery],
    queryFn: ({ signal }) => searchPlaces(placeQuery, signal),
    enabled: placesEnabled,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // A town typed by its exact name ("round rock") is what was asked for, so
  // its place row leads the list. Places arrive a moment after our own
  // results, though, and must not move a list that is already being read:
  // they lead only if nobody has moved the highlight by then.
  const listTouched = useRef(false);
  const [placesMayLead, setPlacesMayLead] = useState(true);
  useLayoutEffect(() => {
    setPlacesMayLead(!listTouched.current);
  }, [places]);

  // Results by group. What we hold is ranked by how well it answers what was
  // typed, the best-matching group first. Places from the geocoder come
  // last, with the one exception above. Keyboard navigation walks the same
  // order, so the first row is what Enter takes.
  const groups = useMemo(() => {
    if (!hasQuery) return [];
    const q = debouncedQuery.toLowerCase();
    const own: Record<Exclude<GroupId, 'places'>, ResultRow[]> = {
      regions: [],
      companies: [],
      occupations: [],
      factories: [],
      skills: [],
    };

    for (const area of FOCUS_AREAS) {
      const score = matchScore(area.name, q);
      if (score > 0) own.regions.push({ kind: 'area', key: `area-${area.id}`, area, title: area.name, subtitle: `Focus area · ${area.description}`, score });
    }
    for (const state of US_STATES) {
      const score = state.code.toLowerCase() === q ? 4 : state.name.toLowerCase().startsWith(q) ? matchScore(state.name, q) : 0;
      if (score > 0) own.regions.push({ kind: 'state', key: `state-${state.code}`, code: state.code, title: state.name, subtitle: 'State', score });
    }

    const add = (group: 'companies' | 'occupations' | 'factories' | 'skills', item: SearchResultItem) => {
      const title =
        group === 'factories' ? formatFactoryName(item.name) : group === 'companies' ? formatCompanyName(item.name) : item.name;
      // A plant's row says where it is; the others carry their own line.
      const subtitle =
        group === 'factories'
          ? [item.subtitle, item.meta ? (STATE_NAME[item.meta] ?? item.meta) : undefined].filter(Boolean).join(' · ') || undefined
          : item.subtitle || undefined;
      const kind = group === 'companies' ? 'company' : group === 'occupations' ? 'occupation' : group === 'factories' ? 'factory' : 'skill';
      own[group].push({ kind, key: `${kind}-${item.id}`, id: item.id, title, subtitle, score: matchScore(title, q) });
    };
    for (const group of ['companies', 'occupations', 'factories', 'skills'] as const) {
      for (const item of searchResults?.results[group]?.items ?? []) add(group, item);
    }

    const ranked = OWN_GROUPS.map((id, order) => {
      // Stable: rows that match equally keep the order the server ranked them in.
      const rows = own[id].map((row, i) => ({ row, i })).sort((a, b) => b.row.score - a.row.score || a.i - b.i).map(({ row }) => row);
      return { id, rows: rows.slice(0, 5), best: rows[0]?.score ?? 0, order };
    })
      .filter((group) => group.rows.length > 0)
      .sort((a, b) => b.best - a.best || a.order - b.order)
      .map(({ id, rows }): { id: GroupId; rows: ResultRow[] } => ({ id, rows }));

    // Only places looked up for exactly what is typed now.
    const current = placesEnabled && placeQuery === debouncedQuery ? (places ?? []) : [];
    const placeRows: ResultRow[] = current.map((place) => ({
      kind: 'place',
      key: `place-${place.id}`,
      place,
      title: place.name,
      subtitle: place.context || undefined,
      score: matchScore(place.name, q),
    }));
    if (placeRows.length === 0) return ranked;
    const placeGroup = { id: 'places' as GroupId, rows: placeRows };
    const ownBest = Math.max(0, ...ranked.flatMap((group) => group.rows.map((row) => row.score)));
    const namedExactly = placeRows[0].score === 4 && ownBest < 4;
    return namedExactly && placesMayLead ? [placeGroup, ...ranked] : [...ranked, placeGroup];
  }, [hasQuery, debouncedQuery, searchResults, places, placesEnabled, placeQuery, placesMayLead]);
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

  const close = useCallback(() => {
    setQuery('');
    setIsFocused(false);
    setShowFilters(false);
    inputRef.current?.blur();
  }, []);

  // Act on a result. Everything stays on the map.
  const chooseRow = useCallback(
    (row: ResultRow) => {
      close();
      switch (row.kind) {
        case 'area':
          selectArea(row.area.id);
          return;
        case 'state':
          // Same as clicking the state on the map: frame it and open its overview.
          selectState(row.code);
          return;
        case 'place':
          // Frame the place and open what is there.
          selectPlace(toMapPlace(row.place));
          return;
        case 'factory':
          selectFactory(row.id);
          return;
        case 'company':
          // The company becomes the map's subject: its plants alone, framed.
          selectEntity('company', row.id, row.title);
          return;
        case 'occupation':
          // The career becomes the map's subject: where its work is done.
          selectEntity('occupation', row.id, row.title);
          return;
        case 'skill':
          selectEntity('skill', row.id);
          return;
      }
    },
    [close, selectArea, selectEntity, selectFactory, selectPlace, selectState]
  );

  const listOpen = isFocused && hasQuery;
  const stillSearching = searching || (placesEnabled && placesLoading);
  const activeRow = listOpen ? rows[selectedIndex] : undefined;
  const optionId = (row: ResultRow) => `${baseId}-${row.key}`;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Escape':
        // Escape clears and closes in one press.
        e.stopPropagation();
        close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        listTouched.current = true;
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(rows.length - 1, 0)));
        break;
      case 'ArrowUp':
        e.preventDefault();
        listTouched.current = true;
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Home':
        if (listOpen && rows.length > 0) {
          e.preventDefault();
          setSelectedIndex(0);
        }
        break;
      case 'End':
        if (listOpen && rows.length > 0) {
          e.preventDefault();
          setSelectedIndex(rows.length - 1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (activeRow) chooseRow(activeRow);
        break;
    }
  };

  // The highlight starts on the first row of every new answer. Places
  // arriving a moment later are added below and do not move it.
  const leadingGroup = groups[0]?.id;
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery, searchResults, leadingGroup]);
  useEffect(() => {
    listTouched.current = false;
  }, [debouncedQuery]);

  // Keep the highlighted row in view when the arrow keys move it.
  useEffect(() => {
    if (!activeRow) return;
    document.getElementById(`${baseId}-${activeRow.key}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeRow, baseId]);

  // Close when the pointer goes down anywhere else.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsFocused(false);
        setShowFilters(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const expanded = listOpen || showFilters;

  return (
    <div className="absolute left-4 right-4 top-4 z-40 sm:right-auto sm:w-[360px]" ref={rootRef}>
      <div className={`map-overlay ${expanded ? 'rounded-2xl' : 'rounded-xl'} ${isFocused ? 'ring-1 ring-tint/20' : ''}`}>
        {/* The field */}
        <div className="flex items-center gap-1 py-[5px] pl-4 pr-1.5 [@media(pointer:coarse)]:py-[3px]">
          <Search className="mr-2 h-5 w-5 shrink-0 text-fg-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            id="map-search-input"
            type="text"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeRow ? optionId(activeRow) : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowFilters(false);
            }}
            onFocus={() => setIsFocused(true)}
            onKeyDown={onKeyDown}
            placeholder="Place, company or career"
            aria-label="Search places, companies, plants, careers and skills"
            className="map-field min-w-0 flex-1 text-ellipsis bg-transparent text-fg-default placeholder:text-fg-muted"
            style={{ outline: 'none', border: 'none', boxShadow: 'none', WebkitAppearance: 'none' }}
          />
          {stillSearching && hasQuery && <Loader2 className="mx-1 h-4 w-4 shrink-0 animate-spin text-fg-muted" aria-hidden="true" />}
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="map-search-button flex shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:text-fg-default"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowFilters((open) => !open);
              setQuery('');
            }}
            aria-label="Filter plants by industry and state"
            title="Filter"
            aria-expanded={showFilters}
            aria-controls={filtersId}
            className={`map-search-button flex shrink-0 items-center justify-center rounded-lg transition-colors hover:text-fg-default ${
              showFilters ? 'bg-tint/10 text-fg-default' : filtersActive ? 'text-fg-default' : 'text-fg-muted'
            }`}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>

        {/* One line, when there is one to say: what this is (a first visit), or what a link asked for that is not here. */}
        {caption && !expanded && (
          <p role="status" className="-mt-1 px-4 pb-3 text-[13px] leading-snug text-fg-muted [text-wrap:balance]">
            {caption}
          </p>
        )}

        {showFilters && <Filters id={filtersId} />}

        {/* Results */}
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Search results"
          hidden={!listOpen || rows.length === 0}
          className="max-h-[min(460px,58vh)] overflow-y-auto border-t border-border-strong"
        >
          {listOpen && rows.length > 0 && (
            <div className="py-1.5">
              {groups.map((group) => {
                const config = GROUPS[group.id];
                const Icon = config.icon;
                const headingId = `${baseId}-group-${group.id}`;
                return (
                  <div key={group.id} role="group" aria-labelledby={headingId} className="px-2 py-1.5">
                    <div id={headingId} role="presentation" className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
                      {config.heading}
                    </div>
                    {group.rows.map((row) => {
                      const index = rows.indexOf(row);
                      const active = index === selectedIndex;
                      const RowIcon = row.kind === 'area' ? MapPinned : Icon;
                      return (
                        <div
                          key={row.key}
                          id={optionId(row)}
                          role="option"
                          aria-selected={active}
                          // Keep the field focused: the pointer chooses, it does not move focus.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => chooseRow(row)}
                          onMouseMove={() => {
                            listTouched.current = true;
                            if (!active) setSelectedIndex(index);
                          }}
                          className={`map-row flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 ${active ? 'bg-tint/10' : ''}`}
                        >
                          <RowIcon className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-fg-default">{row.title}</span>
                            {row.subtitle && <span className="block truncate text-xs text-fg-muted">{row.subtitle}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* Said, not only shown: a screen reader hears how the search came out. */}
        <p role="status" className={listOpen && rows.length === 0 && !stillSearching ? 'border-t border-border-strong px-4 py-3 text-sm text-fg-muted' : 'sr-only'}>
          {!listOpen ? '' : stillSearching && rows.length === 0 ? '' : rows.length === 0 ? `No results for “${debouncedQuery}”.` : `${rows.length} ${rows.length === 1 ? 'result' : 'results'}.`}
        </p>
      </div>

      {/* What the map is showing, and the focus areas: out of the way while results or filters are open */}
      {!expanded && <Chips />}
    </div>
  );
}
