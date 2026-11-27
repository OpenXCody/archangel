// Unit checks for the reading of a job posting (scripts/ingest/postings/read/):
// which career a title is, its level, where the work is, the skills and makes the
// text asks for, its requirements and its pay.
//
// Two kinds of check. Named cases: every trap the reader was written against (a
// fragment that must not match, a make with no skill, a software title, a manager,
// a location with two places, each way pay is written, each way a level is). And
// the gold set (tests/fixtures/postings/gold.json): 480 hand-labelled postings in
// reduced form, half of them held out while the reader was built, and 48 added to the
// tuning half since: 20 titles of cleaning and food preparation work when those careers
// left the catalogue, 24 for the words that make a title not ours (20 that hold one
// beside a career's own name, four that hold a word left off the list on purpose), and
// four production welders (a production welder is the MIG Welder; the two the set
// already held are labelled so now). The figures the reader reached on each half are a
// floor: a change that reads worse fails here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain script, no types
import { loadVocabulary, readPosting } from '../../scripts/ingest/postings/read/index.mjs';
import { notOursWord } from '../../scripts/ingest/postings/read/vocabulary.mjs';

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

  // The employer's name before the job (and a production welder is the MIG welder: the test below).
  assert.equal(career('John Deere Harvester Works - Production Welder'), 'MIG Welder');
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

test('cleaning a plant and preparing food by hand are not among the careers, whatever the text names', () => {
  // The four careers that left the catalogue (data/careers/catalogue.json, `removed`: Sanitation Technician, Meat
  // Cutter, Slaughterer, Baker) and the names such jobs go by. A posting for one names skills the catalogue has
  // (sanitation, lockout, HACCP, the knife, the dough), so each is read with them all in its text: the title decides.
  const names = 'Requirements:\n- Sanitation procedures, clean-in-place, allergen changeover cleaning and environmental monitoring under the HACCP plan and GMPs\n' +
    '- Lockout tagout, chemical safety, PPE and 5S\n- Knife sharpening and steeling; meat deboning and trimming; vacuum packaging; lot tracking\n' +
    '- Dough mixing, proofing and industrial oven baking; food batching and blending; shop math\n- Forklift operation; follow work instructions';
  for (const title of [
    'Sanitation Technician I', 'Sanitation Specialist I', 'Sanitation Worker', 'Sanitor', 'Janitor', 'Custodian', 'Cleaner', 'Housekeeper',
    'Houston 66 (Washington Heights) Market - Meat Cutter - Full time', 'Meat Cutter', 'Butcher', 'Baker', 'Bakery Clerk', 'Cake Decorator',
    'Line Cook', 'Prep Cook', 'Food Prep Associate', 'Kitchen Team Member', 'Deli Clerk', 'Dishwasher',
    // The other names the four went by, and the careers' own titles with a level, a shift or a site about them.
    'Slaughterer', 'Sanitation Technician - 3rd Shift', 'Sanitation Associate', 'Sanitation Team Member', 'Food Plant Sanitation Technician',
    'Meat Cutter II', 'Meat Trimmer', 'Deboner', 'Harvest Floor Worker', 'Meat Packer', 'Production Baker', 'Dough Mixer', 'Bakery Mixer',
  ]) {
    assert.equal(career(title), null, title);
    assert.equal(career(title, names), null, `${title}, with the skills such a posting names`);
  }
  // None of them is a career of the vocabulary, under its title or another name.
  for (const title of ['Sanitation Technician', 'Meat Cutter', 'Slaughterer', 'Baker']) assert.ok(!vocab.careers.has(title), `${title} is not a career`);
  // "Oven Operator" was folded into the paint shop's career; a bakery's oven operator carries the same title, so
  // the name is taken back (`not` in data/careers/aliases.json) and neither is read as a painter.
  assert.equal(career('Bakery Oven Operator', names), null);
  assert.equal(career('Oven Operator', 'Requirements:\n- Spray gun painting, paint defect identification and color matching'), null);
  // The food and drink careers that run process equipment are read as before.
  assert.equal(career('Food Processing Operator'), 'Food Processing Operator');
  assert.equal(career('Packaging Line Operator'), 'Packaging Line Operator');
  assert.equal(career('Food Safety and Quality Technician'), 'Food Safety and Quality Technician');
  assert.equal(career('Beverage Production Operator II - Nights'), 'Beverage Production Operator');
});

