import { Briefcase, Building2, Factory } from 'lucide-react';
import { useMapStore } from '../../stores/mapStore';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { PANEL_WIDTH_PX } from './camera';

const CARD_WIDTH_PX = 264;
const EDGE_GAP_PX = 8;

/**
 * Preview card for the pin under the cursor — enough to decide whether to
 * click, without clicking. Pointer devices only (no hover on touch). It says
 * what the map does not already show: who and what, not where.
 *
 * Everything on it comes from the pin's own properties, which the map already
 * holds, so it is complete the moment it appears: no request, nothing to wait
 * for.
 */
export default function MapHoverCard() {
  const info = useMapStore((s) => s.hoverInfo);
  const point = useMapStore((s) => s.hoverPoint);
  const selectedId = useMapStore((s) => s.selectedEntityId);
  const panelOpen = useMapStore((s) => s.sidebarOpen);

  if (!info || !point || info.id === selectedId) return null;

  // Below the pin near the top of the map (where the search box is), above it otherwise.
  const below = point.y < 220;
  // Centered on the pin, but never off the edge or under the panel.
  const visibleWidth = window.innerWidth - (panelOpen ? PANEL_WIDTH_PX : 0);
  const half = CARD_WIDTH_PX / 2;
  const centerX = Math.min(Math.max(point.x, half + EDGE_GAP_PX), Math.max(half + EDGE_GAP_PX, visibleWidth - half - EDGE_GAP_PX));
  const arrowX = Math.min(Math.max(point.x - (centerX - half), 14), CARD_WIDTH_PX - 14);

  // A site named after its company would say the same thing twice.
  const factoryName = formatFactoryName(info.name);
  const companyName = info.companyName ? formatCompanyName(info.companyName) : null;
  const showCompany = companyName !== null && !factoryName.toLowerCase().startsWith(companyName.toLowerCase());
  const arrow = 'absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-line bg-surface';

  return (
    <div
      role="tooltip"
      style={{ left: centerX - half, top: below ? point.y + 16 : point.y - 16, width: CARD_WIDTH_PX }}
      className={`pointer-events-none absolute z-40 ${below ? '' : '-translate-y-full'}`}
    >
      <div className="map-overlay rounded-lg p-3">
        <div className="flex items-start gap-2.5">
          <Factory className="mt-1 h-4 w-4 shrink-0 text-text-2" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-text-1">{factoryName}</div>
            {showCompany && (
              <div className="mt-0.5 flex items-center gap-1 text-[13px] text-text-2">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{companyName}</span>
              </div>
            )}
          </div>
        </div>
        {(info.industry || info.openJobs > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-3">
            {info.industry && <span className="min-w-0 truncate">{info.industry}</span>}
            {info.openJobs > 0 && (
              <span className="inline-flex items-center gap-1 font-medium tabular-nums text-text-1">
                <Briefcase className="h-3 w-3 shrink-0" />
                {info.openJobs.toLocaleString()} open {info.openJobs === 1 ? 'job' : 'jobs'}
              </span>
            )}
          </div>
        )}
      </div>
      {/* Pointer to the pin: a rotated square tucked half under the card's edge. */}
      <span
        aria-hidden="true"
        style={{ left: arrowX }}
        className={below ? `${arrow} -top-[5px] border-l border-t` : `${arrow} -bottom-[5px] border-b border-r`}
      />
    </div>
  );
}
