/**
 * What the map draws: the basemap treatment and the app's own sources and
 * layers. Map.tsx owns the instance, the data and the interactions; this file
 * owns the look, so every paint value lives in one place.
 *
 * Draw order, bottom to top:
 *   basemap fills and roads → state fills and borders → focus-area geofence →
 *   clusters → pins → hovered / selected pin → basemap place names →
 *   cluster counts.
 * Place names stay above the pins so a city can still be read through a
 * field of them. Cluster counts go on the very top because MapLibre places
 * symbols top layer first: a count always gets its spot, and a city name that
 * would land on it slides to one side of its point instead (see quietBasemap).
 *
 * No layer here uses text, so the map needs no glyph server: cluster counts
 * are drawn to small images on demand (see addClusterCountImage). That keeps
 * the keyless plain style free of anything that could fail to load.
 */
import type {
  ExpressionSpecification,
  Map as MapLibreMap,
  StyleSpecification,
} from 'maplibre-gl';

export const SOURCE = {
  states: 'states',
  areas: 'focus-areas',
  factories: 'factories',
  /** The hovered and the selected pin: at most two points, drawn above everything else. */
  activePins: 'factory-active',
} as const;

export const LAYER = {
  stateFill: 'state-fills',
  stateBorders: 'state-borders',
  stateSelected: 'state-selected-border',
  areaFill: 'area-fill',
  areaGlow: 'area-glow',
  areaOutline: 'area-outline',
  clusters: 'factory-clusters',
  clusterCount: 'factory-cluster-count',
  hiring: 'factory-points-hiring',
  pins: 'factory-points',
  activePins: 'factory-active',
} as const;

/**
 * Clusters stand in for pins up to and including this zoom; above it every
 * factory is its own pin. Six keeps a focus area (framed at about zoom 7.5 on
 * a phone, 8.4 on a desktop) on the pin side of the line.
 */
export const CLUSTER_MAX_ZOOM = 6;
const CLUSTER_RADIUS_PX = 46;
/** Two neighbours stay two pins; a cluster starts at three. */
const CLUSTER_MIN_POINTS = 3;

const COLOR = {
  canvas: '#080808',
  water: '#050505',
  placeName: '#c4c4c4',
  stateFill: '#A3B1C2',
  stateFillActive: '#C6D1DE',
  stateBorder: '#3d3d3d',
  stateSelected: '#93C5FD',
  areaFill: '#BAE6FD',
  areaGlow: '#7DD3FC',
  areaOutline: '#E0F2FE',
  cluster: '#ffffff',
  pinFeatured: '#ffffff',
  pinEstablished: '#ececec',
  pinOther: '#aab1ba',
  pinStroke: '#0a0a0a',
  featuredRing: '#F59E0B', // amber-500: Company
  hiringRing: '#A78BFA', // violet-400: Career
  selectedRing: '#38BDF8', // sky-400: Factory
} as const;

/** The app's page background (--color-bg-base), so the keyless map sits flush with the shell. */
function appBaseColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-bg-base').trim() || '#0f0f0f';
}

/**
 * Basemap used when there is no MapTiler key (local dev, CI, previews): a
 * plain dark canvas with no external sources, so nothing can fail to load.
 * The app's own layers (state shapes, geofences, clusters, pins) draw on top.
 * It has no `glyphs` and needs none: the app adds no text layers.
 */
export function plainDarkStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Archangel plain dark',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': appBaseColor() } }],
  };
}

/**
 * Darken the MapTiler basemap and strip it to what orients: land, water,
 * roads and settlement names. Returns the id of the lowest place-name layer;
 * the app's layers are inserted beneath it so names draw over the pins.
 */
