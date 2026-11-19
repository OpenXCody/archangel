// Unit checks for the industry level: the list of 21, the curated sentences,
// and the adapter that reads the official statistics. `npm run test:unit`.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { INDUSTRIES, industryByName, industryBySlug, industryLabel, industryPath, leadingIndustry, shownIndustry } from '../../shared/industry.js';
// @ts-expect-error a plain script, no types
import { parseQcew, isComplete, STATE_FIPS } from '../../scripts/ingest/qcew.mjs';
// @ts-expect-error a plain script, no types
import { MIGRATIONS } from '../../scripts/migrate.mjs';
import { US_STATES } from '../../shared/states.js';

const json = async (file: string) => JSON.parse(await readFile(new URL(`../../${file}`, import.meta.url), 'utf8'));

test('the 21 industries each have a code, a page address and a short name', () => {
  assert.equal(INDUSTRIES.length, 21);
  assert.equal(new Set(INDUSTRIES.map((i) => i.code)).size, 21);
  assert.equal(new Set(INDUSTRIES.map((i) => i.slug)).size, 21);
  for (const industry of INDUSTRIES) {
    assert.match(industry.code, /^3[1-3]\d$/);
    assert.match(industry.slug, /^[a-z]+(-[a-z]+)*$/, `${industry.slug} reads as an address`);
    assert.notEqual(industryLabel(industry.name), industry.name, `${industry.name} has a short name`);
    assert.equal(industryBySlug(industry.slug)?.name, industry.name);
    assert.equal(industryByName(industry.name)?.slug, industry.slug);
  }
  assert.equal(industryBySlug('nope'), undefined);
  assert.equal(industryByName('Manufacturing'), undefined);
});

test('an industry link is narrowed to a place, and absent for a name that is not one of the 21', () => {
  assert.equal(industryPath('Chemical Manufacturing'), '/industries/chemicals');
  assert.equal(industryPath('Chemical Manufacturing', { state: 'TX' }), '/industries/chemicals?state=TX');
  assert.equal(industryPath('Chemical Manufacturing', { area: 'austin' }), '/industries/chemicals?area=austin');
  assert.equal(industryPath('Chemical Manufacturing', { state: null }), '/industries/chemicals');
  assert.equal(industryPath('Unclassified', { state: 'TX' }), null);
  assert.equal(industryPath(null), null);
});

test('an industry is printed only when it is one of the 21', () => {
  assert.equal(shownIndustry('Food Manufacturing'), 'Food');
  assert.equal(shownIndustry(' food manufacturing '), 'Food');
  for (const none of ['Manufacturing', 'manufacturing', 'Automotive & Energy', '', '  ', null, undefined]) {
    assert.equal(shownIndustry(none), null, `${String(none)} is not an industry`);
  }
});

test("a company's industry is the one most of its plants are in", () => {
  const food = 'Food Manufacturing';
  const chemicals = 'Chemical Manufacturing';
  assert.equal(leadingIndustry([food, chemicals, food]), food);
  assert.equal(leadingIndustry([chemicals, food, food, null, 'Robots']), food);
  // A plant with no industry, or one that is not of the 21, does not count.
  assert.equal(leadingIndustry([null, undefined, '', 'Manufacturing', 'Robots', 'Robots', chemicals]), chemicals);
  // A tie goes to the name that sorts first, whichever came first.
  assert.equal(leadingIndustry([food, chemicals]), chemicals);
  assert.equal(leadingIndustry([chemicals, food]), chemicals);
  assert.equal(leadingIndustry([]), null);
  assert.equal(leadingIndustry([null, 'Semiconductors']), null);
});

test('every industry has its sentence, under the name a plant carries', async () => {
  const { industries } = (await json('data/industries/industries.json')) as { industries: { code: string; name: string; summary: string }[] };
  assert.deepEqual(
    industries.map((i) => [i.code, i.name]),
    INDUSTRIES.map((i) => [i.code, i.name])
  );
  for (const industry of industries) {
    assert.ok(industry.summary.length > 30 && industry.summary.endsWith('.'), `${industry.name}: one sentence`);
    assert.ok(!/[!]|click|please/i.test(industry.summary));
  }
});

