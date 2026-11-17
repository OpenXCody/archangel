/**
 * Place search (addresses, cities, counties, states) through MapTiler's
 * geocoding API, with the same key the basemap uses. Without a key there is
 * no place search; the rest of the map search is unaffected.
 */
import type { Bounds } from '@shared/scope';
import { US_STATES } from '@shared/states';

const GEOCODING_BASE = 'https://api.maptiler.com/geocoding';

export interface Place {
  id: string;
  /** "Round Rock" */
  name: string;
  /** "Williamson County, TX": what tells two Springfields apart. It always names the state. */
  context: string;
  center: [number, number];
  /** The place's extent, when it has one (a point address does not). */
  bounds: Bounds | null;
  /** Zoom to use when there are no bounds to fit. */
  zoom: number;
}

interface GeocodingContext {
  /** "county.123", "region.45": the kind of place, then a number. */
  id?: string;
  text?: string;
}

interface GeocodingFeature {
  id?: string;
  text?: string;
  place_name?: string;
  center?: [number, number];
  bbox?: [number, number, number, number];
  place_type?: string[];
  /** 0 to 1: how much of what was typed the result accounts for. */
  relevance?: number;
  context?: GeocodingContext[];
}

/**
 * The kinds of place the map's search offers: somewhere people live and work.
 * Streets are offered only for something that reads as a street address (it
 * has a number in it); rivers, lakes and hills never are. Typing "samsung"
 * or "welder" is asking about a company or a career, not Samsung Boulevard
 * or Welder Lake. States come from our own data, with their panels.
 */
const SETTLEMENT_TYPES = [
  'county',
  'joint_municipality',
  'joint_submunicipality',
  'municipality',
  'municipal_district',
  'locality',
  'neighbourhood',
  'place',
  'postal_code',
];

/**
 * Below this, the geocoder is guessing: "qzxwv plant" is not Plant City
 * (0.5), and "welder" is not Wilder, Idaho (0.92).
 */
const MIN_RELEVANCE = 0.95;

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

const STATE_CODE_BY_NAME: Record<string, string> = Object.fromEntries(US_STATES.map((s) => [s.name, s.code]));

/** "Williamson" as "Williamson County"; names that already say what they are stay as they are. */
function countyName(text: string, stateCode: string | undefined): string {
  if (/\b(county|parish|borough|census area|municipality|region|city|district)\b/i.test(text)) return text;
  if (stateCode === 'LA') return `${text} Parish`;
  if (stateCode === 'AK') return text;
  return `${text} County`;
}

/**
 * Where a place is, from the geocoder's own breakdown: the city for a
 * neighbourhood, ZIP code or address, the county for a town, and always the
 * state. "Round Rock" alone is four places; "Williamson County, TX" is one.
 */
function placeContext(feature: GeocodingFeature, name: string): string {
  const part = (kind: string): string | undefined =>
    feature.context?.find((c) => c.id?.startsWith(`${kind}.`))?.text?.trim() || undefined;
  const region = part('region');
  const stateCode = region ? STATE_CODE_BY_NAME[region] : undefined;
  const state = stateCode ?? region;
  const type = feature.place_type?.[0] ?? '';
  const city = part('municipality') ?? part('joint_municipality');
  const county = part('county');

  let within: string | undefined;
  if (type !== 'county' && type !== 'municipality' && city && city !== name) within = city;
  else if (type !== 'county' && county) within = countyName(county, stateCode);
  return [within, state].filter(Boolean).join(', ');
}

/**
 * Look up places in the United States matching `query`. Pass the query's
 * AbortSignal so a superseded lookup is dropped. Throws on a failed request;
 * callers treat that as "no places" and say nothing.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const key = mapKey();
  if (!key) return [];
  const types = /\d/.test(query) ? [...SETTLEMENT_TYPES, 'address'] : SETTLEMENT_TYPES;
  const url =
    `${GEOCODING_BASE}/${encodeURIComponent(query)}.json?key=${encodeURIComponent(key)}` +
    `&country=us&limit=5&types=${types.join(',')}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Place search failed: HTTP ${res.status}`);
  const body = (await res.json()) as { features?: GeocodingFeature[] };

  const places: Place[] = [];
  const seen = new Set<string>();
  for (const feature of body.features ?? []) {
    const { center, bbox } = feature;
    if (!center || center.length < 2 || !center.every(Number.isFinite)) continue;
    if ((feature.relevance ?? 1) < MIN_RELEVANCE) continue;
    // "1 Tesla Road, Travis, Texas 78725, United States": the first part
    // names the place; where it is comes from the structured context.
    const [first] = (feature.place_name ?? feature.text ?? '').split(',').map((part) => part.trim());
    const bare = first || feature.text || '';
    if (!bare) continue;
    const context = placeContext(feature, bare);
    // A county is named with its kind: "Travis" alone reads as a town.
    const name = feature.place_type?.[0] === 'county' ? countyName(bare, context) : bare;
    // Two rows a person cannot tell apart are one row.
    const label = `${name}|${context}`;
    if (seen.has(label)) continue;
    seen.add(label);
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
