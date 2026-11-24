// The rest of what a posting states: where the work is, what it requires as
// facts (years, education, certificates, clearance, citizenship, shift, employment
// type) and what it pays. Each is null, or empty, when the posting does not say.

// --- Places --------------------------------------------------------------------

const STATES = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY' };
const STATE_BY_NAME = new Map(Object.entries(STATES).map(([n, c]) => [n.toLowerCase(), c]));
const STATE_CODES = new Set(Object.values(STATES));
const US = /^(u\.?s\.?a?\.?|united states( of america)?)$/i;
// Countries and the short codes feeds write for them. A place in one is not ours.
const ABROAD = new Set(('canada can mexico mx mex germany deu de india ind in china cn chn brazil br bra france fr fra netherlands nl nld poland pl pol ireland irl ie australia aus au nz new zealand uk gb gbr united kingdom england scotland singapore sgp sg taiwan twn tw japan jpn jp korea kor kr saudi arabia ksa uae united arab emirates serbia italy ita spain esp sweden swe israel isr argentina ar arg thailand tha malaysia mys vietnam vnm philippines phl costa rica switzerland che austria aut belgium bel denmark dnk finland fin norway nor czech republic hungary romania portugal turkey egypt south africa colombia chile peru puerto rico').split(' '));
const ABROAD_NAMES = ['new zealand', 'united kingdom', 'saudi arabia', 'united arab emirates', 'south africa', 'costa rica', 'czech republic', 'puerto rico'];

function tidyCity(city) {
  let c = city.replace(/\s+/g, ' ').trim();
  // A city in capitals is written as a name; a base's letters stay ("Beale AFB").
  if (c && c === c.toUpperCase()) c = c.toLowerCase().replace(/\b[a-z]/g, (x) => x.toUpperCase());
  return c;
}

