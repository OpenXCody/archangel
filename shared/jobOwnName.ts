/**
 * A job's own name: what the employer called the opening, beside its standard name.
 *
 * A job from a careers site is named for its career ("Welder"). Five openings for one career at one factory
 * then read alike, though the employer told them apart: "Pipe Welder, Stage 0 Ground Fabrication (Starship)",
 * "Lead Welder, Pipe (Starship Launch Fabrication)". This gives the employer's title with everything the page
 * already states elsewhere cut out, and otherwise as the company wrote it:
 *
 *   CUT   the company's name, the factory's or site's name and its place, the shift, the kind of employment
 *         where it is a separate note, requisition numbers, and recruiting noise (where the work is done,
 *         clearance and citizenship notes, years of experience, the schooling or training asked for, pay,
 *         bonuses, banners, and a note that the opening is for every level, shift or site: "All Levels").
 *   KEPT  the trade or role, its branch, the program, product, team or area, and the level or grade words,
 *         exactly as written: no spelling corrected, no word moved.
 *   NULL  when what is left says nothing beyond the career's title, or is plainly broken.
 *
 * A wrong or garbled name is worse than none: a segment is cut only when it is wholly one of the kinds above,
 * and a segment that holds the word of a role (engineer, welder, technician) is never cut whole. Nothing here
 * names an employer, a site or a program: the company and the site come only from the arguments.
 *
 * `jobOwnName` gives the name. `readJobOwnName` gives it with what was cut: the rules that fired, and each note in
 * the title's own words, so a row can still say a shift the title named ("D Shift", "7AM-7PM") where the job's own
 * shift is not known.
 *
 * Pure and synchronous, with no imports. Only erasable type syntax, so it runs as written under Node's type
 * stripping and under tsx. It never throws; a title it cannot read gives none.
 */

export type JobAbout = {
  /** The career's title, the job's standard name ("Welder"). Empty when unknown. */
  career: string;
  /** The company as our data names it ("John Deere"). */
  company: string;
  /** The factory's name as stored ("John Deere Des Moines Works"). */
  factory?: string | null;
  city?: string | null;
  /** The state's two-letter code, or its name. */
  state?: string | null;
};

/** One thing cut from a title: the rule that knew it, and the company's words. */
export type JobOwnNameCut = { rule: string; text: string };

/**
 * A name with what was cut on the way to it: the rules that fired, and each note as the company wrote it, so that
 * a caller can still say a shift the title named ("D Shift", "7AM-7PM") where the job's own shift is not known.
 */
export type JobOwnNameReading = { name: string | null; rules: string[]; cut: JobOwnNameCut[] };

/** The employer's own name for an opening, or null when it has none worth showing. */
export function jobOwnName(posted: string | null | undefined, about: JobAbout): string | null {
  return readJobOwnName(posted, about).name;
}

/** The same, with the rules that fired and what each cut. Never throws. */
export function readJobOwnName(posted: string | null | undefined, about: JobAbout): JobOwnNameReading {
  const rules = new Set<string>();
  const cut: JobOwnNameCut[] = [];
  try {
    if (typeof posted !== 'string') return { name: null, rules: ['nothing'], cut };
    let name = tidyInput(posted, rules);
    // A title this long is not a name.
    if (!name || name.length > 260) return { name: null, rules: [...rules, 'nothing'], cut };
    const ctx = contextOf(about ?? ({} as JobAbout), rules, cut);
    for (let pass = 0; pass < 5; pass += 1) {
      ctx.intern = INTERN.test(name);
      const next = tidyOutput(cleanUnit(name, ctx, 0), rules, name);
      if (next === name) break;
      name = next;
      if (!name) break;
    }
    if (!name) return { name: null, rules: [...rules, 'nothing-left'], cut };
    name = strokesBack(name);
    const repaired = ordinaryCapitals(name);
    if (repaired !== name) rules.add('capitals');
    name = repaired;
    if (broken(name)) return { name: null, rules: [...rules, 'broken'], cut };
    if (saysOnlyTheCareer(name, typeof about?.career === 'string' ? about.career : '')) return { name: null, rules: [...rules, 'same-as-career'], cut };
    return { name, rules: [...rules], cut };
  } catch {
    return { name: null, rules: [...rules, 'error'], cut };
  }
}

// ---------------------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------------------

type Ctx = {
  /** The company's name in its usual forms, as compared words, the longest first. */
  companies: string[][];
  /** Names of the factory: its own name without the company, the parts of it, and the heads of them. */
  sites: string[][];
  /** The initials of a site's name of three words or more ("bsp" for Buffalo Stamping Plant). */
  initials: Set<string>;
  city: string[];
  stateCode: string;
  stateName: string[];
  /** Words that name a role: a segment holding one is never cut whole. */
  roles: Set<string>;
  /** The title speaks of an internship, a co-op or a graduate intake: its term or year says which opening. */
  intern: boolean;
  rules: Set<string>;
  cut: JobOwnNameCut[];
};

/** Records a cut: the rule, and the words it took. */
function took(ctx: Ctx, rule: string, text: string): void {
  ctx.rules.add(rule);
  const said = strokesBack(text).replace(/\s+/g, ' ').trim();
  if (said) ctx.cut.push({ rule, text: said });
}

/** A table that holds its own keys only: "constructor" and "valueOf" are words a title may use, and are in none. */
const table = <T>(entries: Record<string, T>): Record<string, T> => Object.assign(Object.create(null) as Record<string, T>, entries);

const STATES: Record<string, string> = table({
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut',
  de: 'delaware', dc: 'district of columbia', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois',
  in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland',
  ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana',
  ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york',
  nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania',
  ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah',
  vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
});

/**
 * State codes that are also a trade's abbreviation (UT ultrasonic testing, ME manufacturing engineering, GA general
 * assembly, DC direct current) or a word: standing alone they are never read as the state. "Lehi, UT" still is.
 */
const TRADE_CODES = new Set('ut mt vt ct me ms nc de pa hi id dc in or ok al ar md sc va ia ga oh mo co la ma'.split(' '));

/** State codes that begin a name as a trade's word: a transmitter ("TX Module"), night vision ("NV Assembly"). */
const LEADING_TRADE_CODES = new Set(['tx', 'nv']);

/** The legal forms a name can end in, as compared words. */
const LEGAL = new Set('inc incorporated llc corp corporation co company lp llp ltd limited plc the'.split(' '));

/** The legal forms that end a firm's name and nothing else: not "Corp" (corporate) or "PLC" (a controller). */
const FIRM_ENDS = new Set('inc incorporated llc corporation ltd gmbh llp'.split(' '));

/** Words that carry a firm's name on without naming a site ("Northrop Grumman Systems Corporation"). */
const FIRM_WORDS = new Set(
  ('inc incorporated llc corp corporation co company lp llp ltd limited plc the of a an and subsidiary division div ' +
    'systems aerospace industries technologies technology motors motor group holdings international enterprises ' +
    'products solutions usa america americas north foods space energy')
    .split(' ')
);

/** Words at the end of a company's name that say only what kind of firm it is: its sites and titles drop them. */
const KIND_OF_FIRM = new Set(
  'industries technologies technology motors aerospace space energy foods equipment products shipbuilding'.split(' ')
);

/** Names too common to stand for a company or a site by themselves. */
const COMMON = new Set(
  ('general american national united international advanced applied precision global universal standard superior ' +
    'premier quality custom modern industrial allied central pacific atlantic western eastern northern southern ' +
    'midwest first new great north south east west technical main')
    .split(' ')
);

/** Words that say what kind of site it is: "Flint Engine", "Pontiac Stamping", "Faribault Plant". */
const SITE_KIND = new Set(
  ('plant plants works campus facility site factory center centre complex operations assembly stamping engine ' +
    'transmission casting propulsion metal components truck shipyard mill fab headquarters hq manufacturing ' +
    'production location locations office building distribution warehouse powertrain service and')
    .split(' ')
);

/** Words that make a name a place's: a kind of site, a street, a hangar. */
const PLACE_KIND = new Set(
  ('plant works campus facility site factory center centre complex shipyard mill fab headquarters hq building hangar ' +
    'warehouse office yard road rd drive dr blvd boulevard parkway pkwy street avenue ave highway hwy lane')
    .split(' ')
);

/** Departments and lines of work: "Quality, IN" is not a town. */
const AREA_WORDS = new Set(
  ('quality assembly production manufacturing maintenance engineering operations test paint weld welding machining ' +
    'fabrication tooling facilities logistics materials supply shipping receiving electrical mechanical controls ' +
    'automation process design safety training packaging inspection molding casting stamping body battery chassis ' +
    'interior interiors exterior powertrain trim final plastics metals composites structures avionics propulsion ' +
    'systems software hardware integration research development foundry forge finishing coatings harness cables ' +
    'optics sensors payload launch recovery operations planning purchasing sales service repair overhaul')
    .split(' ')
);

/** Words that name a role. A segment holding one is the job, or part of it, and is never cut whole. */
const ROLE_NOUNS = new Set(
  ('engineer engineers technician technicians tech techs technologist operator operators welder welders machinist ' +
    'machinists assembler assemblers inspector inspectors mechanic mechanics electrician electricians specialist ' +
    'specialists analyst analysts designer designers drafter drafters planner planners supervisor supervisors manager ' +
    'managers leader leaders fitter fitters pipefitter pipefitters painter painters programmer programmers maker ' +
    'makers toolmaker toolmakers fabricator fabricators millwright millwrights handler handlers driver drivers worker ' +
    'workers associate associates intern interns apprentice apprentices trainee trainees journeyman journeyperson ' +
    'scientist scientists developer developers architect architects buyer buyers coordinator coordinators member ' +
    'members molder molders caster grinder grinders polisher plater coater finisher rigger riggers repairer installer ' +
    'installers tester testers builder builders sewer cutter cutters packer packers loader loaders laborer laborers ' +
    'helper helpers setter setters tender erector lineman wireman plumber plumbers carpenter carpenters mason roofer ' +
    'glazier pilot captain officer guard clerk agent representative consultant advisor director chief president ' +
    'administrator controller estimator expeditor scheduler dispatcher trainer instructor teacher nurse medic chemist ' +
    'metallurgist physicist researcher conductor writer editor accountant auditor attorney counsel recruiter ' +
    'generalist owner lead leads sme student students metrologist toolroom blaster sandblaster brazer solderer ' +
    'winder winders tuner calibrator scaler stocker picker shipper receiver')
    .split(' ')
);

/** A title that speaks of an internship, a co-op, an apprenticeship or a graduate intake. */
const INTERN =
  /\b(?:intern(?:ship)?s?|co-?ops?|apprentice(?:ship)?s?|grad(?:uate)?s?|early[\s-]+career|university|students?|cohort|rotation(?:al)?|fellow(?:ship)?|skillbridge|campus|program|pathway)\b/i;

