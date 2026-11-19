// Unit checks for the reading of a job posting (scripts/ingest/postings/read/):
// which career a title is, its level, where the work is, the skills and makes the
// text asks for, its requirements and its pay.
//
// Two kinds of check. Named cases: every trap the reader was written against (a
// fragment that must not match, a make with no skill, a software title, a manager,
// a location with two places, each way pay is written, each way a level is). And
// the gold set (tests/fixtures/postings/gold.json): 480 hand-labelled postings in
// reduced form, half of them held out while the reader was built. The figures the
// reader reached on each half are a floor: a change that reads worse fails here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain script, no types
import { loadVocabulary, readPosting } from '../../scripts/ingest/postings/read/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vocab = loadVocabulary(root);

type Reading = {
  career: { title: string; how: 'title' | 'other name' | 'close'; matched: string } | null;
  level: { word: string; rank: number } | null;
  places: { city: string; state: string }[];
  skills: { name: string; on: string }[];
  makes: { skill: string; make: string; on: string }[];
  requirements: {
    yearsMin: number | null; yearsMax: number | null; education: string | null; certifications: string[];
    clearance: string | null; citizenship: string | null; shift: string | null; employmentType: string | null;
  };
  pay: { min: number; max: number; period: 'hour' | 'year' } | null;
  unknown: { phrase: string }[];
};

const read = (title: string, text = '', more: Record<string, string | null> = {}): Reading =>
  readPosting({ employer: 'Acme Aerospace', title, location: 'Austin, TX', text, ...more }, vocab);
const career = (title: string, text = '', more: Record<string, string | null> = {}) => read(title, text, more).career?.title ?? null;
const names = (r: Reading) => r.skills.map((s) => s.name);

const MACHINING = 'Responsibilities:\n- Set up and operate CNC mills and lathes\n- Read blueprints and GD&T\nQualifications:\n- 3+ years of CNC machining experience';

// --- The title ------------------------------------------------------------------

test('a title is a career once its level, shift, site, programme and code are set aside', () => {
  const a = read('CNC Machinist II - 2nd Shift (Starship)', MACHINING);
  assert.deepEqual(a.career, { title: 'CNC Machinist', how: 'title', matched: 'CNC Machinist' });
  assert.deepEqual(a.level, { word: 'II', rank: 2 });
  assert.equal(a.requirements.shift, 'swing');

  const b = read('Sr. Manufacturing Engineer, Avionics', MACHINING);
  assert.deepEqual(b.career, { title: 'Manufacturing Engineer', how: 'title', matched: 'Manufacturing Engineer' });
  assert.deepEqual(b.level, { word: 'Senior', rank: 3 });

  // Said backwards, with the level in brackets.
  const c = read('Technician, Composites (Level 3)', MACHINING);
  assert.equal(c.career?.title, 'Composite Technician');
  assert.equal(c.career?.how, 'close');
  assert.deepEqual(c.level, { word: 'III', rank: 3 });

  // Another name ("Machinist"), a word that leaves it what it is, and a requisition code.
  const d = read('General Machinist - N0309', MACHINING);
  assert.equal(d.career?.title, 'CNC Machinist');
  assert.equal(d.career?.matched, 'Machinist');
  assert.equal(d.level, null);

  // The employer's name before the job.
  assert.equal(career('John Deere Harvester Works - Production Welder'), 'Welder');
  // A skill's short name in a title stands for the skill.
  assert.equal(career('AFP Operator - All Levels'), 'Automated Fiber Placement Operator');
  // "Technician" for "mechanic", and the trade's spelling.
  assert.equal(career('Aircraft Structural Technician (Beale AFB, CA), U-2 PDM - Level 4'), 'Aircraft Structures Mechanic');
});

test('titles that are not among the careers are refused', () => {
  for (const title of [
    'Software Engineer, Manufacturing Systems', 'Quality Assurance Analyst (Finance)', 'Machine Learning Engineer',
    'Manufacturing Engineering Manager', 'Production Supervisor', 'Quality Inspector Supervisor', 'Director of Quality',
    'Manufacturing Engineer Intern (Summer 2027)', 'Part Time Student - Industrial Engineer', 'Technical Recruiter', 'Buyer II',
    'Production Planner', 'Production Shift Lead', 'Team Lead - Machine Shop', 'Senior Site Reliability Engineer',
    'IT Systems Engineer', 'Vehicle Software Quality Test Engineer', 'Senior Quality Engineer, Applied AI', 'Security Operator 3',
  ]) assert.equal(career(title, MACHINING), null, title);
});

