import { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl, { Map as MapLibreMap, GeoJSONSource, MapMouseEvent, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useQuery } from '@tanstack/react-query';
import { factoriesApi } from '../../lib/api';
import { useMapStore } from '../../stores/mapStore';
import { Loader2, Maximize2 } from 'lucide-react';

const MAPTILER_KEY = import.meta.env.VITE_MAP_TOKEN || '';
const STYLE_URL = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`;

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

  // Handle click outside markers to close panel
  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (!map.current) return;

    // Check all marker layers including glows
    const features = map.current.queryRenderedFeatures(e.point, {
      layers: [
        'factory-points',
        'factory-points-glow',
        'factory-clusters',
        'factory-clusters-glow',
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

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    if (!MAPTILER_KEY) {
      console.error('MapTiler API key is not set');
      setMapError('MapTiler API key is missing. Please set VITE_MAPTILER_API_KEY in .env');
      return;
    }

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: STYLE_URL,
        center: INITIAL_VIEW.center,
        zoom: INITIAL_VIEW.zoom,
        minZoom: 3,
        maxZoom: 18,
        attributionControl: false,
        // Performance: reduce tile loading at edges
        renderWorldCopies: false,
      });
    } catch (err) {
      console.error('Failed to create map:', err);
      setMapError('Failed to initialize map');
      return;
    }

    const currentMap = map.current;

    // Handle map errors
    currentMap.on('error', (e) => {
      console.error('Map error:', e);
      if (e.error?.message?.includes('style') || e.error?.message?.includes('Style')) {
        setMapError(e.error?.message || 'Failed to load map style');
      }
    });

    // Note: Zoom controls removed for cleaner UI - use scroll/pinch to zoom

    currentMap.on('load', () => {
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

      // Add state boundaries layer
      try {
        currentMap.addSource('states', {
          type: 'geojson',
          data: STATES_GEOJSON_URL,
        });

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
        console.error('Failed to load US states layer:', err);
      }

      // Add factories source with optimized clustering for scale
      currentMap.addSource('factories', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 12, // Cluster until zoom 12 (was 11)
        clusterRadius: 80, // Larger radius for more aggressive clustering (was 60)
        clusterMinPoints: 3, // Require 3+ points to cluster
        // Generate cluster properties for richer clusters
        clusterProperties: {
          totalWorkforce: ['+', ['get', 'workforceSize']],
        },
      });

      // Simplified cluster styling - single glow layer instead of 4
      currentMap.addLayer({
        id: 'factory-clusters-glow',
        type: 'circle',
        source: 'factories',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#60A5FA',
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'point_count'],
            2, 20,
            10, 30,
            50, 45,
            100, 60,
            500, 80,
          ],
          'circle-opacity': 0.2,
          'circle-blur': 0.6,
        },
      });

      // Cluster core
      currentMap.addLayer({
        id: 'factory-clusters',
        type: 'circle',
        source: 'factories',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#93C5FD',
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'point_count'],
            2, 8,
            10, 12,
            50, 16,
            100, 20,
            500, 26,
          ],
          'circle-opacity': 0.9,
        },
      });

      // Individual factory markers - simplified glow
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
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            18,
            ['boolean', ['feature-state', 'hover'], false],
            14,
            10,
          ],
          'circle-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.3,
            0.15,
          ],
          'circle-blur': 0.6,
        },
      });

      // Individual factory markers
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
          'circle-radius': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            7,
            ['boolean', ['feature-state', 'hover'], false],
            6,
            4,
          ],
          'circle-opacity': 1,
        },
      });

      // Selected marker ring
      currentMap.addLayer({
        id: 'factory-selected',
        type: 'circle',
        source: 'factories',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': 'transparent',
          'circle-radius': 12,
          'circle-stroke-color': '#60A5FA',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.6,
        },
      });

      // === EVENT HANDLERS ===

      // Cluster click - zoom to fit all factories in the cluster
      const handleClusterClick = async (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features?.[0]) return;
        const clusterId = e.features[0].properties?.cluster_id;
        if (!clusterId) return;

        const source = currentMap.getSource('factories') as GeoJSONSource;

        try {
          // Get all points in this cluster (up to 1000)
          const leaves = await source.getClusterLeaves(clusterId, 1000, 0);

          if (!leaves || leaves.length === 0) return;

          // Calculate bounds that contain all factories in the cluster
          const coordinates = leaves
            .filter((f): f is GeoJSON.Feature<GeoJSON.Point> =>
              f.geometry?.type === 'Point'
            )
            .map(f => f.geometry.coordinates as [number, number]);

          if (coordinates.length === 0) return;

          // Create bounds from all coordinates
          const bounds = coordinates.reduce(
            (bounds, coord) => bounds.extend(coord),
            new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
          );

          // Fit map to show all factories with padding
          currentMap.fitBounds(bounds, {
            padding: { top: 50, bottom: 50, left: 50, right: 50 },
            maxZoom: 14,
            duration: 500,
          });
        } catch (err) {
          console.error('Error getting cluster leaves:', err);
        }
      };

      currentMap.on('click', 'factory-clusters', handleClusterClick);
      currentMap.on('click', 'factory-clusters-glow', handleClusterClick);

      // Factory marker click
      currentMap.on('click', 'factory-points', (e) => {
        if (!e.features?.[0]) return;
        const factoryId = e.features[0].properties?.id;
        if (factoryId) {
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
        if (e.features?.[0]?.properties?.id) {
          const id = e.features[0].properties.id;
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

      // Cluster hover
      ['factory-clusters', 'factory-clusters-glow'].forEach((layerId) => {
        currentMap.on('mouseenter', layerId, () => {
          currentMap.getCanvas().style.cursor = 'pointer';
        });
        currentMap.on('mouseleave', layerId, () => {
          currentMap.getCanvas().style.cursor = '';
        });
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

    return () => {
      currentMap.remove();
      map.current = null;
    };
  }, [selectFactory, setHoveredFactory, handleMapClick, setSidebarOpen, updateViewport]);

  // Update factories data when loaded
  useEffect(() => {
    if (!map.current || !factoriesGeoJSON) return;

    const currentMap = map.current;

    const updateSource = () => {
      const source = currentMap.getSource('factories') as GeoJSONSource;
      if (source) {
        // Add IDs to features for feature state (required for hover/selection)
        const dataWithIds = {
          ...factoriesGeoJSON,
          features: factoriesGeoJSON.features.map((f) => ({
            ...f,
            id: f.properties?.id,
          })),
        };
        source.setData(dataWithIds);
      }
    };

    if (currentMap.isStyleLoaded()) {
      updateSource();
    } else {
      currentMap.once('load', updateSource);
    }
  }, [factoriesGeoJSON]);

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
