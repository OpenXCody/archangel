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
const curated = read('data/companies/domains.json') as { companies: { name: string; domain: string }[]; skipped: { name: string; why: string }[] };
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

test('curated domains are bare, each company is decided once, and the migration matches the file', () => {
  const names = new Set<string>();
  for (const company of curated.companies) {
    assert.match(company.domain, BARE_DOMAIN, company.name);
    assert.ok(!names.has(company.name), `${company.name} is listed twice`);
    names.add(company.name);
  }
  for (const skipped of curated.skipped) {
    assert.ok(!names.has(skipped.name), `${skipped.name} has a domain and is also skipped`);
    assert.ok(skipped.why.trim().length > 0, skipped.name);
  }
  const scratch = mkdtempSync(path.join(tmpdir(), 'domains-'));
  try {
    execFileSync('node', ['scripts/build-domains-sql.mjs', 'data/companies/domains.json', path.join(scratch, 'out.sql')], { cwd: ROOT, stdio: 'ignore' });
    assert.equal(readFileSync(path.join(scratch, 'out.sql'), 'utf8'), readFileSync(path.join(ROOT, 'migrations', '0037_company_domains.sql'), 'utf8'));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
