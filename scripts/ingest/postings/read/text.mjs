// The words of a posting: its text as lines, each line knowing which part of the
// posting it is in, and the two ways words are compared (whole words for names,
// squashed letters for terms that are written with and without a space or hyphen).
//
// A posting arrives as HTML (Greenhouse, Workday, Lever), as plain text with line
// breaks, or as one unbroken paragraph (iCIMS). All three become the same thing here.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bull: '•', middot: '·', hellip: '…', deg: '°', reg: '', trade: '', copy: '' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
    }
    const known = ENTITIES[name.toLowerCase()];
    return known === undefined ? whole : known;
  });
}

/** HTML or plain text as plain text: list items as "- " lines, blocks as line breaks. */
export function plainText(text) {
  let s = String(text ?? '');
  // Greenhouse escapes its HTML once more, so tags only appear after a first decode.
  if (/&lt;\/?[a-z][^&]*&gt;/i.test(s)) s = decodeEntities(s);
  if (/<\/?[a-z][^>]*>/i.test(s)) {
    s = s
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\s*li\b[^>]*>/gi, '\n- ')
      .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/ul|\/ol|\/tr|p|div|h[1-6]|ul|ol|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
  }
  return decodeEntities(s).replace(/[  -​ ﻿]/g, ' ').replace(/[ \t\f\v]+/g, ' ');
}

// What a heading announces. The order matters: a line is the first kind it matches.
const HEADINGS = [
  ['duties', /^about (the|this) (role|job|position|opportunity)\b|^(the|your) role\b/i],
  ['required', /^about you\b|^who you are\b/i],
  ['legal', /equal (employment )?opportunity|\beeo\b|\bitar\b|export (control|regulation|compliance)|accommodation|privacy|disclaimer|e-verify|fraud|notice to|drug[- ]free|background check|u\.?s\.? citizen|immigration/i],
  ['benefits', /benefit|perks|compensation|what we offer|we offer|what.s in it for you|total rewards|pay (range|disclosure|transparency|rate)|salary|why (join|work|you.ll|us|choose)|what you.ll (get|receive)\b(?! to do)|our offer|rewards|relocation|travel requirements?/i],
  ['about', /^about\b|who we are|our (mission|story|values|culture|team|company|commitment)|company (overview|description|profile)|^the team$|team overview|organization impact|business group|life at|how we work|working at|^company:?$|^introduction/i],
  ['physical', /physical|work(ing)? (environment|conditions)|additional requirements|environmental conditions|work schedule|schedule|shift|location|travel/i],
  ['preferred', /preferred|nice to have|nice-to-have|bonus|desired|a plus\b|stand out|sets you apart|separates|additional qualifications|extra credit|ideal(ly)?\b/i],
  ['required', /qualif|require|skills|experience|what you.ll (bring|need)|what you (bring|need)|what you will (bring|need)|you have|you.ll have|who you are|must[- ]haves?|minimum|basic|education|knowledge|abilities|competenc|looking for|about you|your (background|profile)|credential|certif|licens|to be successful|you might be|what we need/i],
  ['duties', /responsib|dut(y|ies)|what you.ll (do|get to do|be doing|work on|own)|what you will (do|be doing)|what you do|the role|the (job|position|opportunity)|job (summary|description|purpose|overview)|position (summary|overview|description|purpose)|role (summary|overview|description)|^summary|overview|essential (job )?functions|accountabilities|in this role|your (role|impact|mission|work|day)|scope|a day in|you will|you.ll|typical day|how you.ll|key (tasks|activities)|main tasks|what to expect|impact/i],
];

