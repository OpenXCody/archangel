// The page's Content-Security-Policy (vercel.json) allows inline scripts by
// their hash, so editing a <script> in client/index.html without updating the
// policy would silently stop that script running in production. This check
// fails when the two disagree, and prints the hashes the policy should carry.
//
//   node scripts/check-csp.mjs                   client/index.html (part of `npm run lint`)
//   node scripts/check-csp.mjs dist/index.html   the built page
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlFile = path.resolve(ROOT, process.argv[2] ?? 'client/index.html');
const html = readFileSync(htmlFile, 'utf8');
const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

const policy = vercel.headers
  ?.flatMap((rule) => rule.headers)
  .find((header) => ['content-security-policy', 'content-security-policy-report-only'].includes(header.key.toLowerCase()))?.value;
if (!policy) {
  console.error('csp: vercel.json sets no Content-Security-Policy.');
  process.exit(1);
}
const scriptSrc = policy.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) ?? '';

const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const wanted = inline.map((text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`);
const listed = scriptSrc.split(/\s+/).filter((token) => token.startsWith("'sha256-"));

const problems = [];
if (/'unsafe-inline'|'unsafe-eval'/.test(scriptSrc)) problems.push('script-src must not allow unsafe-inline or unsafe-eval');
for (const hash of wanted) if (!listed.includes(hash)) problems.push(`an inline script is not in the policy: ${hash}`);
for (const hash of listed) if (!wanted.includes(hash)) problems.push(`the policy lists a hash no inline script has: ${hash}`);

if (problems.length > 0) {
  console.error(`csp: ${path.relative(ROOT, htmlFile)} and the policy in vercel.json disagree.`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`  script-src should carry: ${wanted.join(' ')}`);
  process.exit(1);
}
console.log(`csp ok (${wanted.length} inline scripts match the policy)`);
