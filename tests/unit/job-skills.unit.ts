import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { careerRangeLine, jobSkillParts, OWN_COUNTED_FROM } from '../../client/src/lib/jobSkills.ts';

// What a job's page lists as the job's skills. A career is a template with a wide range of skills and a job has its
// own combination: a job from a company's careers site lists the skills its posting names, and keeps the rest of its
// career's path behind one closed line. The page never says the career's whole path is what the job takes.

const on = (name: string, named = false) => ({ name, named });
const names = (skills: { name: string }[]) => skills.map((skill) => skill.name);

// A John Deere production welder, as the copy of production has one: of the MIG Welder's path the posting names one
// skill, and beside the path two more.
const DUBUQUE = {
  skills: [on('Shop Safety Practices'), on('Blueprint Reading'), on('Weld Joint Fit-Up'), on('MIG Welding', true), on('Flux-Cored Welding'), on('Visual Weld Inspection')],
  alsoNamed: [on('Forklift Operation', true), on('Robotic Arc Welding', true)],
};

test("a job's own skills are what its posting names: of the path in the route's order, then beside it", () => {
  const { own, rest, counted } = jobSkillParts(DUBUQUE);
  assert.deepEqual(names(own), ['MIG Welding', 'Forklift Operation', 'Robotic Arc Welding']);
  // The rest of the career's range is everything of the path the posting does not name, in the path's order.
  assert.deepEqual(names(rest), ['Shop Safety Practices', 'Blueprint Reading', 'Weld Joint Fit-Up', 'Flux-Cored Welding', 'Visual Weld Inspection']);
  assert.equal(counted, true);
  // Every skill of the answer is in one of the two, once.
  assert.equal(own.length + rest.length, DUBUQUE.skills.length + DUBUQUE.alsoNamed.length);
  // A posting that names four processes has four of its own: the path's order is kept among them.
  const four = jobSkillParts({ skills: [on('Blueprint Reading', true), on('Shop Math'), on('MIG Welding', true), on('Stick Welding', true), on('TIG Welding', true), on('Pipe Welding')], alsoNamed: [] });
  assert.deepEqual(names(four.own), ['Blueprint Reading', 'MIG Welding', 'Stick Welding', 'TIG Welding']);
  assert.deepEqual(names(four.rest), ['Shop Math', 'Pipe Welding']);
});

test('a seeker is told how many of the job\'s own skills they hold only when there are two or more', () => {
  assert.equal(OWN_COUNTED_FROM, 2);
  // One skill named (the Harvester Works posting names a forklift and nothing else): nothing to count.
  const one = jobSkillParts({ skills: [on('Blueprint Reading'), on('MIG Welding')], alsoNamed: [on('Forklift Operation', true)] });
  assert.deepEqual(names(one.own), ['Forklift Operation']);
  assert.equal(one.counted, false);
  // None named: the section is its heading and the career's range alone.
  const none = jobSkillParts({ skills: [on('Blueprint Reading'), on('MIG Welding')], alsoNamed: [] });
  assert.deepEqual(none.own, []);
  assert.equal(none.rest.length, 2);
  assert.equal(none.counted, false);
  assert.equal(jobSkillParts({ skills: [on('Blueprint Reading', true), on('MIG Welding', true)], alsoNamed: [] }).counted, true);
});

test("the rest of the range stands behind one line: the career's name and how many more skills its path holds", () => {
  const job = { occupationId: 'o1', occupationTitle: 'Welder', companyId: 'c1', companyName: 'Deere & Company Inc.', companySlug: 'john-deere' };
  assert.deepEqual(careerRangeLine(job, 'career', 19, true), { name: 'Welder career', count: '19 more', said: '19 more skills', to: '/occupations/o1' });
  // The posting names nothing: the line says how many skills the career's path holds.
  assert.deepEqual(careerRangeLine(job, 'career', 20, false), { name: 'Welder career', count: '20 skills', said: '20 skills', to: '/occupations/o1' });
  assert.equal(careerRangeLine(job, 'career', 1, false).count, '1 skill');
  assert.equal(careerRangeLine(job, 'career', 1, true).said, '1 more skill');
  // A company's version of the career: its title as a version's is written, and the way to that version.
  const version = careerRangeLine(job, 'version', 12, true);
  assert.equal(version.name, 'Deere & Company Welder');
  assert.equal(version.count, '12 more');
  assert.equal(version.to, '/occupations/o1?at=john-deere');
  assert.equal(careerRangeLine({ ...job, companySlug: null }, 'version', 12, true).to, '/occupations/o1?at=c1');
});

test("the job's page draws its skills by that rule, and no longer says the career's path is what the job takes", () => {
  const page = readFileSync(new URL('../../client/src/components/jobs/JobSkills.tsx', import.meta.url), 'utf8');
  assert.match(page, /jobSkillParts\(path\)/);
  assert.match(page, /careerRangeLine\(job, of, skills\.length, some\)/);
  // The range arrives closed, behind a button that says whether it is open.
  assert.match(page, /useState\(false\)/);
  assert.match(page, /aria-expanded=\{open\}/);
  // Said on screen: neither the old sentence nor a word on each row that the posting names it.
  const said = page.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const gone of ['What the career takes', 'The posting names', 'Named in the posting', 'Also named in the posting']) assert.ok(!said.includes(gone), gone);
});

test("nothing above a job's skills asks anyone to sign in: a visitor reads the skills, and the page's one action is Apply", () => {
  const page = readFileSync(new URL('../../client/src/components/jobs/JobSkills.tsx', import.meta.url), 'utf8');
  const drawn = page.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const gone of ['Sign in', 'sign in', 'signInPath', 'canSignIn', 'OverlapSignIn', 'data-job-overlap-sign-in', 'to see how many of these skills you hold']) assert.ok(!drawn.includes(gone), gone);
  // A seeker's line stays, above the job's own skills and above the skills a company chose.
  assert.equal((drawn.match(/<Overlap share=/g) ?? []).length, 2);
  assert.match(drawn, /\{counted && marks && <Overlap share=\{shareOf\(own, marks\)\} \/>\}/);
});
