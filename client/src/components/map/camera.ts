/**
 * The map camera. Every camera move in the app goes through this file.
 *
 * Why one module: the camera used to be moved from the map, the detail panel
 * and the store, each with its own padding numbers, and they disagreed. The
 * layout (what covers the canvas, and by how much) is described once, below,
 * and every move derives its framing from it.
 *
 * Two MapLibre (v4.7) facts this file is built around:
 *  - `padding` given to flyTo / easeTo / jumpTo is SAVED on the map, and
 *    fitBounds adds the saved padding to its own. A fit after a padded fly
 *    counted the panel twice and landed off-center. So: flights are shifted
 *    with `offset`, fits pass `padding` (fitBounds does not save it), and the
 *    saved padding is kept at zero.
 *  - fitBounds resets bearing but not pitch. Every move here ends north-up and
 *    flat, so the same request always produces the same camera.
 */
import {
  LngLat,
  LngLatBounds,
  type Map as MapLibreMap,
  type LngLatBoundsLike,
  type MapOptions,
} from 'maplibre-gl';
import { US_BOUNDS, focusArea, type FocusArea } from '@shared/scope';
import { useMapStore, type CameraRequest } from '../../stores/mapStore';

// ─── Layout ────────────────────────────────────────────────────────────────
// The detail panel reads these too, so the panel and the camera cannot drift.

/** Desktop detail panel: docked right, this wide. */
export const PANEL_WIDTH_PX = 380;
/** Phone detail sheet in its resting (peek) state, as a share of the viewport height. */
export const SHEET_PEEK_VH = 32;
/** Phone detail sheet opened out, as a share of the viewport height. */
export const SHEET_FULL_VH = 86;
/** Phone detail sheet folded down to its name: the map is all there behind it. */
export const SHEET_BAR_PX = 64;
/** At or below this width the detail panel is a bottom sheet. */
export const PHONE_LAYOUT_QUERY = '(max-width: 768px)';

/**
 * The floating search bar (16px from the top, about 46px tall) and the row of
 * chips under it (8px gap, about 32px tall), plus a little air. On a phone
 * the field is set in 16px type and the chips are thumb-sized, so both are
 * taller.
 */
const TOP_CONTROLS_DESKTOP_PX = 104;
const TOP_CONTROLS_PHONE_PX = 118;
/** Breathing room between fitted content and the edge of the visible area. */
const FIT_MARGIN_DESKTOP_PX = 48;
const FIT_MARGIN_PHONE_PX = 20;
/**
 * The country on a phone runs edge to edge: it is far wider than the screen
 * is, so every pixel of margin makes it smaller.
 */
const HOME_MARGIN_PHONE_PX = 6;
/** Below this height a wide canvas is a phone on its side. */
const SHORT_CANVAS_PX = 560;
/** Never squeeze the visible area below this, however small the screen. */
const MIN_VISIBLE_PX = 96;

const STATE_MAX_ZOOM = 7;
const AREA_MAX_ZOOM = 11;
const PLACE_MAX_ZOOM = 14;
const POINT_ZOOM = 8;
const POINTS_MAX_ZOOM = 10;

interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_EDGES: Edges = { top: 0, right: 0, bottom: 0, left: 0 };

export function isPhoneLayout(): boolean {
  return window.matchMedia(PHONE_LAYOUT_QUERY).matches;
}

function topControlsPx(): number {
  return isPhoneLayout() ? TOP_CONTROLS_PHONE_PX : TOP_CONTROLS_DESKTOP_PX;
}

/** Height of the phone sheet in its resting state, in px. */
export function sheetPeekPx(): number {
  return Math.round((window.innerHeight * SHEET_PEEK_VH) / 100);
}

/**
 * How much of the bottom of the map the phone sheet covers, in px. Opened out
 * it covers nearly everything; the map is still framed for the resting sheet
 * it returns to.
 */
export function sheetCoverPx(): number {
  return useMapStore.getState().sheetDetent === 'bar' ? SHEET_BAR_PX : sheetPeekPx();
}

