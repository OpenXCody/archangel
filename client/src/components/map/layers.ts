/**
 * What the map draws: the basemap treatment and the app's own sources and
 * layers. Map.tsx owns the instance and the interactions, and mapData.ts
 * reads what is drawn; this file owns the look, so every paint value lives
 * in one place.
 *
 * Draw order, bottom to top:
 *   basemap fills and roads → state fills and borders → focus-area geofence →
 *   density glow → pins → hovered / selected pin → basemap place names.
 * Place names stay above the pins so a city can still be read through a
 * field of them.
 *
 * Density is shown the way city lights show it from above: far out, every
 * factory is a faint point and places with many of them glow. There are no
 * counted bubbles and no numbers on the map; a count belongs in the panel a
 * person opens, not on the surface they are trying to read.
 *
 * No layer here uses text, so the map needs no glyph server, which keeps the
 * keyless plain style free of anything that could fail to load.
 */
import type { Theme } from '../../lib/theme';
import type {
  ExpressionSpecification,
  FilterSpecification,
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
  density: 'factory-density',
  hiring: 'factory-points-hiring',
  pins: 'factory-points',
  activePins: 'factory-active',
} as const;

/**
 * Below this zoom a pin is a point of light, not something to aim at: pins do
 * not take hover or clicks, so a click lands on the state or focus area under
 * them. From here in, each pin is big enough to pick.
 */
export const PIN_INTERACTIVE_MIN_ZOOM = 5.5;

interface MapPalette {
  canvas: string;
  water: string;
  placeName: string;
  stateFill: string;
  stateFillActive: string;
  stateBorder: string;
  stateSelected: string;
  areaFill: string;
  areaGlow: string;
  areaOutline: string;
  pinFeatured: string;
  pinEstablished: string;
  pinOther: string;
  /** The thin edge that keeps neighbouring pins apart: the land's own tone. */
  pinStroke: string;
  /** The one accent, shared with the geofence: this factory is hiring. */
  hiringRing: string;
  /** The hovered or selected pin, redrawn on top. */
  pinActive: string;
  selectedRing: string;
  /** Density glow, from nothing to its strongest. */
  glow: [string, string, string, string, string];
}

// Lights on a dark land, or ink on a light one. Same layers, same rules.
const PALETTE: Record<Theme, MapPalette> = {
  dark: {
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
    pinFeatured: '#ffffff',
    pinEstablished: '#ececec',
    pinOther: '#aab1ba',
    pinStroke: '#0a0a0a',
    hiringRing: '#7DD3FC',
    pinActive: '#ffffff',
    selectedRing: '#38BDF8',
    glow: [
      'rgba(160, 190, 220, 0)',
      'rgba(160, 190, 220, 0.02)',
      'rgba(175, 200, 226, 0.07)',
      'rgba(200, 220, 238, 0.15)',
      'rgba(230, 240, 250, 0.24)',
    ],
  },
  light: {
    canvas: '#f5f6f7',
    water: '#dbe1e8',
    placeName: '#414a55',
    stateFill: '#7c8da3',
    stateFillActive: '#51667f',
    stateBorder: '#c6ccd4',
    stateSelected: '#0369A1',
    areaFill: '#38BDF8',
    areaGlow: '#0EA5E9',
    areaOutline: '#0369A1',
    // Deep slate, not black: ink that sits in the map instead of on top of it.
    pinFeatured: '#1c2733',
    pinEstablished: '#34404e',
    pinOther: '#6b7684',
    pinStroke: '#f5f6f7',
    hiringRing: '#0284C7',
    pinActive: '#111a24',
    selectedRing: '#0284C7',
    glow: [
      'rgba(40, 60, 84, 0)',
      'rgba(40, 60, 84, 0.03)',
      'rgba(40, 60, 84, 0.08)',
      'rgba(34, 52, 74, 0.15)',
      'rgba(28, 44, 64, 0.22)',
    ],
  },
};

/** The palette of the theme the map was created in. A theme change recreates the map. */
let COLOR: MapPalette = PALETTE.dark;

/** Choose the palette. Call before creating the map. */
export function setMapPalette(theme: Theme): void {
  COLOR = PALETTE[theme];
}

/** The app's page background (--color-bg-base), so the keyless map sits flush with the shell. */
function appBaseColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-bg-base').trim() || '#0f0f0f';
}

