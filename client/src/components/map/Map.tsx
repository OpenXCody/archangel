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
import { useMapStore, type PinInfo } from '../../stores/mapStore';
import { currentTheme, type Theme } from '../../lib/theme';
import { isNotFound } from './selection';
import { formatCompanyName } from '@shared/displayName';
import { focusArea } from '@shared/scope';
import {
  applyCameraRequest,
  areaReadsAsShape,
  fitUS,
  flyToPoint,
  initialCamera,
  isAtHome,
  isPhoneLayout,
  keepNearCountry,
  PANEL_WIDTH_PX,
  SHEET_BAR_PX,
  sheetPeekPx,
  viewFromHash,
  viewToHash,
  zoomBy,
} from './camera';
import {
  addAppLayers,
  EVERY_PIN,
  LAYER,
  PIN_INTERACTIVE_MIN_ZOOM,
  pinInFocus,
  plainStyle,
  setMapPalette,
  setPinView,
  quietBasemap,
  setStateShadingDimmed,
  SOURCE,
  type PinView,
} from './layers';
import { recordQuery, usePins } from '../../lib/queries';
import { useStatesWithCounts, useAreaBoundaries } from './mapData';

declare global {
  interface Window {
    /** The live map, exposed in dev builds only so browser tests can read the camera. */
    __archangelMap?: MapLibreMap;
  }
}

/** MapTiler's quiet basemap, in the variant that matches the theme. */
const MAPTILER_STYLE: Record<Theme, string> = {
  dark: 'https://api.maptiler.com/maps/dataviz-dark/style.json',
  light: 'https://api.maptiler.com/maps/dataviz-light/style.json',
};

/**
 * Where the map was when it was last torn down. A theme change recreates the
 * map (MapView keys it on the theme); it reopens here instead of starting over.
 */
let resumeCamera: { center: [number, number]; zoom: number } | null = null;

/** Below this zoom a state reads as a shape and can be hovered and selected. */
const STATE_SELECT_MAX_ZOOM = 6.5;


/**
 * How far from a pin's edge a pointer still counts as on it. A mouse is
 * exact. A finger is not: close in, a tap takes the nearest pin within about
 * 22px. Far out, where 22px is a state or two, the reach shrinks so a tap
 * lands on the state under the finger unless it is right on a pin.
 */
const MOUSE_REACH_PX = 4;
const TOUCH_REACH_NEAR_PX = 22;
const TOUCH_REACH_FAR_PX = 10;
/** A pin's own body, allowed on top of the reach. */
const PIN_BODY_PX = 6;

function reachPx(touch: boolean, zoom: number): number {
  if (!touch) return MOUSE_REACH_PX;
  const t = Math.min(1, Math.max(0, (zoom - 4) / (PIN_INTERACTIVE_MIN_ZOOM - 4)));
  return TOUCH_REACH_FAR_PX + (TOUCH_REACH_NEAR_PX - TOUCH_REACH_FAR_PX) * t;
}

/**
 * How long a tap or click waits before it selects anything. A second one
 * inside this time makes it a double tap, which zooms and selects nothing.
 */
const TAP_SETTLE_MS = 250;
/** Two taps this close together are one double tap. */
const DOUBLE_TAP_SLOP_PX = 30;
/** A click this soon after a touch came from that touch. */
const TOUCH_CLICK_WINDOW_MS = 800;
/** The address follows the camera this long after it comes to rest. */
const ADDRESS_SETTLE_MS = 300;

