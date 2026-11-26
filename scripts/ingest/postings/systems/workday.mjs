// Workday: a list in pages of 20 (the most it gives), then one request per
// posting for its text. `board` is the site's address under /wday/cxs:
// https://boeing.wd1.myworkdayjobs.com/wday/cxs/boeing/EXTERNAL_CAREERS
//
// This is where the requests are. The list is narrowed to the United States
// when the board offers that as a filter, and the runner asks for the text
// only of postings whose title it keeps and whose listing is new or changed.
// It is not narrowed further, to the states new jobs are ported from: what a
// board's site filters return is not known well enough to rely on (see
// scripts/ingest/README.md, "A platform's budget"); the runner sets aside
// what is outside them from the listing as it comes.
import { distinct, isoTime, shape, webAddress, words } from './shared.mjs';

export const name = 'Workday';
export const how = 'One request per 20 postings for the list, then one per kept posting that is new or changed.';
// Every Workday board is a tenant of one platform, and the platform turns a busy robot away (it reset the
// scout after about 870 requests in an hour, and answered 429 the same day). So the platform has a budget
// for the whole run, across every board on it: 300 requests, four seconds apart, about twenty minutes. It
// goes to the board that has waited longest for its turn (inTurn in jobs.mjs), so one long listing cannot
// take it run after run; a listing the budget cuts is taken up where it stopped when its turn comes round
// again, with every text up to the cut already read.
export const pace = 4000;
export const budget = { platform: 'myworkdayjobs.com', requests: 300 };
export const resumes = true;
// A text here is dear: one that was read is read again after sixty days, not thirty, unless its listing changed.
export const rereadDays = 60;

const PAGE = 20;
/** How far before the point a listing was cut it is taken up again: two pages. */
const BACK_UP = 2 * PAGE;
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

/**
 * The listing, twenty postings to a request. `from` is where an earlier run
 * was cut: { offset, facet, total }. A listing taken up again starts two
 * pages before that point, so that postings which left the board since (and
 * moved the rest up) do not hide the ones that followed them.
 */
export async function* pages(board, { post, today }, from = null) {
  const url = feed(board);
  const { host, pathname } = new URL(url);
  const site = pathname.split('/').filter(Boolean).slice(-2, -1)[0];
  const ask = (offset, appliedFacets) => post(url, { appliedFacets, limit: PAGE, offset, searchText: '' });

  let facet = from?.facet ?? null;
  let total = from?.total ?? 0;
  let offset = from ? Math.max(0, Number(from.offset ?? 0) - BACK_UP) : 0;
  let json = null;
  if (!from) {
    ({ json } = await ask(0, {}));
    shape(Array.isArray(json?.jobPostings), 'no list of postings', url);
    facet = countryFacet(json.facets) ?? {};
    // With the filter the first page is asked for again; without it, this is the first page.
    if (Object.keys(facet).length > 0) json = null;
  }
  const seen = new Set();
  for (let page = 0; page < MOST_PAGES; page += 1) {
    if (json === null) {
      ({ json } = await ask(offset, facet));
      shape(Array.isArray(json?.jobPostings), 'no list of postings', url);
    }
    // Later pages do not repeat the count.
    if (offset === 0 && Number(json.total) > 0) total = Number(json.total);
    const postings = [];
    for (const job of json.jobPostings) {
      // A row with no path is a posting the board has withdrawn and not yet dropped.
      if (!job?.externalPath || typeof job.title !== 'string') continue;
      const id = idOf(job);
      if (seen.has(id)) continue;
      seen.add(id);
      const place = words(job.locationsText);
      // "2 Locations": the places are in the posting itself.
      const several = place !== null && /^\d+ locations$/i.test(place);
      postings.push({
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
    const count = json.jobPostings.length;
    json = null;
    offset += PAGE;
    // The end: a page that is not full, or the count the first page gave.
    const last = count < PAGE || (total > 0 && offset >= total);
    yield { postings, next: last ? null : { offset, facet, total } };
    if (last) return;
  }
  shape(false, `more than ${MOST_PAGES} pages`, url);
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
