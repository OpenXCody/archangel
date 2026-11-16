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
  LngLatBounds,
  type GeoJSONSource,
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
/** At or below this width the detail panel is a bottom sheet. */
export const PHONE_LAYOUT_QUERY = '(max-width: 768px)';

/**
 * The floating search bar (16px from the top, about 46px tall) and the row of
 * focus-area chips under it (8px gap, about 30px tall), plus a little air.
 */
const TOP_CONTROLS_PX = 104;
/** Breathing room between fitted content and the edge of the visible area. */
const FIT_MARGIN_DESKTOP_PX = 48;
const FIT_MARGIN_PHONE_PX = 20;
/** Never squeeze the visible area below this, however small the screen. */
const MIN_VISIBLE_PX = 96;

const STATE_MAX_ZOOM = 7;
const AREA_MAX_ZOOM = 11;
const PLACE_MAX_ZOOM = 14;
const POINT_ZOOM = 8;
const POINTS_MAX_ZOOM = 10;
const CLUSTER_MIN_STEP = 1.5;

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

/** Height of the phone sheet in its resting state, in px. */
export function sheetPeekPx(): number {
  return Math.round((window.innerHeight * SHEET_PEEK_VH) / 100);
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
    return { top: TOP_CONTROLS_PX, right: 0, bottom: panelOpen ? sheetPeekPx() : 0, left: 0 };
  }
  return { top: 0, right: panelOpen ? PANEL_WIDTH_PX : 0, bottom: 0, left: 0 };
}

/** Padding for fitting bounds: the covered edges plus a margin, never more than the canvas can give. */
function fitPadding(map: MapLibreMap): Edges {
  const covered = coveredEdges();
  const phone = isPhoneLayout();
  const side = phone ? FIT_MARGIN_PHONE_PX : FIT_MARGIN_DESKTOP_PX;
  // Desktop clears the search bar and chips on both sides so content stays vertically centered.
  const vertical = phone ? FIT_MARGIN_PHONE_PX : TOP_CONTROLS_PX;
  const padding: Edges = {
    top: covered.top + vertical,
    right: covered.right + side,
    bottom: covered.bottom + vertical,
    left: covered.left + side,
  };

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

function fit(map: MapLibreMap, bounds: LngLatBoundsLike, maxZoom: number | undefined, duration: number): void {
  dropSavedPadding(map);
  map.fitBounds(bounds, {
    padding: fitPadding(map),
    ...(maxZoom === undefined ? {} : { maxZoom }),
    bearing: 0,
    pitch: 0,
    duration,
  });
}

/** Frame the continental United States. The home view. */
export function fitUS(map: MapLibreMap, { animate = true }: MoveOptions = {}): void {
  fit(map, US_BOUNDS, undefined, animate ? 700 : 0);
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
  map.flyTo({
    center: lngLat,
    zoom: zoom ?? Math.max(map.getZoom(), POINT_ZOOM),
    bearing: 0,
    pitch: 0,
    offset: visibleCenterOffset(),
    duration: animate ? 500 : 0,
  });
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

/**
 * Open up a cluster: fly to it at the zoom where it breaks apart, and at
 * least a step and a half closer than now. The break-apart zoom alone can be
 * a fraction of a level away, where a big cluster only sheds a few points and
 * the click seems to do nothing.
 */
export async function zoomIntoCluster(
  map: MapLibreMap,
  sourceId: string,
  clusterId: number,
  lngLat: [number, number]
): Promise<void> {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (!source) return;
  try {
    const zoom = await source.getClusterExpansionZoom(clusterId);
    flyToPoint(map, lngLat, Math.max(zoom, map.getZoom() + CLUSTER_MIN_STEP));
  } catch {
    // The data changed under the click and the cluster is gone: step in instead.
    flyToPoint(map, lngLat, map.getZoom() + CLUSTER_MIN_STEP);
  }
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
  const margin = phone ? FIT_MARGIN_PHONE_PX : FIT_MARGIN_DESKTOP_PX;
  // The container is not measured yet; fitUS() on load applies the exact layout.
  return {
    bounds: US_BOUNDS,
    fitBoundsOptions: { padding: { top: TOP_CONTROLS_PX, right: margin, bottom: margin, left: margin } },
  };
}

/** The zoom at which `bounds` exactly fills the visible area, or null if it cannot be worked out. */
function fitZoom(map: MapLibreMap, bounds: LngLatBoundsLike): number | null {
  const camera = map.cameraForBounds(bounds, { padding: fitPadding(map) });
  return camera?.zoom ?? null;
}

/** True while the map still shows the home view, so "reset view" has nothing to do. */
export function isAtHome(map: MapLibreMap): boolean {
  if (map.getBearing() !== 0 || map.getPitch() !== 0) return false;
  const home = map.cameraForBounds(US_BOUNDS, { padding: fitPadding(map) });
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
