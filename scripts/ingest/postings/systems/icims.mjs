// iCIMS career portals (the classic ones, at <name>.icims.com): the listing
// is the portal's own search pages, a request each, and a posting's text is
// its page, which carries the posting as schema.org data. `board` is the
// portal's host (careers-gdeb.icims.com).
//
// These are web pages, not a feed: the fetcher is asked for them as pages
// (accept 'html'), so a challenge page is a refusal like anywhere else. The
// portal's robots file allows its search and its job pages and disallows
// only signing in, referring and applying; none of those is asked for.
import { distinct, isoTime, shape, unescapeHtml, webAddress, words } from './shared.mjs';

export const name = 'iCIMS (career portal)';
export const how = 'One request per page of the portal\'s search, then one per kept posting that is new or changed.';
export const pace = 2000;
/** The most texts asked of one employer in one run; the rest are read on the runs that follow. */
export const textsPerRun = 60;

/** No portal is this many pages: a count that never ends is a changed page, not a large board. */
const MOST_PAGES = 200;

export const feed = (board, page = 0) => `https://${board}/jobs/search?pr=${page}&in_iframe=1`;

/** A piece of a page as plain words: tags out, entities undone. */
const plain = (html) => words(unescapeHtml(String(html ?? '').replace(/<[^>]*>/g, ' ')).replace(/ /g, ' '));

/** "US-CT-Groton" as { place: "Groton, CT", country: "US" }; a line in another form is kept as it is, with no country. */
export function placeOf(line) {
  const found = /^([A-Z]{2})-([A-Z]{2,3})-(.+)$/.exec(line ?? '');
  return found ? { place: `${found[3].trim()}, ${found[2]}`, country: found[1] } : { place: words(line), country: null };
}

/** The fields a posting carries in the listing, above its title or under it: { Location: "US-CT-Groton", Category: "Quality Control", … }. */
function headerFields(html) {
  const out = {};
  const pairs = [
    ...html.matchAll(/iCIMS_JobHeaderField[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*iCIMS_JobHeaderData[^>]*>([\s\S]*?)<\/dd>/g),
    ...html.matchAll(/<span[^>]*class="[^"]*\bfield-label\b[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/g),
  ];
  for (const [, label, value] of pairs) {
    const key = plain(label);
    if (key && !(key in out)) out[key] = plain(value);
  }
  return out;
}

export async function* pages(board, { get }) {
  const seen = new Set();
  for (let page = 0; page < MOST_PAGES; page += 1) {
    const url = feed(board, page);
    const { text: html } = await get(url, { accept: 'html' });
    shape(/iCIMS_JobsTable|iCIMS_MainWrapper|iCIMS_JobListingRow/.test(html), 'not a portal\'s search page', url);
    const postings = [];
    // Each posting is a card: a link to its page with its fields around it.
    const cards = html.split(/<li[^>]*class="[^"]*\biCIMS_JobCardItem\b/).slice(1);
    const links = [];
    for (const card of cards) {
      const link = /<a\s[^>]*href="(https:\/\/[^"]*\/jobs\/(\d+)\/[^"?]*\/job)[^"]*"[^>]*class="iCIMS_Anchor"[^>]*>([\s\S]*?)<\/a>/.exec(card);
      if (link) links.push({ link, card });
    }
    for (const { link, card } of links) {
      const [whole, address, id, inner] = link;
      if (seen.has(id)) continue;
      const title = plain(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/.exec(inner)?.[1]) ?? plain(/title="\d+\s*-\s*([^"]*)"/.exec(whole)?.[1]);
      shape(title, 'a posting with no title', url);
      seen.add(id);
      const fields = headerFields(card);
      // A posting at several places names them in one line, with a bar between.
      const places = distinct(String(fields.Location ?? fields['Job Locations'] ?? fields.Locations ?? '').split('|')).map(placeOf);
      const locations = distinct(places.map((place) => place.place));
      postings.push({
        id,
        title,
        location: locations[0] ?? null,
        locations,
        address: null,
        department: fields.Category ?? fields['Job Category'] ?? null,
        url: webAddress(address),
        postedAt: null,
        updatedAt: null,
        country: places[0]?.country ?? null,
        text: null,
        hints: {},
      });
    }
    const count = Number(/Page\s+\d+\s+of\s+(\d+)/i.exec(plain(html.slice(0, 400_000)) ?? '')?.[1] ?? 1);
    const last = links.length === 0 || page + 1 >= count;
    yield { postings, next: last ? null : page + 1 };
    if (last) return;
  }
  shape(false, `more than ${MOST_PAGES} pages`, feed(board));
}

/** The posting as schema.org data on its own page: the JobPosting among the page's JSON-LD blocks, or null. */
function jobPosting(html) {
  for (const [, block] of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(block);
      const found = (Array.isArray(data) ? data : [data]).find((item) => item?.['@type'] === 'JobPosting');
      if (found) return found;
    } catch {
      // A block that is not JSON is not the posting.
    }
  }
  return null;
}

export async function text(board, listed, { get }) {
  const url = `${listed.url}?in_iframe=1`;
  const { text: html } = await get(url, { accept: 'html', missingIsFine: true });
  const job = jobPosting(html);
  shape(job && typeof job.description === 'string', 'no posting in the page\'s data', url);
  const addresses = (Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation]).map((place) => place?.address).filter(Boolean);
  const locations = distinct(addresses.map((address) => [words(address.addressLocality), words(address.addressRegion)].filter(Boolean).join(', ') || null));
  const street = words(addresses[0]?.streetAddress);
  const type = { FULL_TIME: 'full-time', PART_TIME: 'part-time', CONTRACTOR: 'contract' }[job.employmentType] ?? null;
  return {
    text: job.description,
    location: locations[0] ?? listed.location,
    locations: locations.length > 0 ? locations : listed.locations,
    address: street ? [street, words(addresses[0]?.postalCode)].filter(Boolean).join(', ') : null,
    department: words(job.occupationalCategory) ?? listed.department,
    postedAt: isoTime(job.datePosted)?.slice(0, 10) ?? null,
    country: words(addresses[0]?.addressCountry)?.toUpperCase() ?? listed.country,
    hints: type ? { employmentType: type } : {},
  };
}
