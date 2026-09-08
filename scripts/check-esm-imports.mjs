// Server code runs as native ESM on Vercel, where relative imports need an
// explicit .js extension and directory imports are not resolved. tsc and tsx
// accept both forms, so only this check catches the regression before deploy.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = [...walk('server'), ...walk('api')].filter((f) => !f.startsWith('server/scripts/'));
const re = /(?:from|import)\s*\(?\s*['"](\.\.?\/[^'"]+)['"]/g;
let bad = 0;
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(re)) {
    if (!/\.(js|mjs|cjs|json)$/.test(m[1])) {
      console.error(`${f}: relative import "${m[1]}" needs a .js extension`);
      bad++;
    }
  }
}
if (bad) {
  console.error(`\n${bad} import(s) would fail under Node ESM on Vercel.`);
  process.exit(1);
}
console.log(`esm imports ok (${files.length} files)`);