const HEADER =
  '"area_fips","own_code","industry_code","agglvl_code","size_code","year","qtr","disclosure_code","annual_avg_estabs","annual_avg_emplvl","total_annual_wages","taxable_annual_wages","annual_contributions","annual_avg_wkly_wage","avg_annual_pay"';

test('the statistics adapter keeps private-sector state and national rows, and a withheld figure is null', () => {
  const csv = [
    HEADER,
    '"US000","5","325","15","0","2025","A","",25801,892426,110093204448,0,0,2372,123364',
    '"US000","3","325","15","0","2025","A","",4,60,4344469,0,0,1385,72008', // local government: not kept
    '"48000","5","325","55","0","2025","A","",2326,90310,12656105473,0,0,2695,140141',
    '"48000","3","325","55","0","2025","A","N",1,0,0,0,0,0,0',
    '"78000","5","325","55","0","2025","A","N",2,0,0,0,0,0,0', // the Virgin Islands: not a state the app knows
    '"56000","5","325","55","0","2025","A","N",33,0,0,0,0,0,0', // Wyoming, withheld
    '"48453","5","325","75","0","2025","A","",40,1200,1,0,0,1,90000', // a county: not kept
    '"C1242","5","325","45","0","2025","A","",138,5000,1,0,0,1,90000', // a metro area: not kept
    '"48000","5","3251","56","0","2025","A","",300,20000,1,0,0,1,150000', // a finer industry: not kept
    '',
  ].join('\n');
  assert.deepEqual(parseQcew(csv, '325'), [
    { state: 'US', code: '325', establishments: 25801, employment: 892426, avgAnnualPay: 123364 },
    { state: 'TX', code: '325', establishments: 2326, employment: 90310, avgAnnualPay: 140141 },
    { state: 'WY', code: '325', establishments: 33, employment: null, avgAnnualPay: null },
  ]);
  assert.throws(() => parseQcew('"area_fips","own_code"\n"US000","5"', '325'), /column/);
  assert.deepEqual(parseQcew('', '325'), []);
});

test('a year is complete only with the nation published and the states present', () => {
  const state = (code: string) => ({ state: code, code: '31-33', establishments: 1, employment: 1, avgAnnualPay: 1 });
  const states = Object.values(STATE_FIPS as Record<string, string>).map(state);
  assert.equal(isComplete([state('US'), ...states]), true);
  assert.equal(isComplete(states), false, 'no national row');
  assert.equal(isComplete([{ ...state('US'), employment: null }, ...states]), false, 'the nation withheld');
  assert.equal(isComplete([state('US'), ...states.slice(0, 20)]), false, 'most states missing');
});

test('the adapter knows every state the app does', () => {
  assert.deepEqual(Object.values(STATE_FIPS as Record<string, string>).sort(), US_STATES.map((s) => s.code as string).sort());
});

test('the stored statistics name their source and never state a withheld figure as zero', async () => {
  const file = (await json('data/industries/qcew-2025.json')) as {
    source: { name: string; url: string; year: number; retrieved: string };
    rows: { state: string; code: string; establishments: number | null; employment: number | null; avgAnnualPay: number | null }[];
  };
  assert.equal(file.source.year, 2025);
  assert.match(file.source.url, /^https:\/\/www\.bls\.gov\//);
  assert.match(file.source.retrieved, /^\d{4}-\d{2}-\d{2}$/);
  const codes = new Set(['31-33', ...INDUSTRIES.map((i) => i.code as string)]);
  for (const row of file.rows) {
    assert.ok(codes.has(row.code), `${row.code} is an industry the app has`);
    assert.notEqual(row.employment, 0, `${row.state} ${row.code}: no employment is null, not 0`);
    assert.notEqual(row.avgAnnualPay, 0);
  }
  for (const code of codes) assert.ok(file.rows.some((row) => row.state === 'US' && row.code === code && row.employment !== null), `the nation has ${code}`);
  assert.ok(file.rows.some((row) => row.employment === null), 'withheld figures are kept as rows');
});

test('the industry tables are created before they are filled', () => {
  const schema = (MIGRATIONS as string[]).indexOf('0035_industries.sql');
  const rows = (MIGRATIONS as string[]).indexOf('0036_industry_stats.sql');
  assert.ok(schema !== -1 && rows === schema + 1);
});
