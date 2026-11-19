// iCIMS career sites built on Jibe: pages of 100 postings, text included.
// `board` is the career site's host (careers.rivian.com).
import { isoTime, shape, webAddress, words } from './shared.mjs';

export const name = 'iCIMS (Jibe career site)';
export const how = 'One request per 100 postings, text included.';
// These sites' robots files ask for five seconds between requests; the fetcher keeps whichever is longer.
export const pace = 2000;

const PAGE = 100;
/** No board is this many pages: a count that never ends is a changed feed, not a large one. */
const MOST_PAGES = 100;

export const feed = (board, page = 1) => `https://${board}/api/jobs?page=${page}&limit=${PAGE}`;

export async function list(board, { get }) {
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= MOST_PAGES; page += 1) {
    const url = feed(board, page);
    const { json } = await get(url);
    shape(Array.isArray(json?.jobs), 'no list of jobs', url);
    for (const { data: job } of json.jobs) {
      shape(job && (job.req_id ?? job.slug) !== undefined && typeof job.title === 'string', 'a job with no id or title', url);
      const id = String(job.req_id ?? job.slug);
      if (seen.has(id)) continue;
      seen.add(id);
      const place = [words(job.city), words(job.state)].filter(Boolean).join(', ') || words(job.full_location) || words(job.location_name);
      out.push({
        id,
        title: job.title.trim(),
        location: place || null,
        locations: place ? [place] : [],
        address: [words(job.street_address), words(job.postal_code)].filter(Boolean).join(', ') || null,
        department: (job.categories ?? []).map((c) => words(c?.name)).filter(Boolean).join(', ') || null,
        // The posting's own page on the career site; the apply address is a sign-in.
        url: webAddress(job.meta_data?.canonical_url) ?? webAddress(job.apply_url),
        postedAt: isoTime(job.posted_date),
        updatedAt: isoTime(job.update_date),
        country: words(job.country_code)?.toUpperCase() ?? null,
        text: [job.description, job.responsibilities, job.qualifications].filter(Boolean).join('\n\n'),
        hints: /^(FULL_TIME|PART_TIME|CONTRACTOR)$/.test(job.employment_type ?? '')
          ? { employmentType: { FULL_TIME: 'full-time', PART_TIME: 'part-time', CONTRACTOR: 'contract' }[job.employment_type] }
          : {},
      });
    }
    const total = Number(json.totalCount ?? json.count ?? 0);
    if (json.jobs.length === 0 || out.length >= total) return out;
  }
  shape(false, `more than ${MOST_PAGES} pages`, feed(board));
  return out;
}
