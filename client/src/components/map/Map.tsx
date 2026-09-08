import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl, { Map as MapLibreMap, GeoJSONSource, MapMouseEvent, LngLatBounds, type ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useQuery } from '@tanstack/react-query';
import { factoriesApi, mapApi } from '../../lib/api';
import { useMapStore } from '../../stores/mapStore';
import { US_STATES } from '@shared/states';
import { Loader2, Maximize2 } from 'lucide-react';

// MapTiler style base URL - key added at runtime for retry support
const MAPTILER_STYLE_BASE = 'https://api.maptiler.com/maps/dataviz-dark/style.json';

// Custom darker style overrides applied after map loads
const DARK_STYLE_OVERRIDES = {
  background: '#080808',
  land: '#0a0a0a',
  water: '#050505',
  borders: '#1a1a1a',
};

const INITIAL_VIEW = {
  center: [-98.5, 39.8] as [number, number],
  zoom: 4,
};

// Continental US. The default view fits this box so the whole country is on
// screen at any viewport shape — a fixed zoom felt cramped on portrait phones.
const US_BOUNDS: [[number, number], [number, number]] = [[-125.0, 24.4], [-66.9, 49.4]];

function fitUS(m: MapLibreMap, animate: boolean) {
  const mobile = window.innerWidth < 768;
  m.fitBounds(US_BOUNDS, {
    padding: mobile ? { top: 96, bottom: 24, left: 12, right: 12 } : { top: 96, bottom: 40, left: 40, right: 40 },
    duration: animate ? 600 : 0,
  });
}

// US States GeoJSON, shipped with the app (client/public/data)
const STATES_GEOJSON_URL = '/data/us-states.geojson';

// Debounce helper for viewport updates
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

