import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Map from '../components/map/Map';
import MapDetailPanel from '../components/map/MapDetailPanel';
import MapSearch from '../components/map/MapSearch';
import MapContextMenu from '../components/map/MapContextMenu';
import MapHoverCard from '../components/map/MapHoverCard';
import { useMapStore, placeKey, type MapAddress, type MapPlace } from '../stores/mapStore';
import { PHONE_LAYOUT_QUERY } from '../components/map/camera';
import { useSelection } from '../components/map/selection';
import { useTheme } from '../lib/theme';
import { focusArea, type Bounds } from '@shared/scope';
import { US_STATES } from '@shared/states';

// Custom hook for responsive detection
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

// ─── The map in the address ────────────────────────────────────────────────
//
// What is selected, the map's subject and the industry filter live in the
// query string, so a view can be linked, survives a reload, and Back walks
// through what was looked at:
//
//   ?factory=<id>  ?state=TX  ?area=austin  ?skill=<id>     what the panel shows
//   ?place=Round+Rock&in=Williamson+County,+TX&box=w_s_e_n   a place found by search
//   ?company=<id or slug>  ?career=<id>                      the map's subject
//   ?industry=<name>                                         the industry filter
//
// The camera lives in the fragment (#zoom/lat/lng), written by replacing the
// current entry, so it never adds history.

const ADDRESS_KEYS = ['factory', 'state', 'area', 'skill', 'place', 'in', 'box', 'company', 'career', 'industry'] as const;

const EMPTY_ADDRESS: MapAddress = {
  factory: null,
  state: null,
  area: null,
  skill: null,
  place: null,
  company: null,
  career: null,
  industry: null,
};

function parseBox(text: string | null): Bounds | null {
  if (!text) return null;
  const parts = text.split('_').map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  const [west, south, east, north] = parts;
  if (!(west < east && south < north && west >= -180 && east <= 180 && south >= -90 && north <= 90)) return null;
  return [[west, south], [east, north]];
}

/** Read the address. `problem` says, in one line, what it asked for that does not exist. */
function readAddress(params: URLSearchParams): { address: MapAddress; problem: string | null } {
  let problem: string | null = null;
  const text = (key: string): string | null => params.get(key)?.trim() || null;

  const stateParam = text('state');
  const stateCode = stateParam?.toUpperCase() ?? null;
  const state = stateCode && US_STATES.some((s) => s.code === stateCode) ? stateCode : null;
  if (stateParam && !state) problem = `No state “${stateParam}”.`;

  const areaParam = text('area');
  const area = areaParam && focusArea(areaParam) ? areaParam : null;
  if (areaParam && !area) problem = `No focus area “${areaParam}”.`;

  const placeName = text('place');
  const box = parseBox(text('box'));
  const place: MapPlace | null = placeName && box ? { name: placeName, context: text('in') ?? '', bounds: box } : null;
  if (placeName && !place) problem = 'That place was not found.';

  // One subject at a time: a company, or else a career.
  const company = text('company');
  return {
    address: {
      factory: text('factory'),
      state,
      area,
      skill: text('skill'),
      place,
      company,
      career: company ? null : text('career'),
      industry: text('industry'),
    },
    problem,
  };
}

/** The address the store's state stands for. */
function addressOf(state: ReturnType<typeof useMapStore.getState>): MapAddress {
  const selected = (type: string): string | null => (state.selectedEntityType === type ? state.selectedEntityId : null);
  return {
    factory: selected('factory'),
    state: selected('state'),
    area: selected('area'),
    skill: selected('skill'),
    place: state.selectedEntityType === 'place' ? state.selectedPlace : null,
    company: state.filters.company,
    career: state.filters.career,
    industry: state.filters.industry,
  };
}

/** Two addresses with the same key say the same thing. */
function addressKey(address: MapAddress): string {
  return [
    address.factory,
    address.state,
    address.area,
    address.skill,
    address.place ? placeKey(address.place) : null,
    address.company,
    address.career,
    address.industry,
  ]
    .map((part) => part ?? '')
    .join('\n');
}

