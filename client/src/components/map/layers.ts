/**
 * What the map draws: the basemap treatment and the app's own sources and
 * layers. Map.tsx owns the instance and the interactions, and mapData.ts
 * reads what is drawn; this file owns the look, so every paint value lives
 * in one place.
 *
 * Draw order, bottom to top:
 *   canvas → US land → basemap water and roads → state fills and borders →
 *   focus-area geofence → density glow (dark) → pins → hovered / selected pin →
 *   basemap place names.
 * Place names stay above the pins so a city can still be read through a
 * field of them.
 *
 * Two themes, two pictures, hand-set (neither is the other inverted):
 *   dark   lights on a dark land. Far out every plant is a faint point and
 *          places with many of them glow.
 *   light  ink on white paper. Every plant is a dot of the text colour, and
 *          density is the dots themselves: no glow, no shading.
 * There are no counted bubbles and no numbers on the map; a count belongs in
 * the panel a person opens, not on the surface they are trying to read.
 *
 * No colour is written here. Each one is a theme token (globals.css) read
 * from the page when the map is built; a theme change recreates the map.
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
  /** The country's own land, under the basemap's water and roads: what tells it from its neighbours. */
  usLand: 'us-land',
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

/** The colours the map paints with: theme tokens, as the page has them. */
interface MapColors {
  /** --bg: the page, and the canvas when there is no basemap. */
  page: string;
  /** --map-land / --map-land-other: the country's land, and everyone else's. */
  land: string;
  landOther: string;
  /** --map-water, --map-border (state lines), --map-road. */
  water: string;
  border: string;
  road: string;
  /** --text-1 and --text-2: plants, place names, the wash on a state. */
  ink: string;
  inkQuiet: string;
  /** --accent: the geofence, what is selected, a plant that is hiring. */
  accent: string;
}

/** What differs between the two pictures besides colour. */
interface MapLook {
  /** Fills other than water, road casings, rail and paths are left out of the basemap. */
  plainBasemap: boolean;
  /** Place names: the token and how much of it. */
  placeName: 'ink' | 'inkQuiet';
  placeNameOpacity: number;
  /** The density glow, and the soft line around a focus area. */
  glow: boolean;
  /** Pin size against the dark map's, and the least a pin's radius can be, in the screen's own pixels. */
  pinScale: number;
  pinFloor: number;
  /** One opacity for every pin, or null for the stops by tier and zoom. */
  pinOpacity: number | null;
  /** Pins of the lower tiers step back in colour as well as size. */
  pinTiersByTone: boolean;
  /** A thin edge in the land's tone keeps neighbouring pins apart. */
  pinEdge: boolean;
  /** States are shaded by how many plants they hold. */
  stateShading: boolean;
}

const LOOK: Record<Theme, MapLook> = {
  dark: {
    plainBasemap: false,
    placeName: 'ink',
    placeNameOpacity: 0.78,
    glow: true,
    pinScale: 1,
    pinFloor: 0,
    pinOpacity: null,
    pinTiersByTone: true,
    pinEdge: true,
    stateShading: true,
  },
  light: {
    plainBasemap: true,
    placeName: 'inkQuiet',
    placeNameOpacity: 1,
    glow: false,
    pinScale: 0.8,
    // Under about half a pixel of the screen a dot of ink does not get smaller, it gets fainter.
    pinFloor: 0.6,
    pinOpacity: 0.7,
    pinTiersByTone: false,
    pinEdge: false,
    stateShading: false,
  },
};

/** How strong the density glow is, from nothing to its strongest: shares of --text-1. */
const GLOW_STOPS: Array<[density: number, opacity: number]> = [
  [0, 0],
  [0.2, 0.015],
  [0.45, 0.057],
  [0.75, 0.133],
  [1, 0.234],
];

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readColors(): MapColors {
  return {
    page: token('--bg'),
    land: token('--map-land'),
    landOther: token('--map-land-other'),
    water: token('--map-water'),
    border: token('--map-border'),
    road: token('--map-road'),
    ink: token('--text-1'),
    inkQuiet: token('--text-2'),
    accent: token('--accent'),
  };
}

