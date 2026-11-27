import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { jobOwnName, readJobOwnName, type JobAbout } from '../../shared/jobOwnName.ts';

// A job's own name (shared/jobOwnName.ts): the employer's title for an opening with everything the page already states
// elsewhere cut out, shown as the company wrote it otherwise, and none when it says nothing beyond the career.
//
//   tests/fixtures/jobs/own-names.json   real postings chosen by hand, each with the name wanted (the wanted names
//                     were written by a person, not taken from the function)
//   tests/fixtures/jobs/own-names-collected.jsonl   every title collected (the live list, a local copy, the reader's
//                     fixture), which is not kept in the repository: the safety
//                     properties are held over all of them. Those tests are skipped where the file is not there.
//
// Run: npm run test:unit      (or: node --import tsx --test tests/unit/job-own-name.unit.ts)

type Case = { posted: string; about: JobAbout; want: string | null; shows: string };
type Row = { posted: string; company: string; factory: string | null; city: string | null; state: string | null; career: string; shift: string | null; from: string };

const here = (file: string): URL => new URL(file, import.meta.url);
const cases = JSON.parse(readFileSync(here('../fixtures/jobs/own-names.json'), 'utf8')) as Case[];
const collected = existsSync(here('../fixtures/jobs/own-names-collected.jsonl'));
const rows: Row[] = collected
  ? readFileSync(here('../fixtures/jobs/own-names-collected.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Row)
  : [];
const aboutOf = (row: Row): JobAbout => ({ career: row.career ?? '', company: row.company, factory: row.factory, city: row.city, state: row.state });

/** Every title the properties are held over: the collected ones, or the chosen cases where those are not at hand. */
const titles: Array<{ posted: string; about: JobAbout }> = collected ? rows.map((row) => ({ posted: row.posted, about: aboutOf(row) })) : cases;

/** The letters and digits of a text, in order, in lower case. */
const letters = (text: string): string[] => [...text.toLowerCase()].filter((char) => /[\p{L}\p{N}]/u.test(char));
/** Whether a name holds only letters and digits of the title, in the title's order. */
function within(name: string, posted: string): boolean {
  const from = letters(posted);
  let at = 0;
  for (const char of letters(name)) {
    while (at < from.length && from[at] !== char) at += 1;
    if (at === from.length) return false;
    at += 1;
  }
  return true;
}

test('the chosen postings are named as a person would name them', () => {
  assert.ok(cases.length >= 220, `${cases.length} cases`);
  assert.ok(cases.filter((each) => each.want === null).length >= 40, 'at least forty want no name');
  assert.ok(cases.filter((each) => each.want === each.posted).length >= 30, 'at least thirty are kept exactly as posted');
  const wrong: string[] = [];
  for (const each of cases) {
    const got = jobOwnName(each.posted, each.about);
    if (got !== each.want) wrong.push(`${each.about.company} | ${each.posted}\n    want ${JSON.stringify(each.want)}\n    got  ${JSON.stringify(got)}${each.shows ? `\n    (${each.shows})` : ''}`);
  }
  assert.equal(wrong.length, 0, `\n${wrong.join('\n')}`);
});

test("the owner's example: five Welder openings at one factory no longer read alike", () => {
  const starbase: JobAbout = { career: 'Welder', company: 'SpaceX', factory: 'Starbase', city: 'Starbase', state: 'TX' };
  const posted = [
    'Pipe Welder, Stage 0 Ground Fabriciation (Starship) - Night Shift',
    'Structural Welder, Ground Support Equipment (Starship) - Night Shift',
    'Lead Welder, Pipe (Starship Launch Fabrication)',
    'Welder (Starship)',
    'Welder (Starship) - Night Shift',
  ];
  const names = posted.map((title) => jobOwnName(title, starbase));
  assert.deepEqual(names, [
    'Pipe Welder, Stage 0 Ground Fabriciation (Starship)',
    'Structural Welder, Ground Support Equipment (Starship)',
    'Lead Welder, Pipe (Starship Launch Fabrication)',
    'Welder (Starship)',
    'Welder (Starship)',
  ]);
  // The last two differ by their shift alone, which the row states beside the name.
  assert.equal(new Set(names).size, 4);
});

test('what the page states elsewhere is cut: the company, the site and its place', () => {
  const dubuque: JobAbout = { career: 'MIG Welder', company: 'John Deere', factory: 'John Deere Dubuque Works', city: 'Dubuque', state: 'IA' };
  assert.equal(jobOwnName('John Deere Dubuque Works - Production Welder', dubuque), 'Production Welder');
  assert.equal(jobOwnName('Dubuque - Production Welder', dubuque), 'Production Welder');
  assert.equal(jobOwnName('Production Welder - Dubuque Works', dubuque), 'Production Welder');
  assert.equal(jobOwnName('Production Welder (Dubuque, IA)', dubuque), 'Production Welder');
  assert.equal(jobOwnName('Production Welder, Dubuque, Iowa', dubuque), 'Production Welder');
  assert.equal(jobOwnName('Production Welder @ Dubuque', dubuque), 'Production Welder');
  assert.equal(jobOwnName('John Deere Technician', dubuque), 'Technician');
  assert.equal(jobOwnName('Technician at John Deere', dubuque), 'Technician');
  assert.equal(jobOwnName('Production Welder - John Deere, Inc.', dubuque), 'Production Welder');
  // A legal form, "&" for "and", and the word that only says what kind of firm it is.
  const anduril: JobAbout = { career: 'Systems Engineer', company: 'Anduril Industries, Inc.', factory: 'ANDURIL INDUSTRIES INC', city: 'COSTA MESA', state: 'CA' };
  assert.equal(jobOwnName('Senior Systems Engineer - Anduril', anduril), 'Senior Systems Engineer');
  assert.equal(jobOwnName('Senior Systems Engineer, Maritime - Costa Mesa, CA', anduril), 'Senior Systems Engineer, Maritime');
  const pratt: JobAbout = { career: 'Quality Engineer', company: 'Pratt & Whitney', factory: 'Pratt & Whitney East Hartford', city: 'East Hartford', state: 'CT' };
  assert.equal(jobOwnName('Pratt and Whitney East Hartford - Senior Quality Engineer', pratt), 'Senior Quality Engineer');
  // Any town written with its state is a place, the job's own or not; a town alone only when it is the job's.
  const hawthorne: JobAbout = { career: 'Welder', company: 'SpaceX', factory: 'SpaceX Hawthorne', city: 'Hawthorne', state: 'CA' };
  assert.equal(jobOwnName('TIG Welder - Hawthorne, CA', hawthorne), 'TIG Welder');
  assert.equal(jobOwnName('TIG Welder - Cape Canaveral, FL', hawthorne), 'TIG Welder');
  assert.equal(jobOwnName('TIG Welder - McGregor', hawthorne), 'TIG Welder - McGregor');
  // The factory by its own name, where it has one.
  assert.equal(jobOwnName('Welder (Starbase)', { ...hawthorne, factory: 'Starbase', city: 'Starbase', state: 'TX' }), null);
});

test('the shift is cut wherever it stands, and never a grade with it', () => {
  const about: JobAbout = { career: 'Welder', company: 'Acme', factory: 'Acme Tulsa', city: 'Tulsa', state: 'OK' };
  for (const note of ['- Night Shift', '(2nd Shift)', '1st shift', '- Days', ', Weekend Shift', '- 3rd', '- Swing', '- A Shift', '4x10', '(Afternoon Shift)', '- 7AM-3:30PM', '| Rotating Days | C-Shift', '- Mon-Thu 10:00pm to 8:00am']) {
    assert.equal(jobOwnName(`Pipe Welder II ${note}`, about), 'Pipe Welder II', note);
  }
  assert.equal(jobOwnName('2nd Shift Pipe Welder', about), 'Pipe Welder');
  assert.equal(jobOwnName('Night Shift - Pipe Welder', about), 'Pipe Welder');
  // A grade's letter or number beside the shift is the grade's.
  assert.equal(jobOwnName('Inspector C 2nd Shift', about), 'Inspector C');
  assert.equal(jobOwnName('Assembly Tech - Level 3 Swing Shift', about), 'Assembly Tech - Level 3');
  assert.equal(jobOwnName('Electrician B', about), 'Electrician B');
  // Where "shift", "night" or "day" is the job, or part of a thing's name, it stays.
  assert.equal(jobOwnName('Shift Supervisor', about), 'Shift Supervisor');
  assert.equal(jobOwnName('Production Shift Lead', about), 'Production Shift Lead');
  assert.equal(jobOwnName('Night Vision Technician - Night Shift', about), 'Night Vision Technician');
  assert.equal(jobOwnName('Day Cab Assembler - Day Shift', about), 'Day Cab Assembler');
  assert.equal(jobOwnName('Test Engineer I - New Graduate Rotation', about), 'Test Engineer I - New Graduate Rotation');
});

test('the kind of employment is cut as a note, and kept where it is the job', () => {
  const about: JobAbout = { career: 'Manufacturing Engineer', company: 'Acme', factory: 'Acme Tulsa', city: 'Tulsa', state: 'OK' };
  for (const note of ['- Temporary', '(Contract)', 'Full Time', '- Part-Time', '- Seasonal', '- Temp to Hire', '(Fixed Term)', '- 18 Month Defined Term']) {
    assert.equal(jobOwnName(`Manufacturing Engineer II ${note}`, about), 'Manufacturing Engineer II', note);
  }
  assert.equal(jobOwnName('Manufacturing Engineering Intern', about), 'Manufacturing Engineering Intern');
  assert.equal(jobOwnName('Welding Apprentice', about), 'Welding Apprentice');
  assert.equal(jobOwnName('Temporary Production Operator', about), 'Temporary Production Operator');
  assert.equal(jobOwnName('Contract Manufacturing Engineer', about), 'Contract Manufacturing Engineer');
  assert.equal(jobOwnName('Part Time Student - Industrial Engineer', about), 'Part Time Student - Industrial Engineer');
});

test('requisition numbers are cut, and never a grade, a model or a program', () => {
  const about: JobAbout = { career: 'Welder', company: 'Acme', factory: 'Acme Tulsa', city: 'Tulsa', state: 'OK' };
  for (const title of ['Pipe Welder R-12345', 'Pipe Welder (REQ123)', 'Pipe Welder #4521', 'JR100234 Pipe Welder', 'Pipe Welder - 45213', 'Pipe Welder 100234', 'R-12345 - Pipe Welder', 'Pipe Welder (Job ID 44521)', 'Pipe Welder - 17589 & 17590', 'Pipe Welder - 26-505', 'Pipe Welder-3217-3']) {
    assert.equal(jobOwnName(title, about), 'Pipe Welder', title);
  }
  for (const title of ['Welder 2', 'Welder II', 'Welder - Level 4/5', 'Mechanic F-35', 'Mechanic C-17', 'Machinist BE-4', 'Mechanic 737', 'Technician MK1-2200', 'Inspector U103', 'Machinist - N0309 South', 'Welder (Grades 4 - 6)']) {
    assert.equal(jobOwnName(title, about), title, title);
  }
});

test('recruiting noise is cut: where the work is done, clearance, citizenship, experience, pay, banners', () => {
  const about: JobAbout = { career: 'Welder', company: 'Acme', factory: 'Acme Tulsa', city: 'Tulsa', state: 'OK' };
  const notes = [
    '- Onsite', '(On-site)', '- Hybrid', '(Remote)', '- $5,000 Sign-On Bonus', '- Multiple Openings', '- Relocation', '(Relo Assistance!)', '- U.S. Citizenship Required',
    '(Secret Clearance)', '- TS/SCI', 'with Security Clearance', '- Active Secret Clearance Required', '- $28/hr', '- Up to $32.50 per hour', '- 3+ Years Experience Required', '(No Experience)',
    '- Starting January 5', '- 2026', '***Premium Posting***', '(Evergreen)', '- Certification Required', '(m/w/d)',
  ];
  for (const note of notes) assert.equal(jobOwnName(`Pipe Welder II ${note}`, about), 'Pipe Welder II', note);
  assert.equal(jobOwnName('Now Hiring Welders!', about), null);
  assert.equal(jobOwnName('Urgent: Pipe Welder', about), 'Pipe Welder');
  // Where the same word is the work, it stays.
  assert.equal(jobOwnName('Remote Sensing Engineer', about), 'Remote Sensing Engineer');
  assert.equal(jobOwnName('Process Engineer - Hybrid Bonding', about), 'Process Engineer - Hybrid Bonding');
  assert.equal(jobOwnName('Systems Engineer - Requirements & Verification', about), 'Systems Engineer - Requirements & Verification');
  assert.equal(jobOwnName('Pipeline Welder', about), 'Pipeline Welder');
  // The term or year of an internship or a graduate intake says which opening it is.
  assert.equal(jobOwnName('Manufacturing Engineering Intern - Summer 2027', about), 'Manufacturing Engineering Intern - Summer 2027');
  assert.equal(jobOwnName('Manufacturing Engineering Co-op, Fall 2027', about), 'Manufacturing Engineering Co-op, Fall 2027');
  assert.equal(jobOwnName('2027 Early Career Mechanical Engineer', about), '2027 Early Career Mechanical Engineer');
  assert.equal(jobOwnName('Manufacturing Engineer II - Starting Summer 2027', about), 'Manufacturing Engineer II');
});

test('what the company calls the opening is kept as written: branch, program, team, level', () => {
  const about: JobAbout = { career: 'Welder', company: 'SpaceX', factory: 'Starbase', city: 'Starbase', state: 'TX' };
  for (const title of [
    'Orbital Tube Welder', 'Structural Welder', 'Pipe Welder (Starship)', 'TIG Welder, Raptor Combustion Devices', 'Flight Test Engineer, Air Dominance & Strike', 'Welder, Stage 0 Ground Fabrication',
    'Weld Technician, EDV Body', 'Senior Welder', 'Lead Welder', 'Welder II', 'Principal Welding Engineer', 'Welder (Levels 2-4)', 'Welder - Level 2 or Level 3', 'Production Welder', 'Machinist',
    'Supplier Quality Specialist (SpaceXSI)', 'Build Engineer (Crew Starship)', 'NDT Technician (UT)', 'Manufacturing Engineer - ME Paint', 'Welder: Starship', 'Welder | Starship', 'Welder / Fitter',
  ]) {
    assert.equal(jobOwnName(title, about), title, title);
  }
  // Spelling is the company's: nothing is corrected, and no word is moved.
  assert.equal(jobOwnName('Pipe Welder, Stage 0 Ground Fabriciation (Starship)', about), 'Pipe Welder, Stage 0 Ground Fabriciation (Starship)');
  assert.equal(jobOwnName('Engineer Welding 2 - Levell II', about), 'Engineer Welding 2 - Levell II');
});

test('only repairs: capitals that shout, doubled spaces, separators left dangling, one kind of dash', () => {
  const about: JobAbout = { career: 'Welder', company: 'Acme', factory: 'Acme Tulsa', city: 'Tulsa', state: 'OK' };
  assert.equal(jobOwnName('MARINE PAINTER - EXPERIENCED', about), 'Marine Painter - Experienced');
  assert.equal(jobOwnName('CNC MACHINIST II', about), 'CNC Machinist II');
  assert.equal(jobOwnName('TIG WELDER - R&D', about), 'TIG Welder - R&D');
  assert.equal(jobOwnName('QA INSPECTOR III (NDT)', about), 'QA Inspector III (NDT)');
  assert.equal(jobOwnName('SR. MFG ENGINEER - EMC LAB', about), 'Sr. Mfg Engineer - EMC Lab');
  assert.equal(jobOwnName('ELECTRICIAN (A) - MAINTENANCE', about), 'Electrician (A) - Maintenance');
  assert.equal(jobOwnName("WELDER - MASSEY'S TEST SITE", about), "Welder - Massey's Test Site");
  // Capitals among mixed case may be initials or a program's name: they stay.
  assert.equal(jobOwnName('Senior Systems Engineer - MANTIS SEIT', about), 'Senior Systems Engineer - MANTIS SEIT');
  assert.equal(jobOwnName('TIG Welder, Combustion Devices (RAPTOR)', about), 'TIG Welder, Combustion Devices (RAPTOR)');
  // Two words or more in a row that are plainly words are repaired where the rest of the name is not shouted.
  assert.equal(jobOwnName('AUTOMATION TECHNICIAN - Plant 3', about), 'Automation Technician - Plant 3');
  assert.equal(jobOwnName('Pipe  Welder ,  Starship', about), 'Pipe Welder, Starship');
  assert.equal(jobOwnName('Pipe Welder- Starship', about), 'Pipe Welder - Starship');
  assert.equal(jobOwnName('Pipe Welder -- Starship', about), 'Pipe Welder - Starship');
  assert.equal(jobOwnName('Pipe Welder \u2013 Starship - Raptor', about), 'Pipe Welder \u2013 Starship \u2013 Raptor');
  assert.equal(jobOwnName('Pipe Welder (Starship', about), 'Pipe Welder (Starship)');
  assert.equal(jobOwnName('Pipe Welder Starship)', about), 'Pipe Welder Starship');
  assert.equal(jobOwnName('Pipe Welder - (2nd Shift) - ', about), 'Pipe Welder');
  // A bracket stands beside the name, bared by a cut or set after a dash by the company: no dash and no comma is
  // left before one.
  assert.equal(jobOwnName('Pipe Welder - C Shift (Starship)', about), 'Pipe Welder (Starship)');
  assert.equal(jobOwnName('Welder III - (E3)', about), 'Welder III (E3)');
  assert.equal(jobOwnName('Welder III - (E3) 2nd Shift', about), 'Welder III (E3)');
  assert.equal(jobOwnName('Welder III, (Starship, Day Shift Mon-Fri)', about), 'Welder III (Starship)');
  // An underscore after a word and before another, or before a space, parts two things.
  assert.equal(jobOwnName('Pipe Welder_Starship', about), 'Pipe Welder - Starship');
  assert.equal(jobOwnName('2nd Shift_ Pipe Welder_ Onsite', about), 'Pipe Welder');
  assert.equal(jobOwnName('R_D Welder', about), 'R_D Welder');
  // The word of a role shouted among mixed case is a word; a grade typed in strokes is kept as typed.
  assert.equal(jobOwnName('New College Grad - WELDER, TD IE OPS', about), 'New College Grad - Welder, TD IE OPS');
  assert.equal(jobOwnName('Pipe Welder ||| - Starship', about), 'Pipe Welder ||| - Starship');
  assert.equal(jobOwnName('Pipe Welder || Night Shift', about), 'Pipe Welder');
  assert.equal(jobOwnName('Pipe Welder | Starship', about), 'Pipe Welder | Starship');
});

test('review round 1: a note that the opening is for every level, shift or site', () => {
  const about: JobAbout = { career: 'Welder', company: 'Acme', factory: 'Acme Tulsa', city: 'Tulsa', state: 'OK' };
  for (const note of ['(All Levels)', '- All Levels', ', all levels', '- Multiple Levels', '(Multiple Levels/Shifts)', '(All Crews/All Plants)', '(All Crews/All PGT Plants)', '| All Shifts All Levels', '(All levels, All shifts)', '- Any Level', '- All Ohio Locations']) {
    assert.equal(jobOwnName(`Pipe Welder II ${note}`, about), 'Pipe Welder II', note);
  }
  assert.equal(jobOwnName('Welder-All Levels', about), null);
  assert.equal(readJobOwnName('Pipe Welder (All Levels)', about).rules.join(' '), 'levels');
  // A level that is named is a grade; "All Positions" is a welder's trade; a role keeps its words.
  for (const title of ['Pipe Welder - Level 2 or Level 3', 'Pipe Welder (Levels 2-4)', 'Pipe Welder (Associate or Mid-Level)', 'Pipe Welder - All Positions', 'All Plants Manager', 'Pipe Welder - All Levels Considered']) {
    assert.equal(jobOwnName(title, about), title, title);
  }
});

test("review round 1: the factory's code is the factory; its line of business is the opening's", () => {
  const sherman: JobAbout = { career: 'Process Engineer', company: 'Texas Instruments', factory: 'Sherman (SM1)', city: 'Sherman', state: 'TX' };
  assert.equal(jobOwnName('CVD Equipment Engineer (SM1)', sherman), 'CVD Equipment Engineer');
  assert.equal(jobOwnName('SM1 Equipment Engineer - Etch', sherman), 'Equipment Engineer - Etch');
  assert.equal(jobOwnName('Process Engineer (SM1)', sherman), null);
  assert.equal(jobOwnName('Equipment Engineer (SM2)', sherman), 'Equipment Engineer (SM2)');
  const rfab: JobAbout = { career: 'Industrial Engineer', company: 'Texas Instruments', factory: 'RFAB', city: 'Richardson', state: 'TX' };
  assert.equal(jobOwnName('RFAB Module Industrial Engineer', rfab), 'Module Industrial Engineer');
  assert.equal(jobOwnName('Module Industrial Engineer (RFAB)', rfab), 'Module Industrial Engineer');
  assert.equal(jobOwnName('DM5 - Module Industrial Engineer', rfab), 'DM5 - Module Industrial Engineer');
  const bwi: JobAbout = { career: 'Systems Engineer', company: 'Northrop Grumman', factory: 'Northrop Grumman Baltimore (BWI)', city: 'Baltimore', state: 'MD' };
  assert.equal(jobOwnName('Systems Engineer II (BWI)', bwi), 'Systems Engineer II');
  // Words in the brackets of a factory's name that name no place are what the site does: a title that says them
  // names its branch.
  const hollister: JobAbout = { career: 'Systems Engineer', company: 'Raytheon', factory: 'RAYTHEON-HOLLISTER (ELECTRONIC WARFARE)', city: 'GOLETA', state: 'CA' };
  assert.equal(jobOwnName('Senior Systems Engineer, Electronic Warfare', hollister), 'Senior Systems Engineer, Electronic Warfare');
  assert.equal(jobOwnName('Senior Systems Engineer - Hollister', hollister), 'Senior Systems Engineer');
  const nov: JobAbout = { career: 'Mechanical Engineer', company: 'NOV', factory: 'NOV Eldridge Parkway (Rig Pressure Control)', city: 'Houston', state: 'TX' };
  assert.equal(jobOwnName('Mechanical Engineer II - Rig Pressure Control', nov), 'Mechanical Engineer II - Rig Pressure Control');
  // A place named in the brackets is still the site.
  const palmdale: JobAbout = { career: 'Manufacturing Engineer', company: 'Northrop Grumman', factory: 'Northrop Grumman Palmdale (Air Force Plant 42)', city: 'Palmdale', state: 'CA' };
  assert.equal(jobOwnName('Manufacturing Engineer 2 - Air Force Plant 42', palmdale), 'Manufacturing Engineer 2');
  // The site by its initials after the name or as a segment; never where they are a trade's.
  const lso: JobAbout = { career: 'Test Engineer', company: 'Blue Origin', factory: 'Blue Origin Launch Site One', city: 'Van Horn', state: 'TX' };
  assert.equal(jobOwnName('Test Engineer II | Engines LSO', lso), 'Test Engineer II | Engines');
  assert.equal(jobOwnName('LSO - Test Engineer II', lso), 'Test Engineer II');
  const pcb: JobAbout = { career: 'Test Engineer', company: 'Acme', factory: 'Acme Precision Circuit Boards', city: 'Tulsa', state: 'OK' };
  assert.equal(jobOwnName('Test Engineer II - PCB', pcb), 'Test Engineer II - PCB');
  // Of names joined by a slash, the factory's own goes and the program stays; elsewhere the same name is a program.
  const akoustis: JobAbout = { career: 'Process Engineer', company: 'SpaceX', factory: 'Akoustis Canandaigua', city: 'Canandaigua', state: 'NY' };
  assert.equal(jobOwnName('Process Engineer (Starlink/Akoustis) - Day Shift', akoustis), 'Process Engineer (Starlink)');
  assert.equal(jobOwnName('Process Engineer (Akoustis/Starlink)', akoustis), 'Process Engineer (Starlink)');
  assert.equal(jobOwnName('Process Engineer (Starlink/Akoustis)', { ...akoustis, factory: 'SpaceX Bastrop', city: 'Bastrop', state: 'TX' }), 'Process Engineer (Starlink/Akoustis)');
  assert.equal(jobOwnName('Process Engineer (Dallas/Richardson)', { ...akoustis, factory: 'RFAB', city: 'Richardson', state: 'TX' }), null);
});

test('review round 1: places the title sets without a separator, and those it cannot know', () => {
  // The job's own state as a code before the name; never a trade's code, and never before a short name.
  const nm: JobAbout = { career: 'Etch Process Engineer', company: 'Intel', factory: 'Intel Rio Rancho', city: 'Rio Rancho', state: 'NM' };
  assert.equal(jobOwnName('NM Silicon Photonics Dry Etch Process Development Engineer', nm), 'Silicon Photonics Dry Etch Process Development Engineer');
  assert.equal(jobOwnName('NM Etch Engineer', nm), 'NM Etch Engineer');
  assert.equal(jobOwnName('ME Paint Process Engineer II', { ...nm, city: 'Bangor', state: 'ME' }), 'ME Paint Process Engineer II');
  assert.equal(jobOwnName('TX Module Design Engineer II', { ...nm, city: 'Austin', state: 'TX' }), 'TX Module Design Engineer II');
  // A site's code with the job's own state.
  const mi: JobAbout = { career: 'Quality Control Inspector', company: 'Denso', factory: 'Denso Manufacturing Michigan', city: 'Battle Creek', state: 'MI' };
  assert.equal(jobOwnName('QC Inspector II (DMNC MI, 3rd Shift)', mi), 'QC Inspector II');
  assert.equal(jobOwnName('QC Inspector II (SMT MI)', mi), 'QC Inspector II (SMT MI)');
  // The job's own town straight before the role; a town whose name is a word of the trade stays.
  const huntsville: JobAbout = { career: 'Maintenance Technician', company: 'Acme', factory: null, city: 'Huntsville', state: 'AL' };
  assert.equal(jobOwnName('Huntsville Technician - 12 hour shifts', huntsville), 'Technician');
  assert.equal(jobOwnName('Huntsville Operations Technician', huntsville), 'Huntsville Operations Technician');
  assert.equal(jobOwnName('Mobile Technician', { ...huntsville, city: 'Mobile' }), 'Mobile Technician');
  assert.equal(jobOwnName('Mobile Equipment Mechanic - Mobile, AL', { ...huntsville, city: 'Mobile' }), 'Mobile Equipment Mechanic');
  // The town by its first word, in brackets; a team named for the town keeps it.
  const cape: JobAbout = { career: 'EHS Specialist', company: 'Acme', factory: null, city: 'Cape Canaveral', state: 'FL' };
  assert.equal(jobOwnName('Senior EHS Specialist (Cape)', cape), 'Senior EHS Specialist');
  assert.equal(jobOwnName('Senior EHS Specialist (Canaveral)', cape), 'Senior EHS Specialist (Canaveral)');
  assert.equal(jobOwnName('Technician (Spring)', { ...cape, city: 'Spring Hill', state: 'TN' }), 'Technician (Spring)');
  const starbase: JobAbout = { career: 'Test Technician', company: 'SpaceX', factory: 'Starbase', city: 'Starbase', state: 'TX' };
  assert.equal(jobOwnName('Project Manager, Residential (Starbase Development)', starbase), 'Project Manager, Residential (Starbase Development)');
  assert.equal(jobOwnName('Avionics Test Technician, Starbase Vibe Test Lab', starbase), 'Avionics Test Technician, Vibe Test Lab');
  // A firm under its legal name, a showroom.
  const about: JobAbout = { career: 'MIG Welder', company: 'John Deere', factory: null, city: null, state: null };
  assert.equal(jobOwnName('A&I Products Canada Inc. - Production Welder', about), 'Production Welder');
  assert.equal(jobOwnName('Production Welder - Massey Products LLC', about), 'Production Welder');
  assert.equal(jobOwnName('Product Guide III - The Americana Showroom', about), 'Product Guide III');
  // What nothing given says is a place stays: a town that is not the job's, a place abroad, a code no field explains.
  const hanover: JobAbout = { career: 'Systems Engineer', company: 'Northrop Grumman', factory: 'NORTHROP GRUMMAN SYSTEMS CORP', city: 'HANOVER', state: 'MD' };
  for (const title of ['Systems Engineer - Level 2/3 - East Hartford', 'Senior Test Engineer - HBR', 'RFI - Electronics Technician', 'Network Development Manager - Germany', 'Field Service Technician - Laval, QC', 'Senior Technical Lead - Systems and Software Engineering - Indaiatuba/SP']) {
    assert.equal(jobOwnName(title, hanover), title, title);
  }
  // UT is also ultrasonic testing: a town with it and no comma is left, as the method is.
  const utah: JobAbout = { career: 'NDT Technician', company: 'Acme', factory: 'Acme Clearfield', city: 'Clearfield', state: 'UT' };
  assert.equal(jobOwnName('2027 Associate Systems Engineer - Roy UT', utah), '2027 Associate Systems Engineer - Roy UT');
  assert.equal(jobOwnName('NDT Technician - Phased Array UT', utah), 'NDT Technician - Phased Array UT');
});

test('review round 1: grades, shifts, kinds of employment and recruiting notes in unusual forms', () => {
  const about: JobAbout = { career: 'Welder', company: 'Acme', factory: 'Acme Tulsa', city: 'Tulsa', state: 'OK' };
  // Two small numbers are a grade; days and hours are a schedule; a day needs its word.
  for (const title of ['Pipe Welder 2/3', 'Pipe Welder - 3/4', 'Pipe Welder (Airframes) 3/4', 'Pipe Welder - Level 4/5']) assert.equal(jobOwnName(title, about), title, title);
  for (const note of ['- 9/80', '- 4/10 Schedule', '- Starts 1/15', '- 1/15/2027', 'AWW2']) assert.equal(jobOwnName(`Pipe Welder II ${note}`, about), 'Pipe Welder II', note);
  assert.equal(jobOwnName('Pipe Welder II, NBRO AWW (Onsite)', about), 'Pipe Welder II, NBRO');
  assert.equal(jobOwnName('Pipe Welder - Shift2 Fabrication', about), 'Pipe Welder - Fabrication');
  assert.equal(jobOwnName('Shift Manufacturing Welder', about), 'Shift Manufacturing Welder');
  // The kind of employment by its code before the name, or its word after it.
  assert.equal(jobOwnName('CW - Pipe Welder II - Weekend (T2)', about), 'Pipe Welder II (T2)');
  assert.equal(jobOwnName('CW- Pipe Welder I - (E1)', about), 'Pipe Welder I (E1)');
  assert.equal(jobOwnName('CW Laser Welder', about), 'CW Laser Welder');
  assert.equal(jobOwnName('Laser Welder - CW', about), 'Laser Welder - CW');
  assert.equal(jobOwnName('Pipe Welder Trainee - 2nd and 3rd Shifts - Supplemental', about), 'Pipe Welder Trainee');
  assert.equal(jobOwnName('Engineer - Supplemental Restraints', about), 'Engineer - Supplemental Restraints');
  assert.equal(jobOwnName('Pipe Welder - AISR&T Contingent', about), 'Pipe Welder - AISR&T');
  assert.equal(jobOwnName('Contingent Workforce Analyst', about), 'Contingent Workforce Analyst');
  assert.equal(jobOwnName('Hourly Production Team Member - Temp Full Time', about), 'Hourly Production Team Member');
  // A recruiting phrase after a team's code leaves the code; a note that is all words goes whole.
  assert.equal(jobOwnName('ENGINEER WELDING 1- ET&D HIRING EVENT', about), 'Engineer Welding 1 - ET&D');
  assert.equal(jobOwnName('PIPE WELDER - SHIPYARD HIRING EVENT', about), 'Pipe Welder');
  assert.equal(jobOwnName('Pipe Welder 2/3 - Military & Veterans Encouraged to Apply', about), 'Pipe Welder 2/3');
  assert.equal(jobOwnName('Pipe Welder - E3 Sign-On Bonus', about), 'Pipe Welder');
  // A recruiter's tag in brackets before the name; after a name the same word may be its branch.
  assert.equal(jobOwnName('(PIPELINE) Advanced Effects - Buyer', about), 'Advanced Effects - Buyer');
  assert.equal(jobOwnName('[Evergreen] Pipe Welder', about), 'Pipe Welder');
  assert.equal(jobOwnName('Pipe Welder (Pipeline)', about), 'Pipe Welder (Pipeline)');
  assert.equal(jobOwnName('(Starship) Pipe Welder', about), '(Starship) Pipe Welder');
  // A share is a note.
  for (const note of ['(10%)', '- 25% Travel', '(Up to 50% travel)']) assert.equal(jobOwnName(`Pipe Welder II ${note}`, about), 'Pipe Welder II', note);
});

test("review round 1: the career's title with a word abbreviated is the career; a shorter form of it is the company's word", () => {
  const named = (career: string, title: string): string | null => jobOwnName(title, { career, company: 'Acme' });
  assert.equal(named('Industrial Engineer', 'Industrial Engr'), null);
  assert.equal(named('Automation Technician', 'AUTOMATION TECH'), null);
  assert.equal(named('Maintenance Technician', 'Maint. Tech'), null);
  assert.equal(named('Manufacturing Engineer', 'Mfg Engineer'), null);
  assert.equal(named('Quality Control Inspector', 'QC Inspector'), null);
  assert.equal(named('Maintenance Technician', 'Maintenance Tech II'), 'Maintenance Tech II');
  assert.equal(named('Quality Control Inspector', 'Quality Inspector'), 'Quality Inspector');
  assert.equal(named('Quality Control Inspector', 'Inspector, Quality'), 'Inspector, Quality');
  assert.equal(named('Industrial Electrician', 'Electrician'), 'Electrician');
});

test("review round 2: the career's title in the singular, or with a space more or less, is the career", () => {
  const named = (career: string, title: string): string | null => jobOwnName(title, { career, company: 'Acme' });
  assert.equal(named('Facilities Engineer', 'Facility Engineer'), null);
  assert.equal(named('Facility Engineer', 'Facilities Engineers'), null);
  assert.equal(named('Utilities Operator', 'Utility Operator - 2nd Shift'), null);
  assert.equal(named('Setup Technician', 'Set Up Technician'), null);
  assert.equal(named('Setup Technician', '2nd Shift Set-Up Technician'), null);
  assert.equal(named('Pipefitter', 'Pipe Fitter'), null);
  assert.equal(named('Tool and Die Maker', 'Tool and Diemaker'), null);
  // Anything more than the career's words is a name.
  assert.equal(named('Facilities Engineer', 'Facility Engineer - ME Paint'), 'Facility Engineer - ME Paint');
  assert.equal(named('Facilities Engineer', 'Facilities Engineer II'), 'Facilities Engineer II');
  assert.equal(named('Setup Technician', 'Set Up Technician II'), 'Set Up Technician II');
  assert.equal(named('Pipefitter', 'Pipe Fitter III'), 'Pipe Fitter III');
  assert.equal(named('Setup Technician', 'CNC Setup Machinist'), 'CNC Setup Machinist');
});

test('review round 2: the schooling or training asked for is a note, wherever the intake or the grade is not', () => {
  const about: JobAbout = { career: 'Welder', company: 'Acme', factory: 'Acme Tulsa', city: 'Tulsa', state: 'OK' };
  for (const note of ['- Associates Degree', ", Associate's Degree", '(Bachelors/Masters)', '- MS/PhD', "- Master's", '- PhD', '(BS/MS)', '- High School Diploma or GED', '- 2 Year Degree', '(Bachelors Degree Required)', '- Formal Training']) {
    assert.equal(jobOwnName(`Pipe Welder II ${note}`, about), 'Pipe Welder II', note);
  }
  assert.equal(jobOwnName('Welder - Experienced or Formal Training', about), null);
  assert.equal(readJobOwnName('Pipe Welder II - Associates Degree', about).rules.join(' '), 'schooling');
  // In a graduate intake the intake and its term stay, and the degree goes like any other requirement.
  assert.equal(jobOwnName('Building Maintenance Welder, Associates Degree (2027 New College Graduate)', about), 'Building Maintenance Welder (2027 New College Graduate)');
  assert.equal(jobOwnName('New College Grad Welding Engineer (Bachelors/Masters - Tulsa, OK)', about), 'New College Grad Welding Engineer');
  assert.equal(jobOwnName('New College Grad - Welding Engineer III - PhD (2027 Summer Cohort)', about), 'New College Grad - Welding Engineer III (2027 Summer Cohort)');
  // A grade, a department, a team's letters and a role are none of this.
  for (const title of ['Marine Welder - Experienced', 'Pipe Welder - Training', 'Pipe Welder (Associate or Experienced)', 'Pipe Welder - MS&A', 'Pipe Welder - MS', 'Master Welder', 'Welder - Master', 'Manufacturing Associate', 'PhD Intern - Welding', 'Welding Engineer - Master Thesis', 'Senior Welding Engineer - Air Combat Training', 'Degreed Welding Engineer']) {
    assert.equal(jobOwnName(title, about), title, title);
  }
});

test('review round 2: a dash is never left before a bracket', () => {
  const about: JobAbout = { career: 'Manufacturing Engineer', company: 'Acme', factory: 'Acme Tulsa', city: 'Tulsa', state: 'OK' };
  assert.equal(jobOwnName('CW- Manufacturing Engineer I - (E1)', about), 'Manufacturing Engineer I (E1)');
  assert.equal(jobOwnName('Manufacturing Engineer V - (E5)', about), 'Manufacturing Engineer V (E5)');
  assert.equal(jobOwnName('Manufacturing Engineer III -(E3)', about), 'Manufacturing Engineer III (E3)');
  assert.equal(jobOwnName('Manufacturing Engineer III \u2013 (E3)', about), 'Manufacturing Engineer III (E3)');
  assert.equal(jobOwnName('Systems Engineer III - (E3) | Optics', about), 'Systems Engineer III (E3) | Optics');
  assert.equal(jobOwnName('Sr. Manufacturing Engineer - (Body - Upperbody)', about), 'Sr. Manufacturing Engineer (Body - Upperbody)');
  assert.equal(jobOwnName('Sentinel - Principal Systems Engineer - (MS&A) - 20428', about), 'Sentinel - Principal Systems Engineer (MS&A)');
  // A dash after a bracket, and a bracket with no dash, are as they were.
  assert.equal(jobOwnName('Manufacturing Engineer IV (E4)', about), 'Manufacturing Engineer IV (E4)');
  assert.equal(jobOwnName('Test Engineer (E4) - Heterogenous Integration', about), 'Test Engineer (E4) - Heterogenous Integration');
});

test('review round 2: what nothing given explains is left as the company wrote it', () => {
  // Initials that are not the first letters of the factory's name, and a code beside them.
  const honeybee: JobAbout = { career: 'Test Engineer', company: 'Blue Origin', factory: 'Honeybee Robotics Longmont', city: 'Longmont', state: 'CO' };
  assert.equal(jobOwnName('Senior Test Engineer - HBR', honeybee), 'Senior Test Engineer - HBR');
  assert.equal(jobOwnName('Test Engineer III - HBR MC', honeybee), 'Test Engineer III - HBR MC');
  assert.equal(jobOwnName('Senior Test Engineer - Honeybee Robotics', honeybee), 'Senior Test Engineer');
  const berwick: JobAbout = { career: 'Quality Engineer', company: 'Pratt & Whitney', factory: 'Pratt & Whitney North Berwick', city: 'North Berwick', state: 'ME' };
  assert.equal(jobOwnName('Manufacturing and Quality Engineer, NBRO AWW (Onsite)', berwick), 'Manufacturing and Quality Engineer, NBRO');
  // The initials a rule can read are still read: every word's first letter, of a name of three words or more.
  const buffalo: JobAbout = { career: 'Test Engineer', company: 'Ford', factory: 'Buffalo Stamping Plant', city: 'Buffalo', state: 'NY' };
  assert.equal(jobOwnName('Senior Test Engineer - BSP', buffalo), 'Senior Test Engineer');
  // A trade's letters at a factory whose name they could be squeezed out of are the trade's.
  const motors: JobAbout = { career: 'Production Planner', company: 'Acme', factory: 'Acme Specialty Motors', city: 'Tulsa', state: 'OK' };
  assert.equal(jobOwnName('Senior Planner - SCM', motors), 'Senior Planner - SCM');
  // A posting abroad that carries no place: the company goes, the word after it is not known for a town, and a
  // title in another language is not translated.
  const abroad: JobAbout = { career: '', company: 'Lucid Motors', factory: null, city: null, state: null };
  assert.equal(jobOwnName('Autototechnicus EV | Lucid Motors Hilversum', abroad), 'Autototechnicus EV | Hilversum');
  assert.equal(jobOwnName('Mechanical Engineer, Lucid Motors Powertrain Systems', abroad), 'Mechanical Engineer, Powertrain Systems');
  const german = readJobOwnName('Schwei\u00dfer (m/w/d)', { career: 'Welder', company: 'John Deere', factory: null, city: null, state: null });
  assert.equal(german.name, 'Schwei\u00dfer');
  assert.deepEqual(german.rules, ['gender']);
  // A town and a state's code with no comma is a place only where the code is no trade's: in Utah "Roy UT" is
  // written as "Immersion UT" is.
  const utah: JobAbout = { career: 'Composite Technician', company: 'Acme', factory: 'Acme Clearfield', city: 'Clearfield', state: 'UT' };
  assert.equal(jobOwnName('2027 Associate Systems Engineer - Roy UT', utah), '2027 Associate Systems Engineer - Roy UT');
  assert.equal(jobOwnName('Composite Technician - Immersion UT', utah), 'Composite Technician - Immersion UT');
  assert.equal(jobOwnName('Composite Technician - Lehi, UT', utah), null);
  assert.equal(jobOwnName('Staff Systems Engineer (Redondo Beach CA)', { ...utah, city: 'El Segundo', state: 'CA' }), 'Staff Systems Engineer');
  // A word the company typed before the name is the company's, as its spelling is.
  assert.equal(jobOwnName('Position Facilities Engineering Technician, Bulk & Specialty Gas', utah), 'Position Facilities Engineering Technician, Bulk & Specialty Gas');
  assert.equal(jobOwnName('Position Control Engineer', utah), 'Position Control Engineer');
});

test('none when what is left says nothing beyond the career, or is plainly broken', () => {
  const about: JobAbout = { career: 'Tool and Die Maker', company: 'Acme', factory: 'Acme Tulsa', city: 'Tulsa', state: 'OK' };
  for (const title of ['Tool and Die Maker', 'TOOL AND DIE MAKER', 'tool and die maker', 'Tool & Die Maker', 'Tool and Die Makers', 'Tool-and-Die Maker', 'Tool and Die Maker - 2nd Shift', 'Tool and Die Maker (Tulsa, OK)', 'Acme - Tool & Die Maker', 'Tool and Die Maker - R-22331', 'Tool and Die Maker -', 'Maker, Tool and Die']) {
    assert.equal(jobOwnName(title, about), null, title);
  }
  for (const title of ['', '   ', '-', '()', 'II', 'Level 2', 'Senior', 'Lead', '12345', '2nd Shift', 'Tulsa, OK', 'Acme', '(Starship)', 'and', '$$$', '#1', 'x'.repeat(400)]) {
    assert.equal(jobOwnName(title, about), null, JSON.stringify(title.slice(0, 20)));
  }
  // Another way of saying the career is what the company calls it, and is kept.
  assert.equal(jobOwnName('Toolmaker', about), 'Toolmaker');
  assert.equal(jobOwnName('Tool and Die Maker II', about), 'Tool and Die Maker II');
  assert.equal(jobOwnName('Die Maker Journeyperson', about), 'Die Maker Journeyperson');
  // With no career known, the name is still read.
  assert.equal(jobOwnName('Pipe Welder - 2nd Shift', { ...about, career: '' }), 'Pipe Welder');
});

test('the reading says what was cut, in the words of the title', () => {
  const about: JobAbout = { career: 'NDT Technician', company: 'Acme', factory: 'Acme Tulsa Works', city: 'Tulsa', state: 'OK' };
  const read = readJobOwnName('NDT Technician - Radiography (RT) - Level II - D Shift (Weekend Night Shift) - Tulsa, OK - 19588', about);
  assert.equal(read.name, 'NDT Technician - Radiography (RT) - Level II');
  assert.deepEqual(read.rules.sort(), ['requisition', 'shift', 'site']);
  // A shift the title named can still be said beside the name where the job's own shift is not known.
  assert.deepEqual(read.cut.filter((each) => each.rule === 'shift').map((each) => each.text), ['D Shift (Weekend Night Shift)']);
  assert.deepEqual(read.cut.filter((each) => each.rule === 'requisition').map((each) => each.text), ['19588']);
  // Nothing cut, nothing said; and none is given with its reason.
  assert.deepEqual(readJobOwnName('Senior NDT Technician', about), { name: 'Senior NDT Technician', rules: [], cut: [] });
  assert.deepEqual(readJobOwnName('NDT Technician', about), { name: null, rules: ['same-as-career'], cut: [] });
  assert.deepEqual(readJobOwnName(null, about), { name: null, rules: ['nothing'], cut: [] });
});

test('safe on any input: never throws, never an empty name', () => {
  const about: JobAbout = { career: 'Welder', company: 'Acme', factory: 'Acme Tulsa Works', city: 'Tulsa', state: 'OK' };
  const odd: unknown[] = [
    null, undefined, 42, {}, [], true, '', ' ', '\n', '-', '(((', ')))', '[]', '- - -', '|||', 'A '.repeat(130), '('.repeat(259), ')'.repeat(259), '- '.repeat(129), 'a-'.repeat(129), ', '.repeat(120), '1 '.repeat(120),
    'Welder ' + '(2nd Shift) '.repeat(20), '\u0000\u0001Welder II\u2028', 'Welder\tII\n- Night Shift', 'W\u0303elder \u2014 \ud83d\ude80 (Starship)', '\ud83d\udd25\ud83d\udd25', '\u0645\u0647\u0646\u062f\u0633', '\u710a\u5de5 - \u591c\u73ed',
    'Schwei\u00dfer (m/w/d)', '\ud83d', 'x'.repeat(100000),
  ];
  for (const value of odd) {
    let name: string | null = 'unset';
    assert.doesNotThrow(() => {
      name = jobOwnName(value as string, about);
    });
    assert.ok(name === null || (typeof name === 'string' && name.trim().length > 0 && name === name.trim()), JSON.stringify(String(value).slice(0, 30)));
  }
  for (const known of [null, undefined, {}, { career: null, company: null }, { career: 5, company: {}, factory: [], city: 7, state: true }]) {
    assert.doesNotThrow(() => jobOwnName('Pipe Welder II - Night Shift', known as unknown as JobAbout));
    assert.equal(jobOwnName('Pipe Welder II - Night Shift', known as unknown as JobAbout), 'Pipe Welder II');
  }
  assert.equal(jobOwnName('Welder\tII\n- Night Shift', about), 'Welder II');
  // Words that are also the names of built-in properties are words, in a title and in what is known of the job.
  assert.equal(jobOwnName('Pipe Welder - All constructor', about), 'Pipe Welder - All constructor');
  assert.deepEqual(readJobOwnName('Senior Constructor - valueOf', { career: 'constructor', company: 'toString', factory: 'valueOf', city: 'constructor', state: 'constructor' }), { name: 'Senior Constructor', rules: ['site'], cut: [{ rule: 'site', text: 'valueOf' }] });
  for (const read of [readJobOwnName('Pipe Welder - All Levels', about), readJobOwnName('toString hasOwnProperty __proto__', about)]) assert.ok(read.rules.every((rule) => typeof rule === 'string'));
});

test('over every collected title: a name, or none; only text of the title; the same when read again', () => {
  assert.ok(titles.length >= 220);
  const faults: string[] = [];
  let named = 0;
  for (const { posted, about } of titles) {
    let name: string | null = null;
    try {
      name = jobOwnName(posted, about);
    } catch (error) {
      faults.push(`throws on ${posted}: ${String(error)}`);
      continue;
    }
    if (name === null) continue;
    named += 1;
    if (typeof name !== 'string' || !name.trim() || name !== name.trim() || /\s{2,}/.test(name)) faults.push(`empty or untidy: ${JSON.stringify(name)} of ${posted}`);
    // Only the title's own letters and digits, in its order: case and separators are all that may differ.
    if (!within(name, posted)) faults.push(`text not in the title: ${posted} => ${name}`);
    // A name read again is itself, or none.
    const again = jobOwnName(name, about);
    if (again !== null && again !== name) faults.push(`not the same read again: ${posted} => ${name} => ${again}`);
    // No separator left dangling, no empty or unclosed bracket.
    // (A grade typed in upright strokes, "Process Engineer ||| - Plasma", is kept as typed and is no separator.)
    const strokeless = name.replace(/ \|{2,3}(?= |$)/g, ' III');
    if (/^[-\u2013\u2014,;:|/@&.)\]]|[-\u2013\u2014,;:|/@&([]$|\(\s*\)|\[\s*\]|[-\u2013\u2014|]\s*[-\u2013\u2014|,]|[,;]\s*[([]|[-\u2013\u2014]\s*[([]/.test(strokeless)) faults.push(`separator left dangling: ${posted} => ${name}`);
    let depth = 0;
    for (const char of name) {
      if (char === '(' || char === '[') depth += 1;
      if (char === ')' || char === ']') depth -= 1;
      if (depth < 0) break;
    }
    if (depth !== 0) faults.push(`brackets unbalanced: ${posted} => ${name}`);
    // The reading and the name agree.
    if (readJobOwnName(posted, about).name !== name) faults.push(`two answers for ${posted}`);
  }
  assert.equal(faults.length, 0, `\n${faults.slice(0, 30).join('\n')}`);
  assert.ok(named > titles.length / 2, 'most postings have a name of their own');
});

test('a name no longer holds what was cut: the company, a shift, a requisition number, a degree', { skip: !collected }, () => {
  const LEGAL = new Set(['inc', 'incorporated', 'llc', 'corp', 'corporation', 'co', 'company', 'lp', 'ltd', 'limited', 'plc']);
  const words = (text: string): string[] => text.toLowerCase().replace(/['\u2019.]/g, '').replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
  const holds = (hay: string[], needle: string[]): boolean => {
    for (let at = 0; needle.length > 0 && at + needle.length <= hay.length; at += 1) if (needle.every((word, offset) => word === hay[at + offset])) return true;
    return false;
  };
  const company: string[] = [];
  const shift: string[] = [];
  const requisition: string[] = [];
  const schooling: string[] = [];
  for (const row of rows) {
    const name = jobOwnName(row.posted, aboutOf(row));
    if (!name) continue;
    let firm = words(row.company);
    while (firm.length > 1 && LEGAL.has(firm[firm.length - 1])) firm = firm.slice(0, -1);
    if (holds(words(name), firm)) company.push(`${row.posted} => ${name}`);
    if (/\b(?:[1-5](?:st|nd|rd|th)|first|second|third|day|night|swing|weekend|evening|afternoon)\s+shift\b|\bnights\b|\b\d{1,2}(?::\d\d)?\s?(?:am|pm)\b/i.test(name)) shift.push(`${row.posted} => ${name}`);
    if (/(?:^|[\s(#-])(?:\d{5,}|(?:R|JR|REQ)-?\d{3,}|#\d{2,})(?:$|[\s)*-])/.test(name)) requisition.push(`${row.posted} => ${name}`);
    if (/\b(?:degree|diploma|bachelor'?s|master'?s|ph\.?d|ged|mba|formal training)\b/i.test(name)) schooling.push(`${row.posted} => ${name}`);
  }
  assert.deepEqual(company, []);
  assert.deepEqual(shift, []);
  assert.deepEqual(requisition, []);
  assert.deepEqual(schooling, []);
});

test('the measure: rows of one career at one factory that print alike fall by more than three quarters', { skip: !collected }, () => {
  const live = rows.filter((row) => row.from === 'live');
  const alike = (key: (row: Row) => string): number => {
    const groups = new Map<string, number>();
    for (const row of live) groups.set(key(row), (groups.get(key(row)) ?? 0) + 1);
    let count = 0;
    for (const size of groups.values()) if (size > 1) count += size;
    return count;
  };
  const place = (row: Row): string => [row.company, row.factory ?? '', (row.city ?? '').toLowerCase(), row.state ?? '', row.career].join('\u0001');
  const names = new Map(live.map((row) => [row, jobOwnName(row.posted, aboutOf(row)) ?? '']));
  const before = alike((row) => `${place(row)}\u0001${row.shift ?? ''}`);
  const after = alike((row) => `${place(row)}\u0001${names.get(row)}\u0001${row.shift ?? ''}`);
  // The floor: postings the employer itself titled identically.
  const floor = alike((row) => `${place(row)}\u0001${row.posted.toLowerCase().replace(/\s+/g, ' ')}`);
  assert.ok(after >= floor, `${after} alike after, ${floor} titled alike by the employer`);
  assert.ok(after * 4 < before, `${before} rows alike before, ${after} after`);
});

test('quick enough to run on every row of a list', () => {
  const started = process.hrtime.bigint();
  for (const { posted, about } of titles) jobOwnName(posted, about);
  const millis = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(millis / titles.length < 5, `${(millis / titles.length).toFixed(2)} ms a title`);
  // A title at the limit of length, of nothing but separators and brackets, is no slower.
  const hard = ['- '.repeat(129), '('.repeat(259), 'a-'.repeat(129), 'A, '.repeat(86), 'Welder (2nd Shift) '.repeat(13)];
  const again = process.hrtime.bigint();
  for (const title of hard) jobOwnName(title, { career: 'Welder', company: 'Acme' });
  assert.ok(Number(process.hrtime.bigint() - again) / 1e6 < 500);
});

test('no rule names an employer: the company and the site come only from the arguments', { skip: !collected }, () => {
  // The source without its comments, which give real titles as examples.
  const code = readFileSync(here('../../shared/jobOwnName.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');
  const named: string[] = [];
  for (const company of new Set(rows.map((row) => row.company))) {
    const name = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`).test(code)) named.push(company);
  }
  assert.deepEqual(named, []);
  // And it stands alone: no import, nothing read from outside.
  assert.equal(/^\s*import\s/m.test(code), false);
  assert.equal(/\brequire\(|\bfetch\(|process\.|globalThis|Date\.now|Math\.random/.test(code), false);
});
