// Fails when a component names a palette colour (text-emerald-400, bg-white/10).
// Such a class is right in one theme and wrong in the other; colours come from
// the theme tokens in client/src/styles/globals.css instead:
//
//   surfaces  bg-bg-base / bg-bg-surface / bg-bg-elevated
//   text      text-fg-default / text-fg-muted / text-fg-soft
//   lines     border-border-subtle / border-border-strong
//   meaning   success / danger / warning / info   (text-success, bg-danger/10)
//   wash      tint                                 (bg-tint/5, border-tint/10)
//
// Run by `npm run lint`.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'src');

const PROPS = 'bg|text|border|ring|from|to|via|divide|fill|stroke|outline|decoration|placeholder|caret|accent';
const HUES =
  'gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PALETTE = new RegExp(`(?<![\\w-])(?:${PROPS})-(?:(?:${HUES})-\\d{2,3}|white|black)(?:/(?:\\d+|\\[[\\d.]+\\]))?(?![\\w-])`, 'g');

// Deliberate exceptions, each with its reason.
const ALLOWED = [
  // A logo is drawn for a white page: its tile is white in both themes.
  { file: 'components/CompanyLogo.tsx', pattern: /^bg-white$/ },
  // A scrim behind a dialog, sheet or the search panel dims the page in both themes.
  { file: '', pattern: /^bg-black\/\d+$/ },
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

const problems = [];
let files = 0;
for await (const file of walk(root)) {
  files += 1;
  const rel = path.relative(root, file).split(path.sep).join('/');
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(PALETTE)) {
      const allowed = ALLOWED.some((rule) => rel.startsWith(rule.file) && rule.pattern.test(match[0]));
      if (!allowed) problems.push(`client/src/${rel}:${index + 1}  ${match[0]}`);
    }
  });
}

if (problems.length > 0) {
  console.error(`theme colours: ${problems.length} palette ${problems.length === 1 ? 'class' : 'classes'} found. Use a theme token instead.`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`theme colours ok (${files} files)`);
