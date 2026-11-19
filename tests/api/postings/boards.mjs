// Writes the made-up boards tests/api/postings.sh runs, in each system's own
// shape, into a folder tests/api/postings/feeds.mjs serves.
//   node tests/api/postings/boards.mjs <dir> one|two|three
// The postings are written the way an employer writes one (an opening
// paragraph, the qualifications as a list, the pay in a sentence), so the
// reader that ships (scripts/ingest/postings/read/) is the one the suite
// runs: what it keeps, and what it reads from each, is what the suite expects.
import { mkdirSync, writeFileSync } from 'node:fs';

const [dir, which] = process.argv.slice(2);
for (const folder of ['ashby', 'workday/e2e/detail', 'workday/e2elong/detail', 'jibe', 'refuse', 'robots']) mkdirSync(`${dir}/${folder}`, { recursive: true });

/** A posting's text: what the work is, what it asks for, and anything said after. */
const text = (about, basic = [], after = '') => `<p>${about}</p>` +
  (basic.length ? `<h3>Basic Qualifications</h3><ul>${basic.map((line) => `<li>${line}</li>`).join('')}</ul>` : '') + after;
const PLAIN = text('About the role: you will work with the team on the floor.');

// --- Ashby: E2E Postings Acme ------------------------------------------------------
const job = (id, title, location, extra = {}) => ({
  id: String(id), title, department: extra.department ?? 'Manufacturing', team: null, employmentType: extra.type ?? 'FullTime',
  location: location.split(';')[0].trim(), secondaryLocations: location.split(';').slice(1).map((place) => ({ location: place.trim() })),
  publishedAt: extra.posted ?? '2026-11-10T12:00:00.000+00:00', isListed: true,
  jobUrl: `https://jobs.ashbyhq.com/e2e-acme/${id}`, descriptionHtml: extra.text ?? PLAIN,
});
const welding = (pay) => text('E2E Postings Acme builds steel frames in Postville. You will weld them.', [
  'High school diploma or GED',
  '2 to 4 years of experience in MIG welding and flux-cored welding of structural steel',
  'AWS D1.1 certification',
  'Must be a U.S. person',
  'Able to work 2nd shift',
  // A machine's control the catalogue has no make for: it is counted in the run's report and kept nowhere else.
  'Experience with ProtoTRAK controls is a plus',
], `<p>Pay range: $${pay[0]}.00 - $${pay[1]}.00 per hour.</p>`);
const machining = text('Our foundry machines its own castings.', [
  'Experience setting up and operating CNC mills with Haas controls',
  'Experience with Studio 5000 PLC programming is a plus',
], '<p>Salary range: $62,000 - $81,000 per year.</p>');
const one = [
  job(101, 'Welder II', 'Postville, NV', { text: welding([28, 34]) }),
  job(102, 'Senior CNC Machinist', 'Postville, NV', { department: 'Foundry', text: machining }),
  job(103, 'Maintenance Technician', 'Castings Gap, NV'),
  job(104, 'Quality Engineer', 'Carlin Flat, NV'),
  job(105, 'Production Operator', 'Nowhere Springs, NV'),
  job(106, 'Welder', 'Postville, NV; Castings Gap, NV'),
  job(107, 'Software Engineer', 'Postville, NV'),
  job(108, 'Welder', 'Toronto, Ontario, Canada'),
  job(109, 'Manufacturing Engineer', 'Nowhere Springs, NV'),
  // Two plants of the company in this town and nothing to choose by but the order the plant merge keeps a row in.
  job(111, 'Industrial Electrician', 'Twin Forks, NV'),
];
// Later: 101 pays more, 103 has moved to Postville, 104 is gone, 110 is new.
const two = [
  job(101, 'Welder II', 'Postville, NV', { text: welding([30, 36]) }),
  one[1], job(103, 'Maintenance Technician', 'Postville, NV'), ...one.slice(4),
  job(110, 'TIG Welder', 'Postville, NV', { posted: '2026-11-18T09:00:00.000+00:00' }),
];
writeFileSync(`${dir}/ashby/e2e-acme.json`, JSON.stringify({ jobs: which === 'two' ? two : one }));

