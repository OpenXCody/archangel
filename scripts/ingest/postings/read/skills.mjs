// What a posting asks for, in the catalogue's words: skills by their names, their
// other names and, carefully, their tools; makes by their names, each given to the
// skill it is a make of. Every match says what it matched on.
//
// Only the lines that ask for something are read (duties, requirements): a skill
// is not read out of "we build rockets", the benefits or the legal paragraphs.
import { squash, stem } from './text.mjs';
import { GENERIC } from './vocabulary.mjs';

const ASKS = new Set(['duties', 'required', 'preferred']);
// A sentence outside those parts still asks when it speaks to the person hired.
const SPEAKS_OF_THE_JOB = /\byou will\b|\byou.ll\b|responsible for|this (role|position)|the (successful |ideal |selected )?(candidate|technician|engineer|operator|inspector|machinist|welder|mechanic|assembler)\b.*\b(will|must|should)\b|\bexperience (with|in|using|operating|performing)\b|\bmust (have|be able|possess)\b|\bability to\b|\bproficien|\bknowledge of\b|\bfamiliar(ity)? with\b|\bperforms?\b|\boperates?\b|\bskilled (in|with)\b|\bcertifi/i;

/** The lines a skill may be read from. */
export function askingLines(lines) {
  const has = lines.some((l) => ASKS.has(l.kind) && !l.heading);
  return lines.filter((l) => {
    if (l.heading) return false;
    if (ASKS.has(l.kind)) return true;
    if (l.kind === 'intro' || l.kind === 'other') return has ? SPEAKS_OF_THE_JOB.test(l.text) : true;
    return false;
  });
}

function rawSlice(text, sq, i, j) {
  const from = sq.words[i].at;
  const last = sq.words[j];
  return text.slice(from, last.at + last.raw.length);
}

