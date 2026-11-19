import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  X,
  ChevronUp,
  ChevronDown,
  Factory,
  Building2,
  Briefcase,
  Wrench,
  MapPin,
  Loader2,
  ArrowLeft,
  MapPinned,
  Navigation,
} from 'lucide-react';
import { useMapStore, type MapEntityType, type SheetDetent } from '../../stores/mapStore';
import { PANEL_WIDTH_PX, SHEET_BAR_PX, SHEET_FULL_VH, sheetPeekPx } from './camera';
import { isNotFound, useSelection } from './selection';
import FactoryView from './panel/FactoryView';
import CompanyView from './panel/CompanyView';
import OccupationView from './panel/OccupationView';
import SkillView from './panel/SkillView';
import { StateView, AreaView, PlaceView } from './panel/RegionViews';

/*
 * The panel beside the map (a sheet on a phone): the frame, the way back and
 * what to say while a record loads or is missing. What it shows for each kind
 * of thing is a file in panel/, built from panel/parts.tsx.
 */

const KIND: Record<MapEntityType, { icon: typeof Factory; label: string; missing: string }> = {
  factory: { icon: Factory, label: 'Plant', missing: 'That plant is not listed.' },
  company: { icon: Building2, label: 'Company', missing: 'That company is not listed.' },
  occupation: { icon: Briefcase, label: 'Career', missing: 'That career is not listed.' },
  skill: { icon: Wrench, label: 'Skill', missing: 'That skill is not listed.' },
  state: { icon: MapPin, label: 'State', missing: 'That state was not found.' },
  area: { icon: MapPinned, label: 'Focus area', missing: 'That focus area was not found.' },
  place: { icon: Navigation, label: 'Place', missing: 'That place was not found.' },
};

interface MapDetailPanelProps {
  isMobile?: boolean;
}

/** The sheet's resting heights on a phone, in px, smallest first. */
function detentHeights(): Record<SheetDetent, number> {
  return {
    bar: SHEET_BAR_PX,
    peek: sheetPeekPx(),
    full: Math.min(Math.round((window.innerHeight * SHEET_FULL_VH) / 100), window.innerHeight - 72),
  };
}