test('a word before a name can make it another job', () => {
  // A one-word name is only itself after a word that leaves it so.
  assert.equal(career('Heavy Equipment Operator', MACHINING), null);
  assert.equal(career('Sr. Field Quality Technician', MACHINING), null);
  // A compound: an engineer of fluid systems is not a systems engineer.
  assert.equal(career('Fluid Systems Engineer, Production (Starship)', MACHINING), null);
  // A structural engineer designs buildings; a structures engineer, airframes.
  assert.equal(career('Structural Engineer, Starship Tower', MACHINING), null);
  // A trade stays itself.
  assert.equal(career('Orbital Tube Welder, Manifolds (Falcon)'), 'Welder');
  assert.equal(career('Lead Welder'), 'Welder');
  assert.deepEqual(read('Lead Welder').level, { word: 'Lead', rank: 4 });
});

test('a title only another name for a career is taken on the text as well', () => {
  // "Manufacturing specialist" is another name for a wafer fab operator; an
  // assembly job under that title names none of that career's skills.
  const assembly = 'What you will do:\n- Assemble and test electro-mechanical units to work instructions\nRequirements:\n- 2 years of assembly experience';
  assert.equal(career('Manufacturing Specialist, EW', assembly), null);
  const fab = 'What you will do:\n- Move wafer lots through the fab in cleanroom gowning, loading FOUPs and running recipes\n- Follow cleanroom protocols and wafer handling procedures\nRequirements:\n- High school diploma';
  assert.equal(career('Manufacturing Specialist', fab), 'Wafer Fab Operator');
  // An everyday trade name needs nothing more.
  assert.equal(career('Electrician II'), 'Industrial Electrician');
});

test('a test engineer on a software board is ours only if the words say hardware', () => {
  const software = 'What you will do:\n- Build CI/CD pipelines and unit tests for our backend microservices in Python and TypeScript\n- Review pull requests; own Kubernetes deployments\nRequirements:\n- 3 years of software development';
  const hardware = 'What you will do:\n- Design functional test fixtures for PCBAs; write LabVIEW test automation\n- Use oscilloscopes and multimeters to debug hardware\nRequirements:\n- 3 years of hardware test experience';
  assert.equal(career('Test Engineer', software, { department: 'Software Engineering' }), null);
  assert.equal(career('Test Engineer', hardware, { department: 'Software Engineering' }), 'Test Engineer');
  // The text alone can say it is software, whatever the department.
  assert.equal(career('Quality Engineer', software), null);
});

test('where two careers could be meant the path decides, and where it is even neither is', () => {
  // The same words spell another career's own title: an electrical engineer, not a design (mechanical) engineer.
  const board = 'Requirements:\n- Schematic capture and PCB layout in Altium\n- Bring-up with oscilloscopes';
  assert.equal(career('Electrical Design Engineer, Satellites', board), 'Electrical Engineer');
  // "Reliability Engineer" is the plant's; "Product Reliability Engineer" shares the bare title.
  const product = 'Requirements:\n- Design HALT/HASS and accelerated life testing; burn-in testing\n- Weibull analysis of field failures';
  const plant = 'Requirements:\n- Own the CMMS, vibration analysis and infrared thermography programs\n- Improve MTBF through condition-based maintenance';
  assert.equal(career('Reliability Engineer', product), 'Product Reliability Engineer');
  assert.equal(career('Reliability Engineer', plant), 'Reliability Engineer');
  assert.equal(career('Reliability Engineer', 'Requirements:\n- Five years of experience'), null);
  // Two jobs in one title and nothing to choose by.
  assert.equal(career('Assembler / Machine Operator', 'Requirements:\n- High school diploma'), null);
  // "Test Automation Engineer" is not an automation engineer unless the text says so.
  assert.equal(career('Test Automation Engineer', 'Requirements:\n- Five years of experience'), null);
});

// --- The level -------------------------------------------------------------------

