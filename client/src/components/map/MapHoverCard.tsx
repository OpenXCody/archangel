import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Factory, Building2, MapPin, Briefcase, Users } from 'lucide-react';
import { factoriesApi } from '../../lib/api';
import { useMapStore } from '../../stores/mapStore';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';

/**
 * Preview card for the pin under the cursor — enough to decide whether to
 * click, without clicking. Pointer devices only (no hover on touch).
 */
export default function MapHoverCard() {
  const hoveredId = useMapStore((s) => s.hoveredFactoryId);
  const point = useMapStore((s) => s.hoverPoint);
  const selectedId = useMapStore((s) => s.selectedEntityId);

  // Settle for a beat so sweeping across a dense cluster doesn't fetch per pin.
  const [stableId, setStableId] = useState<string | null>(null);
  useEffect(() => {
    if (!hoveredId) { setStableId(null); return; }
    const t = setTimeout(() => setStableId(hoveredId), 120);
    return () => clearTimeout(t);
  }, [hoveredId]);

  // Same key the detail page uses, so a click after hover is instant.
  const { data } = useQuery({
    queryKey: ['factories', stableId],
    queryFn: () => factoriesApi.get(stableId as string),
    enabled: Boolean(stableId),
    staleTime: 5 * 60_000,
  });

  if (!stableId || !point || stableId === selectedId) return null;

  const below = point.y < 200;
  const style = { left: point.x, top: below ? point.y + 14 : point.y - 14 };
  const occupationCount = data?.occupations?.length ?? 0;

  return (
    <div
      role="tooltip"
      style={style}
      className={`pointer-events-none absolute z-40 w-64 -translate-x-1/2 ${below ? '' : '-translate-y-full'}`}
    >
      {below && <div className="mx-auto mb-[-5px] h-2.5 w-2.5 rotate-45 border-l border-t border-border-subtle bg-bg-surface" />}
      <div className="rounded-lg border border-border-subtle bg-bg-surface/95 p-3 shadow-xl backdrop-blur">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-400/10">
            <Factory className="h-3.5 w-3.5 text-sky-400" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-fg-default">{data ? formatFactoryName(data.name) : 'Loading…'}</div>
            {data?.company && (
              <div className="flex items-center gap-1 truncate text-xs text-amber-500/90">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{formatCompanyName(data.company.name)}</span>
              </div>
            )}
          </div>
        </div>
        {data && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-muted">
            {data.state && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{data.state}</span>}
            {data.specialization && <span className="truncate">{data.specialization}</span>}
            {occupationCount > 0 && (
              <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3 text-violet-400" />{occupationCount} {occupationCount === 1 ? 'occupation' : 'occupations'}</span>
            )}
            {data.workforceSize ? (
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{data.workforceSize.toLocaleString()} workforce</span>
            ) : null}
          </div>
        )}
        <div className="mt-2 text-[10px] uppercase tracking-wider text-fg-soft">Click for details</div>
      </div>
      {!below && <div className="mx-auto mt-[-5px] h-2.5 w-2.5 rotate-45 border-b border-r border-border-subtle bg-bg-surface" />}
    </div>
  );
}
