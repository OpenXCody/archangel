// A company's version of a career: how its names read (shared/versions.ts),
// the editor's draft (client/src/lib/versionDraft.ts), the Atlas's address with
// a version laid over it, and the promise that nothing ever says what a real
// company runs: the migration writes no row and the local sample names only
// its own made-up companies.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { companyShortName, versionPath, versionTitle } from '../../shared/versions';
import { atlasHref, readAtlasState } from '../../client/src/components/atlas/state';
import { addSkill, changesOf, draftFromVersion, isOn, mergeSaved, sameChanges, toggleMake, toggleSkill } from '../../client/src/lib/versionDraft';
import { versionDifference, versionLine, type Version, type VersionSkill, type VersionSummary } from '../../client/src/lib/versions';
import { FICTIONAL_COMPANIES, REAL_COMPANIES } from '../../server/scripts/seed-data/companies';
import { SAMPLE_VERSIONS } from '../../server/scripts/seed-data/companyCareers';
import { MIGRATIONS } from '../../scripts/migrate.mjs';

const MIGRATION = '0053_company_careers.sql';

test('a version is titled with the company as it is said, then the career', () => {
  assert.equal(versionTitle('Boeing', 'CNC Operator'), 'Boeing CNC Operator');
  assert.equal(versionTitle('Apex Manufacturing Corp', 'Welder'), 'Apex Manufacturing Welder');
  assert.equal(versionTitle('Dow Inc.', 'Process Operator'), 'Dow Process Operator');
  assert.equal(versionTitle('Acme Tools, LLC', 'Machinist'), 'Acme Tools Machinist');
  // A word that is part of the name is not a legal form to drop.
  assert.equal(companyShortName('Ford Motor Company'), 'Ford Motor Company');
  assert.equal(companyShortName('First Co.'), 'First');
  // A name that would be nothing without it is left whole.
  assert.equal(companyShortName('Co.'), 'Co.');
});

test("a version's address is the career's page, at the company", () => {
  assert.equal(versionPath('career-id', { id: 'company-id', slug: 'boeing' }), '/occupations/career-id?at=boeing');
  assert.equal(versionPath('career-id', { id: 'company-id', slug: null }), '/occupations/career-id?at=company-id');
  assert.equal(versionPath('career-id', { id: 'company-id' }), '/occupations/career-id?at=company-id');
});

test('the migration is in the runner, creates three tables and writes no row', () => {
  assert.ok((MIGRATIONS as string[]).includes(MIGRATION));
  assert.ok((MIGRATIONS as string[]).indexOf(MIGRATION) > (MIGRATIONS as string[]).indexOf('0050_skill_makes.sql'));
  const sql = readFileSync(`migrations/${MIGRATION}`, 'utf8').replace(/^--.*$/gm, '');
  for (const table of ['company_careers', 'company_career_skills', 'company_career_makes']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
    assert.match(readFileSync('server/db/schema.ts', 'utf8'), new RegExp(`'${table}'`));
  }
  // Additive and safe to repeat, and it says nothing of any company: every statement creates, if it is not there.
  for (const statement of sql.split(';').map((each) => each.trim()).filter(Boolean)) {
    assert.match(statement, /^CREATE (TABLE|INDEX) IF NOT EXISTS /, statement.slice(0, 60));
  }
});

test('no migration, and nothing under data/, ever writes a version of a career', () => {
  for (const name of readdirSync('migrations')) {
    if (name === MIGRATION) continue;
    assert.doesNotMatch(readFileSync(`migrations/${name}`, 'utf8'), /company_career/, `${name} names a version's tables`);
  }
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
  for (const file of walk('data').filter((name) => /\.(json|sql|md)$/.test(name))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /company_career/, `${file} names a version's tables`);
  }
  for (const builder of readdirSync('scripts').filter((name) => /^build-.*\.mjs$/.test(name))) {
    assert.doesNotMatch(readFileSync(`scripts/${builder}`, 'utf8'), /company_career/, `${builder} writes versions`);
  }
});