function onePlace(raw) {
  let s = String(raw).split('~')[0].replace(/\s+/g, ' ').trim();
  if (!s || /^remote\b/i.test(s) || /^(hybrid|virtual|various|multiple locations?)$/i.test(s)) return null;
  s = s.replace(/\((?:remote|hybrid|onsite|on-site)\)/gi, '').trim();
  // "Auburn AL USA", "Saint George UT US 1": a site named by its town, its state's letters and the country with
  // spaces between, and the site's number after.
  const spaced = /^([A-Za-z][A-Za-z .'-]*?)\s+([A-Z]{2})\s+(?:US|USA)(?:\s+\d{1,3})?$/.exec(s);
  if (spaced && STATE_CODES.has(spaced[2])) return { city: tidyCity(spaced[1]), state: spaced[2] };
  const lower = s.toLowerCase();
  if (ABROAD_NAMES.some((n) => lower.includes(n))) return null;
  // "United States-Utah-Salt Lake City", "US-NC-WILSON-4200": parts joined by bare hyphens. A part that only says
  // there are other places ("Dallas, Multiple Locations, TX") is not the city.
  const bare = /^(US|USA|United States)-\S/.test(s);
  const parts = (bare ? s.split('-') : s.split(/,|\s+-\s+/)).map((p) => p.trim()).filter((p) => p && !/^(multiple|various|several|\d+) locations?$/i.test(p));
  if (!parts.length) return null;
  // "City, Region, CC, postcode": the third part is the country, whatever state shares its letters.
  if (parts.length >= 3 && !US.test(parts[0]) && /^[A-Z]{2}$/.test(parts[2]) && !US.test(parts[2]) && !STATE_BY_NAME.has(parts[1].toLowerCase()) && !STATE_CODES.has(parts[1])) return null;
  if (parts.some((p) => ABROAD.has(p.toLowerCase()) && !STATE_CODES.has(p))) return null;
  const usAt = parts.findIndex((p) => US.test(p));
  const rest = parts.filter((p, i) => i !== usAt && !/^\d[\d -]*$/.test(p) && !/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(p));
  let stateAt = rest.findIndex((p) => STATE_BY_NAME.has(p.toLowerCase()));
  // "Washington, District of Columbia": the city has a state's name; the state is the later part.
  if (stateAt === 0 && rest.length > 1 && (STATE_BY_NAME.has(rest[1].toLowerCase()) || STATE_CODES.has(rest[1]))) stateAt = 1;
  if (stateAt < 0) stateAt = rest.findIndex((p, i) => STATE_CODES.has(p) && (i > 0 || rest.length > 1));
  if (stateAt < 0) return null;
  const state = STATE_BY_NAME.get(rest[stateAt].toLowerCase()) ?? rest[stateAt];
  // The city stands before its state ("Austin, TX") or, in a feed that leads with the country, after it.
  // A state written twice ("Waterloo, IA, Iowa, US") is still one state.
  const isState = (p) => STATE_CODES.has(p) || STATE_BY_NAME.has(p.toLowerCase());
  const before = rest.slice(0, stateAt).filter((p) => !isState(p) || /^(washington|new york)$/i.test(p));
  const city = before.length ? before[before.length - 1] : rest.slice(stateAt + 1).find((p) => !isState(p));
  if (!city || STATE_BY_NAME.has(city.toLowerCase()) && city.toLowerCase() !== 'washington' && city.toLowerCase() !== 'new york') return null;
  if (/^\d|^(fab|bldg|building|site|plant)\b/i.test(city)) return null;
  return { city: tidyCity(city), state };
}

/** Every US place the posting names as where the work is. */
export function readPlaces(location, title, lines) {
  const out = [];
  const seen = new Set();
  const add = (p) => { if (!p) return; const k = `${p.city.toLowerCase()}|${p.state}`; if (!seen.has(k)) { seen.add(k); out.push(p); } };
  const field = String(location ?? '').trim();
  if (field) {
    for (const part of field.split(/\s*;\s*|\s+\|\s+|\s+or\s+(?=[A-Z])|\s\/\s/)) add(onePlace(part));
    return out;
  }
  // No field: the title's brackets, then the opening lines.
  const text = [String(title ?? ''), ...lines().slice(0, 6).map((l) => l.text)].join(' \n ');
  const re = /\b([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){0,2}), ([A-Z]{2})\b/g;
  let m;
  while ((m = re.exec(text)) && out.length < 3) if (STATE_CODES.has(m[2])) add({ city: m[1], state: m[2] });
  return out;
}

// --- Requirements --------------------------------------------------------------

const NUMBER_WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15 };
const NUM = String.raw`(\d{1,2}(?:\.\d)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen)`;
const YEARS_RANGE = new RegExp(String.raw`\b${NUM}\s*\+?\s*(?:-|–|—|to)\s*${NUM}\s*\+?\s*(?:\(\d+\)\s*)?(years?|yrs?)\b`, 'i');
const YEARS_ONE = new RegExp(String.raw`\b${NUM}\s*(?:\(\d+\)\s*)?(\+|plus|or more)?\s*(years?|yrs?|months?)\b`, 'i');
const num = (s) => NUMBER_WORD[s.toLowerCase()] ?? Number(s);

function yearsIn(text) {
  if (/years? of age|years old|\bage\b|anniversar|years? ago|over the (last|past)|within \d|every \d|\d+ years of (service|history)|for (over|more than) \d+ years|spanning|history|since (19|20)\d\d/i.test(text)) return null;
  if (!/experience|exp\b|background|track record|working (as|in|with)|in a (similar|related)|professional|hands-on|performing|\byears? (in|as|of)\b/i.test(text)) return null;
  // "a diploma or 2 years of experience" is another way to meet the schooling, not the experience asked.
  let t = text.replace(/(diploma|degree|ged|g\.e\.d\.?|certificate)[^.;]{0,40}?\bor\s+(an additional\s+)?\d{1,2}\+?\s*years?[^.;]*?(experience|work)/gi, ' ');
  const r = t.match(YEARS_RANGE);
  if (r) return { min: num(r[1]), max: num(r[2]) };
  const o = t.match(YEARS_ONE);
  if (!o) return null;
  const months = /^month/i.test(o[3]);
  const v = months ? Math.round((num(o[1]) / 12) * 10) / 10 : num(o[1]);
  return v > 40 ? null : { min: v, max: null };
}

const EDUCATION = [
  ['doctorate', /\bph\.?\s?d\b|doctorate|doctoral/i],
  ['master', /\bmaster(?:'|’)?s?\b(?! (electrician|plumber|mechanic|technician|schedul\w*|data|production|planner|plan|of ceremonies))|\bm\.s\.|\bMS (degree|in)\b|\bBS\/MS\b|\bmsc\b|\bMBA\b|\bMSEE\b|\bMSME\b|graduate degree|advanced degree/i],
  ['bachelor', /\bbachelor(?:'|’)?s?\b|\bb\.s\.|\bb\.a\.|\bBS\b(?=[ /,](degree|in|or|\/|MS|BA|\w+ engineering))|\bBS\b(?=\s*[,/]\s*(?:M\.?\s?Eng|M\.?S\b|B\.?A\b|Ph\.?\s?D))|\bBS(EE|ME|ET|CS|EET|MET)\b|\bbsc\b|undergraduate degree|(4|four)[- ]year (college |university )?degree|(college|university|engineering) degree|degree in (an? )?(engineering|mechanical|electrical|aerospace|industrial|manufacturing|materials|chemical|computer|physics|chemistry|a technical|a related|technical|related|science|stem)|engineering degree/i],
  ['associate', /\bassociate(?:'|’)?s?(?:'|’)? (degree|of|in)\b|\bassociate(?:'|’)?s?(?:'|’)?\s*(?:or|\/)\s*bachelor|\bassociates?(?:'|’)?s? degree|\bA\.?A\.?S\.?\b(?= |,|\.)|\bAS(EET|ET)\b|(2|two)[- ]year (college |technical )?degree/i],
  ['certificate', /trade school|technical (school|training|certificate|certification|diploma|degree)|vocational|certificate (program|of completion)|completed apprenticeship|apprenticeship (program|completion|certificate)|journey(man|person)(?:'|’)?s? (card|certificate|status)/i],
  ['high school', /high school|\bGED\b|\bG\.E\.D|secondary (school|education)|\bHS diploma|equivalency certificate/i],
];
const EDU_RANK = ['high school', 'certificate', 'associate', 'bachelor', 'master', 'doctorate'];

// What a line asks for, without what it only wishes for: "Bachelor's degree
// required; Master's preferred" asks for a bachelor's, and "Secret clearance
// preferred" asks for none. A clause that says both is one that asks.
const WISHED = /\b(preferred|preferably|desired|desirable|nice to have|ideally|an? (?:big |strong |definite )?plus|is a plus|are a plus|bonus)\b/i;
const ASKED = /\b(required|requires?|must|minimum|at least|mandatory)\b/i;
function asked(text) {
  if (!WISHED.test(text)) return text;
  return text.split(/;|\.\s+|\s[–—]\s/).filter((clause) => !WISHED.test(clause) || ASKED.test(clause)).join('; ');
}

function educationIn(texts) {
  let least = null;
  for (const text of texts) for (const [level, re] of EDUCATION) if (re.test(text)) { if (least === null || EDU_RANK.indexOf(level) < EDU_RANK.indexOf(least)) least = level; }
  return least;
}

const CERT_WORD = /certif|licen[sc]e|credential|qualified to|card\b/i;
function certificationsIn(text, out) {
  const add = (c) => { if (!out.includes(c)) out.push(c); };
  let m;
  const aws = /\bAWS\s*D\s?(\d{1,2}\.\d)\b|\bD(17\.1|1\.[1-9]|9\.1)\b(?=.{0,40}(weld|certif))/gi;
  while ((m = aws.exec(text))) add(`AWS D${m[1] ?? m[2]}`);
  if (/\bA\s?&\s?P\b|\bairframe\b[^.]{0,20}\bpower ?plant\b/i.test(text)) add('A&P');
  if (CERT_WORD.test(text)) {
    if (/J-?STD-?001/i.test(text)) add('IPC J-STD-001');
    if (/IPC[- ]?A[- ]?610|\bA-610\b/i.test(text)) add('IPC-A-610');
    if (/7711\s*\/\s*7721|IPC[- ]?7711|IPC[- ]?7721/i.test(text)) add('IPC-7711/7721');
    if (/WHMA[- ]?A[- ]?620|IPC[- ]?A?[- ]?620\b|\bA-620\b/i.test(text)) add('IPC/WHMA-A-620');
    if (/forklift/i.test(text) && /forklift[^.,;]{0,25}(certif|licen)|(certif|licen)[^.,;]{0,25}forklift/i.test(text)) add('Forklift');
    if (/\bPMP\b/.test(text)) add('PMP');
    if (/\bEPA\s?(608|609)\b/i.test(text)) add(`EPA ${text.match(/\bEPA\s?(608|609)\b/i)[1]}`);
    if (/\bNIMS\b/.test(text)) add('NIMS');
    if (/\bCQE\b/.test(text)) add('ASQ CQE');
    if (/\bCQA\b/.test(text)) add('ASQ CQA');
    if (/\bCQT\b/.test(text)) add('ASQ CQT');
  }
  const ndt = text.match(/(?:\bNDT\b|\bNDE\b|\bASNT\b|NAS[- ]?410|SNT-TC-1A|non-?destructive)[^.]{0,90}?\blevel\s*(III|II|I|[123])\b|\blevel\s*(III|II|I|[123])\b[^.]{0,70}?(?:\bNDT\b|\bNDE\b|\bASNT\b|NAS[- ]?410|non-?destructive)/i);
  if (ndt) { const l = (ndt[1] ?? ndt[2]).toUpperCase(); add(`NDT Level ${{ 1: 'I', 2: 'II', 3: 'III' }[l] ?? l}`); }
  const belt = /\b(green|black|yellow)[- ]belt\b/gi;
  while ((m = belt.exec(text))) add(`Six Sigma ${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} Belt`);
  if (/\bCWI\b|certified welding inspector/i.test(text)) add('CWI');
  if (/\bOSHA[- ]?(10|30)\b/i.test(text)) add(`OSHA ${text.match(/\bOSHA[- ]?(10|30)\b/i)[1]}`);
  if (/\bFAA\b[^.]{0,30}\b(repairman|inspection authorization|part 107)\b/i.test(text)) add(`FAA ${text.match(/\bFAA\b[^.]{0,30}\b(repairman|inspection authorization|part 107)\b/i)[1].replace(/\b[a-z]/g, (x) => x.toUpperCase())}`);
}

const CLEARANCES = [['TS/SCI', /\bTS\s?\/\s?SCI\b|top secret\s?\/\s?sci|\bSCI\b eligib/i], ['Top Secret', /\btop secret\b|\bTS\b(?= clearance)/i], ['Secret', /\bsecret\b/i], ['Confidential', /\bconfidential\b/i], ['Public Trust', /\bpublic trust\b/i]];
function clearanceIn(text) {
  const stated = text.match(/CLEARANCE TYPE:\s*([A-Za-z/ ]+?)(?=\s{2}|$|\s+[A-Z]{3,}|\bTRAVEL)|DoD Clearance:\s*([A-Za-z/ ]+)/);
  const scope = stated ? (stated[1] ?? stated[2]) : /clearance/i.test(text) ? text : null;
  if (!scope) return null;
  if (stated && /^\s*(none|n\/a|no)\b/i.test(scope)) return null;
  for (const [name, re] of CLEARANCES) {
    const m = scope.match(re);
    if (!m) continue;
    if (stated) return name;
    // The word has to stand by "clearance": "confidential information" is not one.
    const at = m.index;
    const near = scope.slice(Math.max(0, at - 60), at + m[0].length + 60);
    if (/clearance/i.test(near)) return name;
  }
  return null;
}

function citizenshipIn(text) {
  if (/without regard to|non-discriminatory|regardless of/i.test(text)) return null;
  // The export rules' list (citizen, national, permanent resident, refugee, asylee) is a U.S. person.
  const person = /\bu\.?s\.? persons?\b|[“"']us person[”"']|lawful(ly)?,? (u\.?s\.? )?permanent|permanent resident|green card|refugee|asylee|\bitar\b|international traffic in arms|export[- ]control|export regulations/i.test(text);
  if (person) return 'U.S. person';
  if (/\bu\.?s\.? citizen(ship)?\b/i.test(text) && /(must|required|requires|only|need)/i.test(text)) return 'U.S. citizen';
  return null;
}

function shiftIn(text) {
  const kinds = new Set();
  const re = /\b(1st|first|day|days|2nd|second|swing|evening|afternoon|3rd|third|night|nights|graveyard|weekend|rotating)[- ]shift\b|\bshift:\s*(days?|nights?|swing|weekends?|rotating|1st|2nd|3rd)\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const w = (m[1] ?? m[2]).toLowerCase();
    kinds.add(/1st|first|day/.test(w) ? 'day' : /2nd|second|swing|evening|afternoon/.test(w) ? 'swing' : /3rd|third|night|graveyard/.test(w) ? 'night' : /weekend/.test(w) ? 'weekend' : 'rotating');
  }
  // "1st or 2nd shift", "first and second shifts": the first of the pair is a shift too.
  const pair = /\b(1st|first|2nd|second|3rd|third|day|night|swing)\s*(?:or|and|&|\/|,)\s*(?:1st|first|2nd|second|3rd|third|day|night|swing)[- ]shifts?\b/gi;
  while ((m = pair.exec(text))) {
    const w = m[1].toLowerCase();
    kinds.add(/1st|first|day/.test(w) ? 'day' : /2nd|second|swing/.test(w) ? 'swing' : 'night');
  }
  if (!kinds.size) return null;
  if (kinds.has('rotating')) return 'rotating';
  // A posting that offers several shifts names none in particular.
  return kinds.size === 1 ? [...kinds][0] : null;
}

export function readRequirements(posting, lines, titleShift) {
  const req = { yearsMin: null, yearsMax: null, education: null, certifications: [], clearance: null, citizenship: null, shift: titleShift ?? null, employmentType: null };
  const body = lines.filter((l) => !l.heading);
  const required = body.filter((l) => l.kind === 'required');
  const open = body.filter((l) => l.kind === 'intro' || l.kind === 'duties' || l.kind === 'other' || l.kind === 'physical');
  const preferred = body.filter((l) => l.kind === 'preferred');

  for (const group of [required, open, preferred]) {
    let got = null;
    let either = false;
    for (const l of group) {
      // "Must have at least one of the following: a diploma / a certificate / 3 years of work":
      // the lines under it are ways to meet one requirement, not the experience asked.
      if (/one of the following/i.test(l.text)) { either = true; continue; }
      if (either && l.text.length < 70 && !/^must\b/i.test(l.text)) continue;
      either = false;
      got = yearsIn(l.text);
      if (got) break;
    }
    if (got) { req.yearsMin = got.min; req.yearsMax = got.max; break; }
  }
  req.education = educationIn(required.map((l) => asked(l.text))) ?? educationIn(open.filter((l) => l.kind !== 'duties').map((l) => asked(l.text)));
  // A certificate or a clearance on a line of what is preferred is not one the job asks for,
  // unless the line itself says it must be had.
  const insisted = preferred.filter((l) => ASKED.test(l.text));
  for (const l of [...required, ...insisted, ...open]) certificationsIn(asked(l.text), req.certifications);

  const title = String(posting.title ?? '');
  req.clearance = clearanceIn(title);
  for (const l of body) {
    if (req.clearance) break;
    if (l.kind === 'benefits' || (l.kind === 'preferred' && !ASKED.test(l.text))) continue;
    req.clearance = clearanceIn(asked(l.text));
  }
  const everything = [title, ...body.filter((l) => l.kind !== 'benefits').map((l) => l.text)];
  for (const text of everything) {
    const c = citizenshipIn(text);
    if (c === 'U.S. citizen') req.citizenship = c;
    else if (c && !req.citizenship) req.citizenship = c;
  }
  if (!req.shift) for (const l of body) if (l.kind !== 'benefits' && l.kind !== 'legal' && !/all shifts|any shift|various shifts|shift differential|as needed|occasional/i.test(l.text)) { req.shift = shiftIn(l.text); if (req.shift) break; }

  if (/\bintern(ship)?\b|\bco-?op\b/i.test(title)) req.employmentType = 'intern';
  else if (/\btemporary\b|\btemp\b/i.test(title)) req.employmentType = 'temporary';
  else if (/\bpart[- ]time\b/i.test(title)) req.employmentType = 'part-time';
  else if (/\bcontract(or)?\b|\bcontingent\b|^CW\b/i.test(title)) req.employmentType = 'contract';
  else if (/\bfull[- ]time\b/i.test(title)) req.employmentType = 'full-time';
  else {
    for (const l of body) {
      if (l.kind === 'benefits' || l.kind === 'legal') continue;
      const t = l.text;
      if (/\bfull[- ]?time\b/i.test(t) && !/part[- ]?time/i.test(t)) { req.employmentType = 'full-time'; break; }
      if (/^part[- ]?time$|\bthis is a part[- ]time\b|employment type:\s*part/i.test(t)) { req.employmentType = 'part-time'; break; }
      if (/\bthis is a temporary\b|\btemporary (position|role|assignment)\b/i.test(t)) { req.employmentType = 'temporary'; break; }
    }
  }
  return req;
}

// --- Pay -----------------------------------------------------------------------

const MONEY = String.raw`\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(k\b)?`;
const RANGE = new RegExp(String.raw`(?:USD\s?)?${MONEY}\s*(?:USD)?\s*(?:\/\s?(?:hr|hour|yr|year)|per (?:hour|year)|an hour|hourly|annually)?\s*(?:-|–|—|to|and)\s*(?:USD\s?)?\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(k\b)?`, 'gi');
const BARE_RANGE = /\bUSD\s?(\d{1,3}(?:,\d{3})+)\s*(?:-|–|—|to)\s*(\d{1,3}(?:,\d{3})+)/gi;
const SINGLE = new RegExp(MONEY, 'gi');
const money = (digits, k) => Number(digits.replace(/,/g, '')) * (k ? 1000 : 1);
const LEVEL_IN_LABEL = /\b(?:level|grade|lvl|tier)\s*([1-9]|i{1,3}|iv|v)\b/i;
const WORD_IN_LABEL = /\b(entry|junior|associate|senior|sr|staff|principal|lead|experienced|consultant|mid)\b/i;
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

function periodOf(text, max) {
  if (/\b(hour|hr|hourly)\b|\/\s?hr|per-hour/i.test(text)) return 'hour';
  if (/\b(year|yr|annual|annually|salary|per annum)\b/i.test(text) && max >= 1000) return 'year';
  if (max < 500) return 'hour';
  if (max >= 10000) return 'year';
  return null;
}

/** The band the posting states, in dollars; where it states one per level, the title's level picks. */
export function readPay(lines, level) {
  const bands = [];
  for (const l of lines) {
    const text = l.text;
    if (!/\$|USD/.test(text) || /\b(CAD|NZD|AUD|EUR|GBP|MXN|SGD|INR)\b|[€£]/.test(text)) continue;
    const found = [];
    let m;
    RANGE.lastIndex = 0;
    while ((m = RANGE.exec(text))) found.push({ min: money(m[1], m[2]), max: money(m[3], m[4] ?? (m[2] && Number(m[3].replace(/,/g, '')) < 1000 ? 'k' : '')), at: m.index, end: m.index + m[0].length });
    BARE_RANGE.lastIndex = 0;
    if (!found.length) while ((m = BARE_RANGE.exec(text))) found.push({ min: money(m[1]), max: money(m[2]), at: m.index, end: m.index + m[0].length });
    // One figure is a band of one where the line is about pay, or gives a level its rate ("Level II: $27/hr").
    const rated = LEVEL_IN_LABEL.test(text) && /\/\s?(hr|hour)\b|per hour|an hour|hourly/i.test(text);
    if (!found.length && (rated || /\b(pay|wage|rate|salary|compensation|starting)\b/i.test(text)) && !/tax credit|bonus|stipend|reimburse|relocation|401|tuition|referral/i.test(text)) {
      SINGLE.lastIndex = 0;
      const singles = [];
      while ((m = SINGLE.exec(text))) singles.push({ v: money(m[1], m[2]), at: m.index, end: m.index + m[0].length });
      const distinct = [...new Set(singles.map((s) => s.v))];
      // "Pay: $33.32/hour, with potential to earn up to $61.01/hour" is a band; a lone rate is a band of one.
      if (distinct.length === 2 && /up to|maximum|top (rate|out)/i.test(text)) found.push({ min: Math.min(...distinct), max: Math.max(...distinct), at: singles[0].at, end: singles[singles.length - 1].end });
      else if (distinct.length === 1) found.push({ min: distinct[0], max: distinct[0], at: singles[0].at, end: singles[0].end });
    }
    let from = 0;
    for (const f of found) {
      if (!(f.max >= f.min)) continue;
      const period = periodOf(text, f.max);
      if (!period) continue;
      // A wage under the federal floor, or a salary no one is paid, is a placeholder.
      if (period === 'hour' ? f.min < 7.25 || f.max > 500 : f.min < 15000 || f.max > 2000000) continue;
      const label = text.slice(from, f.at);
      from = f.end;
      const lv = label.match(LEVEL_IN_LABEL);
      const word = label.match(WORD_IN_LABEL);
      bands.push({ min: f.min, max: f.max, period, n: lv ? (ROMAN[lv[1].toLowerCase()] ?? Number(lv[1])) : null, word: word ? word[1].toLowerCase().replace(/^sr$/, 'senior') : null });
    }
  }
  if (!bands.length) return null;
  const distinct = [];
  for (const b of bands) if (!distinct.some((d) => d.min === b.min && d.max === b.max && d.period === b.period)) distinct.push(b);
  const out = (b) => ({ min: b.min, max: b.max, period: b.period });
  if (distinct.length === 1) return out(distinct[0]);
  const labelled = distinct.filter((b) => b.n !== null || b.word);
  if (level) {
    const n = { I: 1, II: 2, III: 3, IV: 4, V: 5 }[level.word];
    const byNumber = n ? distinct.filter((b) => b.n === n) : [];
    if (byNumber.length === 1) return out(byNumber[0]);
    const byWord = distinct.filter((b) => b.word === level.word.toLowerCase());
    if (byWord.length === 1) return out(byWord[0]);
  } else {
    // No level in the title: the band that names none is the job's own.
    const plain = distinct.filter((b) => b.n === null && !b.word);
    if (plain.length === 1 && labelled.length) return out(plain[0]);
  }
  if (labelled.length >= 2 && labelled.every((b) => b.period === labelled[0].period)) {
    return { min: Math.min(...labelled.map((b) => b.min)), max: Math.max(...labelled.map((b) => b.max)), period: labelled[0].period };
  }
  return out(distinct[0]);
}
