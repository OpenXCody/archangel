// The decision: is this posting one of the careers, and which. The title proposes
// (career.mjs); the department and the text's own words can refuse; where the title
// could be two careers, the one whose path's skills the text names is taken, and
// where that is even the answer is null.
import { readCareerTitle, initialismOption, saysNothing, SAYS_NOTHING } from './career.mjs';
import { assign } from './skills.mjs';

// Departments none of the careers work in, and ones whose engineers are not ours
// unless the text speaks of hardware.
const OFFICE = /\b(finance|accounting|legal|people|talent|recruit\w*|human resources|hr|sales|marketing|business development|(corporate|internal|public) communications|customer (service|success|support|experience)|real estate|food services?|security|information technology|it)\b/i;
// An internships department also lists the first jobs of new graduates, which are jobs.
const INTERNS = /\bintern(ship)?s?\b|\bco-?ops?\b/i;
const FIRST_JOB = /\b(early careers?|new grad\w*|new college graduate|recent graduate)\b/i;
const SOFTWARE = /software|firmware|\bdata (platform|engineering|science)\b|cyber|\bAI\b|\bML\b|autonom|perception|\bGNC\b|simulation|\bcloud\b|network engineering|site reliability|digital/i;
const SOFTWARE_WORDS = /\b(kubernetes|docker|microservices?|ci\/cd|back[- ]?end|front[- ]?end|full[- ]stack|distributed systems|rest(?:ful)? apis?|graphql|react|typescript|javascript|node\.js|golang|c\+\+|c#|kotlin|django|flask|terraform|ansible|aws|gcp|azure|cloud (?:infrastructure|platforms?|services)|llms?|machine learning|deep learning|neural networks?|pytorch|tensorflow|data pipelines?|software development|sdlc|agile|scrum|unit tests?|code reviews?|git|github|gitlab|pull requests?|devops|observability|web applications?|mobile apps?|firmware|rtos|embedded software|software engineering|computer science|linux|algorithms?|compilers?|databases?)\b/gi;

function softwareWords(asking) {
  const seen = new Set();
  for (const l of asking) { let m; SOFTWARE_WORDS.lastIndex = 0; while ((m = SOFTWARE_WORDS.exec(l.text))) seen.add(m[1].toLowerCase()); }
  return seen.size;
}

/** { career: { title, how, matched } | null, level, shift, why } */
export function decideCareer(posting, text, vocab) {
  const t = readCareerTitle(posting, vocab);
  const none = (why) => ({ career: null, level: null, shift: t.shift, why });
  let options = t.options;
  if (!options.length && !t.refused) {
    const spelled = initialismOption(t, text, vocab);
    if (spelled) options = [spelled];
  }
  if (!options.length) return none(t.refused ?? 'the title is not a career');

  const department = String(posting.department ?? '');
  if (OFFICE.test(department) || (INTERNS.test(department) && !FIRST_JOB.test(String(posting.title ?? '')))) return none(`department "${department.trim()}"`);
  const { asking, found } = text();

  // What the text names of each career's path. A code that could be several skills
  // ("PLC") is read with the career's path in hand, so each career is asked in turn.
  const pathOf = (career) => vocab.careers.get(career).path;
  const namedFor = new Map();
  const named = (career) => {
    if (!namedFor.has(career)) namedFor.set(career, new Set(assign(found, asking, vocab, pathOf(career)).skills.map((s) => s.name)));
    return namedFor.get(career);
  };
  const hits = (career, not = []) => {
    const others = new Set(not.flatMap(pathOf));
    const has = named(career);
    return pathOf(career).filter((s) => has.has(s) && !others.has(s)).length;
  };

  let pick = null;
  const real = options.filter((o) => !o.yields);
  if (real.length === 1) {
    pick = real[0];
    // "Automation & Controls Engineer": the last named is the job unless the text is plainly the other's.
    const other = options.find((o) => o.yields);
    if (other && hits(other.career, [pick.career]) >= 2 && hits(pick.career, [other.career]) === 0) pick = other;
  } else {
    // Two careers could both be meant: the one whose path's skills the text names,
    // and where that is even, neither.
    const scored = real.map((o) => ({ o, n: hits(o.career, real.filter((x) => x !== o).map((x) => x.career)) })).sort((a, b) => b.n - a.n);
    if (scored[0].n >= 2 && scored[0].n > scored[1].n) pick = scored[0].o;
    else return none(`could be ${real.map((o) => o.career).join(' or ')}`);
  }

  const onPath = hits(pick.career);
  // As evidence, a skill half the careers share counts half, for a career that has
  // skills of its own to be known by.
  const career = vocab.careers.get(pick.career);
  const has = named(pick.career);
  const weight = career.weighs ? career.path.reduce((sum, s) => sum + (has.has(s) ? (career.telling.has(s) ? 1 : 0.5) : 0), 0) : onPath;
  const need = evidenceNeeded(pick, vocab);
  // One skill of the path is one skill, whichever; the weighing is for the names that need more.
  if ((need === 1 ? onPath : weight) < need) return none(`"${pick.matched}" for ${pick.career}, and the text names too little of its path (${weight} where ${need} would make it sure)`);
  if (SOFTWARE.test(department) && onPath < 2) return none(`department "${department.trim()}" and the text names none of the career's skills`);
  if (softwareWords(asking) >= 4 && onPath < 2) return none('the text is a software job\'s');

  // A branch of the same career the text speaks for: "Welder" whose text is all GTAW.
  const baseKey = titleKey(pick.career, vocab);
  const baseWords = baseKey ? baseKey.split(' ') : [];
  if (baseWords.length) {
    let best = null;
    for (const n of vocab.names) {
      if (n.kind !== 'title' || n.career === pick.career || n.words.length <= baseWords.length) continue;
      // The branch's title is this one with a word before or after it, not inside it.
      const at = ` ${n.key} `.indexOf(` ${baseKey} `);
      if (at < 0 || (at !== 0 && at !== n.key.length - baseKey.length)) continue;
      const theirs = hits(n.career, [pick.career]);
      const ours = hits(pick.career, [n.career]);
      if (theirs >= 2 && ours === 0 && (!best || theirs > best.n)) best = { n: theirs, name: n };
      // A branch whose extra word says nothing ("Product Reliability Engineer" beside
      // "Reliability Engineer") shares the bare title: the text has to say which.
      if (n.words.length === baseWords.length + 1 && SAYS_NOTHING.has(n.words.find((w) => !baseWords.includes(w)))) {
        if (theirs > ours && theirs >= 1) best = { n: theirs + 100, name: n };
        else if (!(ours > theirs)) return none(`could be ${pick.career} or ${n.career}`);
      }
    }
    if (best) pick = { career: best.name.career, how: 'close', matched: pick.matched };
  }

  return { career: { title: pick.career, how: pick.how, matched: pick.matched }, level: t.level, shift: t.shift, why: null, onPath };
}

/**
 * How many of the career's path skills the text has to name before a title is
 * taken for it. A career's own title needs none. Another name that says what the
 * work is ("toolmaker", "pipe welder", "NDT inspector") needs none either. One
 * made only of words any job could carry ("manufacturing specialist", "design
 * engineer", "mechanic") needs the text behind it, an engineer's more than a
 * technician's, because an engineer's posting says more.
 */
function evidenceNeeded(pick, vocab) {
  // The career's own title: as it stands, nothing; with words around it, an engineer's
  // is checked against the text ("Power Controls Engineer" is not a plant's controls engineer).
  if (pick.kind === 'title') return pick.how === 'close' && /engineer$/i.test(pick.career) ? 1 : 0;
  const name = vocab.names.find((n) => n.career === pick.career && n.name === pick.matched);
  if (!name) return 1;
  const last = name.words[name.words.length - 1];
  const careerLast = (vocab.names.find((n) => n.kind === 'title' && n.career === pick.career)?.words ?? []).slice(-1)[0];
  const empty = saysNothing(name);
  // "Optics Engineer" filed under a technician's career is one employer's word for it.
  const crossed = last === 'engineer' && careerLast !== 'engineer';
  // A title the product once listed separately and folded in is one employer's or one
  // trade's word; an everyday name ("electrician", "pipe welder") is everyone's.
  if (!empty && !crossed) return name.source === 'was' ? 1 : 0;
  return last === 'engineer' ? 3 : 2;
}

function titleKey(title, vocab) {
  const n = vocab.names.find((x) => x.kind === 'title' && x.career === title);
  return n?.key;
}