/**
 * A colour at an opacity, as an expression: for the few paint properties
 * that have no opacity of their own (a heatmap's ramp, a label's text).
 */
function faded(color: string, opacity: number): ExpressionSpecification {
  // The canvas reads any CSS colour and gives it back as #rrggbb.
  const context = document.createElement('canvas').getContext('2d');
  if (context) {
    context.fillStyle = color;
    color = String(context.fillStyle);
  }
  const hex = color.replace('#', '');
  const value = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex.slice(0, 6), 16);
  return ['rgba', (value >> 16) & 255, (value >> 8) & 255, value & 255, opacity];
}

/** The look and the colours of the theme the map was created in. A theme change recreates the map. */
let LOOKS: MapLook = LOOK.dark;
let COLOR: MapColors | null = null;

function colors(): MapColors {
  return (COLOR ??= readColors());
}

/** Choose the look and read the theme's colours from the page. Call before creating the map. */
export function setMapPalette(theme: Theme): void {
  LOOKS = LOOK[theme];
  COLOR = readColors();
}

/**
 * Basemap used when there is no MapTiler key (local dev, CI, previews): a
 * plain canvas in the page's colour (--bg) with no external sources, so nothing can fail to load.
 * The app's own layers (state shapes, geofences, pins) draw on top.
 * It has no `glyphs` and needs none: the app adds no text layers.
 */
export function plainStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Archangel plain',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': colors().page } }],
  };
}

/** Where the app's layers go in the basemap's stack. */
export interface BasemapSlots {
  /** The basemap's lowest layer above its canvas: the country's land goes beneath it. */
  aboveCanvas?: string;
  /** The lowest place-name layer: everything else the app draws goes beneath it. */
  beneathLabels?: string;
}

/**
 * Recolour the MapTiler basemap to the theme and strip it to what orients: land, water,
 * roads and settlement names. Layers are told apart by what they draw (their type and the
 * tile layer they read), so a restyled basemap keeps working. Returns where the app's own
 * layers go.
 */
export function quietBasemap(map: MapLibreMap): BasemapSlots {
  const color = colors();
  const slots: BasemapSlots = {};
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id.toLowerCase();
    const drawn = 'source-layer' in layer ? (layer['source-layer'] ?? '') : '';
    if (layer.type !== 'background') slots.aboveCanvas ??= layer.id;
    try {
      if (layer.type === 'background') {
        // Everything that is not water is land; the country's own is drawn over it.
        map.setPaintProperty(layer.id, 'background-color', color.landOther);
      } else if (layer.type === 'fill' && (drawn === 'water' || id.includes('water'))) {
        map.setPaintProperty(layer.id, 'fill-color', color.water);
        // The basemap draws water twice, the second a little lower, as a shadow under the shore.
        if (LOOKS.plainBasemap) map.setPaintProperty(layer.id, 'fill-translate', [0, 0]);
      } else if (layer.type === 'fill') {
        // Land use, land cover, buildings: tones of their own, which the plain picture has none of.
        if (LOOKS.plainBasemap) map.setLayoutProperty(layer.id, 'visibility', 'none');
      } else if (layer.type === 'line' && (drawn === 'boundary' || /admin|boundary|border|country/.test(id))) {
        // State lines come from our own shapes, which can be hovered and selected.
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } else if (layer.type === 'line' && drawn === 'waterway') {
        if (LOOKS.plainBasemap) map.setPaintProperty(layer.id, 'line-color', color.water);
      } else if (layer.type === 'line' && drawn === 'transportation' && !/outline|casing|rail|path|pier|ferry/.test(id)) {
        map.setPaintProperty(layer.id, 'line-color', color.road);
      } else if (layer.type === 'line') {
        // Road casings, railways, footpaths, runways.
        if (LOOKS.plainBasemap) map.setLayoutProperty(layer.id, 'visibility', 'none');
      } else if (layer.type === 'symbol') {
        const isPlaceName =
          /city|town|village|place|suburb|capital|neighbou?r/.test(id) &&
          !/country|continent|state|ocean|sea|lake|river|water|road|street|highway|poi|airport|park|peak/.test(id);
        if (isPlaceName) {
          // Clear against the land, haloed in the land's own tone so it also reads over a pin.
          map.setPaintProperty(layer.id, 'text-color', faded(color[LOOKS.placeName], LOOKS.placeNameOpacity));
          map.setPaintProperty(layer.id, 'text-halo-color', color.land);
          map.setPaintProperty(layer.id, 'text-halo-width', 1.6);
          map.setPaintProperty(layer.id, 'text-halo-blur', LOOKS.glow ? 0.4 : 0);
          // Centered on its point as designed, but free to sit beside it when
          // a pin already has the middle.
          map.setLayoutProperty(layer.id, 'text-variable-anchor', ['center', 'top', 'bottom', 'left', 'right']);
          map.setLayoutProperty(layer.id, 'text-radial-offset', 1.2);
          map.setLayoutProperty(layer.id, 'text-justify', 'auto');
          slots.beneathLabels ??= layer.id;
        } else {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }
    } catch {
      // A layer that lacks one of these properties keeps its own styling.
    }
  }
  return slots;
}

