import { useEffect, useRef } from 'react';
import { Maximize2, Search, FilterX } from 'lucide-react';
import { useMapStore } from '../../stores/mapStore';

interface MapContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onSearch: () => void;
}

export default function MapContextMenu({ x, y, onClose, onSearch }: MapContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { resetView, clearFilters, filters } = useMapStore();

  // Anything narrowing what the map shows: a filter, or a company or career as its subject.
  const hasActiveFilters =
    filters.states.length > 0 ||
    filters.company !== null ||
    filters.career !== null ||
    filters.industry !== null;

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Small delay to prevent immediate close from the right-click event
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  const adjustedPosition = {
    x: Math.min(x, window.innerWidth - 200),
    y: Math.min(y, window.innerHeight - 150),
  };

  const handleResetView = () => {
    resetView();
    onClose();
  };

  const handleSearch = () => {
    onSearch();
    onClose();
  };

  const handleClearFilters = () => {
    clearFilters();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="
        map-overlay
        fixed z-50
        rounded-lg
        py-1.5 min-w-[180px]
        animate-in fade-in zoom-in-95 duration-100
      "
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {/* Reset View */}
      <button
        onClick={handleResetView}
        className="
          w-full flex items-center gap-3 px-4 py-2.5
          text-[15px] text-text-1
          hover:bg-surface-hover transition-colors
          text-left
        "
      >
        <Maximize2 className="w-4 h-4 text-text-2" />
        <span>Reset view</span>
      </button>

      {/* Search */}
      <button
        onClick={handleSearch}
        className="
          w-full flex items-center gap-3 px-4 py-2.5
          text-[15px] text-text-1
          hover:bg-surface-hover transition-colors
          text-left
        "
      >
        <Search className="w-4 h-4 text-text-2" />
        <span>Search</span>
        <kbd className="ml-auto px-1.5 py-0.5 rounded border border-line-strong text-[11px] text-text-2">
          /
        </kbd>
      </button>

      {/* Clear Filters - only show if filters are active */}
      {hasActiveFilters && (
        <>
          <div className="my-1.5 border-t border-line" />
          <button
            onClick={handleClearFilters}
            className="
              w-full flex items-center gap-3 px-4 py-2.5
              text-[15px] text-text-1
              hover:bg-surface-hover transition-colors
              text-left
            "
          >
            <FilterX className="w-4 h-4 text-text-2" />
            <span>Show every factory</span>
          </button>
        </>
      )}
    </div>
  );
}