export default function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const hoveredFactoryIdRef = useRef<string | null>(null);
  const previousSelectedIdRef = useRef<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<{
    bounds: LngLatBounds | null;
    zoom: number;
  }>({ bounds: null, zoom: INITIAL_VIEW.zoom });

  const {
    selectedEntityType,
    selectedEntityId,
    selectFactory,
    selectState,
    setHoveredFactory,
    hoveredFactoryId,
    setSidebarOpen,
    clearSelection,
    filters,
    flyToTarget,
    clearFlyTo,
    resetView,
  } = useMapStore();

  // Stable refs for callbacks to avoid recreating map on every render
  const selectFactoryRef = useRef(selectFactory);
  const selectStateRef = useRef(selectState);
  const setHoveredFactoryRef = useRef(setHoveredFactory);
  const setSidebarOpenRef = useRef(setSidebarOpen);
  const clearSelectionRef = useRef(clearSelection);
  
  useEffect(() => {
    selectFactoryRef.current = selectFactory;
    selectStateRef.current = selectState;
    setHoveredFactoryRef.current = setHoveredFactory;
    setSidebarOpenRef.current = setSidebarOpen;
    clearSelectionRef.current = clearSelection;
  });

  // Track if map is zoomed in (for showing reset button)
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  // Only use factory selection for map markers
  const selectedFactoryId = selectedEntityType === 'factory' ? selectedEntityId : null;

  // Build filter params for GeoJSON query including viewport bounds
  const filterParams = {
    states: filters.states.length > 0 ? filters.states : undefined,
    company: filters.company || undefined,
    industry: filters.industry || undefined,
    // Add viewport bounds for large datasets (only at higher zoom levels)
    bounds: viewport.bounds && viewport.zoom >= 6
      ? [
          viewport.bounds.getWest(),
          viewport.bounds.getSouth(),
          viewport.bounds.getEast(),
          viewport.bounds.getNorth(),
        ].join(',')
      : undefined,
  };

  // Fetch factories GeoJSON with filters and viewport
  const { data: factoriesGeoJSON } = useQuery({
    queryKey: [
      'factories-geojson',
      filters.states,
      filters.company,
      filters.industry,
      filterParams.bounds,
    ],
    queryFn: () => factoriesApi.geojson(filterParams),
    staleTime: 30 * 1000, // 30 seconds - shorter for viewport changes
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  });

  // State-level factory counts (for the continental-zoom choropleth)
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
  const statesWithCounts = useMemo(() => {
    if (!statesGeoJSONRaw || !stateCounts) return null;
    // Plain object lookup — the component itself is named `Map`, which
    // shadows the built-in Map constructor inside this file.
    const nameToCode: Record<string, string> = {};
    for (const s of US_STATES) nameToCode[s.name] = s.code;
    return {
      ...statesGeoJSONRaw,
      features: statesGeoJSONRaw.features.map((f) => {
        const name = f.properties?.name as string | undefined;
        const code = name ? nameToCode[name] : undefined;
        const count = code ? (stateCounts[code] ?? 0) : 0;
        return { ...f, properties: { ...(f.properties ?? {}), stateCode: code, factoryCount: count } };
      }),
    } as GeoJSON.FeatureCollection;
  }, [statesGeoJSONRaw, stateCounts]);

  // Handle click outside markers to close panel
  // Moved inside init to use stable ref, avoiding useCallback dependency issues
  const handleMapClickRef = useRef((e: MapMouseEvent) => {
    if (!map.current) return;

    // Check all marker layers including glow
    const features = map.current.queryRenderedFeatures(e.point, {
      layers: [
        'factory-points',
        'factory-points-glow',
      ],
    });

    if (features.length === 0) {
      setSidebarOpenRef.current(false);
    }
  });

  // Debounced viewport update - created once and stored in ref
  const updateViewportRef = useRef(
    debounce((currentMap: MapLibreMap) => {
      setViewport({
        bounds: currentMap.getBounds(),
        zoom: currentMap.getZoom(),
      });
    }, 300)
  );

  // Initialize map with retry logic
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    let retryCount = 0;
    const maxRetries = 3;

    const initMap = () => {
      // Get key fresh each attempt
      const styleUrl = `${MAPTILER_STYLE_BASE}?key=${import.meta.env.VITE_MAP_TOKEN || ''}`;

      try {
        map.current = new maplibregl.Map({
          container: mapContainer.current!,
          style: styleUrl,
          center: INITIAL_VIEW.center,
          zoom: INITIAL_VIEW.zoom,
          minZoom: 2,
          maxZoom: 18,
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

      // Handle map errors with auto-retry
      currentMap.on('error', (e) => {
        console.error('Map error:', e);
        const isStyleError = e.error?.message?.includes('style') ||
                            e.error?.message?.includes('Style') ||
                            e.error?.message?.includes('401');
        if (isStyleError && retryCount < maxRetries) {
          retryCount++;
          map.current?.remove();
          map.current = null;
          setTimeout(initMap, 500);
        } else if (isStyleError) {
          setMapError('Failed to load map. Please check your API key.');
        }
      });

      // Note: Zoom controls removed for cleaner UI - use scroll/pinch to zoom

      currentMap.on('load', () => {
      // Force a resize once the style loads in case container dimensions
      // weren't final when the map was created (lazy-loaded route, fonts
      // settling, etc.). Critically, we must also recenter after resize -
      // resize() alone recalculates canvas size but doesn't fix the center.
      // Without this explicit recenter, the viewport can drift (Pacific bug).
      currentMap.resize();
      fitUS(currentMap, false);

      setMapLoaded(true);

      // Apply darker style overrides and hide all non-US details
      const style = currentMap.getStyle();
      if (style?.layers) {
        style.layers.forEach((layer) => {
          try {
            const layerId = layer.id.toLowerCase();

            if (layer.type === 'background') {
              currentMap.setPaintProperty(layer.id, 'background-color', DARK_STYLE_OVERRIDES.background);
            }

            if (layer.type === 'fill' && layerId.includes('water')) {
              currentMap.setPaintProperty(layer.id, 'fill-color', DARK_STYLE_OVERRIDES.water);
            }

            if (layer.type === 'line' && (
              layerId.includes('admin') ||
              layerId.includes('boundary') ||
              layerId.includes('border') ||
              layerId.includes('country')
            )) {
              currentMap.setLayoutProperty(layer.id, 'visibility', 'none');
            }

            if (layer.type === 'symbol') {
              currentMap.setLayoutProperty(layer.id, 'visibility', 'none');
            }
          } catch {
            // Some layers may not support these properties
          }
        });
      }

      // States source (empty at init — populated by effect below once both
      // GeoJSON geometry and factory counts have loaded). promoteId lifts
      // stateCode to the feature id so hover/selected feature-state calls
      // can key off it.
      try {
        currentMap.addSource('states', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          promoteId: 'stateCode',
        });

        // Choropleth fill — shaded by factory count, fading out across
        // zoom 5 → 6.5 so pins can take over without a hard cut.
        // MapLibre rejects data-interpolate wrapped inside zoom-interpolate,
        // so we hand-build a multi-step fade via `step` on zoom. Each step
        // is its own count-driven interpolate with scaled output stops.
        currentMap.addLayer({
          id: 'state-fills',
          type: 'fill',
          source: 'states',
          paint: {
            // One cool-neutral hue. Selection is identified by a dedicated
            // border layer below, not by a contrasting fill color — keeps
            // the whole choropleth in one tonal family so warm base-map
            // texture can't bleed through as "beige" or "tan".
            'fill-color': [
              'case',
              ['boolean', ['feature-state', 'hover'], false], '#C6D1DE',
              '#A3B1C2',
            ],
            'fill-opacity': [
              'step', ['zoom'],
              // Floor (0.12) means even low-count states mask most of the
              // base texture instead of fading toward it. Top end softened
              // (0.44 vs 0.55) so high-count states don't dominate.
              ['interpolate', ['linear'], ['get', 'factoryCount'],
                0, 0,
                50, 0.12,
                200, 0.18,
                800, 0.28,
                2500, 0.38,
                6000, 0.44,
              ],
              5.5, ['interpolate', ['linear'], ['get', 'factoryCount'],
                0, 0,
                50, 0.08,
                200, 0.12,
                800, 0.18,
                2500, 0.26,
                6000, 0.3,
              ],
              6, ['interpolate', ['linear'], ['get', 'factoryCount'],
                0, 0,
                2500, 0.06,
                6000, 0.08,
              ],
              6.3, 0,
            ],
          },
        });

        // Base border layer — subtle, always visible.
        currentMap.addLayer({
          id: 'state-borders',
          type: 'line',
          source: 'states',
          paint: {
            'line-color': '#2a2a2a',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              3, 0.5,
              6, 0.8,
              10, 1,
            ],
            'line-opacity': [
              'interpolate', ['linear'], ['zoom'],
              3, 0.7,
              10, 0.5,
            ],
          },
        });

        // Selected-state border — sits on top, brighter and thicker,
        // visible at all zooms. This is how the user identifies "which
        // state am I in" after zooming past the choropleth-fade zoom.
        // Filter starts empty (matches nothing); updated via setFilter
        // whenever the selected state changes.
        currentMap.addLayer({
          id: 'state-selected-border',
          type: 'line',
          source: 'states',
          filter: ['==', ['get', 'stateCode'], ''],
          paint: {
            'line-color': '#93C5FD', // sky-300 — matches pin highlight family
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              3, 1.5,
              6, 2,
              10, 2.5,
            ],
            'line-opacity': 0.8,
            'line-blur': 0.2,
          },
        });
      } catch (err) {
        console.error('Failed to add US states layers:', err);
      }

      // Factories source — clustering OFF per design spec (white dots at all zooms).
      // Visual density from overlapping white dots with controlled opacity/glow,
      // NOT from blue count-badge clusters.
      // `promoteId: 'id'` lifts properties.id to the feature id MapLibre
      // uses for feature-state (hover/selected). Our ids are UUID strings;
      // MapLibre doesn't treat string top-level ids as ids, so promoteId
      // is the clean way to use them.
      currentMap.addSource('factories', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'id',
      });

      // Pin glow — white halo with controlled blur/opacity per design spec.
      // Overlapping halos in dense regions softly bloom without hard edges.
      // Design spec: z3-5 blur 4-6 opacity 0.12-0.18, z6-8 blur 6-8 opacity 0.18-0.22, z≥9 blur 8-10 opacity 0.22-0.28
      // Selected/hover: +0.08 opacity
      currentMap.addLayer({
        id: 'factory-points-glow',
        type: 'circle',
        source: 'factories',
        paint: {
          'circle-color': '#ffffff',
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, ['case', ['boolean', ['feature-state', 'selected'], false], 6, ['boolean', ['feature-state', 'hover'], false], 5, 4],
            5, ['case', ['boolean', ['feature-state', 'selected'], false], 8, ['boolean', ['feature-state', 'hover'], false], 7, 6],
            6, ['case', ['boolean', ['feature-state', 'selected'], false], 9, ['boolean', ['feature-state', 'hover'], false], 8, 7],
            8, ['case', ['boolean', ['feature-state', 'selected'], false], 10, ['boolean', ['feature-state', 'hover'], false], 9, 8],
            9, ['case', ['boolean', ['feature-state', 'selected'], false], 12, ['boolean', ['feature-state', 'hover'], false], 11, 10],
          ],
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            3, ['case', ['boolean', ['feature-state', 'selected'], false], 0.2, ['boolean', ['feature-state', 'hover'], false], 0.18, 0.12],
            5, ['case', ['boolean', ['feature-state', 'selected'], false], 0.26, ['boolean', ['feature-state', 'hover'], false], 0.24, 0.18],
            6, ['case', ['boolean', ['feature-state', 'selected'], false], 0.26, ['boolean', ['feature-state', 'hover'], false], 0.24, 0.18],
            8, ['case', ['boolean', ['feature-state', 'selected'], false], 0.3, ['boolean', ['feature-state', 'hover'], false], 0.28, 0.22],
            9, ['case', ['boolean', ['feature-state', 'selected'], false], 0.36, ['boolean', ['feature-state', 'hover'], false], 0.34, 0.28],
          ],
          'circle-blur': [
            'interpolate', ['linear'], ['zoom'],
            3, 0.5,
            5, 0.55,
            6, 0.55,
            8, 0.6,
            9, 0.65,
          ],
        },
      });

      // Pin cores — white dots visible at all zoom levels per design spec.
      // Design spec: z3-5 diameter 3-4px opacity 0.55-0.65, z6-8 diameter 5-6px opacity 0.75-0.85, z≥9 diameter 7-8px max opacity 0.90-0.95
      // Selected/hover: +1-2px core, opacity 1.0
      currentMap.addLayer({
        id: 'factory-points',
        type: 'circle',
        source: 'factories',
        paint: {
          'circle-color': '#ffffff',
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, ['case', ['boolean', ['feature-state', 'selected'], false], 5, ['boolean', ['feature-state', 'hover'], false], 4, 3],
            5, ['case', ['boolean', ['feature-state', 'selected'], false], 6, ['boolean', ['feature-state', 'hover'], false], 5, 4],
            6, ['case', ['boolean', ['feature-state', 'selected'], false], 7, ['boolean', ['feature-state', 'hover'], false], 6, 5],
            8, ['case', ['boolean', ['feature-state', 'selected'], false], 8, ['boolean', ['feature-state', 'hover'], false], 7, 6],
            9, ['case', ['boolean', ['feature-state', 'selected'], false], 9, ['boolean', ['feature-state', 'hover'], false], 8, 7],
            12, ['case', ['boolean', ['feature-state', 'selected'], false], 10, ['boolean', ['feature-state', 'hover'], false], 9, 8],
          ],
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            3, ['case', ['boolean', ['feature-state', 'selected'], false], 1.0, ['boolean', ['feature-state', 'hover'], false], 1.0, 0.55],
            5, ['case', ['boolean', ['feature-state', 'selected'], false], 1.0, ['boolean', ['feature-state', 'hover'], false], 1.0, 0.65],
            6, ['case', ['boolean', ['feature-state', 'selected'], false], 1.0, ['boolean', ['feature-state', 'hover'], false], 1.0, 0.75],
            8, ['case', ['boolean', ['feature-state', 'selected'], false], 1.0, ['boolean', ['feature-state', 'hover'], false], 1.0, 0.85],
            9, ['case', ['boolean', ['feature-state', 'selected'], false], 1.0, ['boolean', ['feature-state', 'hover'], false], 1.0, 0.90],
            12, ['case', ['boolean', ['feature-state', 'selected'], false], 1.0, ['boolean', ['feature-state', 'hover'], false], 1.0, 0.95],
          ],
        },
      });

      // Selected marker ring — soft white ring per design spec (1.5px #FFF@0.35)
      // Scaled proportionally with zoom
      currentMap.addLayer({
        id: 'factory-selected',
        type: 'circle',
        source: 'factories',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': 'transparent',
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 6,
            5, 7,
            6, 8,
            8, 10,
            9, 11,
            12, 14,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.35,
        },
      });

      // === EVENT HANDLERS ===

      // Factory marker click — dots are now visible and clickable at all zoom levels
      currentMap.on('click', 'factory-points', (e) => {
        if (!e.features?.[0]) return;
        const factoryId = e.features[0].id;
        if (typeof factoryId === 'string') {
          selectFactoryRef.current(factoryId);

          const geometry = e.features[0].geometry;
          if (geometry.type === 'Point') {
            // On mobile, add bottom padding so marker is centered ABOVE the bottom sheet
            const isMobile = window.innerWidth < 768;
            const bottomSheetHeight = isMobile ? window.innerHeight * 0.32 : 0;
            
            currentMap.flyTo({
              center: geometry.coordinates as [number, number],
              zoom: Math.max(currentMap.getZoom(), 8),
              duration: 500,
              padding: isMobile 
                ? { top: 20, bottom: bottomSheetHeight + 20, left: 20, right: 20 }
                : { top: 20, bottom: 20, left: 20, right: 400 },
            });
          }
        }
      });

      // Hover on factory markers — dots are now interactive at all zoom levels
      currentMap.on('mouseenter', 'factory-points', (e) => {
        currentMap.getCanvas().style.cursor = 'pointer';
        const id = e.features?.[0]?.id;
        if (typeof id === 'string') {
          hoveredFactoryIdRef.current = id;
          setHoveredFactoryRef.current(id, { x: e.point.x, y: e.point.y });

          currentMap.setFeatureState(
            { source: 'factories', id },
            { hover: true }
          );
        }
      });

      currentMap.on('mouseleave', 'factory-points', () => {
        currentMap.getCanvas().style.cursor = '';
        if (hoveredFactoryIdRef.current) {
          currentMap.setFeatureState(
            { source: 'factories', id: hoveredFactoryIdRef.current },
            { hover: false }
          );
          hoveredFactoryIdRef.current = null;
          setHoveredFactoryRef.current(null);
        }
      });

      // Map click (for closing panel)
      currentMap.on('click', handleMapClickRef.current);

      // ─── State fill interactions ────────────────────────────────────
      // Click a state → select it, set filter, fly to fit its bounds.
      // Always check for pin clicks first (pins have priority at all zoom levels).
      let hoveredStateCode: string | null = null;
      currentMap.on('click', 'state-fills', (e) => {
        if (!e.features?.[0]) return;
        // If the user clicked a visible pin, the pin wins — at any zoom. Pins are
        // drawn from zoom 3 up, so gating this on zoom >= 8 meant a click on a
        // dot at zoom 6 selected the factory and then immediately re-selected
        // the state underneath it.
        const pinHit = currentMap.queryRenderedFeatures(e.point, { layers: ['factory-points', 'factory-points-glow'] });
        if (pinHit.length > 0) return;
        const code = e.features[0].properties?.stateCode as string | undefined;
        if (!code) return;
        selectStateRef.current(code);
        fitStateRef.current(currentMap, code, e.features[0].geometry);
      });

      // Hover a state → brighten its fill + cursor pointer. Only at
      // zooms where clusters are the primary interaction (< 8).
      currentMap.on('mousemove', 'state-fills', (e) => {
        if (currentMap.getZoom() >= 8) return;
        const f = e.features?.[0];
        const code = f?.properties?.stateCode as string | undefined;
        if (!code) return;
        currentMap.getCanvas().style.cursor = 'pointer';
        if (hoveredStateCode && hoveredStateCode !== code) {
          currentMap.setFeatureState({ source: 'states', id: hoveredStateCode }, { hover: false });
        }
        hoveredStateCode = code;
        currentMap.setFeatureState({ source: 'states', id: code }, { hover: true });
      });
      currentMap.on('mouseleave', 'state-fills', () => {
        currentMap.getCanvas().style.cursor = '';
        if (hoveredStateCode) {
          currentMap.setFeatureState({ source: 'states', id: hoveredStateCode }, { hover: false });
          hoveredStateCode = null;
        }
      });

      // Right-click anywhere → clear any lingering selection (factory or
      // state). Addresses the "persistent blue ring after closing sidebar"
      // bug: reset-view and empty-click don't always drop the selection.
      currentMap.on('contextmenu', (e) => {
        e.preventDefault();
        clearSelectionRef.current();
      });

      // Track viewport for data loading
      currentMap.on('moveend', () => {
        updateViewportRef.current(currentMap);
      });

      // Set initial viewport
      setViewport({
        bounds: currentMap.getBounds(),
        zoom: currentMap.getZoom(),
      });
    });

      // Track zoom level for reset button
      currentMap.on('zoom', () => {
        setIsZoomedIn(currentMap.getZoom() > 5);
      });
    }; // end initMap

    // Small delay on initial load to ensure env is ready
    const initTimer = setTimeout(initMap, 100);

    return () => {
      clearTimeout(initTimer);
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      // Reset mapLoaded so data effects will fire on remount
      setMapLoaded(false);
    };
  }, []); // Empty deps - map is created once, callbacks use stable refs

  // Update factories data when loaded.
  // Depends on mapLoaded too — so that after a route-level remount
  // (Map → Nodes → Map), the freshly-created map source gets populated
  // even though the cached GeoJSON reference hasn't changed.
  useEffect(() => {
    if (!map.current || !mapLoaded || !factoriesGeoJSON) return;

    const currentMap = map.current;
    
    // Retry logic: source might not be ready immediately after style loads
    const updateSource = () => {
      const source = currentMap.getSource('factories') as GeoJSONSource | undefined;
      if (!source) {
        console.warn('Factories source not ready, retrying...');
        setTimeout(updateSource, 100);
        return;
      }
      // Server provides top-level `id` on each feature already — no client-side
      // id synthesis needed.
      source.setData(factoriesGeoJSON);
    };
    
    updateSource();
  }, [factoriesGeoJSON, mapLoaded]);

  // Populate the states source once both the GeoJSON geometry and the
  // factory counts have loaded. Re-fires on mapLoaded so fresh map
  // instances get the data after a route-level remount.
  useEffect(() => {
    if (!map.current || !mapLoaded || !statesWithCounts) return;
    
    const currentMap = map.current;
    
    // Retry logic: source might not be ready immediately after style loads
    const updateSource = () => {
      const source = currentMap.getSource('states') as GeoJSONSource | undefined;
      if (!source) {
        console.warn('States source not ready, retrying...');
        setTimeout(updateSource, 100);
        return;
      }
      source.setData(statesWithCounts);
    };
    
    updateSource();
  }, [statesWithCounts, mapLoaded]);

  // Ref mirror of statesWithCounts so the state-click handler (captured
  // inside the load callback) can access the latest full GeoJSON for
  // bbox computation. Without this, it would close over the initial
  // `null` value.
  const statesWithCountsRef = useRef<GeoJSON.FeatureCollection | null>(null);

  // Fit the viewport to a state, keeping it clear of the desktop panel or the
  // phone bottom sheet. Uses our full in-memory geometry (tile features are
  // clipped at tile edges) and falls back to whatever geometry was clicked.
  const fitStateRef = useRef((m: MapLibreMap, code: string, fallback?: GeoJSON.Geometry) => {
    const full = statesWithCountsRef.current?.features?.find(
      (f) => (f.properties as { stateCode?: string } | null)?.stateCode === code
    );
    const geom = full?.geometry ?? fallback;
    if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return;
    const bounds = new maplibregl.LngLatBounds();
    type Coords = number[] | Coords[];
    const extend = (coords: Coords) => {
      if (typeof coords[0] === 'number') bounds.extend(coords as [number, number]);
      else for (const c of coords as Coords[]) extend(c);
    };
    extend(geom.coordinates as Coords);
    if (bounds.isEmpty()) return;
    const isMobile = window.innerWidth < 768;
    m.fitBounds(bounds, {
      padding: isMobile
        ? { top: 90, bottom: Math.round(window.innerHeight * 0.32) + 24, left: 24, right: 24 }
        : { top: 80, bottom: 80, left: 80, right: 420 },
      maxZoom: 7,
      duration: 800,
    });
  });

  // A shared link like /map?state=TX selects the state before the map exists;
  // once tiles and geometry are ready, frame it exactly as a click would.
  const initialStateFitDone = useRef(false);
  useEffect(() => {
    if (initialStateFitDone.current || !mapLoaded || !map.current || !statesWithCounts) return;
    initialStateFitDone.current = true;
    if (selectedEntityType === 'state' && selectedEntityId) fitStateRef.current(map.current, selectedEntityId);
  }, [mapLoaded, statesWithCounts, selectedEntityType, selectedEntityId]);
  useEffect(() => {
    statesWithCountsRef.current = statesWithCounts;
  }, [statesWithCounts]);

  // When a company filter is active we force pins to full visibility at every
  // zoom — otherwise "Locate All Factories" on a national company flies
  // to continental view and the pins remain at their default low opacity.
  // Ref mirror lets the click/hover handlers (captured in the load callback) check this too.
  const pinsAlwaysVisible = !!filters.company;
  const pinsAlwaysVisibleRef = useRef(pinsAlwaysVisible);
  useEffect(() => {
    pinsAlwaysVisibleRef.current = pinsAlwaysVisible;
  }, [pinsAlwaysVisible]);

  // Default zoom-based opacity curves per design spec, used when no company
  // filter forces pins on. White dots visible at all zoom levels with controlled opacity.
  const defaultPointOpacity: ExpressionSpecification = [
    'interpolate', ['linear'], ['zoom'],
    3, 0.55, 5, 0.65, 6, 0.75, 8, 0.85, 9, 0.90, 12, 0.95,
  ];
  const defaultGlowOpacity: ExpressionSpecification = [
    'interpolate', ['linear'], ['zoom'],
    3, 0.12, 5, 0.18, 6, 0.18, 8, 0.22, 9, 0.28,
  ];

  // Default state-fills opacity curve — mirrors the inline paint set up
  // in the load callback so the company-filter toggle can restore it.
  const defaultStateFillOpacity: ExpressionSpecification = [
    'step', ['zoom'],
    ['interpolate', ['linear'], ['get', 'factoryCount'],
      0, 0, 50, 0.12, 200, 0.18, 800, 0.28, 2500, 0.38, 6000, 0.44,
    ],
    5.5, ['interpolate', ['linear'], ['get', 'factoryCount'],
      0, 0, 50, 0.08, 200, 0.12, 800, 0.18, 2500, 0.26, 6000, 0.3,
    ],
    6, ['interpolate', ['linear'], ['get', 'factoryCount'],
      0, 0, 2500, 0.06, 6000, 0.08,
    ],
    6.3, 0,
  ];

  // Swap pin paint opacity when the company filter toggles. With a filter
  // active the result set is small enough that always-on doesn't bloom.
  // Also dim the state-fills so the choropleth doesn't read as "this is
  // the filtered company's density" — the choropleth is an all-factories
  // reference and should step back when the focus is one company.
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const m = map.current;
    if (!m.getLayer('factory-points') || !m.getLayer('factory-points-glow')) return;
    try {
      m.setPaintProperty('factory-points', 'circle-opacity',
        pinsAlwaysVisible ? 0.85 : defaultPointOpacity);
      m.setPaintProperty('factory-points-glow', 'circle-opacity',
        pinsAlwaysVisible ? 0.22 : defaultGlowOpacity);
      // Dim state fills while a company filter is on — keeps them as a
      // subtle territory guide without competing with the pin story.
      if (m.getLayer('state-fills')) {
        m.setPaintProperty('state-fills', 'fill-opacity', pinsAlwaysVisible
          ? 0.04
          : defaultStateFillOpacity);
      }
    } catch { /* layers may not be ready yet — the effect re-fires with mapLoaded */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsAlwaysVisible, mapLoaded]);

  // Track the previously-selected state so we can clear its feature-state
  // when a different state (or nothing) is selected. Also drives the
  // state-selected-border layer's filter so exactly one state is outlined.
  const previousSelectedStateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const currentMap = map.current;
    const prev = previousSelectedStateRef.current;
    const next = selectedEntityType === 'state' ? selectedEntityId : null;
    if (prev && prev !== next) {
      try {
        currentMap.setFeatureState({ source: 'states', id: prev }, { selected: false });
      } catch { /* source may not be ready */ }
    }
    if (next) {
      try {
        currentMap.setFeatureState({ source: 'states', id: next }, { selected: true });
      } catch { /* source may not be ready */ }
    }
    // Update the selected-border filter to show exactly the one state (or none)
    try {
      currentMap.setFilter('state-selected-border', ['==', ['get', 'stateCode'], next ?? '']);
    } catch { /* layer may not be ready */ }
    previousSelectedStateRef.current = next;
  }, [selectedEntityType, selectedEntityId, mapLoaded]);

  // Optimized selection update - only update changed features
  useEffect(() => {
    if (!map.current) return;

    const currentMap = map.current;

    const updateSelection = () => {
      // Update filter for selected ring layer
      currentMap.setFilter('factory-selected', [
        '==',
        ['get', 'id'],
        selectedFactoryId || '',
      ]);

      // Only update feature state for changed features (optimization)
      const prevId = previousSelectedIdRef.current;

      if (prevId && prevId !== selectedFactoryId) {
        try {
          currentMap.setFeatureState(
            { source: 'factories', id: prevId },
            { selected: false }
          );
        } catch {
          // Feature may not exist anymore
        }
      }

      if (selectedFactoryId) {
        try {
          currentMap.setFeatureState(
            { source: 'factories', id: selectedFactoryId },
            { selected: true }
          );
        } catch {
          // Feature may not be loaded yet
        }
      }

      previousSelectedIdRef.current = selectedFactoryId;
    };

    if (currentMap.isStyleLoaded()) {
      updateSelection();
    } else {
      currentMap.once('load', updateSelection);
    }
  }, [selectedFactoryId]);

  // Respond to hover changes from sidebar (not just direct map hover)
  useEffect(() => {
    if (!map.current) return;

    const currentMap = map.current;

    const updateHover = () => {
      // Clear previous hover if different
      const prevHovered = hoveredFactoryIdRef.current;
      if (prevHovered && prevHovered !== hoveredFactoryId) {
        try {
          currentMap.setFeatureState(
            { source: 'factories', id: prevHovered },
            { hover: false }
          );
        } catch {
          // Feature may not exist
        }
      }

      // Set new hover
      if (hoveredFactoryId) {
        try {
          currentMap.setFeatureState(
            { source: 'factories', id: hoveredFactoryId },
            { hover: true }
          );
        } catch {
          // Feature may not be loaded yet
        }
      }

      hoveredFactoryIdRef.current = hoveredFactoryId;
    };

    if (currentMap.isStyleLoaded()) {
      updateHover();
    }
  }, [hoveredFactoryId]);

  // Respond to flyTo requests from the store
  useEffect(() => {
    if (!map.current || !flyToTarget) return;

    const currentMap = map.current;

    if (flyToTarget.fit === 'us') {
      fitUS(currentMap, true);
      clearFlyTo();
      return;
    }

    // Build flyTo options
    const flyToOptions: maplibregl.FlyToOptions = {
      center: [flyToTarget.lng, flyToTarget.lat],
      zoom: flyToTarget.zoom ?? Math.max(currentMap.getZoom(), 8),
      duration: 500,
    };

    // Apply padding to offset for UI elements like sidebar
    if (flyToTarget.padding) {
      flyToOptions.padding = {
        top: flyToTarget.padding.top ?? 0,
        bottom: flyToTarget.padding.bottom ?? 0,
        left: flyToTarget.padding.left ?? 0,
        right: flyToTarget.padding.right ?? 0,
      };
    }

    currentMap.flyTo(flyToOptions);

    clearFlyTo();
  }, [flyToTarget, clearFlyTo]);

  return (
    <>
      <div
        ref={mapContainer}
        className="absolute inset-0 w-full h-full"
        style={{ background: '#080808' }}
      />

      {/* Reset view button */}
      {isZoomedIn && mapLoaded && (
        <button
          onClick={resetView}
          className="absolute bottom-24 right-3 z-30 p-2.5 rounded-lg
            bg-bg-surface/90 backdrop-blur-sm border border-white/10
            text-fg-muted hover:text-fg-default hover:bg-bg-surface
            transition-all shadow-lg"
          title="Reset to full US view"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
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
            <span className="text-sm text-fg-soft">{mapError}</span>
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