// ─── States ────────────────────────────────────────────────────────────────

const STATE_HOVERED: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
const STATE_SELECTED: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];

/** A hovered or selected state is lit a little more than its factory count alone would make it. */
const STATE_LIFT: ExpressionSpecification = ['case', STATE_SELECTED, 0.1, STATE_HOVERED, 0.09, 0];

function stateShade(floor: number, stops: number[]): ExpressionSpecification {
  return ['+', STATE_LIFT, ['max', floor, ['interpolate', ['linear'], ['get', 'factoryCount'], ...stops]]];
}

/**
 * Fill opacity of a state on the dark map: shaded by factory count with a
 * floor, so every state reads as a shape that can be clicked, and fading out
 * across zoom 5.5 → 6.3 where pins take over. Quiet on purpose: the glow
 * carries density, the fill only says "this is a state". MapLibre rejects a
 * data interpolate wrapped inside a zoom interpolate, so the fade is a `step`.
 */
const STATE_SHADING: ExpressionSpecification = [
  'step', ['zoom'],
  stateShade(0.07, [0, 0.07, 200, 0.09, 1000, 0.12, 3000, 0.15, 8000, 0.18]),
  5.5, stateShade(0.04, [0, 0.04, 1000, 0.07, 8000, 0.11]),
  6, stateShade(0.02, [0, 0.02, 8000, 0.06]),
  6.3, 0,
];

/**
 * On the light map the land stays white: a state has no fill of its own.
 * The selected one takes 6% of the accent and a hovered one a wash of ink
 * that comes out as a hovered row does (--surface-hover on white), both gone
 * by the zoom where states stop being shapes.
 */
const STATE_MARKED: ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  5.5, ['case', STATE_SELECTED, 0.06, STATE_HOVERED, 0.085, 0],
  6.3, 0,
];

function stateFillOpacity(dimmed: boolean): ExpressionSpecification | number {
  if (!LOOKS.stateShading) return STATE_MARKED;
  return dimmed ? 0.04 : STATE_SHADING;
}

