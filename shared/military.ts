/**
 * Military careers. A military job (a Navy rating, an Army MOS, an Air Force
 * specialty) is a career, and each service is an employer: a company whose
 * `service` says which. A career is military when it has a service. Nothing
 * else is stored about it: the words shown above its name and its tags are
 * derived here, and nowhere else.
 */

import { US_STATES } from './states.js';

/** The four services, by the key stored in `companies.service`. */
export const SERVICES = [
  { key: 'navy', name: 'U.S. Navy', short: 'Navy' },
  { key: 'army', name: 'U.S. Army', short: 'Army' },
  { key: 'air-force', name: 'U.S. Air Force', short: 'Air Force' },
  { key: 'marine-corps', name: 'U.S. Marine Corps', short: 'Marine Corps' },
] as const;

export type ServiceKey = (typeof SERVICES)[number]['key'];

/**
 * The systems a career's code can be in, by the key stored in
 * `occupations.code_system`. Each is one service's, and `kind` is what stands
 * above the career's name. The Marine Corps has no careers yet, and so no system.
 */
export const CODE_SYSTEMS = [
  { key: 'navy-rating', service: 'navy', kind: 'Navy rating' },
  { key: 'army-mos', service: 'army', kind: 'Army MOS' },
  { key: 'afsc', service: 'air-force', kind: 'Air Force specialty' },
] as const;

export type CodeSystemKey = (typeof CODE_SYSTEMS)[number]['key'];

/** The tag every military career carries, beside its service's. */
export const MILITARY_TAG = 'military';

export function isServiceKey(value: unknown): value is ServiceKey {
  return SERVICES.some((service) => service.key === value);
}

export function isCodeSystem(value: unknown): value is CodeSystemKey {
  return CODE_SYSTEMS.some((system) => system.key === value);
}

/** "Navy", "Air Force": the service as a word in a title or a filter. Null for anything that is not a service. */
export function serviceShortName(key: string | null | undefined): string | null {
  return SERVICES.find((service) => service.key === key)?.short ?? null;
}

/** "U.S. Navy": the service as the employer is named. Null for anything that is not a service. */
export function serviceName(key: string | null | undefined): string | null {
  return SERVICES.find((service) => service.key === key)?.name ?? null;
}

/** The service a code system belongs to. */
export function serviceOfCodeSystem(system: string | null | undefined): ServiceKey | null {
  return CODE_SYSTEMS.find((item) => item.key === system)?.service ?? null;
}

/** The system a service's codes are in; null for a service with none yet. */
export function codeSystemOf(service: string | null | undefined): CodeSystemKey | null {
  return CODE_SYSTEMS.find((item) => item.service === service)?.key ?? null;
}

/** The words above a military career's name: "Navy rating", "Army MOS", "Air Force specialty". Null for a civilian career. */
export function careerKind(system: string | null | undefined): string | null {
  return CODE_SYSTEMS.find((item) => item.key === system)?.kind ?? null;
}

/** A tag, as a key to filter on and the word to show. */
export interface CareerTag {
  key: string;
  word: string;
}

/**
 * A career's tags, from its service: "military" and the service's own
 * (`navy`, `army`, `air-force`, `marine-corps`). None for a civilian career.
 */
export function careerTags(service: string | null | undefined): CareerTag[] {
  const short = serviceShortName(service);
  return short && service ? [{ key: MILITARY_TAG, word: 'Military' }, { key: service, word: short }] : [];
}

/**
 * A military career's title: the service in front of the service's own name for
 * the job ("Navy Electronics Technician"), because a title is unique and the
 * civilian "Electronics Technician" exists.
 */
export function militaryTitle(service: ServiceKey, officialTitle: string): string {
  return `${serviceShortName(service)} ${officialTitle}`;
}

/** A military career's one grey line in a list or a search: "Navy rating · HT". Null for a civilian career. */
export function kindLine(kind: string | null | undefined, code: string | null | undefined): string | null {
  if (!kind) return null;
  return code ? `${kind} · ${code}` : kind;
}