/**
 * How much of each edge of the canvas is hidden behind UI right now.
 * Phone: the search bar and area chips span the top, the sheet (when open)
 * the bottom. Desktop: the panel (when open) covers the right edge. The
 * search bar only occupies the top-left corner there; fitPadding() clears it
 * instead.
 */
function coveredEdges(): Edges {
  const panelOpen = useMapStore.getState().sidebarOpen;
  if (isPhoneLayout()) {
    return { top: topControlsPx(), right: 0, bottom: panelOpen ? sheetCoverPx() : 0, left: 0 };
  }
  return { top: 0, right: panelOpen ? PANEL_WIDTH_PX : 0, bottom: 0, left: 0 };
}

/** Padding for fitting bounds: the covered edges plus a margin, never more than the canvas can give. */
function fitPadding(map: MapLibreMap): Edges {
  const covered = coveredEdges();
  const phone = isPhoneLayout();
  const side = phone ? FIT_MARGIN_PHONE_PX : FIT_MARGIN_DESKTOP_PX;
  // Desktop clears the search bar and chips on both sides so content stays vertically centered.
  const vertical = phone ? FIT_MARGIN_PHONE_PX : topControlsPx();
  // A short, wide canvas (a phone on its side) cannot spare that room twice:
  // content sits under the search bar and runs to the bottom edge.
  const short = !phone && map.getContainer().clientHeight < SHORT_CANVAS_PX;
  return squeezed(map, {
    top: covered.top + vertical,
    right: covered.right + side,
    bottom: covered.bottom + (short ? FIT_MARGIN_PHONE_PX : vertical),
    left: covered.left + side,
  });
}

/**
 * Padding for the home view. On a desktop it is any other fit. On a phone the
 * country is framed edge to edge in the part of the screen the detail sheet
 * never covers: a portrait screen is far taller than the country, so the room
 * left over goes below it, where the sheet opens, not above it as a band of
 * Canada. Choosing a state then raises the sheet beside the country, not over it.
 */
function homePadding(map: MapLibreMap): Edges {
  if (!isPhoneLayout()) return fitPadding(map);
  return squeezed(map, {
    top: topControlsPx() + HOME_MARGIN_PHONE_PX,
    right: HOME_MARGIN_PHONE_PX,
    bottom: sheetPeekPx() + HOME_MARGIN_PHONE_PX,
    left: HOME_MARGIN_PHONE_PX,
  });
}

/** Scale padding down where the canvas is too small to give all of it. */
function squeezed(map: MapLibreMap, padding: Edges): Edges {
  const { clientWidth, clientHeight } = map.getContainer();
  const squeeze = (a: number, b: number, size: number): number => {
    const room = Math.max(0, size - MIN_VISIBLE_PX);
    return a + b > room && a + b > 0 ? room / (a + b) : 1;
  };
  const kx = squeeze(padding.left, padding.right, clientWidth);
  const ky = squeeze(padding.top, padding.bottom, clientHeight);
  return {
    top: Math.floor(padding.top * ky),
    right: Math.floor(padding.right * kx),
    bottom: Math.floor(padding.bottom * ky),
    left: Math.floor(padding.left * kx),
  };
}

/** Screen offset that puts a flight's target in the middle of the visible area. */
function visibleCenterOffset(): [number, number] {
  const c = coveredEdges();
  return [(c.left - c.right) / 2, (c.top - c.bottom) / 2];
}

/** Nothing here saves padding, but a stray one would skew every later fit: clear it. */
function dropSavedPadding(map: MapLibreMap): void {
  const p = map.getPadding();
  if (p.top || p.right || p.bottom || p.left) map.setPadding(NO_EDGES);
}

// ─── Moves ─────────────────────────────────────────────────────────────────

interface MoveOptions {
  /** false jumps without animation. Default true. */
  animate?: boolean;
}