/**
 * Basemap used when there is no MapTiler key (local dev, CI, previews): a
 * plain canvas in the app's page colour with no external sources, so nothing can fail to load.
 * The app's own layers (state shapes, geofences, clusters, pins) draw on top.
 * It has no `glyphs` and needs none: the app adds no text layers.
 */
export function plainStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Archangel plain',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': appBaseColor() } }],
  };
}

/**
 * Recolour the MapTiler basemap to the theme and strip it to what orients: land, water,
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
          // Clear against the land, haloed so it also reads over a pin.
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
 * 5.5 → 6.3 where pins take over. Quiet on purpose: the glow carries density,
 * the fill only says "this is a state". MapLibre rejects a data
 * interpolate wrapped inside a zoom interpolate, so the fade is a `step`.
 */
const STATE_FILL_OPACITY: ExpressionSpecification = [
  'step', ['zoom'],
  stateShade(0.07, [0, 0.07, 200, 0.09, 1000, 0.12, 3000, 0.15, 8000, 0.18]),
  5.5, stateShade(0.04, [0, 0.04, 1000, 0.07, 8000, 0.11]),
  6, stateShade(0.02, [0, 0.02, 8000, 0.06]),
  6.3, 0,
];

/** While a company or a career is the subject, the all-factories shading steps back. */
export function setStateShadingDimmed(map: MapLibreMap, dimmed: boolean): void {
  if (!map.getLayer(LAYER.stateFill)) return;
  map.setPaintProperty(LAYER.stateFill, 'fill-opacity', dimmed ? 0.04 : STATE_FILL_OPACITY);
}

// ─── Pins ──────────────────────────────────────────────────────────────────

const TIER: ExpressionSpecification = ['coalesce', ['get', 'tier'], 0];
const IS_HIRING: ExpressionSpecification = ['>', ['coalesce', ['get', 'openJobs'], 0], 0];

/** Pick a value by tier: featured employer, established company, everyone else. */
function byTier<T extends number | string>(featured: T, established: T, other: T): ExpressionSpecification {
  return ['match', TIER, 2, featured, 1, established, other];
}

/** Zoom stops of the pin radius, per tier: featured, established, other. */
const RADIUS_STOPS: Array<[zoom: number, featured: number, established: number, other: number]> = [
  [2, 0.9, 0.6, 0.45],
  [3.5, 1.2, 0.85, 0.6],
  [5, 2, 1.4, 1],
  [7, 3.6, 2.6, 1.9],
  [9, 5.6, 4, 3],
  [12, 9, 6.6, 5.2],
  [15, 12, 9, 7.5],
];

/** Zoom stops of the pin opacity, per tier: pins fade in with zoom, the better-known employers first. */
const OPACITY_STOPS: Array<[zoom: number, featured: number, established: number, other: number]> = [
  [2, 0.5, 0.22, 0.1],
  [3.5, 0.6, 0.3, 0.14],
  [5, 0.8, 0.5, 0.28],
  [6, 0.95, 0.75, 0.5],
  [7.5, 1, 1, 0.9],
];

/** Opacity of a pin that has stepped back behind the map's subject: there, but not competing. */
const RECEDED_OPACITY_STOPS: Array<[zoom: number, opacity: number]> = [
  [2, 0.03],
  [5, 0.06],
  [6.5, 0.14],
  [9, 0.3],
];

/**
 * Pin radius: a point of light when far, a pickable dot when close, and a
 * little larger for the employers a visitor is likelier to know. `extra`
 * grows every stop by the same amount, for rings that sit around a pin.
 *
 * With `focus` (a test on the feature), pins that pass are drawn exactly as
 * they always are and the rest at the smallest size: the map's subject at
 * full strength, everything else stepped back.
 */
function pinRadius(extra = 0, focus?: ExpressionSpecification): ExpressionSpecification {
  const stops: Array<number | ExpressionSpecification> = [];
  for (const [zoom, featured, established, other] of RADIUS_STOPS) {
    const byTheirTier = byTier(featured + extra, established + extra, other + extra);
    stops.push(zoom, focus ? ['case', focus, byTheirTier, other + extra] : byTheirTier);
  }
  return ['interpolate', ['linear'], ['zoom'], ...stops] as ExpressionSpecification;
}

