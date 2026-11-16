/**
 * Place search (addresses, cities, counties, states) through MapTiler's
 * geocoding API, with the same key the basemap uses. Without a key there is
 * no place search; the rest of the map search is unaffected.
 */
import type { Bounds } from '@shared/scope';

const GEOCODING_BASE = 'https://api.maptiler.com/geocoding';

export interface Place {
  id: string;
  /** "Round Rock" */
  name: string;
  /** "Williamson County, Texas" — what tells two Springfields apart. */
  context: string;
  center: [number, number];
  /** The place's extent, when it has one (a point address does not). */
  bounds: Bounds | null;
  /** Zoom to use when there are no bounds to fit. */
  zoom: number;
}

interface GeocodingFeature {
  id?: string;
  text?: string;
  place_name?: string;
  center?: [number, number];
  bbox?: [number, number, number, number];
  place_type?: string[];
}

/** How close to go for a place that is a point, by what kind of place it is. */
const ZOOM_BY_TYPE: Record<string, number> = {
  address: 15,
  poi: 15,
  road: 14,
  neighbourhood: 13,
  postal_code: 12,
  place: 12,
  municipality: 11,
  municipal_district: 11,
  locality: 12,
  county: 9,
  subregion: 9,
  region: 6,
  country: 4,
};

function mapKey(): string {
  return (import.meta.env.VITE_MAP_TOKEN as string | undefined)?.trim() || '';
}

/** True when a map key is configured, so place search can run. */
export function placeSearchAvailable(): boolean {
  return mapKey() !== '';
}

/**
 * Look up places in the United States matching `query`. Pass the query's
 * AbortSignal so a superseded lookup is dropped. Throws on a failed request;
 * callers treat that as "no places" and say nothing.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const key = mapKey();
  if (!key) return [];
  const url = `${GEOCODING_BASE}/${encodeURIComponent(query)}.json?key=${encodeURIComponent(key)}&country=us&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Place search failed: HTTP ${res.status}`);
  const body = (await res.json()) as { features?: GeocodingFeature[] };

  const places: Place[] = [];
  for (const feature of body.features ?? []) {
    const { center, bbox } = feature;
    if (!center || center.length < 2 || !center.every(Number.isFinite)) continue;
    // "1 Tesla Road, Travis, Texas 78725, United States": the first part names
    // the place, the rest tells two Springfields apart. Every result is in
    // the United States, so that part is dropped.
    const [first, ...rest] = (feature.place_name ?? feature.text ?? '').split(',').map((part) => part.trim());
    const name = first || feature.text || '';
    if (!name) continue;
    const context = rest.filter((part) => part !== '' && part !== 'United States').join(', ');
    // A bbox with no extent (a point) cannot be fitted: fall back to the center.
    const hasExtent = bbox && bbox.every(Number.isFinite) && bbox[2] - bbox[0] > 1e-4 && bbox[3] - bbox[1] > 1e-4;
    places.push({
      id: feature.id ?? `${center[0]},${center[1]}`,
      name,
      context,
      center: [center[0], center[1]],
      bounds: hasExtent ? [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] : null,
      zoom: ZOOM_BY_TYPE[feature.place_type?.[0] ?? ''] ?? 12,
    });
  }
  return places;
}
