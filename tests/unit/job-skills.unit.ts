import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jobSkillParts, OWN_COUNTED_FROM } from '../../client/src/lib/jobSkills.ts';

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

test("the job's page draws its career's skills as the career page's tree, says which its posting names, and asks nobody to sign in", () => {
  const page = readFileSync(new URL('../../client/src/components/jobs/JobSkills.tsx', import.meta.url), 'utf8');
  // The whole path and what the posting names beyond it, the posting's own skills saying so under their names.
  assert.match(page, /path\.skills\.concat\(path\.alsoNamed\)\.map\(\(skill\) => \(\{ \.\.\.skill, [^}]*note: named\.has\(skill\.id\) \? IN_POSTING : null \}\)\)/);
  assert.match(page, /<SkillGroups skills=\{all\}/);
  assert.match(page, /const IN_POSTING = 'In this posting';/);
  assert.doesNotMatch(page.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /sign[- ]in|Sign in/);
});
