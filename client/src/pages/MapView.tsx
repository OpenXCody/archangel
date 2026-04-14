import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Map from '../components/map/Map';
import MapDetailPanel from '../components/map/MapDetailPanel';
import MapSearch from '../components/map/MapSearch';
import MapContextMenu from '../components/map/MapContextMenu';
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
    sidebarOpen,
  } = useMapStore();

  // For URL sync, only track factory selections
  const selectedFactoryId = selectedEntityType === 'factory' ? selectedEntityId : null;

  // Sync URL -> store on mount
  useEffect(() => {
    const factoryFromUrl = searchParams.get('factory');
    if (factoryFromUrl && factoryFromUrl !== selectedFactoryId) {
      selectFactory(factoryFromUrl);
    }
  }, []); // Only run on mount

  // Sync store -> URL on selection change
  useEffect(() => {
    const params = new URLSearchParams(searchParams);

    if (selectedFactoryId) {
      params.set('factory', selectedFactoryId);
    } else {
      params.delete('factory');
    }

    // Only update if different to avoid infinite loops
    const currentFactory = searchParams.get('factory');
    if (currentFactory !== selectedFactoryId) {
      setSearchParams(params, { replace: true });
    }
  }, [selectedFactoryId, searchParams, setSearchParams]);

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

      {/* Detail panel - slides in from right (desktop) or bottom (mobile) */}
      {sidebarOpen && <MapDetailPanel isMobile={isMobile} />}

      {/* Mobile drag handle indicator when panel is open */}
      {sidebarOpen && isMobile && (
        <div className="fixed bottom-[60vh] left-1/2 -translate-x-1/2 z-50 py-2">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
      )}

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