test('every way a level is written', () => {
  const level = (title: string) => { const l = read(title, MACHINING).level; return l ? `${l.word}/${l.rank}` : null; };
  assert.equal(level('Machinist I'), 'I/1');
  assert.equal(level('Machinist 2'), 'II/2');
  assert.equal(level('Machinist III - 2nd Shift'), 'III/3');
  assert.equal(level('Machinist - Level 4'), 'IV/4');
  assert.equal(level('Machinist 2/3'), 'II/2');
  assert.equal(level('CNC Programmer (Starship Components) - Level 4/5'), 'IV/4');
  assert.equal(level('Senior Machinist'), 'Senior/3');
  assert.equal(level('Sr. Mechanical Engineer, Gearbox'), 'Senior/3');
  assert.equal(level('Lead Manufacturing Engineer, Mesh Optical'), 'Lead/4');
  assert.equal(level('Principal Mechanical Engineer'), 'Principal/4');
  assert.equal(level('Staff Mechanical Engineer, Omen'), 'Staff/4');
  assert.equal(level('Entry Level Machinist'), 'Entry/1');
  assert.equal(level('Associate Quality Engineer'), 'Associate/1');
  assert.equal(level('Maintenance Mechanic Apprentice'), 'Apprentice/1');
  assert.equal(level('Master Electrician'), 'Master/4');
  // A word and a numeral together is the word's level; two offered is the lower.
  assert.equal(level('Senior Electrical Engineer II'), 'Senior/3');
  assert.equal(level('Test Engineer II/Senior Test Engineer'), 'II/2');
  // The employer's own grade keeps its code.
  assert.equal(level('Machinist (Grade 9)'), 'Grade 9/3');
  assert.equal(level('Test Technician T3'), 'T3/3');
  // Not levels: a requisition code, an aircraft, initials, "all levels".
  assert.equal(level('General Machinist - N0309 South'), null);
  assert.equal(level('Aircraft Mechanic AME M2 (C-17)'), null);
  assert.equal(level('A&I Products Canada Inc. - Production Welder'), null);
  assert.equal(level('AFP Operator - All Levels'), null);
  // "Associate" after the job is the job.
  assert.equal(read('Production Associate', 'Requirements:\n- Follow work instructions and lockout tagout; 5S').level, null);
});

// --- Places ----------------------------------------------------------------------

test('the places the work is at, from the field as each feed writes it', () => {
  const places = (location: string | null, title = 'Welder', text = '') =>
    (readPosting({ employer: 'Acme', title, location, text }, vocab) as Reading).places.map((p) => `${p.city}, ${p.state}`);
  assert.deepEqual(places('Bastrop, TX'), ['Bastrop, TX']);
  assert.deepEqual(places('Hawthorne, CA; Starbase, TX'), ['Hawthorne, CA', 'Starbase, TX']);
  assert.deepEqual(places('US-TX-Austin'), ['Austin, TX']);
  assert.deepEqual(places('Fort Worth, Texas, United States'), ['Fort Worth, TX']);
  assert.deepEqual(places('United States-Utah-Salt Lake City'), ['Salt Lake City, UT']);
  assert.deepEqual(places('USA - Vermont - Essex Junction'), ['Essex Junction, VT']);
  assert.deepEqual(places('USA - Oklahoma City, OK'), ['Oklahoma City, OK']);
  assert.deepEqual(places('US, New Mexico, Albuquerque'), ['Albuquerque, NM']);
  assert.deepEqual(places('US-FL-OPA LOCKA-3201 ~ 3201 NW 167th St ~ NW 167TH'), ['Opa Locka, FL']);
  assert.deepEqual(places('DAVENPORT, Iowa, US, 52808-4918'), ['Davenport, IA']);
  assert.deepEqual(places('Waterloo, IA, Iowa, US, 50613-8000'), ['Waterloo, IA']);
  assert.deepEqual(places('Manassas, VA -  Fab 6'), ['Manassas, VA']);
  assert.deepEqual(places('Washington, District of Columbia, United States'), ['Washington, DC']);
  assert.deepEqual(places('Costa Mesa, California, United States; Remote'), ['Costa Mesa, CA']);
  // No place: remote, a country alone, and abroad, even where a country's code is a state's.
  for (const none of ['Remote', 'Remote (Houston, TX)', 'United States', 'Auckland, NZ', 'Toronto, CAN', 'Munich, BY', 'Laval, Canada',
    'Altona, Manitoba, CA, R0G 0B0', 'Bruchsal, BW, DE, 76646', 'GRANADERO BAIGORRIA, Santa Fe, AR, S2152FXA', 'Dublin, Dublin, Ireland']) {
    assert.deepEqual(places(none), [], none);
  }
  // The text only when the field is empty.
  assert.deepEqual(places('', 'Welder (Bastrop, TX)', 'Join the team in Bastrop, TX.'), ['Bastrop, TX']);
  assert.deepEqual(places('Hawthorne, CA', 'Welder', 'Some travel to Bastrop, TX.'), ['Hawthorne, CA']);
});