function headingKind(line) {
  const l = line.replace(/^[#*\s]+|[*\s:]+$/g, '');
  if (!l || l.length > 80 || /[.;!?]$/.test(line.trim())) return null;
  const words = l.split(/\s+/);
  if (words.length > 9) return null;
  const shout = l === l.toUpperCase() && /[A-Z]{3}/.test(l);
  const colon = /:\s*\**$/.test(line);
  const titled = /^[A-Z]/.test(l) && words.length <= 6;
  if (!shout && !colon && !titled) return null;
  for (const [kind, re] of HEADINGS) if (re.test(l)) return kind;
  return shout || colon ? 'other' : null;
}

// Headings that sit inside an unbroken paragraph. They are only looked for in a
// line long enough to be a whole posting pressed flat.
const INLINE_HEADING = /(?<=[.!?:)”"]\s|^|\s{2})((?:Role|Job|Position) Summary|Summary|Responsibilities|Essential Job Functions|Essential Functions|Qualifications|Requirements|Required|Preferred|Overview|Pay Disclosure|Benefits(?: & Perks)?|Education|Experience|Skills|What You.ll (?:Do|Bring|Get To Do|Need)|What You Will (?:Do|Bring)|Preferred Qualifications|Basic Qualifications|Minimum Qualifications|Required Qualifications|Equal Opportunity|Who We Are|About (?:Us|Rivian|the Role|The Role)|Physical Requirements|Work Environment|Additional Information|Competencies|Knowledge, Skills(?:,? and Abilities)?)(?=:?\s+[A-Z•●·(0-9-])/g;

function breakBlob(line) {
  const out = [];
  const parts = line.replace(INLINE_HEADING, '\n$1:\n').replace(/\s[•●·▪◦]\s/g, '\n- ').split('\n');
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    if (t.length < 320) { out.push(t); continue; }
    for (const sentence of t.split(/(?<=[a-z0-9)%][.!?])\s+(?=[A-Z0-9(])/)) if (sentence.trim()) out.push(sentence.trim());
  }
  return out;
}

/**
 * The posting as lines: { text, kind, bullet }. kind is the part of the posting
 * the line stands in: 'intro' (before any heading), 'duties', 'required',
 * 'preferred', 'physical', 'about', 'benefits', 'legal', 'other'.
 */
export function readLines(text) {
  const raw = [];
  for (const piece of plainText(text).split(/\r?\n/)) {
    const l = piece.replace(/\s+/g, ' ').trim();
    if (!l) continue;
    if (l.length >= 500) raw.push(...breakBlob(l)); else raw.push(l);
  }
  const lines = [];
  let kind = 'intro';
  for (const l of raw) {
    const bullet = /^[-•●·▪◦*]\s*/.test(l);
    const body = bullet ? l.replace(/^[-•●·▪◦*]\s*/, '') : l;
    if (!body) continue;
    const h = bullet ? null : headingKind(l);
    if (h) { kind = h; lines.push({ text: body, kind, bullet: false, heading: true }); continue; }
    lines.push({ text: body, kind: sentenceKind(body, kind), bullet, heading: false });
  }
  return lines;
}

// A sentence can say what it is whatever heading it stands under: the equal
// opportunity paragraph, the benefits list, the company's boilerplate.
const LEGAL_SENTENCE = /equal opportunity|without regard to|reasonable accommodation|affirmative action|protected veteran|e-verify|export (control|regulations)|international traffic in arms|\bitar\b|8 u\.s\.c|22 c\.f\.r|drug[- ]free|background check/i;
const BENEFIT_SENTENCE = /401\(?k\)?|medical, (dental|vision)|dental,? (and )?vision|paid (time off|vacation|holidays|parental|sick)|\bpto\b|health insurance|life insurance|stock (options|purchase)|equity (grants|awards)|tuition|employee assistance|wellness program|total (rewards|compensation) package|base salary|salary range|pay range|compensation (will|is|range)|bonus(es)?\b.*eligible|eligible for .*bonus/i;
function sentenceKind(text, kind) {
  if (LEGAL_SENTENCE.test(text)) return 'legal';
  if (BENEFIT_SENTENCE.test(text)) return 'benefits';
  return kind;
}

// --- Words ---------------------------------------------------------------------

/** A word as it is compared: lower case, without its plural or its -ing / -ed. */
export function stem(word) {
  let w = word.toLowerCase();
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/(sses|xes|ches|shes|zes)$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = undouble(w.slice(0, -3));
  else if (w.length > 4 && w.endsWith('ed') && !w.endsWith('eed')) w = undouble(w.slice(0, -2));
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}
function undouble(w) {
  const n = w.length;
  return n > 3 && w[n - 1] === w[n - 2] && !/[lsfaeiou]/.test(w[n - 1]) ? w.slice(0, -1) : w;
}

// "gage" and "gauge", "preventative" and "preventive" are one word each.
const SPELLING = { gage: 'gauge', gaug: 'gauge', gag: 'gauge', preventativ: 'preventiv', preventative: 'preventiv', mould: 'mold', aluminium: 'aluminum', colour: 'color', nde: 'ndt', hipot: 'hipot', xray: 'xray', programme: 'program', judgement: 'judgment' };

/**
 * A line as squashed letters: its words stemmed and run together, with where each
 * word starts and ends. "lock-out / tag out" and "Lockout Tagout" squash alike.
 */
export function squash(text) {
  const words = [];
  const re = /[A-Za-z0-9]+(?:[&+#][A-Za-z0-9]+)*[+#]*/g;
  let m;
  let s = '';
  const starts = [];
  const ends = [];
  let last = 0;
  while ((m = re.exec(text))) {
    let w = stem(m[0].replace(/[&]/g, 'n'));
    w = SPELLING[w] ?? w;
    // A comma, a stop or a bracket before a word: no term runs across it.
    words.push({ raw: m[0], at: m.index, cut: /[,;:.!?()[\]]/.test(text.slice(last, m.index)) });
    last = m.index + m[0].length;
    // "wave/selective soldering" and "Wave and Selective Soldering" are the same words.
    if (w === 'and') { starts.push(s.length); ends.push(-1); continue; }
    starts.push(s.length);
    s += w;
    ends.push(s.length);
  }
  return { s, starts, ends, words };
}

/** A term squashed the same way, for looking up in a squashed line. */
export function squashTerm(term) { return squash(term).s; }

export function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