test("the local sample's versions are for its made-up companies only", () => {
  const madeUp = new Set(FICTIONAL_COMPANIES.map((company) => company.name));
  const real = new Set(REAL_COMPANIES.map((company) => company.name));
  assert.ok(SAMPLE_VERSIONS.length > 0);
  for (const version of SAMPLE_VERSIONS) {
    assert.ok(madeUp.has(version.company), `${version.company} is not one of the sample's made-up companies`);
    assert.ok(!real.has(version.company));
    // A skill is left out or added, never both, and a make is said only for a skill that is on the path.
    assert.equal(version.leavesOut.filter((skill) => version.adds.includes(skill)).length, 0);
    for (const skill of Object.keys(version.runs)) assert.ok(!version.leavesOut.includes(skill), `${version.company} · ${version.career}: ${skill} is left out and has makes`);
  }
  // One company and career once.
  assert.equal(new Set(SAMPLE_VERSIONS.map((version) => `${version.company}|${version.career}`)).size, SAMPLE_VERSIONS.length);
  // And the script that loads them refuses a company that is not made up, and a database that is not local.
  const script = readFileSync('server/scripts/seed-versions.ts', 'utf8');
  assert.match(script, /refuseUnlessLocal\(\)/);
  assert.match(script, /madeUp\.has\(sample\.company\)/);
});

// --- The editor's draft ----------------------------------------------------------

const place = { level: 2 as const, group: { slug: 'cnc-setup', name: 'CNC setup' }, domain: { slug: 'machining', name: 'Machining' } };
const skill = (id: string, order: number, extra: Partial<VersionSkill> = {}): VersionSkill => ({ id, name: `Skill ${id}`, ...place, added: false, makes: [], order, ...extra });
const version = (): Version => ({
  company: { id: 'co', name: 'Apex Manufacturing Corp', slug: null, domain: null },
  occupation: { id: 'occ', title: 'CNC Machinist', description: null },
  title: 'Apex Manufacturing CNC Machinist',
  origin: 'member',
  updatedAt: '2026-11-19T00:00:00.000Z',
  skills: [
    skill('a', 0),
    skill('b', 2, { makes: [{ id: 'b1', name: 'Haas', runs: true }, { id: 'b2', name: 'Okuma', runs: false }] }),
    skill('x', 3, { added: true, makes: [{ id: 'x1', name: 'Hermle', runs: true }] }),
  ],
  leftOut: [skill('c', 1, { makes: [{ id: 'c1', name: 'Mazak', runs: false }] })],
});

test('a draft opens as the version stands, every skill in path order', () => {
  const draft = draftFromVersion(version());
  assert.deepEqual(draft.skills.map((each) => each.id), ['a', 'c', 'b', 'x']);
  assert.deepEqual(draft.skills.map((each) => each.standard), [true, true, true, false]);
  assert.deepEqual(draft.out, ['c']);
  assert.deepEqual(draft.added, ['x']);
  assert.deepEqual(draft.runs, ['b1', 'x1']);
  assert.deepEqual(draft.skills.map((each) => isOn(draft, each)), [true, false, true, true]);
  // Opened and untouched, it would save what is stored.
  assert.deepEqual(changesOf(draft), { added: ['x'], leftOut: ['c'], makes: ['b1', 'x1'] });
});

test('one tap leaves a standard skill out or puts it back; an added one comes off and on', () => {
  let draft = draftFromVersion(version());
  draft = toggleSkill(draft, 'a');
  assert.deepEqual(draft.out, ['c', 'a']);
  draft = toggleSkill(draft, 'c');
  assert.deepEqual(draft.out, ['a']);
  draft = toggleSkill(draft, 'x');
  assert.deepEqual(draft.added, []);
  // Taken off, it is still shown, so one more tap brings it back.
  assert.ok(draft.skills.some((each) => each.id === 'x'));
  assert.equal(isOn(draft, draft.skills[3]), false);
  draft = toggleSkill(draft, 'x');
  assert.deepEqual(draft.added, ['x']);
  assert.equal(toggleSkill(draft, 'nobody'), draft);
});