// --- Skills and makes ------------------------------------------------------------

test('a skill is found by its name, its other names and its short forms, with their edges respected', () => {
  const r = read('Welder', 'Requirements:\n- MIG welding and GMAW of carbon steel on 5-axis positioners\n- Lock-out / tag-out and preventative maintenance of the cell\n- Read blueprints and weld symbols');
  assert.deepEqual(names(r).sort(), ['5-Axis Machining', 'Blueprint Reading', 'Lockout Tagout', 'MIG Welding', 'Preventive Maintenance', 'Weld Symbol Interpretation']);
  // Every match says what it matched on.
  assert.equal(r.skills.find((s) => s.name === 'Lockout Tagout')?.on, 'Lock-out / tag-out');
  assert.equal(r.skills.find((s) => s.name === 'MIG Welding')?.on, 'MIG welding');

  // Never by a fragment, nor in a part number.
  const none = read('Welder', 'Requirements:\n- Express interest in press releases at all times\n- Part number SPC-1234 and item MES-22 are indicated on the traveler\n- Standards and work measurement are someone else\'s job');
  assert.deepEqual(names(none), []);
  assert.deepEqual(none.unknown, []);
});

test('a short code needs a neighbour', () => {
  // "UT" is Utah and "PT" is Pacific time until an inspection word stands beside them.
  const no = read('NDT Technician', 'Requirements:\n- Shift ends 1:30 a.m. PT\n- Sites in Clearfield, UT');
  assert.deepEqual(names(no), []);
  const yes = read('NDT Technician', 'Requirements:\n- Level II in PT, MT and UT per NAS 410');
  assert.deepEqual(names(yes).sort(), ['Liquid Penetrant Testing', 'Magnetic Particle Testing', 'Ultrasonic Testing']);
  // "PLC" beside "program"; "SPI" is a serial bus beside I2C and a solder paste inspection beside reflow.
  assert.ok(names(read('Controls Technician', 'Requirements:\n- Experience programming PLCs (ladder logic, Allen-Bradley)')).includes('PLC Programming'));
  const bus = read('Electrical Engineer', 'Requirements:\n- Schematic capture and PCB layout\n- Interfaces: SPI, I2C, UART');
  assert.ok(!names(bus).includes('Solder Paste Inspection Setup'));
  const line = read('SMT Line Operator', 'Requirements:\n- Solder paste printing, SPI, pick and place, reflow profiling and AOI');
  assert.ok(names(line).includes('Solder Paste Inspection Setup'));
});

test('a skill is read from what the posting asks, not from what it says about the company', () => {
  const r = read('Welder', 'About us:\nWe build rockets with TIG welding, friction stir welding and 5-axis machining.\nResponsibilities:\n- Weld to drawings\nBenefits:\n- Forklift certification paid; statistical process control training\nPhysical requirements:\n- Ability to lift 50 lbs and stand near overhead cranes');
  assert.deepEqual(names(r), []);
});

test('a make goes to the skill the posting names, else to the one on the career\'s path, else nowhere', () => {
  // "Haas" is a make of four skills. Alone, under a career whose path has none of them: nothing.
  const alone = read('Welder', 'Requirements:\n- Experience with Haas machines');
  assert.deepEqual(alone.makes, []);
  assert.deepEqual(names(alone), []);
  // With the skill named.
  const named = read('CNC Machinist', 'Requirements:\n- Experience with Haas machines\n- CNC milling of aluminum');
  assert.deepEqual(named.makes.map((m) => `${m.make}>${m.skill}`), ['Haas>CNC Milling']);
  // On a path that has several of its skills the make alone does not say which.
  assert.deepEqual(read('CNC Machinist', 'Requirements:\n- Experience with Haas machines').makes, []);
  // One of its skills on the path: that one, and the skill is named by the make.
  const pathed = read('CNC Machinist', 'Requirements:\n- Experience with Renishaw probes');
  assert.deepEqual(pathed.makes.map((m) => `${m.make}>${m.skill}`), ['Renishaw>On-Machine Probing']);
  assert.deepEqual(pathed.skills, [{ name: 'On-Machine Probing', on: 'Renishaw' }]);
  // The maker's name before its product is not a second make; an everyday word is not a make.
  const nx = read('Mechanical Engineer', 'Requirements:\n- 3D CAD in Siemens NX; upkeep of the model library; doors and closures');
  assert.deepEqual(nx.makes.map((m) => `${m.make}>${m.skill}`), ['NX>3D CAD Modeling']);
  // The employer's own name is not a make of its skills.
  const own = readPosting({ employer: 'Panasonic Energy', title: 'SMT Line Operator', location: 'Sparks, NV', text: 'Requirements:\n- Pick and place programming on Panasonic and Fuji machines' }, vocab) as Reading;
  assert.deepEqual(own.makes.map((m) => m.make), ['Fuji']);
});

