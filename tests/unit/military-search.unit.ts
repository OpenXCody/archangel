// What names a military career in a search (shared/military.ts), read against
// the careers the repository loads, and the rule reach is listed by
// (shared/reach.ts), read against the two sets of paths.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { reaches } from '../../scripts/build-military-sql.mjs';
import { isPlainCode, kindLine, namedCareers, namedService, namesCareer, namesForSure, readMilitaryQuery, saidService, careerKind, type NameableCareer } from '../../shared/military';
import { REACH_MIN_PATH, byReach, reachOrClosest, reached, withinReach } from '../../shared/reach';
import { US_STATES } from '../../shared/states';

interface FileCareer {
  title: string;
  officialTitle: string;
  service: string;
  code: string;
  codeSystem: string;
  was: string[];
}
type PathEntry = string | { skill: string };
const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const file = read<{ careers: FileCareer[] }>('data/careers/military/careers.json').careers;
/** The careers as the search reads them: the service's title and the other names, as the database holds them. */
const careers: (NameableCareer & { title: string })[] = file.map((career) => ({
  title: career.title,
  service: career.service,
  code: career.code,
  codeSystem: career.codeSystem,
  officialTitle: career.officialTitle,
  names: career.was,
}));
const named = (query: string) => namedCareers(query, careers).map((career) => career.title);
/** The same, as the one search that asks for a military career reads it (Profile's door). */
const asked = (query: string) => namedCareers(query, careers, { asking: true }).map((career) => career.title);
/** The careers a query names that it can be nothing but: those lead a search's results. */
const leading = (query: string) => {
  const read = readMilitaryQuery(query);
  return read ? namedCareers(query, careers).filter((career) => namesForSure(read, career)).map((career) => career.title) : [];
};
const SHORT: Record<string, string> = { navy: 'Navy', army: 'Army', 'air-force': 'Air Force' };