/** A pin's GeoJSON properties, as the hover card wants them. */
function pinInfo(properties: Record<string, unknown> | null): PinInfo | null {
  const id = properties?.id;
  if (!properties || typeof id !== 'string') return null;
  // Tiles carry a missing value as nothing or as the text "null", never as null.
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' && value !== 'null' ? value : null;
  return {
    id,
    name: text(properties.name) ?? 'Plant',
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

interface MapProps {
  /**
   * Told where the camera has come to rest, as an address fragment ("" at the
   * home view). Called after moves end, never during one.
   */
  onViewChange?: (hash: string) => void;
}

export default function Map({ onViewChange }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // True once the camera has left the home view (enables "reset view")
  const [awayFromHome, setAwayFromHome] = useState(false);
  // True until the first camera request after a map is created has been handled.
  const firstRequestRef = useRef(true);
  // True while the camera is where a link put it and the person has not yet
  // touched anything: what the link selects must not move it.
  const heldByAddressRef = useRef(false);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

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

  // Every factory in the country, in one response. It loads once; panning,
  // zooming and filtering never refetch (filters are expressions: layers.ts).
  const { data: factoriesGeoJSON } = usePins();

  // The map's subject, if it has one: a company (its plants alone) or a
  // career (the industries where its work is done). The panel and the
  // record's own page read the same records under the same keys, so each is
  // fetched once.
  const { data: subjectCompany, error: subjectCompanyError } = useQuery({
    ...recordQuery('companies', filters.company),
    enabled: Boolean(filters.company),
    retry: false,
  });
  const { data: subjectCareer, error: subjectCareerError } = useQuery({
    ...recordQuery('occupations', filters.career),
    enabled: Boolean(filters.career),
    retry: false,
  });

  // The subject's chip is named once its record is in, and a subject a link
  // named that does not exist is said so.
  const nameSubject = useMapStore((s) => s.nameSubject);
  const notFound = useMapStore((s) => s.notFound);
  const subjectName = subjectCompany ? formatCompanyName(subjectCompany.name) : (subjectCareer?.title ?? null);
  useEffect(() => {
    if (subjectName) nameSubject(subjectName);
  }, [subjectName, nameSubject]);
  const subjectMissing = filters.company
    ? isNotFound(subjectCompanyError)
    : filters.career
      ? isNotFound(subjectCareerError)
      : false;
  useEffect(() => {
    if (!subjectMissing) return;
    notFound(useMapStore.getState().filters.company ? 'That company is not listed.' : 'That career is not listed.');
  }, [subjectMissing, notFound]);

  const pinView = useMemo<PinView>(() => {
    const industries = subjectCareer && !subjectCareer.everywhere ? (subjectCareer.industries ?? []) : [];
    return {
      states: filters.states,
      industry: filters.industry,
      companyPlants: filters.company ? (subjectCompany?.factories ?? []).map((f) => f.id) : null,
      careerIndustries: filters.career && industries.length > 0 ? industries.map((i) => i.name) : null,
    };
  }, [filters.states, filters.industry, filters.company, filters.career, subjectCompany, subjectCareer]);
  // The pointer handlers are bound once; they read the view from here.
  const pinViewRef = useRef<PinView>(EVERY_PIN);
  pinViewRef.current = pinView;

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

  // The states' shapes with their plant counts, and the focus areas' boundaries (mapData.ts).
  const statesWithCounts = useStatesWithCounts();
  const { data: areaBoundaries } = useAreaBoundaries();

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

      const theme = currentTheme();
      setMapPalette(theme);
      // A link that carries a camera opens on it; failing that, the map
      // reopens where it was last left (a theme change, a visit to another page).
      const fromAddress = viewFromHash(window.location.hash);
      const resumed = fromAddress ?? resumeCamera;
      resumeCamera = null;
      heldByAddressRef.current = fromAddress !== null;
      const camera = resumed ?? initialCamera();

      try {
        map.current = new maplibregl.Map({
          container: mapContainer.current!,
          style: keyless ? plainStyle() : `${MAPTILER_STYLE[theme]}?key=${mapKey}`,
          ...camera,
          minZoom: 1,
          maxZoom: 18,
          // A phone is held upright: the map stays north-up and flat.
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
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
        currentMap.touchZoomRotate.disableRotation();
        if (!resumed) fitUS(currentMap, { animate: false });
        keepNearCountry(currentMap);

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

      // The address follows the camera once it has come to rest: one
      // replaced history entry per pause, never one per frame.
      let addressTimer = 0;
      const reportView = () => {
        window.clearTimeout(addressTimer);
        addressTimer = window.setTimeout(() => {
          if (map.current === currentMap) onViewChangeRef.current?.(viewToHash(currentMap));
        }, ADDRESS_SETTLE_MS);
      };
      // Offer "reset view" whenever the camera has left the home view. The
      // value only changes when the map crosses that line, so React re-renders
      // then and not on every move.
      currentMap.on('moveend', () => {
        setAwayFromHome(!isAtHome(currentMap));
        reportView();
      });
      currentMap.once('idle', reportView);
    }; // end initMap

    /**
     * Pointer handling. One click handler and one hover handler for the whole
     * map, so what is under the pointer is decided in one place and in one
     * order: a pin (once zoomed in far enough to pick one), then a focus
     * area, then a state.
     */
    const bindInteractions = (currentMap: MapLibreMap) => {
      const store = useMapStore.getState;
      interface Hit {
        pin?: MapGeoJSONFeature;
        area?: MapGeoJSONFeature;
        state?: MapGeoJSONFeature;
      }

      const hitTest = (point: maplibregl.Point, touch: boolean): Hit => {
        const hit: Hit = {};
        const zoom = currentMap.getZoom();
        const view = pinViewRef.current;

        // The state and the focus area are whatever is exactly under the pointer.
        const shapes = [LAYER.areaFill, LAYER.stateFill].filter((id) => currentMap.getLayer(id));
        if (shapes.length > 0) {
          for (const feature of currentMap.queryRenderedFeatures(point, { layers: shapes })) {
            if (feature.layer.id === LAYER.areaFill) hit.area ??= feature;
            else hit.state ??= feature;
          }
        }

        // Far out, pins are a texture and the state or area under them takes
        // the pointer; with one company's plants on the map they are the subject.
        const pinsPickable = zoom >= PIN_INTERACTIVE_MIN_ZOOM || view.companyPlants !== null;
        if (!pinsPickable || !currentMap.getLayer(LAYER.pins)) return hit;

        // Of the pins within reach, the nearest; one the view holds up before
        // one it has stepped back.
        const reach = reachPx(touch, zoom) + PIN_BODY_PX;
        const box: [PointLike, PointLike] = [[point.x - reach, point.y - reach], [point.x + reach, point.y + reach]];
        let best = Infinity;
        for (const feature of currentMap.queryRenderedFeatures(box, { layers: [LAYER.pins] })) {
          if (feature.geometry.type !== 'Point') continue;
          const at = currentMap.project(feature.geometry.coordinates as [number, number]);
          const distance = Math.hypot(at.x - point.x, at.y - point.y);
          if (distance > reach) continue;
          const industry = feature.properties?.industry as unknown;
          const receded = !pinInFocus(view, typeof industry === 'string' ? industry : null);
          const rank = distance + (receded ? 1000 : 0);
          if (rank < best) {
            best = rank;
            hit.pin = feature;
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

      /** What a click on `hit` does: a pin first, then a focus area, then a state. */
      const actOn = (hit: Hit): void => {
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
      };

      // A tap is not acted on at once: a second tap in the same place makes
      // it a double tap, which zooms (MapLibre's own gesture) and must not
      // also select the state under it. So a selection waits out the
      // double-tap window, and anything that starts moving the camera inside
      // that window cancels it. The one exception is a mouse click on a pin:
      // the hover card has already said what it is, and it answers at once.
      let pendingTap: { timer: number; point: maplibregl.Point } | null = null;
      let lastTouchAt = -Infinity;
      const cancelTap = () => {
        if (!pendingTap) return;
        window.clearTimeout(pendingTap.timer);
        pendingTap = null;
      };
      const noteTouch = () => {
        lastTouchAt = performance.now();
      };
      currentMap.on('touchstart', noteTouch);
      currentMap.on('touchend', noteTouch);

      currentMap.on('click', (e: MapMouseEvent) => {
        if (pendingTap) {
          const first = pendingTap.point;
          cancelTap();
          // The second tap of a double tap: the zoom is MapLibre's to do.
          if (Math.hypot(e.point.x - first.x, e.point.y - first.y) <= DOUBLE_TAP_SLOP_PX) return;
        }
        const touch = performance.now() - lastTouchAt < TOUCH_CLICK_WINDOW_MS;
        const hit = hitTest(e.point, touch);
        if (hit.pin && !touch) {
          actOn(hit);
          return;
        }
        const timer = window.setTimeout(() => {
          pendingTap = null;
          actOn(hit);
        }, TAP_SETTLE_MS);
        pendingTap = { timer, point: e.point };
      });
      currentMap.on('dblclick', cancelTap);
      currentMap.on('movestart', cancelTap);
      currentMap.on('remove', cancelTap);

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
        const hit = hitTest(pending, false);
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
        const center = map.current.getCenter();
        resumeCamera = { center: [center.lng, center.lat], zoom: map.current.getZoom() };
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
    if (!m || !mapLoaded || !lngLat || heldByAddressRef.current) return;
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

  // What the pins show: the filters and the subject, as filter and paint
  // expressions over the one source. The state shading is an all-factories
  // reference; while the map has a subject it steps back so it is not read as
  // that company's or that career's footprint.
  const hasSubject = pinView.companyPlants !== null || pinView.careerIndustries !== null;
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    try {
      setPinView(map.current, pinView);
      setStateShadingDimmed(map.current, hasSubject);
    } catch (err) {
      console.error('Failed to apply the pin view:', err);
    }
  }, [pinView, hasSubject, mapLoaded]);

  // A company that has just become the subject is framed: all of its plants,
  // wherever they are. Not while one of its plants is being looked at, and
  // not over a camera that came with the link.
  const framedCompanyRef = useRef<string | null>(null);
  const flyTo = useMapStore((s) => s.flyTo);
  useEffect(() => {
    if (!filters.company) {
      framedCompanyRef.current = null;
      return;
    }
    if (!subjectCompany || !mapLoaded || framedCompanyRef.current === filters.company) return;
    framedCompanyRef.current = filters.company;
    if (useMapStore.getState().selectedEntityType === 'factory') return;
    const points = subjectCompany.factories
      .filter((f) => f.latitude && f.longitude)
      .map((f): [number, number] => [parseFloat(f.longitude as string), parseFloat(f.latitude as string)])
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
    if (points.length > 0) flyTo({ kind: 'points', points });
  }, [filters.company, subjectCompany, mapLoaded, flyTo]);

  // A career's plants are everywhere, so choosing one does not move the
  // camera. The one case: the home view on a desktop, where the panel that
  // has just opened covers the east coast. The country is framed again in
  // the room that is left.
  useEffect(() => {
    if (!filters.career || !mapLoaded || awayFromHome || isPhoneLayout()) return;
    flyTo({ kind: 'us' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.career, mapLoaded]);

  // The camera a link carries stays put until the person does something.
  useEffect(() => {
    const release = () => {
      heldByAddressRef.current = false;
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'popstate'] as const;
    for (const name of events) window.addEventListener(name, release, { capture: true, passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, release, { capture: true });
    };
  }, []);

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
    if (heldByAddressRef.current) {
      firstRequestRef.current = false;
      clearFlyTo();
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
  const sheetDetent = useMapStore((s) => s.sheetDetent);
  const coveredBottom = sidebarOpen && phone ? (sheetDetent === 'bar' ? SHEET_BAR_PX : sheetPeekPx()) : 0;

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
            className="map-overlay map-overlay-button map-control flex items-center justify-center rounded-lg"
            title="Reset view"
            aria-label="Reset view"
          >
            <Maximize2 className="h-[18px] w-[18px]" />
          </button>
          <div className="map-overlay flex flex-col overflow-hidden rounded-lg">
            <button
              type="button"
              onClick={() => map.current && zoomBy(map.current, 1)}
              className="map-overlay-button map-control flex items-center justify-center"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>
            <span className="h-px bg-border-strong" aria-hidden="true" />
            <button
              type="button"
              onClick={() => map.current && zoomBy(map.current, -1)}
              className="map-overlay-button map-control flex items-center justify-center"
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
          <Loader2 className="w-8 h-8 text-fg-muted animate-spin" role="status" aria-label="Loading the map" />
        </div>
      )}

      {/* Error state */}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-base">
          <div className="flex flex-col items-center gap-3 text-center px-4">
            <span className="text-fg-default">The map could not be loaded.</span>
            <span className="text-sm text-fg-muted">{mapError}</span>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 text-sm bg-tint/10 rounded-lg hover:bg-tint/20 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
