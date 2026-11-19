// Lever: one request returns the whole board, text included.
// `board` is the company's name on Lever (api.lever.co/v0/postings/<name>).
import { distinct, isoTime, shape, statedPay, webAddress, words } from './shared.mjs';

export const name = 'Lever';
export const how = 'One request returns the whole board with its text.';
export const pace = 1000;

export const feed = (board) => `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`;

export async function* pages(board, { get }) {
  const url = feed(board);
  const { json } = await get(url);
  shape(Array.isArray(json), 'no list of postings', url);
  const postings = json.map((job) => {
    shape(job && typeof job.id === 'string' && typeof job.text === 'string', 'a posting with no id or title', url);
    const c = job.categories ?? {};
    const locations = distinct([c.location, ...(Array.isArray(c.allLocations) ? c.allLocations : [])]);
    const lists = (job.lists ?? []).map((part) => `<h3>${part?.text ?? ''}</h3><ul>${part?.content ?? ''}</ul>`).join('\n');
    const pay = job.salaryRange ? statedPay(job.salaryRange.min, job.salaryRange.max, job.salaryRange.interval, job.salaryRange.currency) : null;
    return {
      id: job.id,
      title: job.text.trim(),
      location: locations[0] ?? null,
      locations,
      address: null,
      department: distinct([c.department, c.team]).join(', ') || null,
      url: webAddress(job.hostedUrl),
      postedAt: isoTime(job.createdAt),
      updatedAt: null,
      country: words(job.country)?.toUpperCase() ?? null,
      text: [job.description, lists, job.additional].filter(Boolean).join('\n'),
      hints: { ...(pay ? { pay } : {}), ...(words(c.commitment) ? { employmentType: words(c.commitment) } : {}) },
    };
  });
  // The whole board is one answer: the listing is complete or it is nothing.
  yield { postings, next: null };
}