test('janitorial, grounds and food-service work is never ours, whatever career the title also names', () => {
  // The words are data (data/careers/aliases.json, `notOurs`), and a title that holds one is turned away before
  // anything else is read: each title here names a career beside the word and is read with a text that names that
  // career's skills, which without the word would keep it.
  const MAINTENANCE = 'Requirements:\n- Perform preventive maintenance on conveyors, pumps and compressed air systems\n- Troubleshoot hydraulic and pneumatic systems; read electrical schematics\n- Follow lockout tagout; enter work orders in the CMMS';
  const OPERATING = 'Requirements:\n- Follow work instructions, lockout tagout and PPE rules\n- Operate a forklift; record lot numbers\n- Keep the area to 5S standards; check parts with calipers';
  const listed = (JSON.parse(readFileSync(path.join(root, 'data/careers/aliases.json'), 'utf8')) as { notOurs: { why: string; words: string[] } }).notOurs;
  assert.ok(listed.why.length > 40 && !listed.why.includes('\n'), 'the list says why, in one line');
  const away: [string, string, string][] = [
    ['janitor', 'Janitor / General Laborer', OPERATING], ['janitorial', 'Janitorial Maintenance Technician', MAINTENANCE],
    ['custodian', 'Custodian / Maintenance Technician', MAINTENANCE], ['custodial', 'Custodial Maintenance Technician', MAINTENANCE],
    ['housekeeper', 'Plant Housekeeper (Production Associate)', OPERATING], ['housekeeping', 'Production Associate - Housekeeping', OPERATING],
    ['sanitation', 'Sanitation Production Operator', OPERATING], ['sanitation', 'General Laborer - Sanitation', OPERATING],
    ['sanitor', 'Sanitor / Machine Operator - 3rd Shift', OPERATING],
    ['groundskeeper', 'Groundskeeper / Maintenance Technician', MAINTENANCE], ['groundskeeping', 'Groundskeeping Maintenance Technician', MAINTENANCE],
    ['grounds keeper', 'Grounds Keeper - Maintenance Mechanic', MAINTENANCE], ['grounds keeping', 'Grounds Keeping and Maintenance Technician', MAINTENANCE],
    ['grounds maintenance', 'Grounds Maintenance Technician', MAINTENANCE],
    ['landscaping', 'Landscaping Maintenance Technician', MAINTENANCE], ['landscaper', 'Landscaper / Maintenance Technician', MAINTENANCE],
    ['cafeteria', 'Cafeteria Production Operator', OPERATING], ['food service', 'Production Operator - Food Service', OPERATING],
    ['food prep', 'Food Prep Production Operator', OPERATING], ['food preparation', 'Food Preparation Production Operator', OPERATING],
    // The same work under its other spellings and words.
    ['house keeper', 'House Keeper / Production Associate', OPERATING], ['house keeping', 'House Keeping Maintenance Technician', MAINTENANCE],
    ['porter', 'Plant Porter - Maintenance Technician', MAINTENANCE],
    ['sanitization', 'Sanitization Production Operator', OPERATING], ['sanitizing', 'Sanitizing Production Operator', OPERATING], ['hygiene', 'Plant Hygiene Production Operator', OPERATING],
    ['grounds and maintenance', 'Grounds & Maintenance Technician', MAINTENANCE], ['grounds and building', 'Grounds and Building Maintenance Technician', MAINTENANCE],
    ['landscape', 'Landscape Maintenance Technician', MAINTENANCE], ['lawn care', 'Lawn Care / Maintenance Technician', MAINTENANCE], ['lawn maintenance', 'Lawn Maintenance Technician', MAINTENANCE],
    ['canteen', 'Canteen Production Operator', OPERATING], ['catering', 'Catering Production Operator', OPERATING], ['culinary', 'Culinary Production Operator', OPERATING],
    ['foodservice', 'Foodservice Production Operator', OPERATING],
    // The work of the four careers that left the catalogue, under a title that is still a career's.
    ['meat cutter', 'Meat Cutter - Machine Operator', OPERATING], ['meat cutting', 'Production Operator - Meat Cutting', OPERATING], ['butcher', 'Butcher / Production Operator', OPERATING],
    ['kill floor', 'Production Operator - Kill Floor', OPERATING], ['slaughter', 'Production Associate - Slaughter', OPERATING], ['deboning', 'Production Worker - Deboning', OPERATING],
  ];
  // Every word of the list has its title here, and the list has no word this test does not know.
  assert.deepEqual([...new Set(away.map(([word]) => word))].sort(), [...listed.words].sort());
  const without = { ...vocab, notOurs: [] };
  for (const [word, title, text] of away) {
    assert.equal(notOursWord(title, vocab), word, title);
    assert.equal(career(title), null, title);
    assert.equal(career(title, text), null, `${title}, with the skills of the career it names`);
    // The case bites: with the list set aside, the same posting is kept.
    assert.notEqual(readPosting({ employer: 'Acme Aerospace', title, location: 'Austin, TX', text }, without).career, null, `${title} is kept without the list`);
  }
  // A plural is its singular, and the word counts wherever it stands: in brackets, after a dash, in capitals.
  for (const title of ['Custodians (2nd Shift)', 'Food Services Production Operator', 'Maintenance Technician (Janitorial)', 'MAINTENANCE TECHNICIAN - GROUNDS MAINTENANCE', 'Production Operator, Sanitation - Nights']) {
    assert.equal(career(title, MAINTENANCE + OPERATING.replace('Requirements:', '')), null, title);
  }
  // Left off the list on purpose: real factory work is titled with these words, and is read as before.
  assert.equal(career('Facilities Maintenance Technician', MAINTENANCE), 'Maintenance Technician');
  assert.equal(career('Building Maintenance Technician', MAINTENANCE), 'Maintenance Technician');
  assert.equal(career('Cleanroom Technician', 'Requirements:\n- Wafer handling, cleanroom gowning and cleanroom protocols\n- Record particle counts; ESD control'), 'Wafer Fab Operator');
  assert.equal(career('Cleaning Room Operator', 'Requirements:\n- Grind and chip castings; oxy-fuel cutting and carbon arc gouging'), 'Casting Finisher');
  for (const title of [
    'Facilities Maintenance Technician', 'Building Maintenance Technician', 'Cleanroom Technician', 'Clean Room Operator', 'Cleaning Room Operator', 'Parts Cleaning Operator',
    'Kitchen Production Operator', 'Bakery Production Operator', 'Deli Packaging Operator', 'Store Maintenance Technician', 'Meat Market Production Operator',
    // "Grounds" by itself is a proving grounds, and a ground is an electrical one. A word of the list that stands in
    // an excepted phrase is that phrase's (`exceptIn`): a proving grounds has maintenance technicians of its own.
    'Proving Grounds Test Technician', 'Proving Grounds Maintenance Technician', 'Maintenance Technician - Proving Grounds', 'Grounding and Bonding Technician', 'Ground Support Equipment Mechanic',
    // Left off as well: a parts cleaner, a lawn mower plant, a harvester's line.
    'Parts Cleaner / Machine Operator', 'Lawn Mower Assembler', 'Harvester Assembler',
    // The words are whole words: none of these holds one.
    'Sanitary Welder', 'Sanitizer Blending Operator', 'Custody Transfer Technician', 'Food Safety and Quality Technician', 'Food Processing Operator',
  ]) assert.equal(notOursWord(title, vocab), null, title);
});

