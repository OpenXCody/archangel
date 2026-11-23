// The one search vocabulary's order (client/src/components/search/results.ts), for a military career the query
// named: it is listed with the careers, and leads the results only when the query can be nothing else.
// `npm run test:unit`. No browser, no database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupRows, recordRows } from '../../client/src/components/search/results';
import type { SearchResults, SearchResultItem } from '../../client/src/lib/api';

const none = { count: 0, items: [] as SearchResultItem[] };
const answer = (found: Partial<SearchResults['results']>): SearchResults => ({
  query: '',
  results: { companies: none, factories: none, occupations: none, skills: none, states: none, ...found },
  totalCount: 0,
});
const company = (name: string, extra: Partial<SearchResultItem> = {}): SearchResultItem => ({ id: name, name, type: 'companies', ...extra });
const career = (name: string, extra: Partial<SearchResultItem> = {}): SearchResultItem => ({ id: name, name, type: 'occupations', ...extra });
/** The rows as the header draws them: "Group: first row | second row". */
const drawn = (query: string, found: Partial<SearchResults['results']>) =>
  groupRows(recordRows(answer(found), query)).map((group) => `${group.id}: ${group.rows.map((row) => row.title).join(' | ')}`);

test('letters that name a rating and begin companies\' names: the companies lead, the rating is listed with the careers', () => {
  const found = {
    companies: { count: 2, items: [company('Ao Smith'), company('Aoc')] },
    occupations: { count: 2, items: [career('Navy Aviation Ordnanceman', { subtitle: 'Navy rating · AO', named: true }), career('SMT Line Operator')] },
  };
  assert.deepEqual(drawn('ao', found), ['companies: Ao Smith | Aoc', 'occupations: Navy Aviation Ordnanceman | SMT Line Operator']);
  // What Enter takes is the first row: a company, never the rating.
  assert.equal(groupRows(recordRows(answer(found), 'ao'))[0].rows[0].kind, 'company');
});

test('a named career stays first among the careers, whatever else was found there', () => {
  const found = {
    occupations: { count: 3, items: [career('Navy Hull Maintenance Technician', { named: true }), career('HT Furnace Operator'), career('Millwright')] },
  };
  assert.deepEqual(drawn('ht', found), ['occupations: Navy Hull Maintenance Technician | HT Furnace Operator | Millwright']);
});

test('a career the query can be nothing but leads, as a name typed whole does', () => {
  const found = {
    companies: { count: 1, items: [company('15T Tooling')] },
    occupations: { count: 1, items: [career('Army UH-60 Helicopter Repairer/Aircrew Member', { named: true, leads: true })] },
  };
  assert.deepEqual(drawn('15t', found), ['occupations: Army UH-60 Helicopter Repairer/Aircrew Member', 'companies: 15T Tooling']);
});

test('a service\'s word with a word of a title does not lead a plant of that name', () => {
  const found = {
    factories: { count: 1, items: [{ id: 'p', name: 'Lake City Army Ammunition Plant', type: 'factories' as const }] },
    occupations: { count: 1, items: [career('Army Ammunition Specialist', { named: true })] },
  };
  assert.deepEqual(drawn('army ammunition', found), ['factories: Lake City Army Ammunition Plant', 'occupations: Army Ammunition Specialist']);
});

test('a service the query names leads: its page is what was asked for', () => {
  const found = {
    companies: { count: 2, items: [company('U.S. Navy', { subtitle: 'Military service', service: true }), company('Navy Pier Metals')] },
    factories: { count: 1, items: [{ id: 'p', name: 'Navy Yard Plant', type: 'factories' as const }] },
  };
  assert.deepEqual(drawn('navy', found), ['companies: U.S. Navy | Navy Pier Metals', 'factories: Navy Yard Plant']);
});
