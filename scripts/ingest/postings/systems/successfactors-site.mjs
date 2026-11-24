// SAP SuccessFactors career sites (the ones a company runs under its own
// name, such as careers.huntingtoningalls.com): the listing is the site's
// own search pages, a request each, and a posting's text is its page.
// `board` is the career site's host.
//
// A site that publishes every posting in one feed is read by
// successfactors.mjs instead (John Deere's); most publish no such feed, and
// their robots files disallow the one under /services/. What is asked for
// here is /search/ and /job/, which they allow. These are web pages: the
// fetcher is asked for them as pages (accept 'html'), so a challenge page is
// a refusal like anywhere else.
import { distinct, isUnitedStates, isoTime, shape, unescapeHtml, webAddress, words } from './shared.mjs';

export const name = 'SAP SuccessFactors (career site)';
export const how = 'One request per page of the site\'s search, then one per kept posting that is new or changed.';
export const pace = 2000;
/** The most texts asked of one employer in one run; the rest are read on the runs that follow. */
export const textsPerRun = 60;

/** 20,000 postings at the fewest a page: a count that never ends is a changed page, not a large board. */
const MOST_PAGES = 2000;

// No keyword is sent: some sites' robots files disallow a search by keyword (?q=) and allow the listing itself.
export const feed = (board, from = 0) => `https://${board}/search/?startrow=${from}`;

/** A piece of a page as plain words: tags out, entities undone. */
const plain = (html) => words(unescapeHtml(String(html ?? '').replace(/<[^>]*>/g, ' ')).replace(/[ ​]/g, ' '));

/** The first element of a class in a piece of a page, as words. */
const classed = (html, name) => plain(new RegExp(`<span[^>]*class="[^"]*\\b${name}\\b[^"]*"[^>]*>([\\s\\S]*?)</span>`).exec(html)?.[1]);

/** "Nov 24, 2026" or "Mon Oct 26 00:00:00 UTC 2026" as a day, or null. */
export function dayOf(said) {
  const found = /([A-Z][a-z]{2})\s+(\d{1,2})(?:,|\s+[\d:]+\s+UTC)\s+(\d{4})/.exec(said ?? '');
  return found ? isoTime(`${found[1]} ${found[2]}, ${found[3]} UTC`)?.slice(0, 10) ?? null : null;
}

/** The country a location line ends in, when it says the United States; a line that does not say is left to the reader. */
const countryOf = (line) => (String(line ?? '').split(',').some((part) => isUnitedStates(part) || /^US\s+United States$/i.test(part.trim())) ? 'US' : null);

/** A search page's postings where the site lists them as a table: one row each. */
function tableRows(html, url) {
  const out = [];
  for (const [, row] of html.matchAll(/<tr[^>]*class="[^"]*\bdata-row\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const link = /<a[^>]*href="([^"]*\/job\/[^"]*\/(\d+)\/?)"[^>]*>([\s\S]*?)<\/a>/.exec(row);
    shape(link, 'a row with no posting', url);
    // The row says its place twice (once for a phone); the last is the column's own.
    const place = classed(row.slice(row.lastIndexOf('jobLocation') - 40), 'jobLocation');
    out.push({
      id: link[2], href: link[1], title: plain(link[3]), place,
      department: classed(row, 'jobDepartment') ?? classed(row, 'jobFacility'), posted: dayOf(classed(row, 'jobDate')),
    });
  }
  return out;
}

/** The same where the site lists them as tiles: each tile names its fields (location, or city and state; department; date). */
function tiles(html, url) {
  const out = [];
  for (const tile of html.split(/<li[^>]*class="[^"]*\bjob-tile\b/).slice(1)) {
    const id = /^[^>]*\bjob-id-(\d+)/.exec(tile)?.[1];
    const href = /^[^>]*\bdata-url="([^"]+)"/.exec(tile)?.[1];
    shape(id && href, 'a tile with no posting', url);
    const field = (name) => plain(new RegExp(`id="job-${id}-desktop-section-${name}-value"[^>]*>([\\s\\S]*?)</div>`).exec(tile)?.[1]);
    const place = field('location') ?? ([field('city'), field('state'), field('country')].filter(Boolean).join(', ') || null);
    out.push({
      id, href, title: plain(/<a[^>]*class="[^"]*\bjobTitle-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(tile)?.[1]), place,
      department: field('department') ?? field('facility'), posted: dayOf(field('date')),
    });
  }
  return out;
}

export async function* pages(board, { get }) {
  const seen = new Set();
  let from = 0;
  for (let page = 0; page < MOST_PAGES; page += 1) {
    const url = feed(board, from);
    const { text: html } = await get(url, { accept: 'html' });
    const tiled = /id="job-tile-list"/.test(html);
    const rows = tiled ? tiles(html, url) : tableRows(html, url);
    shape(rows.length > 0 || /paginationLabel|id="searchresults"|id="job-tile-list"|class="[^"]*\bnoresults?\b/i.test(html), 'not a career site\'s search page', url);
    const postings = [];
    for (const row of rows) {
      shape(row.title, 'a posting with no title', url);
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      postings.push({
        id: row.id,
        title: row.title,
        location: row.place,
        locations: row.place ? [row.place] : [],
        address: null,
        department: row.department,
        url: webAddress(new URL(unescapeHtml(row.href), `https://${board}/`).href),
        postedAt: row.posted,
        updatedAt: null,
        country: countryOf(row.place),
        text: null,
        hints: {},
      });
    }
    // How many there are in all: beside the pages' numbers in a table, in the page's own script where they are tiles.
    const said = tiled ? /jobRecordsFound:\s*parseInt\("(\d+)"\)/.exec(html)?.[1] : /paginationLabel[^>]*>[\s\S]*?of\s*<b>\s*([\d,.]+)\s*<\/b>/.exec(html)?.[1];
    const total = Number(String(said ?? '0').replace(/[,.]/g, ''));
    from += rows.length;
    const last = rows.length === 0 || from >= total;
    yield { postings, next: last ? null : from };
    if (last) return;
  }
  shape(false, `more than ${MOST_PAGES} pages`, feed(board));
}

/** What stands inside the element that opens at `open` (the index just past its opening tag), up to its own closing tag. */
function inside(html, open, tag) {
  let depth = 1;
  const marks = new RegExp(`<(/?)${tag}\\b`, 'g');
  marks.lastIndex = open;
  for (let found = marks.exec(html); found; found = marks.exec(html)) {
    depth += found[1] ? -1 : 1;
    if (depth === 0) return html.slice(open, found.index);
  }
  return null;
}

export async function text(board, listed, { get }) {
  const url = listed.url;
  const { text: html } = await get(url, { accept: 'html', missingIsFine: true });
  const at = /<span[^>]*class="[^"]*\bjobdescription\b[^"]*"[^>]*>/.exec(html);
  const body = at ? inside(html, at.index + at[0].length, 'span') : null;
  shape(typeof body === 'string', 'no description in the posting\'s page', url);
  const places = distinct([...html.matchAll(/<span[^>]*class="[^"]*\bjobGeoLocation\b[^"]*"[^>]*>([\s\S]*?)<\/span>/g)].map((found) => plain(found[1])));
  const posted = dayOf(/itemprop="datePosted"\s+content="([^"]*)"/.exec(html)?.[1]);
  return {
    text: body,
    ...(places.length > 0 ? { location: places[0], locations: places, country: countryOf(places[0]) ?? listed.country } : {}),
    ...(posted ? { postedAt: posted } : {}),
  };
}