test('makes are sent only for skills on the path, and come back with a skill that is put back', () => {
  let draft = draftFromVersion(version());
  draft = toggleMake(draft, 'b2');
  assert.deepEqual(changesOf(draft).makes, ['b1', 'x1', 'b2']);
  draft = toggleSkill(draft, 'b');
  assert.deepEqual(changesOf(draft).makes, ['x1']);
  assert.deepEqual(changesOf(draft).leftOut, ['c', 'b']);
  draft = toggleSkill(draft, 'b');
  assert.deepEqual(changesOf(draft).makes, ['b1', 'x1', 'b2']);
  draft = toggleMake(draft, 'b1');
  assert.deepEqual(changesOf(draft).makes, ['x1', 'b2']);
});

test('a skill chosen from the search is added, put back or left alone', () => {
  const draft = draftFromVersion(version());
  // New to the path: an addition, placed by its own level and group.
  const added = addSkill(draft, { id: 'n', name: 'New Skill', level: 3, group: place.group, domain: place.domain });
  assert.deepEqual(added.added, ['x', 'n']);
  assert.deepEqual(added.skills.at(-1), { id: 'n', name: 'New Skill', level: 3, group: place.group, domain: place.domain, standard: false, makes: [], order: null });
  assert.deepEqual(changesOf(added).added, ['x', 'n']);
  // One the standard has, left out: put back, never added.
  const back = addSkill(draft, { id: 'c', name: 'Skill c' });
  assert.deepEqual(back.out, []);
  assert.deepEqual(back.added, ['x']);
  // One already on the path: nothing changes.
  assert.equal(addSkill(draft, { id: 'a', name: 'Skill a' }), draft);
});

test("a save's answer brings what each skill is; the person's choices stay", () => {
  let draft = draftFromVersion(version());
  draft = addSkill(draft, { id: 'n', name: 'New Skill', ...place });
  // Tapped while the save was on its way.
  draft = toggleSkill(draft, 'a');
  draft = toggleSkill(draft, 'x');
  const saved: Version = {
    ...version(),
    skills: [
      skill('a', 0),
      skill('b', 2, { makes: [{ id: 'b1', name: 'Haas', runs: true }, { id: 'b2', name: 'Okuma', runs: false }] }),
      skill('n', 3, { added: true, makes: [{ id: 'n1', name: 'Fanuc', runs: false }] }),
      skill('x', 4, { added: true, makes: [{ id: 'x1', name: 'Hermle', runs: true }] }),
    ],
  };
  const merged = mergeSaved(draft, saved);
  assert.deepEqual(merged.skills.map((each) => each.id), ['a', 'c', 'b', 'n', 'x']);
  // The new skill has its makes and its place now.
  assert.deepEqual(merged.skills[3].makes, [{ id: 'n1', name: 'Fanuc' }]);
  assert.equal(merged.skills[3].order, 3);
  // What was tapped meanwhile is still so.
  assert.deepEqual(merged.out, ['c', 'a']);
  assert.deepEqual(merged.added, ['n']);
  assert.equal(sameChanges(changesOf(merged), { added: ['n'], leftOut: ['a', 'c'], makes: ['b1'] }), true);
});

test('a skill that changed sides under the editor carries no choice across', () => {
  const draft = toggleSkill(draftFromVersion(version()), 'a');
  // The standard dropped `a` (it was left out here) and took up `x` (it was added here).
  const before = version();
  const saved: Version = { ...before, skills: [{ ...before.skills[1], order: 0 }, { ...before.skills[2], added: false, order: 1 }], leftOut: [{ ...before.leftOut[0], order: 2 }] };
  const merged = mergeSaved(draft, saved);
  assert.deepEqual(merged.skills.map((each) => each.id), ['b', 'x', 'c']);
  assert.deepEqual(changesOf(merged), { added: [], leftOut: ['c'], makes: ['b1', 'x1'] });
  assert.equal(merged.skills.find((each) => each.id === 'x')?.standard, true);
});

test('two saves that say the same thing are the same, whatever the order', () => {
  assert.equal(sameChanges({ added: ['a', 'b'], leftOut: [], makes: ['m'] }, { added: ['b', 'a'], leftOut: [], makes: ['m'] }), true);
  assert.equal(sameChanges({ added: ['a'], leftOut: [], makes: [] }, { added: [], leftOut: ['a'], makes: [] }), false);
});