/** While a company or a career is the subject, the all-factories shading steps back. */
export function setStateShadingDimmed(map: MapLibreMap, dimmed: boolean): void {
  if (!map.getLayer(LAYER.stateFill)) return;
  map.setPaintProperty(LAYER.stateFill, 'fill-opacity', stateFillOpacity(dimmed));
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

/** Zoom stops of the radius of a company's plants while it is the map's subject. */
const SUBJECT_RADIUS_STOPS: Array<[zoom: number, radius: number]> = [
  [2, 4],
  [6, 5.5],
  [9, 7],
  [12, 9.5],
  [15, 12],
];

/** Opacity of a pin that has stepped back behind the map's subject: there, but not competing. */
const RECEDED_OPACITY_STOPS: Array<[zoom: number, opacity: number]> = [
  [2, 0.03],
  [5, 0.06],
  [6.5, 0.14],
  [9, 0.3],
];

/**
 * Pin radius: a point when far, a pickable dot when close, and a little
 * larger for the employers a visitor is likelier to know. The light map's
 * dots are a fifth smaller. `extra` grows every stop by the same amount, for
 * rings that sit around a pin.
 *
 * With `focus` (a test on the feature), pins that pass are drawn exactly as
 * they always are and the rest at the smallest size: the map's subject at
 * full strength, everything else stepped back.
 */
function pinRadius(extra = 0, focus?: ExpressionSpecification): ExpressionSpecification {
  const stops: Array<number | ExpressionSpecification> = [];
  const floor = LOOKS.pinFloor / (window.devicePixelRatio || 1);
  const size = (radius: number) => Math.max(radius * LOOKS.pinScale, floor) + extra;
  for (const [zoom, featured, established, other] of RADIUS_STOPS) {
    const byTheirTier = byTier(size(featured), size(established), size(other));
    stops.push(zoom, focus ? ['case', focus, byTheirTier, size(other)] : byTheirTier);
  }
  return ['interpolate', ['linear'], ['zoom'], ...stops] as ExpressionSpecification;
}

/** The radius of a company's plants while it is the map's subject: full dots at any zoom. */
function subjectRadius(): ExpressionSpecification {
  const stops = SUBJECT_RADIUS_STOPS.flatMap(([zoom, radius]) => [zoom, radius * LOOKS.pinScale]);
  return ['interpolate', ['linear'], ['zoom'], ...stops] as ExpressionSpecification;
}

/**
 * Pin opacity. On the dark map pins fade in with zoom, the better-known
 * employers first; on the light map every dot is the same ink at one opacity.
 * A pin that has stepped back behind the map's subject is fainter on both.
 */
function pinOpacity(focus?: ExpressionSpecification): ExpressionSpecification | number {
  const flat = LOOKS.pinOpacity;
  if (flat !== null && !focus) return flat;
  const stops: Array<number | ExpressionSpecification> = [];
  if (flat !== null && focus) {
    for (const [zoom, receded] of RECEDED_OPACITY_STOPS) stops.push(zoom, ['case', focus, flat, receded]);
    return ['interpolate', ['linear'], ['zoom'], ...stops] as ExpressionSpecification;
  }
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

/** The edge that keeps neighbouring pins apart, where the look has one. */
const PIN_EDGE_WIDTH: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 5, 0, 7, 0.6, 9, 0.9, 13, 1.2];

function pinEdgeWidth(subject: boolean): ExpressionSpecification | number {
  if (!LOOKS.pinEdge) return 0;
  return subject ? 1 : PIN_EDGE_WIDTH;
}

/**
 * The ring that says a plant is hiring. On the dark map it is a disc under
 * the pin, whose dark edge parts the two; on the light map, where a dot has
 * no edge, it is a line around it with the land showing between.
 */
const HIRING_GAP_PX = 2.5;
const HIRING_LINE_PX = 1.5;
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
  const stepsBack: ExpressionSpecification | number = focus ? ['case', focus, 1, 0.25] : 1;
  map.setPaintProperty(LAYER.pins, 'circle-radius', company ? subjectRadius() : pinRadius(0, focus));
  map.setPaintProperty(LAYER.pins, 'circle-opacity', company ? (LOOKS.pinOpacity ?? 1) : pinOpacity(focus));
  map.setPaintProperty(LAYER.pins, 'circle-stroke-width', pinEdgeWidth(company));
  // A receded pin's edge recedes with it, or it would read as a ring.
  map.setPaintProperty(LAYER.pins, 'circle-stroke-opacity', stepsBack);
  map.setPaintProperty(LAYER.hiring, 'circle-radius', pinRadius(HIRING_GAP_PX, focus));
  map.setPaintProperty(LAYER.hiring, 'circle-opacity', LOOKS.pinEdge ? stepsBack : 0);
  map.setPaintProperty(LAYER.hiring, 'circle-stroke-opacity', stepsBack);
  if (map.getLayer(LAYER.density)) {
    map.setLayoutProperty(LAYER.density, 'visibility', company ? 'none' : 'visible');
    map.setPaintProperty(LAYER.density, 'heatmap-weight', focus ? ['case', focus, DENSITY_WEIGHT, 0] : DENSITY_WEIGHT);
  }
}

