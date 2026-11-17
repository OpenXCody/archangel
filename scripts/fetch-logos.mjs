#!/usr/bin/env node
// Fetches a logo for every company domain in data/companies/profiles.json,
// once, into client/public/logos/, and writes the list the page reads
// (client/src/lib/logos.json). The page then shows a stored logo from this
// site, or the lettermark for a domain known to have none, with no request to
// anyone else. Only a domain that is not in the list (one an admin has set
// since this last ran) is still looked up from Google's favicon service.
//
//   node scripts/fetch-logos.mjs                  fetch what is missing
//   node scripts/fetch-logos.mjs --force          fetch everything again
//   node scripts/fetch-logos.mjs --only a.com,b.com
//
// For each domain it takes the first source that gives a real mark:
//   1. Google's favicon service, when it has one of 64 px or more;
//   2. the company's own site: an SVG icon, else its largest touch icon or
//      icon of 64 px or more (read from the page's <link> tags);
//   3. DuckDuckGo's icon service, then icon.horse, 64 px or more.
// Anything smaller is a blurry favicon, and the lettermark is better. Raster
// marks are stored as 128 px PNGs.
//
// NONE below lists domains whose fetched mark was looked at and judged wrong
// or unusable; they keep the lettermark. KEPT lists marks placed by hand. Look at what a run brings in before
// committing it (the files are small; open the folder).
//
// Needs curl and ImageMagick (`identify`, `convert`) on the PATH. This is a
// maintenance tool: nothing in the build or the app runs it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client', 'public', 'logos');
const LIST = path.join(ROOT, 'client', 'src', 'lib', 'logos.json');
const MIN_PX = 64;
const STORE_PX = 128;
const MAX_SVG_BYTES = 40_000;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Domains to leave on the lettermark, each with the reason. */
const NONE = {
  'crh.com': 'its icon is a sheet of many small brand logos',
  'tysonfoods.com': 'its icon is a sheet of many small brand logos',
};

/**
 * Marks placed by hand, where the usual sources only have a 16 px favicon but
 * the company's own site carries its mark in a form that fits a square. The
 * file is already in the folder; a run leaves it alone.
 */
const KEPT = {
  'ball.com': { ext: 'png', from: 'the script wordmark on ball.com (og:image), set in black' },
  'boeing.com': { ext: 'svg', from: 'the symbol from the header logo on boeing.com, the same one its favicon shows' },
};

const force = process.argv.includes('--force');
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt > -1 ? new Set(process.argv[onlyAt + 1].split(',')) : null;

const profiles = JSON.parse(readFileSync(path.join(ROOT, 'data', 'companies', 'profiles.json'), 'utf8')).companies;
const domains = [...new Set(profiles.map((c) => (c.domain || '').trim().toLowerCase()).filter(Boolean))].sort();
const list = existsSync(LIST) ? JSON.parse(readFileSync(LIST, 'utf8')) : {};
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), 'logos-'));

