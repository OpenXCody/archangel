import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { factoryNameBesideCompany } from '../../shared/factoryName.ts';
import { titleSaysCareer } from '../../shared/jobs.ts';
import { cityState, titleCase } from '../../shared/places.ts';
import { jobRow, jobRowText, type JobListSays, type JobRowJob } from '../../client/src/lib/jobRow.ts';
import { jobPageTitle, jobTabTitle } from '../../client/src/lib/jobTitle.ts';
import { jobAsGiven, ownNameOf } from '../../server/lib/jobRows.ts';
import { readTitle } from '../../scripts/ingest/postings/read/title.mjs';
import { MIGRATIONS } from '../../scripts/migrate.mjs';

// How a job is named and placed on a screen: a job from a careers site by its career's title alone
// (job_title in migration 0088, held by the database; no level), with the opening's own name beside it
// (shared/jobOwnName.ts, given by the server as `ownName` on every job row); a row of any list of jobs
// by the one rule (client/src/lib/jobRow.ts: the first line is always a job's name); its factory without
// the company's name a second time where the company is named beside it, its place as "City, ST".

const beside = (name: string, company: string, city?: string, state?: string) => factoryNameBesideCompany({ name, city, state }, company);

test("a factory beside its company's tag is named without the company", () => {
  assert.equal(beside('John Deere Des Moines Works', 'John Deere', 'Ankeny', 'IA'), 'Des Moines Works');
  assert.equal(beside('Northrop Grumman Dulles Satellite Manufacturing Facility', 'Northrop Grumman', 'Dulles', 'VA'), 'Dulles Satellite Manufacturing Facility');
  assert.equal(beside('Boeing St. Louis', 'Boeing', 'Berkeley', 'MO'), 'St. Louis');
  assert.equal(beside('John Deere Reman', 'John Deere', 'Springfield', 'MO'), 'Reman');
  assert.equal(beside('GlobalFoundries Fab 8', 'GlobalFoundries', 'Malta', 'NY'), 'Fab 8');
  // The company is matched without its legal form, in any letter case, whatever stands between its words.
  assert.equal(beside('Dow Freeport Site B', 'Dow Inc.', 'Freeport', 'TX'), 'Freeport Site B');
  assert.equal(beside('A&I Products Rock Valley Works', 'A & I Products', 'Rock Valley', 'IA'), 'Rock Valley Works');
  assert.equal(beside('TESLA - Gigafactory Texas', 'Tesla', 'Austin', 'TX'), 'Gigafactory Texas');
});

test('nothing is left to say where the name is the company and the town: the place alone names the factory', () => {
  assert.equal(beside('SpaceX Bastrop', 'SpaceX', 'Bastrop', 'TX'), null);
  assert.equal(beside('Boeing St. Charles', 'Boeing', 'Saint Charles', 'MO'), null, '"St." and "Saint" are one town');
  assert.equal(beside('A&I Products Rock Valley', 'A & I Products', 'Rock Valley', 'IA'), null);
  assert.equal(beside('Rivian Normal, IL', 'Rivian', 'NORMAL', 'IL'), null);
  // The company's own name, with or without its legal form.
  assert.equal(beside('ANDURIL INDUSTRIES', 'Anduril Industries', 'LEXINGTON', 'MA'), null);
  assert.equal(beside('ANDURIL INDUSTRIES, INC', 'Anduril Industries', 'ATLANTA', 'GA'), null);
  assert.equal(beside('NORTHROP GRUMMAN CORP', 'Northrop Grumman', 'LAKE CHARLES', 'LA'), null);
  // A factory named for its town alone, whoever's it is.
  assert.equal(beside('Starbase', 'SpaceX', 'Starbase', 'TX'), null);
});