// ─── Sources and layers ────────────────────────────────────────────────────

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Add every source and layer the app draws. `slots` says where they go in the
 * basemap; with none (the plain style) they are drawn on top, in order, and
 * the canvas itself is the land.
 */
export function addAppLayers(map: MapLibreMap, slots: BasemapSlots = {}): void {
  const color = colors();
  const beforeId = slots.beneathLabels;

  // promoteId lifts a property to the feature id, which feature-state
  // (hover, selected) is keyed on.
  map.addSource(SOURCE.states, { type: 'geojson', data: EMPTY, promoteId: 'stateCode' });
  map.addSource(SOURCE.areas, { type: 'geojson', data: EMPTY, promoteId: 'id' });
  // One source for every factory in the country, unclustered: the density
  // layer and the pins both draw from it.
  map.addSource(SOURCE.factories, { type: 'geojson', data: EMPTY });
  map.addSource(SOURCE.activePins, { type: 'geojson', data: EMPTY });

  // The country's own land, from the states' shapes, under the basemap's
  // water and roads: the basemap's canvas is every country's land alike.
  if (slots.aboveCanvas) {
    map.addLayer({
      id: LAYER.usLand,
      type: 'fill',
      source: SOURCE.states,
      paint: { 'fill-color': color.land },
    }, slots.aboveCanvas);
  }

  // Every state is a shape that can be hovered and clicked while zoomed out.
  map.addLayer({
    id: LAYER.stateFill,
    type: 'fill',
    source: SOURCE.states,
    paint: {
      // Dark: one wash of the quiet ink, stronger where there are more plants.
      // Light: nothing, but the accent on the selected state and ink under the pointer.
      'fill-color': LOOKS.stateShading ? color.inkQuiet : ['case', STATE_SELECTED, color.accent, color.ink],
      'fill-opacity': stateFillOpacity(false),
    },
  }, beforeId);

  map.addLayer({
    id: LAYER.stateBorders,
    type: 'line',
    source: SOURCE.states,
    paint: {
      'line-color': color.border,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 6, 0.9, 10, 1.1],
      'line-opacity': LOOKS.glow ? 0.8 : 1,
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
    layout: { 'line-join': 'round' },
    paint: LOOKS.glow
      ? {
          'line-color': color.accent,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.5, 6, 2, 10, 2.5],
          'line-opacity': 0.8,
          'line-blur': 0.2,
        }
      : { 'line-color': color.accent, 'line-width': 2 },
  }, beforeId);

  // Focus-area geofence, in the accent. Dark: one region lit, with a soft
  // wash of light inside it (stronger while the area is a speck at country
  // zoom), a wide blurred line for the glow and a crisp outline. Light: the
  // outline alone, and 6% of the accent inside it once it is selected.
  const areaSelected: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];
  map.addLayer({
    id: LAYER.areaFill,
    type: 'fill',
    source: SOURCE.areas,
    paint: {
      'fill-color': LOOKS.glow ? color.ink : color.accent,
      'fill-opacity': LOOKS.glow
        ? [
            'interpolate', ['linear'], ['zoom'],
            3, 0.3,
            6, ['case', areaSelected, 0.16, 0.13],
            9, ['case', areaSelected, 0.1, 0.08],
            13, ['case', areaSelected, 0.07, 0.05],
          ]
        : ['case', areaSelected, 0.06, 0],
    },
  }, beforeId);
  if (LOOKS.glow) {
    map.addLayer({
      id: LAYER.areaGlow,
      type: 'line',
      source: SOURCE.areas,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': color.accent,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 4, 8, 12, 13, 18],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 10, 13, 14],
        'line-opacity': ['case', areaSelected, 0.42, 0.3],
      },
    }, beforeId);
  }
  map.addLayer({
    id: LAYER.areaOutline,
    type: 'line',
    source: SOURCE.areas,
    layout: { 'line-join': 'round' },
    paint: LOOKS.glow
      ? {
          'line-color': color.accent,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 8, 2, 13, 2.6],
          'line-opacity': 0.95,
        }
      : { 'line-color': color.accent, 'line-width': ['case', areaSelected, 2, 1.5] },
  }, beforeId);

  // Density, far out, on the dark map: a soft glow where factories gather,
  // fading away as the pins grow large enough to carry the picture themselves.
  if (LOOKS.glow) {
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
          ...GLOW_STOPS.flatMap(([density, opacity]) => [density, faded(color.ink, opacity)]),
        ] as ExpressionSpecification,
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 2, 1, 5.5, 0.9, 6.5, 0.5, 7.5, 0],
      },
    }, beforeId);
  }

  // Hiring: a ring in the accent colour, under the pins (see HIRING_GAP_PX).
  map.addLayer({
    id: LAYER.hiring,
    type: 'circle',
    source: SOURCE.factories,
    filter: IS_HIRING,
    minzoom: PIN_INTERACTIVE_MIN_ZOOM,
    paint: LOOKS.pinEdge
      ? {
          'circle-color': color.accent,
          'circle-radius': pinRadius(HIRING_GAP_PX),
          'circle-stroke-color': color.land,
          'circle-stroke-width': 1,
        }
      : {
          'circle-color': color.accent,
          'circle-opacity': 0,
          'circle-radius': pinRadius(HIRING_GAP_PX),
          'circle-stroke-color': color.accent,
          'circle-stroke-width': HIRING_LINE_PX,
        },
  }, beforeId);

  // Pins. Tier sets the emphasis: featured employers are the largest,
  // established companies next, everyone else smaller. On the dark map the
  // lower tiers are dimmer too and, closer in, a thin dark edge keeps
  // neighbours apart; on the light map every dot is the same ink, and where
  // two overlap the darker overlap parts them. The sort key draws the higher
  // tiers on top.
  map.addLayer({
    id: LAYER.pins,
    type: 'circle',
    source: SOURCE.factories,
    layout: {
      'circle-sort-key': ['+', ['*', TIER, 2], ['case', IS_HIRING, 1, 0]],
    },
    paint: {
      'circle-color': LOOKS.pinTiersByTone ? byTier(color.ink, color.ink, color.inkQuiet) : color.ink,
      'circle-radius': pinRadius(),
      'circle-opacity': pinOpacity(),
      'circle-stroke-color': color.land,
      'circle-stroke-width': pinEdgeWidth(false),
    },
  }, beforeId);

  // The hovered and the selected pin, redrawn on top of their neighbours:
  // the strongest dot with a ring, larger than any pin at the same zoom.
  const isSelected: ExpressionSpecification = ['==', ['get', 'kind'], 'selected'];
  const activeRadius = [3, 5, 7, 6.5, 9, 8, 12, 10.5, 15, 13.5].map((n, i) => (i % 2 === 0 ? n : n * LOOKS.pinScale));
  map.addLayer({
    id: LAYER.activePins,
    type: 'circle',
    source: SOURCE.activePins,
    layout: { 'circle-sort-key': ['case', isSelected, 1, 0] },
    paint: {
      'circle-color': color.ink,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], ...activeRadius] as ExpressionSpecification,
      'circle-stroke-color': ['case', isSelected, color.accent, color.ink],
      'circle-stroke-width': ['case', isSelected, 3, 4],
      'circle-stroke-opacity': ['case', isSelected, 0.95, 0.35],
    },
  }, beforeId);
}
