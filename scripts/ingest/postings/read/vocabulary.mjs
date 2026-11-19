// The reader's vocabulary, built once from the curated files in data/: the careers
// and every name each goes by, their paths, the skills with their other names and
// tools, and the makes. Nothing about a career, a skill or a make is written here:
// a name the reader should know is added to those files.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { squashTerm, stem } from './text.mjs';

const json = (root, file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

// --- Careers -------------------------------------------------------------------

// The last word of a name that names a person's job. A name that ends in anything
// else ("welding", "CNC", "quality assurance", "machine shop") is a subject people
// search by, not a title, and is not matched against a posting's title.
export const ROLE_NOUNS = new Set(['engineer', 'technician', 'operator', 'machinist', 'welder', 'assembler', 'inspector', 'mechanic', 'electrician', 'programmer', 'builder', 'maker', 'fabricator', 'painter', 'designer', 'chemist', 'microbiologist', 'specialist', 'setter', 'grinder', 'millwright', 'tester', 'drafter', 'draftsman', 'installer', 'worker', 'laborer', 'associate', 'member', 'analyst', 'conductor', 'toolmaker', 'moldmaker', 'molder', 'plater', 'anodizer', 'coater', 'laminator', 'solderer', 'packer', 'packager', 'rigger', 'fitter', 'sander', 'treater', 'repairman', 'mover', 'man', 'cutter', 'winder', 'bonder', 'handler', 'monitor', 'scraper', 'inserter', 'stacker', 'feeder', 'integrator']);

// Short forms employers write in a title. Only spellings, never a job's meaning.
const TITLE_WORD = { tech: 'technician', techs: 'technician', technicians: 'technician', mfg: 'manufacturing', manuf: 'manufacturing', eng: 'engineer', engr: 'engineer', engineers: 'engineer', maint: 'maintenance', op: 'operator', ops: 'operator', operators: 'operator', nde: 'ndt', qlty: 'quality', assy: 'assembly', elec: 'electrical', mech: 'mechanical', composites: 'composite', electronic: 'electronics', inspectors: 'inspector', mechanics: 'mechanic', machinists: 'machinist', welders: 'welder', assemblers: 'assembler', programmers: 'programmer', designers: 'designer', electricians: 'electrician', journeyperson: 'journeyman', setup: 'setup' };

/** The words of a title or a career name as they are compared. */
export function titleWords(text, keepAnd = false) {
  return String(text)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bset[- ]up\b/g, 'setup').replace(/\bnon[- ]destructive\b/g, 'nondestructive').replace(/\belectro[- ]mechanical\b/g, 'electromechanical').replace(/\bmulti[- ]craft\b/g, 'multicraft').replace(/\bclean ?room\b/g, 'cleanroom').replace(/\btool ?room\b/g, 'toolroom')
    .replace(/[^a-z0-9+#]+/g, ' ').trim().split(' ').filter(Boolean)
    .map((w) => TITLE_WORD[w] ?? w)
    .filter((w) => (w !== 'and' || keepAnd) && w !== 'of' && w !== 'the');
}

function buildCareers(root) {
  const catalogue = json(root, 'data/careers/catalogue.json');
  const aliases = json(root, 'data/careers/aliases.json');
  const paths = json(root, 'data/careers/paths.json');
  const careers = new Map();
  const names = [];   // { words, key, career, kind: 'title' | 'other name', initialism }
  const add = (name, career, kind, source = kind) => {
    const bare = name.replace(/\(([^)]*)\)/g, ' $1 ');
    const words = titleWords(bare);
    if (!words.length) return;
    const initialism = /^[A-Z&]{2,4}$/.test(name.trim());
    const last = words[words.length - 1];
    // A name is a title when it ends in a job word; a branch written in brackets
    // ("NDT Technician (Ultrasonic)") ends in its branch and is one too.
    const titled = ROLE_NOUNS.has(last) || /\(/.test(name);
    names.push({ name, words, key: words.join(' '), career, kind, source, initialism, titled: titled && !initialism });
  };
  for (const c of catalogue.careers) {
    careers.set(c.title, { title: c.title, home: c.home, path: [] });
    add(c.title, c.title, 'title');
    for (const was of c.was ?? []) add(was, c.title, 'other name', 'was');
  }
  for (const a of aliases.careers) for (const n of a.aliases ?? []) if (careers.has(a.title)) add(n, a.title, 'other name', 'alias');
  for (const p of paths.careers ?? []) {
    const c = careers.get(p.title);
    if (c) c.path = (p.skills ?? []).map((s) => (typeof s === 'string' ? s : s.skill)).filter(Boolean);
  }
  // How many paths each skill is on. A skill most careers share ("Blueprint Reading")
  // says less about which career a text is than one a few have ("Wafer Handling").
  const onPaths = new Map();
  for (const c of careers.values()) for (const s of c.path) onPaths.set(s, (onPaths.get(s) ?? 0) + 1);
  for (const c of careers.values()) {
    c.telling = new Set(c.path.filter((s) => onPaths.get(s) <= 20));
    c.weighs = c.telling.size >= 4;
  }
  // One key, one career: a name two careers share cannot decide between them.
  const byKey = new Map();
  for (const n of names) {
    const had = byKey.get(n.key);
    if (!had) byKey.set(n.key, n);
    else if (had.career !== n.career) had.shared = true;
    else if (had.kind !== 'title' && n.kind === 'title') byKey.set(n.key, n);
  }
  const titled = [...byKey.values()].filter((n) => n.titled && !n.shared);
  const initialisms = [...byKey.values()].filter((n) => n.initialism && !n.shared);
  const byLast = new Map();
  for (const n of titled) {
    const last = n.words[n.words.length - 1];
    if (!byLast.has(last)) byLast.set(last, []);
    byLast.get(last).push(n);
  }
  return { careers, names: titled, initialisms, byKey: new Map(titled.map((n) => [n.key, n])), byLast };
}

// --- Skills and makes ----------------------------------------------------------

// Words that say nothing by themselves. A skill's name cut down to one of these
// is not a way to find the skill.
export const GENERIC = new Set(('process system control quality test assembly material part tool tooling machine equipment product production manufacturing design data safety work standard general basic visual inspection maintenance repair service operation setup electrical mechanical hydraulic pneumatic vibration pressure temperature thermal surface instrumentation engine vehicle battery motor robot laser weld paint coating chemical metal panel cell pack wire cable component device module structure structural composite aircraft rocket engineering software hardware technical industrial digital automated manual precision measurement analysis method procedure plan record report handling cleaning drawing model line shop plant floor area site team time study lot record order gas fluid water air power energy heat light sample unit bond seal tape film layer bath tank pump valve filter sensor signal network circuit board plate block gauge fixture die mold tap thread pin torque drive belt chain gear bearing shaft spindle wheel frame body door seat glass tile shield stage flight launch ground field final functional dynamic static critical dimension defect failure fault error root cause risk change problem solving statistical capability sampling acceptance traceability review document instruction requirement specification code programming program development testing reading writing use application installation fabrication processing preparation selection interpretation creation calibration monitoring detection identification verification validation qualification certification examination evaluation assessment optical thermal first article loop level overlay reactor closeout rate flow count size type form shape cut trim drill fit join form cure dry mix fill coat clean wash etch strip grind hone lap polish finish mask spray print place pick scan probe align balance tune load pack sort grade age wind stack fold press roll bend draw spin cast melt pour trim').split(' ').map((w) => stem(w)));

// Words so common that two of them together still name nothing ("process equipment",
// "in process", "motor control").
const EMPTY = new Set(('process system equipment control component level assembly visual industrial network motor hydraulic pneumatic quality test data machine tool part material product production manufacturing design safety work standard electrical mechanical inspection maintenance service operation in of and the for to vehicle final engine battery pack cell line plant general basic technical fluid radar device measurement').split(' ').map((w) => stem(w)));

// Codes that name a whole trade, not one skill of it.
const TRADES = new Set(['NDT', 'CNC', 'PCB', 'SMT']);
// Bodies that publish standards: their letters open a standard's number, not a skill.
const STANDARDS = new Set(['MIL', 'STD', 'IPC', 'ISO', 'IATF', 'AWS', 'ARINC', 'WHMA', 'ASME', 'ANSI', 'NAS', 'SAE', 'ASTM', 'AMS']);

// What a skill's name ends in when the name is "a thing, and using it".
const TAILS = ['operation', 'operations', 'use', 'measurement', 'reading', 'writing', 'interpretation', 'testing', 'programming', 'troubleshooting', 'setup', 'development', 'analysis', 'calculation', 'inspection', 'examination', 'practices', 'procedures', 'submission', 'machining'];

const isAcronym = (t) => /^[A-Z0-9][A-Za-z0-9&/+-]*$/.test(t) && /[A-Z]/.test(t) && t.replace(/[^A-Z]/g, '').length >= Math.ceil(t.replace(/[^A-Za-z]/g, '').length * 0.6) && t.length <= 6 && !/\s/.test(t);

function distinctive(words) {
  // A cut-down name stands for its skill only if a word of it is long and says
  // something, and a single word only if it names a thing (not "ultrasonic", "sterility").
  const parts = words.flatMap((w) => w.split('-')).filter(Boolean);
  if (parts.length === 1) return parts[0].length >= 7 && !GENERIC.has(stem(parts[0])) && !/(ic|al|ive|ous|ile|tion|ity|ness)$/i.test(parts[0]);
  return !parts.every((w) => EMPTY.has(stem(w)) || w.length < 2);
}

function buildSkills(root) {
  const catalogue = json(root, 'data/skills/catalogue.json');
  const taxonomy = json(root, 'data/skills/taxonomy.json');
  const makesFile = json(root, 'data/skills/makes.json');
  const skills = new Map();
  const group = new Map();
  for (const d of taxonomy.domains ?? []) for (const g of d.groups ?? []) for (const s of g.skills ?? []) group.set(s.name, { group: g.slug, domain: d.slug });
  const order = new Map();
  catalogue.skills.forEach((s, i) => { skills.set(s.name, { name: s.name, category: s.category, ...(group.get(s.name) ?? {}) }); order.set(s.name, i); });

  // terms: what is looked for in the text. kind: 'name' (a name or other name),
  // 'head' (a name without its tail; may belong to several skills), 'acronym',
  // 'tool'. skills: the skills the term can mean, in catalogue order.
  const terms = new Map();
  const put = (text, kind, skill) => {
    const t = text.trim();
    if (!t) return;
    const acr = isAcronym(t);
    const key = acr ? `=${t}` : squashTerm(t);
    if (!key || (!acr && key.length < 4)) return;
    // "Wave and Selective Soldering" is also written "wave/selective soldering".
    if (!acr && / and /i.test(t) && !/ and .* and /i.test(t)) put(t.replace(/ and /i, ' '), kind, skill);
    let e = terms.get(key);
    if (!e) { e = { key, text: t, kind, acronym: acr, skills: [], words: t.split(/\s+/).length }; terms.set(key, e); }
    // A term found two ways keeps the surer one, and only the skills found that way.
    else if (rank(kind) < rank(e.kind)) { e.kind = kind; e.text = t; e.skills = []; }
    else if (rank(kind) > rank(e.kind)) return;
    if (!e.skills.includes(skill)) e.skills.push(skill);
  };
  const rank = (k) => ({ name: 0, head: 1, tool: 2 })[k];

  for (const s of catalogue.skills) {
    const all = [s.name, ...(s.aliases ?? [])];
    for (const n of all) {
      put(n, 'name', s.name);
      // "Lockout Tagout" is also written with a slash; "5S Workplace Organization" as "5S".
      const words = n.split(/\s+/);
      const tail = words[words.length - 1].toLowerCase();
      if (words.length >= 2 && TAILS.includes(tail)) {
        const head = words.slice(0, -1);
        if (head.length === 1 && isAcronym(head[0])) put(head[0], 'head', s.name);
        else if (distinctive(head)) put(head.join(' '), 'head', s.name);
      }
      // A name that opens with a code ("5S …", "8D …", "GD&T …", "P&ID …") is known by the code.
      if (words.length >= 2 && /^(?=.*[0-9&])(?=.*[A-Z])[A-Z0-9&-]{2,12}$/.test(words[0]) && !/^[23]D$/.test(words[0])) put(words[0], 'head', s.name);
    }
    // A short code inside a name stands for every skill that has it: "FMEA" for the
    // two FMEAs, "CAD" for the CAD skills, "ESD" for ESD Control. Which one is meant
    // is decided where it is found (skills.mjs).
    {
      const words = s.name.split(/[^A-Za-z0-9&]+/).filter(Boolean);
      for (const w of words) if (/^[A-Z]{3,6}$/.test(w) && words.length > 1 && !TRADES.has(w) && !STANDARDS.has(w)) put(w, 'head', s.name);
    }
    for (const tool of s.tools ?? []) {
      // A tool is a way to find a skill only when it is a plain phrase of its own:
      // "Torque multipliers" yes; "Calipers, micrometers and gauges" no.
      if (/[,;()]| and | or |such as/i.test(tool)) continue;
      const words = tool.split(/\s+/);
      if (words.length < 2 || words.length > 4) continue;
      if (!distinctive(words)) continue;
      put(tool, 'tool', s.name);
    }
  }
  // A tool several skills list says nothing about which; so does one that is also a name.
  for (const [key, e] of terms) {
    if (e.kind === 'tool' && e.skills.length > 1) terms.delete(key);
    e.skills.sort((a, b) => order.get(a) - order.get(b));
  }

  // Makes. A make is written as its makers write it; it belongs to one or more skills.
  const makes = new Map();
  for (const entry of makesFile.skills ?? []) {
    if (!skills.has(entry.skill)) continue;
    for (const make of entry.makes ?? []) {
      const key = squashTerm(make);
      let e = makes.get(key);
      if (!e) { e = { key, make, skills: [], words: make.split(/\s+/).length }; makes.set(key, e); }
      if (!e.skills.includes(entry.skill)) e.skills.push(entry.skill);
    }
  }
  for (const e of makes.values()) {
    // A make that is an everyday word, or a few capitals, is only read as a make
    // beside the skill it is a make of.
    e.risky = e.words === 1 && (e.make.length <= 3 || EVERYDAY.has(e.make.toLowerCase()));
    // A short make or an everyday word must be written as its maker writes it;
    // the rest only need their first letter capital ("ANSYS", "Matlab").
    e.exact = e.risky;
  }
  return { skills, terms, makes, order };
}

// Makes whose names are also ordinary words or places.
const EVERYDAY = new Set(['doors', 'upkeep', 'gema', 'besi', 'atos', 'limble', 'calypso', 'tornos', 'ame', 'star', 'flow', 'citizen', 'carbon', 'arena', 'banner', 'nova', 'disco', 'sick', 'parker', 'wagner', 'python', 'waters', 'canon', 'fluke', 'plex', 'hesse', 'heller', 'ingersoll', 'eastman', 'gerber', 'fives', 'horiba', 'agilent', 'bruker', 'keysight', 'cohu', 'ferrum', 'angelus', 'krones', 'sidel', 'husky', 'engel', 'yamaha', 'kawasaki', 'mitsubishi', 'siemens', 'panasonic', 'nikon', 'omron', 'hexagon', 'leica', 'zeiss', 'instron', 'vector', 'empower', 'ignition', 'inventor', 'creo', 'allegro', 'pads', 'magics', 'modus']);

/** Index squashed terms by their first two letters, longest first. */
function index(entries) {
  const idx = new Map();
  for (const e of entries) {
    if (e.key.startsWith('=')) continue;
    const k = e.key.slice(0, 2);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(e);
  }
  for (const list of idx.values()) list.sort((a, b) => b.key.length - a.key.length);
  return idx;
}

export function buildVocabulary(root) {
  const careers = buildCareers(root);
  const sk = buildSkills(root);
  const acronyms = new Map([...sk.terms.values()].filter((t) => t.acronym).map((t) => [t.text, t]));
  // The words of every skill name, by category: what stands beside a short code
  // when the code means the skill ("UT" beside "ultrasonic", "penetrant", "NDT").
  const categoryWords = new Map();
  for (const s of sk.skills.values()) {
    if (!categoryWords.has(s.category)) categoryWords.set(s.category, new Set());
    for (const w of s.name.split(/[^A-Za-z0-9]+/)) if (w.length >= 5 && !GENERIC.has(stem(w))) categoryWords.get(s.category).add(stem(w));
  }
  for (const [cat, set] of categoryWords) for (const w of cat.split(/[^A-Za-z]+/)) if (w.length >= 5 && !GENERIC.has(stem(w))) set.add(stem(w));
  // The words of a skill's own names: "PLC" beside "program", "SPC" beside "statistical".
  const catalogue = json(root, 'data/skills/catalogue.json');
  const ownWords = new Map();
  for (const s of catalogue.skills) {
    const set = new Set();
    for (const n of [s.name, ...(s.aliases ?? [])]) for (const w of n.split(/[^A-Za-z]+/)) if (w.length >= 4 && !EMPTY.has(stem(w)) && !/^[A-Z]+$/.test(w)) set.add(stem(w));
    ownWords.set(s.name, set);
  }
  return {
    ...careers,
    skills: sk.skills,
    skillOrder: sk.order,
    terms: sk.terms,
    termIndex: index(sk.terms.values()),
    acronyms,
    makes: sk.makes,
    makeIndex: index(sk.makes.values()),
    categoryWords,
    ownWords,
  };
}
