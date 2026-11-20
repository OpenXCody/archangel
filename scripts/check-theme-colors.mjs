// Fails when a colour is named anywhere in the client but the token file.
//
// The token file is the `:root` blocks of client/src/styles/globals.css: the
// eleven tokens, per theme, and the few named values beside them. Everything a
// person sees takes its colour from there:
//
//   canvas   bg-bg                               var(--bg)
//   raised   bg-surface, bg-surface-hover        var(--surface), var(--surface-hover)
//   lines    border-line, border-line-strong     var(--line), var(--line-strong)
//   ink      text-text-1 / -2 / -3               var(--text-1) ...
//   accent   outline-accent, border-accent       var(--accent)
//   inverse  bg-inverse-bg text-inverse-text     var(--inverse-bg), var(--inverse-text)
//   error    text-danger, border-danger          var(--danger)
//
// So a hex value, rgb( or hsl(, a palette class (text-emerald-400, bg-white/10)
// or `white` / `black` as a colour is a mistake in any .ts, .tsx or .css file
// under client/src and in client/index.html: it is right in one theme and
// wrong in the other, and it is a grey nobody chose. The names the tokens
// replaced (text-fg-muted, bg-bg-elevated, bg-tint/5, var(--color-…), shadcn's
// bg-primary, bg-muted …) fail too, so they cannot come back.
//
// Not checked: company logos (client/public/logos, images). Two static files a
// browser reads before any stylesheet must each carry a literal colour, the
// `theme-color` tag in client/index.html and the manifest's two; they are held
// equal to the dark theme's --bg instead.
//
// Run by `npm run lint`.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(repo, 'client');
const TOKEN_FILE = 'client/src/styles/globals.css';

const PROPS = 'bg|text|border|ring|ring-offset|from|to|via|divide|fill|stroke|outline|decoration|placeholder|caret|accent|shadow';
const HUES =
  'gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const OLD_NAMES =
  'fg-default|fg-muted|fg-soft|bg-base|bg-surface|bg-elevated|border-subtle|border-strong|accent-primary|accent-foreground|tint|info|success|warning|' +
  'background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|' +
  'muted|muted-foreground|destructive|destructive-foreground|input|ring';

const CHECKS = [
  ['a hex colour', /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g],
  ['a colour function', /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g],
  ['a palette class', new RegExp(`(?<![\\w-])(?:${PROPS})-(?:(?:${HUES})-\\d{2,3}|white|black)(?:/(?:\\d+|\\[[\\d.]+\\]))?(?![\\w-])`, 'g')],
  [
    'white or black as a colour',
    /(?:\b(?:fill|stroke|color|background|background-color|backgroundColor|border-color|borderColor|stop-color|stopColor|outline-color|outlineColor)\s*[:=]\s*[{'"`\s]*(?:white|black)\b)|(?:[:,(]\s*(?:white|black)\s*[;,)])/g,
  ],
  ['a name the tokens replaced', new RegExp(`(?<![\\w-])(?:${PROPS})-(?:${OLD_NAMES})(?:/(?:\\d+|\\[[\\d.]+\\]))?(?![\\w-])`, 'g')],
  [
    'a variable the tokens replaced',
    /var\(--(?:color-[a-z-]+|background|foreground|card|popover|primary|secondary|muted|destructive|border|input|ring|tint|info|success|warning|scrollbar-thumb|shadow-[a-z]+)\b/g,
  ],
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|css)$/.test(entry.name)) yield full;
  }
}

/**
 * A stylesheet as lines to check, each with whether it belongs to the map's
 * rules. Comments are blanked (a colour named in a comment paints nothing),
 * and so is the token file itself: every `:root` block.
 */
function stylesheetLines(text) {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const out = [];
  const stack = [];
  let prelude = '';
  let line = '';
  const flush = () => {
    out.push({ text: stack.some((s) => /^:root\b/.test(s)) ? '' : line });
    line = '';
  };
  for (const char of bare) {
    if (char === '\n') {
      flush();
      continue;
    }
    line += char;
    if (char === '{') {
      stack.push(prelude.trim());
      prelude = '';
    } else if (char === '}') {
      stack.pop();
      prelude = '';
    } else if (char === ';') prelude = '';
    else prelude += char;
  }
  flush();
  return out;
}

/** The value a theme gives a token, read from the token file. */
function tokenValue(css, name, theme) {
  const block = theme === 'light' ? /:root\[data-theme='light'\]\s*\{([^}]*)\}/ : /:root\s*\{([^}]*)\}/;
  const body = css.match(block)?.[1] ?? '';
  return body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim().toLowerCase() ?? null;
}

const problems = [];
let files = 0;

function check(rel, lines) {
  lines.forEach((entry, index) => {
    for (const [what, pattern] of CHECKS) {
      for (const match of entry.text.matchAll(pattern)) {
        problems.push(`${rel}:${index + 1}  ${what}: ${match[0].trim()}`);
      }
    }
  });
}

for await (const file of walk(path.join(client, 'src'))) {
  files += 1;
  const rel = path.relative(repo, file).split(path.sep).join('/');
  const text = await readFile(file, 'utf8');
  check(rel, file.endsWith('.css') ? stylesheetLines(text) : text.split('\n').map((line) => ({ text: line })));
}

// The page itself: its scripts and tags, apart from the one colour a browser needs before the stylesheet.
const tokens = await readFile(path.join(repo, TOKEN_FILE), 'utf8');
const canvas = tokenValue(tokens, '--bg', 'dark');
const html = await readFile(path.join(client, 'index.html'), 'utf8');
const chrome = html.match(/<meta name="theme-color" content="([^"]*)"/)?.[1].toLowerCase() ?? null;
files += 1;
check(
  'client/index.html',
  html.split('\n').map((line) => ({ text: line.replace(/<meta name="theme-color"[^>]*>/, '') })),
);
if (!canvas) problems.push(`${TOKEN_FILE}  no --bg in the dark theme's :root block`);
if (chrome !== canvas) problems.push(`client/index.html  theme-color is ${chrome}; the dark theme's --bg is ${canvas}`);
const manifest = JSON.parse(await readFile(path.join(client, 'public', 'manifest.webmanifest'), 'utf8'));
for (const key of ['theme_color', 'background_color']) {
  if (String(manifest[key]).toLowerCase() !== canvas) problems.push(`client/public/manifest.webmanifest  ${key} is ${manifest[key]}; the dark theme's --bg is ${canvas}`);
}

if (problems.length > 0) {
  console.error(`theme colours: ${problems.length} ${problems.length === 1 ? 'colour' : 'colours'} named outside the token file. Use a token instead (${TOKEN_FILE}).`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`theme colours ok (${files} files)`);
