import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import maplibregl, { Map as MapLibreMap, GeoJSONSource, MapMouseEvent, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useQuery } from '@tanstack/react-query';
import { factoriesApi } from '../../lib/api';
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

// US States GeoJSON from GitHub (reliable CDN)
const STATES_GEOJSON_URL = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

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
    setHoveredFactory,
    hoveredFactoryId,
    setSidebarOpen,
    filters,
    flyToTarget,
    clearFlyTo,
    resetView,
  } = useMapStore();

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
    queryFn: () => fetch('/api/map/state-counts').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Raw US states GeoJSON geometry
  const { data: statesGeoJSONRaw } = useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['states-geojson'],
    queryFn: () => fetch(STATES_GEOJSON_URL).then(r => r.json()),
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
  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (!map.current) return;

    // Check all marker layers including glow
    const features = map.current.queryRenderedFeatures(e.point, {
      layers: [
        'factory-points',
        'factory-points-glow',
      ],
    });

    if (features.length === 0) {
      setSidebarOpen(false);
    }
  }, [setSidebarOpen]);

  // Debounced viewport update
  const updateViewport = useCallback(
    debounce((currentMap: MapLibreMap) => {
      setViewport({
        bounds: currentMap.getBounds(),
        zoom: currentMap.getZoom(),
      });
    }, 300),
    []
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
          minZoom: 3,
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
      setMapLoaded(true);

      // Force a resize once the style loads in case container dimensions
      // weren't final when the map was created (lazy-loaded route, fonts
      // settling, etc.). Without this, the camera can end up off-center.
      currentMap.resize();

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
      // GeoJSON geometry and factory counts have loaded)
      try {
        currentMap.addSource('states', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
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
            // Slightly more committed than slate-400 so the tint reads as
            // territory rather than a translucent wash that the base-map
            // texture bleeds through. Still single-hue.
            'fill-color': '#7B8FA8',
            'fill-opacity': [
              'step', ['zoom'],
              // < zoom 5 — full shading
              ['interpolate', ['linear'], ['get', 'factoryCount'],
                0, 0,
                50, 0.12,
                200, 0.18,
                800, 0.26,
                2500, 0.34,
                6000, 0.4,
              ],
              5, ['interpolate', ['linear'], ['get', 'factoryCount'],
                0, 0,
                50, 0.12,
                200, 0.18,
                800, 0.26,
                2500, 0.34,
                6000, 0.4,
              ],
              5.5, ['interpolate', ['linear'], ['get', 'factoryCount'],
                0, 0,
                50, 0.07,
                200, 0.11,
                800, 0.16,
                2500, 0.21,
                6000, 0.25,
              ],
              6, ['interpolate', ['linear'], ['get', 'factoryCount'],
                0, 0,
                2500, 0.08,
                6000, 0.1,
              ],
              6.5, 0,
            ],
          },
        });

        // Border layer sits on top of the fill so state outlines stay
        // visible through shading.
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
      } catch (err) {
        console.error('Failed to add US states layers:', err);
      }

      // Factories source — clustering OFF. With ~1k points, performance is
      // fine; visual density should come from real pins, not from cluster
      // circles painted over them.
      // `promoteId: 'id'` lifts properties.id to the feature id MapLibre
      // uses for feature-state (hover/selected). Our ids are UUID strings;
      // MapLibre doesn't treat string top-level ids as ids, so promoteId
      // is the clean way to use them.
      currentMap.addSource('factories', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'id',
      });

      // Helper: produce an interpolate expression where each zoom stop has
      // case-based output for selected / hover / default. This shape is
      // required — MapLibre rejects `case → interpolate(zoom)` nesting but
      // accepts `interpolate(zoom) → case` as stop outputs.
      const zoomCaseRadius = (selectedVal: number[], hoverVal: number[], defaultVal: number[]) => [
        'interpolate', ['linear'], ['zoom'],
        3, ['case', ['boolean', ['feature-state', 'selected'], false], selectedVal[0], ['boolean', ['feature-state', 'hover'], false], hoverVal[0], defaultVal[0]],
        5, ['case', ['boolean', ['feature-state', 'selected'], false], selectedVal[1], ['boolean', ['feature-state', 'hover'], false], hoverVal[1], defaultVal[1]],
        8, ['case', ['boolean', ['feature-state', 'selected'], false], selectedVal[2], ['boolean', ['feature-state', 'hover'], false], hoverVal[2], defaultVal[2]],
        12, ['case', ['boolean', ['feature-state', 'selected'], false], selectedVal[3], ['boolean', ['feature-state', 'hover'], false], hoverVal[3], defaultVal[3]],
      ] as maplibregl.DataDrivenPropertyValueSpecification<number>;

      // Pin glow — halo that grows with zoom, low opacity so overlapping
      // halos in dense regions softly bloom rather than forming hard blobs.
      currentMap.addLayer({
        id: 'factory-points-glow',
        type: 'circle',
        source: 'factories',
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#60A5FA',
            '#ffffff',
          ],
          'circle-radius': zoomCaseRadius([13, 16, 22, 30], [9, 12, 16, 22], [7, 9, 12, 16]),
          // Fade in across zoom 5 → 6.5 so the crossfade with the choropleth
          // is smooth. Peak glow opacity pulled down slightly so mid-zoom
          // doesn't bloom.
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            3, 0,
            5, 0,
            5.5, 0.05,
            6, 0.12,
            6.5, 0.18,
            8, 0.2,
            12, 0.24,
          ],
          'circle-blur': 0.6,
        },
      });

      // Pin cores — above the HiDPI visibility floor at continental zoom,
      // grow naturally as you drill in so city zoom shows real markers.
      currentMap.addLayer({
        id: 'factory-points',
        type: 'circle',
        source: 'factories',
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#60A5FA',
            '#ffffff',
          ],
          'circle-radius': zoomCaseRadius([5.5, 6.5, 8, 10], [4, 5, 6.5, 9], [3, 4, 5.5, 7]),
          // Smoother crossfade across zoom 5 → 6.5. Peak opacity holds at
          // 0.9 (was 1) — the full-white-blob at dense mid-zoom was too hot.
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            3, 0,
            5, 0,
            5.5, 0.15,
            6, 0.45,
            6.5, 0.75,
            8, 0.9,
          ],
        },
      });

      // Selected marker ring — also zoom-scaled so it stays proportional
      currentMap.addLayer({
        id: 'factory-selected',
        type: 'circle',
        source: 'factories',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': 'transparent',
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            3, 9,
            5, 11,
            8, 14,
            12, 18,
          ],
          'circle-stroke-color': '#60A5FA',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.6,
        },
      });

      // === EVENT HANDLERS ===

      // Factory marker click — use top-level feature.id (we no longer
      // duplicate it into properties to save payload bytes).
      currentMap.on('click', 'factory-points', (e) => {
        if (!e.features?.[0]) return;
        const factoryId = e.features[0].id;
        if (typeof factoryId === 'string') {
          selectFactory(factoryId);

          const geometry = e.features[0].geometry;
          if (geometry.type === 'Point') {
            currentMap.flyTo({
              center: geometry.coordinates as [number, number],
              zoom: Math.max(currentMap.getZoom(), 8),
              duration: 500,
            });
          }
        }
      });

      // Hover on factory markers
      currentMap.on('mouseenter', 'factory-points', (e) => {
        currentMap.getCanvas().style.cursor = 'pointer';
        const id = e.features?.[0]?.id;
        if (typeof id === 'string') {
          hoveredFactoryIdRef.current = id;
          setHoveredFactory(id);

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
          setHoveredFactory(null);
        }
      });

      // Map click (for closing panel)
      currentMap.on('click', handleMapClick);

      // Track viewport for data loading
      currentMap.on('moveend', () => {
        updateViewport(currentMap);
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
    };
  }, [selectFactory, setHoveredFactory, handleMapClick, setSidebarOpen, updateViewport]);

  // Update factories data when loaded.
  // Depends on mapLoaded too — so that after a route-level remount
  // (Map → Nodes → Map), the freshly-created map source gets populated
  // even though the cached GeoJSON reference hasn't changed.
  useEffect(() => {
    if (!map.current || !mapLoaded || !factoriesGeoJSON) return;

    const currentMap = map.current;
    const source = currentMap.getSource('factories') as GeoJSONSource | undefined;
    if (!source) return;

    // Server provides top-level `id` on each feature already — no client-side
    // id synthesis needed.
    source.setData(factoriesGeoJSON);
  }, [factoriesGeoJSON, mapLoaded]);

  // Populate the states source once both the GeoJSON geometry and the
  // factory counts have loaded. Re-fires on mapLoaded so fresh map
  // instances get the data after a route-level remount.
  useEffect(() => {
    if (!map.current || !mapLoaded || !statesWithCounts) return;
    const source = map.current.getSource('states') as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(statesWithCounts);
  }, [statesWithCounts, mapLoaded]);

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
