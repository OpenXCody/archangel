// Checks on the stored company logos and the curated domains behind them:
// what the page is told is there must be there, and what is stored must be
// safe and small. `npm run test:unit`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FOLDER = path.join(ROOT, 'client', 'public', 'logos');
const read = (file: string): unknown => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));

const list = read('client/src/lib/logos.json') as Record<string, string | null>;
interface CuratedDomains {
  companies: { name: string; domain: string; note?: string }[];
  skipped: { name: string; why: string }[];
}
/** Each curated file with the migration generated from it. A later pass is a new file and a new migration. */
const CURATED: { file: string; migration: string }[] = [
  { file: 'data/companies/domains.json', migration: '0037_company_domains.sql' },
  { file: 'data/companies/domains-2.json', migration: '0045_company_domains_2.sql' },
];
const decisions = read('data/companies/logo-decisions.json') as { none: Record<string, string>; kept: Record<string, { ext: string; from: string }> };
const BARE_DOMAIN = /^(?!www\.)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

test('every listed logo is stored, and every stored logo is listed', () => {
  const listed = Object.entries(list).filter(([, type]) => type !== null).map(([domain, type]) => `${domain}.${type}`).sort();
  assert.deepEqual(readdirSync(FOLDER).sort(), listed);
  for (const [domain, type] of Object.entries(list)) {
    assert.match(domain, BARE_DOMAIN);
    assert.ok(type === null || type === 'png' || type === 'svg', `${domain}: ${type}`);
  }
});

test('stored logos are small, and an SVG is only a drawing', () => {
  let total = 0;
  for (const file of readdirSync(FOLDER)) {
    const size = statSync(path.join(FOLDER, file)).size;
    total += size;
    assert.ok(size <= 40_000, `${file} is ${size} bytes`);
    if (!file.endsWith('.svg')) continue;
    const text = readFileSync(path.join(FOLDER, file), 'utf8');
    assert.match(text, /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg\b/, `${file} does not start as an SVG`);
    assert.doesNotMatch(text, /<script\b|<foreignObject\b|\son[a-z]+\s*=/i, `${file} carries script`);
    assert.doesNotMatch(text, /(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)/i, `${file} points outside itself`);
    assert.doesNotMatch(text, /url\(\s*["']?\s*(?!#|data:image\/)|@import|prefers-color-scheme/i, `${file} points outside itself or changes with the colour scheme`);
    assert.match(text, /<svg\b[^>]*\bviewBox\s*=/i, `${file} has no viewBox, so it would be cropped instead of scaled`);
  }
  assert.ok(total <= 3_500_000, `the logos folder is ${total} bytes`);
});

test('decisions made by hand hold in the list', () => {
  for (const [domain, kept] of Object.entries(decisions.kept)) {
    assert.equal(list[domain], kept.ext, `${domain} was placed by hand`);
    assert.ok(kept.from.trim().length > 0, `${domain} does not say where its mark is from`);
  }
  for (const [domain, why] of Object.entries(decisions.none)) {
    assert.equal(list[domain], null, `${domain} was left on the lettermark`);
    assert.ok(why.trim().length > 0, `${domain} does not say why`);
  }
});

test('curated domains are bare, each company is decided once, and each migration matches its file', () => {
  const names = new Set<string>();
  const skippedNames = new Set<string>();
  const scratch = mkdtempSync(path.join(tmpdir(), 'domains-'));
  try {
    for (const { file, migration } of CURATED) {
      const curated = read(file) as CuratedDomains;
      for (const company of curated.companies) {
        assert.match(company.domain, BARE_DOMAIN, company.name);
        // One company, one domain, in one file: a migration only fills an empty domain, so a second entry would never apply.
        assert.ok(!names.has(company.name), `${company.name} is listed twice`);
        names.add(company.name);
      }
      for (const skipped of curated.skipped) {
        assert.ok(!skippedNames.has(skipped.name), `${skipped.name} is skipped twice`);
        skippedNames.add(skipped.name);
        assert.ok(skipped.why.trim().length > 0, skipped.name);
      }
      const out = path.join(scratch, migration);
      execFileSync('node', ['scripts/build-domains-sql.mjs', file, out], { cwd: ROOT, stdio: 'ignore' });
      assert.equal(readFileSync(out, 'utf8'), readFileSync(path.join(ROOT, 'migrations', migration), 'utf8'), `${migration} is not what ${file} generates`);
    }
    // A company given a domain by a later pass may have been skipped by an earlier one, never the reverse within a file.
    for (const { file } of CURATED) {
      const curated = read(file) as CuratedDomains;
      const own = new Set(curated.companies.map((c) => c.name));
      for (const skipped of curated.skipped) assert.ok(!own.has(skipped.name), `${skipped.name} has a domain and is also skipped in ${file}`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('every curated domain has been looked at: it is in the list the page reads', () => {
  for (const { file } of CURATED) {
    for (const company of (read(file) as CuratedDomains).companies) {
      assert.ok(company.domain in list, `${company.name}: ${company.domain} is in ${file} but scripts/fetch-logos.mjs has not settled it`);
    }
  }
});
