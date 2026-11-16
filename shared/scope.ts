/**
 * The region the app currently covers.
 *
 * Every public read is limited to SCOPE.stateCode. Rows outside it stay in the
 * database, untouched and hidden. To widen coverage, change this file only.
 */
export const SCOPE = {
  /** Two-letter code, as stored in factories.state. */
  stateCode: 'TX',
  stateName: 'Texas',
  /** Where the map opens: a circle around this point. */
  focus: {
    name: 'Austin',
    latitude: 30.2672,
    longitude: -97.7431,
    radiusMiles: 50,
  },
} as const;

const MILES_PER_DEGREE_LATITUDE = 69.0;

/** Bounding box of the focus circle as [[west, south], [east, north]]. */
export function focusBounds(): [[number, number], [number, number]] {
  const { latitude, longitude, radiusMiles } = SCOPE.focus;
  const dLat = radiusMiles / MILES_PER_DEGREE_LATITUDE;
  const dLng = radiusMiles / (MILES_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180));
  return [
    [longitude - dLng, latitude - dLat],
    [longitude + dLng, latitude + dLat],
  ];
}

/** Great-circle distance in miles between two points. */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}