test("a name that begins with the company's is never given whole: where it cannot be cut to a site's own name, the place says it", () => {
  // The firm under its legal name, or another legal entity of it: cut short it would name nothing.
  assert.equal(beside('NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Northrop Grumman', 'IUKA', 'MS'), null);
  assert.equal(beside('Cargill Kitchen Solutions Inc', 'Cargill', 'Monticello', 'MN'), null);
  for (const form of ['Inc', 'LLC', 'Corp', 'Corporation', 'Co', 'Company', 'LP', 'Ltd']) {
    assert.equal(beside(`Acme Fasteners ${form}`, 'Acme', 'Tulsa', 'OK'), null, form);
  }
  // The rest of the firm's name, not a site's.
  assert.equal(beside('Volkswagen of America', 'Volkswagen', 'New Stanton', 'PA'), null);
  assert.equal(beside('Access Business Group, Nutrilite Division', 'Access Business', 'Lakeview', 'CA'), null);
  // A registry's line in capitals: an address or a code is not a name.
  assert.equal(beside('BOEING COMPANY THE ST LOUIS BLDG 306', 'Boeing', 'HAZELWOOD', 'MO'), null);
  assert.equal(beside('BOEING AUBURN ALGONA WHSE', 'Boeing', 'ALGONA', 'WA'), null);
  assert.equal(beside('BOEING MROTC', 'Boeing', 'OKLAHOMA CITY', 'OK'), null);
  assert.equal(beside('CATERPILLAR TRACTOR-PEORIA', 'Caterpillar', 'PEORIA', 'IL'), null);
  assert.equal(beside('ROHM & HAAS DVI LEMONT PLANT', 'Rohm & Haas', 'LEMONT', 'IL'), null);
  assert.equal(beside('ACME 1200 MAIN STREET PLANT', 'Acme', 'TULSA', 'OK'), null);
  // One that reads as a name is cut.
  assert.equal(beside('BOEING AVIONICS REPAIR FACILITY', 'Boeing', 'JACKSONVILLE', 'FL'), 'Avionics Repair Facility');

  // So no tag and no row beside a company's name says the company a second time: whatever the factory is called,
  // what is given does not begin with the company's name (the factories that still said it on the owner's screens).
  for (const [name, company, city, state] of [
    ['NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Northrop Grumman', 'SALT LAKE CITY', 'UT'], ['NORTHROP GRUMMAN SYSTEMS CORPORATION', 'Northrop Grumman', 'ELKTON', 'MD'],
    ['BOEING COMPANY THE ST LOUIS BLDG 306', 'Boeing', 'HAZELWOOD', 'MO'], ['BOEING MROTC', 'Boeing', 'OKLAHOMA CITY', 'OK'], ['BOEING AUBURN ALGONA WHSE', 'Boeing', 'ALGONA', 'WA'],
    ['CATERPILLAR TRACTOR-PEORIA', 'Caterpillar', 'PEORIA', 'IL'], ['John Deere Des Moines Works', 'John Deere', 'Ankeny', 'IA'], ['John Deere Harvester Works', 'John Deere', 'EAST MOLINE', 'IL'],
    ['Cargill Meat Solutions Corp', 'Cargill', 'Friona', 'TX'], ['TESLA INC', 'Tesla', 'FREMONT', 'CA'], ['Tesla Gigafactory Texas', 'Tesla', 'Austin', 'TX'],
    ['GENERAL MOTORS LLC ARLINGTON ASSEMBLY', 'General Motors', 'ARLINGTON', 'TX'], ['Lockheed Martin Aeronautics Co', 'Lockheed Martin', 'Fort Worth', 'TX'],
  ]) {
    const given = beside(name, company, city, state);
    assert.ok(given === null || !given.toLowerCase().startsWith(company.toLowerCase()), `${name}, of ${company}: "${given}"`);
  }
});

test('a name that does not begin with the company is the factory\'s own, and is given', () => {
  assert.equal(beside('Allegany Ballistics Laboratory', 'Northrop Grumman', 'Rocket Center', 'WV'), 'Allegany Ballistics Laboratory');
  assert.equal(beside('Flextronics International', 'Flex', 'Richardson', 'TX'), 'Flextronics International', 'the company ends where a word ends');
  // Named for its town, which only begins as the company does.
  assert.equal(beside('APPLE RIVER FIRE PROTECTION', 'Apple', 'APPLE RIVER', 'IL'), 'Apple River Fire Protection');
  // A company's other names are not known here: a factory filed under one is given as it is.
  assert.equal(beside('SPACE EXPLORATION TECHNOLOGIES CORP', 'SpaceX', 'BLOOMFIELD', 'CT'), 'Space Exploration Technologies Corp');
});

