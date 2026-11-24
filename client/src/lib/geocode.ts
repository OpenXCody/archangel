/**
 * Place search (addresses, cities, counties, states) through MapTiler's
 * geocoding API, with the same key the basemap uses. Without a key there is
 * no place search; the rest of the map search is unaffected.
 */
import type { Bounds } from '@shared/scope';
import { STATE_CODE_BY_NAME } from './places';

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
    // A ZIP+4 ("78664-7301") is one side of one street: to a person it is the ZIP code again.
    if (/^\d{5}-\d{4}$/.test(bare)) continue;
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

// ---------------------------------------------------------------------------
// An address typed in a form (Admin Tools: a factory's address)
// ---------------------------------------------------------------------------

/** An address as people write one. */
export interface TypedAddress {
  street: string;
  city: string;
  /** The state's two-letter code. */
  state: string;
  zip: string;
}

/** Where a typed address was found. */
export interface FoundAddress {
  /** "1 Tesla Road, Travis County, TX 78725": the place found, as one line. */
  label: string;
  latitude: number;
  longitude: number;
  /**
   * What was found: the address itself, its street (the number was not
   * found on it), or only its town or ZIP code, whose middle the point is.
   */
  precision: 'address' | 'street' | 'town';
}

/** A typed address needs less of a match than a search does: the state is checked, and the person is shown what was found. */
const MIN_ADDRESS_RELEVANCE = 0.7;

function featureState(feature: GeocodingFeature): string | undefined {
  const region = feature.context?.find((c) => c.id?.startsWith('region.'))?.text?.trim();
  return region ? (STATE_CODE_BY_NAME[region] ?? region) : undefined;
}

function addressLabel(feature: GeocodingFeature): string {
  const part = (kind: string): string | undefined => feature.context?.find((c) => c.id?.startsWith(`${kind}.`))?.text?.trim() || undefined;
  const [first] = (feature.place_name ?? feature.text ?? '').split(',').map((piece) => piece.trim());
  const state = featureState(feature);
  const type = feature.place_type?.[0] ?? '';
  const town = part('municipality') ?? part('joint_municipality') ?? part('place');
  const county = part('county');
  const within = type === 'address' || type === 'postal_code' ? (town ?? (county ? countyName(county, state) : undefined)) : undefined;
  const zip = type === 'postal_code' ? undefined : part('postal_code');
  return [first, within === first ? undefined : within, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

async function geocode(query: string, types: string[], signal?: AbortSignal): Promise<GeocodingFeature[]> {
  const url = `${GEOCODING_BASE}/${encodeURIComponent(query)}.json?key=${encodeURIComponent(mapKey())}&country=us&limit=5&types=${types.join(',')}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Address lookup failed: HTTP ${res.status}`);
  return ((await res.json()) as { features?: GeocodingFeature[] }).features ?? [];
}

/**
 * Find a typed address in its state: the address itself when the geocoder
 * knows it, else its town or ZIP code. Null when nothing in that state
 * matches. Throws when there is no map key or the request fails: the form
 * then says the address could not be looked up and offers the coordinates.
 */
export async function findAddress(typed: TypedAddress, signal?: AbortSignal): Promise<FoundAddress | null> {
  if (!mapKey()) throw new Error('No map key is set, so an address cannot be looked up.');
  const street = typed.street.trim();
  const city = typed.city.trim();
  const zip = typed.zip.trim();
  const usable = (feature: GeocodingFeature): feature is GeocodingFeature & { center: [number, number] } =>
    Boolean(feature.center && feature.center.length >= 2 && feature.center.every(Number.isFinite)) && featureState(feature) === typed.state;
  const found = (feature: GeocodingFeature & { center: [number, number] }, precision: FoundAddress['precision']): FoundAddress => ({
    label: addressLabel(feature),
    latitude: Number(feature.center[1].toFixed(6)),
    longitude: Number(feature.center[0].toFixed(6)),
    precision,
  });

  if (street) {
    const features = await geocode([street, city, `${typed.state} ${zip}`.trim()].filter(Boolean).join(', '), ['address'], signal);
    const match = features.find((feature) => usable(feature) && (feature.relevance ?? 1) >= MIN_ADDRESS_RELEVANCE);
    if (match && usable(match)) {
      // A number typed and none in what came back: the street was found, the building was not.
      const numbered = /^\d/.test(street) && !/^\d/.test((match.place_name ?? '').trim());
      return found(match, numbered ? 'street' : 'address');
    }
  }
  // The town, or failing that the ZIP code: enough to put the factory on the map, and said as such.
  for (const query of [city ? `${city}, ${typed.state}` : '', zip]) {
    if (!query) continue;
    const features = await geocode(query, ['municipality', 'joint_municipality', 'place', 'locality', 'postal_code'], signal);
    const match = features.find((feature) => usable(feature) && (feature.relevance ?? 1) >= MIN_ADDRESS_RELEVANCE);
    if (match && usable(match)) return found(match, 'town');
  }
  return null;
}