/** Every term and make found in the asking lines, before any is given to a skill. */
export function findAll(lines, vocab, employer) {
  const hits = [];     // { term, line, i, j, on }
  const makeHits = []; // { make, line, i, j, on }
  const employerKey = squash(String(employer ?? '')).s;
  const lookup = vocab.terms;
  lines.forEach((line, lineNo) => {
    const text = line.text;
    const sq = (line.sq ??= squash(text));
    const n = sq.words.length;
    const endAt = new Map(sq.ends.map((e, k) => [e, k]));
    // Terms, longest first at each word; a longer term hides the shorter ones inside it.
    const taken = new Array(n).fill(false);
    const scan = (index, each) => {
      for (let i = 0; i < n; i++) {
        const pos = sq.starts[i];
        const bucket = index.get(sq.s.substr(pos, 3));
        if (!bucket) continue;
        for (const e of bucket) {
          if (!sq.s.startsWith(e.key, pos)) continue;
          const j = endAt.get(pos + e.key.length);
          if (j === undefined) continue;
          let cut = false;
          for (let k = i + 1; k <= j; k++) if (sq.words[k].cut) { cut = true; break; }
          if (cut) continue;
          if (each(e, i, j)) { i = j; break; }
        }
      }
    };
    scan(vocab.termIndex, (term, i, j) => {
      if (term.acronym) return false;
      // One plain word is matched as written, not by its stem: "indicating" is not "indicate".
      if (i === j && !/[^a-z]/i.test(term.text)) {
        const a = sq.words[i].raw.toLowerCase().replace(/s$/, '');
        if (a !== term.text.toLowerCase().replace(/s$/, '')) return false;
      }
      for (let k = i; k <= j; k++) taken[k] = true;
      hits.push({ term, line: lineNo, i, j, on: rawSlice(text, sq, i, j) });
      // "manual mills and lathes", "CNC mill/lathe": the first word carries to the second thing.
      if (j > i && j + 1 < n) {
        let y = j + 1;
        const gap = text.slice(sq.words[j].at + sq.words[j].raw.length, sq.words[y].at);
        const joined = /^\s*(\/|&|,)\s*$/.test(gap) || (/^(and|or)$/i.test(sq.words[y].raw) && ++y < n);
        if (joined && y < n && !taken[y]) {
          const lead = sq.s.slice(sq.starts[i], sq.ends[j - 1] > 0 ? sq.ends[j - 1] : sq.starts[j]);
          const other = lookup.get(lead + sq.s.slice(sq.starts[y], sq.ends[y]));
          if (other && other !== term && !other.acronym) { taken[y] = true; hits.push({ term: other, line: lineNo, i: y, j: y, on: `${rawSlice(text, sq, i, j - 1)} … ${sq.words[y].raw}` }); }
        }
      }
      return true;
    });
    // Short codes, as written: "SPC" is one, "spc" in a part number is not.
    for (let i = 0; i < n; i++) {
      const w = sq.words[i];
      // "PLCs", "P&IDs": a code in the plural is the code.
      const term = vocab.acronyms.get(w.raw) ?? (/[A-Z&]s$/.test(w.raw) ? vocab.acronyms.get(w.raw.slice(0, -1)) : undefined);
      if (!term || taken[i]) continue;
      const before = text[w.at - 1];
      const after = text[w.at + w.raw.length];
      const next = text[w.at + w.raw.length + 1];
      if ((after === '-' && /[0-9A-Za-z]/.test(next ?? '')) || (before === '-' && /[0-9A-Za-z]/.test(text[w.at - 2] ?? '')) || before === '.' || before === '@') continue;
      hits.push({ term, line: lineNo, i, j: i, on: w.raw, code: true });
    }
    const madeAt = [];
    scan(vocab.makeIndex, (make, i, j) => {
      const on = rawSlice(text, sq, i, j);
      if (make.exact && on !== make.make) return false;
      if (i === j && sq.words[i].raw.length !== make.make.replace(/[^A-Za-z0-9&+#]/g, '').length && make.words === 1 && !/[^A-Za-z0-9]/.test(make.make)) return false;
      if (employerKey && (employerKey.includes(make.key) || make.key.includes(employerKey))) return false;
      madeAt.push({ make, line: lineNo, i, j, on });
      return true;
    });
    // "Siemens NX", "Siemens TIA Portal": the maker's name before its product is not a second make.
    for (let k = 0; k < madeAt.length; k++) {
      const m = madeAt[k];
      const nextMake = madeAt[k + 1];
      if (nextMake && nextMake.i === m.j + 1 && m.i === m.j && /^[\s]+$/.test(text.slice(sq.words[m.j].at + sq.words[m.j].raw.length, sq.words[nextMake.i].at))) continue;
      makeHits.push(m);
    }
  });
  return { hits, makeHits };
}

/**
 * Give the finds to skills. path: the matched career's path (skill names, in order)
 * or []. Returns { skills: [{ name, on }], makes: [{ skill, make, on }] }.
 */
export function assign(found, lines, vocab, path) {
  const { hits, makeHits } = found;
  const onPath = new Map(path.map((s, i) => [s, i]));
  const named = new Map();   // skill → on
  const name = (skill, on) => { if (!named.has(skill)) named.set(skill, on); };

  // 1. Names and cut-down names that mean one skill.
  const pending = [];
  for (const h of hits) {
    const t = h.term;
    if (t.kind === 'tool' || h.code || t.skills.length > 1) { pending.push(h); continue; }
    name(t.skills[0], h.on);
  }
  // 2. Short codes need a neighbour.
  const categoryOf = (skill) => vocab.skills.get(skill)?.category;
  const lineStems = new Map();
  const stemsOf = (lineNo) => {
    if (!lineStems.has(lineNo)) lineStems.set(lineNo, new Set(lines[lineNo].text.split(/[^A-Za-z0-9&]+/).filter(Boolean).map((w) => stem(w))));
    return lineStems.get(lineNo);
  };
  const codes = pending.filter((h) => h.code);
  const codeOk = (h) => {
    const letters = h.term.text.replace(/[^A-Za-z]/g, '').length;
    const digits = /\d|&/.test(h.term.text);
    if (letters >= 4 || digits) return true;
    const cats = new Set(h.term.skills.map(categoryOf));
    // The long form, or another skill of the same kind, in the posting.
    const sameLine = () => {
      const stems = stemsOf(h.line);
      for (const c of cats) for (const w of vocab.categoryWords.get(c) ?? []) if (stems.has(w)) return true;
      return codes.some((o) => o !== h && o.line === h.line && o.term.skills.some((s) => cats.has(categoryOf(s))));
    };
    if (letters <= 2) return sameLine();
    if (h.term.skills.some((s) => named.has(s) || onPath.has(s))) return true;
    for (const s of named.keys()) if (cats.has(categoryOf(s))) return true;
    if (codes.some((o) => o !== h && o.term.text !== h.term.text && o.term.skills.some((s) => cats.has(categoryOf(s))))) return true;
    return sameLine();
  };
  const goodCodes = codes.filter(codeOk);
  // 3. A term that could be several skills goes to the one the posting also names,
  // else to the one on the career's path, else to the first the catalogue lists.
  const choose = (skills) => {
    const also = skills.filter((s) => named.has(s));
    if (also.length) return also[0];
    const pathed = skills.filter((s) => onPath.has(s)).sort((a, b) => onPath.get(a) - onPath.get(b));
    if (pathed.length) return pathed[0];
    // Skills of one group are near enough that the first stands for the code
    // ("PLC" for the PLC skills); across groups the code alone does not say which.
    const groups = new Set(skills.map((s) => vocab.skills.get(s)?.group));
    return groups.size === 1 ? skills[0] : null;
  };
  for (const h of goodCodes) if (h.term.skills.length === 1) name(h.term.skills[0], h.on);
  for (const h of [...goodCodes, ...pending.filter((p) => !p.code && p.term.kind !== 'tool')]) if (h.term.skills.length > 1) { const to = choose(h.term.skills); if (to) name(to, h.on); }
  // 4. Tools: a tool names its skill only on the career's path, or with a second tool of it.
  const tools = new Map();
  for (const h of pending) if (h.term.kind === 'tool') { const s = h.term.skills[0]; if (!tools.has(s)) tools.set(s, new Map()); tools.get(s).set(h.term.key, h.on); }
  for (const [skill, set] of tools) if (!named.has(skill) && (onPath.has(skill) || set.size >= 2)) name(skill, [...set.values()].slice(0, 2).join(', '));

  // 5. Makes.
  const makes = [];
  const made = new Set();
  const byLine = new Map();
  for (const h of hits) { if (!byLine.has(h.line)) byLine.set(h.line, []); byLine.get(h.line).push(h); }
  for (const m of makeHits) {
    const mine = m.make.skills;
    let to = [];
    const here = (byLine.get(m.line) ?? []).flatMap((h) => h.term.skills).filter((s) => mine.includes(s) && named.has(s));
    if (here.length) to = [...new Set(here)];
    else {
      const also = mine.filter((s) => named.has(s));
      if (also.length) to = also;
      else if (!m.make.risky) {
        const pathed = mine.filter((s) => onPath.has(s)).sort((a, b) => onPath.get(a) - onPath.get(b));
        if (pathed.length) { to = [pathed[0]]; name(pathed[0], m.on); }
      }
    }
    for (const skill of to) {
      const key = `${skill}|${m.make.make}`;
      if (made.has(key)) continue;
      made.add(key);
      makes.push({ skill, make: m.make.make, on: m.on });
    }
  }
  const order = vocab.skillOrder;
  const skills = [...named.entries()].map(([n, on]) => ({ name: n, on })).sort((a, b) => order.get(a.name) - order.get(b.name));
  return { skills, makes };
}

// --- Words the catalogue does not have -----------------------------------------

const NOT_A_TOOL = new Set(('the a an and or of in on at to for with by from as is are be will we you our your their this that these those it its all any each other such via per not no yes if then than when while who what which how also may must can should would could etc including include includes using used use ability able experience experienced strong excellent good great high highly working work works worked team teams company role position job candidate candidates applicants applicant engineer engineers engineering technician technicians manager managers management quality safety manufacturing production process processes systems system product products business customer customers support development design test testing time year years month months day days week weeks hours hour degree bachelor bachelors master masters associate associates diploma school college university education preferred required requirements qualifications responsibilities skills knowledge communication written verbal english spanish microsoft office word excel outlook powerpoint teams google united states us usa america american california texas florida washington january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday am pm pst est cst pt et ged eoe eeo ada itar ear osha epa faa dod nasa iso ansi asme astm aws ipc sae mil nfpa nec ul ce fda gmp erp mrp sap oracle jira confluence slack zoom pdf id ii iii iv bs ba ms mba phd stem gpa r&d rd hr it qa qc ok tbd na n/a k kpi kpis roi sop sops bom boms po pos nda pto usd').split(' '));

/** Tool and method words met in requirement lines that no term or make matched. */
export function unknownWords(lines, found, vocab, employer, cap = 8) {
  const out = [];
  const seen = new Set();
  const employerWords = new Set(String(employer ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const covered = new Map();
  for (const h of [...found.hits, ...found.makeHits]) { if (!covered.has(h.line)) covered.set(h.line, []); covered.get(h.line).push(h); }
  lines.forEach((line, lineNo) => {
    if (out.length >= cap || !(line.kind === 'required' || line.kind === 'preferred' || line.kind === 'duties')) return;
    const sq = (line.sq ??= squash(line.text));
    const hidden = new Array(sq.words.length).fill(false);
    for (const h of covered.get(lineNo) ?? []) for (let k = h.i; k <= h.j; k++) hidden[k] = true;
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const phrase = run.map((w) => w.raw).join(' ');
      run = [];
      const key = phrase.toLowerCase();
      if (seen.has(key) || phrase.length < 3 || phrase.length > 40) return;
      seen.add(key);
      if (out.length < cap) out.push({ phrase });
    };
    for (let i = 0; i < sq.words.length; i++) {
      const w = sq.words[i];
      const raw = w.raw;
      const lower = raw.toLowerCase();
      const first = i === 0 || /[.:;!?]\s*$/.test(line.text.slice(0, w.at));
      // A name written as makers write them: capitals inside a sentence, or a code.
      const named = /^[A-Z][A-Za-z0-9+#&]*[a-z0-9+#][A-Za-z0-9+#&]*$/.test(raw) || /^[A-Z][A-Z0-9&+#]{1,7}$/.test(raw) || /^[A-Za-z]+\d+[A-Za-z0-9]*$/.test(raw);
      const joined = run.length && line.text.slice(run[run.length - 1].at + run[run.length - 1].raw.length, w.at) === ' ';
      if (hidden[i] || !named || NOT_A_TOOL.has(lower) || GENERIC.has(stem(lower)) || employerWords.has(lower) || (first && !/[A-Z].*[A-Z0-9]/.test(raw)) || (run.length && !joined) || run.length >= 3) {
        flush();
        if (hidden[i] || !named || NOT_A_TOOL.has(lower) || GENERIC.has(stem(lower)) || employerWords.has(lower) || (first && !/[A-Z].*[A-Z0-9]/.test(raw))) continue;
      }
      run.push(w);
    }
    flush();
  });
  return out;
}