/** The query string for an address. Parameters that are not the map's are kept. */
function toSearch(address: MapAddress, current: string): string {
  const params = new URLSearchParams(current);
  for (const key of ADDRESS_KEYS) params.delete(key);
  const set = (key: string, value: string | null) => {
    if (value) params.set(key, value);
  };
  set('factory', address.factory);
  set('state', address.factory ? null : address.state);
  set('area', address.factory ? null : address.area);
  set('skill', address.skill);
  if (address.place) {
    set('place', address.place.name);
    set('in', address.place.context || null);
    set('box', address.place.bounds.flat().map((n) => String(Math.round(n * 1e4) / 1e4)).join('_'));
  }
  set('company', address.company);
  set('career', address.career);
  set('industry', address.industry);
  const search = params.toString();
  return search ? `?${search}` : '';
}

export default function MapView() {
  const location = useLocation();
  const navigate = useNavigate();
  // Same breakpoint the camera uses to decide between panel and sheet.
  const isMobile = useMediaQuery(PHONE_LAYOUT_QUERY);
  const theme = useTheme();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const sidebarOpen = useMapStore((s) => s.sidebarOpen);
  const subjectName = useMapStore((s) => s.filters.companyName ?? s.filters.careerTitle);
  const storeKey = useMapStore((s) => addressKey(addressOf(s)));
  const notice = useMapStore((s) => s.notice);

  const fromUrl = useMemo(() => readAddress(new URLSearchParams(location.search)), [location.search]);
  const urlKey = addressKey(fromUrl.address);

  // Address → map. A link, a reload, Back and Forward all arrive here. What
  // the address names that does not exist is said in one line beside the
  // search, the country is shown, and the bad part is taken out of the address.
  useEffect(() => {
    const live = useMapStore.getState();
    if (addressKey(addressOf(live)) !== urlKey) live.restoreAddress(fromUrl.address);
    if (fromUrl.problem) {
      useMapStore.getState().notFound(fromUrl.problem);
      navigate({ search: toSearch(EMPTY_ADDRESS, location.search), hash: '' }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey, fromUrl.problem]);

  // Map → address. A new selection or subject is a new entry, so Back
  // returns to the last one. Something a link named that turned out not to
  // exist replaces its entry instead: Back must not return to a dead link.
  const lastNotice = useRef<string | null>(null);
  useEffect(() => {
    // Read the live store, not this render's snapshot: on first mount the
    // effect above has just restored the store from the address.
    const live = useMapStore.getState();
    const dead = live.notice !== null && live.notice !== lastNotice.current;
    lastNotice.current = live.notice;
    const address = addressOf(live);
    if (addressKey(address) === urlKey) return;
    navigate({ search: toSearch(address, location.search), hash: dead ? '' : window.location.hash }, { replace: dead });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey, notice]);

  // The camera, once it has come to rest. Replaces the entry: moving the map
  // is not something Back should undo one drag at a time.
  const onViewChange = useCallback(
    (hash: string) => {
      if (window.location.pathname !== '/map' || hash === window.location.hash) return;
      navigate({ search: window.location.search, hash }, { replace: true });
    },
    [navigate]
  );

  // The tab names what is selected, or else what the map is showing.
  const selection = useSelection();
  const title = `${selection.name ?? subjectName ?? 'Map'} · Archangel`;
  useEffect(() => {
    // After the layout's own effect, which names the tab "Map" on arrival.
    const timer = window.setTimeout(() => {
      document.title = title;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [title, location.key]);

  // Handle right-click on map
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const focusSearch = useCallback(() => {
    document.getElementById('map-search-input')?.focus();
  }, []);

  // Keyboard shortcut for search (/)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if already typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        focusSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusSearch]);

  return (
    <div
      className="relative w-full h-[calc(100dvh-57px)] overflow-hidden"
      onContextMenu={handleContextMenu}
    >
      {/* Search first, so it is the first thing the Tab key reaches: the way
          into the map for anyone not using a pointer. It floats over the
          canvas, which is drawn after it. */}
      <MapSearch />

      {/* Map canvas */}
      {/* Keyed on the theme: the basemap and the palette are chosen when the map is created. */}
      <Map key={theme} onViewChange={onViewChange} />

      {/* Hover preview for pins (pointer devices only) */}
      {!isMobile && <MapHoverCard />}

      {/* Detail panel - slides in from right (desktop) or bottom (mobile) */}
      {sidebarOpen && <MapDetailPanel isMobile={isMobile} />}

      {/* Context menu */}
      {contextMenu && (
        <MapContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onSearch={focusSearch}
        />
      )}
    </div>
  );
}