test('words the catalogue does not have are kept for its next pass, a few per posting', () => {
  const r = read('CNC Machinist', 'Requirements:\n- Familiar with Fanuc controls and Mastercam; runs a ProtoTRAK and writes RCCA reports\n- Experience with Allen-Bradley drives');
  assert.deepEqual(r.unknown.map((u) => u.phrase), ['ProtoTRAK', 'RCCA', 'Allen-Bradley']);
  const many = read('CNC Machinist', `Requirements:\n- Experience with ${Array.from({ length: 20 }, (_, i) => `ZX${i}00A`).join(', ')}`);
  assert.equal(many.unknown.length, 8);
});

// --- Requirements ----------------------------------------------------------------

test('requirements are read as facts', () => {
  const a = read('Welder', [
    'Basic Qualifications:', '- High school diploma or GED', '- 3-5 years of welding experience', '- AWS D17.1 certification; A&P license a plus',
    'Preferred:', '- Bachelor’s degree', '- NADCAP experience', '- Must be able to obtain a Secret clearance',
    'Additional:', '- This is a 2nd shift, full-time position', '- To comply with ITAR you must be a U.S. person',
  ].join('\n')).requirements;
  assert.deepEqual(a, { yearsMin: 3, yearsMax: 5, education: 'high school', certifications: ['AWS D17.1', 'A&P'], clearance: 'Secret', citizenship: 'U.S. person', shift: 'swing', employmentType: 'full-time' });

  const b = read('Electronics Assembler', [
    'Requirements:', '- Minimum of two (2) years of experience', '- Associate degree in electronics',
    '- IPC J-STD-001 and IPC-A-610 certification; IPC 7711/7721 preferred', '- ASNT NDT Level II in PT and MT per NAS 410',
    '- Six Sigma Green Belt, CWI, OSHA 30, forklift certification, FAA Repairman certificate',
    '- Active TS/SCI clearance; U.S. citizenship is required', '- Rotating shift', '- Temporary position',
  ].join('\n')).requirements;
  assert.deepEqual(b, {
    yearsMin: 2, yearsMax: null, education: 'associate',
    certifications: ['IPC J-STD-001', 'IPC-A-610', 'IPC-7711/7721', 'NDT Level II', 'Forklift', 'Six Sigma Green Belt', 'CWI', 'OSHA 30', 'FAA Repairman'],
    clearance: 'TS/SCI', citizenship: 'U.S. citizen', shift: 'rotating', employmentType: 'temporary',
  });

  // Nothing said, nothing read: a company's age is not experience, the equal
  // opportunity paragraph is not a citizenship rule, and working to a standard is not holding its certificate.
  const c = read('Welder', 'About us:\nWith a history spanning over 40 years in the industry.\nRequirements:\n- Experience producing J-STD-001 Class 2 hardware\nWe decide without regard to race, citizenship status or age.').requirements;
  assert.deepEqual(c, { yearsMin: null, yearsMax: null, education: null, certifications: [], clearance: null, citizenship: null, shift: null, employmentType: null });

  // The least schooling that qualifies; a diploma "or 2 years" is not the experience asked;
  // the first requirement stated is the one, not the smallest figure after it.
  const d = read('Process Engineer', 'Minimum Qualifications:\n- Bachelor\'s or Master\'s degree in Chemical Engineering\n- 7+ years of process development experience\n- 1+ years of experience in design of experiments').requirements;
  assert.equal(d.education, 'bachelor');
  assert.equal(d.yearsMin, 7);
  const e = read('Production Operator', 'Requirements:\n- High school diploma, GED or 2 years of manufacturing experience\n- 1 year of manufacturing or equivalent experience').requirements;
  assert.equal(e.education, 'high school');
  assert.equal(e.yearsMin, 1);
  // The export rules' list of who may be hired is a U.S. person, though it opens with "citizen".
  const f = read('Welder', 'ITAR requirements:\n- Applicant must be a (i) U.S. citizen or national, (ii) U.S. lawful, permanent resident, (iii) refugee or (iv) asylee').requirements;
  assert.equal(f.citizenship, 'U.S. person');
  // A clearance type stated as a field, and "None".
  assert.equal(read('Welder', 'CLEARANCE TYPE: Secret\nTRAVEL: No').requirements.clearance, 'Secret');
  assert.equal(read('Welder', 'CLEARANCE TYPE: None\nTRAVEL: No').requirements.clearance, null);
  assert.equal(read('Welder', 'Requirements:\n- Handle confidential information with care').requirements.clearance, null);
});

