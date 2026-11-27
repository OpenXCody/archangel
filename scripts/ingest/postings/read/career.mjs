// Which of the careers a posting's title is, if any. The careers and their names
// are the vocabulary's; this decides how a title may be said to be one of them:
// exactly (its title, or another name it goes by), or closely (the name with a
// qualifier before or after it, "technician" for "mechanic"), and when it may not.
import { readTitle, otherField, CHANGES_THE_JOB, LEAVES_IT } from './title.mjs';
import { ROLE_NOUNS, notOursWord, titleWords } from './vocabulary.mjs';

const titleWordsOf = (name) => titleWords(name);

// Words of a name that do not say what the work is, and job words any work could carry.
export const SAYS_NOTHING = new Set(['manufacturing', 'production', 'process', 'product', 'design', 'integration', 'equipment', 'quality', 'test', 'machine', 'general', 'operations', 'systems', 'system', 'assembly', 'line', 'plant', 'factory', 'shop', 'development', 'engineering', 'technical', 'service', 'support', 'project', 'device', 'package', 'source', 'stage', 'sustaining', 'validation', 'compliance', 'final', 'functional', 'industrial']);
export const ANY_JOB = new Set(['engineer', 'technician', 'operator', 'specialist', 'associate', 'worker', 'member', 'mechanic', 'tester', 'analyst', 'laborer', 'installer', 'handler', 'monitor', 'conductor']);
/** A name made only of words any job could carry ("manufacturing specialist", "design engineer"). */
export function saysNothing(name) {
  return name.words.every((w, i) => SAYS_NOTHING.has(w) || (i === name.words.length - 1 && ANY_JOB.has(w)));
}
// Trades that stay themselves whatever stands before them: an "Orbital Tube Welder"
// is a welder, a "Diamond Turning Machinist" a machinist.
const TRADE = new Set(['machinist', 'welder', 'electrician']);

/**
 * A trade's general name given to one of its branches: "production welder" for
 * MIG Welder, where "Welder" is itself a career. Such a name is words that leave
 * a trade what it is (LEAVES_IT) before the trade's own title, listed in data as
 * another career's name. It says which branch is meant only while nothing else
 * does: a word of the title that names another kind ("Production Welder - TIG",
 * "Production Stick Welder") is read first, and so is a text that asks for what
 * only the whole trade does (decide.mjs). Gives the trade's name, or null.
 */
export function generalNameOf(name, vocab) {
  if (!name || name.kind === 'title' || name.words.length < 2) return null;
  const last = name.words[name.words.length - 1];
  if (!TRADE.has(last) || !name.words.slice(0, -1).every((w) => LEAVES_IT.has(w))) return null;
  const trade = vocab.byKey.get(last);
  return trade && trade.kind === 'title' && trade.career !== name.career ? trade : null;
}

const SWAP = { technician: 'mechanic', mechanic: 'technician' };
// "Aircraft Structural Technician" is an aircraft structures mechanic; a "Structural
// Engineer" is not a structures engineer (one designs buildings), so this is for the trades only.
const TRADE_SPELLING = { structural: 'structures' };
// A title that opens with one of these is a compound with whatever stands before
// it: a "Fluid Systems Engineer" is an engineer of fluid systems, not a systems engineer.
const COMPOUNDS = new Set(['systems', 'process', 'product', 'equipment', 'integration', 'design', 'operations', 'development']);

function exact(words, vocab) { return vocab.byKey.get(words.join(' ')) ?? null; }

/** The longest name that ends `words`, with the words left before it. */
function endsWith(words, vocab) {
  const last = words[words.length - 1];
  let best = null;
  for (const n of vocab.byLast.get(last) ?? []) {
    const k = n.words.length;
    if (k >= words.length || (best && k <= best.name.words.length)) continue;
    let ok = true;
    for (let i = 1; i <= k; i++) if (n.words[k - i] !== words[words.length - i]) { ok = false; break; }
    if (!ok) continue;
    const before = words.slice(0, words.length - k);
    // A trade's general name ends a title only after words that leave it so: a "TIG Production Welder" is read by its trade.
    if (generalNameOf(n, vocab) && !before.every((w) => LEAVES_IT.has(w))) continue;
    best = { name: n, before };
  }
  return best;
}

/** A name that opens `words`, with at most two words after it and none of them a job. */
function startsWith(words, vocab) {
  for (let k = Math.min(words.length - 1, 6); k >= 2; k--) {
    const n = vocab.byKey.get(words.slice(0, k).join(' '));
    const after = words.slice(k);
    if (n && after.length <= 2 && !after.some((w) => ROLE_NOUNS.has(w))) return { name: n, after };
  }
  return null;
}

/** Names of other careers that the same words could also be read as. */
// Words that may stand inside a title without changing whose it is:
// "Electrical [Design] Engineer", "Mechanical [Systems Design & Analysis] Engineer".
const PASSES = new Set(['design', 'development', 'analysis', 'systems', 'system', 'hardware']);

