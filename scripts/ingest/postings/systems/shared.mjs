// What the posting adapters share: the shape they return and the small
// readings every feed needs.
//
// An adapter (systems/<system>.mjs) exports:
//   name       the hiring system, as a person writes it
//   how        one line: how many requests a board costs
//   pace       the least milliseconds between two requests to its host
//   feed(board)                 the address of the board's first request (what the registry's check and a person read)
//   async list(board, { get, post, today })   every posting the board lists
//   async text(board, listed, { get })        optional: the text of one listed posting, where the list has none
//   textsPerRun                               optional: the most texts asked of one employer in one run
//
// A listed posting is
//   { id, title, location, locations, address, department, url, postedAt, updatedAt, country, text, hints }
// `id` is the system's own, stable while the posting is up. `location` is the
// line the feed gives for where the work is and `locations` every such line
// (the first is `location`). `country` is the country of that first line as
// the feed writes it ("US", "United States"), or null when the feed gives
// none: `isUnitedStates` reads it. `text` is the description, HTML or plain, or null where it costs
// a request. `hints` is what the feed states as fields of its own:
// { pay: { min, max, period }, employmentType, shift }. Nothing an adapter
// returns is written anywhere by the adapter: it decides nothing.
import { FeedError } from '../fetch.mjs';

/** Whether a country, as a feed writes it, is the United States. */
export function isUnitedStates(country) {
  return /^(us|usa|u\.s\.a?\.?|united states|united states of america)$/i.test(String(country ?? '').trim());
}

/** A feed whose answer is not the shape the adapter reads: the run fails for that employer and says what was missing. */
export function shape(condition, what, url) {
  if (condition) return;
  const error = new FeedError(`the feed's shape changed: ${what}`, { url });
  error.shape = true;
  throw error;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** One level of HTML entities undone (Greenhouse sends its HTML escaped). */
export function unescapeHtml(text) {
  return String(text ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** A web address as kept: https only, at most 500 characters; null for anything else. */
export function webAddress(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^http:\/\//i, 'https://');
  if (text.length > 500 || !/^https:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    return url.hostname.includes('.') && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** A moment or a day as ISO text, or null: from ISO text, or milliseconds or seconds since 1970. */
export function isoTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = typeof value === 'number' ? new Date(value < 1e11 ? value * 1000 : value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A trimmed string, or null when there is none. */
export function words(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().replace(/\s+/g, ' ') : null;
}

/** The lines of a list without blanks and repeats, in order. */
export function distinct(values) {
  return [...new Set(values.map(words).filter(Boolean))];
}

/** Pay a feed states as a field of its own: dollars a year or an hour, or null when it is not that. */
export function statedPay(min, max, interval, currency = 'USD') {
  const low = Number(min);
  const high = Number(max);
  const per = /year|annual|salary/i.test(interval ?? '') ? 'year' : /hour/i.test(interval ?? '') ? 'hour' : null;
  if (!per || (currency && currency !== 'USD') || !(low > 0) || !(high >= low)) return null;
  return { min: low, max: high, period: per };
}