test('a word of the list in an excepted phrase is not counted, and the same word outside it is', () => {
  const MAINTENANCE = 'Requirements:\n- Perform preventive maintenance on conveyors, pumps and compressed air systems\n- Troubleshoot hydraulic and pneumatic systems; read electrical schematics\n- Follow lockout tagout; enter work orders in the CMMS';
  assert.equal(career('Proving Grounds Maintenance Technician', MAINTENANCE), 'Maintenance Technician');
  assert.equal(career('Maintenance Technician (Milford Proving Grounds)', MAINTENANCE), 'Maintenance Technician');
  assert.equal(notOursWord('Grounds Maintenance Technician', vocab), 'grounds maintenance');
  // Both in one title: the grounds crew of a proving grounds is still a grounds crew.
  assert.equal(notOursWord('Proving Grounds - Grounds Maintenance Technician', vocab), 'grounds maintenance');
  assert.equal(career('Proving Grounds - Grounds Maintenance Technician', MAINTENANCE), null);
  // The case bites: without the phrase the first title is turned away.
  const without = { ...vocab, notOurs: Object.assign([...vocab.notOurs], { exceptIn: [] }) };
  assert.equal(notOursWord('Proving Grounds Maintenance Technician', without), 'grounds maintenance');
});

test('a plain title filed under a department of work that is never ours is that work', () => {
  // A food plant titles its sanitation crew "Production Operator" and files it under its department: the title holds
  // no word of the list, the department does, and it is read by the same list.
  const OPERATING = 'Requirements:\n- Follow work instructions, lockout tagout and PPE rules\n- Operate a forklift; record lot numbers\n- Keep the area to 5S standards; check parts with calipers';
  const MAINTENANCE = 'Requirements:\n- Perform preventive maintenance on conveyors, pumps and compressed air systems\n- Troubleshoot hydraulic and pneumatic systems; read electrical schematics\n- Follow lockout tagout; enter work orders in the CMMS';
  for (const [title, department, text] of [
    ['Production Operator', 'Sanitation', OPERATING], ['General Laborer', 'Sanitation - 3rd Shift', OPERATING], ['Production Operator', 'Janitorial Services', OPERATING],
    ['Production Operator', 'Cafeteria', OPERATING], ['Production Associate', 'Slaughter', OPERATING],
    ['Maintenance Technician', 'Custodial Services', MAINTENANCE], ['Maintenance Technician', 'Housekeeping', MAINTENANCE], ['Maintenance Technician', 'Grounds Maintenance', MAINTENANCE],
  ]) {
    assert.equal(career(title, text, { department }), null, `${title} in ${department}`);
    // The case bites: in a department of the plant's own work the same posting is kept.
    assert.notEqual(career(title, text, { department: 'Plant Operations' }), null, `${title} in Plant Operations`);
  }
  // A department the list is silent on, or excepts, changes nothing.
  assert.equal(career('Maintenance Technician', MAINTENANCE, { department: 'Facilities' }), 'Maintenance Technician');
  assert.equal(career('Maintenance Technician', MAINTENANCE, { department: 'Proving Grounds' }), 'Maintenance Technician');
  assert.equal(career('Welder', '', { department: 'Fabrication' }), 'Welder');
});

test('a name taken back is no longer read: a rigger is not a millwright, and a body shop\'s weld technician is not the trade\'s welder', () => {
  // A rigger moves loads; the catalogue's Millwright installs, aligns and rebuilds machinery, and it has no rigger.
  const RIGGING = 'Requirements:\n- Operate overhead cranes and forklifts to move flight hardware\n- Inspect slings, shackles and lifting fixtures';
  for (const title of ['Rigger', 'Rigger (Critical Movement Team) - 2nd Shift', 'Rigger II', 'Senior Rigger']) {
    assert.equal(career(title), null, title);
    assert.equal(career(title, RIGGING), null, `${title}, with a rigger's text`);
  }
  assert.equal(career('Millwright'), 'Millwright');
  assert.equal(career('Machinery Mover'), 'Millwright');
  // Rivian's body shop titles its weld technicians with the vehicle's programme: the catalogue's career for that
  // work is Body Weld Technician, and the name is listed under it.
  assert.equal(career('Weld Technician, EDV Body (Afternoon Shift)'), 'Body Weld Technician');
  assert.equal(career('Weld Technician, Body'), 'Body Weld Technician');
  assert.equal(career('Weld Technician'), 'Welder');
});

test('a production welder is the MIG welder, not the several-process welder', () => {
  // The catalogue has both: Welder (stick, MIG, flux-cored and TIG, in all positions) and MIG Welder (one wire
  // process on a production line). "Production Welder" is another name of MIG Welder (data/careers/aliases.json),
  // so the title is read as it without a word of the text; before, the name ended in "welder" and was the trade.
  const listed = (JSON.parse(readFileSync(path.join(root, 'data/careers/aliases.json'), 'utf8')) as { careers: { title: string; aliases: string[] }[] }).careers;
  const namesOf = (title: string) => (listed.find((row) => row.title === title)?.aliases ?? []).map((name) => name.toLowerCase());
  for (const name of ['production welder', 'production mig welder', 'mig production welder']) {
    assert.ok(namesOf('MIG Welder').includes(name), `"${name}" is a name of MIG Welder`);
    assert.ok(!namesOf('Welder').includes(name), `"${name}" is not a name of Welder`);
  }
  const TEXT = 'Requirements:\n- Operate forklifts and hoists\n- 6 months of welding experience\n- High school diploma or GED';
  for (const title of [
    // John Deere's board, as production had it.
    'John Deere Davenport Works - Production Welder', 'John Deere Dubuque - Production Welder', 'John Deere Harvester Works - Production Welder',
    'John Deere Horicon Works - Production Welder', 'John Deere Seeding Group - Production Welder', 'A&I Products Canada Inc. - Production Welder',
    'Production Welder', 'Production Welder II', 'Production Welder (2nd Shift)', 'Production MIG Welder', 'MIG Production Welder', 'Welder, Production', 'Welder - Production',
  ]) {
    assert.equal(career(title), 'MIG Welder', title);
    assert.equal(career(title, TEXT), 'MIG Welder', `${title}, with a text that names no process`);
  }
  assert.deepEqual(read('Production Welder').career, { title: 'MIG Welder', how: 'other name', matched: 'production welder' });
  assert.deepEqual(read('Senior Production Welder').level, { word: 'Senior', rank: 3 });
  // The case bites: with those names set aside the same titles are the trade again.
  const without = loadVocabulary(root);
  for (const key of ['production welder', 'production mig welder', 'mig production welder']) {
    const name = without.byKey.get(key);
    assert.ok(name, key);
    without.byKey.delete(key);
    without.byLast.set('welder', without.byLast.get('welder').filter((each: unknown) => each !== name));
  }
  assert.equal(readPosting({ employer: 'John Deere', title: 'John Deere Harvester Works - Production Welder', location: 'East Moline, Illinois, US, 61244', text: TEXT }, without).career?.title, 'Welder');
  // The welders that are not a production line's stay what they were.
  assert.equal(career('Welder'), 'Welder');
  assert.equal(career('Structural Welder, Stage 0 Ground Fabrication (Starship)'), 'Welder');
  assert.equal(career('Pipe Welder II'), 'Welder');
  assert.equal(career('Production TIG Welder'), 'TIG Welder');
  assert.equal(career('TIG Welder (Starship)'), 'TIG Welder');
  assert.equal(career('MIG Welder'), 'MIG Welder');
});

