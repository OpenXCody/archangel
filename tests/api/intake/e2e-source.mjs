// A made-up source for tests/api/intake.sh: one JSON object per line, each a
// plant in the adapter contract's own words (scripts/ingest/README.md), with
// `id` as the source's id. E2E_UNMATCHED and E2E_FILL choose what the source
// does with a record nobody fits and with a fact the plant already has.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export const source = {
  slug: 'e2e-intake',
  name: 'E2E Intake Source',
  publisher: 'tests/api/intake.sh',
  url: 'https://example.test/e2e-intake',
  terms: 'Made up for a test.',
  howFetched: 'Written by the test.',
  kind: 'factory',
  refSource: 'E2E_INTAKE',
  scope: 'all',
  unmatched: process.env.E2E_UNMATCHED === 'hold' ? 'hold' : 'add',
  fill: process.env.E2E_FILL === 'empty' ? 'empty' : 'ranked',
  rank: 60,
  ranks: { headcount: 70 },
};

export const version = 1;

export async function* rows(file) {
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    if (line.trim() !== '') yield JSON.parse(line);
  }
}

export const idOf = (row) => (typeof row.id === 'string' && row.id !== '' ? row.id : null);

export async function read(row, { asOf }) {
  const { id, ...facts } = row;
  return { id, payload: row, facts: { ...facts, asOf: facts.asOf ?? asOf } };
}

export const asOfFile = async () => '2026-01-15';
