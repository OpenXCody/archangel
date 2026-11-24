// Admin Tools' pages and the addresses from before them. Each page is one
// thing an admin comes to do; an old `/admin?tab=…` link, in an email, a
// bookmark or the history, must land on the page that does what its tab did.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN_PAGES, adminPath, fromOldAdminAddress } from '../../client/src/lib/adminPages';

const ID = '11111111-2222-4333-8444-555555555555';

test('the pages: seven, each with a name and a line that says what it is for', () => {
  assert.deepEqual(ADMIN_PAGES.map((page) => page.slug), ['add', 'records', 'review', 'people', 'access', 'invites', 'activity']);
  for (const page of ADMIN_PAGES) {
    assert.ok(page.label.length > 0 && page.says.endsWith('.'), page.slug);
    assert.equal(adminPath(page.slug), `/admin/${page.slug}`);
  }
});

test('an address with no tab is the index', () => {
  assert.equal(fromOldAdminAddress(''), null);
  assert.equal(fromOldAdminAddress('?q=tesla'), null);
});

test('each old tab lands on the page that does what it did', () => {
  const cases: [string, string, string][] = [
    ['?tab=people', '', '/admin/people'],
    ['?tab=people&q=ana&role=employer&open=' + ID, '', `/admin/people?q=ana&role=employer&open=${ID}`],
    ['?tab=access', '', '/admin/access'],
    ['?tab=invites', '', '/admin/invites'],
    ['?tab=history', '', '/admin/activity'],
    ['?tab=history&show=company', '', '/admin/activity?show=company'],
    ['?tab=data', '', '/admin/records'],
    [`?tab=data&kind=company&id=${ID}`, '', `/admin/records?kind=company&id=${ID}`],
    [`?tab=data&kind=career&id=${ID}`, '#path', `/admin/records?kind=career&id=${ID}#path`],
    ['?tab=data&pairs=id', '', '/admin/review?pairs=id'],
    ['?tab=data&pairs=spot&state=TX&at=20', '', '/admin/review?pairs=spot&state=TX&at=20'],
    ['?tab=data&postings=places', '', '/admin/review?postings=places'],
    ['?tab=data', '#matches', '/admin/review?list=matches'],
    ['?tab=nothing', '', '/admin'],
  ];
  for (const [search, hash, wanted] of cases) assert.equal(fromOldAdminAddress(search, hash), wanted, `${search}${hash}`);
});