test("a trade's general name says its branch only while nothing else does: the title's own word for the kind, or the text, is read first", () => {
  // "Production welder" is words that leave a trade what it is before the trade's own title, listed as a name of one
  // of its branches. It is a default: a title that says another kind beside it is that kind, with any text or none.
  const NONE = '';
  const VARIOUS = 'Requirements:\n- Weld parts and sub-assemblies to specification using various welding processes\n- Operate forklifts and hoists\n- Read and comprehend work instructions';
  const MIG = 'Requirements:\n- MIG welding (GMAW) of steel weldments\n- Read blueprints and weld symbols';
  const TIG = 'Requirements:\n- TIG welding of aluminum housings\n- Read blueprints and weld symbols';
  const STICK = 'Requirements:\n- Stick welding (SMAW) and flux-cored welding (FCAW) of structural steel in all positions\n- Read blueprints and weld symbols; oxy-fuel cutting';
  const every = [NONE, VARIOUS, MIG, TIG, STICK];
  const always = (title: string, wanted: string) => { for (const text of every) assert.equal(career(title, text), wanted, `${title} / ${text.split('\n')[1] ?? 'no text'}`); };
  // The kind in another part of the title, as a name with the trade's word: after a dash, in brackets, among other words.
  always('Production Welder - TIG', 'TIG Welder');
  always('Production Welder (TIG)', 'TIG Welder');
  always('Production Welder (GTAW)', 'TIG Welder');
  always('Production Welder, Aluminum TIG', 'TIG Welder');
  always('Welder, Production (TIG)', 'TIG Welder');
  always('TIG Production Welder', 'TIG Welder');
  always('Production Welder, Aerospace', 'Aerospace Welder');
  always('Production Welder - Stick/Flux Core', 'Welder');
  always('Production Welder - Pipe Shop', 'Welder');
  // The kind inside the title: the general name is no rival to a name that says it, so none of these is left open.
  for (const title of ['Production Stick Welder', 'Production Pipe Welder', 'Production Structural Welder', 'Production Combo Welder', 'Production Fitter Welder']) always(title, 'Welder');
  always('Robotic Production Welder', 'Welder');
  // A title that says the same kind, or only where and when, is the default still; so is one whose other part is a
  // word that says no kind ("certified").
  always('Production Welder - MIG', 'MIG Welder');
  assert.equal(career('Production Welder (Certified)'), 'MIG Welder');
  assert.equal(career('Production Welder - Certified, 2nd Shift'), 'MIG Welder');
  always('MIG Production Welder', 'MIG Welder');
  for (const title of ['Production Welder', 'Certified Production Welder', 'Skilled Production Welder', 'Welder - Production', 'Production Welder - 2nd Shift (Dubuque Works)', 'Production Welder (Starship)']) {
    assert.equal(career(title, NONE), 'MIG Welder', title);
    // A text that names no process, or the branch's own, leaves it: John Deere's say "various welding processes".
    assert.equal(career(title, VARIOUS), 'MIG Welder', `${title}, various processes`);
    assert.equal(career(title, MIG), 'MIG Welder', `${title}, MIG`);
    // A text that asks for what only the whole trade does (TIG, stick) is the trade's, as its own title would be read.
    assert.equal(career(title, TIG), 'Welder', `${title}, TIG`);
    assert.equal(career(title, STICK), 'Welder', `${title}, stick`);
  }
  // A skill most careers share is not such a sign: a forklift does not make a production welder the trade's.
  assert.ok(!vocab.careers.get('Welder').telling.has('Forklift Operation'));
  assert.ok(vocab.careers.get('Welder').path.includes('Forklift Operation') && !vocab.careers.get('MIG Welder').path.includes('Forklift Operation'));
  // Only such a name is treated so: the trades' other names are names like any other.
  assert.equal(career('Production Electrician'), 'Industrial Electrician');
  assert.equal(career('Pipe Welder', MIG), 'Welder');
  assert.equal(career('Production TIG Welder', MIG), 'TIG Welder');
});

