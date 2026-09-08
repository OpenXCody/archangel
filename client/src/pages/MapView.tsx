import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Map from '../components/map/Map';
import MapDetailPanel from '../components/map/MapDetailPanel';
import MapSearch from '../components/map/MapSearch';
import MapContextMenu from '../components/map/MapContextMenu';
import MapHoverCard from '../components/map/MapHoverCard';
import { useMapStore } from '../stores/mapStore';

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
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const {
    selectedEntityType,
    selectedEntityId,
    selectFactory,
    selectState,
    clearSelection,
    sidebarOpen,
  } = useMapStore();

  // URL ⇄ selection. Both factories and states live in the query string so a
  // selection is shareable and browser Back walks through what you looked at.
  const urlFactory = searchParams.get('factory');
  const urlState = searchParams.get('state')?.toUpperCase() ?? null;

  useEffect(() => {
    if (urlFactory) {
      if (selectedEntityType !== 'factory' || selectedEntityId !== urlFactory) selectFactory(urlFactory);
      return;
    }
    if (urlState) {
      if (selectedEntityType !== 'state' || selectedEntityId !== urlState) selectState(urlState);
      return;
    }
    if (selectedEntityType === 'factory' || selectedEntityType === 'state') clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFactory, urlState]);

  useEffect(() => {
    // Read the live store, not this render's snapshot: on first mount the
    // URL→store effect above has just selected the state, and the snapshot
    // would still say "nothing selected" and strip it back out of the URL.
    const live = useMapStore.getState();
    const wantFactory = live.selectedEntityType === 'factory' ? live.selectedEntityId : null;
    const wantState = live.selectedEntityType === 'state' ? live.selectedEntityId : null;
    if ((urlFactory ?? null) === wantFactory && (urlState ?? null) === wantState) return;
    const params = new URLSearchParams(searchParams);
    if (wantFactory) params.set('factory', wantFactory); else params.delete('factory');
    if (wantState) params.set('state', wantState); else params.delete('state');
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
      className="relative w-full h-[calc(100vh-56px)] overflow-hidden"
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
