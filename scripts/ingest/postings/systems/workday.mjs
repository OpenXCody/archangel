// Workday: a list in pages of 20 (the most it gives), then one request per
// posting for its text. `board` is the site's address under /wday/cxs:
// https://boeing.wd1.myworkdayjobs.com/wday/cxs/boeing/EXTERNAL_CAREERS
//
// This is where the requests are. The list is narrowed to the United States
// when the board offers that as a filter, and the runner asks for the text
// only of postings whose title it keeps and whose listing is new or changed.
import { distinct, isoTime, shape, webAddress, words } from './shared.mjs';

export const name = 'Workday';
export const how = 'One request per 20 postings for the list, then one per kept posting that is new or changed.';
export const pace = 2000;

const PAGE = 20;
/** 20,000 postings: a count that never ends is a changed feed, not a large board. */
const MOST_PAGES = 1000;
/** Workday's own id for the United States, the same on every board. */
const UNITED_STATES = 'bc33aa3152ec42d4995f4791a106ed09';

export const feed = (board) => `${String(board).replace(/\/+$/, '')}/jobs`;

/** The filter that narrows a board to the United States, if it offers one: { <parameter>: [id] }. */
export function countryFacet(facets) {
  for (const facet of facets ?? []) {
    for (const value of facet?.values ?? []) {
      if (value?.id === UNITED_STATES && typeof facet.facetParameter === 'string') return { [facet.facetParameter]: [value.id] };
      const nested = countryFacet([value]);
      if (nested) return nested;
    }
  }
  return null;
}

/** "Posted Today", "Posted Yesterday", "Posted 6 Days Ago", "Posted 30+ Days Ago" as a day. */
export function postedDay(text, today) {
  const base = new Date(`${today}T00:00:00Z`);
  const said = String(text ?? '').toLowerCase();
  let back = null;
  if (said.includes('today')) back = 0;
  else if (said.includes('yesterday')) back = 1;
  else {
    const days = /(\d+)\+?\s+days?\s+ago/.exec(said);
    if (days) back = Number(days[1]);
  }
  if (back === null) return null;
  base.setUTCDate(base.getUTCDate() - back);
  return base.toISOString().slice(0, 10);
}

/** The posting's own id: the requisition at the end of its path ("..._JR2026516085-1"). */
function idOf(job) {
  const tail = /_([^_/]+)$/.exec(job.externalPath ?? '');
  return tail ? tail[1] : words(job.bulletFields?.[0]) ?? job.externalPath;
}

export async function list(board, { post, today }) {
  const url = feed(board);
  const { host, pathname } = new URL(url);
  const site = pathname.split('/').filter(Boolean).slice(-2, -1)[0];
  const ask = (offset, appliedFacets) => post(url, { appliedFacets, limit: PAGE, offset, searchText: '' });

  let { json } = await ask(0, {});
  shape(Array.isArray(json?.jobPostings), 'no list of postings', url);
  const facet = countryFacet(json.facets) ?? {};
  if (Object.keys(facet).length > 0) {
    ({ json } = await ask(0, facet));
    shape(Array.isArray(json?.jobPostings), 'no list of postings', url);
  }
  // Later pages do not repeat the count.
  const total = Number(json.total ?? 0);
  const out = [];
  const seen = new Set();
  for (let page = 0; page < MOST_PAGES; page += 1) {
    if (page > 0) {
      ({ json } = await ask(page * PAGE, facet));
      shape(Array.isArray(json?.jobPostings), 'no list of postings', url);
    }
    for (const job of json.jobPostings) {
      // A row with no path is a posting the board has withdrawn and not yet dropped.
      if (!job?.externalPath || typeof job.title !== 'string') continue;
      const id = idOf(job);
      if (seen.has(id)) continue;
      seen.add(id);
      const place = words(job.locationsText);
      // "2 Locations": the places are in the posting itself.
      const several = place !== null && /^\d+ locations$/i.test(place);
      out.push({
        id,
        title: job.title.trim(),
        location: several ? null : place,
        locations: several || !place ? [] : [place],
        address: null,
        department: null,
        url: webAddress(`https://${host}/${site}${job.externalPath}`),
        postedAt: postedDay(job.postedOn, today),
        updatedAt: null,
        country: Object.keys(facet).length > 0 ? 'US' : null,
        text: null,
        hints: {},
        path: job.externalPath,
      });
    }
    if (json.jobPostings.length === 0 || (page + 1) * PAGE >= total) return out;
  }
  shape(false, `more than ${MOST_PAGES} pages`, url);
  return out;
}

export async function text(board, listed, { get }) {
  const url = `${String(board).replace(/\/+$/, '')}${listed.path}`;
  const { json } = await get(url, { missingIsFine: true });
  const job = json?.jobPostingInfo;
  shape(job && typeof job.title === 'string', 'no posting in the detail', url);
  const locations = distinct([job.location, ...(Array.isArray(job.additionalLocations) ? job.additionalLocations : [])]);
  const type = /full/i.test(job.timeType ?? '') ? 'full-time' : /part/i.test(job.timeType ?? '') ? 'part-time' : null;
  return {
    text: job.jobDescription ?? '',
    location: locations[0] ?? listed.location,
    locations: locations.length > 0 ? locations : listed.locations,
    url: webAddress(job.externalUrl) ?? listed.url,
    postedAt: isoTime(job.startDate)?.slice(0, 10) ?? listed.postedAt,
    country: words(job.jobRequisitionLocation?.country?.alpha2Code)?.toUpperCase() ?? listed.country,
    hints: type ? { employmentType: type } : {},
  };
}