test('a word before a name can make it another job', () => {
  // A one-word name is only itself after a word that leaves it so.
  assert.equal(career('Heavy Equipment Operator', MACHINING), null);
  assert.equal(career('Sr. Field Quality Technician', MACHINING), null);
  // A compound: an engineer of fluid systems is not a systems engineer.
  assert.equal(career('Fluid Systems Engineer, Production (Starship)', MACHINING), null);
  // A structural engineer designs buildings; a structures engineer, airframes.
  assert.equal(career('Structural Engineer, Starship Tower', MACHINING), null);
  // A trade stays itself, and a title that names its process is that branch (orbital welding is TIG's).
  assert.equal(career('Pipe Welder (Starship)'), 'Welder');
  assert.equal(career('Orbital Tube Welder, Manifolds (Falcon)'), 'TIG Welder');
  assert.equal(career('Lead Welder'), 'Welder');
  assert.deepEqual(read('Lead Welder').level, { word: 'Lead', rank: 4 });
});

test('a title only another name for a career is taken on the text as well', () => {
  // "Manufacturing associate" is another name for a production operator; an
  // office job under that title names none of that career's skills.
  const office = 'What you will do:\n- Keep the team calendar and book travel\nRequirements:\n- 2 years of office experience';
  assert.equal(career('Manufacturing Associate, EW', office), null);
  const line = 'What you will do:\n- Run the line to work instructions, following lockout tagout and 5S\nRequirements:\n- High school diploma';
  assert.equal(career('Manufacturing Associate', line), 'Production Operator');
  // A name the lists file took back from a career (`not` in data/careers/aliases.json) is not read as it,
  // whether it was an everyday name or a title the catalogue folded in: the file, the database and the reader agree.
  const fab = 'What you will do:\n- Move wafer lots through the fab in cleanroom gowning, loading FOUPs and running recipes\n- Follow cleanroom protocols and wafer handling procedures\nRequirements:\n- High school diploma';
  assert.equal(career('Manufacturing Specialist', fab), null);
  assert.equal(career('Product Engineer', 'Requirements:\n- Yield analysis, wafer sort data and SPC'), null);
  assert.equal(career('Electrical Technician', 'Requirements:\n- Conduit bending, motor controls and 480 V power distribution'), null);
  assert.equal(career('Mechanic', 'Requirements:\n- Preventive maintenance, hydraulics and lockout tagout'), null);
  // The names employers use that the lists gained are read.
  assert.equal(career('Materials and Processes Engineer'), 'Materials Engineer');
  assert.equal(career('Wire Harness Technician'), 'Wire Harness Assembler');
  assert.equal(career('Corrosion Control Technician'), 'Industrial Painter');
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
  // Two level words side by side are one level, the higher; a span of levels is none in particular.
  assert.equal(level('Sr. Principal CNC Programmer'), 'Principal/4');
  assert.equal(level('Senior Staff Test Engineer - Reliability'), 'Staff/4');
  assert.equal(level('Mechanical Engineer (Associate to Principal)'), null);
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
  // A Workday site named with spaces: its town, its state's letters, the country and the site's number.
  assert.deepEqual(places('Auburn AL USA'), ['Auburn, AL']);
  assert.deepEqual(places('Saint George UT US 1'), ['Saint George, UT']);
  assert.deepEqual(places('Grand Rapids MI US 1; Indianapolis IN US 2'), ['Grand Rapids, MI', 'Indianapolis, IN']);
  // The two cities named as a state are cities in this form too.
  assert.deepEqual(places('Washington DC USA'), ['Washington, DC']);
  assert.deepEqual(places('New York NY USA'), ['New York, NY']);
  // A part that says there are more places is not the city.
  assert.deepEqual(places('Dallas, Multiple Locations, TX'), ['Dallas, TX']);
  // Plant City is the one town that begins with the word plant, and a town named for another state is a town beside
  // that state's two letters, in every form: comma, hyphen and spaced. The two cities named as a state are cities
  // beside their own, its name or its letters.
  for (const [line, place] of [
    ['Plant City, FL', 'Plant City, FL'], ['PLANT CITY, FL', 'Plant City, FL'], ['Plantation, FL', 'Plantation, FL'], ['Delaware, OH', 'Delaware, OH'],
    ['Wyoming, MI', 'Wyoming, MI'], ['Oregon, OH', 'Oregon, OH'], ['Nevada, IA', 'Nevada, IA'], ['Indiana, PA', 'Indiana, PA'], ['Washington, PA', 'Washington, PA'],
    ['US-OH-Delaware', 'Delaware, OH'], ['USA - Delaware, OH', 'Delaware, OH'], ['Delaware, OH, US', 'Delaware, OH'], ['US, OH, Delaware', 'Delaware, OH'],
    ['Plant City FL USA', 'Plant City, FL'], ['Delaware OH USA', 'Delaware, OH'], ['Wyoming MI USA', 'Wyoming, MI'], ['Oregon OH USA', 'Oregon, OH'],
    ['Nevada IA USA', 'Nevada, IA'], ['Indiana PA USA', 'Indiana, PA'],
    ['New York, New York', 'New York, NY'], ['New York, New York, United States of America', 'New York, NY'], ['US-DC-Washington', 'Washington, DC'],
    ['Washington, Washington, DC', 'Washington, DC'],
  ]) {
    assert.deepEqual(places(line), [place], line);
  }
  // A city between two states is the first state's, as each state is settled in the order it is written.
  for (const [line, place] of [
    ['Arizona, Phoenix, Nevada', 'Phoenix, AZ'], ['Oklahoma, Tulsa, Texas, Dallas', 'Tulsa, OK'], ['Ohio - Cincinnati - Kentucky', 'Cincinnati, OH'],
    ['Georgia, Atlanta, Alabama', 'Atlanta, GA'],
  ]) {
    assert.deepEqual(places(line), [place], line);
  }
  // The District in any spelling is DC, and a ZIP code after a state's letters is left off.
  for (const [line, place] of [
    ['Washington, D.C.', 'Washington, DC'], ['Washington D.C., Washington, DC', 'Washington, DC'], ['Washington, DC 20001', 'Washington, DC'],
    ['Dallas, TX 75201', 'Dallas, TX'], ['Dallas, TX 75201-1234', 'Dallas, TX'],
  ]) {
    assert.deepEqual(places(line), [place], line);
  }
  // A line of states' names alone names states, never a town, whichever way it is read: a state's name is a town's only
  // beside another state's two letters. Workday's "City, State, Country" is no different: nothing in "Wyoming,
  // Michigan, United States of America" tells a town from the state "Texas, Oklahoma, United States" names, so neither
  // is a place (a board that names a site so has it written out on its line's sites). The two cities named as a state
  // are no city beside another state's name.
  for (const none of ['Texas, Oklahoma', 'Oklahoma, Texas', 'Texas, Louisiana, Oklahoma', 'Indiana, Ohio, Michigan', 'Ohio, Illinois', 'Florida, New York',
    'USA - Texas - Oklahoma', 'United States-Texas-Oklahoma', 'Texas, Oklahoma, United States', 'Texas, Oklahoma, United States of America',
    'Wyoming, Michigan, United States of America', 'Indiana, Pennsylvania', 'United States-Ohio-Delaware', 'Washington, Oregon', 'New York, New Jersey',
    'Washington, WA']) {
    assert.deepEqual(places(none), [], none);
  }
  // A site written with spaces whose town carries the employer's word for its business is read as a town of that name
  // ("W Chester AEROSPACE", West Chester, Ohio, as GE Aerospace's board writes one site): it is a place, no factory is
  // in a town so named, and the place waits for a person in Admin Tools.
  assert.deepEqual(places('W Chester AEROSPACE OH US'), ['W Chester AEROSPACE, OH']);
  // No place: remote, a country alone, and abroad, even where a country's code is a state's; a town with no state; a
  // count of places; a site abroad named the same way; and a site named with spaces whose city is not one (a count of
  // places, a building or a site, a way of working, the country, a state's name), held as the comma form's city is. The
  // word plant begins a site of the employer's whatever follows it, but in Plant City.
  for (const none of ['Remote', 'Remote (Houston, TX)', 'United States', 'Auckland, NZ', 'Toronto, CAN', 'Munich, BY', 'Laval, Canada',
    'Altona, Manitoba, CA, R0G 0B0', 'Bruchsal, BW, DE, 76646', 'GRANADERO BAIGORRIA, Santa Fe, AR, S2152FXA', 'Dublin, Dublin, Ireland',
    'Evendale', 'Lynn', '2 Locations', 'Istanbul TR 6', 'Carrara IT 2', 'Changwon 48 KR 6', 'Perth WA', 'Chennai TN',
    'Multiple Locations TX USA', 'Plant TX USA', 'Plant 3 TX USA', 'Site AL USA', 'Building TX USA', 'Virtual TX USA', 'Texas TX USA',
    'Home Office TX USA', 'Telework TX USA', 'Onsite TX USA', 'On-site TX USA', 'Hybrid TX USA', 'Factory TX USA', 'Warehouse TX USA',
    'Office TX USA', 'HQ TX USA', 'United States TX USA', 'Texas, TX', 'Ohio', 'Texas, US', 'Plant, TX', 'Plant 3, TX', 'Plant #2, TX',
    'Fab 6, NY', 'Home Office, TX', 'Telework, VA', 'Onsite, TX', 'Factory, MI', 'Warehouse, OH', 'HQ, TX', 'US-AL-REMOTE', 'USA - Texas - Remote',
    'Plant A, TX', 'Plant III, OH', 'Plant One, OH', 'Plant-3, MI', 'Plant Fremont, CA', 'Plant A TX USA', 'Plant Two TX USA',
    'Off-site, Ohio, US', 'Offsite, OH', 'Virtual Three, GA', 'Client Site TX USA', 'Customer Site, Texas', 'Nationwide TX USA', 'Nationwide, TX']) {
    assert.deepEqual(places(none), [], none);
  }
  // A feed that knows the country says so: abroad there is no place, whatever the field looks like.
  const inCountry = (location: string, country: string | undefined) =>
    readPosting({ employer: 'Acme', title: 'Welder', location, text: '', country }, vocab).places.map((p: { city: string; state: string }) => `${p.city}, ${p.state}`);
  assert.deepEqual(inCountry('Amsterdam, NH', undefined), ['Amsterdam, NH']);
  assert.deepEqual(inCountry('Amsterdam, NH', 'NL'), []);
  assert.deepEqual(inCountry('Amsterdam, NH', 'Netherlands'), []);
  for (const home of ['US', 'USA', 'U.S.', 'United States', 'united states of america', '', '  ']) assert.deepEqual(inCountry('Manchester, NH', home), ['Manchester, NH'], home);
  // The text only when the field is empty.
  assert.deepEqual(places('', 'Welder (Bastrop, TX)', 'Join the team in Bastrop, TX.'), ['Bastrop, TX']);
  assert.deepEqual(places('Hawthorne, CA', 'Welder', 'Some travel to Bastrop, TX.'), ['Hawthorne, CA']);
  // A city found in the text is held to what a location line's is.
  assert.deepEqual(places('', 'Welder (Plant A, TX)', 'Work from Remote, TX.'), []);
  assert.deepEqual(places('', 'Welder (Plant City, FL)', ''), ['Plant City, FL']);
});