function fit(
  map: MapLibreMap,
  bounds: LngLatBoundsLike,
  maxZoom: number | undefined,
  duration: number,
  padding: Edges = fitPadding(map)
): void {
  dropSavedPadding(map);
  freely(map, duration, () =>
    map.fitBounds(bounds, {
      padding,
      ...(maxZoom === undefined ? {} : { maxZoom }),
      bearing: 0,
      pitch: 0,
      duration,
    })
  );
}

/** Frame the continental United States. The home view. */
export function fitUS(map: MapLibreMap, { animate = true }: MoveOptions = {}): void {
  fit(map, US_BOUNDS, undefined, animate ? 700 : 0, homePadding(map));
}

/** Frame a focus area by the box around its boundary. */
export function fitArea(map: MapLibreMap, area: FocusArea, { animate = true }: MoveOptions = {}): void {
  fit(map, area.bounds, AREA_MAX_ZOOM, animate ? 900 : 0);
}

/** Frame a box, e.g. a place found by address search. */
export function fitPlace(map: MapLibreMap, bounds: LngLatBoundsLike, { animate = true }: MoveOptions = {}): void {
  fit(map, bounds, PLACE_MAX_ZOOM, animate ? 900 : 0);
}

/** Frame a state (or any region), given its geometry or its bounds. */
export function fitState(
  map: MapLibreMap,
  region: GeoJSON.Geometry | LngLatBoundsLike,
  { animate = true }: MoveOptions = {}
): void {
  const bounds = isGeometry(region) ? geometryBounds(region) : LngLatBounds.convert(region);
  if (!bounds || bounds.isEmpty()) return;
  fit(map, bounds, STATE_MAX_ZOOM, animate ? 800 : 0);
}

/** Frame a set of points, e.g. all of one company's factories. */
export function fitPoints(map: MapLibreMap, points: Array<[number, number]>, { animate = true }: MoveOptions = {}): void {
  if (points.length === 0) return;
  if (points.length === 1) {
    flyToPoint(map, points[0], POINTS_MAX_ZOOM, { animate });
    return;
  }
  const bounds = new LngLatBounds();
  for (const p of points) bounds.extend(p);
  fit(map, bounds, POINTS_MAX_ZOOM, animate ? 800 : 0);
}

/**
 * Center a point in the visible area. Without `zoom` the map keeps its zoom,
 * or closes in to a level where single factories read clearly.
 */
export function flyToPoint(
  map: MapLibreMap,
  lngLat: [number, number],
  zoom?: number,
  { animate = true }: MoveOptions = {}
): void {
  dropSavedPadding(map);
  const duration = animate ? 500 : 0;
  freely(map, duration, () =>
    map.flyTo({
      center: lngLat,
      zoom: zoom ?? Math.max(map.getZoom(), POINT_ZOOM),
      bearing: 0,
      pitch: 0,
      offset: visibleCenterOffset(),
      duration,
    })
  );
}

/** The point on screen that sits in the middle of what the panel or sheet leaves visible. */
function visibleCenter(map: MapLibreMap): [number, number] {
  const { clientWidth, clientHeight } = map.getContainer();
  const [dx, dy] = visibleCenterOffset();
  return [clientWidth / 2 + dx, clientHeight / 2 + dy];
}

/** Zoom in (+1) or out (-1) one level, holding still the middle of the visible area. */
export function zoomBy(map: MapLibreMap, delta: number): void {
  dropSavedPadding(map);
  map.easeTo({
    zoom: map.getZoom() + delta,
    around: map.unproject(visibleCenter(map)),
    bearing: 0,
    pitch: 0,
    duration: 250,
  });
}

// ─── Staying near the country ──────────────────────────────────────────────

/**
 * Where the middle of the screen may be dragged to: the lower 48 states,
 * Alaska and Hawaii, each with a margin, joined by corridors so
 * a person can drag from one to the next. [west, south, east, north].
 */