test('the town at the end of what is left is said by the place', () => {
  assert.equal(beside('Lucid AMP-1 (Casa Grande)', 'Lucid Motors', 'Casa Grande', 'AZ'), 'AMP-1');
  assert.equal(beside('Westlake Epoxy Deer Park', 'Westlake', 'Deer Park', 'TX'), 'Epoxy');
  assert.equal(beside('Lehigh White Cement Waco', 'Lehigh White Cement', 'Woodway', 'TX'), 'Waco', 'a town that is not the factory\'s own is its name');
  // At the front it is part of the site's name.
  assert.equal(beside('John Deere Dubuque Works', 'John Deere', 'Dubuque', 'IA'), 'Dubuque Works');
  // Before a bracket it is not: the bracket holds the site's name, and the place says the town once.
  assert.equal(beside('Applied Materials Billerica (NEXX)', 'Applied Materials', 'Billerica', 'MA'), 'NEXX');
  assert.equal(beside('Flex Austin (Research Blvd campus)', 'Flex', 'Austin', 'TX'), 'Research Blvd campus');
  assert.equal(beside('Northrop Grumman Palmdale (Air Force Plant 42)', 'Northrop Grumman', 'Palmdale', 'CA'), 'Air Force Plant 42');
  // The same for a name of the factory's own, which does not begin with the company.
  assert.equal(beside('Akoustis Canandaigua', 'SpaceX', 'Canandaigua', 'NY'), 'Akoustis');
});

test('a company named for the kind of firm it is has its sites named by the word before', () => {
  assert.equal(beside('Anduril Santa Ana', 'Anduril Industries', 'Santa Ana', 'CA'), null);
  assert.equal(beside('Anduril Quonset Point', 'Anduril Industries', 'North Kingstown', 'RI'), 'Quonset Point');
  assert.equal(beside('Micron Manassas', 'Micron Technology', 'Manassas', 'VA'), null);
  // Not where that word alone names nobody.
  assert.equal(beside('General Assembly Hall', 'General Motors', 'Flint', 'MI'), 'General Assembly Hall');
  assert.equal(beside('American Fork Works', 'American Industries', 'Provo', 'UT'), 'American Fork Works');
});

test('a factory with no name gives nothing, and one with no company its name', () => {
  assert.equal(beside('', 'Boeing', 'Everett', 'WA'), null);
  assert.equal(factoryNameBesideCompany({ name: null }, 'Boeing'), null);
  assert.equal(beside('MODERN FORGE INDIANA', '', 'Merrillville', 'IN'), 'Modern Forge Indiana');
  assert.equal(factoryNameBesideCompany({ name: 'Tesla Gigafactory Texas' }, null), 'Tesla Gigafactory Texas');
});

test("a job's title says its career when every word of the career is in it, in order", () => {
  for (const [title, career] of [
    // A job from a careers site is named for its career: the two are the same words.
    ['Welder', 'Welder'],
    ['NDT Technician (Ultrasonic)', 'NDT Technician (Ultrasonic)'],
    // A job a company titled by hand may say more, and still says its career.
    ['Senior Quality Engineer', 'Quality Engineer'],
    ['Mechanical Engineer III', 'Mechanical Engineer'],
    ['Tool & Die Maker', 'Tool and Die Maker'],
    ['CNC MACHINIST, 2nd shift', 'CNC Machinist'],
  ]) assert.equal(titleSaysCareer(title, career), true, `${title} / ${career}`);
  for (const [title, career] of [
    ['Weld Shop, Nights', 'Welder'],
    ['Engineer, Quality', 'Quality Engineer'],
    ['Machinist', 'CNC Machinist'],
    ['', 'Welder'],
  ]) assert.equal(titleSaysCareer(title, career), false, `${title} / ${career}`);
  // With no career to say, there is nothing a row would add.
  assert.equal(titleSaysCareer('Welder', null), true);
});

