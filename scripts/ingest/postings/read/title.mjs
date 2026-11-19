// A posting's title, taken apart: what the job is once its level, shift, site,
// programme, requisition code and team are set aside. An employer's title is
// theirs ("CNC Machinist II - 2nd Shift (Starship)", "Technician, Composites
// (Level 3)", "General Machinist - N0309"); this finds the words that name the work.
import { titleWords, ROLE_NOUNS } from './vocabulary.mjs';

const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
const LEVEL_WORD = {
  entry: ['Entry', 1], junior: ['Junior', 1], jr: ['Junior', 1], apprentice: ['Apprentice', 1], trainee: ['Trainee', 1],
  mid: ['Mid', 2], intermediate: ['Mid', 2],
  senior: ['Senior', 3], sr: ['Senior', 3], experienced: ['Experienced', 3], journeyman: ['Journeyman', 3],
  staff: ['Staff', 4], principal: ['Principal', 4], lead: ['Lead', 4], master: ['Master', 4], expert: ['Expert', 4], consultant: ['Consultant', 4], distinguished: ['Distinguished', 4], fellow: ['Fellow', 4],
};
const NUMERAL_WORD = ['', 'I', 'II', 'III', 'IV', 'V'];
const rankOf = (n) => Math.min(4, Math.max(1, n));

// Words that run a team or stand outside the work itself: a title that has one is
// not one of the careers, whatever else it says.
const NOT_A_CAREER = new Set(['manager', 'mgr', 'supervisor', 'director', 'head', 'chief', 'vp', 'president', 'superintendent', 'foreman', 'leader', 'coordinator', 'planner', 'scheduler', 'buyer', 'recruiter', 'intern', 'internship', 'interns', 'coop', 'student', 'administrator', 'architect', 'scientist', 'developer', 'trainer', 'instructor', 'writer', 'pilot', 'driver', 'officer', 'counsel', 'attorney', 'accountant', 'advisor', 'representative', 'clerk', 'assistant', 'dispatcher', 'estimator', 'expeditor', 'ausbildung', 'praktikum', 'werkstudent', 'auszubildende', 'praktikant', 'stagiaire', 'estagio', 'aprendiz', 'becario', 'skillbridge']);
// Fields whose engineers and testers are not manufacturing's.
const OTHER_FIELD = new Set(['software', 'firmware', 'embedded', 'devops', 'sre', 'cloud', 'network', 'networking', 'cyber', 'cybersecurity', 'security', 'it', 'ai', 'ml', 'autonomy', 'perception', 'gnc', 'algorithm', 'algorithms', 'frontend', 'backend', 'fullstack', 'web', 'ux', 'ui', 'sales', 'marketing', 'finance', 'financial', 'accounting', 'legal', 'hr', 'recruiting', 'talent', 'data', 'analytics', 'sdet', 'adas', 'infotainment', 'payroll', 'tax', 'treasury', 'procurement', 'purchasing', 'sourcing', 'logistics', 'warehouse', 'warehousing', 'ehs', 'environmental', 'construction']);
// Words before a name that change what the job is ("Field Quality Technician").
export const CHANGES_THE_JOB = new Set(['field', 'service', 'customer', 'cost', 'residential', 'site', 'application', 'applications', 'solutions', 'support', 'project', 'program', 'commercial', 'business', 'dealer', 'retail', 'clinical', 'heavy', 'vehicle', 'fleet', 'deployed', 'deployable', 'mission', 'flight', 'launch', 'recovery', 'operations', 'supplier', 'model', 'criteria']);
// Words before a one-word name that leave it what it is ("Production Welder").
export const LEAVES_IT = new Set(['general', 'production', 'manufacturing', 'industrial', 'plant', 'shop', 'precision', 'factory', 'skilled', 'certified', 'hourly', 'ii', 'i']);