// ---------------------------------------------------------------------------
// What names a military career in a search
// ---------------------------------------------------------------------------
//
// A military career is an entry for a veteran, not a destination, so the site's
// search lists one only when the query names it. A query names a career when
//
// 1. it is the career's code and nothing else, in any letter case: "15T",
//    "2a3x3", "HT". A code may be written as its holder writes it, with the
//    skill level: an Air Force code where it has its X ("2A353"), an Army code
//    after it ("91B10"). Letters that ordinarily mean something else
//    (`PLAIN_CODES`) do not count by themselves: "AM", "ET", "IT";
// 2. it says the service ("navy", "army", "air force", or the employer's name)
//    and every other word is the career's code, a whole word of the service's
//    title for the job or of another name it goes by, or the first three
//    letters or more of one: "Navy hull", "navy et", "air force avionics". One
//    or two letters begin too many words to name anything ("navy a", "air force
//    p"), and the words that join a title ("and", "of") are not read. The words
//    that mean a code system ("rating", "MOS", "specialty", "AFSC") may stand
//    among them, and with the service alone they name every career of that
//    system: "Navy ratings";
// 3. it is a code with its system's word and nothing else: "HT rating",
//    "MOS 15T". Not letters that are plain: "IC rating" and "PR rating" are a
//    breaker's and a pressure's, and those codes want their service ("Navy IC").
//
// A service's name alone names no career (it names the service: `namedService`),
// and neither does a title without its service: "electronics technician" is the
// civilian career.
//
// A search that is asking for a military career (Profile's door) reads a query
// by the same rule with one difference, `asking`: plain letters count, alone
// and beside their system's word, since nothing else can be meant there.
//
// Naming a career lists it. It leads the results only when the query can be
// nothing else (`namesForSure`): letters alone also begin companies' names
// ("AO", "FC", "HT"), and a service's word beside a word of a title is also a
// plant's ("Army ammunition").

/**
 * Codes that are letters a person ordinarily means something else by, so that
 * typed alone they name no career. Each is one of: an English word; a state's
 * postal code (those are read from the states' list, not kept here); a unit of
 * measure or a title; another name the catalogue has for a skill or a civilian
 * career; an abbreviation in general use at work. With the service beside it
 * ("Navy AM") any of them names its career.
 */
const PLAIN_CODES: ReadonlySet<string> = new Set([
  // English words. IT and IS are Navy ratings that are not loaded; they are here so that loading them changes nothing.
  'AD', 'AM', 'AS', 'AT', 'IS', 'IT',
  // Units of measure, and a title.
  'CM', 'FT', 'MM', 'MR',
  // Other names of skills in the catalogue: eddy current, magnetic particle and ultrasonic testing.
  'ET', 'MT', 'UT',
  // In general use at work: application engineer, CE marking, electromagnetic, European standards (and the start of
  // "engineer"), General Motors, integrated circuit, public relations, software, trademark.
  'AE', 'CE', 'EM', 'EN', 'GM', 'IC', 'PR', 'SW', 'TM',
  // A carmaker's name for a decade (Fiat Chrysler Automobiles), and stick welding as much of the world writes it
  // (manual metal arc).
  'FCA', 'MMA',
]);

/** A state's postal code is the state, wherever it is typed. */
const STATE_CODES: ReadonlySet<string> = new Set(US_STATES.map((state) => state.code as string));

/** Whether a code, typed alone, is read as something else. A code with a digit never is. */
export function isPlainCode(code: string): boolean {
  const letters = code.toUpperCase();
  return !/\d/.test(letters) && (PLAIN_CODES.has(letters) || STATE_CODES.has(letters));
}

/** The words that say a service, as a query's words. */
const SERVICE_WORDS: { key: ServiceKey; words: string[] }[] = [
  { key: 'air-force', words: ['air', 'force'] },
  { key: 'air-force', words: ['airforce'] },
  { key: 'air-force', words: ['usaf'] },
  { key: 'marine-corps', words: ['marine', 'corps'] },
  { key: 'marine-corps', words: ['marines'] },
  { key: 'marine-corps', words: ['usmc'] },
  { key: 'navy', words: ['navy'] },
  { key: 'navy', words: ['usn'] },
  { key: 'army', words: ['army'] },
];