// --- Workday: E2E Postings Works, a small board and a long one ---------------------
const posting = (id, title, place, elsewhere = false) => ({
  title, externalPath: `/job/${place.replace(/[^A-Za-z]+/g, '-')}/${title.replace(/[^A-Za-z]+/g, '-')}_${id}`, locationsText: place,
  postedOn: 'Posted 3 Days Ago', bulletFields: [id], ...(elsewhere ? { elsewhere: true } : {}),
});
const detail = (tenant, site, listed, description) => writeFileSync(`${dir}/workday/${tenant}/detail/${listed.externalPath.replace(/[^A-Za-z0-9]+/g, '_')}.json`, JSON.stringify({ jobPostingInfo: {
  title: listed.title, jobDescription: description, location: listed.locationsText, additionalLocations: [], startDate: '2026-11-16', timeType: 'Full time',
  externalUrl: `https://${tenant}.wd1.myworkdayjobs.com/${site}${listed.externalPath}`, jobRequisitionLocation: { country: { alpha2Code: 'US' } } } }));
const facets = [{ facetParameter: 'Country', values: [{ descriptor: 'United States of America', id: 'bc33aa3152ec42d4995f4791a106ed09', count: 2 }] }];
const migWelding = text('Weld frames at the Carlin Flat works.', ['Experience in MIG welding of carbon steel']);

// One career at a plant, one title that is not ours, one abroad.
const small = [posting('R1', 'Welder', 'Carlin Flat, NV'), posting('R2', 'Accountant', 'Carlin Flat, NV'), posting('R3', 'Welder', 'Tianjin', true)];
writeFileSync(`${dir}/workday/e2e/list.json`, JSON.stringify({ jobPostings: small, facets }));
detail('e2e', 'Careers', small[0], migWelding);

// Eighty-five postings, five pages of the list: a welder at the head of the first page, on the second, the
// fourth and the last, and titles that are not ours between them. In "three" the first welder has left.
const long = [];
for (let n = 1; n <= 85; n += 1) {
  const ours = [1, 2, 25, 65, 85].includes(n);
  long.push(posting(`L${n}`, ours ? 'Welder' : 'Payroll Analyst', 'Carlin Flat, NV'));
}
for (const listed of long.filter((row) => row.title === 'Welder')) detail('e2elong', 'Careers', listed, migWelding);
writeFileSync(`${dir}/workday/e2elong/list.json`, JSON.stringify({ jobPostings: which === 'three' ? long.slice(1) : long, facets }));

// --- iCIMS/Jibe: E2E Postings Works, a board of two pages -------------------------
// 120 postings, 100 to a page: a welder on the first page (7), one that leaves in "three" (9), one on the second (115).
const paged = [];
for (let n = 1; n <= 120; n += 1) {
  if (which === 'three' && n === 9) continue;
  const ours = [7, 9, 115].includes(n);
  paged.push({ data: {
    req_id: String(5000 + n), slug: String(5000 + n), title: ours ? 'Welder' : 'Payroll Analyst', city: 'Carlin Flat', state: 'Nevada', country_code: 'US',
    description: ours ? migWelding : PLAIN, categories: [{ name: ours ? 'Manufacturing' : 'Finance' }], employment_type: 'FULL_TIME',
    posted_date: '2026-11-12T08:00:00+0000', apply_url: `https://careers.e2e-pages.test/jobs/${5000 + n}/login`,
    meta_data: { canonical_url: `https://careers.e2e-pages.test/jobs/${5000 + n}?lang=en-us` },
  } });
}
writeFileSync(`${dir}/jibe/careers.e2e-pages.test.json`, JSON.stringify({ jobs: paged }));

writeFileSync(`${dir}/refuse/api.lever.co`, '403');
writeFileSync(`${dir}/robots/api.ashbyhq.com.txt`, 'User-agent: *\nAllow: /\n');
