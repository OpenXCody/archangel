// iCIMS career sites built on Jibe: pages of 100 postings, text included.
// `board` is the career site's host (careers.rivian.com). A posting at more
// than one site (`multipleLocations`) names the others in
// `additional_locations`, each with its own city, state and country: every
// site is read, and one abroad is left out.
import { isUnitedStates, isoTime, shape, webAddress, words } from './shared.mjs';

export const name = 'iCIMS (Jibe career site)';
export const how = 'One request per 100 postings, text included.';
// These sites' robots files ask for five seconds between requests; the fetcher keeps whichever is longer.
export const pace = 2000;

const PAGE = 100;
/** No board is this many pages: a count that never ends is a changed feed, not a large one. */
const MOST_PAGES = 100;

export const feed = (board, page = 1) => `https://${board}/api/jobs?page=${page}&limit=${PAGE}`;

/** A site as the feed gives it: its place as "City, State" in the feed's own words, its street, and its own country. */
function siteOf(site) {
  return {
    place: [words(site?.city), words(site?.state)].filter(Boolean).join(', ') || null,
    address: [words(site?.street_address), words(site?.postal_code)].filter(Boolean).join(', ') || null,
    country: words(site?.country_code)?.toUpperCase() ?? null,
  };
}

/**
 * Every site a posting is at: the first as the job's own fields say it (its location line where they name no city or
 * state), then each of `additional_locations` (a posting with `multipleLocations`), once each. Each site's own country
 * is checked: a site abroad is left out and the others are kept. A posting at no site in the United States is said as
 * its first site, whose country then says it is abroad.
 *
 * { location, locations, address, country }: the places in order, the street of each (semicolons between), and the
 * country of the first, as the contract asks. A posting at one site reads exactly as it did before others were read.
 */
export function sitesOf(job) {
  const first = siteOf(job);
  first.place ??= words(job.full_location) ?? words(job.location_name);
  const others = (Array.isArray(job.additional_locations) ? job.additional_locations : [])
    .filter((site) => site && typeof site === 'object').map(siteOf).filter((site) => site.place);
  const home = [first, ...others].filter((site) => site.place && (!site.country || isUnitedStates(site.country)));
  const shown = home.length > 0 ? home : [first];
  const places = new Map();
  for (const site of shown) if (site.place && !places.has(site.place.toLowerCase())) places.set(site.place.toLowerCase(), site.place);
  return {
    location: [...places.values()][0] ?? null,
    locations: [...places.values()],
    address: [...new Set(shown.map((site) => site.address).filter(Boolean))].join('; ') || null,
    country: shown[0].country,
  };
}

export async function* pages(board, { get }) {
  const seen = new Set();
  let listed = 0;
  for (let page = 1; page <= MOST_PAGES; page += 1) {
    const url = feed(board, page);
    const { json } = await get(url);
    shape(Array.isArray(json?.jobs), 'no list of jobs', url);
    const postings = [];
    for (const { data: job } of json.jobs) {
      shape(job && (job.req_id ?? job.slug) !== undefined && typeof job.title === 'string', 'a job with no id or title', url);
      const id = String(job.req_id ?? job.slug);
      if (seen.has(id)) continue;
      seen.add(id);
      // A posting at several sites names each of them; the ones abroad are left out.
      const { location, locations, address, country } = sitesOf(job);
      postings.push({
        id,
        title: job.title.trim(),
        location,
        locations,
        address,
        department: (job.categories ?? []).map((c) => words(c?.name)).filter(Boolean).join(', ') || null,
        // The posting's own page on the career site; the apply address is a sign-in.
        url: webAddress(job.meta_data?.canonical_url) ?? webAddress(job.apply_url),
        postedAt: isoTime(job.posted_date),
        updatedAt: isoTime(job.update_date),
        country,
        text: [job.description, job.responsibilities, job.qualifications].filter(Boolean).join('\n\n'),
        hints: /^(FULL_TIME|PART_TIME|CONTRACTOR)$/.test(job.employment_type ?? '')
          ? { employmentType: { FULL_TIME: 'full-time', PART_TIME: 'part-time', CONTRACTOR: 'contract' }[job.employment_type] }
          : {},
      });
    }
    listed += json.jobs.length;
    const total = Number(json.totalCount ?? json.count ?? 0);
    const last = json.jobs.length === 0 || listed >= total;
    yield { postings, next: last ? null : page + 1 };
    if (last) return;
  }
  shape(false, `more than ${MOST_PAGES} pages`, feed(board));
}