test('a code typed alone names its career, in any letter case', () => {
  assert.deepEqual(named('HT'), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(named('ht'), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(named(' Ht. '), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(named('15T'), ['Army UH-60 Helicopter Repairer/Aircrew Member']);
  assert.deepEqual(named('15t'), ['Army UH-60 Helicopter Repairer/Aircrew Member']);
  assert.deepEqual(named('2A3X3'), ['Air Force Tactical Aircraft Maintenance']);
  assert.deepEqual(named('2a3x3'), ['Air Force Tactical Aircraft Maintenance']);
});

test('an Air Force code takes a skill level where it has its X, and only there', () => {
  for (const level of ['1', '3', '5', '7', '9']) assert.deepEqual(named(`2A3${level}3`), ['Air Force Tactical Aircraft Maintenance'], level);
  assert.deepEqual(named('2A3X'), []);
  assert.deepEqual(named('2B353'), []);
  // An Army code has no such place: a digit for a letter is another code.
  assert.deepEqual(named('155'), []);
});

test('letters that ordinarily mean something else name nothing by themselves', () => {
  // The brief's three, whether or not a career carries them today.
  for (const plain of ['IT', 'AM', 'ET', 'it', 'am', 'et']) assert.deepEqual(named(plain), [], plain);
  // A rating that is loaded later under such letters changes nothing.
  const it: NameableCareer = { service: 'navy', code: 'IT', codeSystem: 'navy-rating', officialTitle: 'Information Systems Technician', names: ['Navy IT'] };
  assert.deepEqual(namedCareers('IT', [it]), []);
  assert.deepEqual(namedCareers('navy it', [it]), [it]);
  assert.deepEqual(namedCareers('navy IT rating', [it]), [it]);
  // Nor beside the system's word alone: "IT rating", "IC rating" and "PR rating" are said of other things.
  assert.deepEqual(namedCareers('IT rating', [it]), []);
  for (const plain of ['ic rating', 'pr rating', 'as rating', 'at rating', 'ft rating', 'mm rating', 'AM rating']) assert.deepEqual(named(plain), [], plain);
  // A state's postal code is the state, wherever it is typed.
  for (const state of US_STATES) assert.ok(isPlainCode(state.code), state.code);
  for (const code of ['MN', 'MT', 'UT']) assert.deepEqual(named(code), [], code);
  // A code with a digit is never an ordinary word.
  for (const career of file) if (/\d/.test(career.code)) assert.ok(!isPlainCode(career.code), career.code);
});

test('which letter codes count alone is a list a person reads, held here', () => {
  const letters = file.filter((career) => !/\d/.test(career.code)).map((career) => career.code);
  // Every letter code is a Navy rating, and no two careers share a code.
  assert.ok(file.every((career) => /\d/.test(career.code) || career.codeSystem === 'navy-rating'));
  assert.equal(new Set(file.map((career) => `${career.codeSystem} ${career.code}`)).size, file.length);
  assert.deepEqual(
    letters.filter((code) => !isPlainCode(code)).sort(),
    ['ABE', 'ABF', 'AME', 'AO', 'CTM', 'EMN', 'ETN', 'ETV', 'FC', 'GSE', 'GSM', 'HT', 'MMN', 'RW', 'STG', 'STS']
  );
  assert.deepEqual(
    letters.filter(isPlainCode).sort(),
    ['AD', 'AE', 'AM', 'AS', 'AT', 'CE', 'CM', 'EM', 'EN', 'ET', 'FCA', 'FT', 'GM', 'IC', 'MM', 'MMA', 'MN', 'MR', 'MT', 'PR', 'SW', 'TM', 'UT']
  );
  // The catalogue's own other names for skills are the reason for three of them: a skill is found under those letters.
  const skillNames = read<{ skills: { name: string; aliases?: string[]; was?: string[] }[] }>('data/skills/catalogue.json').skills.flatMap((skill) => [
    skill.name,
    ...(skill.aliases ?? []),
    ...(skill.was ?? []),
  ]);
  const alsoSkills = letters.filter((code) => skillNames.some((name) => name.toUpperCase() === code));
  assert.deepEqual(alsoSkills.sort(), ['ET', 'MT', 'UT']);
  for (const code of alsoSkills) assert.ok(isPlainCode(code), `${code} is a name the catalogue has for a skill`);
});

test('every career is named by its code: alone unless the letters are plain, and always with its service or its system', () => {
  for (const career of file) {
    const alone = named(career.code);
    if (isPlainCode(career.code)) assert.deepEqual(alone, [], `${career.code} alone`);
    else assert.deepEqual(alone, [career.title], `${career.code} alone`);
    // With the service, its own career comes first; a code that begins others' may bring them after it.
    assert.equal(named(`${SHORT[career.service]} ${career.code}`)[0], career.title, `${SHORT[career.service]} ${career.code}`);
    assert.equal(named(`${career.code} ${SHORT[career.service].toLowerCase()}`)[0], career.title);
    const word = { 'navy-rating': 'rating', 'army-mos': 'MOS', afsc: 'AFSC' }[career.codeSystem] as string;
    // With its system's word and nothing else: unless the letters are plain, which want the service as well.
    const plain = isPlainCode(career.code);
    assert.deepEqual(named(`${career.code} ${word}`), plain ? [] : [career.title], `${career.code} ${word}`);
    assert.deepEqual(named(`${word} ${career.code.toLowerCase()}`), plain ? [] : [career.title]);
    assert.equal(named(`${SHORT[career.service]} ${career.code} ${word}`)[0], career.title);
    // The search that asks for a military career takes every code, alone and with its word.
    assert.deepEqual(asked(career.code), [career.title], `asked ${career.code}`);
    assert.deepEqual(asked(`${career.code} ${word}`), [career.title], `asked ${career.code} ${word}`);
    // Its whole title names it, and so does every other name it goes by that says its service.
    assert.ok(named(career.title).includes(career.title), career.title);
    for (const other of career.was) if (/^(Navy|Army|Air Force) /.test(other)) assert.ok(named(other).includes(career.title), other);
  }
});

test('the service with words of the title names the career', () => {
  assert.deepEqual(named('Navy hull'), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(named('navy hull tech'), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(named('hull navy'), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(named('U.S. Navy hull maintenance'), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(named('us navy hull'), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(named('usn hull'), ['Navy Hull Maintenance Technician']);
  assert.ok(named('air force avionics').length > 1);
  assert.ok(named('air force avionics').every((title) => title.startsWith('Air Force ') && /Avionic/.test(title)));
  assert.ok(named('usaf tactical aircraft').includes('Air Force Tactical Aircraft Maintenance'));
  assert.ok(named("navy machinist's mate").includes("Navy Machinist's Mate"));
  assert.ok(named('navy machinists mate').includes("Navy Machinist's Mate"));
  // Every word has to belong: a word of no title, or of another service's, names nothing.
  assert.deepEqual(named('navy yard'), []);
  assert.deepEqual(named('navy blue paint'), []);
  assert.deepEqual(named('army hull maintenance'), []);
  assert.deepEqual(named('navy helicopter repairer'), []);
  // The code first: the rating itself before the ratings whose codes begin with its letters.
  assert.deepEqual(named('Navy ET'), ['Navy Electronics Technician']);
  assert.deepEqual(named('navy am'), ['Navy Aviation Structural Mechanic']);
  // A name typed whole is that career before the ones whose names hold it.
  assert.equal(named('Navy Electronics Technician')[0], 'Navy Electronics Technician');
  assert.ok(named('Navy Electronics Technician').includes('Navy Aviation Electronics Technician'));
});

test('one or two letters begin no word of a title, and joining words are not read', () => {
  // On the way to "Air Force Plant 42", "Army Corps of Engineers", "Navy Yard": nothing until a word is begun in earnest.
  for (const query of ['navy a', 'navy e', 'navy m', 'navy hu', 'army c', 'army d', 'army 1', 'army 9', 'air force p', 'air force pl', 'air force 2']) {
    assert.deepEqual(named(query), [], query);
  }
  assert.deepEqual(named('navy hul'), ['Navy Hull Maintenance Technician']);
  // A whole word of the title counts whatever its length.
  assert.ok(named('army m1 tank').includes('Army M1 Abrams Tank System Maintainer'));
  assert.deepEqual(named('navy and'), []);
  assert.deepEqual(named('navy of the'), []);
  assert.deepEqual(named('the navy hull'), ['Navy Hull Maintenance Technician']);
  assert.ok(named("navy aviation boatswain's mate launching and recovery").length === 1);
});

test('a code as its holder writes it: an Army code with its skill level', () => {
  assert.deepEqual(named('91B10'), ['Army Wheeled Vehicle Mechanic']);
  assert.deepEqual(named('91b1o'), ['Army Wheeled Vehicle Mechanic']);
  assert.deepEqual(named('15T30'), ['Army UH-60 Helicopter Repairer/Aircrew Member']);
  assert.deepEqual(named('MOS 91B20'), ['Army Wheeled Vehicle Mechanic']);
  // Not any tail: a level is one to five, and one more character.
  assert.deepEqual(named('91B1'), []);
  assert.deepEqual(named('91B99'), []);
  assert.deepEqual(named('91B100'), []);
  // A Navy rating has no such form.
  assert.deepEqual(named('HT10'), []);
});

test('"specialty" is the Army\'s word as well as the Air Force\'s, and "code" beside it is part of it', () => {
  assert.deepEqual(named('army specialty 15t'), ['Army UH-60 Helicopter Repairer/Aircrew Member']);
  assert.deepEqual(named('air force specialty code 2a3x3'), ['Air Force Tactical Aircraft Maintenance']);
  assert.deepEqual(named('specialty 15t'), ['Army UH-60 Helicopter Repairer/Aircrew Member']);
  assert.deepEqual(named('navy specialty'), []);
  assert.deepEqual(named('HT specialty'), []);
});

test('a named career leads only when the query can be nothing else', () => {
  // A code with a digit, or a code beside its service or its system's word.
  assert.deepEqual(leading('15T'), ['Army UH-60 Helicopter Repairer/Aircrew Member']);
  assert.deepEqual(leading('2a353'), ['Air Force Tactical Aircraft Maintenance']);
  assert.deepEqual(leading('91B10'), ['Army Wheeled Vehicle Mechanic']);
  assert.deepEqual(leading('navy ht'), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(leading('HT rating'), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(leading('navy am'), ['Navy Aviation Structural Mechanic']);
  // Letters alone are also how companies' names begin: listed, and leading nothing.
  for (const career of file) {
    if (/\d/.test(career.code) || isPlainCode(career.code)) continue;
    assert.deepEqual(named(career.code), [career.title], career.code);
    assert.deepEqual(leading(career.code), [], career.code);
  }
  // A service's word beside words of a title is also a plant's name ("Army Ammunition Plant").
  assert.deepEqual(named('army ammunition'), ['Army Ammunition Specialist']);
  assert.deepEqual(leading('army ammunition'), []);
  assert.deepEqual(leading('Navy hull'), []);
  assert.deepEqual(leading('navy ratings'), []);
});

test('a service\'s name and nothing else names the service, and no career', () => {
  assert.equal(namedService('navy'), 'navy');
  assert.equal(namedService('U.S. Navy'), 'navy');
  assert.equal(namedService('the us army'), 'army');
  assert.equal(namedService('Air Force'), 'air-force');
  assert.equal(namedService('usaf'), 'air-force');
  assert.equal(namedService('marine corps'), 'marine-corps');
  assert.equal(namedService('USMC'), 'marine-corps');
  for (const query of ['nav', 'navy yard', 'navy hull', 'navy ratings', 'army ammunition', 'air', 'force', 'marine', 'corps', 'welder', '']) {
    assert.equal(namedService(query), null, query);
  }
});

test('the search that asks for a military career reads the words beside a service among that service\'s careers', () => {
  assert.deepEqual(saidService('air force crew chief'), { service: 'air-force', rest: 'crew chief' });
  assert.deepEqual(saidService('usn welding'), { service: 'navy', rest: 'welding' });
  assert.equal(saidService('navy'), null);
  assert.equal(saidService('crew chief'), null);
  // There every code counts: the letters can mean nothing else.
  assert.deepEqual(asked('am'), ['Navy Aviation Structural Mechanic']);
  assert.deepEqual(asked('IC rating'), ['Navy Interior Communications Electrician']);
  assert.deepEqual(asked('2A353'), ['Air Force Tactical Aircraft Maintenance']);
  assert.deepEqual(asked('usn ht'), ['Navy Hull Maintenance Technician']);
  assert.deepEqual(asked('army mechanic 91b'), ['Army Wheeled Vehicle Mechanic']);
  // And a title without its service is still not named by the rule: the list's own search of titles finds it.
  assert.deepEqual(asked('hull maintenance technician'), []);
});

test('a service alone, a plain title and an ordinary search name no military career', () => {
  for (const query of [
    'navy', 'Army', 'air force', 'U.S. Navy', 'marine corps', 'marines',
    'welder', 'electronics technician', 'hull maintenance technician', 'machinist', 'aircraft mechanic', 'technician',
    'rating', 'mos', 'specialty', 'pressure rating', 'specialty chemicals', 'fire rating plate',
    'tesla', 'texas', 'tx', 'cnc', 'plc', 'qa', 'weld', 'a', '', '   ',
  ]) {
    assert.deepEqual(named(query), [], `“${query}”`);
  }
  assert.equal(readMilitaryQuery('electronics technician'), null);
  assert.equal(readMilitaryQuery('navy'), null);
});

test('the system\'s word with the service names every career of that system, and never another service\'s', () => {
  assert.equal(named('navy ratings').length, file.filter((career) => career.service === 'navy').length);
  assert.equal(named('Navy rating').length, named('navy ratings').length);
  assert.equal(named('army mos').length, file.filter((career) => career.service === 'army').length);
  assert.equal(named('air force specialties').length, file.filter((career) => career.service === 'air-force').length);
  assert.deepEqual(named('navy mos'), []);
  assert.deepEqual(named('army rating'), []);
  assert.deepEqual(named('marine corps mos'), []);
  // The word narrows as well as names: "Navy rating hull" is still the one rating.
  assert.deepEqual(named('navy rating hull'), ['Navy Hull Maintenance Technician']);
  // A code under another system's word is not that code.
  assert.deepEqual(named('HT mos'), []);
  assert.deepEqual(named('15T rating'), []);
});

test('a civilian career is never named, whatever is typed', () => {
  const civilian: NameableCareer = { service: null, code: null, codeSystem: null, officialTitle: null, names: ['Navy Welder', 'HT'] };
  for (const query of ['HT', 'navy welder', 'navy ratings']) {
    const asked = readMilitaryQuery(query);
    assert.ok(asked, query);
    assert.equal(namesCareer(asked, civilian), false, query);
  }
});

test('the grey line of a military career is its kind and its code', () => {
  assert.equal(kindLine(careerKind('navy-rating'), 'HT'), 'Navy rating · HT');
  assert.equal(kindLine(careerKind('army-mos'), '15T'), 'Army MOS · 15T');
  assert.equal(kindLine(careerKind('afsc'), '2A3X3'), 'Air Force specialty · 2A3X3');
  assert.equal(kindLine('Navy rating', null), 'Navy rating');
  assert.equal(kindLine(null, 'HT'), null);
});

test('within reach: a third of a path of five skills or more', () => {
  assert.equal(REACH_MIN_PATH, 5);
  assert.equal(withinReach(12, 19), true);
  assert.equal(withinReach(7, 19), true);
  assert.equal(withinReach(6, 19), false);
  assert.equal(withinReach(2, 6), true);
  assert.equal(withinReach(1, 6), false);
  assert.equal(withinReach(5, 15), true);
  assert.equal(withinReach(4, 15), false);
  // A path of fewer than five skills says too little, however much of it is held.
  assert.equal(withinReach(4, 4), false);
  assert.equal(withinReach(2, 5), true);
  assert.equal(withinReach(0, 5), false);
  assert.equal(withinReach(0, 0), false);
});

test('Profile says "within reach" by the same rule, and lists the closest careers when none is', () => {
  const closest = [
    { title: 'Maintenance Technician', held: 6, total: 22 },
    { title: 'Robotics Technician', held: 4, total: 15 },
    { title: 'Laser Technician', held: 3, total: 14 },
  ];
  // A rating that reaches nothing by a third: the same careers, said to be the closest and not within reach.
  assert.deepEqual(reachOrClosest(closest), { within: false, careers: closest });
  // With some within reach, only those, in the order given.
  const mixed = [{ title: 'MIG Welder', held: 10, total: 14 }, closest[0], { title: 'Welder', held: 12, total: 19 }, closest[1]];
  assert.deepEqual(reachOrClosest(mixed), { within: true, careers: [mixed[0], mixed[2]] });
  assert.deepEqual(reachOrClosest([]), { within: false, careers: [] });
  // Whatever is listed as within reach passes the rule the two pages' sections are held to.
  assert.ok(reachOrClosest(mixed).careers.every((career) => withinReach(career.held, career.total)));
});

test('reach is listed by the share held, then the skills held, then the title', () => {
  const list = [
    { title: 'Welder', held: 12, total: 19 },
    { title: 'MIG Welder', held: 10, total: 14 },
    { title: 'Metal Fabricator', held: 13, total: 19 },
    { title: 'B', held: 4, total: 6 },
    { title: 'A', held: 6, total: 9 },
    { title: 'C', held: 4, total: 6 },
    { title: 'Too little', held: 2, total: 19 },
    { title: 'Too short', held: 4, total: 4 },
  ];
  assert.deepEqual(reached(list).map((career) => career.title), ['MIG Welder', 'Metal Fabricator', 'A', 'B', 'C', 'Welder']);
  // The same share exactly (6 of 9, 4 of 6): the more skills held first, then by title.
  assert.ok(byReach({ title: 'A', held: 6, total: 9 }, { title: 'B', held: 4, total: 6 }) < 0);
  assert.ok(byReach({ title: 'B', held: 4, total: 6 }, { title: 'C', held: 4, total: 6 }) < 0);
  // The list given is not reordered.
  assert.equal(list[0].title, 'Welder');
});

test('the rule lists what the paths say: the Hull Maintenance Technician against the civilian careers', () => {
  // Every pair of paths, counted from the files as the database counts them, then put through the page's rule.
  const civilianPaths = read<{ careers: { title: string; skills: PathEntry[] }[] }>('data/careers/paths.json');
  const militaryPaths = read<{ careers: { title: string; skills: string[] }[] }>('data/careers/military/paths.json');
  const all = reaches(militaryPaths, civilianPaths, 1000) as Map<string, { career: string; held: number; of: number }[]>;
  const within = (title: string) => reached((all.get(title) ?? []).map((reach) => ({ title: reach.career, held: reach.held, total: reach.of })));
  const ht = within('Navy Hull Maintenance Technician');
  assert.deepEqual(ht.slice(0, 3).map((career) => `${career.title} ${career.held}/${career.total}`), ['MIG Welder 10/14', 'Metal Fabricator 13/19', 'Welder 12/19']);
  assert.ok(ht.every((career) => career.held * 3 >= career.total && career.total >= 5));
  // The other way: the careers that reach Welder, the most covering first.
  const welder = reached(
    [...all].flatMap(([title, list]) => list.filter((reach) => reach.career === 'Welder').map((reach) => ({ title, held: reach.held, total: reach.of })))
  );
  assert.deepEqual(welder.map((career) => `${career.title} ${career.held}/${career.total}`), [
    'Army Allied Trades Specialist 14/19',
    'Navy Steelworker 13/19',
    'Navy Hull Maintenance Technician 12/19',
    'Air Force Aircraft Metals Technology 11/19',
  ]);
  // Some military careers reach no civilian career by a third: the catalogue has no career for that work.
  const none = [...all.keys()].filter((title) => within(title).length === 0);
  assert.ok(none.length > 0 && none.length < all.size / 3, `${none.length} reach none`);
});
