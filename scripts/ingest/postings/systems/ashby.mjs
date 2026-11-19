// Ashby: one request returns the whole board, text included.
// `board` is the company's name on Ashby (api.ashbyhq.com/posting-api/job-board/<name>).
import { distinct, isoTime, shape, statedPay, webAddress, words } from './shared.mjs';

export const name = 'Ashby';
export const how = 'One request returns the whole board with its text.';
export const pace = 1000;

export const feed = (board) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;

const TYPES = { FullTime: 'full-time', PartTime: 'part-time', Contract: 'contract', Intern: null, Temporary: null };

export async function* pages(board, { get }) {
  const url = feed(board);
  const { json } = await get(url);
  shape(Array.isArray(json?.jobs), 'no list of jobs', url);
  const postings = json.jobs
    // A posting the company keeps off its own board is not public.
    .filter((job) => job?.isListed !== false)
    .map((job) => {
      shape(typeof job.id === 'string' && typeof job.title === 'string', 'a job with no id or title', url);
      const locations = distinct([job.location, ...(job.secondaryLocations ?? []).map((place) => place?.location)]);
      const salary = (job.compensation?.summaryComponents ?? []).find((part) => part?.compensationType === 'Salary');
      const pay = salary ? statedPay(salary.minValue, salary.maxValue, salary.interval, salary.currencyCode) : null;
      const type = TYPES[job.employmentType];
      const country = words(job.address?.postalAddress?.addressCountry);
      return {
        id: job.id,
        title: job.title.trim(),
        location: locations[0] ?? null,
        locations,
        address: null,
        department: distinct([job.department, job.team]).join(', ') || null,
        url: webAddress(job.jobUrl),
        postedAt: isoTime(job.publishedAt),
        updatedAt: null,
        country,
        text: job.descriptionHtml ?? job.descriptionPlain ?? '',
        hints: { ...(pay ? { pay } : {}), ...(type ? { employmentType: type } : {}) },
      };
    });
  // The whole board is one answer: the listing is complete or it is nothing.
  yield { postings, next: null };
}
