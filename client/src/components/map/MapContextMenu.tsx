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

  // Check if any filters are active
  const hasActiveFilters =
    filters.states.length > 0 ||
    filters.company !== null ||
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
        fixed z-50
        bg-bg-surface/95 backdrop-blur-md
        border border-white/10 rounded-xl
        shadow-xl shadow-black/20
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
          text-sm text-fg-default
          hover:bg-white/5 transition-colors
          text-left
        "
      >
        <Maximize2 className="w-4 h-4 text-fg-muted" />
        <span>Reset View</span>
        <span className="ml-auto text-xs text-fg-soft">Full US</span>
      </button>

      {/* Search */}
      <button
        onClick={handleSearch}
        className="
          w-full flex items-center gap-3 px-4 py-2.5
          text-sm text-fg-default
          hover:bg-white/5 transition-colors
          text-left
        "
      >
        <Search className="w-4 h-4 text-fg-muted" />
        <span>Search</span>
        <kbd className="ml-auto px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-fg-soft">
          /
        </kbd>
      </button>

      {/* Clear Filters - only show if filters are active */}
      {hasActiveFilters && (
        <>
          <div className="my-1.5 border-t border-white/5" />
          <button
            onClick={handleClearFilters}
            className="
              w-full flex items-center gap-3 px-4 py-2.5
              text-sm text-fg-default
              hover:bg-white/5 transition-colors
              text-left
            "
          >
            <FilterX className="w-4 h-4 text-amber-400" />
            <span>Clear Filters</span>
            <span className="ml-auto px-1.5 py-0.5 rounded-full bg-amber-500/10 text-[10px] text-amber-400">
              {filters.states.length + (filters.company ? 1 : 0) + (filters.industry ? 1 : 0)}
            </span>
          </button>
        </>
      )}
    </div>
  );
}