export default function MapDetailPanel({ isMobile = false }: MapDetailPanelProps) {
  const selection = useSelection();
  const { type, id, name, isLoading, error } = selection;
  const setSidebarOpen = useMapStore((s) => s.setSidebarOpen);
  const goBack = useMapStore((s) => s.goBack);
  const canGoBack = useMapStore((s) => s.navigationHistory.length > 0);
  const notFound = useMapStore((s) => s.notFound);
  const detent = useMapStore((s) => s.sheetDetent);
  const setDetent = useMapStore((s) => s.setSheetDetent);
  const asideRef = useRef<HTMLElement>(null);

  const kind = type ? KIND[type] : null;
  const Icon = kind?.icon ?? Factory;

  // A link to something that does not exist: say so beside the search and
  // show the country, rather than an empty panel that reads as an outage.
  const missing = error !== null && isNotFound(error);
  useEffect(() => {
    if (missing && kind) notFound(kind.missing);
  }, [missing, kind, notFound]);

  // A sheet opens at its resting height, and one folded to its bar opens
  // again for whatever is chosen next.
  useEffect(() => {
    setDetent('peek');
  }, [setDetent]);
  useEffect(() => {
    if (useMapStore.getState().sheetDetent === 'bar') setDetent('peek');
  }, [type, id, setDetent]);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSidebarOpen]);

  // The sheet follows the finger on its header and settles on the nearest
  // resting height when let go. The height is set on the element while
  // dragging, so nothing re-renders per frame.
  const drag = useRef<{ pointer: number; startY: number; startHeight: number; moved: boolean } | null>(null);
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isMobile || e.pointerType === 'mouse' || !asideRef.current) return;
    drag.current = { pointer: e.pointerId, startY: e.clientY, startHeight: asideRef.current.getBoundingClientRect().height, moved: false };
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const sheet = asideRef.current;
    if (!d || !sheet || e.pointerId !== d.pointer) return;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < 8) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      sheet.style.transition = 'none';
    }
    const heights = detentHeights();
    sheet.style.height = `${Math.min(Math.max(d.startHeight - dy, heights.bar), heights.full)}px`;
  };
  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const sheet = asideRef.current;
    drag.current = null;
    if (!d || !d.moved || !sheet) return;
    const dy = e.clientY - d.startY;
    const height = sheet.getBoundingClientRect().height;
    sheet.style.transition = '';
    sheet.style.height = '';
    const heights = detentHeights();
    const order: SheetDetent[] = ['bar', 'peek', 'full'];
    // A nudge leaves it where it was. A real swipe goes to the next resting
    // height in its direction from where the finger let go.
    let next = detent;
    if (Math.abs(dy) >= 40) {
      const slack = 24;
      next =
        dy < 0
          ? (order.find((each) => heights[each] >= height - slack) ?? 'full')
          : ([...order].reverse().find((each) => heights[each] <= height + slack) ?? 'bar');
    }
    setDetent(next);
  };

  const toggle = () => setDetent(detent === 'full' ? 'peek' : detent === 'bar' ? 'peek' : 'full');
  const folded = isMobile && detent === 'bar';
  const headerText = folded && name ? name : (kind?.label ?? 'Details');
  const headerButton =
    'map-search-button flex shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-tint/10 hover:text-fg-default';

  return (
    <aside
      ref={asideRef}
      data-detent={isMobile ? detent : undefined}
      className={`z-50 flex flex-col overflow-hidden border-border-subtle bg-bg-surface ${
        isMobile
          ? 'map-sheet fixed inset-x-0 bottom-0 rounded-t-2xl border-t animate-in slide-in-from-bottom duration-300'
          : 'absolute right-0 top-0 h-full border-l animate-in slide-in-from-right duration-300'
      }`}
      style={isMobile ? undefined : { width: PANEL_WIDTH_PX }}
      aria-label={name ? `${kind?.label ?? 'Details'}: ${name}` : (kind?.label ?? 'Details')}
    >
      <div
        className={isMobile ? 'touch-none' : undefined}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        {isMobile && (
          <div className="flex justify-center pt-2" aria-hidden="true">
            <span className="block h-1 w-10 rounded-full bg-tint/25" />
          </div>
        )}
        {/* Header */}
        <div className={`flex items-center justify-between gap-2 border-b border-border-subtle ${isMobile ? 'px-2 pb-1.5 pt-0.5' : 'p-3'}`}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {canGoBack && (
              <button type="button" onClick={goBack} className={headerButton} aria-label="Back" title="Back">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <Icon className={`h-4 w-4 shrink-0 text-fg-muted ${canGoBack ? '' : 'ml-2'}`} aria-hidden="true" />
            <span
              className={
                folded && name
                  ? 'min-w-0 truncate text-sm font-medium text-fg-default'
                  : 'min-w-0 truncate text-xs font-medium uppercase tracking-wider text-fg-muted'
              }
            >
              {headerText}
            </span>
          </div>
          <div className="flex shrink-0 items-center">
            {isMobile && (
              <button
                type="button"
                onClick={toggle}
                className={headerButton}
                aria-label={detent === 'full' ? 'Make the panel smaller' : 'Make the panel larger'}
                aria-expanded={detent === 'full'}
              >
                {detent === 'full' ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
              </button>
            )}
            <button type="button" onClick={() => setSidebarOpen(false)} className={headerButton} aria-label="Close" title="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4" hidden={folded}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-fg-muted" aria-label="Loading" />
          </div>
        ) : error && !missing ? (
          <div className="py-10 text-center">
            <p className="text-sm text-fg-muted">This could not be loaded.</p>
            <button
              type="button"
              onClick={selection.retry}
              className="map-row mt-3 inline-flex items-center rounded-lg border border-border-strong px-4 text-sm font-medium text-fg-default transition-colors hover:bg-bg-elevated"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {type === 'factory' && selection.factory && <FactoryView factory={selection.factory} />}
            {type === 'company' && selection.company && <CompanyView company={selection.company} />}
            {type === 'occupation' && selection.occupation && <OccupationView occupation={selection.occupation} />}
            {type === 'skill' && selection.skill && <SkillView skill={selection.skill} />}
            {type === 'state' && selection.state && <StateView data={selection.state} />}
            {type === 'area' && selection.area && <AreaView data={selection.area} />}
            {type === 'place' && selection.place && selection.placeOverview && (
              <PlaceView place={selection.place} data={selection.placeOverview} />
            )}
          </>
        )}
      </div>
    </aside>
  );
}