test('a place is "City, ST" in ordinary capitals', () => {
  assert.equal(cityState('COSTA MESA', 'CA'), 'Costa Mesa, CA');
  assert.equal(cityState('Ankeny', 'IA'), 'Ankeny, IA');
  assert.equal(cityState('  FORT   WORTH ', 'TX'), 'Fort Worth, TX');
  assert.equal(cityState(null, 'TX'), 'TX');
  assert.equal(cityState('', null), '');
  // A name that mixes capitals and small letters is kept as written; one in capitals gets its own.
  assert.equal(titleCase('McGregor'), 'McGregor');
  assert.equal(titleCase('DeSoto'), 'DeSoto');
  assert.equal(titleCase('MCHENRY'), 'McHenry');
  assert.equal(titleCase('McALLEN'), 'McAllen', 'a name that mixes cases and still shouts');
  assert.equal(titleCase("O'FALLON"), "O'Fallon");
  assert.equal(titleCase('WINSTON-SALEM'), 'Winston-Salem');
  assert.equal(titleCase('ST. LOUIS'), 'St. Louis');
  assert.equal(titleCase('round rock'), 'Round Rock');
  // A capital after a bracket and a slash too, and a state a source wrote into the city is said once.
  assert.equal(titleCase('BOSTON (BRIGHTON)'), 'Boston (Brighton)');
  assert.equal(cityState('BOSTON (BRIGHTON)', 'MA'), 'Boston (Brighton), MA');
  assert.equal(titleCase('WINSTON/SALEM'), 'Winston/Salem');
  assert.equal(cityState('KINGSVILLE, TX', 'TX'), 'Kingsville, TX');
  assert.equal(cityState('Kingsville, Tx', 'TX'), 'Kingsville, TX');
  assert.equal(cityState('La Grange, GA', 'TX'), 'La Grange, GA, TX', 'another state in the city is not this one');
});

test('the email to a company about a new applicant writes the place as every screen does', () => {
  const notices = readFileSync(new URL('../../server/lib/notices.ts', import.meta.url), 'utf8');
  assert.match(notices, /import \{ cityState \} from '\.\.\/\.\.\/shared\/places\.js';/);
  assert.match(notices, /place: cityState\(job\.city, job\.state\) \|\| null,/);
  assert.doesNotMatch(notices, /\[job\.city, job\.state\]/);
});

// --- A row of a list of jobs: its first line is always a job's name ------------------------------------------

/** A row as it reads, line by line: the first line (with its kind), the own name under it, the facts. */
const row = (job: JobRowJob, said?: JobListSays) => {
  const { head, second, facts } = jobRow(job, said);
  return [`${head.kind}: ${head.text}`, second ?? '', jobRowText(facts)];
};
/** The lines a row prints, top to bottom, with nothing for a line it does not have. */
const printed = (job: JobRowJob, said?: JobListSays) => {
  const { head, second, facts } = jobRow(job, said);
  return [head.text, second, jobRowText(facts) || null].filter((line): line is string => line !== null);
};
// A job from a careers site: named for its career, with the opening's own name beside it, at a factory that has a
// name of its own beside its company.
const WELDER: JobRowJob = { title: 'Welder', ownName: 'Production Welder', occupationTitle: 'Welder', companyName: 'John Deere', factoryName: 'John Deere Harvester Works', city: 'EAST MOLINE', state: 'IL' };
// One whose posting says nothing beyond the career, at a factory named for its company and its town.
const PLAIN: JobRowJob = { title: 'Welder', ownName: null, occupationTitle: 'Welder', companyName: 'SpaceX', factoryName: 'SpaceX Bastrop', city: 'Bastrop', state: 'TX' };
// Jobs a company posted by hand, under titles of its own: they have no own name beside the title.
const SENIOR: JobRowJob = { title: 'Senior Welder', occupationTitle: 'Welder', companyName: 'Acme Fabrication', factoryName: 'Acme Fabrication North Campus', city: 'Dallas', state: 'TX' };
const OWN_WORDS: JobRowJob = { ...SENIOR, title: 'Weld Shop, Nights' };
/** Every kind of heading a list of jobs stands under. */
const HEADINGS: JobListSays[] = [{}, { career: true }, { company: true }, { factory: true }, { career: true, company: true }, { career: true, factory: true }, { state: true }, { career: true, state: true }];

test("a row of jobs is its standard name, and says the posted title under it only where another row would read the same", () => {
  const welder = (ownName: string | null, city = 'Starbase'): JobRowJob => ({ title: 'Welder', ownName, occupationTitle: 'Welder', companyName: 'SpaceX', factoryName: 'Starbase', city, state: 'TX' });
  const a = welder('Pipe Welder (Starship)');
  const b = welder('Welder (Starship) - Night Shift');
  const c = welder('Welder, Bastrop', 'Bastrop');
  // Alone, or beside jobs elsewhere, a row is the standard name and nothing under it.
  assert.equal(jobRow(a).head.text, 'Welder');
  assert.equal(jobRow(a).second, null);
  assert.equal(jobRow(c, { among: [a, b, c] }).second, null);
  // Two of one career, company and town are told apart by what the company called each.
  assert.equal(jobRow(a, { among: [a, b, c] }).second, 'Pipe Welder (Starship)');
  assert.equal(jobRow(b, { among: [a, b, c] }).second, 'Welder (Starship) - Night Shift');
  // Under a heading that names the career the posted title leads, or the career where there is none: never a place.
  assert.deepEqual(jobRow(a, { career: true, company: true }).head, { kind: 'own', text: 'Pipe Welder (Starship)' });
  assert.deepEqual(jobRow(welder(null), { career: true, company: true }).head, { kind: 'name', text: 'Welder' });
});