const REACH: Array<[number, number, number, number]> = [
  [-126.5, 23.5, -65.5, 50.5], // the lower 48
  [-171, 51, -129, 72], // Alaska
  [-136, 47, -122, 57], // up the coast to Alaska
  [-161.5, 18, -117, 34], // out to Hawaii
];

/** The nearest point to `center` that the screen's middle may sit on. */
export function nearestReachable(center: { lng: number; lat: number }): { lng: number; lat: number } {
  let best = center;
  let bestDistance = Infinity;
  for (const [west, south, east, north] of REACH) {
    const lng = Math.min(Math.max(center.lng, west), east);
    const lat = Math.min(Math.max(center.lat, south), north);
    const distance = (lng - center.lng) ** 2 + (lat - center.lat) ** 2;
    if (distance === 0) return center;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { lng, lat };
    }
  }
  return best;
}

/** Maps whose camera is being moved by this file right now: those moves go where they are sent. */
const movingFreely = new WeakSet<MapLibreMap>();

/** Run a camera move that is exempt from the drag limit until it ends. */
function freely(map: MapLibreMap, duration: number, move: () => void): void {
  movingFreely.add(map);
  if (duration > 0) {
    map.once('moveend', () => movingFreely.delete(map));
    move();
  } else {
    try {
      move();
    } finally {
      movingFreely.delete(map);
    }
  }
}

/**
 * Keep dragging, flicking and zooming by hand near the country: the middle of
 * the screen cannot leave REACH. Flights made here are exempt, so a link or a
 * search result is always reached. Also sets how far out the map can zoom:
 * a little past the home view.
 */
export function keepNearCountry(map: MapLibreMap): void {
  map.transformCameraUpdate = (next) => {
    if (movingFreely.has(map)) return {};
    const allowed = nearestReachable(next.center);
    return allowed === next.center ? {} : { center: new LngLat(allowed.lng, allowed.lat) };
  };
  const setFloor = (): void => {
    const home = map.cameraForBounds(US_BOUNDS, { padding: homePadding(map) });
    if (home?.zoom !== undefined) map.setMinZoom(Math.max(0, home.zoom - 0.75));
  };
  setFloor();
  map.on('resize', setFloor);
}

// ─── The camera in the address ─────────────────────────────────────────────

/** A camera position a link can carry. */
export interface MapViewpoint {
  center: [number, number];
  zoom: number;
}

/**
 * The camera as an address fragment, "#zoom/latitude/longitude" (the order
 * OpenStreetMap and MapLibre use), or "" at the home view so a plain /map
 * stays plain.
 */
export function viewToHash(map: MapLibreMap): string {
  if (isAtHome(map)) return '';
  const center = map.getCenter();
  const zoom = map.getZoom();
  // Finer positions as the map closes in: about a pixel at any zoom.
  const places = Math.max(2, Math.min(5, Math.ceil(zoom / 3) + 1));
  return `#${zoom.toFixed(2)}/${center.lat.toFixed(places)}/${center.lng.toFixed(places)}`;
}

/** Read a camera position from an address fragment; null when it is not one. */
export function viewFromHash(hash: string): MapViewpoint | null {
  const match = /^#?(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(hash.trim());
  if (!match) return null;
  const [zoom, lat, lng] = match.slice(1).map(Number);
  if (!(zoom >= 0 && zoom <= 22 && Math.abs(lat) <= 85 && Math.abs(lng) <= 180)) return null;
  const center = nearestReachable({ lng, lat });
  return { center: [center.lng, center.lat], zoom };
}


interface RequestContext extends MoveOptions {
  /** Shape of a state, by two-letter code. The map owns the geometry. */
  stateGeometry?: (code: string) => GeoJSON.Geometry | undefined;
}

/**
 * Carry out a camera request posted to the store (see CameraRequest in
 * mapStore). Returns false when it cannot be carried out yet (a state whose
 * shape has not loaded), so the caller can keep the request and try again.
 */