const fold = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const WORD_ALIAS: Record<string, string> = table({ saint: 'st', fort: 'ft', mount: 'mt' });

/** A text as compared words: lower case, no punctuation, "&" as "and", "Saint" as "St". */
function wordsOf(text: string | null | undefined): string[] {
  if (!text) return [];
  return fold(text)
    .replace(/['\u2019`.]/g, '')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => WORD_ALIAS[word] ?? word);
}

/** A text as tokens for the notes: times, amounts and fractions kept whole ("7:00am", "10+", "4/10"). */
function tokensOf(text: string): string[] {
  return fold(text)
    .replace(/['\u2019`]/g, '')
    .replace(/\b(?:[a-z]\.){2,}/g, (dotted) => dotted.replace(/\./g, ''))
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/(\d)\/(\d)/g, '$1\u2044$2')
    .replace(/(\d):(\d)/g, '$1\u2236$2')
    .replace(/(\d)\.(\d)/g, '$1\u2024$2')
    .split(/[\s,;|()[\]{}!*"\u201c\u201d:./\-\u2013\u2014]+/)
    .filter(Boolean)
    .map((token) => token.replace(/\u2044/g, '/').replace(/\u2236/g, ':').replace(/\u2024/g, '.'));
}

const sameWords = (a: string[], b: string[]): boolean => a.length === b.length && a.every((word, at) => word === b[at]);
const beginsWith = (words: string[], head: string[]): boolean =>
  head.length > 0 && head.length <= words.length && head.every((word, at) => word === words[at]);
const endsWith = (words: string[], tail: string[]): boolean =>
  tail.length > 0 && tail.length <= words.length && tail.every((word, at) => word === words[words.length - tail.length + at]);
function holds(words: string[], run: string[]): boolean {
  if (!run.length || run.length > words.length) return false;
  for (let at = 0; at + run.length <= words.length; at += 1) {
    if (run.every((word, offset) => word === words[at + offset])) return true;
  }
  return false;
}

const hasRole = (words: string[], ctx: Ctx): boolean => words.some((word) => ctx.roles.has(word));

// ---------------------------------------------------------------------------------------------------------
// What is known of the job
// ---------------------------------------------------------------------------------------------------------

function contextOf(given: JobAbout, rules: Set<string>, cut: JobOwnNameCut[]): Ctx {
  // Whatever is handed in, only text is read.
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const about = { career: text(given.career), company: text(given.company), factory: text(given.factory), city: text(given.city), state: text(given.state) };
  const roles = new Set(ROLE_NOUNS);
  const career = wordsOf(about.career);
  const head = career[career.length - 1];
  if (head && head.length > 2) {
    roles.add(head);
    roles.add(head.endsWith('s') ? head.slice(0, -1) : `${head}s`);
  }
  const state = (about.state ?? '').trim().toLowerCase();
  const stateCode = STATES[state] ? state : (Object.keys(STATES).find((code) => STATES[code] === state) ?? '');
  const city = wordsOf(about.city);
  const companies = companyForms(about.company);
  const ctx: Ctx = {
    companies,
    sites: [],
    initials: new Set(),
    city,
    stateCode,
    stateName: stateCode ? STATES[stateCode].split(' ') : [],
    roles,
    intern: false,
    rules,
    cut,
  };
  siteNames(about.factory, ctx);
  return ctx;
}

/** "Anduril Industries, Inc." is said "Anduril Industries" and "Anduril"; "A & I Products" also "A & I". */
function companyForms(company: string | null | undefined): string[][] {
  let said = wordsOf(company);
  while (said.length > 1 && LEGAL.has(said[said.length - 1])) said = said.slice(0, -1);
  while (said.length > 1 && said[0] === 'the') said = said.slice(1);
  if (!said.length) return [];
  const forms = [said];
  if (said.length > 1 && KIND_OF_FIRM.has(said[said.length - 1])) {
    const head = said.slice(0, -1);
    const letters = head.join('').length;
    if (letters >= 3 && !head.every((word) => COMMON.has(word) || SITE_KIND.has(word))) forms.push(head);
  }
  return forms;
}

/** Whether a word makes a name a name: not a common word, not a kind of site, not a firm's word. */
const distinctive = (word: string): boolean =>
  word.length >= 4 && !COMMON.has(word) && !SITE_KIND.has(word) && !FIRM_WORDS.has(word) && !/^\d+$/.test(word);

/** The factory's names: whole, without the company, part by part, and the heads a title shortens them to. */
function siteNames(factory: string | null | undefined, ctx: Ctx): void {
  if (!factory) return;
  const raw = String(factory);
  const mixed = /[a-z]/.test(raw);
  const parts: Array<{ text: string; bracketed: boolean }> = [{ text: raw.replace(/\([^()]*\)/g, ' '), bracketed: false }];
  for (const match of raw.matchAll(/\(([^()]*)\)/g)) parts.push({ text: match[1], bracketed: true });
  for (const part of [...parts]) {
    const split = part.text.split(/\s+[-\u2013\u2014]+\s*|\s*[-\u2013\u2014]+\s+|,\s*/).filter((piece) => piece.trim());
    if (split.length > 1) parts.push(...split.map((text) => ({ text, bracketed: part.bracketed })));
  }
  const place = new Set([...ctx.city, ...ctx.stateName, ctx.stateCode].filter(Boolean));
  const seen = new Set<string>();
  const add = (words: string[]): void => {
    if (!words.length || words.length > 8) return;
    const key = words.join(' ');
    if (seen.has(key)) return;
    seen.add(key);
    ctx.sites.push(words);
  };
  for (const { text: part, bracketed } of parts) {
    let words = wordsOf(part);
    if (!words.length || words.every((word) => /^\d+$/.test(word))) continue;
    // "SolAero by Rocket Lab", "... a subsidiary of Boeing": the company at the end is said by the company's tag.
    for (const form of ctx.companies) {
      if (endsWith(words, form) && words.length > form.length) {
        words = words.slice(0, -form.length);
        while (words.length && ['by', 'of', 'a', 'an', 'subsidiary', 'division'].includes(words[words.length - 1])) words = words.slice(0, -1);
      }
    }
    while (words.length > 1 && LEGAL.has(words[words.length - 1])) words = words.slice(0, -1);
    let own = words;
    const form = ctx.companies.find((name) => beginsWith(words, name));
    if (form) {
      own = words.slice(form.length);
      while (own.length && (LEGAL.has(own[0]) || own[0] === 'motor' || own[0] === 'motors')) own = own.slice(1);
    }
    // The firm under its legal name ("Northrop Grumman Systems Corporation") names no site.
    if (!own.length || own.every((word) => FIRM_WORDS.has(word))) continue;
    // What a name carries in brackets is the site by another name when it is a code ("SM1", "BWI"), one name
    // ("Hillsboro", "Semitool") or a named place ("Air Force Plant 42", "Clay Road"). Other words there are the
    // site's line of business ("Electronic Warfare", "Rig Pressure Control"), which a title names as its own.
    if (bracketed && own.length >= 2 && !own.some((word) => PLACE_KIND.has(word) || /\d/.test(word))) continue;
    const code = /\d/.test(own[0]) && /[a-z]/.test(own[0]);
    const initialsWritten = bracketed && mixed && /^[A-Z]{2,3}$/.test(part.trim()) && !ACRONYMS.has(part.trim());
    const name = own[0].length >= 4 && !COMMON.has(own[0]) && !SITE_KIND.has(own[0]) && !(bracketed && AREA_WORDS.has(own[0]));
    const worthy = own.length >= 2 || name || code || initialsWritten;
    if (!worthy) continue;
    add(own);
    if (own.length >= 3) {
      const letters = own.filter((word) => !['and', 'of', 'the'].includes(word)).map((word) => word[0]).join('');
      if (letters.length >= 3 && letters.length <= 6) ctx.initials.add(letters);
    }
    // Its town at the end is the place's to say: "Hydra Rig Fort Worth" is "Hydra Rig".
    if (ctx.city.length && endsWith(own, ctx.city) && own.length > ctx.city.length) add(own.slice(0, -ctx.city.length));
    // The head of a name whose rest only says what kind of site it is: "Tonawanda" of Tonawanda Propulsion,
    // "Flint Engine" of Flint Engine Operations, "Jennie-O" of Jennie-O Foods.
    for (let cut = own.length - 1; cut >= 1; cut -= 1) {
      const headWords = own.slice(0, cut);
      const rest = own.slice(cut);
      if (!rest.every((word) => SITE_KIND.has(word) || FIRM_WORDS.has(word) || place.has(word))) break;
      if (headWords.some(distinctive)) add(headWords);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// The notes a title carries that the page states elsewhere
// ---------------------------------------------------------------------------------------------------------

const SHIFT_WORDS = new Set(['shift', 'shifts', 'nightshift', 'dayshift']);
/** Words that say a shift wherever they stand. */
const SHIFT_ANYWHERE = new Set(
  'days nights weekend weekends weekday weekdays swing graveyard overnight overnights monday tuesday wednesday thursday friday saturday sunday'.split(' ')
);
/** Words that say a shift only as a note of their own ("- Night", "(Second)"), or beside "shift". */
const SHIFT_ALONE = new Set(
  'day night evening evenings afternoon afternoons morning mornings 1st 2nd 3rd 4th 5th first second third fourth fifth'.split(' ')
);
const DIGIT_ORDINAL = /^[1-5](?:st|nd|rd|th)$/;
const SHIFT_DAYS = new Set('mon tue tues wed thu thur thurs fri sat sun'.split(' '));
const SHIFT_FILLER = new Set(
  ('am pm to and or & + alt alternate alternating rotating rotation rotational split off compressed multiple all any ' +
    'various available included includes including may be only m tu w th f sa su flexible schedule hours hour hr hrs ' +
    'crew crews through thru work force workforce')
    .split(' ')
);
/** A note of the shift does not end in a word that waits for another ("All Shifts All" of "All Shifts All Levels"). */
const SHIFT_OPEN_END = new Set('all any multiple various and or & to may be alt alternate alternating split off compressed rotating through thru only'.split(' '));
const SHIFT_OPEN_START = new Set('and or & to available included only through thru'.split(' '));
const CLOCK = /^(?:[01]?\d|2[0-3]):[0-5]\d(?:am|pm|a|p)?$/;
const CLOCK_SHORT = /^(?:[1-9]|1[0-2])(?:am|pm)$/;
const CLOCK_LETTER = /^(?:[1-9]|1[0-2])[ap]$/;
const FRACTION = /^\d{1,2}\/\d{1,2}s?$/;
const TIMES_BY = /^\d{1,2}x\d{1,2}s?$/;
/** "AWW", "AWW2": an alternative work week, and which. */
const WORK_WEEK = /^aww\d?$/;
/** A note's tokens as the shift reads them: "10+" as "10", "Shift2" as "shift 2". */
const shiftTokens = (tokens: string[]): string[] =>
  tokens.flatMap((token) => {
    const glued = /^(shifts?)([1-5])$/.exec(token);
    return glued ? [glued[1], glued[2]] : [token.replace(/\++$/, '') || token];
  });

/**
 * Whether these tokens are a note of the shift and nothing else. `whole`: the note stands alone. `tail`: it ends a
 * longer segment. `head`: it begins one, where only an outright "2nd Shift" or a bare "Night" or "Weekend" counts.
 */
function shiftNote(tokens: string[], mode: 'whole' | 'tail' | 'head'): boolean {
  if (!tokens.length || tokens.length > 16) return false;
  const list = shiftTokens(tokens);
  let shiftWord = false;
  let anywhere = false;
  let alone = false;
  let ordinal = false;
  let clocks = 0;
  let clockLetters = 0;
  let days = 0;
  let crew = false;
  let letter = false;
  let half = false;
  let fraction = false;
  let rotation = false;
  const joins = (token: string | undefined): boolean => token !== undefined && (token === 'and' || token === 'or' || token === '&' || /^[a-e]$/.test(token));
  for (let at = 0; at < list.length; at += 1) {
    const token = list[at];
    if (token === 'nightshift' || token === 'dayshift') {
      anywhere = true;
    } else if (SHIFT_WORDS.has(token)) {
      shiftWord = true;
    } else if (SHIFT_ANYWHERE.has(token)) {
      anywhere = true;
    } else if (SHIFT_ALONE.has(token)) {
      alone = true;
      if (DIGIT_ORDINAL.test(token)) ordinal = true;
    } else if (CLOCK.test(token) || CLOCK_SHORT.test(token)) {
      clocks += 1;
    } else if (CLOCK_LETTER.test(token)) {
      clockLetters += 1;
    } else if (SHIFT_DAYS.has(token)) {
      days += 1;
    } else if (FRACTION.test(token)) {
      fraction = true;
      // Days and hours ("9/80", "4/10", "3/12") are a schedule; two small numbers ("2/3") are a grade.
      if (Number(token.replace(/s$/, '').split('/')[1]) >= 10) anywhere = true;
    } else if (TIMES_BY.test(token) || WORK_WEEK.test(token)) {
      anywhere = true;
    } else if (/^[a-e]$/.test(token)) {
      // A crew's letter stands beside "shift" or "crew" ("B Shift", "Shifts B, C and D"); elsewhere it is a grade.
      let left = at - 1;
      while (left >= 0 && joins(list[left])) left -= 1;
      let right = at + 1;
      while (right < list.length && joins(list[right])) right += 1;
      const beside = (token2: string | undefined): boolean => token2 !== undefined && (SHIFT_WORDS.has(token2) || token2 === 'crew' || token2 === 'crews');
      if (!beside(list[left]) && !beside(list[right])) return false;
      letter = true;
    } else if (/^[nd][12]$/.test(token)) {
      // "N2", "D2": a crew's code, beside "shift".
    } else if (/^\d{1,2}$/.test(token)) {
      // A number belongs to a shift after the word ("Shift 2") or before "hour"; elsewhere it is a grade.
      const before = list[at - 1];
      const after = list[at + 1];
      const ok = (before !== undefined && (SHIFT_WORDS.has(before) || before === 'crew')) || (after !== undefined && /^(?:hour|hours|hr|hrs)$/.test(after));
      if (!ok) return false;
    } else if (SHIFT_FILLER.has(token)) {
      if (token === 'crew' || token === 'crews') crew = true;
      if (token === 'am' || token === 'pm') half = true;
      if (token === 'rotation' || token === 'rotating' || token === 'rotational') rotation = true;
    } else {
      return false;
    }
  }
  if (SHIFT_OPEN_END.has(list[list.length - 1]) || SHIFT_OPEN_START.has(list[0])) return false;
  const said = shiftWord && list.length >= 2;
  if (mode === 'head') {
    if (said) return true;
    return list.length === 1 && ['night', 'nights', 'weekend', 'weekends', 'overnight', 'graveyard'].includes(list[0]);
  }
  if (said || anywhere) return true;
  if (clocks >= 1 || clocks + clockLetters >= 2 || days >= 2) return true;
  if (crew && (letter || half)) return true;
  if (fraction && rotation) return true;
  if (mode === 'whole') return alone;
  return ordinal;
}

/** "All", "Multiple": an opening for every one of something, which says nothing of which opening it is. */
const EVERY = new Set('all any multiple various every'.split(' '));
/** What a posting is open to all of, and the rule each is cut under. */
const EVERY_OF: Record<string, string> = table({
  level: 'levels', levels: 'levels', grade: 'levels', grades: 'levels',
  shift: 'shift', shifts: 'shift', crew: 'shift', crews: 'shift',
  plant: 'site', plants: 'site', site: 'site', sites: 'site', location: 'site', locations: 'site', facility: 'site',
  facilities: 'site', fabs: 'site', campuses: 'site',
  opening: 'recruiting', openings: 'recruiting',
});

/**
 * A note that the opening is for every level, shift or site: "All Levels", "Multiple Levels/Shifts", "All Crews/All
 * Plants", "All PGT Plants". Gives the rule it is cut under, or null. It names no level: "Level 2 or Level 3" stays.
 * "All Positions" is not one: it is how a welder who welds in every position is named.
 */
function everyNote(tokens: string[]): string | null {
  if (tokens.length < 2 || tokens.length > 9 || !EVERY.has(tokens[0])) return null;
  let rule: string | null = null;
  let at = 0;
  while (at < tokens.length) {
    if (!EVERY.has(tokens[at])) return null;
    // To the next "all": what it is all of, the last word saying the kind.
    let end = at + 1;
    while (end < tokens.length && !EVERY.has(tokens[end])) end += 1;
    const group = tokens.slice(at + 1, end).filter((token) => token !== 'and' && token !== 'or' && token !== '&');
    const last = group[group.length - 1];
    const kind = last === undefined ? undefined : EVERY_OF[last];
    if (!kind) return null;
    const named = group.filter((token) => EVERY_OF[token] === undefined);
    // "All PGT Plants", "All Ohio Locations": a site's name may stand before the word; nothing may before a level.
    if (named.length > (kind === 'site' ? 2 : 0)) return null;
    // A note of several kinds ("Multiple Levels/Shifts") goes under the first.
    rule = rule ?? kind;
    at = end;
  }
  return rule;
}

const KIND_VOCAB = new Set(
  ('full time fulltime part parttime temporary temp contract contractor contingent seasonal fixed defined limited term ' +
    'month months mo to hire perm permanent regular direct on call casual per diem hourly salaried salary exempt non ' +
    'nonexempt position role employment supplemental and or')
    .split(' ')
);

/** The kind of employment as a note of its own: "Temporary Full Time", "(Contract)", "18 Month Defined Term". */
function kindNote(tokens: string[]): boolean {
  if (!tokens.length || tokens.length > 6) return false;
  if (!tokens.every((token) => KIND_VOCAB.has(token) || /^\d{1,2}$/.test(token))) return false;
  const has = (word: string): boolean => tokens.includes(word);
  return (
    has('fulltime') || has('parttime') || (has('time') && (has('full') || has('part'))) || has('temporary') || has('temp') ||
    has('contract') || has('contractor') || has('contingent') || has('supplemental') || has('seasonal') || has('permanent') || has('casual') ||
    has('hourly') || has('salaried') || has('exempt') || has('nonexempt') || has('diem') || (has('direct') && has('hire')) ||
    (has('on') && has('call')) || (has('term') && (has('fixed') || has('defined') || has('limited')))
  );
}

const ARRANGEMENT_VOCAB = new Set(
  'on site onsite hybrid remote in office person telework eligible work from home wfh or and & role position only fully based 100% 100'.split(' ')
);

/** Where the work is done: "Onsite", "(Hybrid-Remote/Onsite)". */
function arrangementNote(tokens: string[]): boolean {
  if (!tokens.length || tokens.length > 6) return false;
  if (!tokens.every((token) => ARRANGEMENT_VOCAB.has(token))) return false;
  const has = (word: string): boolean => tokens.includes(word);
  return has('onsite') || (has('on') && has('site')) || has('hybrid') || has('remote') || has('telework') || has('wfh') || (has('work') && has('home')) || (has('in') && (has('office') || has('person')));
}

const CLEARANCE_VOCAB = new Set(
  ('active current interim final top secret ts sci clearance clearances cleared required req reqd eligible eligibility ' +
    'security dod doe q l poly polygraph ci fs full scope with w or and & no must have hold obtain ability able to us ' +
    'government level needed preferred an a the be obtainable ssbi si tk')
    .split(' ')
);

/** A clearance note: "(Secret Clearance)", "TS/SCI", "Active Clearance", "No Clearance Required". */
function clearanceNote(tokens: string[]): boolean {
  if (!tokens.length || tokens.length > 9) return false;
  let strong = false;
  for (const token of tokens) {
    const misspelt = /^clear[a-z]{2,5}ce$/.test(token);
    if (!CLEARANCE_VOCAB.has(token) && !misspelt) return false;
    if (misspelt || ['secret', 'clearance', 'clearances', 'cleared', 'sci', 'polygraph', 'poly'].includes(token)) strong = true;
  }
  return strong;
}

const CITIZEN_VOCAB = new Set(
  ('us usa united states citizen citizens citizenship required only person persons itar must be work authorization ' +
    'authorized indefinite green card holder or and a an permanent resident no sponsorship visa eligible to')
    .split(' ')
);

/** A citizenship or work-authorization note. */
function citizenshipNote(tokens: string[]): boolean {
  if (!tokens.length || tokens.length > 9) return false;
  if (!tokens.every((token) => CITIZEN_VOCAB.has(token))) return false;
  if (tokens.some((token) => ['citizen', 'citizens', 'citizenship', 'itar', 'authorization', 'sponsorship'].includes(token))) return true;
  return (tokens.includes('us') || tokens.includes('usa')) && (tokens.includes('person') || tokens.includes('persons'));
}

const EXPERIENCE =
  /^(?:(?:min|minimum|at least|with) )?\d{1,2}\+?(?: (?:to )?\d{1,2}\+?)? (?:years?|yrs?)(?: of)?(?: (?:exp|experience|relevant experience))?(?: (?:required|reqd|req|preferred|needed|minimum|min))?$/;
const NO_EXPERIENCE = /^(?:no (?:prior )?experience(?: (?:required|needed|necessary))?|experience (?:required|preferred|needed))$/;

/** Years of experience asked for: "3+ YEARS EXP REQUIRED", "2+ years of experience". */
function experienceNote(tokens: string[]): boolean {
  if (!tokens.length || tokens.length > 8) return false;
  const said = tokens.join(' ');
  return EXPERIENCE.test(said) || NO_EXPERIENCE.test(said);
}

/** Words that say a degree or a diploma outright. "Master" and "Associate" alone are grades, and are not here. */
const SCHOOL_SAID = new Set('degree degrees degreed diploma ged phd doctorate bachelors masters mba'.split(' '));
/** A degree by its letters: one alone may be a state or a team ("MS"), two together are schooling ("BS/MS"). */
const SCHOOL_LETTERS = new Set('bs ms ba ma bsc msc aas'.split(' '));
const SCHOOL_WORDS = new Set(
  ('associate associates bachelor master high school hs college university technical engineering science year years yr ' +
    'or and with in of a an the required preferred needed minimum min equivalent level experience experienced formal ' +
    'training education plus')
    .split(' ')
);

/**
 * The schooling or training asked for, as a note of its own: "Associates Degree", "(Bachelors/Masters)", "MS/PhD",
 * "Experienced or Formal Training". The job's facts state it. "Experienced" alone is a grade and "Training" alone a
 * department: neither is a note of this kind.
 */
function schoolingNote(tokens: string[]): boolean {
  if (!tokens.length || tokens.length > 9) return false;
  const said = tokens.join(' ').replace(/\bph d\b/g, 'phd');
  const list = said.split(' ');
  let outright = false;
  let letters = 0;
  let joins = 0;
  for (const token of list) {
    if (SCHOOL_SAID.has(token)) outright = true;
    else if (SCHOOL_LETTERS.has(token)) letters += 1;
    else if (token === 'or' || token === 'and') joins += 1;
    else if (!SCHOOL_WORDS.has(token) && !/^\d{1,2}$/.test(token)) return false;
  }
  if (outright) return true;
  if (letters >= 2 && letters + joins === list.length) return true;
  return /\bformal (?:training|education)\b/.test(said);
}

/** A note of pay: an amount, a rate, "unpaid". */
function payNote(text: string): boolean {
  return /\$\s?\d/.test(text) || /\b\d+(?:\.\d+)?\s?(?:\/|per\s|an\s)\s?(?:hr|hour)\b/i.test(text) || /\bunpaid\b/i.test(text) || /\b(?:weekly|competitive|great|top)\s+pay\b/i.test(text) || /\bpay\s+(?:rate|range)\b/i.test(text);
}

/** A share as a note of its own: "(10%)", "25% Travel", "Up to 50% travel". */
const percentNote = (text: string): boolean =>
  /^(?:(?:up to|travel|approx\.?|approximately|~)\s*)*\d{1,3}\s?%(?:\s*(?:(?:domestic|international)\s+)?(?:travel(?:\s+required)?|shift differential|differential|premium))?$/i.test(text.trim());

const RECRUITING_SAID =
  'now hiring|hiring now|hiring event|hiring immediately|immediate (?:hire|hiring|opening|openings|need|start)|urgent|urgently|multiple (?:openings|positions|roles|vacancies|locations|sites)|\\d+ (?:openings|positions|vacancies)|bonus|bonuses|benefits|relocation|relocate|relo|encouraged to apply|apply (?:now|today)|premium posting|job fair|career fair|open house|walk ins?|we are hiring|join our team|evergreen|talent (?:pool|community|pipeline|network)';
const RECRUITING = new RegExp(`\\b(?:${RECRUITING_SAID})\\b`);
/** A recruiting phrase and nothing else. */
const RECRUITING_ALONE = new RegExp(`^(?:${RECRUITING_SAID})$`);
/** A recruiter's tag for a posting kept open, set in brackets before the name. */
const LEADING_TAG = /^(?:pipeline|evergreen|talent (?:pool|community|pipeline|network)|future (?:opening|openings|opportunity|opportunities)|general (?:application|interest))$/;

/** A team's or a trade's code among words: "ET&D", "E3", "NDT". */
const codeToken = (token: string): boolean => /[a-z0-9]&[a-z0-9]/.test(token) || (/\d/.test(token) && /[a-z]/.test(token)) || ACRONYMS.has(token.toUpperCase());

/**
 * Recruiting noise: bonuses, hiring events, relocation, "Multiple Openings", an always-open ("Evergreen") posting.
 * A segment that sets a team's code before the phrase ("ET&D HIRING EVENT") is not noise whole: the phrase is taken
 * off its end, and the code stays.
 */
function recruitingNote(tokens: string[]): boolean {
  if (!tokens.length || tokens.length > 9) return false;
  const found = RECRUITING.exec(tokens.join(' '));
  if (!found) return false;
  const before = tokens.join(' ').slice(0, found.index).split(' ').filter(Boolean);
  return !(before.length > 0 && before.every(codeToken));
}

/** A requirement as a note: "CERTIFICATION REQUIRED", "Japanese speaking is Required". */
function requiredNote(tokens: string[]): boolean {
  if (!tokens.length || tokens.length > 8) return false;
  const last = tokens[tokens.length - 1];
  if (tokens.some((token) => /^(?:years?|yrs?)$/.test(token))) return false;
  if (['required', 'reqd', 'preferred', 'needed', 'necessary', 'mandatory'].includes(last)) return true;
  const said = tokens.join(' ');
  return / a plus$/.test(said) || / is a must$/.test(said);
}

const isYear = (token: string): boolean => /^20[1-4]\d$/.test(token);
const SEASONS = new Set('spring summer fall autumn winter'.split(' '));
const MONTHS = new Set(
  'jan january feb february mar march apr april may jun june jul july aug august sep sept september oct october nov november dec december'.split(' ')
);
const DATE_FILLER = new Set('start starts starting started date begins beginning class of q1 q2 q3 q4 session term semester in for by apply deadline asap the'.split(' '));

/** A date as a note: "Starting Summer 2027", "2026", "Starts 1/15". */
function dateNote(tokens: string[]): boolean {
  if (!tokens.length || tokens.length > 6) return false;
  let year = false;
  let month = false;
  let number = false;
  let exact = false;
  let day = false;
  let said = false;
  for (const token of tokens) {
    if (isYear(token)) year = true;
    else if (SEASONS.has(token)) continue;
    else if (MONTHS.has(token)) month = true;
    else if (/^\d{1,2}(?:st|nd|rd|th)?$/.test(token)) number = true;
    else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(token)) exact = true;
    else if (/^\d{1,2}\/\d{1,2}$/.test(token)) day = true;
    else if (token === 'asap') exact = true;
    else if (DATE_FILLER.has(token)) said = true;
    else return false;
  }
  // "Starts 1/15" is a day; "2/3" by itself is a grade ("Level 2/3", "Machinist 3/4").
  return year || exact || (day && said) || (month && number);
}

/** "(m/w/d)", "(H/F)": the mark a posting abroad adds for every gender. */
const genderNote = (text: string): boolean => /^(?:[mwfdxh]|div)(?:\s*\/\s*(?:[mwfdxh]|div)){1,3}$/i.test(text.trim()) || /^all genders$/i.test(text.trim());

/** One requisition number or code: "19588", "R-12345", "JR100234", "REQ123", "26-505", "#4521". */
function requisitionToken(token: string): boolean {
  const said = token.replace(/^[#*]+|[*]+$/g, '');
  if (!said) return false;
  if (/^\d{4,}$/.test(said)) return !isYear(said);
  if (/^\d{2,6}-\d{1,6}$/.test(said)) {
    const [left, right] = said.split('-');
    return said.length - 1 >= 4 && !(isYear(left) && isYear(right));
  }
  if (/^(?:r|jr|req|rq|irc|jo|jn|pos|pr|p)[-_]?\d{3,}(?:-\d+)*$/i.test(said)) return true;
  return /^#/.test(token) && /^\d{2,}$/.test(said);
}

/** A requisition number as a note: one or several, with or without the word. */
function requisitionNote(text: string): boolean {
  const said = text.replace(/[()[\]]/g, ' ').trim();
  if (!said || said.length > 60) return false;
  if (/^(?:req(?:uisition)?|job|posting|position|ref(?:erence)?|id)\s*(?:id|no\.?|number|#)?\s*[:#-]?\s*[a-z]{0,3}-?\d{3,}\*{0,2}$/i.test(said)) return true;
  const parts = said.split(/\s*(?:&|,|\band\b)\s*|\s+/i).filter(Boolean);
  return parts.length > 0 && parts.length <= 8 && parts.every(requisitionToken);
}

/** Towns whose name is also a word a title sets before a role. */
const WORD_TOWNS = new Set(
  'mobile enterprise reading industry commerce union media tool marine energy security hazard advance pilot liberty independence'.split(' ')
);

const DIRECTIONS = new Set(
  'north south east west central northern southern eastern western northeast northwest southeast southwest ne nw se sw greater upper lower'.split(' ')
);

/** A town with its state, or the state: the job's own. */
function ownPlace(words: string[], raw: string, ctx: Ctx): boolean {
  if (!words.length) return false;
  const { city, stateCode, stateName } = ctx;
  if (city.length) {
    if (sameWords(words, city)) return true;
    if (stateCode && sameWords(words, [...city, stateCode])) return true;
    if (stateName.length && sameWords(words, [...city, ...stateName])) return true;
    if (sameWords(words, [...city, 'usa']) || (stateCode && sameWords(words, [...city, stateCode, 'usa']))) return true;
  }
  if (stateName.length && sameWords(words, stateName)) return true;
  // The state's code alone, written as a code, where it is no trade's abbreviation.
  if (stateCode && words.length === 1 && words[0] === stateCode && !TRADE_CODES.has(stateCode) && raw.trim().replace(/\./g, '') === stateCode.toUpperCase()) return true;
  return false;
}

/** The initials of the site's name, written as initials, where they are no trade's abbreviation. */
const siteInitials = (raw: string, ctx: Ctx): boolean => {
  const said = raw.trim();
  return /^[A-Z]{3,6}$/.test(said) && ctx.initials.has(said.toLowerCase()) && !ACRONYMS.has(said);
};

/** Whether the words are a site of the job: the factory by one of its names, its town, a region of its state. */
function ownSite(words: string[], raw: string, ctx: Ctx): boolean {
  if (!words.length || words.length > 9) return false;
  if (ownPlace(words, raw, ctx)) return true;
  if (siteInitials(raw, ctx)) return true;
  // "North Texas", "Southeast MI Locations".
  if (ctx.stateCode && DIRECTIONS.has(words[0])) {
    let rest = words.slice(1);
    while (rest.length && DIRECTIONS.has(rest[0])) rest = rest.slice(1);
    if (rest.length && ['locations', 'location', 'area', 'region'].includes(rest[rest.length - 1])) rest = rest.slice(0, -1);
    if (sameWords(rest, ctx.stateName) || (rest.length === 1 && rest[0] === ctx.stateCode && new RegExp(`\\b${ctx.stateCode.toUpperCase()}\\b`).test(raw))) return true;
  }
  const kindOnly = (rest: string[]): boolean => rest.length > 0 && rest.length <= 3 && rest.every((word) => SITE_KIND.has(word));
  // "Pontiac Stamping", "Faribault Plant", "East Peoria LL" (the town and a building's code).
  if (ctx.city.length && beginsWith(words, ctx.city) && words.length > ctx.city.length) {
    const rest = words.slice(ctx.city.length);
    if (kindOnly(rest)) return true;
    if (ownPlace(rest, '', ctx)) return true;
    const code = raw.trim().split(/\s+/).pop() ?? '';
    if (rest.length === 1 && /^[A-Z]{2}$/.test(code) && !ACRONYMS.has(code) && fold(code) === rest[0]) return true;
  }
  for (const site of ctx.sites) {
    if (sameWords(words, site)) return true;
    if (beginsWith(words, site)) {
      const rest = words.slice(site.length);
      if (kindOnly(rest) || ownPlace(rest, '', ctx)) return true;
    }
  }
  return false;
}

const CAPITALISED = "[A-Z][\\w.'\u2019-]*";
const TOWN_COMMA_CODE = new RegExp(`^(${CAPITALISED}(?:\\s+${CAPITALISED}){0,3})\\s*,\\s*([A-Za-z]{2})\\.?$`);
const TOWN_COMMA_NAME = new RegExp(`^(${CAPITALISED}(?:\\s+${CAPITALISED}){0,3})\\s*,\\s*([A-Za-z][A-Za-z ]{3,20})$`);
const TOWN_CODE = /^([A-Z][a-z][\w.'\u2019-]*(?:\s+[A-Z][a-z][\w.'\u2019-]*){0,2})\s*[-,]?\s+([A-Z]{2})$/;
const STATE_NAMES = new Set(Object.values(STATES));

/**
 * A place, a site or the company as a whole segment: the job's own by any of its names, or any town written with
 * its state ("Fallbrook, CA"), a county, a "\u2026 Location".
 */
function placeNote(raw: string, words: string[], ctx: Ctx): string | null {
  if (!words.length || words.length > 10) return null;
  const text = raw.trim().replace(/^(?:at|in|@|near)\s+/i, '');
  const said = words[0] === 'at' || words[0] === 'in' || words[0] === 'near' ? words.slice(1) : words;
  if (!said.length) return null;
  const joined = said.join(' ');
  if (joined === 'usa' || joined === 'united states' || joined === 'united states of america') return 'country';

  let rest = said;
  const form = ctx.companies.find((name) => beginsWith(said, name));
  if (form) {
    rest = said.slice(form.length);
    if (rest.every((word) => FIRM_WORDS.has(word))) return 'company';
    while (rest.length && (LEGAL.has(rest[0]) || rest[0] === 'motor' || rest[0] === 'motors')) rest = rest.slice(1);
    if (ownSite(rest, '', ctx)) return 'site';
  }
  if (ownSite(said, text, ctx)) return ctx.sites.some((site) => beginsWith(said, site)) || siteInitials(text, ctx) ? 'site' : 'place';

  // Any town with its state: "Fallbrook, CA", "Akron, Ohio".
  const coded = TOWN_COMMA_CODE.exec(text);
  if (coded && STATES[coded[2].toLowerCase()] && coded[2] === coded[2].toUpperCase() && !townIsAnArea(coded[1])) return 'place';
  const named = TOWN_COMMA_NAME.exec(text);
  if (named && STATE_NAMES.has(named[2].trim().toLowerCase()) && !townIsAnArea(named[1])) return 'place';
  // A town and the job's own state with no comma: "Plymouth MN".
  const bare = TOWN_CODE.exec(text);
  // A code that is also a trade's is left: "Roy UT" is written as "Immersion UT" and "Phased Array UT" are, and
  // nothing here knows a town from a method.
  if (bare && ctx.stateCode && bare[2].toLowerCase() === ctx.stateCode && !TRADE_CODES.has(ctx.stateCode) && !townIsAnArea(bare[1])) return 'place';
  // A site's code and the job's own state: "DMNC MI".
  const codeState = /^([A-Z][A-Z0-9]{2,5})\s+([A-Z]{2})$/.exec(text);
  if (codeState && ctx.stateCode && codeState[2].toLowerCase() === ctx.stateCode && !TRADE_CODES.has(ctx.stateCode) && !ACRONYMS.has(codeState[1])) return 'place';
  // "Macomb County", "Walker Location", "The Americana Showroom".
  if (said.length >= 2 && said.length <= 4 && /^[A-Z]/.test(text)) {
    const last = said[said.length - 1];
    if (last === 'county' || last === 'location' || last === 'locations' || last === 'showroom') return 'place';
  }
  // A firm under its legal name: "A&I Products Canada Inc.".
  if (said.length >= 2 && said.length <= 8 && FIRM_ENDS.has(said[said.length - 1]) && /^[A-Z]/.test(text)) return 'company';
  // "Dallas/Richardson", "Santa Clara/Dallas": towns the posting lists, the job's own among them.
  if (text.includes('/')) {
    const towns = text.split('/').map((part) => part.trim());
    const isTown = (part: string): boolean => /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(part) && !townIsAnArea(part);
    if (towns.length >= 2 && towns.length <= 4 && towns.every(isTown) && towns.some((part) => ownPlace(wordsOf(part), part, ctx))) return 'place';
  }
  return null;
}

/** "Quality, IN", "Assembly, AL": a department before a comma is not a town. */
const townIsAnArea = (town: string): boolean => {
  const words = wordsOf(town);
  return words.length === 1 && AREA_WORDS.has(words[0]);
};

/**
 * What a whole segment is, when it is wholly something the page states elsewhere; null when it is not, or when it
 * holds the word of a role.
 */
function wholeNoise(raw: string, ctx: Ctx, joint = false): string | null {
  const text = raw.trim();
  if (!text) return 'empty';
  const words = wordsOf(text);
  if (!words.length) return /[A-Za-z0-9]/.test(text) ? null : 'empty';
  if (words.length > 14) return null;
  const tokens = tokensOf(text);
  // Schooling is read before the word of a role is looked for: "Associates Degree" holds one in name only.
  if (schoolingNote(tokens)) return 'schooling';
  if (hasRole(words, ctx)) return null;
  if (genderNote(text.replace(/[()[\]]/g, ''))) return 'gender';
  if (requisitionNote(text)) return 'requisition';
  if (shiftNote(tokens, 'whole')) return 'shift';
  const every = everyNote(tokens);
  if (every) return every;
  if (percentNote(text)) return 'required';
  if (kindNote(tokens)) return 'kind';
  if (arrangementNote(tokens)) return 'arrangement';
  if (clearanceNote(tokens)) return 'clearance';
  if (citizenshipNote(tokens)) return 'citizenship';
  if (experienceNote(tokens)) return 'experience';
  if (dateNote(tokens)) return ctx.intern ? null : 'date';
  // A note that is known by a word it holds ("... Bonus", "... Required") is read only in a plain run of text, and
  // a town only where no bracket stands in it: "Electromechanical (Relo Assistance!)" keeps its first word.
  if (/[()[\]]/.test(text) || joint) return null;
  if (/!\s*$/.test(text)) return 'banner';
  if (payNote(text)) return 'pay';
  if (recruitingNote(tokens)) return 'recruiting';
  if (requiredNote(tokens)) return 'required';
  return placeNote(text, words, ctx);
}

// ---------------------------------------------------------------------------------------------------------
// Cutting
// ---------------------------------------------------------------------------------------------------------

type Piece = { text: string; sep: string; start: number; end: number };

const isSpace = (char: string | undefined): boolean => char === undefined || /\s/.test(char);
const isDash = (char: string | undefined): boolean => char === '-' || char === '\u2013' || char === '\u2014';

/**
 * A text cut at its separators, outside brackets. Level 1: dashes that stand apart, "|", ": ", " @ ". Level 2:
 * commas, semicolons and a slash that stands apart.
 */
function split(text: string, level: 1 | 2): Piece[] {
  const pieces: Piece[] = [];
  let depth = 0;
  let from = 0;
  let sep = '';
  const push = (to: number): void => {
    let start = from;
    let end = to;
    while (start < end && isSpace(text[start])) start += 1;
    while (end > start && isSpace(text[end - 1])) end -= 1;
    pieces.push({ text: text.slice(start, end), sep, start, end });
  };
  let at = 0;
  while (at < text.length) {
    const char = text[at];
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      let found = '';
      let end = at + 1;
      if (level === 1) {
        if (isDash(char)) {
          while (isDash(text[end])) end += 1;
          const left = isSpace(text[at - 1]);
          const right = isSpace(text[end]);
          const digits = /\d/.test(text[at - 1] ?? '') && /\d/.test(text[end] ?? '');
          const bracket = text[at - 1] === ')' || text[at - 1] === ']' || text[end] === '(' || text[end] === '[';
          if (at > 0 && end < text.length && (left || right || bracket || (char !== '-' && !digits))) found = ` ${char} `;
        } else if (char === '|' && text[at - 1] !== '|' && text[end] !== '|') {
          found = ' | ';
        } else if (char === '\u2022' || char === '\u00b7') {
          found = ` ${char} `;
        } else if (char === '_' && at > 0 && (isSpace(text[end]) || (/[A-Za-z]{3}$/.test(text.slice(0, at)) && /^[A-Za-z]{3}/.test(text.slice(end))))) {
          // "3rd Shift_ Machinist III", "CNC Programmer_Design": an underscore parts two things, where it stands
          // after a word and before a space or another word.
          found = ' - ';
        } else if (char === ':' && isSpace(text[end]) && at > 0) {
          found = ': ';
        } else if (char === '@' && isSpace(text[at - 1]) && isSpace(text[end])) {
          found = ' @ ';
        }
      } else if (char === ',' && !(/\d/.test(text[at - 1] ?? '') && /^\d{3}(?!\d)/.test(text.slice(end, end + 4)))) {
        found = ', ';
      } else if (char === ';') {
        found = '; ';
      } else if (char === '/' && isSpace(text[at - 1]) && isSpace(text[end]) && at > 0) {
        found = ' / ';
      }
      if (found) {
        push(at);
        sep = found;
        from = end;
        at = end;
        continue;
      }
    }
    at += 1;
  }
  push(text.length);
  return pieces;
}

/** Pieces put back with the separators that stood before each kept one. */
function join(pieces: Piece[], kept: string[]): string {
  let out = '';
  for (let at = 0; at < pieces.length; at += 1) {
    if (!kept[at]) continue;
    // A bracket left alone by a cut stands beside the name ("Welder - C Shift (Starship)" is "Welder (Starship)").
    // One the company set after a dash is brought beside it when the name is tidied.
    const bared = /^[([]/.test(kept[at]) && !/^[([]/.test(pieces[at].text);
    out += out ? (bared ? ' ' : pieces[at].sep) + kept[at] : kept[at];
  }
  return out;
}

/** A whole title, or what stands in a bracket: cut at its separators, each segment read by itself. */
function cleanUnit(text: string, ctx: Ctx, depth: number): string {
  const whole = wholeNoise(text, ctx);
  if (whole) {
    if (whole !== 'empty') took(ctx, whole, text);
    return '';
  }
  // A recruiter's tag in brackets before the name: "(PIPELINE) Advanced Effects - Buyer". After a name the same
  // word may be its branch ("Welder (Pipeline)"), and stays.
  if (depth === 0) {
    const tag = /^[([]\s*([^()[\]]{1,40}?)\s*[)\]]\s*(?=\S)/.exec(text);
    if (tag && LEADING_TAG.test(tokensOf(tag[1]).join(' '))) {
      took(ctx, 'recruiting', tag[1]);
      return cleanUnit(text.slice(tag[0].length), ctx, depth);
    }
  }
  const pieces = split(text, 1);
  const cut = new Array<boolean>(pieces.length).fill(false);
  // "CW - Manufacturing Technician II": a contingent worker's opening, said by its code before the name.
  if (depth === 0 && pieces.length >= 2 && pieces[0].text === 'CW') {
    cut[0] = true;
    took(ctx, 'kind', pieces[0].text);
  }
  // The leading clause that names the company or the site: "John Deere Des Moines Works - Production Welder".
  if (depth === 0 && pieces.length >= 2 && !cut[0]) {
    const first = wordsOf(pieces[0].text);
    if (first.length && first.length <= 9 && !hasRole(first, ctx)) {
      const company = ctx.companies.some((form) => holds(first, form));
      const site = (ctx.city.length > 0 && holds(first, ctx.city)) || ctx.sites.some((name) => name.length >= 2 && holds(first, name));
      const role = pieces.slice(1).some((piece) => hasRole(wordsOf(piece.text), ctx));
      if (company || (site && role)) {
        cut[0] = true;
        took(ctx, 'leading-clause', pieces[0].text);
      }
    }
  }
  markRuns(text, pieces, cut, ctx);
  const kept = pieces.map((piece, at) => (cut[at] ? '' : cleanSegment(piece.text, ctx, depth)));
  return join(pieces, kept);
}

/** Neighbouring pieces that are one note between them ("Shift - B", "Fallbrook, CA", "Monday - Thursday 10pm to 8am"). */
function markRuns(text: string, pieces: Piece[], cut: boolean[], ctx: Ctx): void {
  for (let from = 0; from < pieces.length; from += 1) {
    if (cut[from]) continue;
    for (let to = Math.min(pieces.length - 1, from + 3); to > from; to -= 1) {
      if (cut.slice(from, to + 1).some(Boolean)) continue;
      if (from === 0 && to === pieces.length - 1) continue;
      const run = text.slice(pieces[from].start, pieces[to].end);
      const rule = wholeNoise(run, ctx, true) ?? (/[()[\]]/.test(run) ? null : placeNote(run, wordsOf(run), ctx));
      if (rule && rule !== 'empty') {
        took(ctx, rule, run);
        for (let at = from; at <= to; at += 1) cut[at] = true;
        break;
      }
    }
  }
}

/** One segment between dashes: whole, then comma by comma. */
function cleanSegment(text: string, ctx: Ctx, depth: number): string {
  const whole = wholeNoise(text, ctx);
  if (whole) {
    if (whole !== 'empty') took(ctx, whole, text);
    return '';
  }
  const pieces = split(text, 2);
  const cut = new Array<boolean>(pieces.length).fill(false);
  if (pieces.length > 1) markRuns(text, pieces, cut, ctx);
  const kept = pieces.map((piece, at) => (cut[at] ? '' : cleanPart(piece.text, ctx, depth)));
  return join(pieces, kept);
}

type Bit = { kind: 'text' | 'round' | 'square'; text: string };

/** A piece as its runs of text and its brackets. A bracket never closed is closed; a closer never opened is dropped. */
function bits(text: string): Bit[] {
  const out: Bit[] = [];
  let run = '';
  let at = 0;
  const flush = (): void => {
    if (run.trim()) out.push({ kind: 'text', text: run.trim() });
    run = '';
  };
  while (at < text.length) {
    const char = text[at];
    if (char === '(' || char === '[') {
      const close = char === '(' ? ')' : ']';
      let depth = 1;
      let end = at + 1;
      while (end < text.length && depth > 0) {
        if (text[end] === char) depth += 1;
        else if (text[end] === close) depth -= 1;
        if (depth > 0) end += 1;
      }
      const inner = text.slice(at + 1, end);
      // "Engineer(s)": a plural's mark is part of the word.
      if (/^(?:s|es)$/i.test(inner) && /[A-Za-z]/.test(text[at - 1] ?? '') && depth === 0) {
        run += text.slice(at, end + 1);
      } else {
        flush();
        out.push({ kind: char === '(' ? 'round' : 'square', text: inner });
      }
      at = end + 1;
      continue;
    }
    if (char !== ')' && char !== ']') run += char;
    at += 1;
  }
  flush();
  return out;
}

/** One piece between commas: its text trimmed of notes at either end, its brackets read as titles of their own. */
function cleanPart(text: string, ctx: Ctx, depth: number): string {
  const whole = wholeNoise(text, ctx);
  if (whole) {
    if (whole !== 'empty') took(ctx, whole, text);
    return '';
  }
  const parts = bits(text);
  const role = hasRole(wordsOf(text), ctx);
  const out: string[] = [];
  let siteCut: string[] = [];
  for (const part of parts) {
    if (part.kind === 'text') {
      const before = new Set(ctx.rules);
      const kept = cleanText(part.text, ctx, role);
      if (kept) out.push(kept);
      const placed = ['site', 'place'].some((rule) => ctx.rules.has(rule)) && (before.has('site') || before.has('place') ? wholeIsPlace(part.text, ctx) : true);
      siteCut = !kept && placed ? wordsOf(part.text) : [];
      continue;
    }
    const inner = part.text.trim();
    if (!inner) continue;
    // "(BSP)" after Buffalo Stamping Plant, "(OHAP)" after Ohio Assembly Plant: the site's initials.
    if (/^[A-Z]{2,6}$/.test(inner) && (ctx.initials.has(inner.toLowerCase()) || abbreviates(inner.toLowerCase(), siteCut))) {
      took(ctx, 'site', inner);
      continue;
    }
    siteCut = [];
    // "(Cape)" at Cape Canaveral, "(Merritt)" at Merritt Island: the job's own town by its first words.
    if (townShortened(inner, ctx)) {
      took(ctx, 'place', inner);
      continue;
    }
    const kept = depth >= 3 ? inner : cleanUnit(dropOwnSlashParts(inner, ctx), ctx, depth + 1);
    const tidy = trimEdges(kept);
    if (tidy) out.push(part.kind === 'round' ? `(${tidy})` : `[${tidy}]`);
  }
  return out.join(' ');
}

/** Whether the words are the first words of the job's town and not all of it, where they are no word of their own. */
function townShortened(raw: string, ctx: Ctx): boolean {
  const words = wordsOf(raw);
  if (!words.length || words.length >= ctx.city.length || !beginsWith(ctx.city, words)) return false;
  if (!/^[A-Z][a-z]/.test(raw.trim())) return false;
  const first = words[0];
  if (first.length < 4 || COMMON.has(first) || DIRECTIONS.has(first) || SEASONS.has(first) || AREA_WORDS.has(first) || SITE_KIND.has(first) || WORD_TOWNS.has(first)) return false;
  return !FOUR_LETTER_WORDS.has(first.toUpperCase());
}

/**
 * "(Starlink/Akoustis)" at the Akoustis factory: of names joined by a slash, the ones that are the job's own site
 * or place are dropped and the rest kept. Nothing is dropped when none is, or when all are.
 */
function dropOwnSlashParts(text: string, ctx: Ctx): string {
  if (!text.includes('/') || /[()[\]]/.test(text)) return text;
  const parts = text.split('/');
  if (parts.length < 2 || parts.length > 4 || parts.some((part) => !part.trim() || /^\s|\s$/.test(part))) return text;
  const probe: Ctx = { ...ctx, rules: new Set(), cut: [] };
  // "Dallas/Richardson": towns the posting lists are one note, read whole.
  if (wholeNoise(text, probe)) return text;
  const own = parts.map((part) => {
    const words = wordsOf(part);
    if (!words.length || hasRole(words, ctx)) return false;
    const rule = placeNote(part, words, probe);
    return rule === 'site' || rule === 'place';
  });
  if (!own.some(Boolean) || own.every(Boolean)) return text;
  parts.forEach((part, at) => {
    if (own[at]) took(ctx, 'site', part);
  });
  return parts.filter((_, at) => !own[at]).join('/');
}

/** Whether a run of text is, whole, a site or a place of the job. */
function wholeIsPlace(text: string, ctx: Ctx): boolean {
  const probe: Ctx = { ...ctx, rules: new Set(), cut: [] };
  const rule = wholeNoise(text, probe);
  return rule === 'site' || rule === 'place';
}

/** Whether letters abbreviate words in order, each word giving its first letter or letters: "ohap" of Ohio Assembly Plant. */
function abbreviates(letters: string, words: string[]): boolean {
  const named = words.filter((word) => !['and', 'of', 'the'].includes(word));
  if (named.length < 2 || letters.length < named.length) return false;
  const fits = (at: number, word: number): boolean => {
    if (word === named.length) return at === letters.length;
    for (let take = 1; at + take <= letters.length && take <= named[word].length; take += 1) {
      if (named[word].slice(0, take) !== letters.slice(at, at + take)) break;
      if (fits(at + take, word + 1)) return true;
    }
    return false;
  };
  return fits(0, 0);
}

const EDGE = /^(?:[\s\-\u2013\u2014,;:|/@\u2022\u00b7_]|\.(?=\s))+|[\s\-\u2013\u2014,;:|/@\u2022\u00b7&_]+$/g;
const trimEdges = (text: string): string => text.replace(EDGE, '').trim();

/** A run of text: notes taken off its end and its start until none is left. */
function cleanText(text: string, ctx: Ctx, pieceHasRole: boolean): string {
  let current = trimEdges(text);
  // "Starlink/Akoustis" as a segment of its own, at the Akoustis factory.
  if (!/\s/.test(current)) current = dropOwnSlashParts(current, ctx);
  for (let turn = 0; turn < 10 && current; turn += 1) {
    const whole = wholeNoise(current, ctx);
    if (whole) {
      if (whole !== 'empty') took(ctx, whole, current);
      return '';
    }
    const tail = cutTail(current, ctx);
    if (tail !== null) {
      current = tail;
      continue;
    }
    const head = cutHead(current, ctx, pieceHasRole);
    if (head !== null) {
      current = head;
      continue;
    }
    // A shift named outright in the middle of a name: "NPC 2nd Shift Test Engineer".
    const inside = SHIFT_INSIDE.exec(current);
    if (inside && inside.index > 0) {
      took(ctx, 'shift', inside[0]);
      current = `${current.slice(0, inside.index)} ${current.slice(inside.index + inside[0].length)}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    break;
  }
  return current;
}

const SHIFT_INSIDE = /\s(?:[1-5](?:st|nd|rd|th)|first|second|third|day|night|swing|weekend|evening)\s+shift\s/i;

/** Where words begin in a text: after a space, or after a hyphen that joins two words. */
function wordStarts(text: string): number[] {
  const starts: number[] = [];
  for (let at = 1; at < text.length; at += 1) {
    const before = text[at - 1];
    if ((isSpace(before) || isDash(before) || before === '/') && !isSpace(text[at]) && !isDash(text[at]) && text[at] !== '/') starts.push(at);
  }
  return starts;
}

const DANGLING = /(?:\s+(?:at|in|with|w\/|for|and|or|on|-|\u2013|\u2014|@|&))+$/i;

/** The text without a note at its end, or null when it ends in none. The longest note is taken. */
function cutTail(text: string, ctx: Ctx): string | null {
  for (const start of wordStarts(text)) {
    const tail = text.slice(start);
    const head = text.slice(0, start);
    const words = wordsOf(tail);
    if (!words.length || words.length > 9) continue;
    if (hasRole(words, ctx)) continue;
    const attached = isDash(text[start - 1]) && !isSpace(text[start - 2]);
    const rule = tailNoise(tail, head, attached, ctx);
    if (!rule) continue;
    // A number set against a word is a requisition ("Systems-3217-3"); set against a code it is part of it ("MK1-2200").
    if (attached && rule === 'requisition' && !/[a-z]{3}-$/.test(head)) continue;
    const kept = trimEdges(head.replace(DANGLING, '')).replace(DANGLING, '');
    // A note is taken off a name, never off a lone joining word.
    if (!wordsOf(kept).length) continue;
    took(ctx, rule, tail);
    return trimEdges(kept);
  }
  return null;
}

function tailNoise(tail: string, head: string, attached: boolean, ctx: Ctx): string | null {
  const tokens = tokensOf(tail);
  if (!tokens.length) return null;
  // "Welder at SpaceX", "Engineer in Austin", "Machinist-Tulsa".
  const after = /^(?:at|in|@)\s+(.+)$/i.exec(tail);
  if (after) {
    const place = placeNote(after[1], wordsOf(after[1]), ctx);
    if (place) return place;
  }
  if (attached) {
    const whole = wholeNoise(tail, ctx);
    if (whole && whole !== 'empty') return whole;
  }
  if (shiftNote(tokens, 'tail')) return 'shift';
  const every = everyNote(tokens);
  if (every) return every;
  if (tokens.length <= 3 && kindNote(tokens) && /^(?:full ?time|part ?time|temp to hire|contingent)$/.test(tokens.join(' '))) return 'kind';
  if (arrangementNote(tokens) && !tokens.includes('hybrid') && !tokens.includes('in')) return 'arrangement';
  if (clearanceNote(tokens)) return 'clearance';
  if (experienceNote(tokens)) return 'experience';
  const codes = tokensOf(head);
  if (RECRUITING_ALONE.test(tokens.join(' ')) && codes.length > 0 && codes.every(codeToken)) return 'recruiting';
  const written = tail.trim().split(/\s+/);
  if (written.every((token) => requisitionToken(token) && /\d{3}/.test(token))) return 'requisition';
  if (tokens.length === 1 && isYear(tokens[0]) && !ctx.intern) return 'date';
  if (/^(?:USA|U\.S\.A\.?|United States)$/.test(tail.trim())) return 'country';
  // "Engines LSO" at Launch Site One: the site's initials after a name that does not shout.
  if (siteInitials(tail, ctx) && /[a-z]/.test(head)) return 'site';
  // "Quality Control Inspector I NV": the job's own state as a code after the name.
  const code = tail.trim();
  if (ctx.stateCode && code === ctx.stateCode.toUpperCase() && !TRADE_CODES.has(ctx.stateCode) && wordsOf(head).length >= 2 && /[a-z]/.test(head)) return 'place';
  return null;
}

/** The text without a note at its start, or null when it begins with none. */
function cutHead(text: string, ctx: Ctx, pieceHasRole: boolean): string | null {
  const starts = wordStarts(text).filter((start) => isSpace(text[start - 1]));
  for (let at = Math.min(starts.length, 6) - 1; at >= 0; at -= 1) {
    const start = starts[at];
    const head = text.slice(0, start).trim();
    const rest = text.slice(start);
    const words = wordsOf(head);
    if (!words.length || hasRole(words, ctx)) continue;
    const rule = headNoise(head, words, rest, ctx, pieceHasRole);
    if (!rule) continue;
    const kept = trimEdges(rest);
    if (!wordsOf(kept).length) continue;
    took(ctx, rule, head);
    return kept;
  }
  return null;
}

function headNoise(head: string, words: string[], rest: string, ctx: Ctx, pieceHasRole: boolean): string | null {
  const tokens = shiftTokens(tokensOf(head));
  const restWords = wordsOf(rest);
  if (shiftNote(tokens, 'head') && restWords[0] !== 'vision' && (tokens.length >= 2 || pieceHasRole)) return 'shift';
  if (/^on-?\s?site$/i.test(head)) return 'arrangement';
  if (/^(?:now hiring|hiring now|urgent(?:ly)?(?: hiring)?|immediate (?:opening|openings|hire|need))$/.test(tokens.join(' '))) return 'recruiting';
  if (/^\S+$/.test(head) && requisitionToken(head) && (/^[A-Za-z#]/.test(head) ? /\d{3}/.test(head) : /^\d{5,}$/.test(head))) return 'requisition';
  const capital = /^[A-Z0-9]/.test(rest.trim());
  // The company before the role or before its division: "John Deere Technician", "Anduril Expeditionary Systems".
  const form = ctx.companies.find((name) => sameWords(words, name));
  if (form && capital) {
    if (form.length >= 2 || /[a-z][A-Z]/.test(head)) return 'company';
    if (!pieceHasRole && restWords.length >= 2) return 'company';
  }
  // The site or the town before a place inside it: "Starbase Vibe Test Lab". Before one word it is part of a
  // team's name, and stays: "Starbase Development".
  if (!pieceHasRole && capital && words.join('').length >= 4 && restWords.length >= 2) {
    if (ctx.city.length && sameWords(words, ctx.city)) return 'place';
    if (ctx.sites.some((site) => sameWords(words, site) && site.some(distinctive))) return 'site';
  }
  // The site by its code, written as a code, before the name: "RFAB Module Industrial Engineer".
  if (capital && words.length === 1 && /^[A-Z][A-Z0-9]{2,}$/.test(head) && !ACRONYMS.has(head) && ctx.sites.some((site) => sameWords(words, site))) return 'site';
  // The job's own state as a code before the name: "NM Silicon Photonics Dry Etch Process Development Engineer".
  if (ctx.stateCode && head === ctx.stateCode.toUpperCase() && !TRADE_CODES.has(ctx.stateCode) && !LEADING_TRADE_CODES.has(ctx.stateCode) && /^[A-Z][a-z]/.test(rest.trim()) && restWords.length >= 3) {
    return 'place';
  }
  // The job's own town set straight before the role: "Huntsville Technician". A town whose name is a word of the
  // trade ("Mobile Technician", "Marine Mechanic") is left.
  if (pieceHasRole && ctx.city.length && sameWords(words, ctx.city) && /^[A-Z][a-z]/.test(head) && ctx.roles.has(restWords[0] ?? '')) {
    const plain = ctx.city.some((word) => WORD_TOWNS.has(word) || AREA_WORDS.has(word) || COMMON.has(word) || SITE_KIND.has(word));
    if (!plain && ctx.city.join('').length >= 5) return 'place';
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Tidying, capitals, and the checks at the end
// ---------------------------------------------------------------------------------------------------------

/** The title as text to read: one line, plain hyphens, no banner in asterisks. */
function tidyInput(posted: string, rules: Set<string>): string {
  let text = posted
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff\ue000-\uf8ff]/g, ' ')
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
    .replace(/[\u2010\u2011\u2212]/g, '-');
  if (/\*{2,}[^*]{1,80}\*{2,}/.test(text)) {
    text = text.replace(/\*{2,}[^*]{1,80}\*{2,}/g, ' ');
    rules.add('banner');
  }
  text = text.replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim();
  // "Process Engineer ||| - Plasma": two or three upright strokes after a word and before a separator are a grade
  // as the company typed it, not separators. They are held aside as letters of no alphabet and put back at the end.
  text = text.replace(/([A-Za-z)] )(\|{2,3})(?= ?(?:[-\u2013\u2014,(:]|$))/g, (_, before: string, strokes: string) => before + STROKE.repeat(strokes.length));
  return trimEdges(text);
}

/** An upright stroke held aside while a title is read. */
const STROKE = '\ue000';
const strokesBack = (text: string): string => text.replace(/\ue000/g, '|');

/** Separators left dangling, empty brackets, doubled spaces; one kind of dash in one name. */
function tidyOutput(text: string, rules: Set<string>, before: string): string {
  let out = text
    .replace(/\s+/g, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+([,;:)\]])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .replace(/[,;]\s*([([])/g, ' $1')
    // A bracket parts what it holds from the name by itself: a dash set before it is one separator too many, the
    // company's own or one a cut left ("Engineer I - (E1)" is "Engineer I (E1)", as "Engineer IV (E4)" is written).
    .replace(/(\S)\s*[-\u2013\u2014]+\s*(?=[([])/g, '$1 ')
    .replace(/\s+/g, ' ');
  out = trimEdges(out);
  const dashes = [...out.matchAll(/\s([-\u2013\u2014])\s/g)].map((match) => match[1]);
  if (new Set(dashes).size > 1) out = out.replace(/\s[-\u2013\u2014]\s/g, ` ${dashes[0]} `);
  if (out !== before && fold(out).replace(/[^a-z0-9]/g, '') === fold(before).replace(/[^a-z0-9]/g, '')) rules.add('separators');
  return out;
}

/** Abbreviations kept in capitals when a name written in capitals is given ordinary ones. */
const ACRONYMS = new Set(
  ('CNC NDT NDE NDI EMC EMI TIG MIG QA QC SMT PCB PCBA HVAC SCADA PLC HMI CMM CAD CAM CAE EDM MRO FAA ESD RF NPI ISO ' +
    'OSHA FPGA ASIC MEMS CMP PVD CVD ALD EUV DRAM NAND EHS ERP MES SAP AOI AXI ICT IPC ATE HIL HITL GNC UAV UAS UUV USV ' +
    'AUV AGV AMR ITAR NAVSEA NASA FCAW GTAW GMAW SMAW FMEA PFMEA DFMEA APQP PPAP CAPA NCR MRB BOM MRP SPC OEE TPM AC DC ' +
    'EV HV LV IT OT AI ML US USA UK EU HSE HR PM AM ID OD UT PT RT ET VT MT CT IE ME EE CE SE PE CWI API ASME AWS ANSI ' +
    'ASTM IATF RCM CBM PDM PLM VMC HMC VTL VTC HBM THT BGA LED LCD OLED MOCVD PECVD LPCVD RIE ICP SEM TEM FIB XRF XRD ' +
    'FTIR HPLC QMS WMS KPI SOP PPE LOTO JSA OPEX CAPEX SME OEM ODM RMA ECN ECO ECR DFM DFA DFX DOE MSA GRR FAI PPM TQM ' +
    'GMP CGMP HACCP SQF FDA USDA EPA DOT DOD NRC NNSA MDA USAF USN ISR EW EO IR RCS TPS GSE EGSE MGSE AIT EPS COPV MLI ' +
    'TVAC LOX LNG AMHS IIOT IOT GPS II III IV VI VII VIII IX XI XII')
    .split(' ')
);
/** Short words that are words, not initials. */
const SHORT_WORDS = new Set(
  ('ALL DAY NEW AIR GAS OIL DIE CUT SAW LAB BAY JET RAW SET TOP WET DRY HOT KEY LOW MID OFF ONE TWO SIX TEN PRE SUB VAN ' +
    'WEB TIN RIG ARC BIT CAB CAP CAR BUS PAD PIT RAM ROD TUG BOX BAR HUB INK JIG KIT MUD NET NUT PIN POT TAB TAG TAP TIP ' +
    'OLD BIG END EYE FAB FIT FIX FLY GUN ICE JOB LEG LOT MAN MAP MIX PAN PAY RIP ROW RUN SEA SKY SUN TAR TIE USE WAY NON ' +
    'SR JR CO OP MFG ENG YRS EXP WEEK ANY')
    .split(' ')
);
const SMALL_WORDS = new Set('AND THE FOR OF IN ON AT TO OR BY AN AS'.split(' '));
/** Four letters in capitals are as often initials as a word ("OPIP"): these are words. */
const FOUR_LETTER_WORDS = new Set(
  ('DECK PIPE TEST LEAD SEMI TECH WELD SHOP TOOL MILL CAST HEAT FORM WIRE LINE TEAM CREW PART TIME FULL YARD SHIP HULL ' +
    'DOCK TANK PUMP GEAR MOLD BORE IRON SAND ROLL TUBE CORE COIL CELL FUEL AREA UNIT ROOM MAIN BODY TRIM DOOR AXLE CASE ' +
    'BASE HAND HEAD FLOW FILM CHIP WORK LOAD PACK PICK LIFT FORK GATE SITE ZONE WEST EAST DAYS WEEK YEAR GRAD OPER ASSY ' +
    'ELEC MECH INSP QUAL CERT ONLY WITH FROM PLUS TYPE RATE PAID HOUR MUST HAVE OPEN HIGH DUTY ASST FALL BOAT SAIL NAVY ' +
    'ARMY RAIL AUTO DEPT SHOT PEEN WASH BATH KILN OVEN MELT POUR DRAW BEND HELP DESK DATA CODE SOFT HARD COLD WARM SAFE ' +
    'FIRE FLEX BACK SIDE REAR NEXT INTO OVER LONG TERM MAKE MADE TEAR DOWN LEAN CHEM FOAM WOOD SIGN MARK BULK FILL SEAL ' +
    'PLAN COST LOOP MESH NODE ZINC GOLD SEAT TIRE CABS HOSE BOLT RIVET SAWS DIES JIGS BLOW FLAT WAVE REEL FEED GRIT GLUE ' +
    'MOCK TRAY RACK PLUG CORD LAMP DUCT VENT PIPE JOIN EDGE FACE GAGE GAUGE LENS BEAM ATOM FLUX MEAT FOOD MILK FEED SALT ' +
    'RICE CORN SOAP PULP WOOL SILK YARN KNIT SEWN SHOE BOOT COAT LINE DRUM TOTE CAGE DOLLY FIRM NEWS PORT LAKE BATH ' +
    'MILE HILL PARK CITY TOWN ROAD FORT MESA PALM OHIO IOWA UTAH RISK WING TAIL NOSE SKIN KEEL MAST STEM PROP TURN ' +
    'HONE BUFF BAKE CURE COOL HAUL PULL PUSH MOVE STOW SORT TUNE TACK CLIP SNAP MINE GUNS BAND LINK GRID BOND ETCH ' +
    'MASK THIN DEEP WIDE FINE SLOW FAST TASK ITEM LIST FILE MATE AIDE COOK BOSS GOOD BEST REAL TRUE ZERO LAND MOON ' +
    'STAR WIND RAIN BLUE GRAY JUNIOR GLASS RADAR SONAR')
    .split(' ')
);

/** Whether a name is written in capitals throughout: no small letters, and a word that is plainly a word. */
function shouts(text: string): boolean {
  const plain = text.replace(/\b\d+(?:ST|ND|RD|TH|st|nd|rd|th)\b/g, ' ').replace(/\b\d+[a-z]+\b/g, ' ');
  if (/[a-z]/.test(plain)) return false;
  return (plain.match(/[A-Z]+/g) ?? []).some((word) => word.length >= 4 && /[AEIOUY]/.test(word) && !ACRONYMS.has(word));
}

/** A name that shouts, in ordinary capitals; abbreviations kept. Any other name as it is. */
function ordinaryCapitals(text: string): string {
  // A name that shouts only in part: two words or more in a row that are plainly words ("AUTOMATION TECHNICIAN -
  // Plant 3"). A lone word in capitals may be a program's name and stays.
  if (!shouts(text)) {
    const plain = (word: string): boolean => (word.length >= 5 && /[AEIOUY]/.test(word) && !ACRONYMS.has(word)) || FOUR_LETTER_WORDS.has(word);
    return text
      .replace(/[A-Z]{4,}(?: [A-Z]{4,})+/g, (run) => {
        const words = run.split(' ');
        return words.every(plain) && words.filter((word) => word.length >= 5).length >= 2 ? words.map(capital).join(' ') : run;
      })
      // The word of a role is a word, never a program's name: "New College Grad - ENGINEER, TD IE OPS".
      .replace(/\b[A-Z]{5,}\b/g, (word) => (ROLE_NOUNS.has(word.toLowerCase()) && !ACRONYMS.has(word) ? capital(word) : word));
  }
  let first = true;
  return text.replace(/[A-Z]+(?:'[A-Z]+)?|\d+(?:ST|ND|RD|TH)\b/g, (run, offset: number) => {
    const wasFirst = first;
    first = false;
    if (/^\d/.test(run)) return run.toLowerCase();
    const [word, possessive] = run.split("'");
    const tail = possessive !== undefined ? `'${possessive.length <= 1 ? possessive.toLowerCase() : capital(possessive)}` : '';
    const besideAmpersand = text[offset - 1] === '&' || text[offset + run.length] === '&';
    if (besideAmpersand && word.length <= 3) return run;
    if (ACRONYMS.has(word)) return word + tail;
    if (word.length === 1) return word + tail;
    if (SMALL_WORDS.has(word)) return (wasFirst ? capital(word) : word.toLowerCase()) + tail;
    if (word.length <= 3) return (SHORT_WORDS.has(word) ? capital(word) : word) + tail;
    if (!/[AEIOUY]/.test(word)) return word + tail;
    if (word.length === 4 && !FOUR_LETTER_WORDS.has(word)) return word + tail;
    return capital(word) + tail;
  });
}

const capital = (word: string): string => word.charAt(0) + word.slice(1).toLowerCase();

const GRADE_WORDS = new Set(
  ('senior sr junior jr lead principal staff associate entry level levels lvl grade grades mid experienced expert ' +
    'intermediate advanced master chief skilled semi certified i ii iii iv v vi all or and to tier step class')
    .split(' ')
);

/** Whether what is left is plainly not a name: no word, only a number, a lone grade, a joining word left hanging. */
function broken(name: string): boolean {
  const words = wordsOf(name);
  if (!words.length) return true;
  if (!/[A-Za-z]{2}/.test(name)) return true;
  if (/^[([][^()[\]]*[)\]]$/.test(name)) return true;
  if (words.every((word) => GRADE_WORDS.has(word) || /^\d+$/.test(word))) return true;
  const said = name.split(/\s+/);
  const hanging = /^(?:and|or|of|for|with|at|in|to|the|a|an|And|Or|Of|For|With|At|In|To|&|\+)$/;
  if (hanging.test(said[0]) && !/^(?:The|A|An|the|a|an)$/.test(said[0])) return true;
  if (/^(?:and|or|of|for|with|at|in|to|the|a|an|And|Or|Of|For|With|At|To|&|\+)$/.test(said[said.length - 1])) return true;
  let depth = 0;
  for (const char of name) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (depth < 0) return true;
  }
  return depth !== 0;
}

/** One of each: "Welders" is "Welder", "Facilities" is "Facility". */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

/** How a title shortens the words of a trade: "Industrial Engr", "Maintenance Tech", "QC Inspector". */
const SHORT_FOR: Record<string, string[]> = table({
  engr: ['engineer'], eng: ['engineer'], tech: ['technician'], mfg: ['manufacturing'], maint: ['maintenance'],
  insp: ['inspector'], oper: ['operator'], assy: ['assembly'], mgr: ['manager'], supv: ['supervisor'],
  qc: ['quality', 'control'], qa: ['quality', 'assurance'],
});

/** A title's words to compare: one of each, abbreviations written out. */
const comparedWords = (text: string | null | undefined): string[] => wordsOf(text).flatMap((word) => SHORT_FOR[singular(word)] ?? [singular(word)]);

/**
 * Whether the name says nothing beyond the career's title: the same words, in any case, order, number or
 * abbreviation, or the same letters with a space more or less ("Set Up Technician" for Setup Technician).
 */
function saysOnlyTheCareer(name: string, career: string | null | undefined): boolean {
  const title = comparedWords(career);
  if (!title.length) return false;
  // A grade typed in strokes ("Welder ||") is a grade.
  if (/\|{2,3}/.test(name)) return false;
  const said = comparedWords(name);
  if (said.join('') === title.join('')) return true;
  if (said.length !== title.length) return false;
  const sorted = [...said].sort().join(' ');
  return sorted === [...title].sort().join(' ');
}