function pinOpacity(focus?: ExpressionSpecification): ExpressionSpecification {
  const stops: Array<number | ExpressionSpecification> = [];
  OPACITY_STOPS.forEach(([zoom, featured, established, other]) => {
    const byTheirTier = byTier(featured, established, other);
    stops.push(zoom, focus ? ['case', focus, byTheirTier, recededOpacityAt(zoom)] : byTheirTier);
  });
  if (focus) {
    const last = RECEDED_OPACITY_STOPS[RECEDED_OPACITY_STOPS.length - 1];
    stops.push(last[0], ['case', focus, 1, last[1]]);
  }
  return ['interpolate', ['linear'], ['zoom'], ...stops] as ExpressionSpecification;
}

/** The receded opacity at a zoom, read off its own stops. */
function recededOpacityAt(zoom: number): number {
  const stops = RECEDED_OPACITY_STOPS;
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, o1] = stops[i];
    const [z0, o0] = stops[i - 1];
    if (zoom <= z1) return o0 + ((o1 - o0) * (zoom - z0)) / (z1 - z0);
  }
  return stops[stops.length - 1][1];
}

const PIN_STROKE_WIDTH: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 5, 0, 7, 0.6, 9, 0.9, 13, 1.2];
const DENSITY_WEIGHT: ExpressionSpecification = byTier(1.4, 1.1, 1);

/**
 * What the pins are showing right now. Every part of it is a filter or paint
 * expression over the one source that holds the whole country: changing it
 * never sends the 48,000 points again.
 */
export interface PinView {
  /** Draw only pins in these states. Empty: every state. */
  states: string[];
  /** Draw only pins of this industry. */
  industry: string | null;
  /**
   * One company is the subject: draw only these plants, as full dots at any
   * zoom. An empty list (the company's record has not loaded, or it has no
   * plants) draws none. null: no company.
   */
  companyPlants: string[] | null;
  /**
   * A career is the subject: pins of these industries stay at full strength
   * and the rest step back. null: no career, or one found in every industry.
   */
  careerIndustries: string[] | null;
}

export const EVERY_PIN: PinView = { states: [], industry: null, companyPlants: null, careerIndustries: null };

/** True when a pin with these properties is one the view holds up, not one it has stepped back. */
export function pinInFocus(view: PinView, industry: string | null): boolean {
  return view.careerIndustries === null || (industry !== null && view.careerIndustries.includes(industry));
}

