import { useEffect, useRef, useState, useMemo } from 'react';
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
      // Force a resize once the style loads in case container dimensions
      // weren't final when the map was created (lazy-loaded route, fonts
      // settling, etc.). Critically, we must also recenter after resize -
      // resize() alone recalculates canvas size but doesn't fix the center.
      // Without this explicit recenter, the viewport can drift (Pacific bug).
      currentMap.resize();
      currentMap.setCenter(INITIAL_VIEW.center);
      currentMap.setZoom(INITIAL_VIEW.zoom);

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

      // Factories source with clustering enabled to handle ~40k+ points.
      // Clusters prevent the "blob" at continental/state zoom. Progressive
      // zoom tiers: state/cluster selection → regional clusters → individual pins.
      // `promoteId: 'id'` lifts properties.id to the feature id MapLibre
      // uses for feature-state (hover/selected). Our ids are UUID strings;
      // MapLibre doesn't treat string top-level ids as ids, so promoteId
      // is the clean way to use them.
      currentMap.addSource('factories', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        promoteId: 'id',
        cluster: true,
        clusterMaxZoom: 8, // Stop clustering at zoom 8, show individual markers
        clusterRadius: 50, // Cluster radius in pixels
        clusterProperties: {
          // Aggregate workforce size for cluster tooltips
          totalWorkforce: ['+', ['get', 'workforceSize']],
        },
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

      // Cluster circle layer — appears when zoomed out, shows aggregated factory counts.
      // Size and color intensity scale with point count. Visible from zoom 3 → 8.
      currentMap.addLayer({
        id: 'factory-clusters',
        type: 'circle',
        source: 'factories',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#60A5FA', // 1-99 factories: sky-400
            100,
            '#3B82F6', // 100-999: blue-500
            1000,
            '#2563EB', // 1000+: blue-600
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            15,  // 1-99: small
            100, 20,  // 100-999: medium
            1000, 28, // 1000+: large
          ],
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            3, 0.7,
            8, 0.85,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.8,
        },
      });

      // Cluster count label — shows number inside cluster circle
      currentMap.addLayer({
        id: 'factory-cluster-count',
        type: 'symbol',
        source: 'factories',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      // Pin glow — halo that grows with zoom, low opacity so overlapping
      // halos in dense regions softly bloom rather than forming hard blobs.
      // Filter: only show unclustered points (clusters have point_count property).
      currentMap.addLayer({
        id: 'factory-points-glow',
        type: 'circle',
        source: 'factories',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#60A5FA',
            '#ffffff',
          ],
          'circle-radius': zoomCaseRadius([13, 16, 22, 30], [9, 12, 16, 22], [7, 9, 12, 16]),
          // Subtle visibility at continental zoom (3-5), increasing as user zooms in.
          // This provides progressive disclosure — users can see markers exist even
          // at full-US view, with visual emphasis shifting from choropleth to markers
          // as they zoom in.
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            3, 0.05,
            4, 0.08,
            5.8, 0.1,
            6.2, 0.12,
            6.8, 0.18,
            8, 0.22,
            12, 0.24,
          ],
          'circle-blur': 0.6,
        },
      });

      // Pin cores — individual points only appear AFTER clusters stop (zoom 8+).
      // This ensures clean hit-target separation: states+clusters at
      // continental/mid zoom, individual dots at close zoom.
      // Filter: only show unclustered points (clusters have point_count property).
      currentMap.addLayer({
        id: 'factory-points',
        type: 'circle',
        source: 'factories',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#60A5FA',
            '#ffffff',
          ],
          'circle-radius': zoomCaseRadius([5.5, 6.5, 8, 10], [4, 5, 6.5, 9], [3, 4, 5.5, 7]),
          // Individual points only appear AFTER clusters stop (zoom 8+).
          // This ensures clean hit-target separation: states+clusters at
          // continental/mid zoom, individual dots at close zoom.
          'circle-opacity': [
            'interpolate', ['linear'], ['zoom'],
            3, 0,
            7.5, 0,
            8, 0.3,
            8.5, 0.7,
            9, 0.9,
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

      // Cluster click — zoom into the cluster to expand it
      currentMap.on('click', 'factory-clusters', async (e) => {
        if (!e.features?.[0]) return;
        const clusterId = e.features[0].properties?.cluster_id;
        const source = currentMap.getSource('factories') as maplibregl.GeoJSONSource;
        
        try {
          const zoom = await source.getClusterExpansionZoom(clusterId);
          const geometry = e.features[0].geometry;
          if (geometry.type === 'Point') {
            currentMap.easeTo({
              center: geometry.coordinates as [number, number],
              zoom: zoom + 0.5,
              duration: 500,
            });
          }
        } catch (err) {
          console.error('Failed to get cluster expansion zoom:', err);
        }
      });

      // Cluster hover — show pointer cursor
      currentMap.on('mouseenter', 'factory-clusters', () => {
        currentMap.getCanvas().style.cursor = 'pointer';
      });

      currentMap.on('mouseleave', 'factory-clusters', () => {
        currentMap.getCanvas().style.cursor = '';
      });

      // Factory marker click — use top-level feature.id (we no longer
      // duplicate it into properties to save payload bytes).
      // Markers are now visible and clickable at all zoom levels for
      // better affordance and progressive disclosure.
      currentMap.on('click', 'factory-points', (e) => {
        if (!e.features?.[0]) return;
        const factoryId = e.features[0].id;
        if (typeof factoryId === 'string') {
          selectFactoryRef.current(factoryId);

          const geometry = e.features[0].geometry;
          if (geometry.type === 'Point') {
            // On mobile, add bottom padding so marker is centered ABOVE the bottom sheet
            const isMobile = window.innerWidth < 768;
            const bottomSheetHeight = isMobile ? window.innerHeight * 0.45 : 0;
            
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

      // Hover on factory markers — markers are now interactive at all zoom levels.
      currentMap.on('mouseenter', 'factory-points', (e) => {
        currentMap.getCanvas().style.cursor = 'pointer';
        const id = e.features?.[0]?.id;
        if (typeof id === 'string') {
          hoveredFactoryIdRef.current = id;
          setHoveredFactoryRef.current(id);

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
        // Check if a pin was clicked first (pins always have priority now)
        const pinHit = currentMap.queryRenderedFeatures(e.point, { layers: ['factory-points', 'factory-points-glow'] });
        if (pinHit.length > 0) return;
        const code = e.features[0].properties?.stateCode as string | undefined;
        if (!code) return;
        selectStateRef.current(code);
        // Tiled features have their geometry clipped to tile boundaries, so
        // we look up the full feature from our in-memory dataset to get an
        // accurate bbox for fitBounds.
        const fullFeature = statesWithCountsRef.current?.features?.find(
          (f) => (f.properties as any)?.stateCode === code
        );
        const geom = fullFeature?.geometry ?? e.features[0].geometry;
        const bounds = new maplibregl.LngLatBounds();
        const extend = (coords: any) => {
          if (typeof coords[0] === 'number') {
            bounds.extend(coords as [number, number]);
          } else {
            for (const c of coords) extend(c);
          }
        };
        if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
          extend((geom as any).coordinates);
        }
        if (!bounds.isEmpty()) {
          currentMap.fitBounds(bounds, {
            padding: { top: 80, bottom: 80, left: 80, right: 420 },
            maxZoom: 7,
            duration: 800,
          });
        }
      });

      // Hover a state → brighten its fill + cursor pointer.
      currentMap.on('mousemove', 'state-fills', (e) => {
        if (currentMap.getZoom() >= 6) return; // hover only meaningful at choropleth zooms
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

  // Default zoom-based opacity curves, used when no company filter
  // forces pins on. Kept in one place so the effect below has a single
  // source of truth. Updated to provide visibility at all zoom levels.
  const defaultPointOpacity: any = [
    'interpolate', ['linear'], ['zoom'],
    3, 0.15, 4, 0.2, 5.8, 0.3, 6.2, 0.45, 6.8, 0.65, 7.5, 0.85, 9, 0.9,
  ];
  const defaultGlowOpacity: any = [
    'interpolate', ['linear'], ['zoom'],
    3, 0.05, 4, 0.08, 5.8, 0.1, 6.2, 0.12, 6.8, 0.18, 8, 0.22, 12, 0.24,
  ];

  // Default state-fills opacity curve — mirrors the inline paint set up
  // in the load callback so the company-filter toggle can restore it.
  const defaultStateFillOpacity: any = [
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