/**
 * The words that say a code system. "Specialty" is the Air Force's word for a
 * job and the last word of the Army's (military occupational specialty).
 */
const SYSTEM_WORDS: Record<string, readonly CodeSystemKey[]> = {
  rating: ['navy-rating'],
  ratings: ['navy-rating'],
  mos: ['army-mos'],
  specialty: ['afsc', 'army-mos'],
  specialties: ['afsc', 'army-mos'],
  afsc: ['afsc'],
};

/** Words that join a title and name nothing: "Aviation Boatswain's Mate (Launching and Recovery Equipment)". */
const JOINING_WORDS: ReadonlySet<string> = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'or', 'the', 'to']);

/** The fewest letters that begin a word of a title: "hul" is the start of "hull", "h" of too much. */
const WORD_START = 3;

/** A query or a name as its words: lower case, an apostrophe dropped ("machinist's" is "machinists"), anything else a break. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** What a query asks of the military careers; null when nothing in it could name one. */
export interface MilitaryQuery {
  service: ServiceKey | null;
  /** The systems its system's word can mean ("specialty" is the Army's and the Air Force's); null when it has no such word. */
  systems: readonly CodeSystemKey[] | null;
  /** The words left once the service, the system's word and the joining words are taken out. */
  words: string[];
}

/** A query as its service, its system's word and the rest. */
function parts(query: string): MilitaryQuery {
  const words = wordsOf(query.slice(0, 80));
  let service: ServiceKey | null = null;
  for (const entry of SERVICE_WORDS) {
    const at = words.findIndex((_, i) => entry.words.every((word, j) => words[i + j] === word));
    if (at === -1) continue;
    service = entry.key;
    words.splice(at, entry.words.length);
    // "U.S. Navy", "US Army": the letters before the service's word are part of its name.
    let before = at;
    while (before > 0 && ['u', 's', 'us'].includes(words[before - 1])) before -= 1;
    words.splice(before, at - before);
    break;
  }
  let systems: readonly CodeSystemKey[] | null = null;
  const rest: string[] = [];
  for (const word of words) {
    if (SYSTEM_WORDS[word]) systems = systems ?? SYSTEM_WORDS[word];
    else rest.push(word);
  }
  // "Specialty code", "rating code": the word that follows a system's is part of it.
  const said = systems !== null;
  return { service, systems, words: rest.filter((word) => !JOINING_WORDS.has(word) && !(said && (word === 'code' || word === 'codes'))) };
}

/** Read a query for what could name a military career. Null for the ordinary query, which names none. */
export function readMilitaryQuery(query: string): MilitaryQuery | null {
  const asked = parts(query);
  const { service, systems, words } = asked;
  // A system's word beside another service's name names nothing: "Navy MOS".
  if (service && systems && !systems.some((system) => serviceOfCodeSystem(system) === service)) return null;
  if (service) return words.length > 0 || systems ? asked : null;
  // Without the service, only a code: alone, or with its system's word.
  if (words.length !== 1 || !/^[a-z0-9]{2,6}$/.test(words[0])) return null;
  return asked;
}

/**
 * The service a query names and nothing else: "navy", "U.S. Navy", "the air
 * force", "usmc". Such a query names no career; it is the service's own page
 * that was asked for.
 */
export function namedService(query: string): ServiceKey | null {
  const { service, systems, words } = parts(query);
  return service && !systems && words.length === 0 ? service : null;
}

/**
 * A query that says a service, as the service and the words beside it: "air
 * force crew chief" is the Air Force and "crew chief". Null when it says none,
 * or nothing else. For the search that asks for a military career: the words
 * are then looked for among that service's careers alone.
 */
export function saidService(query: string): { service: ServiceKey; rest: string } | null {
  const { service, words } = parts(query);
  return service && words.length > 0 ? { service, rest: words.join(' ') } : null;
}

/** A military career as the search reads it. */
export interface NameableCareer {
  service: string | null;
  code: string | null;
  codeSystem: string | null;
  /** The service's own title for the job, and the other names it goes by. */
  officialTitle: string | null;
  names?: readonly string[] | null;
}