// "Associate" is a level before a job ("Associate Engineer") and a job after one
// ("Production Associate"), so it is not in the table above.
const SHIFT_WORDS = /\b((1st|2nd|3rd|first|second|third|day|night|swing|weekend|evening|graveyard|rotating|multiple|all|[a-d]|alternate|back half|front half)[- ]?shifts?|shift [a-d1-4]|nights|days|weekends|\d{1,2}[- ]hour shifts?|multiple shifts)\b/gi;
const SET_ASIDE = /\b(temporary|temp|contract|contractor|contingent|cw|part[- ]time|full[- ]time|pt|ft|onsite|on[- ]site|remote|hybrid|hourly|salaried|non[- ]exempt|exempt|relocation|sign[- ]on bonus|active clearance|(top )?secret clearance|ts\/sci|w\/ ?clearance|with clearance|clearance required|us citizenship required|new college graduate|new grads?( \d{4})?|early careers?|recent graduates?|college graduate|associates? degree|bachelors? degree|\d{4} (start|grad\w*)|(spring|summer|fall|winter) \d{4}|pipeline|evergreen|multiple (openings|positions|locations)|open rank|all levels|various levels|multiple levels|m\/w\/d|m\/f\/d|f\/m\/d|h\/f|w\/m\/d|m\/f\/x)\b/gi;

/**
 * { segments: [[words]], level, shift, refused, entry }
 * segments are the title's parts, each as compared words with level, shift and
 * codes taken out; the first is the leading part.
 */
