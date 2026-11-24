// The titles a board turned away as not one of our careers, counted for the
// run's report: how the catalogue's gaps are seen. A title is a heading the
// employer published, and only titles are counted: never a posting's text, an
// id or an address. The tally lives in the runner's memory and goes into the
// report (the run's artifact) and nowhere else: not staging, not the run's row.
//
// A title is counted by what the job is, as the reader takes a title apart
// (read/title.mjs): lower case, its level, numerals, shift, employment words and
// requisition codes set aside, and the parts of it that only say where stripped.
// "Sr. Propulsion Technician II - Hawthorne, CA (R1234)" and "Propulsion
// Technician (Night Shift)" are both "propulsion technician".
import { readTitle } from './read/title.mjs';
import { ROLE_NOUNS, titleWords } from './read/vocabulary.mjs';

/** How many of the commonest titles turned away a board's part of the report names. */
export const TITLES_KEPT = 25;
/** The longest a counted title is written: a heading, not a paragraph. */
const LONGEST = 80;

const STATE_NAMES = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'district of columbia', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'];
const STATE_CODES = ['al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'dc', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy'];
/** Words that only say where the work is, or are a posting's number: a part of a title made only of them is not the job. */
const WHERE = new Set([
  ...STATE_NAMES.flatMap((name) => name.split(' ')), ...STATE_CODES,
  'us', 'usa', 'united', 'states', 'america', 'remote', 'hybrid', 'onsite', 'virtual', 'nationwide', 'travel', 'various', 'multiple', 'locations', 'location',
  'job', 'id',
]);
/** A posting's number said in words, wherever it stands: "Req #12345 Welder". */
const NUMBER_WORDS = new Set(['req', 'requisition', 'reqid']);
// The reader sets aside a "lead" that is the job ("Avionics Lead", "Team Lead"): it refuses the title. Counted, it is
// the job, so it is carried through the reading under a word the reader does not know and written back after.
const LEAD_AS_JOB = /\blead(?=\s*(?:$|[-–—,;:|/(\[]))/gi;
const LEAD_HELD = 'leadasthejob';
/** The words that say a part of a title is the job: the reader's job words, and the ones it refuses a title for. */
const JOB_WORDS = new Set([
  ...ROLE_NOUNS, LEAD_HELD, 'manager', 'supervisor', 'director', 'head', 'chief', 'vp', 'president', 'superintendent', 'foreman', 'leader',
  'coordinator', 'planner', 'scheduler', 'buyer', 'recruiter', 'intern', 'interns', 'internship', 'internships', 'coop', 'administrator', 'architect', 'scientist', 'developer', 'trainer',
  'instructor', 'writer', 'pilot', 'driver', 'officer', 'counsel', 'attorney', 'accountant', 'advisor', 'representative', 'clerk', 'assistant',
  'dispatcher', 'estimator', 'expeditor', 'generalist', 'partner', 'controller', 'auditor', 'strategist', 'consultant', 'paralegal', 'nurse', 'agent',
]);

/** A title's parts as the reader cuts them, each as its words: an "and" it set aside written again, a posting's number left out, a place left out. */
function partsOf(text, here) {
  return readTitle(text).segments
    .map((words) => words.map((word, at) => (words.joins?.has(at) ? `and ${word}` : word)).filter((word) => !NUMBER_WORDS.has(word)))
    .filter((words) => words.length > 0 && !words.every((word) => WHERE.has(word.replace(/^and /, '')) || here.has(word)))
    .map((words) => words.join(' '));
}
const namesAJob = (part) => part.split(' ').some((word) => JOB_WORDS.has(word));

/**
 * What a title is counted as: its job's words, lower case, with the level, shift,
 * codes and places set aside. `location` is the posting's location line, whose
 * words are a place wherever the title repeats them. '' when nothing is left.
 *
 * The job is the part of the title that names one ("Propulsion Technician" of
 * "Propulsion Technician - Starship"); a part in brackets is a site, a programme,
 * a level or a team, and is the job only when nothing outside the brackets names
 * one ("(Toolmaker)"). A bare job word takes its kind from the part beside it:
 * "Technician, Composites" is a composites technician. Where no part names a
 * job, the leading part is the title.
 */
export function titleKey(title, location = '') {
  const here = new Set(titleWords(String(location ?? '')));
  // Shifts the reader does not set aside ("4th Shift", "Weekend") go too: they say when, not what.
  const held = String(title ?? '').replace(LEAD_AS_JOB, LEAD_HELD).replace(/\bco-op(s)?\b/gi, 'coop')
    .replace(/\b\d+(?:st|nd|rd|th)[- ]?shifts?\b|\bweekends?\b/gi, ' ');
  const inside = [];
  // A bracket in the middle of a title is taken out whole: "Integration & Test (AIT) Engineer" is one part.
  const outside = held.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (_, round, square) => { inside.push(round ?? square); return ' '; });
  const parts = partsOf(outside, here);
  const brackets = inside.length ? partsOf(inside.join(' , '), here) : [];
  const jobs = [...new Set(parts.some(namesAJob) ? parts.filter(namesAJob) : brackets.filter(namesAJob))];
  let key;
  // No part names a job ("Product Guide, Colma Service Center"): the leading part is what the title is.
  if (jobs.length === 0) key = parts[0] ?? brackets[0] ?? '';
  else if (jobs.length === 1 && !jobs[0].includes(' ')) key = [[...parts, ...brackets].find((part) => !namesAJob(part)), jobs[0]].filter(Boolean).join(' ');
  else key = jobs.join(' / ');
  key = key.replaceAll(LEAD_HELD, 'lead').replace(/\bcoop\b/g, 'co-op');
  return key.length > LONGEST ? key.slice(0, LONGEST).replace(/\s+\S*$/, '') : key;
}

/** A tally of titles: add each one turned away, then read the commonest. */
export function titleTally() {
  const counts = new Map();
  let postings = 0;
  return {
    add(title, location) {
      postings += 1;
      // A title that is only a place or a number is counted among the postings and under no title.
      const key = titleKey(title, location);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    },
    /** { postings, distinct, top: [[title, count]] }: the commonest first, then by title. */
    summary(kept = TITLES_KEPT) {
      const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, kept);
      return { postings, distinct: counts.size, top };
    },
  };
}

/**
 * The tally as lines of a run's report (two spaces in, as the report's other lines), or none when nothing was turned
 * away. `as` says what turned them away: a run reads a posting whole, `fetch` its title alone.
 */
export function titleLines(summary, { as = 'not one of our careers' } = {}) {
  if (!summary || summary.postings === 0) return [];
  const n = (value) => Number(value).toLocaleString('en-US');
  const width = Math.max(0, ...summary.top.map(([, count]) => n(count).length));
  const which = summary.top.length < summary.distinct ? `the ${summary.top.length} commonest` : summary.distinct === 1 ? 'the one' : `all ${summary.distinct}`;
  return [
    `  turned away as ${as}: ${n(summary.postings)} ${summary.postings === 1 ? 'posting' : 'postings'} under ${n(summary.distinct)} distinct ${summary.distinct === 1 ? 'title' : 'titles'}` +
      `${summary.distinct > 0 ? `; ${which}, with how many postings:` : ''}`,
    ...summary.top.map(([title, count]) => `    ${n(count).padStart(width)}  ${title}`),
  ];
}
