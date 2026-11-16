import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
  type MapMouseEvent,
  type PointLike,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Maximize2, Minus, Plus } from 'lucide-react';
import { factoriesApi, mapApi } from '../../lib/api';
import { useMapStore, type PinInfo } from '../../stores/mapStore';
import { US_STATES } from '@shared/states';
import { FOCUS_AREAS, focusArea } from '@shared/scope';
import {
  applyCameraRequest,
  areaReadsAsShape,
  fitUS,
  flyToPoint,
  initialCamera,
  isAtHome,
  isPhoneLayout,
  PANEL_WIDTH_PX,
  sheetPeekPx,
  zoomBy,
} from './camera';
import {
  addAppLayers,
  LAYER,
  PIN_INTERACTIVE_MIN_ZOOM,
  plainDarkStyle,
  quietBasemap,
  setStateShadingDimmed,
  SOURCE,
} from './layers';

declare global {
  interface Window {
    /** The live map, exposed in dev builds only so browser tests can read the camera. */
    __archangelMap?: MapLibreMap;
  }
}

// MapTiler style base URL - key added at runtime for retry support
const MAPTILER_STYLE_BASE = 'https://api.maptiler.com/maps/dataviz-dark/style.json';

// US States GeoJSON, shipped with the app (client/public/data)
const STATES_GEOJSON_URL = '/data/us-states.geojson';

/** Below this zoom a state reads as a shape and can be hovered and selected. */
const STATE_SELECT_MAX_ZOOM = 6.5;

/** A focus area's label is shown while the area is narrower than this on screen. */
const AREA_LABEL_MAX_PX = 150;
/** Space between a focus area's edge and its label, normally; the label's stem spans it. */
const AREA_LABEL_GAP_PX = 9;

/** How far from a pin a pointer still counts as on it: a mouse is exact, a finger is not. */
function hitTolerancePx(): number {
  return window.matchMedia('(pointer: coarse)').matches ? 10 : 4;
}

/** A pin's GeoJSON properties, as the hover card wants them. */
function pinInfo(properties: Record<string, unknown> | null): PinInfo | null {
  const id = properties?.id;
  if (!properties || typeof id !== 'string') return null;
  // Tiles carry a missing value as nothing or as the text "null", never as null.
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' && value !== 'null' ? value : null;
  return {
    id,
    name: text(properties.name) ?? 'Factory',
    companyName: text(properties.companyName),
    tier: Number(properties.tier) || 0,
    city: text(properties.city),
    state: text(properties.state),
    industry: text(properties.industry),
    openJobs: Number(properties.openJobs) || 0,
  };
}

/**
 * MapLibre shows its attribution opened out the first time it has something
 * to credit. Fold it to the small "i" button that once; after that only the
 * visitor opens or closes it.
 */
function collapseAttribution(map: MapLibreMap): void {
  const el = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
  if (!el) return;
  const collapse = (): boolean => {
    if (!el.classList.contains('maplibregl-compact-show')) return false;
    el.classList.remove('maplibregl-compact-show');
    return true;
  };
  if (collapse()) return;
  const observer = new MutationObserver(() => {
    if (collapse()) observer.disconnect();
  });
  observer.observe(el, { attributes: true, attributeFilter: ['class'] });
}

