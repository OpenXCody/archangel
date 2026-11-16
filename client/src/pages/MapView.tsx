import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Map from '../components/map/Map';
import MapDetailPanel from '../components/map/MapDetailPanel';
import MapSearch from '../components/map/MapSearch';
import MapContextMenu from '../components/map/MapContextMenu';
import MapHoverCard from '../components/map/MapHoverCard';
import { useMapStore } from '../stores/mapStore';
import { PHONE_LAYOUT_QUERY } from '../components/map/camera';
import { focusArea } from '@shared/scope';
import { US_STATES } from '@shared/states';

// Custom hook for responsive detection
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);

  return matches;
}

export default function MapView() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Same breakpoint the camera uses to decide between panel and sheet.
  const isMobile = useMediaQuery(PHONE_LAYOUT_QUERY);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const {
    selectedEntityType,
    selectedEntityId,
    selectFactory,
    selectState,
    selectArea,
    clearSelection,
    sidebarOpen,
  } = useMapStore();

  // URL ⇄ selection. Factories, focus areas and states live in the query
  // string so a selection is shareable and browser Back walks through what
  // you looked at. An id we do not know is ignored.
  const urlFactory = searchParams.get('factory');
  const urlAreaParam = searchParams.get('area');
  const urlArea = urlAreaParam && focusArea(urlAreaParam) ? urlAreaParam : null;
  const urlStateParam = searchParams.get('state')?.toUpperCase() ?? null;
  const urlState = US_STATES.some((s) => s.code === urlStateParam) ? urlStateParam : null;

  useEffect(() => {
    if (urlFactory) {
      if (selectedEntityType !== 'factory' || selectedEntityId !== urlFactory) selectFactory(urlFactory);
      return;
    }
    if (urlArea) {
      if (selectedEntityType !== 'area' || selectedEntityId !== urlArea) selectArea(urlArea);
      return;
    }
    if (urlState) {
      if (selectedEntityType !== 'state' || selectedEntityId !== urlState) selectState(urlState);
      return;
    }
    if (selectedEntityType === 'factory' || selectedEntityType === 'area' || selectedEntityType === 'state') {
      clearSelection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFactory, urlArea, urlState]);

  useEffect(() => {
    // Read the live store, not this render's snapshot: on first mount the
    // URL→store effect above has just made the selection, and the snapshot
    // would still say "nothing selected" and strip it back out of the URL.
    const live = useMapStore.getState();
    const want = (type: typeof live.selectedEntityType) =>
      live.selectedEntityType === type ? live.selectedEntityId : null;
    const wanted = { factory: want('factory'), area: want('area'), state: want('state') };
    if (urlFactory === wanted.factory && urlArea === wanted.area && urlState === wanted.state) return;
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(wanted)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setSearchParams(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntityType, selectedEntityId]);

  // Handle right-click on map
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Focus search input
  const focusSearch = useCallback(() => {
    // Find and focus the search input
    const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
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
      {/* Map canvas */}
      <Map />

      {/* Map search with filters */}
      <MapSearch />

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