test('a job a company titled its own way keeps its title as its first line, and says its career only where the title does not', () => {
  // "Senior Welder" says Welder: the career is not written under it, anywhere. It has no own name beside its title.
  assert.deepEqual(row(SENIOR), ['name: Senior Welder', '', 'Acme Fabrication · Dallas, TX']);
  assert.deepEqual(row(SENIOR, { career: true }), ['name: Senior Welder', '', 'Acme Fabrication · Dallas, TX']);
  // A title in the company's own words: the career stands under it, except under a heading that names the career.
  assert.deepEqual(row(OWN_WORDS), ['name: Weld Shop, Nights', '', 'Welder · Acme Fabrication · Dallas, TX']);
  assert.deepEqual(row(OWN_WORDS, { career: true }), ['name: Weld Shop, Nights', '', 'Acme Fabrication · Dallas, TX']);
  assert.deepEqual(row(OWN_WORDS, { factory: true }), ['name: Weld Shop, Nights', '', 'Welder']);
  assert.deepEqual(row(OWN_WORDS, { company: true }), ['name: Weld Shop, Nights', '', 'Welder · North Campus · Dallas, TX']);
});

test('after the names a row says what the job states: its shift, the kind of employment, its pay', () => {
  const stated: JobRowJob = { ...WELDER, shift: 'Night shift', employmentType: 'full-time', payMin: 2900, payMax: 3400, payPeriod: 'hour', postedAt: '2025-10-30T12:00:00Z', undated: true };
  assert.deepEqual(row(stated), ['name: Welder', '', 'John Deere · East Moline, IL · Night shift · Full-time · $29–$34 an hour']);
  assert.deepEqual(row(stated, { career: true, company: true }), ['own: Production Welder', '', 'Harvester Works · East Moline, IL · Night shift · Full-time · $29–$34 an hour · Listed Oct 30, 2025']);
  // What a job does not state is not said: no pay, no kind of employment, no shift.
  assert.deepEqual(jobRow(WELDER).facts.map((part) => part.kind), ['company', 'place']);
  // The card of the Jobs list picks its lines out of the same facts.
  const { facts } = jobRow(stated);
  assert.equal(jobRowText(facts, 'company'), 'John Deere');
  assert.equal(jobRowText(facts, 'site', 'place'), 'East Moline, IL');
  assert.equal(jobRowText(facts, 'pay'), '$29–$34 an hour');
});

test('a factory with no city on record is placed by its name, where the row does not say it already', () => {
  const nowhere = { ...WELDER, city: null };
  assert.deepEqual(row(nowhere), ['name: Welder', '', 'John Deere · John Deere Harvester Works, IL']);
  assert.deepEqual(row(nowhere, { company: true }), ['name: Welder', '', 'Harvester Works · IL']);
  assert.deepEqual(row(nowhere, { career: true, company: true }), ['own: Production Welder', '', 'Harvester Works · IL']);
  assert.deepEqual(row({ ...nowhere, state: null }, { career: true, company: true }), ['own: Production Welder', '', 'Harvester Works']);
});