/** Apply a view to the pin layers. Cheap to call; it only sets what the view needs. */
export function setPinView(map: MapLibreMap, view: PinView): void {
  if (!map.getLayer(LAYER.pins)) return;

  // Which pins exist at all.
  const tests: ExpressionSpecification[] = [];
  if (view.states.length > 0) tests.push(['in', ['get', 'state'], ['literal', view.states]]);
  if (view.industry) tests.push(['==', ['get', 'industry'], view.industry]);
  if (view.companyPlants) {
    tests.push(
      view.companyPlants.length > 0
        ? ['match', ['get', 'id'], Array.from(new Set(view.companyPlants)), true, false]
        : ['==', ['get', 'id'], '']
    );
  }
  const only: FilterSpecification | null = tests.length > 0 ? ['all', ...tests] : null;
  map.setFilter(LAYER.pins, only);
  map.setFilter(LAYER.hiring, only ? ['all', IS_HIRING, ...tests] : IS_HIRING);
  if (map.getLayer(LAYER.density)) map.setFilter(LAYER.density, only);

  // How they are drawn.
  const company = view.companyPlants !== null;
  const focus: ExpressionSpecification | undefined =
    !company && view.careerIndustries
      ? view.careerIndustries.length > 0
        ? ['in', ['get', 'industry'], ['literal', view.careerIndustries]]
        : ['==', ['get', 'id'], '']
      : undefined;

  // While one company is the subject its few plants are the whole picture:
  // full dots at any zoom, and no density glow, which says nothing about a
  // handful of points. A career's plants are thousands: they are drawn as
  // they always are and keep the glow, now weighted to them alone, while
  // every other pin steps back.
  map.setPaintProperty(
    LAYER.pins,
    'circle-radius',
    company ? ['interpolate', ['linear'], ['zoom'], 2, 4, 6, 5.5, 9, 7, 12, 9.5, 15, 12] : pinRadius(0, focus)
  );
  map.setPaintProperty(LAYER.pins, 'circle-opacity', company ? 1 : pinOpacity(focus));
  map.setPaintProperty(LAYER.pins, 'circle-stroke-width', company ? 1 : PIN_STROKE_WIDTH);
  // A receded pin's dark edge recedes with it, or it would read as a ring.
  map.setPaintProperty(LAYER.pins, 'circle-stroke-opacity', focus ? ['case', focus, 1, 0.25] : 1);
  map.setPaintProperty(LAYER.hiring, 'circle-radius', pinRadius(2.5, focus));
  map.setPaintProperty(LAYER.hiring, 'circle-opacity', focus ? ['case', focus, 1, 0.25] : 1);
  map.setPaintProperty(LAYER.hiring, 'circle-stroke-opacity', focus ? ['case', focus, 1, 0.25] : 1);
  if (map.getLayer(LAYER.density)) {
    map.setLayoutProperty(LAYER.density, 'visibility', company ? 'none' : 'visible');
    map.setPaintProperty(LAYER.density, 'heatmap-weight', focus ? ['case', focus, DENSITY_WEIGHT, 0] : DENSITY_WEIGHT);
  }
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
  // One source for every factory in the country, unclustered: the density
  // layer and the pins both draw from it.
  map.addSource(SOURCE.factories, { type: 'geojson', data: EMPTY });
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

  // Density, far out: a soft glow where factories gather, fading away as
  // the pins grow large enough to carry the picture themselves.
  map.addLayer({
    id: LAYER.density,
    type: 'heatmap',
    source: SOURCE.factories,
    maxzoom: 7.5,
    paint: {
      'heatmap-weight': DENSITY_WEIGHT,
      // Low and smooth on purpose: a haze that says "more here", never a blob
      // with an edge. The points of light on top carry the detail.
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 2, 0.012, 4, 0.03, 6, 0.12, 7.5, 0.3],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 2, 5, 4, 11, 6, 24, 7.5, 38],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, COLOR.glow[0],
        0.2, COLOR.glow[1],
        0.45, COLOR.glow[2],
        0.75, COLOR.glow[3],
        1, COLOR.glow[4],
      ],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 2, 1, 5.5, 0.9, 6.5, 0.5, 7.5, 0],
    },
  }, beforeId);

  // Hiring: a ring in the accent colour. It sits under the pins, so each
  // pin's own dark edge separates the ring from the dot.
  map.addLayer({
    id: LAYER.hiring,
    type: 'circle',
    source: SOURCE.factories,
    filter: IS_HIRING,
    minzoom: PIN_INTERACTIVE_MIN_ZOOM,
    paint: {
      'circle-color': COLOR.hiringRing,
      'circle-radius': pinRadius(2.5),
      'circle-stroke-color': COLOR.pinStroke,
      'circle-stroke-width': 1,
    },
  }, beforeId);

  // Pins. Tier sets the emphasis through size and brightness alone: featured
  // employers are the largest and brightest, established companies plain
  // white, everyone else smaller and dimmer. Far out they are faint points;
  // closer in, a thin dark edge keeps neighbours apart. The sort key draws
  // the higher tiers on top.
  map.addLayer({
    id: LAYER.pins,
    type: 'circle',
    source: SOURCE.factories,
    layout: {
      'circle-sort-key': ['+', ['*', TIER, 2], ['case', IS_HIRING, 1, 0]],
    },
    paint: {
      'circle-color': byTier(COLOR.pinFeatured, COLOR.pinEstablished, COLOR.pinOther),
      'circle-radius': pinRadius(),
      'circle-opacity': pinOpacity(),
      'circle-stroke-color': COLOR.pinStroke,
      'circle-stroke-width': PIN_STROKE_WIDTH,
    },
  }, beforeId);

  // The hovered and the selected pin, redrawn on top of their neighbours:
  // the strongest dot with a ring, larger than any pin at the same zoom.
  const isSelected: ExpressionSpecification = ['==', ['get', 'kind'], 'selected'];
  map.addLayer({
    id: LAYER.activePins,
    type: 'circle',
    source: SOURCE.activePins,
    layout: { 'circle-sort-key': ['case', isSelected, 1, 0] },
    paint: {
      'circle-color': COLOR.pinActive,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 7, 6.5, 9, 8, 12, 10.5, 15, 13.5],
      'circle-stroke-color': ['case', isSelected, COLOR.selectedRing, COLOR.pinActive],
      'circle-stroke-width': ['case', isSelected, 3, 4],
      'circle-stroke-opacity': ['case', isSelected, 0.95, 0.35],
    },
  }, beforeId);
}