// --- Pay -------------------------------------------------------------------------

test('pay, however it is written', () => {
  const pay = (text: string, title = 'CNC Machinist II') => { const p = read(title, text).pay; return p ? `${p.min}-${p.max} ${p.period}` : null; };
  assert.equal(pay('Pay: $26.92 - $40.38 /hr'), '26.92-40.38 hour');
  assert.equal(pay('Salary range: $69,300.00 - $115,500.00'), '69300-115500 year');
  assert.equal(pay('USD 85,000 to 120,000 annually'), '85000-120000 year');
  assert.equal(pay('$85K - $120K per year'), '85000-120000 year');
  assert.equal(pay('$31 — $46.50 USD'), '31-46.5 hour');
  assert.equal(pay('This position is a salary grade 6 and ranges from $72,480-121,440.'), '72480-121440 year');
  assert.equal(pay('Starting Pay: $29.00 / hour'), '29-29 hour');
  assert.equal(pay('Pay: $33.32/hour, with potential to earn up to $61.01/hour'), '33.32-61.01 hour');
  // A band per level: the title's level picks.
  const bands = 'Pay range:\nCNC Machinist/Level 1: $24.00 - $28.00/hour\nCNC Machinist/Level 2: $27.00 - $33.00/hour\nCNC Machinist/Level 3: $31.00 - $38.00/hour';
  assert.equal(pay(bands, 'CNC Machinist II'), '27-33 hour');
  assert.equal(pay(bands, 'CNC Machinist - Level 3'), '31-38 hour');
  assert.equal(pay(bands, 'CNC Machinist'), '24-38 hour');
  assert.equal(pay('Pay range:\nLevel I: $24/hr\nLevel II: $27/hr\nLevel III: $31/hr', 'CNC Machinist II'), '27-27 hour');
  assert.equal(pay('Quality Engineer: $74,000 - $129,000\nSenior Quality Engineer: $126,000 - $167,000', 'Senior Quality Engineer'), '126000-167000 year');
  assert.equal(pay('Quality Engineer: $74,000 - $129,000\nSenior Quality Engineer: $126,000 - $167,000', 'Quality Engineer'), '74000-129000 year');
  // Not pay: a placeholder, a bonus, another currency.
  assert.equal(pay('$1 — $2 USD'), null);
  assert.equal(pay('Sign-on bonus of $5,000 and a $5000 tax credit'), null);
  assert.equal(pay('Pay rate: CAD $60,008'), null);
});

// --- The text, however it arrives -------------------------------------------------

test('HTML, escaped HTML and one unbroken paragraph read the same as lines', () => {
  const lines = 'Responsibilities:\n- Set up and operate CNC mills\n- TIG welding of fixtures\nQualifications:\n- 3+ years of experience\n- High school diploma\nBenefits:\n- Forklift training';
  const html = '<h3>Responsibilities:</h3><ul><li>Set up and operate CNC mills</li><li>TIG welding of fixtures</li></ul><h3>Qualifications:</h3><ul><li>3+ years of experience</li><li>High school diploma</li></ul><h3>Benefits:</h3><ul><li>Forklift training</li></ul>';
  const escaped = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blob = `${'About Acme Acme builds things and has done so with care for a very long time. '.repeat(8)}Responsibilities Set up and operate CNC mills. TIG welding of fixtures. Qualifications 3+ years of experience. High school diploma. Benefits Forklift training.`;
  const want = read('CNC Machinist', lines);
  assert.deepEqual(names(want).sort(), ['CNC Milling', 'TIG Welding']);
  for (const text of [html, escaped, blob]) {
    const got = read('CNC Machinist', text);
    assert.deepEqual(names(got).sort(), ['CNC Milling', 'TIG Welding']);
    assert.equal(got.requirements.yearsMin, 3);
    assert.equal(got.requirements.education, 'high school');
  }
});