export function quietBasemap(map: MapLibreMap): string | undefined {
  let firstLabel: string | undefined;
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id.toLowerCase();
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', COLOR.canvas);
      } else if (layer.type === 'fill' && id.includes('water')) {
        map.setPaintProperty(layer.id, 'fill-color', COLOR.water);
      } else if (layer.type === 'line' && /admin|boundary|border|country/.test(id)) {
        // State lines come from our own shapes, which can be hovered and selected.
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } else if (layer.type === 'symbol') {
        const isPlaceName =
          /city|town|village|place|suburb|capital|neighbou?r/.test(id) &&
          !/country|continent|state|ocean|sea|lake|river|water|road|street|highway|poi|airport|park|peak/.test(id);
        if (isPlaceName) {
          // Light enough to read on the dark land, haloed so it also reads over a pin.
          map.setPaintProperty(layer.id, 'text-color', COLOR.placeName);
          map.setPaintProperty(layer.id, 'text-halo-color', COLOR.canvas);
          map.setPaintProperty(layer.id, 'text-halo-width', 1.6);
          map.setPaintProperty(layer.id, 'text-halo-blur', 0.4);
          // Centered on its point as designed, but free to sit beside it when
          // a cluster count already has the middle.
          map.setLayoutProperty(layer.id, 'text-variable-anchor', ['center', 'top', 'bottom', 'left', 'right']);
          map.setLayoutProperty(layer.id, 'text-radial-offset', 1.2);
          map.setLayoutProperty(layer.id, 'text-justify', 'auto');
          firstLabel ??= layer.id;
        } else {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }
    } catch {
      // A layer that lacks one of these properties keeps its own styling.
    }
  }
  return firstLabel;
}

// ─── States ────────────────────────────────────────────────────────────────

const STATE_HOVERED: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
const STATE_SELECTED: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];

/** A hovered or selected state is lit a little more than its factory count alone would make it. */
const STATE_LIFT: ExpressionSpecification = ['case', STATE_SELECTED, 0.07, STATE_HOVERED, 0.06, 0];

function stateShade(floor: number, stops: number[]): ExpressionSpecification {
  return ['+', STATE_LIFT, ['max', floor, ['interpolate', ['linear'], ['get', 'factoryCount'], ...stops]]];
}

/**
 * Fill opacity of a state: shaded by factory count with a floor, so every
 * state reads as a shape that can be clicked, and fading out across zoom
 * 5.5 → 6.3 where pins take over. Quiet on purpose: clusters carry density
 * now, the fill only says "this is a state". MapLibre rejects a data
 * interpolate wrapped inside a zoom interpolate, so the fade is a `step`.
 */
const STATE_FILL_OPACITY: ExpressionSpecification = [
  'step', ['zoom'],
  stateShade(0.07, [0, 0.07, 200, 0.09, 1000, 0.12, 3000, 0.15, 8000, 0.18]),
  5.5, stateShade(0.04, [0, 0.04, 1000, 0.07, 8000, 0.11]),
  6, stateShade(0.02, [0, 0.02, 8000, 0.06]),
  6.3, 0,
];

/** While one company is the subject, the all-factories shading steps back. */
export function setStateShadingDimmed(map: MapLibreMap, dimmed: boolean): void {
  if (!map.getLayer(LAYER.stateFill)) return;
  map.setPaintProperty(LAYER.stateFill, 'fill-opacity', dimmed ? 0.04 : STATE_FILL_OPACITY);
}

// ─── Pins ──────────────────────────────────────────────────────────────────

const IS_CLUSTER: ExpressionSpecification = ['has', 'point_count'];
const IS_PIN: ExpressionSpecification = ['!', IS_CLUSTER];
const TIER: ExpressionSpecification = ['coalesce', ['get', 'tier'], 0];
const IS_HIRING: ExpressionSpecification = ['>', ['coalesce', ['get', 'openJobs'], 0], 0];

/** Pick a value by tier: featured employer, established company, everyone else. */
function byTier<T extends number | string>(featured: T, established: T, other: T): ExpressionSpecification {
  return ['match', TIER, 2, featured, 1, established, other];
}

/**
 * Pin radius: small when far, larger when close, and larger again for the
 * employers a visitor is likelier to know. `extra` grows every stop by the
 * same amount, for rings that sit around a pin.
 */
function pinRadius(extra = 0): ExpressionSpecification {
  const stop = (featured: number, established: number, other: number): ExpressionSpecification =>
    byTier(featured + extra, established + extra, other + extra);
  return [
    'interpolate', ['linear'], ['zoom'],
    3, stop(3.8, 2.8, 2),
    7, stop(5.2, 3.4, 2.4),
    9, stop(6.6, 4.6, 3.4),
    12, stop(9, 6.6, 5.2),
    15, stop(12, 9, 7.5),
  ];
}