export function readTitle(title) {
  let t = String(title ?? '').normalize('NFKC').replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim();
  // An aircraft's or a programme's designation is not a level: "F-22", "U-2", "C-17".
  t = t.replace(/\b[A-Z]{1,3}-\d{1,3}[A-Z]?\b/g, ' ');
  const found = { level: null, shift: null, refused: null, entry: false };

  if (/\b(new college graduate|new grads?|early careers?|recent graduates?|entry[- ]level)\b/i.test(t)) found.entry = true;
  const shift = t.match(SHIFT_WORDS);
  if (shift) found.shift = shiftOf(shift[0]);
  t = t.replace(SHIFT_WORDS, ' ').replace(SET_ASIDE, ' ');

  // Levels written as a range take the lower: "Machinist 2/3", "Level 4/5", "I/II".
  // A level is said as a word ("Senior") or a numeral ("II"). Where a title has both
  // ("Senior Engineer II") the word is the level; where it offers two ("2/3",
  // "Engineer II / Senior Engineer") the lower is.
  const said = { word: null, numeral: null, either: false };
  const lv = (word, n, numeral = true) => {
    const slot = numeral ? 'numeral' : 'word';
    if (!said[slot] || n < said[slot].n) said[slot] = { word, n };
  };
  let stated = false;
  t = t.replace(/\b(?:level|lvl|grade|tier|step|class)\.?\s*([1-5]|i{1,3}|iv|v)(?:\s*[/&-]\s*([1-5]|i{1,3}|iv|v))?\b/gi, (_, a) => { const n = ROMAN[a.toLowerCase()] ?? +a; lv(NUMERAL_WORD[n], n); stated = true; return ' '; });
  t = t.replace(/\b(i{1,3}|iv|v)\s*\/\s*(i{1,3}|iv|v)\b/gi, (_, a) => { const n = ROMAN[a.toLowerCase()]; lv(NUMERAL_WORD[n], n); return ' '; });
  t = t.replace(/(?<=[A-Za-z)]\s)([1-5])\s*\/\s*([1-5])\b/g, (_, a) => { lv(NUMERAL_WORD[+a], +a); return ' '; });
  t = t.replace(/\b(entry)\s*\/\s*/gi, () => { lv('Entry', 1, false); said.either = true; return ' '; });
  if (/\b([1-5]|i{1,3}|iv)\s*\/\s*(senior|sr|staff|principal|lead)\b/i.test(t)) said.either = true;

  // Brackets hold a site, a programme, a level or a team: each is a part of its own.
  const parts = [];
  t = t.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (_, a, b) => { parts.push({ text: a ?? b, bracket: true }); return ' , '; });
  const main = t.split(/\s+-\s+|\s-(?=\S)|(?<=\S)-\s|[,;:|]|\s\/\s|\s@\s|\s+at\s+(?=[A-Z])|\s+im\s+bereich\s+/).map((x) => x.trim()).filter(Boolean);
  const all = [...main.map((text) => ({ text, bracket: false })), ...parts];

  const segments = [];
  for (const part of all) {
    let text = part.text;
    // "Programmer/Operator": the second job word is the same person; "CAD/CAM" stays.
    text = text.replace(/\/\s*([A-Za-z]+)\b/g, (whole, b) => (ROLE_NOUNS.has(titleWords(b)[0]) ? ' ' : ' ' + b));
    const words = [];
    const raw = titleWords(text);
    for (let i = 0; i < raw.length; i++) {
      const w = raw[i];
      const next = raw[i + 1];
      if (NOT_A_CAREER.has(w)) found.refused = found.refused ?? `"${w}" in the title`;
      if (w === 'co' && next === 'op') { found.refused = found.refused ?? '"co-op" in the title'; continue; }
      if (w === 'team' && (next === 'lead' || next === 'leader' || next === 'member')) { if (next !== 'member') found.refused = found.refused ?? '"team lead" in the title'; }
      // A code with digits in it is a requisition or a grade, never the work: "N0309", "R10260434".
      if (/\d/.test(w) && !/^(3d|2d|5s|8d|[1-5])$/.test(w)) continue;
      if ((w === 'or' || w === 'to') && (LEVEL_WORD[raw[i - 1]] || LEVEL_WORD[next] || ROMAN[raw[i - 1]] || ROMAN[next])) continue;
      // A grade letter after the job ("Assembler C") is the employer's own scale.
      if (/^[a-d]$/.test(w) && i > 0 && i === raw.length - 1) continue;
      if (/^\d{3,}$/.test(w)) continue;
      const numeral = ROMAN[w] ?? (/^[1-5]$/.test(w) ? +w : null);
      if (numeral && i > 0) { if (!stated) lv(NUMERAL_WORD[numeral], numeral); continue; }
      const named = LEVEL_WORD[w];
      if (named) {
        // "Lead" and "Associate" are levels before a job and jobs after one.
        const lastWord = i === raw.length - 1;
        if (w === 'lead' && ((lastWord && words.length > 0) || ['team', 'group', 'shift', 'crew', 'cell', 'line', 'area', 'production', 'technical'].includes(raw[i - 1]))) { found.refused = found.refused ?? '"lead" as the job'; continue; }
        if ((w === 'staff' || w === 'principal' || w === 'master' || w === 'expert' || w === 'consultant' || w === 'fellow') && lastWord && raw.length > 1) { words.push(w); continue; }
        lv(named[0], named[1], false);
        continue;
      }
      if (w === 'associate' && !(i === raw.length - 1 && words.length > 0)) { lv('Associate', 1, false); continue; }
      words.push(w);
    }
    if (words.length) segments.push(words);
  }
  const pick = said.either && said.word && said.numeral ? (said.numeral.n <= said.word.n ? said.numeral : said.word) : said.word ?? said.numeral;
  if (pick) found.level = { word: pick.word, rank: rankOf(pick.n) };
  else if (found.entry) found.level = { word: 'Entry', rank: 1 };
  return { segments, ...found };
}

function shiftOf(text) {
  const s = text.toLowerCase();
  if (/1st|first|\bday|days|\ba shift/.test(s)) return 'day';
  if (/2nd|second|swing|evening/.test(s)) return 'swing';
  if (/3rd|third|night|graveyard/.test(s)) return 'night';
  if (/weekend/.test(s)) return 'weekend';
  if (/rotating|multiple|all/.test(s)) return 'rotating';
  return null;
}

/** Whether any part of the title names a field that is not manufacturing's. */
export function otherField(segments) {
  for (const seg of segments) for (let i = 0; i < seg.length; i++) {
    const w = seg[i];
    if (OTHER_FIELD.has(w)) return w;
    if (w === 'machine' && seg[i + 1] === 'learning') return 'machine learning';
    if (w === 'full' && seg[i + 1] === 'stack') return 'full stack';
    if (w === 'site' && seg[i + 1] === 'reliability') return 'site reliability';
    if (w === 'information' && seg[i + 1] === 'technology') return 'information technology';
  }
  return null;
}
