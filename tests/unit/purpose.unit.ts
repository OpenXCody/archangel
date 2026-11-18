// Who the interface is drawn for (shared/purpose.ts): what an account is for,
// the tools each person is shown, and an admin's "View as". Pure rules; what a
// person may do is the server's business and is checked in tests/api.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPurpose, purposeFrom, readViewAs, storedViewAs, toolsFor, VIEW_AS, type ToolsFor } from '../../shared/purpose.js';

const seeker: ToolsFor = { isAdmin: false, purpose: 'work', companyIds: [] };
const employer: ToolsFor = { isAdmin: false, purpose: 'hire', companyIds: ['acme'] };
const admin: ToolsFor = { isAdmin: true, purpose: 'work', companyIds: ['acme'] };

/** The tools as a line of words, so a whole view can be compared at once. */
function shown(person: ToolsFor | null, viewAs?: (typeof VIEW_AS)[number]): string {
  const tools = toolsFor(person, viewAs);
  return [tools.seeker && 'seeker', tools.employer && 'employer', tools.admin && 'admin', tools.viewingAs && `as ${tools.viewingAs}`]
    .filter(Boolean)
    .join(' ');
}

test('a purpose is work or hire, and nothing else', () => {
  assert.equal(isPurpose('work'), true);
  assert.equal(isPurpose('hire'), true);
  for (const other of ['admin', 'employer', '', null, undefined, 1]) assert.equal(isPurpose(other), false);
});

test('what a person chose stands; until they choose, their ties to a company say', () => {
  assert.equal(purposeFrom(null, false), 'work');
  assert.equal(purposeFrom(null, true), 'hire', 'a membership or a request, with nothing chosen');
  assert.equal(purposeFrom('work', true), 'work', 'a member who chose the seeker tools keeps them');
  assert.equal(purposeFrom('hire', false), 'hire', 'signed up to hire, no company yet');
  assert.equal(purposeFrom('boss', true), 'hire', 'a value that is not a purpose is as good as none');
});

test('each person is shown one set of tools', () => {
  assert.equal(shown(null), '', 'a visitor is shown nobody’s');
  assert.equal(toolsFor(null).signedIn, false);
  assert.equal(shown(seeker), 'seeker');
  assert.equal(shown(employer), 'employer');
  assert.equal(shown(admin), 'seeker admin', 'an admin has the admin tools and those of their own purpose');
  assert.equal(shown({ ...admin, purpose: 'hire' }), 'employer admin');
});

test('view as replaces an admin’s tools with exactly the other person’s', () => {
  assert.equal(shown(admin, 'admin'), 'seeker admin');
  assert.equal(shown(admin, 'user'), 'seeker as user');
  assert.equal(shown(admin, 'employer'), 'employer as employer');
  assert.equal(shown({ ...admin, purpose: 'hire' }, 'user'), 'seeker as user', 'whatever the admin’s own account is for');
});

test('view as is an admin’s alone', () => {
  assert.equal(shown(seeker, 'employer'), 'seeker');
  assert.equal(shown(employer, 'user'), 'employer');
  assert.equal(toolsFor(employer, 'user').viewingAs, null);
});

test('the company’s view of a job follows the view', () => {
  // The server has already said the person can manage the job; this only decides what is drawn.
  assert.equal(toolsFor(employer).manages('acme'), true);
  assert.equal(toolsFor(admin).manages('other'), true, 'an admin manages every company’s jobs');
  assert.equal(toolsFor(admin, 'employer').manages('acme'), true, 'as an employer: the companies they belong to');
  assert.equal(toolsFor(admin, 'employer').manages('other'), false);
  assert.equal(toolsFor(admin, 'user').manages('acme'), false, 'as a user: none');
  assert.equal(toolsFor(null).manages('acme'), false);
});

test('a stored view belongs to the admin who chose it', () => {
  assert.equal(storedViewAs('u1', 'admin'), null, 'the admin’s own view is not stored');
  assert.equal(readViewAs(storedViewAs('u1', 'employer'), 'u1'), 'employer');
  assert.equal(readViewAs(storedViewAs('u1', 'user'), 'u1'), 'user');
  assert.equal(readViewAs(storedViewAs('u1', 'user'), 'u2'), 'admin', 'another account in the same browser');
  for (const junk of [null, undefined, '', 'user', 'u1:admin', 'u1:owner', ':user']) assert.equal(readViewAs(junk, 'u1'), 'admin');
});
