import { formatFactoryName, shouts } from './displayName.js';
import { companyShortName } from './versions.js';

/**
 * A factory's name for a place that already names its company.
 *
 * Beside a company's tag, "John Deere Des Moines Works" says the company a
 * second time: there the factory is "Des Moines Works". This gives the name
 * with the company's name taken off its front when what is left is a site's
 * own name, and nothing (null) when nothing is left to say, so the place alone
 * names the factory. A NAME THAT BEGINS WITH THE COMPANY'S IS NEVER GIVEN
 * WHOLE: where cutting it would leave something that is not a name (the firm's
 * legal name, the rest of the firm's name, a registry's line), the place says
 * where, and the factory's own page says the rest. A name that does not begin
 * with the company's is the factory's own and is given as `formatFactoryName`
 * shows it.
 *
 *   John Deere Des Moines Works, of John Deere          Des Moines Works
 *   Boeing St. Louis, of Boeing, in Berkeley            St. Louis
 *   SpaceX Bastrop, of SpaceX, in Bastrop               null (the town says it)
 *   ANDURIL INDUSTRIES INC, of Anduril Industries       null (the company's own name)
 *   NORTHROP GRUMMAN SYSTEMS CORPORATION, of Northrop Grumman   null (the firm under its legal name)
 *   Cargill Kitchen Solutions Inc, of Cargill           null (another legal entity's name)
 *   BOEING AUBURN ALGONA WHSE, of Boeing                null (a registry's line, not a name)
 *   Allegany Ballistics Laboratory, of Northrop Grumman whole (it does not begin with the company)
 *
 * The company is matched as it is said: without its legal form ("Dow" for
 * "Dow Inc."), in any letter case, whatever stands between its words ("A&I
 * Products" is "A & I Products"). A company whose name ends in a word that
 * says only what kind of firm it is (Anduril Industries, Lucid Motors, Micron
 * Technology) is also matched by the name before that word, since its sites
 * are named so ("Anduril Santa Ana"). A company's other names are not known
 * here: a factory filed under one that does not begin as the company is shown
 * ("Space Exploration Technologies Corp", of SpaceX) is given whole.
 */
export function factoryNameBesideCompany(
  factory: { name: string | null | undefined; city?: string | null; state?: string | null },
  companyName: string | null | undefined
): string | null {
  const shown = formatFactoryName(factory.name);
  if (!shown) return null;
  const town = townOf(factory.city, factory.state);
  // A factory named for its town alone is said by its place.
  if (town(shown)) return null;

  const company = companyNames(companyName).find((name) => afterName(shown, name) !== null);
  // Its own name, the town it ends in left to the place ("Akoustis Canandaigua" in Canandaigua is "Akoustis").
  if (company === undefined) return withoutTown(shown, town);
  // Named for its town, which only happens to begin as the company does ("Apple River Fire Protection" in Apple River).
  const city = (factory.city ?? '').trim();
  if (city && afterName(shown, city) !== null && afterName(city, company) !== null && !town(company)) return shown;

  const rest = shown.slice(afterName(shown, company) ?? 0).replace(/^[\s,:;·–—-]+/, '').trim();
  const words = wordsOf(rest);
  // The company's own name, with or without its legal form ("Anduril Industries, Inc"; "The Boeing Company").
  if (words.every((word) => LEGAL_FORMS.has(word) || word === 'the')) return null;
  if (town(rest)) return null;
  // The firm under a legal name, or another legal entity of it ("Northrop Grumman Systems Corporation", "Cargill
  // Kitchen Solutions Inc"): cut short it would name nothing, and whole it says the company twice.
  if (words.some((word) => LEGAL_FORMS.has(word))) return null;
  // "… of Texas", "… Group, Nutrilite Division": the rest of the firm's name, not a site's.
  if (!/^[A-Z0-9]/.test(rest) || REST_OF_A_FIRM.has(words[0])) return null;
  // A name a registry wrote in capitals is cut only where what is left reads as words ("Auburn Algona Whse" does not).
  if (shouts(String(factory.name).trim()) && !readsAsName(words, rest)) return null;
  return withoutTown(rest, town);
}

/**
 * A site's name without its own town, which the place beside it says: at the end ("AMP-1 (Casa Grande)" in Casa
 * Grande is "AMP-1", "Rig Solutions Pampa" in Pampa "Rig Solutions") or before a bracket ("Billerica (NEXX)" in
 * Billerica is "NEXX"). At the front of a longer name the town is part of it ("Dubuque Works").
 */
