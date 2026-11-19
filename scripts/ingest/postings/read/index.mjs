// Reading an employer's job posting: whether it is one of the product's careers
// and which, its level, where the work is, the skills and makes it asks for, its
// requirements as facts and its pay band. Rules over the curated vocabulary in
// data/ and nothing else: no network, no file after loadVocabulary, no clock, no
// model. A wrong career is worse than a missed posting, so where the title does
// not say, or two careers could both be meant and the text does not decide, the
// answer is null.
//
// The two functions below are the whole of what the intake pipeline calls.
import { readLines } from './text.mjs';
import { buildVocabulary } from './vocabulary.mjs';
import { decideCareer } from './decide.mjs';
import { askingLines, findAll, assign, unknownWords } from './skills.mjs';
import { readPlaces, readRequirements, readPay } from './facts.mjs';

/** Built once per run from the curated files in data/ (root is the repository's root). */
export function loadVocabulary(root) {
  return buildVocabulary(root);
}

// A country as feeds write it: the United States, or somewhere else.
const UNITED_STATES = new Set(['us', 'usa', 'u s', 'u s a', 'united states', 'united states of america', 'america']);
const abroad = (country) => {
  const c = String(country ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  return c !== '' && !UNITED_STATES.has(c);
};

/**
 * One posting, read. Pure.
 * posting = { employer, title, location, department?, text, postedAt?, country? }
 * country is given only where the feed has one of its own. A posting whose
 * country is not the United States has no place, whatever its location looks
 * like: "Amsterdam, NH" is North Holland, not New Hampshire.
 */
export function readPosting(posting, vocab) {
  // The text is only gone through when the title could be a career: four postings
  // in five are refused on their title and cost nothing more.
  let read = null;
  const text = () => {
    if (!read) {
      const lines = readLines(posting.text);
      const asking = askingLines(lines);
      read = { lines, asking, found: findAll(asking, vocab, posting.employer) };
    }
    return read;
  };
  const places = (lines) => (abroad(posting.country) ? [] : readPlaces(posting.location, posting.title, lines));
  const decided = decideCareer(posting, text, vocab);
  if (!decided.career) {
    return {
      career: null,
      level: null,
      places: places(() => text().lines),
      skills: [],
      makes: [],
      requirements: { yearsMin: null, yearsMax: null, education: null, certifications: [], clearance: null, citizenship: null, shift: null, employmentType: null },
      pay: null,
      unknown: [],
    };
  }
  const { lines, asking, found } = text();
  const path = vocab.careers.get(decided.career.title).path;
  const { skills, makes } = assign(found, asking, vocab, path);
  return {
    career: decided.career,
    level: decided.level,
    places: places(() => lines),
    skills,
    makes,
    requirements: readRequirements(posting, lines, decided.shift),
    pay: readPay(lines, decided.level),
    unknown: unknownWords(asking, found, vocab, posting),
  };
}
