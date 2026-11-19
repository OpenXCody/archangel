// A STAND-IN for the reading of a posting, with the signature the pipeline
// calls. The real module (title to career and level, text to skills, makes,
// requirements and pay, by rules over the curated vocabulary) is another
// engineer's and replaces this folder when the two branches are merged.
//
// What this one does, and nothing more: a posting is one of our careers when
// its title is exactly a career's title, in any letter case; its place is read
// from a location line of the plain "City, ST" or "City, State" kind. It finds
// no level, skill, make, requirement or pay.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};
const CODES = new Set(Object.values(STATES));

export function loadVocabulary(root) {
  const { careers } = JSON.parse(readFileSync(path.join(root, 'data', 'careers', 'catalogue.json'), 'utf8'));
  return { careers: new Map(careers.map((career) => [career.title.toLowerCase(), career.title])) };
}

/** "Austin, TX", "Austin, Texas", "Austin, TX, United States", "USA - Berkeley, MO": the city and the state's code. */
function placeOf(line) {
  const parts = String(line ?? '').replace(/^(usa|us|united states)\s*-\s*/i, '').split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const state = CODES.has(parts[1].toUpperCase()) && parts[1].length === 2 ? parts[1].toUpperCase() : STATES[parts[1].toLowerCase()];
  return state ? { city: parts[0], state } : null;
}

export function readPosting(posting, vocab) {
  const title = vocab.careers.get(String(posting.title ?? '').trim().toLowerCase());
  const place = placeOf(posting.location);
  return {
    career: title ? { title, how: 'title', matched: posting.title } : null,
    level: null,
    places: place ? [place] : [],
    skills: [],
    makes: [],
    requirements: { yearsMin: null, yearsMax: null, education: null, certifications: [], clearance: null, citizenship: null, shift: null, employmentType: null },
    pay: null,
    unknown: [],
  };
}
