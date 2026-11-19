// SAP SuccessFactors career sites publish every posting, text included, in
// one feed (RSS). `board` is the feed's address (https://jobs.deere.com/sitemap.xml).
import { shape, unescapeHtml, webAddress, words } from './shared.mjs';

export const name = 'SAP SuccessFactors (feed)';
export const how = 'One request returns every posting with its text.';
export const pace = 1000;

export const feed = (board) => String(board);

/** The text of one element of an item, with a CDATA wrapper and one level of escaping undone. */
function field(item, tag) {
  const found = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(item);
  if (!found) return null;
  const inner = found[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(inner);
  return unescapeHtml(cdata ? cdata[1] : inner);
}

export async function* pages(board, { get }) {
  const url = feed(board);
  const { text: xml } = await get(url, { accept: 'xml' });
  shape(/<rss[\s>]/.test(xml.slice(0, 2000)) && xml.includes('<channel>'), 'not an RSS feed', url);
  const out = [];
  const seen = new Set();
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const id = words(field(item, 'g:id') ?? field(item, 'guid'));
    const full = words(field(item, 'title'));
    shape(id && full, 'an item with no id or title', url);
    if (seen.has(id)) continue;
    seen.add(id);
    // "City, State, US, 50131-3155": the title repeats it in brackets.
    const place = words(field(item, 'g:location'));
    const title = place && full.endsWith(`(${place})`) ? full.slice(0, -place.length - 2).trim() : full.replace(/\s*\([^()]*\)\s*$/, '');
    const bits = (place ?? '').split(',').map((bit) => bit.trim());
    const country = bits.find((bit) => /^[A-Z]{2}$/.test(bit) && bits.indexOf(bit) >= 2) ?? null;
    out.push({
      id,
      title,
      location: place,
      locations: place ? [place] : [],
      address: null,
      department: words(field(item, 'g:job_function')),
      url: webAddress(field(item, 'link')),
      postedAt: null,
      updatedAt: null,
      country,
      text: field(item, 'description') ?? '',
      hints: {},
    });
  }
  // The whole feed is one answer: the listing is complete or it is nothing.
  yield { postings: out, next: null };
}
