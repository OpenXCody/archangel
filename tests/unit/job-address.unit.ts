import test from 'node:test';
import assert from 'node:assert/strict';
import { addressWord, careerSlug, jobPath, readJobNumber } from '../../shared/jobs.ts';

// A job's address (shared/jobs.ts): /jobs/<company>/<career>/<number>. Only the number is read back.

test('a career is its title in lower case with hyphens', () => {
  assert.equal(careerSlug('CNC Machine Operator'), 'cnc-machine-operator');
  assert.equal(careerSlug('Tool & Die Maker'), 'tool-and-die-maker');
  assert.equal(careerSlug("Welder's Helper (2nd Shift)"), 'welders-helper-2nd-shift');
  assert.equal(careerSlug('  Électricien / Mécanicien  '), 'electricien-mecanicien');
  assert.equal(careerSlug(''), 'career');
  assert.equal(careerSlug(null), 'career');
});

test('a word of an address has no slash, space or capital, and is not endless', () => {
  for (const name of ['A/B Testing?', 'x'.repeat(300), '--Hello--', 'Dow Inc.']) {
    assert.match(addressWord(name), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(addressWord(name).length <= 80);
  }
});

test("a job's address is the company's slug, the career and the number", () => {
  assert.equal(jobPath({ serial: 1140, companySlug: 'caterpillar', companyName: 'Caterpillar Inc.', occupationTitle: 'CNC Machine Operator' }), '/jobs/caterpillar/cnc-machine-operator/1140');
  // A company with no slug is named from its name.
  assert.equal(jobPath({ serial: 7, companySlug: null, companyName: 'Apex Tool & Die', occupationTitle: 'Welder' }), '/jobs/apex-tool-and-die/welder/7');
  // With nothing to name them, the words are placeholders: the number still finds the job.
  assert.equal(jobPath({ serial: 7 }), '/jobs/company/career/7');
  // Without a number, the older address by id.
  assert.equal(jobPath({ id: '21c65173-ebf0-41b6-b3d7-6430affc2745' }), '/jobs/21c65173-ebf0-41b6-b3d7-6430affc2745');
});

test('a job number is a whole number from 1', () => {
  assert.equal(readJobNumber('1140'), 1140);
  for (const bad of ['0', '-1', '1.5', '01', 'abc', '', '12345678901', undefined, 12]) assert.equal(readJobNumber(bad), null);
});
