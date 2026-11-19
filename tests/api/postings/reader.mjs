// A reading of a posting for tests/api/postings.sh, with the signature of
// scripts/ingest/postings/read/index.mjs. The suite's made-up postings state
// what a reader would find as a line of JSON in their text
// (<pre data-facts>{ "skills": [...], "makes": [...], "level": {...}, "requirements": {...}, "pay": {...} }</pre>),
// so the whole of a reading reaches the database and the pages whatever the
// real reader can do. The career is the title when it is exactly a career's;
// places come from "City, ST" lines, several with semicolons between.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function loadVocabulary(root) {
  const { careers } = JSON.parse(readFileSync(path.join(root, 'data', 'careers', 'catalogue.json'), 'utf8'));
  return { careers: new Map(careers.map((career) => [career.title.toLowerCase(), career.title])) };
}

function placesOf(line) {
  return String(line ?? '').split(';').map((part) => /^\s*([^,]+),\s*([A-Z]{2})\s*$/.exec(part)).filter(Boolean).map((found) => ({ city: found[1].trim(), state: found[2] }));
}

export function readPosting(posting, vocab) {
  const title = vocab.careers.get(String(posting.title ?? '').trim().toLowerCase());
  const stated = /<pre data-facts>([\s\S]*?)<\/pre>/.exec(posting.text ?? '');
  const facts = stated ? JSON.parse(stated[1]) : {};
  return {
    career: title ? { title, how: 'title', matched: posting.title } : null,
    level: facts.level ?? null,
    places: placesOf(posting.location),
    skills: facts.skills ?? [],
    makes: facts.makes ?? [],
    requirements: { yearsMin: null, yearsMax: null, education: null, certifications: [], clearance: null, citizenship: null, shift: null, employmentType: null, ...(facts.requirements ?? {}) },
    pay: facts.pay ?? null,
    unknown: facts.unknown ?? [],
  };
}
