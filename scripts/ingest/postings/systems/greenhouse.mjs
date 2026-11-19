// Greenhouse: one request returns the whole board, text included.
// `board` is the board's token (boards-api.greenhouse.io/v1/boards/<token>).
import { distinct, isoTime, shape, unescapeHtml, webAddress } from './shared.mjs';

export const name = 'Greenhouse';
export const how = 'One request returns the whole board with its text.';
export const pace = 1000;

export const feed = (board) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;

export async function list(board, { get }) {
  const url = feed(board);
  const { json } = await get(url);
  shape(Array.isArray(json?.jobs), 'no list of jobs', url);
  return json.jobs.map((job) => {
    shape(job && job.id !== undefined && typeof job.title === 'string', 'a job with no id or title', url);
    // A posting at several places names them in one line, with semicolons between.
    const places = distinct(String(job.location?.name ?? '').split(';'));
    const offices = distinct((job.offices ?? []).map((office) => office?.location ?? null));
    const locations = places.length > 0 ? places : offices;
    return {
      id: String(job.id),
      title: job.title.trim(),
      location: locations[0] ?? null,
      locations,
      address: null,
      department: distinct((job.departments ?? []).map((d) => d?.name)).join(', ') || null,
      url: webAddress(job.absolute_url),
      postedAt: isoTime(job.first_published),
      updatedAt: isoTime(job.updated_at),
      country: null,
      // The board sends its HTML with the angle brackets escaped.
      text: unescapeHtml(job.content ?? ''),
      hints: {},
    };
  });
}
