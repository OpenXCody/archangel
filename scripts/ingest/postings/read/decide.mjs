// The decision: is this posting one of the careers, and which. The title proposes
// (career.mjs); the department and the text's own words can refuse; where the title
// could be two careers, the one whose path's skills the text names is taken, and
// where that is even the answer is null.
import { readCareerTitle, initialismOption } from './career.mjs';
import { assign } from './skills.mjs';

// Departments none of the careers work in, and ones whose engineers are not ours
// unless the text speaks of hardware.
const OFFICE = /\b(finance|accounting|legal|people|talent|recruit\w*|human resources|hr|sales|marketing|business development|communications|customer (service|success|support|experience)|real estate|food services?|security|information technology|it|internships?)\b/i;
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
  if (OFFICE.test(department)) return none(`department "${department.trim()}"`);
  const { asking, found } = text();

  // What the text names, before any career is assumed.
  const named = new Set(assign(found, asking, vocab, []).skills.map((s) => s.name));
  const pathOf = (career) => vocab.careers.get(career).path;
  const hits = (career, not = []) => {
    const others = new Set(not.flatMap(pathOf));
    return pathOf(career).filter((s) => named.has(s) && !others.has(s)).length;
  };

  let pick = null;
  if (options.length === 1) pick = options[0];
  else {
    // Two careers could both be meant: the one whose path's skills the text names,
    // and where that is even, neither.
    const scored = options.map((o) => ({ o, n: hits(o.career, options.filter((x) => x !== o).map((x) => x.career)) })).sort((a, b) => b.n - a.n);
    if (scored[0].n >= 2 && scored[0].n > scored[1].n) pick = scored[0].o;
    else return none(`could be ${options.map((o) => o.career).join(' or ')}`);
  }

  const onPath = hits(pick.career);
  // A title that is only another name for a career, or close to one, is taken on
  // the text's word as well: it has to name something the career's path holds.
  const need = evidenceNeeded(pick, vocab);
  if (onPath < need) return none(`"${pick.matched}" for ${pick.career}, and the text names ${onPath} of its skills where ${need} would make it sure`);
  if (SOFTWARE.test(department) && onPath < 2) return none(`department "${department.trim()}" and the text names none of the career's skills`);
  if (softwareWords(asking) >= 4 && onPath < 2) return none('the text is a software job\'s');

  // A branch of the same career the text speaks for: "Welder" whose text is all GTAW.
  const base = vocab.careers.get(pick.career);
  const baseWords = new Set(vocab.byKey.get(titleKey(base.title, vocab))?.words ?? []);
  {
    let best = null;
    for (const n of vocab.names) {
      if (n.kind !== 'title' || n.career === pick.career || n.words.length <= baseWords.size) continue;
      if (![...baseWords].every((w) => n.words.includes(w))) continue;
      const theirs = hits(n.career, [pick.career]);
      const ours = hits(pick.career, [n.career]);
      if (theirs >= 2 && ours === 0 && (!best || theirs > best.n)) best = { n: theirs, name: n };
      // A branch whose extra word says nothing ("Product Reliability Engineer" beside
      // "Reliability Engineer") shares the bare title: the text has to say which.
      if (n.words.length === baseWords.size + 1 && SAYS_NOTHING.has(n.words.find((w) => !baseWords.has(w)))) {
        if (theirs > ours && theirs >= 1) best = { n: theirs + 100, name: n };
        else if (!(ours > theirs)) return none(`could be ${pick.career} or ${n.career}`);
      }
    }
    if (best) pick = { career: best.name.career, how: 'close', matched: pick.matched };
  }

  return { career: { title: pick.career, how: pick.how, matched: pick.matched }, level: t.level, shift: t.shift, why: null, onPath };
}

// Words of a name that do not say what the work is.
const SAYS_NOTHING = new Set(['manufacturing', 'production', 'process', 'product', 'design', 'integration', 'equipment', 'quality', 'test', 'machine', 'general', 'operations', 'systems', 'system', 'assembly', 'line', 'plant', 'factory', 'shop', 'development', 'engineering', 'technical', 'service', 'support', 'project', 'device', 'package', 'source', 'stage', 'sustaining', 'validation', 'compliance', 'final', 'functional', 'industrial', 'maintenance']);
const ANY_JOB = new Set(['engineer', 'technician', 'operator', 'specialist', 'associate', 'worker', 'member', 'mechanic', 'inspector', 'tester', 'analyst', 'laborer', 'installer', 'handler', 'monitor', 'conductor']);

/**
 * How many of the career's path skills the text has to name before a title is
 * taken for it. A career's own title needs none. Another name that says what the
 * work is ("toolmaker", "pipe welder", "NDT inspector") needs none either. One
 * made only of words any job could carry ("manufacturing specialist", "design
 * engineer", "mechanic") needs the text behind it, an engineer's more than a
 * technician's, because an engineer's posting says more.
 */
function evidenceNeeded(pick, vocab) {
  if (pick.kind === 'title') return 0;
  const name = vocab.names.find((n) => n.career === pick.career && n.name === pick.matched);
  if (!name) return 1;
  const last = name.words[name.words.length - 1];
  const careerLast = (vocab.names.find((n) => n.kind === 'title' && n.career === pick.career)?.words ?? []).slice(-1)[0];
  const empty = name.words.every((w, i) => SAYS_NOTHING.has(w) || (i === name.words.length - 1 && ANY_JOB.has(w)));
  // "Optics Engineer" filed under a technician's career is one employer's word for it.
  const crossed = last === 'engineer' && careerLast !== 'engineer';
  if (!empty && !crossed) return 0;
  return last === 'engineer' ? 3 : 2;
}

function titleKey(title, vocab) {
  const n = vocab.names.find((x) => x.kind === 'title' && x.career === title);
  return n?.key;
}