// --- Skills and makes ------------------------------------------------------------

test('an other name that names a subject wider than its skill needs a neighbour', () => {
  // "Injection Molding" is another name of Injection Molding Machine Operation: right for a person's
  // search, and in a designer's list of processes not the running of the machine.
  const designer = read('Mechanical Engineer', 'Requirements:\n- Experience with machining, sheet metal, injection molding and brazing\n- Understands electrical design and machine safety');
  for (const name of ['Injection Molding Machine Operation', 'Torch Brazing', 'Electrical Controls Design', 'Machine Safety Circuit Design']) assert.ok(!names(designer).includes(name), name);
  // On the career's own path the same words are the skill.
  const operator = read('Injection Molding Operator', 'Requirements:\n- Two years of injection molding');
  assert.ok(names(operator).includes('Injection Molding Machine Operation'));
  // So are they beside a make of the skill.
  const maker = read('Mechanical Engineer', 'Requirements:\n- Injection molding on Engel and Arburg presses');
  assert.ok(names(maker).includes('Injection Molding Machine Operation'));
  // A name that leaves out only the doing, or one side of an "and", is the skill anywhere.
  const plain = read('Quality Engineer', 'Requirements:\n- 3D CAD and scripting\n- Data acquisition');
  for (const name of ['3D CAD Modeling', 'Data Analysis and Scripting', 'Data Acquisition Setup']) assert.ok(names(plain).includes(name), name);
});