export function applyCameraRequest(
  map: MapLibreMap,
  request: CameraRequest,
  { animate = true, stateGeometry }: RequestContext = {}
): boolean {
  const move: MoveOptions = { animate };
  switch (request.kind) {
    case 'us':
      fitUS(map, move);
      return true;
    case 'area': {
      const area = focusArea(request.id);
      if (area) fitArea(map, area, move);
      return true;
    }
    case 'state': {
      const geometry = stateGeometry?.(request.code);
      if (!geometry) return false;
      fitState(map, geometry, move);
      return true;
    }
    case 'bounds':
      fitPlace(map, request.bounds, move);
      return true;
    case 'point':
      flyToPoint(map, [request.lng, request.lat], request.zoom, move);
      return true;
    case 'points':
      fitPoints(map, request.points, move);
      return true;
  }
}

// ─── Queries ───────────────────────────────────────────────────────────────

/** Where a new map starts: on the whole country, before the first frame is drawn. */
export function initialCamera(): Pick<MapOptions, 'bounds' | 'fitBoundsOptions'> {
  const phone = isPhoneLayout();
  // The container is not measured yet; fitUS() on load applies the exact layout.
  const padding: Edges = phone
    ? {
        top: topControlsPx() + HOME_MARGIN_PHONE_PX,
        right: HOME_MARGIN_PHONE_PX,
        bottom: sheetPeekPx() + HOME_MARGIN_PHONE_PX,
        left: HOME_MARGIN_PHONE_PX,
      }
    : { top: topControlsPx(), right: FIT_MARGIN_DESKTOP_PX, bottom: FIT_MARGIN_DESKTOP_PX, left: FIT_MARGIN_DESKTOP_PX };
  return { bounds: US_BOUNDS, fitBoundsOptions: { padding } };
}

/** The zoom at which `bounds` exactly fills the visible area, or null if it cannot be worked out. */
function fitZoom(map: MapLibreMap, bounds: LngLatBoundsLike): number | null {
  const camera = map.cameraForBounds(bounds, { padding: fitPadding(map) });
  return camera?.zoom ?? null;
}

/** True while the map still shows the home view, so "reset view" has nothing to do. */
export function isAtHome(map: MapLibreMap): boolean {
  if (map.getBearing() !== 0 || map.getPitch() !== 0) return false;
  const home = map.cameraForBounds(US_BOUNDS, { padding: homePadding(map) });
  if (!home || home.center === undefined || home.zoom === undefined) return false;
  if (Math.abs(map.getZoom() - home.zoom) > 0.05) return false;
  const want = map.project(home.center);
  const have = map.project(map.getCenter());
  return Math.abs(want.x - have.x) < 4 && Math.abs(want.y - have.y) < 4;
}

/**
 * True while a focus area is seen as a shape: not zoomed in much past the
 * view that frames it. Past that, a click inside the boundary is a click on
 * the map, and must not pull the view back out to the whole area.
 */
export function areaReadsAsShape(map: MapLibreMap, area: FocusArea): boolean {
  const zoom = fitZoom(map, area.bounds);
  return zoom === null || map.getZoom() < Math.min(zoom, AREA_MAX_ZOOM) + 1;
}

// ─── Geometry helpers ──────────────────────────────────────────────────────

function isGeometry(value: GeoJSON.Geometry | LngLatBoundsLike): value is GeoJSON.Geometry {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'type' in value;
}

type Coords = number[] | Coords[];

function geometryBounds(geometry: GeoJSON.Geometry): LngLatBounds | null {
  if (geometry.type === 'GeometryCollection') {
    const all = new LngLatBounds();
    for (const g of geometry.geometries) {
      const b = geometryBounds(g);
      if (b) all.extend(b);
    }
    return all.isEmpty() ? null : all;
  }
  const bounds = new LngLatBounds();
  const extend = (coords: Coords): void => {
    if (typeof coords[0] === 'number') bounds.extend([coords[0], coords[1] as number]);
    else for (const c of coords as Coords[]) extend(c);
  };
  extend(geometry.coordinates as Coords);
  return bounds.isEmpty() ? null : bounds;
}