/** Careers whose own title the words spell with only such words in between, outermost first. */
function alsoReads(words, taken, vocab) {
  const last = words[words.length - 1];
  const out = [];
  for (const n of vocab.byLast.get(last) ?? []) {
    if (n === taken || n.kind !== 'title' || n.words.length < 2) continue;
    const first = words.indexOf(n.words[0]);
    if (first < 0) continue;
    let at = first;
    let ok = true;
    for (const w of n.words.slice(1)) {
      let next = at + 1;
      while (next < words.length && words[next] !== w && PASSES.has(words[next])) next++;
      if (words[next] !== w) { ok = false; break; }
      at = next;
    }
    if (ok && at === words.length - 1 && !n.words.every((w) => taken.words.includes(w))) out.push({ n, first });
  }
  return out.sort((a, b) => a.first - b.first).map((x) => x.n);
}

function matchSegment(given, vocab) {
  // "Process Development Engineer" is a process engineer.
  const words = given.filter((w, i) => !(w === 'development' && given[i - 1] === 'process' && given[i + 1] === 'engineer'));
  // 1. The words are a name.
  const whole = exact(words, vocab);
  if (whole) return { name: whole, close: false, words };
  const last = words[words.length - 1];
  if (SWAP[last] && words.length >= 2) {
    const body = words.slice(0, -1).map((w) => TRADE_SPELLING[w] ?? w);
    const swapped = exact([...body, SWAP[last]], vocab) ?? exact([...body, last], vocab);
    if (swapped) return { name: swapped, close: true, words };
  }
  // 2. A name with words before it.
  const tail = endsWith(words, vocab);
  if (tail) {
    const { name, before } = tail;
    const blocked = before.find((w) => CHANGES_THE_JOB.has(w));
    if (blocked) return { refused: `"${blocked}" before "${name.name}"` };
    const plain = before.every((w) => LEAVES_IT.has(w));
    // A one-word name ("operator", "mechanic", "inspector") is only itself after a
    // word that leaves it so: a "Heavy Equipment Operator" is not a production operator.
    // The same holds for a two-word other name ("Design Engineer", "Product Engineer")
    // and for a compound: with a word before them they are usually another job.
    const compound = COMPOUNDS.has(name.words[0]);
    const loose = (name.words.length === 1 && !TRADE.has(last)) || (name.kind !== 'title' && saysNothing(name)) || compound;
    const also = alsoReads(words, name, vocab);
    if (loose && (!plain || compound)) return also.length ? { also, words } : null;
    // "Test Automation Engineer": the word before the name makes, with the job word,
    // another career's own title. Which of the two is meant is for the text to say.
    // A career's own title gives way only to another's own title; another name gives way to any name.
    const beside = vocab.byKey.get(`${before[before.length - 1]} ${last}`);
    // A trade's general name is no rival to a name that says the kind (a "Production Stick Welder" is a stick
    // welder), and has none in a name of its own trade (a "Certified Production Welder" is a production welder).
    const settled = generalNameOf(beside, vocab) || (beside && generalNameOf(name, vocab)?.career === beside.career);
    const rival = beside && beside.career !== name.career && (beside.kind === 'title' || name.kind !== 'title') && !settled ? beside : null;
    return { name, close: true, words, also, rival, joined: Boolean(given.joins?.has(before.length)) };
  }
  // 3. A name with a word or two after it ("Aircraft Mechanic AME", "Systems Engineer Autonomy").
  const head = startsWith(words, vocab);
  if (head) return { name: head.name, close: true, words };
  // 4. A career's own title with only passing words inside it ("Mechanical Systems Design & Analysis Engineer").
  // Only from the first word on: with words before it too, nothing in the title stands as written.
  const also = alsoReads(words, { words: [] }, vocab).filter((n) => n.words[0] === words[0]);
  return also.length ? { also, words } : null;
}

/** For a part that is a trade's general name: the name another part makes with the trade's word, if any. */
function kindSaidBeside(seg, rest, vocab) {
  const whole = exact(seg, vocab) ?? endsWith(seg, vocab)?.name;
  const trade = generalNameOf(whole, vocab);
  if (!trade) return null;
  for (const q of rest) {
    for (const words of [q.length <= 3 ? q : null, ...q.map((w) => [w])]) {
      // Only a word that says a kind: "Production Welder (Certified)" says none, and stays the general name's.
      if (!words || words.every((w) => LEAVES_IT.has(w))) continue;
      const m = exact([...words, ...trade.words], vocab);
      if (m && m !== trade) return { name: m, close: true, words: [...words, ...trade.words] };
    }
  }
  return null;
}

/**
 * What the title says: { options: [{ career, how, matched }], refused, level, shift }.
 * One option is a decision; several are for the text to decide between; none is no career.
 */
