// Writes the made-up boards tests/api/postings.sh runs, in each system's own
// shape, into a folder tests/api/postings/feeds.mjs serves.
//   node tests/api/postings/boards.mjs <dir> one|two
// A posting states what a reader would find in it as a line of JSON
// (tests/api/postings/reader.mjs reads it).
import { mkdirSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
const [dir, which] = process.argv.slice(2);
for (const folder of ['ashby', 'workday/e2e/detail', 'refuse', 'robots']) mkdirSync(`${dir}/${folder}`, { recursive: true });
const facts = (value) => `<p>About the role.</p><pre data-facts>${JSON.stringify(value)}</pre>`;
const job = (id, title, location, extra = {}) => ({
  id: String(id), title, department: extra.department ?? 'Manufacturing', team: null, employmentType: extra.type ?? 'FullTime',
  location: location.split(';')[0].trim(), secondaryLocations: location.split(';').slice(1).map((place) => ({ location: place.trim() })),
  publishedAt: extra.posted ?? '2026-11-10T12:00:00.000+00:00', isListed: true,
  jobUrl: `https://jobs.ashbyhq.com/e2e-acme/${id}`, descriptionHtml: facts(extra.facts ?? {}),
  ...(extra.pay ? { compensation: { summaryComponents: [{ compensationType: 'Salary', interval: '1 HOUR', currencyCode: 'USD', minValue: extra.pay[0], maxValue: extra.pay[1] }] } } : {}),
});
const welding = { skills: [{ name: 'MIG Welding', on: 'MIG' }, { name: 'Flux-Cored Welding', on: 'flux-cored' }], level: { word: 'II', rank: 2 },
  requirements: { yearsMin: 2, yearsMax: 4, education: 'High school diploma', certifications: ['AWS D1.1'], clearance: null, citizenship: 'US person', shift: '2nd shift', employmentType: null } };
const machining = { skills: [{ name: 'CNC Control Operation', on: 'CNC controls' }], makes: [{ skill: 'CNC Control Operation', make: 'Haas', on: 'Haas VF-2' }, { skill: 'PLC Programming', make: 'Studio 5000', on: 'Studio 5000' }],
  level: { word: 'Senior', rank: 3 }, pay: { min: 62000, max: 81000, period: 'year' } };
const one = [
  job(101, 'Welder', 'Postville, NV', { pay: [28, 34], facts: welding }),
  job(102, 'CNC Machinist', 'Postville, NV', { department: 'Foundry', facts: machining }),
  job(103, 'Maintenance Technician', 'Castings Gap, NV'),
  job(104, 'Quality Engineer', 'Carlin Flat, NV'),
  job(105, 'Production Operator', 'Nowhere Springs, NV'),
  job(106, 'Welder', 'Postville, NV; Castings Gap, NV'),
  job(107, 'Software Engineer', 'Postville, NV'),
  job(108, 'Welder', 'Toronto, Ontario, Canada'),
  job(109, 'Manufacturing Engineer', 'Nowhere Springs, NV'),
];
// Later: 101 pays more, 103 has moved to Postville, 104 is gone, 110 is new.
const two = [
  job(101, 'Welder', 'Postville, NV', { pay: [30, 36], facts: welding }),
  ...one.slice(1, 2), job(103, 'Maintenance Technician', 'Postville, NV'), ...one.slice(4),
  job(110, 'TIG Welder', 'Postville, NV', { posted: '2026-11-18T09:00:00.000+00:00' }),
];
writeFileSync(`${dir}/ashby/e2e-acme.json`, JSON.stringify({ jobs: which === 'two' ? two : one }));
// A Workday-shaped board: one career at a plant, one title that is not ours, one abroad.
const posting = (id, title, place, elsewhere = false) => ({ title, externalPath: `/job/${place.replace(/[^A-Za-z]+/g, '-')}/${title.replace(/[^A-Za-z]+/g, '-')}_${id}`, locationsText: place, postedOn: 'Posted 3 Days Ago', bulletFields: [id], ...(elsewhere ? { elsewhere: true } : {}) });
const list = [posting('R1', 'Welder', 'Carlin Flat, NV'), posting('R2', 'Accountant', 'Carlin Flat, NV'), posting('R3', 'Welder', 'Tianjin', true)];
if (which === 'two') list[0] = { ...list[0], locationsText: 'Carlin Flat, NV', title: 'Welder' };
writeFileSync(`${dir}/workday/e2e/list.json`, JSON.stringify({ jobPostings: list,
  facets: [{ facetParameter: 'Country', values: [{ descriptor: 'United States of America', id: 'bc33aa3152ec42d4995f4791a106ed09', count: 2 }] }] }));
writeFileSync(`${dir}/workday/e2e/detail/${list[0].externalPath.replace(/[^A-Za-z0-9]+/g, '_')}.json`, JSON.stringify({ jobPostingInfo: {
  title: 'Welder', jobDescription: facts({ skills: [{ name: 'MIG Welding', on: 'MIG' }] }), location: 'Carlin Flat, NV', additionalLocations: [], startDate: '2026-11-16', timeType: 'Full time',
  externalUrl: `https://e2e.wd1.myworkdayjobs.com/Careers${list[0].externalPath}`, jobRequisitionLocation: { country: { alpha2Code: 'US' } } } }));
writeFileSync(`${dir}/refuse/api.lever.co`, '403');
writeFileSync(`${dir}/robots/api.ashbyhq.com.txt`, 'User-agent: *\nAllow: /\n');