test('every list of jobs is drawn by the one rule: no screen writes a job\'s row on its own', () => {
  const read = (file: string) => readFileSync(new URL(`../../client/src/${file}`, import.meta.url), 'utf8');
  // The three shapes a job row has (a record row, a panel row, the Jobs list's) each read the rule, and each draws
  // the first line and the own name under it where the rule gives them.
  for (const file of ['components/jobs/JobRow.tsx', 'components/map/panel/parts.tsx', 'pages/Jobs.tsx']) {
    assert.match(read(file), /const \{ head, second, facts \} = jobRow\(job, /, file);
    assert.match(read(file), /data-job-head=\{head\.kind\}/, file);
  }
  assert.match(read('components/jobs/JobRow.tsx'), /title=\{head\.kind === 'own' \? <span className="line-clamp-2">\{head\.text\}<\/span> : head\.text\}\s+second=\{second \?\? undefined\}/);
  for (const file of ['components/map/panel/parts.tsx', 'pages/Jobs.tsx']) {
    assert.match(read(file), /data-row-title>\s*\{head\.text\}/, file);
    assert.match(read(file), /\{second && \(\s*<(span|p) [^>]*line-clamp-2[^>]*data-row-second>\s*\{second\}/, file);
  }
  // No row is led by a company's mark any more: its first line is a name.
  for (const file of ['components/jobs/JobRow.tsx', 'components/map/panel/parts.tsx']) assert.doesNotMatch(read(file), /CompanyLogo/, file);
  // And each list says what stands above it.
  for (const [file, said] of [
    ['components/entity/OccupationDetailView.tsx', 'said={{ career: true }}'],
    ['components/entity/CompanyDetailView.tsx', 'said={{ company: true }}'],
    ['components/entity/FactoryDetailView.tsx', 'said={{ factory: true }}'],
    ['components/entity/CareerVersionView.tsx', 'said={{ career: true, company: true }}'],
    ['pages/JobDetail.tsx', 'said={{ career: true, company: true }}'],
    ['pages/JobDetail.tsx', 'said={{ factory: true }}'],
    ['components/map/panel/OccupationView.tsx', 'said={{ career: true }}'],
    ['components/map/panel/CompanyView.tsx', 'said={{ company: true }}'],
    ['components/map/panel/FactoryView.tsx', 'said={{ factory: true }}'],
  ]) assert.ok(read(file).includes(said), `${file}: ${said}`);
  // A skill's page says none of them: its rows are the job's names, its company and its place.
  assert.match(read('components/entity/SkillDetailView.tsx'), /<OpenJobsSection jobs=\{jobs\} total=/);
});

// --- A job's own page: whose variant of the career it is ----------------------------------------------------

test("a job from a careers site is titled as its company's variant of the career, and one posted here as its poster wrote", () => {
  const sourced = { title: 'Welder', ownName: 'Pipe Welder (Starship)', fromSource: true, companyName: 'SpaceX', occupationTitle: 'Welder' };
  assert.equal(jobPageTitle(sourced), 'SpaceX Welder');
  assert.equal(jobPageTitle({ ...sourced, companyName: 'John Deere', occupationTitle: 'MIG Welder', title: 'MIG Welder' }), 'John Deere MIG Welder');
  // The company as people say it: a legal form at the end of its name is left off, as on a version's page.
  assert.equal(jobPageTitle({ ...sourced, companyName: 'Dow Inc.', occupationTitle: 'Chemical Operator' }), 'Dow Chemical Operator');
  assert.equal(jobPageTitle({ ...sourced, companyName: 'APEX MANUFACTURING CORP' }), 'Apex Manufacturing Welder');
  // The tab is the page's title, then the opening's own name where it has one.
  assert.equal(jobTabTitle(sourced), 'SpaceX Welder · Pipe Welder (Starship)');
  assert.equal(jobTabTitle({ ...sourced, ownName: null }), 'SpaceX Welder');
  // A job posted here keeps the title its poster wrote; its tab names it as running text does.
  const posted = { title: 'Line Lead II', ownName: null, fromSource: false, companyName: 'Acme Fabrication Inc.', occupationTitle: 'Production Supervisor' };
  assert.equal(jobPageTitle(posted), 'Line Lead II');
  assert.equal(jobTabTitle(posted), 'Line Lead II at Acme Fabrication Inc');

  // The page draws them: the title, the own name directly under it as plain text, and the standard career as the tag.
  const page = readFileSync(new URL('../../client/src/pages/JobDetail.tsx', import.meta.url), 'utf8');
  assert.match(page, /title=\{jobPageTitle\(data\.job\)\}/);
  assert.match(page, /data\.job\.ownName \? \(\s*<p [^>]*data-job-own-name>\s*\{data\.job\.ownName\}/);
  assert.match(page, /<CareerTag career=\{\{ id: career\.id, title: career\.title \}\} data-job-standard="" \/>/);
  assert.match(page, /jobTabTitle\(job\.data\.job\)/);
  // Nothing on the page says "Posted as": the own name is a name, not a label.
  assert.doesNotMatch(page.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /Posted as|posted as/);
});

// --- The server gives the own name and never the posted title -----------------------------------------------

test("the server gives the posted title as a job's own name, and nothing where it says no more than the career", () => {
  const starbase = { postedAs: 'Pipe Welder  (Starship) ', occupationTitle: 'Welder', companyName: 'SpaceX', factoryName: 'Starbase', city: 'Starbase', state: 'TX' };
  assert.equal(ownNameOf(starbase), 'Pipe Welder (Starship)');
  assert.equal(ownNameOf({ ...starbase, postedAs: 'WELDER' }), null);
  assert.equal(ownNameOf({ ...starbase, postedAs: null }), null);
  const given = jobAsGiven({ id: 'j1', title: 'Welder', ...starbase });
  assert.equal(given.ownName, 'Pipe Welder (Starship)');
  assert.ok(!('postedAs' in given));
});

test('every statement that gives job rows goes through the one helper, and none gives the posted title', () => {
  const source = (file: string) => readFileSync(new URL(`../../server/${file}`, import.meta.url), 'utf8');
  const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;
  // The statements written with the builder select the posted title under the one key the helper reads and drops,
  // and hand every row to it: as many selects of the column as calls of the helper in each file.
  for (const [file, statements] of [['routes/jobs.ts', 2], ['routes/search.ts', 1], ['routes/employer.ts', 1], ['routes/me.ts', 1], ['lib/openJobs.ts', 1]] as const) {
    const text = source(file);
    // jobs.ts selects it once, in the columns its list and its one job share.
    assert.equal(count(text, /postedAs: jobs\.postedAs/g), file === 'routes/jobs.ts' ? 1 : statements, `${file} selects the posted title`);
    assert.equal(count(text, /jobAsGiven[()]/g), statements, `${file} hands its rows to jobAsGiven`);
    assert.equal(count(text, /posted_as/g), 0, `${file} names the column only through the schema`);
  }
  // The two written by hand (a region's and an industry's) take their columns and their rows from the helper.
  for (const file of ['routes/map.ts', 'routes/industries.ts']) {
    const text = source(file);
    assert.match(text, /SELECT \$\{jobRowColumns\('j', 'f', 'c'\)\},/, file);
    assert.match(text, /\.map\(jobRowGiven\)/, file);
    assert.equal(count(text, /posted_as|postedAs/g), 0, `${file} does not name the posted title itself`);
  }
  // Every other list of jobs is listOpenJobs: a company's, a factory's, a career's and a skill's page, a version's jobs.
  for (const file of ['routes/companies.ts', 'routes/factories.ts', 'routes/occupations.ts', 'routes/skills.ts', 'lib/versions.ts']) {
    const text = source(file);
    assert.match(text, /listOpenJobs\(/, file);
    assert.equal(count(text, /posted_as|postedAs/g), 0, `${file} does not read the posted title`);
  }
  for (const file of ['lib/notices.ts', 'lib/postings.ts', 'lib/careers.ts', 'routes/admin.ts']) assert.equal(count(source(file), /posted_as|postedAs/g), 0, `${file} does not read the posted title`);
  // The helper is the one place a row's posted title is read and let go; the search matches it and gives nothing.
  const helper = source('lib/jobRows.ts');
  assert.match(helper, /const \{ postedAs: _never, \.\.\.given \} = row;/);
  assert.match(helper, /return \{ \.\.\.given, ownName: ownNameOf\(row\) \};/);
  assert.equal(count(source('lib/jobSearch.ts'), /posted_as/g), 2, 'named once in the note and once in the condition');
  // No answer is written with the posted title in it.
  for (const file of ['routes/jobs.ts', 'routes/search.ts', 'routes/employer.ts', 'routes/me.ts', 'routes/map.ts', 'routes/industries.ts']) {
    assert.doesNotMatch(source(file), /res\.json\([^)]*postedAs/, file);
  }
});

// --- The rule itself is the database's (migration 0088): what the files can hold it to -----------------------

const migration = readFileSync(new URL('../../migrations/0088_job_names.sql', import.meta.url), 'utf8');
/** The migration's SQL without its comments: what it does, apart from what it says. */
const statements = migration.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');

test("a job's name is its career's title alone: the rule reads no level", () => {
  // One function of the career, written once.
  assert.equal((statements.match(/CREATE OR REPLACE FUNCTION job_title\(/g) ?? []).length, 1);
  assert.match(statements, /CREATE OR REPLACE FUNCTION job_title\(p_career text\) RETURNS text/);
  // Every call gives it one thing, a career's title: no level reaches it.
  const calls = [...statements.matchAll(/job_title\(((?:[^()]|\([^()]*\))*)\)/g)].map((m) => m[1]).filter((inside) => inside !== 'p_career text');
  assert.ok(calls.length >= 4, `the trigger, the rename and the back-fill call it (${calls.length})`);
  for (const inside of calls) assert.doesNotMatch(inside, /level|,/, `job_title(${inside})`);
  // The trigger that names a job reads its career and nothing of its level; a level that changes fires no rename.
  const names = statements.slice(statements.indexOf('CREATE OR REPLACE FUNCTION job_takes_its_name()'), statements.indexOf('CREATE TRIGGER jobs_title_is_career '));
  assert.ok(names.length > 200);
  assert.doesNotMatch(names, /level_word|level_rank/);
  // The level a posting states is still stored by a run, as before: the write and the snapshot keep both columns.
  assert.match(statements, /level_word = p_want->>'level_word', level_rank = \(p_want->>'level_rank'\)::smallint/);
  assert.match(statements, /'level_word', j\.level_word, 'level_rank', j\.level_rank/);
  // No word of a level is put in a name anywhere in the file.
  assert.doesNotMatch(statements, /'Senior'|'Principal'|'III'|Entry-Level/);
});

test('the reader still says the level a title states: it is kept as a fact, not as part of a name', () => {
  assert.equal(readTitle('Sr. Staff Systems Engineer - 20504').level?.word, 'Staff');
  assert.equal(readTitle('ENGINEER MECHANICAL 3').level?.word, 'III');
  assert.equal(readTitle('Systems Engineer E4').level?.word, 'E4');
});

test('the migration is in the runner, holds the name by triggers and keeps the posted title', () => {
  assert.ok(MIGRATIONS.includes('0088_job_names.sql'));
  assert.match(statements, /CREATE TRIGGER jobs_title_is_career BEFORE INSERT OR UPDATE ON jobs/);
  assert.match(statements, /CREATE TRIGGER occupations_title_renames_jobs AFTER UPDATE OF title ON occupations/);
  assert.match(statements, /ADD COLUMN IF NOT EXISTS posted_as text/);
  // A run compares the employer's title with the employer's title, and writes it to posted_as, never to the name.
  assert.match(statements, /'title', coalesce\(j\.posted_as, j\.title\)/);
  assert.match(statements, /posted_as = p_want->>'title'/);
  const write = statements.slice(statements.indexOf('CREATE OR REPLACE FUNCTION posting_job_write'), statements.indexOf('DO $$'));
  assert.doesNotMatch(write, /[^_.]title = /, 'a run does not write the title');
  // A job that has a source always has its posted title: the back-fill takes the title each job carried, and a check holds it after.
  assert.match(statements, /UPDATE jobs j SET posted_as = j\.title\s+WHERE j\.source IS NOT NULL AND j\.posted_as IS NULL/);
  assert.match(statements, /CHECK \(source IS NULL OR \(posted_as IS NOT NULL AND btrim\(posted_as\) <> ''\)\)/);
  // Only a write that names posted_as changes it: the trigger never takes it from the title of an existing job.
  const trigger = statements.slice(statements.indexOf('CREATE OR REPLACE FUNCTION job_takes_its_name()'), statements.indexOf('CREATE TRIGGER jobs_title_is_career '));
  assert.equal((trigger.match(/NEW\.posted_as := /g) ?? []).length, 2, 'set in two places: a new job, and a write that would empty it');
  assert.match(trigger, /IF btrim\(coalesce\(NEW\.posted_as, ''\)\) = '' THEN NEW\.posted_as := NEW\.title; END IF;/);
  assert.match(trigger, /ELSIF btrim\(coalesce\(NEW\.posted_as, ''\)\) = '' THEN\s+NEW\.posted_as := OLD\.posted_as;/);
  // A snapshot that names a career the catalogue has removed since leaves the job's career as it is (an undo of an older run).
  assert.match(write, /occupation_id = coalesce\(\(SELECT o\.id FROM occupations o WHERE o\.id = \(p_want->>'occupation_id'\)::uuid\), occupation_id\)/);
});