// --- The lines a list says -------------------------------------------------------

test("a version's line names the makes it runs, or else how it differs", () => {
  const summary = (extra: Partial<VersionSummary>): VersionSummary => ({
    company: { id: 'co', name: 'Apex Manufacturing Corp', slug: null, domain: null },
    occupation: { id: 'occ', title: 'CNC Machinist' },
    title: 'Apex Manufacturing CNC Machinist',
    added: 0,
    leftOut: 0,
    makes: [],
    ...extra,
  });
  assert.equal(versionLine(summary({})), null);
  assert.equal(versionLine(summary({ added: 2, leftOut: 1 })), '2 skills added · 1 left out');
  assert.equal(versionLine(summary({ added: 1 })), '1 skill added');
  assert.equal(versionLine(summary({ leftOut: 3 })), '3 left out');
  assert.equal(versionLine(summary({ added: 2, makes: ['Haas', 'Okuma'] })), 'Haas, Okuma');
  // One more than the cut is shown rather than hidden behind "1 more".
  assert.equal(versionLine(summary({ makes: ['A', 'B', 'C', 'D', 'E'] })), 'A, B, C, D, E');
  assert.equal(versionLine(summary({ makes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] })), 'A, B, C, D and 3 more');
  assert.equal(versionDifference({ added: 0, leftOut: 0 }), '');
});

// --- The Atlas's address -----------------------------------------------------------

test('the Atlas keeps a version in its address, with the career it is of', () => {
  assert.equal(atlasHref({ career: 'c1', at: 'boeing' }), '/atlas?career=c1&at=boeing');
  // Beside whatever is open: Fundamentals, a field, a group, a skill, a core group inside a field.
  assert.equal(atlasHref({ fundamentals: true, career: 'c1', at: 'boeing' }), '/atlas?fundamentals=1&career=c1&at=boeing');
  assert.equal(atlasHref({ field: 'welding', career: 'c1', at: 'boeing' }), '/atlas?field=welding&career=c1&at=boeing');
  assert.equal(atlasHref({ group: 'arc-welding', career: 'c1', at: 'boeing' }), '/atlas?group=arc-welding&career=c1&at=boeing');
  assert.equal(atlasHref({ skill: 'abc', career: 'c1', at: 'boeing' }), '/atlas?skill=abc&career=c1&at=boeing');
  assert.equal(atlasHref({ group: 'workplace-safety', field: 'welding', career: 'c1', at: 'boeing' }), '/atlas?group=workplace-safety&field=welding&career=c1&at=boeing');
  // A company is named by its id or its slug, written so that either reads back.
  assert.equal(atlasHref({ career: 'c1', at: 'apex-manufacturing' }), '/atlas?career=c1&at=apex-manufacturing');
  assert.equal(readAtlasState(new URLSearchParams(atlasHref({ career: 'c1', at: 'a b&c' }).split('?')[1])).at, 'a b&c');
  // A military career can lie under a version as under the career itself.
  assert.equal(atlasHref({ career: 'c1', at: 'boeing', from: 'm1' }), '/atlas?career=c1&at=boeing&from=m1');
  assert.deepEqual(
    (({ career, at, from }) => ({ career, at, from }))(readAtlasState(new URLSearchParams('field=welding&career=c1&at=boeing&from=m1'))),
    { career: 'c1', at: 'boeing', from: 'm1' }
  );
  // Without a career there is nothing for a company to have a version of.
  assert.equal(atlasHref({ at: 'boeing' }), '/atlas');
  assert.equal(atlasHref({ field: 'welding', at: 'boeing' }), '/atlas?field=welding');
  assert.equal(readAtlasState(new URLSearchParams('at=boeing')).at, null);
  assert.equal(readAtlasState(new URLSearchParams('field=welding&at=boeing')).at, null);
  assert.equal(readAtlasState(new URLSearchParams('career=c1&at=boeing')).at, 'boeing');
  // An older Atlas compared a version with a second career: that word is no longer read, and the version stays.
  assert.equal(atlasHref(readAtlasState(new URLSearchParams('career=c1&at=boeing&with=c1'))), '/atlas?career=c1&at=boeing');
});
