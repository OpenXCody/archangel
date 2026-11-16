/**
 * The map's pins on the wire.
 *
 * Every factory in the country travels in one response, so its shape matters:
 * as GeoJSON it was 22 MB, too large for the CDN to cache, which meant every
 * visit ran the query and downloaded it again. This form says each company
 * and industry once and each pin as a short row, which comes to about a third
 * of that and caches at the edge. The client turns it back into GeoJSON.
 *
 * A pin carries exactly what the map draws and the hover card shows; anything
 * more belongs to the factory's page.
 */

/** [name, tier]. Tier 2: featured employer. 1: established company. 0: other. */
export type PinCompany = [name: string, tier: number];

/**
 * [id, longitude, latitude, company, name, industry, city, state, openJobs].
 * `company` and `industry` are positions in the payload's lists, or -1 for none.
 */
export type PinRow = [
  id: string,
  longitude: number,
  latitude: number,
  company: number,
  name: string,
  industry: number,
  city: string | null,
  state: string | null,
  openJobs: number,
];

export interface PinsPayload {
  companies: PinCompany[];
  industries: string[];
  pins: PinRow[];
}

/** One factory as the server reads it, before packing. */
export interface PinSource {
  id: string;
  name: string;
  latitude: string;
  longitude: string;
  companyId: string | null;
  companyName: string | null;
  tier: number;
  industry: string | null;
  city: string | null;
  state: string | null;
  openJobs: number;
}

/** What a pin's GeoJSON feature carries once unpacked. */
export interface PinProperties {
  id: string;
  name: string;
  companyName: string | null;
  tier: number;
  industry: string | null;
  city: string | null;
  state: string | null;
  openJobs: number;
}

/** Five decimal places is about a metre: plenty for a pin, and shorter to send. */
function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

/** Pack factories for the wire. Rows without usable coordinates are left out. */
export function packPins(rows: PinSource[]): PinsPayload {
  const companies: PinCompany[] = [];
  const industries: string[] = [];
  const companyAt: Record<string, number> = {};
  const industryAt: Record<string, number> = {};
  const pins: PinRow[] = [];

  for (const row of rows) {
    const lng = parseFloat(row.longitude);
    const lat = parseFloat(row.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    let company = -1;
    if (row.companyId && row.companyName) {
      company = companyAt[row.companyId] ?? -1;
      if (company === -1) {
        company = companies.push([row.companyName, row.tier]) - 1;
        companyAt[row.companyId] = company;
      }
    }

    let industry = -1;
    if (row.industry) {
      industry = industryAt[row.industry] ?? -1;
      if (industry === -1) {
        industry = industries.push(row.industry) - 1;
        industryAt[row.industry] = industry;
      }
    }

    pins.push([row.id, round5(lng), round5(lat), company, row.name, industry, row.city, row.state, row.openJobs]);
  }

  return { companies, industries, pins };
}

/** Unpack the wire form into the GeoJSON the map's source takes. */
export function unpackPins(payload: PinsPayload): GeoJSON.FeatureCollection<GeoJSON.Point, PinProperties> {
  const features = payload.pins.map(
    ([id, lng, lat, company, name, industry, city, state, openJobs]): GeoJSON.Feature<GeoJSON.Point, PinProperties> => {
      const owner = company >= 0 ? payload.companies[company] : undefined;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          id,
          name,
          companyName: owner ? owner[0] : null,
          tier: owner ? owner[1] : 0,
          industry: industry >= 0 ? (payload.industries[industry] ?? null) : null,
          city,
          state,
          openJobs,
        },
      };
    },
  );
  return { type: 'FeatureCollection', features };
}