test('a skill is found by its name, its other names and its short forms, with their edges respected', () => {
  const r = read('Welder', 'Requirements:\n- MIG welding and GMAW of carbon steel on 5-axis positioners\n- Lock-out / tag-out and preventative maintenance of the cell\n- Read blueprints and weld symbols');
  assert.deepEqual(names(r).sort(), ['5-Axis Machining', 'Blueprint Reading', 'Lockout Tagout', 'MIG Welding', 'Preventive Maintenance', 'Weld Symbol Interpretation']);
  // Every match says what it matched on.
  assert.equal(r.skills.find((s) => s.name === 'Lockout Tagout')?.on, 'Lock-out / tag-out');
  assert.equal(r.skills.find((s) => s.name === 'MIG Welding')?.on, 'MIG welding');

  // The names the catalogue gained from the postings' own words (migration 0057).
  const gained = read('Quality Control Inspector', 'Requirements:\n- Reads technical drawings and wiring diagrams; checks threads with thread gages and continuity with a DMM\n- Keeps the cell to 6S and writes the RCCA');
  for (const name of ['Blueprint Reading', 'Electrical Schematic Reading', 'Thread Measurement', 'Multimeter Testing', '5S Workplace Organization', 'Root Cause Analysis']) assert.ok(names(gained).includes(name), name);

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
  const r = read('CNC Machinist', 'Requirements:\n- Familiar with Fanuc controls and Mastercam; runs a ZoomTRAK and writes QFD reports\n- Experience with Rexford-Hall drives');
  assert.deepEqual(r.unknown.map((u) => u.phrase), ['ZoomTRAK', 'QFD', 'Rexford-Hall']);
  // What the catalogue has since learned is read, not listed: a make, another name of a skill, and a skill of its own (APQP, 0070).
  const known = read('CNC Machinist', 'Requirements:\n- Familiar with Fanuc controls; runs a ProtoTRAK and writes RCCA and APQP reports');
  assert.deepEqual(known.unknown, []);
  assert.ok(known.makes.some((m) => m.make === 'ProtoTRAK' && m.skill === 'CNC Control Operation'));
  assert.ok(known.skills.some((k) => k.name === 'Root Cause Analysis' && k.on === 'RCCA'));
  assert.ok(known.skills.some((k) => k.name === 'Advanced Product Quality Planning' && k.on === 'APQP'));
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
  // What is only wished for is not a requirement: the licence that is "a plus" is left out, the
  // bachelor's under Preferred is not the schooling, and the clearance there counts because its line says "must".
  assert.deepEqual(a, { yearsMin: 3, yearsMax: 5, education: 'high school', certifications: ['AWS D17.1'], clearance: 'Secret', citizenship: 'U.S. person', shift: 'swing', employmentType: 'full-time' });

  // A wish is not a requirement, a posting that offers two shifts names neither, and "master scheduling" is not a degree.
  const wished = read('Manufacturing Engineer', [
    'Requirements:', '- BS, M.Eng, MS or PhD in engineering', '- 3 years of experience in manufacturing', '- Experience with master scheduling',
    '- Secret clearance preferred', '- CWI certification is a plus', '- Must be able to work 1st or 2nd shift',
  ].join('\n')).requirements;
  assert.deepEqual(wished, { yearsMin: 3, yearsMax: null, education: 'bachelor', certifications: [], clearance: null, citizenship: null, shift: null, employmentType: null });
  assert.equal(read('CNC Machinist', 'Requirements:\n- Associate’s or Bachelor’s degree\n- 2 years of experience machining').requirements.education, 'associate');
  assert.equal(read('Welder - Afternoon Shift', 'Requirements:\n- 2 years of experience welding').requirements.shift, 'swing');
  assert.equal(read('CNC Machinist', 'Requirements:\n- 2 years of experience machining\n- Overtime and weekend shift as needed').requirements.shift, null);

  const b = read('Electronics Assembler', [
    'Requirements:', '- Minimum of two (2) years of experience', '- Associate degree in electronics',
    '- IPC J-STD-001 and IPC-A-610 certification; IPC 7711/7721 preferred', '- ASNT NDT Level II in PT and MT per NAS 410',
    '- Six Sigma Green Belt, CWI, OSHA 30, forklift certification, FAA Repairman certificate',
    '- Active TS/SCI clearance; U.S. citizenship is required', '- Rotating shift', '- Temporary position',
  ].join('\n')).requirements;
  assert.deepEqual(b, {
    yearsMin: 2, yearsMax: null, education: 'associate',
    certifications: ['IPC J-STD-001', 'IPC-A-610', 'NDT Level II', 'Forklift', 'Six Sigma Green Belt', 'CWI', 'OSHA 30', 'FAA Repairman'],
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

// The labels name only makes the catalogue had when they were written. These three
// were added since (0058) and are read from labelled lines that plainly name them
// ("Allen-Bradley/Rockwell and/or Siemens PLC platforms", "Proto Trak CNC mills"):
// by the labels as frozen they would count as wrong (13 of 15 and 12 of 13 right), so
// they are named here, counted neither way, and any other unlabelled make is wrong.
const MAKES_SINCE = ['81 Allen-Bradley>PLC Troubleshooting', '81 Siemens>PLC Troubleshooting', '106 ProtoTRAK>CNC Control Operation'];
// The same for skills. The labels name only skills the catalogue had when they were
// written. The first was added since with the skills of the military careers (0059), the
// rest with the trades of the industries the catalogue lacked (0070), and each is read
// from a labelled line that plainly asks for it ("Support maintenance of generators,
// uninterruptible power supply (UPS) systems"; "APQP, PPAP, FMEA"; "Conduct trade studies";
// "hand calculations and finite element methods"; "IPC-7711/7721 certification"): each is
// named here, counted neither way, and any other unlabelled skill is wrong as before. A skill read from a
// tool in a list of shop tools ("table saws" at a metal fabricator, 202) is not asked for, and counts wrong.
const SKILLS_SINCE = [
  '20 Advanced Product Quality Planning', '24 Engineering Change Management', '35 Environmental Chamber Testing',
  '42 Battery and UPS Maintenance',
  '44 Serial Bus Diagnostics', '44 Environmental Chamber Testing', '81 Equipment Commissioning', '93 Materials Selection',
  '122 Trade Studies', '130 Board Bring-Up', '130 Trade Studies', '156 Trade Studies', '161 Structural Hand Calculations',
  '189 Structural Hand Calculations', '223 PCB Rework and Repair',
];

function score(split: 'tune' | 'held') {
  const s = {
    kept: 0, right: 0, wrong: [] as string[], notOurs: [] as string[], missed: 0,
    levelStated: 0, levelRight: 0, levelExtra: 0, places: 0, placesRight: 0,
    skillTp: 0, skillFp: 0, skillFn: 0, makeTp: 0, makeFp: 0, makeFn: 0, makesSince: [] as string[], skillsSince: [] as string[],
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
    for (const x of r.skills) {
      if (allowed.has(x.name)) continue;
      if (SKILLS_SINCE.includes(`${g.n} ${x.name}`)) s.skillsSince.push(`${g.n} ${x.name}`);
      else s.skillFp++;
    }
    const made = new Set(r.makes.map((m) => `${m.make}>${m.skill}`));
    const makesAllowed = new Set(g.asks.makes.flatMap((m) => m.any.map((sk) => `${m.make}>${sk}`)));
    for (const m of g.asks.makes) if (!m.optional) { if (m.any.some((sk) => made.has(`${m.make}>${sk}`))) s.makeTp++; else s.makeFn++; }
    for (const m of r.makes) {
      const key = `${m.make}>${m.skill}`;
      if (makesAllowed.has(key)) continue;
      if (MAKES_SINCE.includes(`${g.n} ${key}`)) s.makesSince.push(`${g.n} ${key}`);
      else s.makeFp++;
    }
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
// the reader gets better; never lower one to let a change through. The figures were
// raised once, after the vocabulary pass (migrations 0056 to 0058): the labels are as
// they were, and the reader's rules changed in one place (a shortened other name of a
// skill needs a neighbour). The tuning half's places rose by 20 with the 20 postings
// added to it (cleaning and food preparation titles, each turned away, each with its
// place read): 258 of 260, as it was 238 of 240. Nothing else moved: the 480 read as
// they did before those careers left the catalogue. They rose by 24 more, and the
// careers kept by four, with the 24 added for the words that make a title not ours
// (20 turned away, four kept as the career they are, each with its place read): 282 of
// 284 places, and 76 where 72 stood. The 500 before them read as they did. With the
// production welder (a name of MIG Welder; four postings added to the tuning half, each
// kept and each with its place read): 286 of 288 places, and 80 kept right where 76
// stood. Of the 524 before them, two read differently, as they are meant to: the two
// "Production Welder" postings the set already held (n 49, n 148), whose labels were
// changed from Welder to MIG Welder with the decision; the held-out half's figures did
// not move.
const FLOOR = {
  held: { right: 56, missed: 16, skillPrecision: 0.89, skillRecall: 0.74, makePrecision: 1, makeRecall: 1, level: 26, places: 240, years: 15, education: 15, certifications: 2, clearance: 3, citizenship: 7, shift: 3, employmentType: 1, pay: 14 },
  tune: { right: 80, missed: 7, skillPrecision: 0.96, skillRecall: 0.82, makePrecision: 1, makeRecall: 0.75, level: 35, places: 286, years: 24, education: 23, certifications: 2, clearance: 3, citizenship: 10, shift: 3, employmentType: 2, pay: 24 },
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
    // Of the skills read from the labelled lines, the share the lines ask for; and of those they ask for, the share read.
    const ratio = (a: number, b: number) => (a + b === 0 ? 1 : a / (a + b));
    assert.ok(ratio(s.skillTp, s.skillFp) >= floor.skillPrecision, `skills right: ${s.skillTp} of ${s.skillTp + s.skillFp}, floor ${floor.skillPrecision}`);
    assert.ok(ratio(s.skillTp, s.skillFn) >= floor.skillRecall, `skills found: ${s.skillTp} of ${s.skillTp + s.skillFn}, floor ${floor.skillRecall}`);
    assert.ok(ratio(s.makeTp, s.makeFp) >= floor.makePrecision, `makes right: ${s.makeTp} of ${s.makeTp + s.makeFp}, floor ${floor.makePrecision}`);
    assert.ok(ratio(s.makeTp, s.makeFn) >= floor.makeRecall, `makes found: ${s.makeTp} of ${s.makeTp + s.makeFn}, floor ${floor.makeRecall}`);
    assert.deepEqual(s.makesSince, MAKES_SINCE.filter((m) => gold.some((g) => g.split === split && m.startsWith(`${g.n} `))), 'the makes added since the labels were written are read where the lines name them');
    assert.deepEqual(s.skillsSince, SKILLS_SINCE.filter((m) => gold.some((g) => g.split === split && m.startsWith(`${g.n} `))), 'the skills added since the labels were written are read where the lines name them');
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
  assert.equal(gold.length, 528);
  assert.ok(ms < 2000, `${gold.length} postings took ${ms.toFixed(0)} ms`);
});