function curl(url, file) {
  try {
    const headers = `${file}.headers`;
    const code = execFileSync('curl', ['-sS', '-L', '--max-time', '20', '--max-redirs', '5', '-A', UA, '-D', headers, '-o', file, '-w', '%{http_code}', url], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    // icon.horse answers 200 with a letter tile of its own when it has nothing.
    if (/^x-icon-fallback:\s*true/im.test(readFileSync(headers, 'utf8'))) return false;
    return code.trim() === '200' && existsSync(file) && statSync(file).size > 0;
  } catch {
    return false;
  }
}

/** { kind: 'svg' } or { kind: 'raster', px } for a downloaded file, or null. */
function inspect(file) {
  const head = readFileSync(file).subarray(0, 600).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return statSync(file).size <= MAX_SVG_BYTES ? { kind: 'svg' } : null;
  }
  if (head.startsWith('<')) return null; // an HTML error page
  try {
    // An .ico can hold several sizes: take the largest.
    const sizes = execFileSync('identify', ['-format', '%w %h\n', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .split('\n')
      .map((line) => line.split(' ').map(Number));
    let best = null;
    sizes.forEach(([w, h], frame) => {
      if (!best || Math.min(w, h) > best.px) best = { kind: 'raster', px: Math.min(w, h), side: Math.max(w, h), frame };
    });
    return best;
  } catch {
    return null;
  }
}

/** Icon links on a site's front page, best first. */
function siteIcons(domain) {
  const html = path.join(tmp, 'page.html');
  for (const base of [`https://www.${domain}`, `https://${domain}`]) {
    if (!curl(`${base}/`, html)) continue;
    const text = readFileSync(html, 'utf8');
    const found = [];
    for (const tag of text.match(/<link\b[^>]*>/gi) ?? []) {
      const attr = (name) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i')) ?? [])[1] ?? '';
      const rel = attr('rel').toLowerCase();
      const href = attr('href').replace(/&amp;/g, '&');
      if (!href || !/(^|\s)(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel)) continue;
      const size = Number((attr('sizes').match(/(\d+)x\d+/) ?? [])[1] ?? 0);
      const svg = /\.svg(\?|$)/i.test(href) || /svg/i.test(attr('type'));
      const touch = rel.includes('apple-touch-icon');
      let url;
      try {
        url = new URL(href, `${base}/`).href;
      } catch {
        continue;
      }
      found.push({ url, score: svg ? 10_000 : (touch ? 1000 : 0) + size });
    }
    found.sort((a, b) => b.score - a.score);
    return [...found.map((f) => f.url), `${base}/apple-touch-icon.png`];
  }
  return [];
}

function store(domain, file, info) {
  if (info.kind === 'svg') {
    copyFileSync(file, path.join(OUT, `${domain}.svg`));
    return 'svg';
  }
  // Contained in a square, on a transparent ground, never enlarged.
  const side = Math.min(info.side, STORE_PX);
  execFileSync('convert', [
    `${file}[${info.frame}]`,
    '-background', 'none',
    '-resize', `${side}x${side}`,
    '-gravity', 'center',
    '-extent', `${side}x${side}`,
    '-strip',
    `PNG32:${path.join(OUT, `${domain}.png`)}`,
  ]);
  return 'png';
}

function fetchOne(domain) {
  const file = path.join(tmp, 'candidate');
  const tryUrl = (url, source) => {
    if (!curl(url, file)) return null;
    const info = inspect(file);
    if (!info || (info.kind === 'raster' && info.px < MIN_PX)) return null;
    return { ext: store(domain, file, info), source };
  };
  const google = tryUrl(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, 'google');
  if (google) return google;
  for (const url of siteIcons(domain)) {
    const own = tryUrl(url, 'site');
    if (own) return own;
  }
  return (
    tryUrl(`https://icons.duckduckgo.com/ip3/${domain}.ico`, 'duckduckgo') ??
    tryUrl(`https://icon.horse/icon/${domain}`, 'icon.horse')
  );
}

for (const domain of domains) {
  if (only && !only.has(domain)) continue;
  if (NONE[domain]) {
    for (const ext of ['png', 'svg']) rmSync(path.join(OUT, `${domain}.${ext}`), { force: true });
    list[domain] = null;
    console.log(`${domain}: lettermark (${NONE[domain]})`);
    continue;
  }
  if (KEPT[domain]) {
    if (!existsSync(path.join(OUT, `${domain}.${KEPT[domain].ext}`))) throw new Error(`${domain}: the hand-placed mark is missing from ${OUT}`);
    list[domain] = KEPT[domain].ext;
    console.log(`${domain}: ${KEPT[domain].ext}, placed by hand (${KEPT[domain].from})`);
    continue;
  }
  if (!force && list[domain] && existsSync(path.join(OUT, `${domain}.${list[domain]}`))) continue;
  const got = fetchOne(domain);
  for (const ext of ['png', 'svg']) {
    if (!got || got.ext !== ext) rmSync(path.join(OUT, `${domain}.${ext}`), { force: true });
  }
  list[domain] = got ? got.ext : null;
  console.log(`${domain}: ${got ? `${got.ext} from ${got.source}` : 'nothing of 64 px or more, lettermark'}`);
}

// Only domains still in the profiles stay in the list.
const sorted = Object.fromEntries(domains.filter((d) => d in list).map((d) => [d, list[d]]));
writeFileSync(LIST, `${JSON.stringify(sorted, null, 1)}\n`);
rmSync(tmp, { recursive: true, force: true });
const stored = Object.values(sorted).filter(Boolean).length;
console.log(`\n${stored} stored, ${Object.keys(sorted).length - stored} on the lettermark, of ${domains.length} domains.`);