export default function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // True once the camera has left the home view (enables "reset view")
  const [awayFromHome, setAwayFromHome] = useState(false);
  // True until the first camera request after a map is created has been handled.
  const firstRequestRef = useRef(true);

  const selectedEntityType = useMapStore((s) => s.selectedEntityType);
  const selectedEntityId = useMapStore((s) => s.selectedEntityId);
  const hoveredFactoryId = useMapStore((s) => s.hoveredFactoryId);
  const filters = useMapStore((s) => s.filters);
  const flyToTarget = useMapStore((s) => s.flyToTarget);
  const clearFlyTo = useMapStore((s) => s.clearFlyTo);
  const resetView = useMapStore((s) => s.resetView);
  const sidebarOpen = useMapStore((s) => s.sidebarOpen);

  const selectedFactoryId = selectedEntityType === 'factory' ? selectedEntityId : null;
  const selectedStateCode = selectedEntityType === 'state' ? selectedEntityId : null;
  const selectedAreaId = selectedEntityType === 'area' ? selectedEntityId : null;

  // Every factory the filters allow, in one response. The whole country loads
  // once; panning and zooming never refetch.
  const { data: factoriesGeoJSON } = useQuery({
    queryKey: ['factory-pins', filters.states, filters.company, filters.industry],
    queryFn: () =>
      factoriesApi.pins({
        states: filters.states.length > 0 ? filters.states : undefined,
        company: filters.company || undefined,
        industry: filters.industry || undefined,
      }),
    staleTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData, // keep the pins up while a filter loads
  });

  // Where each factory is, by id: the hovered and selected pins are redrawn
  // from this, and a factory picked from search or a link is found with it.
  const pinIndex = useMemo(() => {
    // Plain object lookup — the component itself is named `Map`, which
    // shadows the built-in Map constructor inside this file.
    const index: Record<string, [number, number]> = {};
    for (const feature of factoriesGeoJSON?.features ?? []) {
      const id = feature.properties?.id as unknown;
      if (typeof id !== 'string' || feature.geometry.type !== 'Point') continue;
      const [lng, lat] = feature.geometry.coordinates;
      index[id] = [lng, lat];
    }
    return index;
  }, [factoriesGeoJSON]);

  // State-level factory counts (shade the states)
  const { data: stateCounts } = useQuery<Record<string, number>>({
    queryKey: ['state-counts'],
    queryFn: () => mapApi.stateCounts(),
    staleTime: 5 * 60 * 1000,
  });

  // Raw US states GeoJSON geometry
  const { data: statesGeoJSONRaw } = useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['states-geojson'],
    queryFn: async () => {
      const res = await fetch(STATES_GEOJSON_URL);
      if (!res.ok) throw new Error(`States GeoJSON failed: HTTP ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
  });

  // Merge counts into states GeoJSON so the fill layer can key off
  // feature.properties.factoryCount. Name → 2-letter-code map comes from
  // shared/states.ts; the upstream GeoJSON uses full names on properties.name.
  // The shapes do not wait for the counts: a slow or failed count request
  // must not leave the map without its states.
  const statesWithCounts = useMemo(() => {
    if (!statesGeoJSONRaw) return null;
    const nameToCode: Record<string, string> = {};
    for (const s of US_STATES) nameToCode[s.name] = s.code;
    return {
      ...statesGeoJSONRaw,
      features: statesGeoJSONRaw.features.map((f) => {
        const name = f.properties?.name as string | undefined;
        const code = name ? nameToCode[name] : undefined;
        const count = code ? (stateCounts?.[code] ?? 0) : 0;
        return { ...f, properties: { ...(f.properties ?? {}), stateCode: code, factoryCount: count } };
      }),
    } as GeoJSON.FeatureCollection;
  }, [statesGeoJSONRaw, stateCounts]);

  // Boundaries of the focus areas, each feature tagged with its area's id.
  // An area whose boundary fails to load is simply not outlined; its label
  // and chip still work, because they frame the area by its bounds.
  const { data: areaBoundaries } = useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['focus-area-boundaries'],
    queryFn: async () => {
      const loaded = await Promise.all(
        FOCUS_AREAS.map(async (area): Promise<GeoJSON.Feature[]> => {
          try {
            const res = await fetch(area.boundaryUrl);
            if (!res.ok) return [];
            const collection = (await res.json()) as GeoJSON.FeatureCollection;
            return collection.features.map((f) => ({ ...f, properties: { id: area.id, name: area.name } }));
          } catch {
            return [];
          }
        })
      );
      return { type: 'FeatureCollection', features: loaded.flat() };
    },
    staleTime: Infinity,
  });

  // Initialize map with retry logic
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    let retryCount = 0;
    const maxRetries = 3;
    // Set once the basemap has failed for good: draw on the plain canvas so
    // the data stays usable instead of showing an error screen.
    let basemapUnavailable = false;

    const initMap = () => {
      // Get key fresh each attempt. No key: draw on the plain dark canvas
      // instead of asking MapTiler for a style it will refuse.
      const mapKey = (import.meta.env.VITE_MAP_TOKEN as string | undefined)?.trim() || '';
      const keyless = basemapUnavailable || mapKey === '';

      try {
        map.current = new maplibregl.Map({
          container: mapContainer.current!,
          style: keyless ? plainDarkStyle() : `${MAPTILER_STYLE_BASE}?key=${mapKey}`,
          ...initialCamera(),
          minZoom: 2,
          maxZoom: 18,
          // Added below, bottom-left, so the panel and the zoom buttons never cover it.
          attributionControl: false,
          renderWorldCopies: false,
        });
      } catch (err) {
        console.error('Failed to create map:', err);
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(initMap, 500);
          return;
        }
        setMapError('Failed to initialize map');
        return;
      }

      const currentMap = map.current;
      if (import.meta.env.DEV) window.__archangelMap = currentMap;

      // The basemap provider's and OpenStreetMap's terms require the credit.
      // It stays, folded to its "i" button until someone asks for it.
      currentMap.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
      collapseAttribution(currentMap);

      // Handle map errors with auto-retry
      currentMap.on('error', (e) => {
        console.error('Map error:', e);
        // The plain style is inline: there is no style request to retry.
        if (keyless) return;
        const isStyleError = e.error?.message?.includes('style') ||
                            e.error?.message?.includes('Style') ||
                            e.error?.message?.includes('401');
        if (isStyleError && retryCount < maxRetries) {
          retryCount++;
          map.current?.remove();
          map.current = null;
          setTimeout(initMap, 500);
        } else if (isStyleError) {
          basemapUnavailable = true;
          map.current?.remove();
          map.current = null;
          initMap();
        }
      });

      currentMap.on('load', () => {
        // Force a resize once the style loads in case container dimensions
        // weren't final when the map was created (lazy-loaded route, fonts
        // settling, etc.). Critically, we must also re-fit after resize -
        // resize() alone recalculates canvas size but doesn't fix the center.
        currentMap.resize();
        fitUS(currentMap, { animate: false });

        try {
          // MapTiler basemap only; the plain style is already exactly what we want.
          const beneathLabels = keyless ? undefined : quietBasemap(currentMap);
          addAppLayers(currentMap, beneathLabels);
        } catch (err) {
          console.error('Failed to add map layers:', err);
        }

        bindInteractions(currentMap);
        setMapLoaded(true);
      });

      // Offer "reset view" whenever the camera has left the home view. The
      // value only changes when the map crosses that line, so React re-renders
      // then and not on every move.
      currentMap.on('moveend', () => {
        setAwayFromHome(!isAtHome(currentMap));
      });
    }; // end initMap

    /**
     * Pointer handling. One click handler and one hover handler for the whole
     * map, so what is under the pointer is decided in one place and in one
     * order: a pin (once zoomed in far enough to pick one), then a focus
     * area, then a state.
     */
    const bindInteractions = (currentMap: MapLibreMap) => {
      const store = useMapStore.getState;
      const hitLayers = [LAYER.pins, LAYER.areaFill, LAYER.stateFill];

      interface Hit {
        pin?: MapGeoJSONFeature;
        area?: MapGeoJSONFeature;
        state?: MapGeoJSONFeature;
      }

      const hitTest = (point: maplibregl.Point): Hit => {
        const r = hitTolerancePx();
        const box: [PointLike, PointLike] = [[point.x - r, point.y - r], [point.x + r, point.y + r]];
        // Far out, pins are points of light: the state or area under them takes the pointer.
        const pinsPickable = currentMap.getZoom() >= PIN_INTERACTIVE_MIN_ZOOM;
        const layers = hitLayers.filter((id) => currentMap.getLayer(id) && (pinsPickable || id !== LAYER.pins));
        if (layers.length === 0) return {};
        const hit: Hit = {};
        let pinDistance = Infinity;
        for (const feature of currentMap.queryRenderedFeatures(box, { layers })) {
          switch (feature.layer.id) {
            case LAYER.pins: {
              // Of the pins within reach, the one nearest the pointer.
              if (feature.geometry.type !== 'Point') break;
              const at = currentMap.project(feature.geometry.coordinates as [number, number]);
              const distance = (at.x - point.x) ** 2 + (at.y - point.y) ** 2;
              if (distance < pinDistance) {
                pinDistance = distance;
                hit.pin = feature;
              }
              break;
            }
            case LAYER.areaFill:
              hit.area ??= feature;
              break;
            case LAYER.stateFill:
              hit.state ??= feature;
              break;
          }
        }
        return hit;
      };

      /** The focus area under the pointer, while it is still seen as a shape. */
      const areaAt = (hit: Hit) => {
        const area = focusArea(String(hit.area?.properties?.id ?? ''));
        return area && areaReadsAsShape(currentMap, area) ? area : undefined;
      };

      /** The state under the pointer, while states are still seen as shapes. */
      const stateAt = (hit: Hit): string | undefined => {
        if (currentMap.getZoom() >= STATE_SELECT_MAX_ZOOM) return undefined;
        const code = hit.state?.properties?.stateCode as unknown;
        return typeof code === 'string' && code !== '' ? code : undefined;
      };

      currentMap.on('click', (e: MapMouseEvent) => {
        const hit = hitTest(e.point);

        // A pin under the pointer wins, at any zoom.
        if (hit.pin && hit.pin.geometry.type === 'Point') {
          const id = hit.pin.properties?.id as unknown;
          if (typeof id !== 'string') return;
          store().selectFactory(id);
          // Centered in what the panel or sheet leaves visible (camera.ts).
          flyToPoint(currentMap, hit.pin.geometry.coordinates as [number, number]);
          return;
        }

        const area = areaAt(hit);
        if (area) {
          store().selectArea(area.id);
          return;
        }

        // Zoomed in to city level, an empty click is just an empty click.
        // Selecting the state there would yank the view out to the whole state.
        const code = stateAt(hit);
        if (code) {
          store().selectState(code);
          return;
        }

        store().setSidebarOpen(false);
      });

      // Hover. Mouse moves arrive faster than frames; look once per frame.
      let hoveredState: string | null = null;
      let hoveredPin: string | null = null;
      let pending: maplibregl.Point | null = null;
      let frame = 0;

      const setHoveredState = (code: string | null) => {
        if (code === hoveredState) return;
        if (hoveredState) currentMap.setFeatureState({ source: SOURCE.states, id: hoveredState }, { hover: false });
        if (code) currentMap.setFeatureState({ source: SOURCE.states, id: code }, { hover: true });
        hoveredState = code;
      };

      const setHoveredPin = (feature: MapGeoJSONFeature | null) => {
        const info = feature ? pinInfo(feature.properties) : null;
        const id = info?.id ?? null;
        if (id === hoveredPin) return;
        hoveredPin = id;
        if (!feature || !info || feature.geometry.type !== 'Point') {
          store().setHoveredFactory(null);
          return;
        }
        // The card hangs off the pin, not the pointer, so it holds still.
        const at = currentMap.project(feature.geometry.coordinates as [number, number]);
        store().setHoveredFactory(info.id, { x: at.x, y: at.y }, info);
      };

      const clearHover = () => {
        pending = null;
        setHoveredPin(null);
        setHoveredState(null);
        currentMap.getCanvas().style.cursor = '';
      };

      const updateHover = () => {
        frame = 0;
        if (!pending || currentMap.isMoving()) return;
        const hit = hitTest(pending);
        setHoveredPin(hit.pin ?? null);
        const overPoint = Boolean(hit.pin);
        const area = overPoint ? undefined : areaAt(hit);
        const code = overPoint || area ? undefined : stateAt(hit);
        setHoveredState(code ?? null);
        currentMap.getCanvas().style.cursor = overPoint || area || code ? 'pointer' : '';
      };

      currentMap.on('mousemove', (e: MapMouseEvent) => {
        pending = e.point;
        if (!frame) frame = requestAnimationFrame(updateHover);
      });
      currentMap.on('mouseout', clearHover);
      // The card is placed in screen space: once the map moves it would be wrong.
      currentMap.on('movestart', () => setHoveredPin(null));

      // Right-click anywhere → clear any lingering selection (factory, area
      // or state). The page shows its context menu on the same event.
      currentMap.on('contextmenu', (e) => {
        e.preventDefault();
        store().clearSelection();
      });
    };

    // Small delay on initial load to ensure env is ready
    const initTimer = setTimeout(initMap, 100);

    return () => {
      clearTimeout(initTimer);
      if (map.current) {
        if (window.__archangelMap === map.current) delete window.__archangelMap;
        map.current.remove();
        map.current = null;
      }
      // Reset so data effects fire again on remount, and so the next map's
      // first camera request (a shared link) is applied without a flight.
      setMapLoaded(false);
      firstRequestRef.current = true;
    };
  }, []); // Empty deps - map is created once, handlers read the live store

  // Push data into a source. Depends on mapLoaded too — so that after a
  // route-level remount (Map → Explore → Map), the freshly-created source is
  // populated even though the cached data reference hasn't changed.
  const setSourceData = (sourceId: string, data: GeoJSON.FeatureCollection | null | undefined) => {
    if (!map.current || !mapLoaded || !data) return;
    const source = map.current.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(data);
  };

  useEffect(() => {
    setSourceData(SOURCE.factories, factoriesGeoJSON);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoriesGeoJSON, mapLoaded]);

  useEffect(() => {
    setSourceData(SOURCE.states, statesWithCounts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesWithCounts, mapLoaded]);

  useEffect(() => {
    setSourceData(SOURCE.areas, areaBoundaries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaBoundaries, mapLoaded]);

  // The hovered and the selected pin, redrawn above their neighbours. Hover
  // comes from the map or from a factory row in the panel; either way it is
  // one tiny source update, never a restyle of the 48,000-point layer.
  useEffect(() => {
    const features: GeoJSON.Feature[] = [];
    const add = (id: string | null, kind: 'hover' | 'selected') => {
      const lngLat = id ? pinIndex[id] : undefined;
      if (!lngLat) return;
      features.push({ type: 'Feature', properties: { kind }, geometry: { type: 'Point', coordinates: lngLat } });
    };
    if (hoveredFactoryId !== selectedFactoryId) add(hoveredFactoryId, 'hover');
    add(selectedFactoryId, 'selected');
    setSourceData(SOURCE.activePins, { type: 'FeatureCollection', features });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredFactoryId, selectedFactoryId, pinIndex, mapLoaded]);

  // A factory chosen from search, a shared link or the Back button never went
  // through a pin click, so nothing moved the camera. Bring it into view when
  // it is off screen or the map is zoomed too far out to make it out.
  useEffect(() => {
    const m = map.current;
    const lngLat = selectedFactoryId ? pinIndex[selectedFactoryId] : undefined;
    if (!m || !mapLoaded || !lngLat) return;
    if (m.getZoom() >= 7 && m.getBounds().contains(lngLat)) return;
    flyToPoint(m, lngLat);
  }, [selectedFactoryId, pinIndex, mapLoaded]);

  // Outline the selected state and light its fill; exactly one state (or none).
  const previousStateRef = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    const previous = previousStateRef.current;
    try {
      if (previous && previous !== selectedStateCode) {
        m.setFeatureState({ source: SOURCE.states, id: previous }, { selected: false });
      }
      if (selectedStateCode) {
        m.setFeatureState({ source: SOURCE.states, id: selectedStateCode }, { selected: true });
      }
      m.setFilter(LAYER.stateSelected, ['==', ['get', 'stateCode'], selectedStateCode ?? '']);
    } catch { /* the layers failed to add; nothing to highlight */ }
    previousStateRef.current = selectedStateCode;
  }, [selectedStateCode, mapLoaded]);

  // Light the selected focus area a little more.
  const previousAreaRef = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    const previous = previousAreaRef.current;
    try {
      if (previous && previous !== selectedAreaId) {
        m.setFeatureState({ source: SOURCE.areas, id: previous }, { selected: false });
      }
      if (selectedAreaId) m.setFeatureState({ source: SOURCE.areas, id: selectedAreaId }, { selected: true });
    } catch { /* the layers failed to add; nothing to highlight */ }
    previousAreaRef.current = selectedAreaId;
  }, [selectedAreaId, mapLoaded]);

  // The state shading is an all-factories reference; while one company is the
  // subject it steps back so it is not read as that company's footprint.
  const companyFiltered = Boolean(filters.company);
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    try {
      setStateShadingDimmed(map.current, companyFiltered);
    } catch { /* the layers failed to add */ }
  }, [companyFiltered, mapLoaded]);

  // A label on each focus area. At country zoom an area is a speck, so the
  // label is what a visitor sees and clicks; once the area is big enough to
  // read on its own, the label steps aside. These are plain DOM elements that
  // MapLibre positions itself: no React work while the map moves.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    const labels = FOCUS_AREAS.map((area) => {
      const [[west, south], [east, north]] = area.bounds;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'map-overlay map-area-label';
      el.textContent = area.name;
      el.setAttribute('aria-label', `Go to the ${area.name} focus area`);
      el.addEventListener('click', (event) => {
        event.stopPropagation(); // not also a click on the map beneath
        useMapStore.getState().selectArea(area.id);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([0, 0]).addTo(m);
      return { el, marker, west, east, north, south };
    });
    type Label = (typeof labels)[number];

    // Where a tag can sit: beside the middle of one edge of the area's box,
    // a stem's length away. Sides in order of preference; the longer stem is
    // for when a cluster sits on the area itself and every near spot is taken.
    const sides = ['above', 'below', 'left', 'right'] as const;
    const stems = [AREA_LABEL_GAP_PX, AREA_LABEL_GAP_PX * 3];
    type Side = (typeof sides)[number];
    interface Spot { side: Side; stem: number }
    const spots: Spot[] = stems.flatMap((stem) => sides.map((side) => ({ side, stem })));

    const position = (label: Label, { side, stem }: Spot): { lngLat: [number, number]; offset: [number, number] } => {
      const lng = (label.west + label.east) / 2;
      const lat = (label.south + label.north) / 2;
      const dx = label.el.offsetWidth / 2 + stem;
      const dy = label.el.offsetHeight / 2 + stem;
      switch (side) {
        case 'above': return { lngLat: [lng, label.north], offset: [0, -dy] };
        case 'below': return { lngLat: [lng, label.south], offset: [0, dy] };
        case 'left': return { lngLat: [label.west, lat], offset: [-dx, 0] };
        case 'right': return { lngLat: [label.east, lat], offset: [dx, 0] };
      }
    };
    const place = (label: Label, spot: Spot) => {
      const { lngLat, offset } = position(label, spot);
      label.marker.setLngLat(lngLat).setOffset(offset);
      // The stem is drawn in CSS (globals.css) from these two.
      label.el.dataset.side = spot.side;
      label.el.style.setProperty('--stem', `${spot.stem}px`);
    };

    // Hide the tag once the area is wide enough on screen to read by itself.
    const syncVisibility = () => {
      for (const label of labels) {
        const widthPx = m.project([label.east, label.north]).x - m.project([label.west, label.north]).x;
        label.el.classList.toggle('is-hidden', widthPx > AREA_LABEL_MAX_PX);
      }
    };

    for (const label of labels) place(label, spots[0]);
    syncVisibility();
    m.on('zoom', syncVisibility);
    return () => {
      m.off('zoom', syncVisibility);
      for (const { marker } of labels) marker.remove();
    };
  }, [mapLoaded]);

  // Carry out camera requests posted to the store. Waits for the map, and a
  // state waits for its shape: a request made early is applied as soon as it
  // can be. The request a page load arrives with (a shared link) is applied
  // without a flight, so the link opens on its view.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    if (!flyToTarget) {
      firstRequestRef.current = false;
      return;
    }
    const done = applyCameraRequest(m, flyToTarget, {
      animate: !firstRequestRef.current,
      stateGeometry: (code) =>
        statesWithCounts?.features.find(
          (f) => (f.properties as { stateCode?: string } | null)?.stateCode === code
        )?.geometry,
    });
    if (!done) return;
    firstRequestRef.current = false;
    clearFlyTo();
  }, [flyToTarget, clearFlyTo, mapLoaded, statesWithCounts]);

  // Keep the controls and the attribution clear of the open panel (desktop)
  // or sheet (phone).
  const phone = isPhoneLayout();
  const coveredRight = sidebarOpen && !phone ? PANEL_WIDTH_PX : 0;
  const coveredBottom = sidebarOpen && phone ? sheetPeekPx() : 0;

  return (
    <>
      <div
        ref={mapContainer}
        className="archangel-map isolate absolute inset-0 w-full h-full"
        style={{ background: 'var(--color-bg-base)', '--map-covered-bottom': `${coveredBottom}px` } as CSSProperties}
      />

      {/* Reset view and zoom */}
      {mapLoaded && (
        <div
          className="absolute z-30 flex flex-col gap-2"
          style={{ right: coveredRight + 12, bottom: coveredBottom + 16 }}
        >
          <button
            type="button"
            onClick={resetView}
            disabled={!awayFromHome && !sidebarOpen}
            className="map-overlay map-overlay-button flex h-10 w-10 items-center justify-center rounded-lg"
            title="Reset view"
            aria-label="Reset view"
          >
            <Maximize2 className="h-[18px] w-[18px]" />
          </button>
          <div className="map-overlay flex flex-col overflow-hidden rounded-lg">
            <button
              type="button"
              onClick={() => map.current && zoomBy(map.current, 1)}
              className="map-overlay-button flex h-10 w-10 items-center justify-center"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>
            <span className="h-px bg-border-strong" aria-hidden="true" />
            <button
              type="button"
              onClick={() => map.current && zoomBy(map.current, -1)}
              className="map-overlay-button flex h-10 w-10 items-center justify-center"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <Minus className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {!mapLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-base">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-fg-muted animate-spin" />
            <span className="text-sm text-fg-muted">Loading map...</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-base">
          <div className="flex flex-col items-center gap-3 text-center px-4">
            <span className="text-fg-muted">Failed to load map</span>
            <span className="text-sm text-fg-muted">{mapError}</span>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 text-sm bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </>
  );
}