const CLUSTER_COUNT_IMAGE = 'cluster-count-';

/**
 * Draw a cluster's count to an image the first time the map asks for it.
 * Bound to the map's `styleimagemissing` event. Canvas text uses the app's
 * own font and needs no glyph server, with or without a basemap key.
 */
export function addClusterCountImage(map: MapLibreMap, id: string): void {
  if (!id.startsWith(CLUSTER_COUNT_IMAGE) || map.hasImage(id)) return;
  const text = id.slice(CLUSTER_COUNT_IMAGE.length);
  const ratio = Math.min(3, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const font = `600 ${12 * ratio}px Oxanium, ui-sans-serif, system-ui, sans-serif`;
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 6 * ratio;
  const height = 18 * ratio;
  canvas.width = width;
  canvas.height = height;
  // Resizing a canvas resets its state.
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3 * ratio;
  ctx.strokeStyle = 'rgba(8, 8, 8, 0.75)';
  ctx.strokeText(text, width / 2, height / 2 + ratio);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillText(text, width / 2, height / 2 + ratio);
  map.addImage(id, ctx.getImageData(0, 0, width, height), { pixelRatio: ratio });
}

// ─── Sources and layers ────────────────────────────────────────────────────

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Add every source and layer the app draws. `beforeId` is the basemap layer
 * they go beneath (its lowest place-name layer); undefined puts them on top,
 * which is right for the plain style.
 */
export function addAppLayers(map: MapLibreMap, beforeId: string | undefined): void {
  // promoteId lifts a property to the feature id, which feature-state
  // (hover, selected) is keyed on.
  map.addSource(SOURCE.states, { type: 'geojson', data: EMPTY, promoteId: 'stateCode' });
  map.addSource(SOURCE.areas, { type: 'geojson', data: EMPTY, promoteId: 'id' });
  // One source for every factory in the country. The worker clusters it, so
  // the main thread never touches the points while the camera moves.
  map.addSource(SOURCE.factories, {
    type: 'geojson',
    data: EMPTY,
    cluster: true,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterRadius: CLUSTER_RADIUS_PX,
    clusterMinPoints: CLUSTER_MIN_POINTS,
  });
  map.addSource(SOURCE.activePins, { type: 'geojson', data: EMPTY });

  // Every state is a shape that can be hovered and clicked while zoomed out.
  map.addLayer({
    id: LAYER.stateFill,
    type: 'fill',
    source: SOURCE.states,
    paint: {
      // One cool-neutral hue; a hovered or selected state is a step lighter.
      'fill-color': ['case', ['any', STATE_SELECTED, STATE_HOVERED], COLOR.stateFillActive, COLOR.stateFill],
      'fill-opacity': STATE_FILL_OPACITY,
    },
  }, beforeId);

  map.addLayer({
    id: LAYER.stateBorders,
    type: 'line',
    source: SOURCE.states,
    paint: {
      'line-color': COLOR.stateBorder,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 0.9, 10, 1.1],
      'line-opacity': 0.8,
    },
  }, beforeId);

  // The selected state's outline: how "which state am I in" stays answered
  // after zooming past the point where the fill has faded. The filter starts
  // matching nothing and follows the selection.
  map.addLayer({
    id: LAYER.stateSelected,
    type: 'line',
    source: SOURCE.states,
    filter: ['==', ['get', 'stateCode'], ''],
    paint: {
      'line-color': COLOR.stateSelected,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.5, 6, 2, 10, 2.5],
      'line-opacity': 0.8,
      'line-blur': 0.2,
    },
  }, beforeId);

  // Focus-area geofence: one region lit on the dark map. A soft translucent
  // fill, a wide blurred line for the glow, and a crisp bright outline. The
  // fill is stronger while the area is a speck at country zoom.
  const areaSelected: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];
  map.addLayer({
    id: LAYER.areaFill,
    type: 'fill',
    source: SOURCE.areas,
    paint: {
      'fill-color': COLOR.areaFill,
      'fill-opacity': [
        'interpolate', ['linear'], ['zoom'],
        3, 0.3,
        6, ['case', areaSelected, 0.16, 0.13],
        9, ['case', areaSelected, 0.1, 0.08],
        13, ['case', areaSelected, 0.07, 0.05],
      ],
    },
  }, beforeId);
  map.addLayer({
    id: LAYER.areaGlow,
    type: 'line',
    source: SOURCE.areas,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': COLOR.areaGlow,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 4, 8, 12, 13, 18],
      'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 10, 13, 14],
      'line-opacity': ['case', areaSelected, 0.42, 0.3],
    },
  }, beforeId);
  map.addLayer({
    id: LAYER.areaOutline,
    type: 'line',
    source: SOURCE.areas,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': COLOR.areaOutline,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 8, 2, 13, 2.6],
      'line-opacity': 0.95,
    },
  }, beforeId);

  // Clusters: translucent discs sized by how many factories they hold.
  map.addLayer({
    id: LAYER.clusters,
    type: 'circle',
    source: SOURCE.factories,
    filter: IS_CLUSTER,
    paint: {
      'circle-color': COLOR.cluster,
      'circle-opacity': 0.17,
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'point_count'],
        3, 11, 30, 15, 150, 19, 600, 24, 2500, 30, 10000, 37,
      ],
      'circle-stroke-color': COLOR.cluster,
      'circle-stroke-width': 1.25,
      'circle-stroke-opacity': 0.7,
    },
  }, beforeId);
  // Open jobs: a violet ring. It sits under the pins, so each pin's own dark
  // edge separates the ring from the dot.
  map.addLayer({
    id: LAYER.hiring,
    type: 'circle',
    source: SOURCE.factories,
    filter: ['all', IS_PIN, IS_HIRING],
    paint: {
      'circle-color': COLOR.hiringRing,
      'circle-radius': pinRadius(2.5),
      'circle-stroke-color': COLOR.pinStroke,
      'circle-stroke-width': 1,
    },
  }, beforeId);

  // Pins. Tier sets the emphasis: featured employers are the largest and
  // brightest and carry an amber edge, established companies are plain white,
  // everyone else is smaller and dimmer. A thin dark edge keeps neighbours
  // apart, and the sort key draws the higher tiers on top.
  map.addLayer({
    id: LAYER.pins,
    type: 'circle',
    source: SOURCE.factories,
    filter: IS_PIN,
    layout: {
      'circle-sort-key': ['+', ['*', TIER, 2], ['case', IS_HIRING, 1, 0]],
    },
    paint: {
      'circle-color': byTier(COLOR.pinFeatured, COLOR.pinEstablished, COLOR.pinOther),
      'circle-radius': pinRadius(),
      'circle-opacity': byTier(1, 1, 0.9),
      'circle-stroke-color': byTier(COLOR.featuredRing, COLOR.pinStroke, COLOR.pinStroke),
      'circle-stroke-width': [
        'interpolate', ['linear'], ['zoom'],
        3, byTier(1.2, 0.6, 0.5),
        9, byTier(1.8, 0.9, 0.7),
        13, byTier(2.4, 1.2, 1),
      ],
    },
  }, beforeId);

  // The hovered and the selected pin, redrawn on top of their neighbours:
  // a full-white dot with a ring, larger than any pin at the same zoom.
  const isSelected: ExpressionSpecification = ['==', ['get', 'kind'], 'selected'];
  map.addLayer({
    id: LAYER.activePins,
    type: 'circle',
    source: SOURCE.activePins,
    layout: { 'circle-sort-key': ['case', isSelected, 1, 0] },
    paint: {
      'circle-color': '#ffffff',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 7, 6.5, 9, 8, 12, 10.5, 15, 13.5],
      'circle-stroke-color': ['case', isSelected, COLOR.selectedRing, '#ffffff'],
      'circle-stroke-width': ['case', isSelected, 3, 4],
      'circle-stroke-opacity': ['case', isSelected, 0.95, 0.35],
    },
  }, beforeId);

  // Cluster counts, above everything (no beforeId). The padding keeps a
  // displaced city name a few pixels clear of the number.
  map.addLayer({
    id: LAYER.clusterCount,
    type: 'symbol',
    source: SOURCE.factories,
    filter: IS_CLUSTER,
    layout: {
      'icon-image': ['concat', CLUSTER_COUNT_IMAGE, ['to-string', ['get', 'point_count_abbreviated']]],
      'icon-allow-overlap': true,
      'icon-padding': 5,
    },
  });
}