export function readCareerTitle(posting, vocab) {
  // Before anything else: a title that holds a word of work that is never ours ("Janitorial Maintenance
  // Technician", "General Laborer - Sanitation") is turned away, whatever career's name stands beside the word.
  // The words are data (data/careers/aliases.json, `notOurs`).
  const never = notOursWord(posting.title, vocab);
  if (never) return { options: [], refused: `"${never}" in the title: not our work`, level: null, shift: null, segments: [] };
  const parsed = readTitle(posting.title);
  const out = { options: [], refused: parsed.refused, level: parsed.level, shift: parsed.shift, segments: parsed.segments };
  if (out.refused) return out;
  const field = otherField(parsed.segments);
  if (field) { out.refused = `"${field}" in the title`; return out; }

  const jobs = parsed.segments.filter((seg) => seg.some((w) => ROLE_NOUNS.has(w)));
  const rest = parsed.segments.filter((seg) => !jobs.includes(seg));
  const found = [];
  const add = (m, words) => {
    if (!m) return;
    if (m.refused) { out.refused = out.refused ?? m.refused; return; }
    if (!m.name && !(m.also ?? []).length) return;
    found.push({ ...m, said: words.join(' ') });
  };

  for (const seg of jobs) {
    // "Technician, Composites" and "Process Engineer, Etch" are a name said backwards.
    // A trade's general name said so ("Welder, Production") is kept only where no other part names a kind ("Welder, Production (TIG)").
    let turned = null;
    let general = null;
    for (const q of rest) {
      if (q.length > 3) continue;
      const m = exact([...q, ...seg], vocab);
      if (!m) continue;
      if (generalNameOf(m, vocab)) { general = general ?? { name: m, close: true, words: [...q, ...seg] }; continue; }
      turned = { name: m, close: true, words: [...q, ...seg] };
      break;
    }
    // The title's main part is a trade's general name ("Production Welder"): a word of another part that, with the
    // trade, is a name says the kind ("- TIG", "(GTAW)", ", Aluminum TIG", "- Stick/Flux Core"), and is the reading.
    if (!turned) turned = kindSaidBeside(seg, rest, vocab);
    turned = turned ?? general;
    if (turned) { add(turned, turned.words); continue; }
    // "Technician Structures": the job word first, what kind after.
    const order = ROLE_NOUNS.has(seg[0]) && seg.length > 1 && !ROLE_NOUNS.has(seg[seg.length - 1]) ? [...seg.slice(1), seg[0]] : seg;
    if (order !== seg) order.joins = new Set();
    let m = matchSegment(order, vocab);
    // A skill's short name in a title stands for the skill: "AFP Operator".
    if (!m) {
      const spelled = order.flatMap((w) => { const a = vocab.acronyms.get(w.toUpperCase()); return a && a.kind === 'name' && a.skills.length === 1 ? titleWordsOf(a.skills[0]) : [w]; });
      if (spelled.length !== order.length) { const e = exact(spelled, vocab); if (e) m = { name: e, close: true, words: spelled }; }
    }
    add(m, order);
  }
  // A one-word part that is itself a job's name: "(Toolmaker)".
  if (!found.length) for (const seg of rest) if (seg.length <= 3) add(exact(seg, vocab) ? { name: exact(seg, vocab), close: false, words: seg } : null, seg);

  const seen = new Map();
  for (const m of found) {
    // Within one part of the title the words as they stand are the reading, unless
    // they are only another name and the same words spell out a different career's
    // own title ("Electrical Design Engineer" is an electrical engineer).
    const titled = m.also ?? [];
    let take = m.name ? [{ name: m.name, how: m.close ? 'close' : m.name.kind }] : [];
    if ((!m.name || m.name.kind !== 'title') && titled.length) take = [{ name: titled[0], how: 'close' }];
    for (const t of take) if (!seen.has(t.name.career)) seen.set(t.name.career, { career: t.name.career, how: t.how, matched: t.name.name, said: m.said, kind: t.name.kind, source: t.name.source, trade: generalNameOf(t.name, vocab)?.career ?? null });
    if (m.rival && m.name && take[0]?.name === m.name && !seen.has(m.rival.career)) {
      // "Automation & Controls Engineer" names both and means the last; without the "and" it is open.
      const joined = m.joined;
      seen.set(m.rival.career, { career: m.rival.career, how: 'close', matched: m.rival.name, said: m.said, kind: m.rival.kind, source: m.rival.source, rival: true, yields: joined });
    }
  }
  out.options = [...seen.values()];
  if (out.options.length) out.refused = null;
  return out;
}

/** An initialism in the title ("Assembly ME") counts only if the text spells the career out. */
export function initialismOption(parsed, text, vocab) {
  const words = new Set(parsed.segments.flat());
  for (const n of vocab.initialisms) {
    if (!words.has(n.key)) continue;
    const title = vocab.careers.get(n.career).title.toLowerCase();
    const opening = text().lines.slice(0, 12).map((l) => l.text.toLowerCase()).join(' ');
    if (opening.includes(title)) return { career: n.career, how: 'other name', matched: n.name, said: n.key, kind: 'title' };
  }
  return null;
}
