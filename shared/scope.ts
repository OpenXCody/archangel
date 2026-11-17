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
  /**
   * The same boundary as [longitude, latitude] points, closed (first = last).
   * The server counts what is inside the area with it; the map draws the file
   * at boundaryUrl. Keep the two in step.
   */
  ring: [number, number][];
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
    ring: [
    [-97.315, 29.787], [-97.3186, 29.7844], [-97.5986, 29.6306], [-97.6345, 29.6495],
    [-97.6524, 29.6667], [-97.7206, 29.6822], [-97.7386, 29.7131], [-97.7673, 29.7191],
    [-97.7816, 29.7595], [-97.7996, 29.7526], [-97.8175, 29.7904], [-97.8427, 29.799],
    [-97.8498, 29.8437], [-97.875, 29.8583], [-98.0006, 29.7526], [-98.0293, 29.8488],
    [-98.2985, 30.0378], [-98.1729, 30.3565], [-98.1262, 30.4261], [-98.0975, 30.4673],
    [-98.1226, 30.4845], [-98.0508, 30.6245], [-97.9611, 30.786], [-97.8283, 30.9063],
    [-97.6237, 30.8702], [-97.315, 30.7525], [-97.272, 30.7354], [-97.1535, 30.457],
    [-97.333, 30.4029], [-97.2002, 30.3376], [-97.0817, 30.2594], [-97.0243, 30.0515],
    [-97.315, 29.787],
    ],
    center: { latitude: 30.2672, longitude: -97.7431 },
  },
];

export function focusArea(id: string): FocusArea | undefined {
  return FOCUS_AREAS.find((area) => area.id === id);
}

/** Great-circle distance in miles between two points. */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}