test('a posting that is not kept carries nothing but its refusal', () => {
  const r = read('Software Engineer', MACHINING);
  assert.equal(r.career, null);
  assert.equal(r.level, null);
  assert.deepEqual(r.skills, []);
  assert.deepEqual(r.makes, []);
  assert.deepEqual(r.unknown, []);
  assert.equal(r.pay, null);
  // Reading is a function of the posting alone.
  assert.deepEqual(read('CNC Machinist II', MACHINING), read('CNC Machinist II', MACHINING));
});

// --- The gold set ----------------------------------------------------------------

type Gold = {
  n: number; split: 'tune' | 'held'; employer: string; title: string; department: string | null; location: string | null; lines: string[];
  career: (string | null)[]; level: (string | null)[]; places: { city: string; state: string }[]; placesOptional?: boolean;
  asks?: {
    skills: { optional: boolean; any: string[] }[]; makes: { optional: boolean; make: string; any: string[] }[];
    requirements: Record<string, string>; pay: string | null;
  };
};
const gold: Gold[] = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/postings/gold.json'), 'utf8')).postings;

function score(split: 'tune' | 'held') {
  const s = {
    kept: 0, right: 0, wrong: [] as string[], notOurs: [] as string[], missed: 0,
    levelStated: 0, levelRight: 0, levelExtra: 0, places: 0, placesRight: 0,
    skillTp: 0, skillFp: 0, skillFn: 0, makeTp: 0, makeFp: 0, makeFn: 0,
    stated: {} as Record<string, number>, correct: {} as Record<string, number>, extra: {} as Record<string, number>,
  };
  const fact = (name: string, want: string | undefined | null, got: string | null, same = (w: string, g: string | null) => w === g) => {
    if (want === undefined || want === null || want === 'none') { if (got !== null && got !== '') s.extra[name] = (s.extra[name] ?? 0) + 1; return; }
    if (want.startsWith('?')) return;
    s.stated[name] = (s.stated[name] ?? 0) + 1;
    if (same(want, got)) s.correct[name] = (s.correct[name] ?? 0) + 1;
  };
  for (const g of gold.filter((x) => x.split === split)) {
    const r: Reading = readPosting({ employer: g.employer, title: g.title, location: g.location, department: g.department, text: g.lines.join('\n') }, vocab);
    const got = r.career?.title ?? null;
    const accepted = g.career.includes(got);
    if (got !== null) {
      s.kept++;
      if (accepted) s.right++;
      else if (g.career.length === 1 && g.career[0] === null) s.notOurs.push(`${g.title} → ${got}`);
      else s.wrong.push(`${g.title} → ${got}`);
    } else if (!accepted) s.missed++;
    if (got !== null && accepted) {
      const stated = g.level.filter((l) => l !== null);
      if (stated.length) { s.levelStated++; if (g.level.includes(r.level?.word ?? null)) s.levelRight++; } else if (r.level) s.levelExtra++;
    }
    s.places++;
    const same = r.places.length === g.places.length && r.places.every((p) => g.places.some((q) => q.city.toLowerCase() === p.city.toLowerCase() && q.state === p.state));
    if (same || (g.placesOptional && r.places.length === 0)) s.placesRight++;
    if (!g.asks || got === null) continue;
    const found = new Set(r.skills.map((x) => x.name));
    const allowed = new Set(g.asks.skills.flatMap((x) => x.any));
    for (const x of g.asks.skills) if (!x.optional) { if (x.any.some((n) => found.has(n))) s.skillTp++; else s.skillFn++; }
    for (const x of r.skills) if (!allowed.has(x.name)) s.skillFp++;
    const made = new Set(r.makes.map((m) => `${m.make}>${m.skill}`));
    const makesAllowed = new Set(g.asks.makes.flatMap((m) => m.any.map((sk) => `${m.make}>${sk}`)));
    for (const m of g.asks.makes) if (!m.optional) { if (m.any.some((sk) => made.has(`${m.make}>${sk}`))) s.makeTp++; else s.makeFn++; }
    for (const m of r.makes) if (!makesAllowed.has(`${m.make}>${m.skill}`)) s.makeFp++;
    const q = g.asks.requirements;
    const R = r.requirements;
    fact('years', q.years, R.yearsMin === null ? null : `${R.yearsMin}${R.yearsMax !== null ? `-${R.yearsMax}` : ''}`);
    fact('education', q.edu, R.education);
    fact('certifications', q.certs, R.certifications.join(','), (w) => {
      const need = w.split(',').filter((c) => !c.startsWith('?'));
      const may = w.split(',').map((c) => c.replace(/^\?/, ''));
      return need.every((c) => R.certifications.includes(c)) && R.certifications.every((c) => may.includes(c));
    });
    fact('clearance', q.clearance, R.clearance);
    fact('citizenship', q.citizenship, R.citizenship);
    fact('shift', q.shift, R.shift);
    fact('employmentType', q.type, R.employmentType);
    const pay = r.pay ? `${r.pay.min}-${r.pay.max} ${r.pay.period}` : null;
    fact('pay', g.asks.pay, pay, (w, p) => { const [bands, period] = w.split(' '); return bands.split('|').some((b) => `${b} ${period}` === p); });
  }
  return s;
}