function withoutTown(name: string, town: (text: string) => boolean): string {
  const bracket = /^(.*\S)\s*\(([^()]*)\)$/.exec(name);
  if (bracket && town(bracket[2])) return bracket[1];
  if (bracket && town(bracket[1]) && bracket[2].trim()) return bracket[2].trim();
  const parts = name.split(/\s+/);
  for (let from = 1; from < parts.length; from += 1) {
    if (town(parts.slice(from).join(' '))) return parts.slice(0, from).join(' ').replace(/[\s,·–—-]+$/, '');
  }
  return name;
}

/** The legal forms a name can end in, as compared words. */
const LEGAL_FORMS = new Set(['inc', 'incorporated', 'llc', 'corp', 'corporation', 'co', 'company', 'lp', 'llp', 'ltd', 'limited', 'plc']);

/** First words that carry a firm's name on ("Access Business Group", "Air Liquide America"): what follows the company is then not a site. */
const REST_OF_A_FIRM = new Set(['group', 'holdings', 'enterprises', 'international', 'industries', 'technologies', 'technology', 'worldwide', 'global', 'america', 'americas', 'usa']);

/** Words at the end of a company's name that say only what kind of firm it is. */
const KIND_OF_FIRM = /\s+(?:industries|technologies|technology|motors)$/i;

/**
 * Names too common to stand for a company by themselves: "General" is not
 * General Motors, and a factory called "American Fork" is not American
 * Industries' "Fork".
 */
const COMMON_WORDS = new Set(
  ('general american national united international advanced applied precision global universal standard superior premier quality custom modern ' +
    'industrial allied central pacific atlantic western eastern northern southern midwest first new great north south east west')
    .split(' ')
);

/** A text as compared words: lower case, no punctuation ("Co." is "co"). */
const wordsOf = (text: string): string[] => text.toLowerCase().replace(/['’.]/g, '').split(/[^a-z0-9&]+/).filter(Boolean);

/** The names a company's sites may begin with, the longest first. */
function companyNames(companyName: string | null | undefined): string[] {
  const said = companyShortName(companyName);
  if (!said) return [];
  const head = said.replace(KIND_OF_FIRM, '');
  const alone = head !== said && head.length >= 4 && !wordsOf(head).every((word) => COMMON_WORDS.has(word));
  return alone ? [said, head] : [said];
}

/**
 * Where `shown` goes on after `name` at its front, or null when it does not
 * begin with it. Only letters and digits are compared, so "A&I Products" begins
 * with "A & I Products"; the name must end where a word of `shown` ends
 * ("Flextronics" does not begin with "Flex").
 */
function afterName(shown: string, name: string): number | null {
  const isWord = (char: string) => /[a-z0-9]/i.test(char);
  let at = 0;
  for (const char of name) {
    if (!isWord(char)) continue;
    while (at < shown.length && !isWord(shown[at])) at += 1;
    if (at >= shown.length || shown[at].toLowerCase() !== char.toLowerCase()) return null;
    at += 1;
  }
  if (at === 0 || (at < shown.length && isWord(shown[at]))) return null;
  return at;
}

/** A test for "this text is just the factory's town": "Bastrop", "St. Charles" for Saint Charles, "Rock Valley, IA". */
function townOf(city: string | null | undefined, state: string | null | undefined): (text: string) => boolean {
  const key = (text: string) =>
    wordsOf(text)
      .map((word) => ({ saint: 'st', fort: 'ft', mount: 'mt' })[word] ?? word)
      .join(' ');
  const town = key(city ?? '');
  const code = (state ?? '').trim().toLowerCase();
  return (text) => {
    if (!town) return false;
    const said = key(text);
    return said === town || (code !== '' && said === `${town} ${code}`);
  };
}

/** Words of a street address, and the abbreviations a registry writes for a building or a division. */
const NOT_A_NAME = new Set(
  ('street st avenue ave road rd boulevard blvd highway hwy drive dr suite ste route rte lane ln parkway pkwy box building bldg unit ' +
    'whse div dept mfg mfr plt fac facil faclt ctr dist hq wks sta intl dba fka').split(' ')
);
/** Short words a name may hold; any other word under four letters in a name from capitals is taken for initials ("Dvi", "Asu"). */
const SHORT_WORDS = new Set(['and', 'of', 'the', 'for', 'at', 'in', 'on', '&']);

/**
 * Whether what is left of a name written in capitals reads as a site's own
 * name ("Avionics Repair Facility") and not as an address or a code ("St Louis
 * Bldg 306", "Auburn Algona Whse", "Tractor-Peoria", "Mrotc"): two words or
 * more, each a whole word, no digit, nothing in brackets or joined by a hyphen,
 * a slash or a comma, no word of an address.
 */
function readsAsName(words: string[], rest: string): boolean {
  if (words.length < 2 || /[0-9/#(),-]/.test(rest)) return false;
  return words.every((word) => SHORT_WORDS.has(word) || (word.length >= 4 && /[aeiouy]/.test(word) && !NOT_A_NAME.has(word)));
}
