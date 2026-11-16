/**
 * What the app covers.
 *
 * Two separate ideas, kept separate on purpose:
 *
 * - COVERAGE is which rows the public API returns. It is the whole country:
 *   seeing every factory in the United States is the point of the map.
 * - FOCUS_AREAS are the regions being filled out in depth (featured employers,
 *   careers, jobs). Each has a boundary drawn on the map as a geofence.
 *
 * The map opens on the whole country. A focus area is somewhere to go, not a
 * limit on what exists.
 */

/** Two-letter state code to limit public reads to, or null for every state. */
export const SCOPE: { stateCode: string | null; stateName: string } = {
  stateCode: null,
  stateName: 'United States',
};

/** [[west, south], [east, north]] */
export type Bounds = [[number, number], [number, number]];

/** The continental United States: the map's opening view. */
export const US_BOUNDS: Bounds = [
  [-125.0, 24.4],
  [-66.9, 49.4],
];

export interface FocusArea {
  id: string;
  /** Shown on the map and in the area picker. */
  name: string;
  /** What the boundary is made of, for the panel. */
  description: string;
  /** Box around the boundary, used to frame it and to select rows on the server. */
  bounds: Bounds;
  /** GeoJSON of the boundary, served by the client (client/public). */
  boundaryUrl: string;
  center: { latitude: number; longitude: number };
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    id: 'austin',
    name: 'Austin, TX',
    description: 'Travis, Williamson, Hays, Bastrop and Caldwell counties',
    bounds: [
      [-98.2985, 29.6306],
      [-97.0243, 30.9063],
    ],
    boundaryUrl: '/data/areas/austin.geojson',
    center: { latitude: 30.2672, longitude: -97.7431 },
  },
];

export function focusArea(id: string): FocusArea | undefined {
  return FOCUS_AREAS.find((area) => area.id === id);
}

/** Bounds of the first focus area. Kept for callers that frame "the" focus area. */
export function focusBounds(): Bounds {
  return FOCUS_AREAS[0].bounds;
}

/** Great-circle distance in miles between two points. */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}