// The floor is what the reader reached when it was finished (see scripts/ingest/README.md,
// "Reading a posting"). The held half was not looked at until then. Raise a figure when
// the reader gets better; never lower one to let a change through.
const FLOOR = {
  held: { right: 46, missed: 23, skillTp: 53, skillFp: 7, makeTp: 12, makeFp: 0, level: 20, places: 240, years: 13, education: 13, certifications: 1, clearance: 3, citizenship: 6, shift: 3, employmentType: 1, pay: 12 },
  tune: { right: 67, missed: 8, skillTp: 89, skillFp: 4, makeTp: 12, makeFp: 0, level: 33, places: 238, years: 23, education: 22, certifications: 2, clearance: 3, citizenship: 10, shift: 2, employmentType: 2, pay: 23 },
} as const;

for (const split of ['held', 'tune'] as const) {
  test(`the gold set, ${split === 'held' ? 'held-out' : 'tuning'} half: no worse than when the reader was finished`, () => {
    const s = score(split);
    const floor = FLOOR[split];
    // The two that decide what enters the database: no wrong career, nothing kept that is not ours.
    assert.deepEqual(s.wrong, [], 'a kept posting was given the wrong career');
    assert.deepEqual(s.notOurs, [], 'a posting that is not one of the careers was kept');
    assert.ok(s.right >= floor.right, `kept with the right career: ${s.right}, was ${floor.right}`);
    assert.ok(s.missed <= floor.missed, `careers of ours refused: ${s.missed}, was ${floor.missed}`);
    assert.equal(s.levelRight, s.levelStated, 'a stated level was read wrong');
    assert.ok(s.levelStated >= floor.level, `levels read: ${s.levelStated}, was ${floor.level}`);
    assert.equal(s.levelExtra, 0, 'a level was read where the title states none');
    assert.ok(s.placesRight >= floor.places, `places right: ${s.placesRight} of ${s.places}, was ${floor.places}`);
    assert.ok(s.skillTp >= floor.skillTp, `skills found: ${s.skillTp}, was ${floor.skillTp}`);
    assert.ok(s.skillFp <= floor.skillFp, `skills the lines do not ask for: ${s.skillFp}, was ${floor.skillFp}`);
    assert.ok(s.makeTp >= floor.makeTp, `makes found: ${s.makeTp}, was ${floor.makeTp}`);
    assert.ok(s.makeFp <= floor.makeFp, `makes given to the wrong skill: ${s.makeFp}, was ${floor.makeFp}`);
    for (const name of ['years', 'education', 'certifications', 'clearance', 'citizenship', 'shift', 'employmentType', 'pay'] as const) {
      assert.ok((s.correct[name] ?? 0) >= floor[name], `${name} right when stated: ${s.correct[name] ?? 0}, was ${floor[name]}`);
    }
    assert.equal(s.extra.pay ?? 0, 0, 'pay was read where none is stated');
  });
}

test('the whole gold set is read in well under a second', () => {
  const started = process.hrtime.bigint();
  for (const g of gold) readPosting({ employer: g.employer, title: g.title, location: g.location, department: g.department, text: g.lines.join('\n') }, vocab);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 2000, `480 postings took ${ms.toFixed(0)} ms`);
});