/**
 * Whether a word is the career's code, as it is listed or as its holder writes
 * it. An Air Force code takes a skill level where it has its X ("2A353" is
 * 2A3X3); an Army code takes one after it, with the letter or zero that follows
 * ("91B10", "91B1O").
 */
function isCode(word: string, career: NameableCareer): boolean {
  if (!career.code) return false;
  const code = career.code.toLowerCase();
  if (word === code) return true;
  if (career.codeSystem === 'afsc') {
    return word.length === code.length && [...code].every((letter, i) => letter === word[i] || (letter === 'x' && /\d/.test(word[i])));
  }
  return career.codeSystem === 'army-mos' && word.startsWith(code) && /^[1-5][a-z0-9]$/.test(word.slice(code.length));
}

/** How a query is read. */
export interface NamingOptions {
  /**
   * The search is asking for a military career (Profile's door), so plain
   * letters count as the code they are. The site's search leaves this off.
   */
  asking?: boolean;
}

/** Whether a query, as read, names this career. See the rule above. */
export function namesCareer(asked: MilitaryQuery, career: NameableCareer, { asking = false }: NamingOptions = {}): boolean {
  if (!career.service || !career.code) return false;
  if (asked.service && career.service !== asked.service) return false;
  if (asked.systems && !asked.systems.some((system) => system === career.codeSystem)) return false;
  if (!asked.service) {
    // A code alone, or beside its system's word: not one that reads as something else.
    const [word] = asked.words;
    return isCode(word, career) && (asking || !isPlainCode(career.code));
  }
  if (asked.words.length === 0) return asked.systems !== null;
  const titleWords = [career.officialTitle ?? '', ...(career.names ?? [])].flatMap(wordsOf);
  // One character is no word to go by: the "1" of "MQ-1" counts beside "mq", never alone.
  if (asked.words.every((word) => word.length < 2)) return false;
  return asked.words.every(
    (word) => isCode(word, career) || titleWords.some((titleWord) => titleWord === word || (word.length >= WORD_START && titleWord.startsWith(word)))
  );
}

/** Whether the query has the career's code as one of its words. */
function saysCode(asked: MilitaryQuery, career: NameableCareer): boolean {
  return asked.words.some((word) => isCode(word, career));
}

/**
 * Whether a query that names a career can be nothing but that career: it has
 * the code, and either the code has a digit in it or the service or the
 * system's word stands beside it ("15T", "2A353", "Navy HT", "HT rating"). Such
 * a career leads a search's results. Letters alone ("HT", "AO", "FC") are also
 * how companies' names begin, and a service's word with a word of a title
 * ("Army ammunition") is also a plant's name: those careers are listed in
 * their place among the careers and lead nothing.
 */
export function namesForSure(asked: MilitaryQuery, career: NameableCareer): boolean {
  return saysCode(asked, career) && (/\d/.test(career.code ?? '') || asked.service !== null || asked.systems !== null);
}

/** Whether the query's words are one of the career's names, whole: "Navy Electronics Technician" is the ET, not the AT. */
function saysWholeName(asked: MilitaryQuery, career: NameableCareer): boolean {
  const typed = asked.words.join(' ');
  return [career.officialTitle ?? '', ...(career.names ?? [])].some((name) => {
    const words = parts(name).words.join(' ');
    return words !== '' && words === typed;
  });
}

/**
 * The careers of a list that a query names: those whose code is a word of the
 * query first ("Navy ET" is the Electronics Technician before the ratings whose
 * codes begin with ET), then one whose name was typed whole, then the rest,
 * each in the list's order.
 */
export function namedCareers<T extends NameableCareer>(query: string, careers: readonly T[], options: NamingOptions = {}): T[] {
  const asked = readMilitaryQuery(query);
  if (!asked) return [];
  const named = careers.filter((career) => namesCareer(asked, career, options));
  const rank = (career: T) => (saysCode(asked, career) ? 0 : saysWholeName(asked, career) ? 1 : 2);
  return named.map((career, i) => ({ career, i })).sort((a, b) => rank(a.career) - rank(b.career) || a.i - b.i).map(({ career }) => career);
}
