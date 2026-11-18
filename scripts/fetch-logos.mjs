#!/usr/bin/env node
// Fetches a logo for every company web domain the data names, once, into
// client/public/logos/, and writes the list the page reads
// (client/src/lib/logos.json). The page then shows a stored logo from this
// site, or the lettermark for a domain known to have none, with no request to
// anyone else. Only a domain that is not in the list (one an admin has set
// since this last ran) is still looked up from Google's favicon service.
//
//   node scripts/fetch-logos.mjs                  fetch what has not been tried
//   node scripts/fetch-logos.mjs --retry          also try again the domains left on the lettermark
//   node scripts/fetch-logos.mjs --force          fetch everything again
//   node scripts/fetch-logos.mjs --only a.com,b.com
//   node scripts/fetch-logos.mjs --employers <folder>   also read the employer files in this folder
//   node scripts/fetch-logos.mjs --sheet out.html       write a contact sheet of what this run stored
//   node scripts/fetch-logos.mjs --prune                remove marks for domains the data no longer names
//   node scripts/fetch-logos.mjs --place a.com=mark.svg --note "where it is from"
//                                                 store a mark chosen by hand, and remember it
//   node scripts/fetch-logos.mjs --none a.com --note "why"
//                                                 leave a domain on the lettermark, and remember why
//
// Domains come from three places, and a domain named in any of them counts:
//   data/companies/profiles.json    the curated profiles
//   data/companies/domains.json     domains for the companies people meet first
//   data/employers/*.json           researched employers, when the folder exists
//                                   (and any folder given with --employers)
//
// A run is safe to repeat: a domain with a stored mark is skipped, and so is
// one already found to have none (until --retry). A mark stored by an earlier
// run stays until --prune, whether or not this run's sources name its domain.
// "None" is written down only when Wikimedia and the icon services answered;
// a domain they could not be asked about is tried again by the next run.
//
// For each domain it takes the first source that gives a mark that fits a
// square tile at 28 to 44 px:
//   1. the company's own site: an SVG icon, an SVG logo in its header, its
//      largest touch icon, the largest icon in its manifest, another icon of
//      48 px or more;
//   2. Wikimedia: the logo of the Wikidata entry whose official website is
//      this domain (its small icon when it has one), else a Commons file
//      named "<company> logo" that the Wikipedia article about a company of
//      that name uses. The SVG when it is small enough, else a PNG;
//   3. Google's favicon service, DuckDuckGo's, then icon.horse, 48 px or more.
// A mark wider than MAX_ASPECT is passed over and the run says so: a wordmark
// shrunk into a square cannot be read, and the lettermark is better. (A raster
// is measured without its empty margins, so a wordmark centred on a square
// icon is seen for what it is, and so is a mark drawn in white.) When the
// logo has a separate symbol, crop to it by hand and store it with --place.
// Raster marks are stored as PNGs of at most 128 px; SVGs are stripped of
// scripts, links, outside references and editor metadata.
//
// What a person decided is kept in data/companies/logo-decisions.json and no
// run undoes it: `none` lists domains whose fetched mark was looked at and
// judged wrong or unusable (they keep the lettermark), `kept` the marks
// placed by hand and where each came from. --place and --none write to it.
// Look at what a run brings in before committing it (--sheet writes a page
// showing each new mark at size, over a light and a dark page): a wrong logo
// on a company's page is worse than a letter.
//
// Needs curl and ImageMagick (`identify`, `convert`) on the PATH. This is a
// maintenance tool: nothing in the build or the app runs it.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client', 'public', 'logos');
const LIST = path.join(ROOT, 'client', 'src', 'lib', 'logos.json');
const MIN_PX = 48;
const STORE_PX = 128;
const MAX_SVG_BYTES = 20_000;
const MAX_PNG_BYTES = 20_000;
/** Longer side over shorter. Beyond this a mark is a wordmark, not a tile. */
const MAX_ASPECT = 2;
const JOBS = 6;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/** Wikimedia asks automated clients to say what they are. */
const WIKI_UA = 'company-logo-fetch/1.0 (maintenance script; curl)';

const DECISIONS = path.join(ROOT, 'data', 'companies', 'logo-decisions.json');
/** What a person decided: { none: { domain: reason }, kept: { domain: { ext, from } } }. */
const decisions = existsSync(DECISIONS) ? JSON.parse(readFileSync(DECISIONS, 'utf8')) : {};
const NONE = (decisions.none ??= {});
const KEPT = (decisions.kept ??= {});

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valuesOf = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));
const force = flag('--force');
const retry = flag('--retry');
const prune = flag('--prune');
const only = valuesOf('--only').length > 0 ? new Set(valuesOf('--only').flatMap((v) => v.split(',')).map(cleanDomain)) : null;
const sheet = valuesOf('--sheet')[0] ?? null;
const note = valuesOf('--note')[0] ?? '';

/** "https://www.Example.com/about" → "example.com"; '' when it is not a domain. */
function cleanDomain(value) {
  const text = String(value ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(text) ? text : '';
}

/** Every domain the data names, with the company names it is given for. */
function readDomains() {
  const found = new Map();
  const add = (domain, name) => {
    const key = cleanDomain(domain);
    if (!key) return;
    if (!found.has(key)) found.set(key, []);
    const names = found.get(key);
    if (name && !names.includes(name)) names.push(name);
  };
  const companiesIn = (file) => {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data.companies) ? data.companies : [];
  };
  for (const file of ['profiles.json', 'domains.json']) {
    const full = path.join(ROOT, 'data', 'companies', file);
    if (existsSync(full)) for (const c of companiesIn(full)) add(c.domain, c.name);
  }
  for (const folder of [path.join(ROOT, 'data', 'employers'), ...valuesOf('--employers').map((f) => path.resolve(f))]) {
    if (!existsSync(folder)) continue;
    for (const file of readdirSync(folder).filter((f) => f.endsWith('.json')).sort()) {
      let companies;
      try {
        companies = companiesIn(path.join(folder, file));
      } catch (error) {
        console.warn(`${path.join(folder, file)}: not read (${error.message})`);
        continue;
      }
      for (const c of companies) add(c.domain, c.name);
    }
  }
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Downloads a URL to a file. `ok` when the answer was 200 with a body;
 * `answered` when the host answered at all (200, or 404 for "no such thing"),
 * as opposed to refusing, failing or timing out.
 */
async function curl(url, file, { agent = UA } = {}) {
  const headers = `${file}.headers`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let code = '';
    try {
      const { stdout } = await run('curl', ['-sS', '-L', '--compressed', '--max-time', '20', '--max-redirs', '5', '-A', agent, '-D', headers, '-o', file, '-w', '%{http_code}', url]);
      code = stdout.trim();
    } catch {
      return { ok: false, answered: false };
    }
    // "Too many requests": wait as long as the host asks (a minute at most), then ask again.
    if (code === '429' && attempt < 3) {
      const asked = Number((readFileSync(headers, 'utf8').match(/^retry-after:\s*(\d+)/im) ?? [])[1] ?? 0);
      await sleep(Math.min(Math.max(asked, 4 * (attempt + 1)), 60) * 1000);
      continue;
    }
    // icon.horse answers 200 with a letter tile of its own when it has nothing.
    if (existsSync(headers) && /^x-icon-fallback:\s*true/im.test(readFileSync(headers, 'utf8'))) return { ok: false, answered: true };
    return { ok: code === '200' && existsSync(file) && statSync(file).size > 0, answered: code === '200' || code === '404' };
  }
  return { ok: false, answered: false };
}

/** Wikimedia's API is asked one question at a time, whatever the number of workers. */
let wikiTurn = Promise.resolve();

/** A Wikimedia API answer, or null. `reach.failed` is set when it did not answer. */
async function json(url, file, reach) {
  const turn = wikiTurn.then(() => curl(url, file, { agent: WIKI_UA }));
  wikiTurn = turn.then(() => sleep(250), () => {});
  const got = await turn;
  if (!got.answered) reach.failed = true;
  if (!got.ok) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Width and height an SVG draws at, from its viewBox or its size. */
function svgSize(text) {
  const root = (text.match(/<svg\b[^>]*>/i) ?? [])[0] ?? '';
  const box = (root.match(/\bviewBox\s*=\s*["']([^"']+)["']/i) ?? [])[1];
  if (box) {
    const [, , w, h] = box.trim().split(/[\s,]+/).map(Number);
    if (w > 0 && h > 0) return { w, h };
  }
  const side = (name) => Number((root.match(new RegExp(`\\s${name}\\s*=\\s*["']([\\d.]+)(?:px|pt|mm|cm|in)?["']`, 'i')) ?? [])[1]);
  const w = side('width');
  const h = side('height');
  return w > 0 && h > 0 ? { w, h } : null;
}

/**
 * An SVG with everything but the drawing removed: scripts, event handlers,
 * links, foreign content, editor metadata. Null when what is left is not a
 * self-contained drawing: it still points outside the file, has no size, or
 * changes colour with the reader's colour scheme (the tile it sits on does
 * not).
 */
function cleanSvg(source) {
  let text = source.replace(/^﻿/, '');
  // Illustrator declares entities in the DOCTYPE and uses them for namespaces.
  for (const [, name, value] of text.matchAll(/<!ENTITY\s+(\w+)\s+"([^"]*)"\s*>/g)) text = text.split(`&${name};`).join(value);
  text = text
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|metadata|foreignObject|title|desc)\b[^>]*\/>/gi, '')
    .replace(/<(script|metadata|foreignObject|title|desc)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(sodipodi|inkscape|i|x|rdf|cc|dc):[\w-]+\b[^>]*\/>/gi, '')
    .replace(/<(sodipodi|inkscape|i|x|rdf|cc|dc):([\w-]+)\b[\s\S]*?<\/\1:\2\s*>/gi, '')
    .replace(/\s(?:sodipodi|inkscape|i|x|xml):[\w-]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\sdata-[\w-]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\sxmlns:(?:sodipodi|inkscape|i|x|rdf|cc|dc|a|graph|svg)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/<a\b[^>]*>/gi, '<g>')
    .replace(/<\/a\s*>/gi, '</g>')
    .replace(/>\s+</g, '><')
    .trim();
  const start = text.search(/<svg\b/i);
  if (start < 0) return null;
  text = text.slice(start);
  // What is left must not reach outside the file.
  if (/(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)/i.test(text)) return null;
  if (/url\(\s*["']?\s*(?!#|data:image\/)/i.test(text) || /@import/i.test(text)) return null;
  if (/prefers-color-scheme/i.test(text)) return null;
  const size = svgSize(text);
  if (!size) return null;
  if (!/<svg\b[^>]*\sxmlns\s*=/i.test(text)) text = text.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  // Without a viewBox an SVG is cropped, not scaled, when it is drawn smaller.
  if (!/<svg\b[^>]*\bviewBox\s*=/i.test(text)) text = text.replace(/<svg\b/i, `<svg viewBox="0 0 ${size.w} ${size.h}"`);
  return `${text}\n`;
}

/** { kind: 'svg', text, w, h } or { kind: 'raster', px, side, w, h, crop, frame } for a downloaded file, or null. */
async function inspect(file) {
  const head = readFileSync(file).subarray(0, 4000).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  if (head.startsWith('<svg') || (/^<(\?xml|!--|!doctype svg)/.test(head) && head.includes('<svg'))) {
    const text = cleanSvg(readFileSync(file, 'utf8'));
    if (!text || Buffer.byteLength(text) > MAX_SVG_BYTES) return null;
    return { kind: 'svg', text, ...svgSize(text) };
  }
  if (head.startsWith('<')) return null; // an HTML error page
  try {
    // An .ico can hold several sizes: take the largest.
    const { stdout } = await run('identify', ['-format', '%w %h\n', file]);
    let best = null;
    stdout.trim().split('\n').forEach((line, frame) => {
      const [w, h] = line.split(' ').map(Number);
      if (w > 0 && h > 0 && (!best || Math.min(w, h) > Math.min(best.w, best.h))) best = { w, h, frame };
    });
    if (!best) return null;
    // What shows on the white tile: the picture without its empty margins. An
    // icon is often a small mark on a large square, and a mark drawn in white
    // for a dark page leaves nothing at all.
    // (The one-pixel white border makes white the colour that is trimmed,
    // whatever the icon's own corners are.)
    const seen = await run('convert', [`${file}[${best.frame}]`, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-bordercolor', 'white', '-border', '1', '-fuzz', '4%', '-trim', '-format', '%w %h %X %Y', 'info:']);
    const [w, h, x, y] = seen.stdout.trim().split(' ').map((n) => parseInt(n, 10));
    if (!(w > best.w * 0.08 && h > best.h * 0.08)) return null;
    // `px` is the picture's size as it came, for the 48 px floor; a mark that
    // fills less than three quarters of that floor is too coarse to enlarge.
    if (Math.max(w, h) < MIN_PX * 0.75) return null;
    return { kind: 'raster', px: Math.min(best.w, best.h), side: Math.max(w, h), w, h, crop: `${w}x${h}+${Math.max(x - 1, 0)}+${Math.max(y - 1, 0)}`, frame: best.frame };
  } catch {
    return null;
  }
}

const aspect = (info) => Math.max(info.w, info.h) / Math.min(info.w, info.h);

/** Icons and header logos named on a site's front page, best first. */
async function siteMarks(domain, tmp) {
  const html = path.join(tmp, 'page.html');
  for (const base of [`https://www.${domain}`, `https://${domain}`]) {
    if (!(await curl(`${base}/`, html)).ok) continue;
    const text = readFileSync(html, 'utf8');
    const found = [];
    const attrOf = (tag, name) => ((tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i')) ?? [])[1] ?? '').replace(/&amp;/g, '&');
    const resolve = (href, from = `${base}/`) => {
      try {
        const url = new URL(href, from);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
      } catch {
        return null;
      }
    };
    let manifest = null;
    for (const tag of text.match(/<link\b[^>]*>/gi) ?? []) {
      const rel = attrOf(tag, 'rel').toLowerCase();
      const url = resolve(attrOf(tag, 'href'));
      if (!url) continue;
      if (/(^|\s)manifest(\s|$)/.test(rel)) manifest = url;
      if (!/(^|\s)(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel)) continue;
      const size = Number((attrOf(tag, 'sizes').match(/(\d+)x\d+/) ?? [])[1] ?? 0);
      const svg = /\.svg(\?|$)/i.test(url) || /svg/i.test(attrOf(tag, 'type'));
      const touch = rel.includes('apple-touch-icon');
      found.push({ url, score: svg ? 10_000 : (touch ? 2000 : 0) + size });
    }
    // An SVG logo in the page's header: the first image there whose address,
    // class or description says "logo". Often a wide wordmark, which the
    // shape test then passes over.
    const top = (text.match(/<header\b[\s\S]*?<\/header\s*>/i) ?? [text.slice(0, Math.round(text.length * 0.3))])[0];
    for (const tag of top.match(/<img\b[^>]*>/gi) ?? []) {
      const src = attrOf(tag, 'src') || attrOf(tag, 'data-src');
      if (!/\.svg(\?|$)/i.test(src) || !/logo/i.test(tag)) continue;
      const url = resolve(src);
      if (url) found.push({ url, score: 5000 });
      break;
    }
    if (manifest && (await curl(manifest, path.join(tmp, 'manifest.json'))).ok) {
      try {
        const icons = JSON.parse(readFileSync(path.join(tmp, 'manifest.json'), 'utf8')).icons ?? [];
        for (const icon of icons) {
          const size = Number((String(icon.sizes ?? '').match(/(\d+)x\d+/) ?? [])[1] ?? 0);
          const url = resolve(String(icon.src ?? ''), manifest);
          if (url && size >= MIN_PX) found.push({ url, score: 1000 + Math.min(size, 512) });
        }
      } catch {
        // not a manifest
      }
    }
    found.sort((a, b) => b.score - a.score);
    return [...new Set([...found.map((f) => f.url), `${base}/apple-touch-icon.png`])];
  }
  return [];
}

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const query = (params) => Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

/** A company name reduced to what identifies it: "The Dow Chemical Co." → "dow chemical". */
function plainName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|inc|incorporated|corp|corporation|co|company|companies|llc|ltd|lp|plc|sa|ag|nv|group|holdings|usa|us|na|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The Commons file a Wikidata entry with this official website gives as its logo. */
async function wikidataFile(domain, tmp, reach) {
  const file = path.join(tmp, 'wiki.json');
  const urls = ['https://www.', 'https://', 'http://www.', 'http://'].flatMap((scheme) => [`${scheme}${domain}/`, `${scheme}${domain}`]);
  const search = await json(`${WIKIDATA}?${query({ action: 'query', list: 'search', format: 'json', srlimit: 5, srsearch: `haswbstatement:${urls.map((u) => `P856=${u}`).join('|')}` })}`, file, reach);
  for (const hit of search?.query?.search ?? []) {
    const entity = await json(`${WIKIDATA}?${query({ action: 'wbgetentities', format: 'json', ids: hit.title, props: 'claims' })}`, file, reach);
    const claims = entity?.entities?.[hit.title]?.claims ?? {};
    // P8972 is "small logo or icon", P154 "logo image".
    for (const property of ['P8972', 'P154']) {
      const stated = (claims[property] ?? []).filter((c) => c.rank !== 'deprecated').sort((a, b) => Number(b.rank === 'preferred') - Number(a.rank === 'preferred'));
      const name = stated[0]?.mainsnak?.datavalue?.value;
      if (typeof name === 'string') return { title: `File:${name}`, via: `Wikidata ${hit.title}` };
    }
  }
  return null;
}

/** A Commons file named "<company> logo" that the Wikipedia article about a company of that name uses. */
async function commonsFile(names, tmp, reach) {
  const file = path.join(tmp, 'wiki.json');
  for (const name of names) {
    const wanted = plainName(name);
    if (wanted.length < 3) continue;
    const search = await json(`${COMMONS}?${query({ action: 'query', list: 'search', format: 'json', srnamespace: 6, srlimit: 8, srsearch: `intitle:"${name.replace(/"/g, '')}" intitle:logo` })}`, file, reach);
    const titles = (search?.query?.search ?? [])
      .map((hit) => hit.title)
      .filter((title) => /\.(svg|png)$/i.test(title) && !/\b(former|old|historic|19\d\d|20[01]\d)\b/i.test(title))
      .filter((title) => plainName(title.replace(/^File:/, '').replace(/\.\w+$/, '').replace(/logo/gi, ' ')) === wanted)
      .sort((a, b) => Number(/\.png$/i.test(a)) - Number(/\.png$/i.test(b)));
    for (const title of titles) {
      const usage = await json(`${COMMONS}?${query({ action: 'query', format: 'json', prop: 'globalusage', gulimit: 100, gunamespace: 0, titles: title })}`, file, reach);
      const pages = Object.values(usage?.query?.pages ?? {}).flatMap((p) => p.globalusage ?? []);
      if (pages.some((p) => /wikipedia\.org$/.test(p.wiki) && plainName(String(p.title).replace(/_/g, ' ')) === wanted)) return { title, via: `Commons, used by the article "${name}"` };
    }
  }
  return null;
}

/** Where to download a Commons file from: the SVG itself, then a PNG of it. */
async function commonsUrls(title, tmp, reach) {
  const info = await json(`${COMMONS}?${query({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: 256, titles: title })}`, path.join(tmp, 'wiki.json'), reach);
  const image = Object.values(info?.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!image) return [];
  return [image.mime === 'image/svg+xml' ? image.url : null, image.thumburl ?? (image.mime === 'image/png' ? image.url : null)].filter(Boolean);
}

async function store(domain, file, info) {
  if (info.kind === 'svg') {
    writeFileSync(path.join(OUT, `${domain}.svg`), info.text);
    return 'svg';
  }
  // Contained in a square, on a transparent ground, never enlarged.
  const side = Math.min(info.side, STORE_PX);
  const out = path.join(OUT, `${domain}.png`);
  await run('convert', [`${file}[${info.frame}]`, '-crop', info.crop, '+repage', '-background', 'none', '-resize', `${side}x${side}`, '-gravity', 'center', '-extent', `${side}x${side}`, '-strip', `PNG32:${out}`]);
  // A photograph-like icon is large as true colour: 128 colours is plenty at this size.
  if (statSync(out).size > MAX_PNG_BYTES) await run('convert', [out, '-dither', 'FloydSteinberg', '-colors', '128', '-define', 'png:compression-level=9', `PNG8:${out}`]);
  return 'png';
}

/**
 * { ext, source } for the first mark that fits, { ext: null } when there is
 * none. `unsettled` says a source that might have had one did not answer, so
 * "none" is not yet known.
 */
async function fetchOne(domain, names, tmp) {
  const file = path.join(tmp, 'candidate');
  const passedOver = [];
  const reach = { failed: false };
  const tryUrl = async (url, source, { agent = UA, service = false } = {}) => {
    const got = await curl(url, file, { agent });
    if (service && !got.answered) reach.failed = true;
    if (!got.ok) return null;
    const info = await inspect(file);
    if (!info || (info.kind === 'raster' && info.px < MIN_PX)) return null;
    if (aspect(info) > MAX_ASPECT) {
      passedOver.push(`${source} has a wide mark, ${aspect(info).toFixed(1)} to 1`);
      return null;
    }
    return { ext: await store(domain, file, info), source };
  };
  for (const url of await siteMarks(domain, tmp)) {
    const own = await tryUrl(url, `site (${url})`);
    if (own) return { ...own, passedOver };
  }
  const wiki = (await wikidataFile(domain, tmp, reach)) ?? (await commonsFile(names, tmp, reach));
  if (wiki) {
    for (const url of await commonsUrls(wiki.title, tmp, reach)) {
      const seen = passedOver.length;
      const got = await tryUrl(url, `${wiki.title} (${wiki.via})`, { agent: WIKI_UA, service: true });
      if (got) return { ...got, passedOver };
      // The PNG of a file whose SVG is too wide is just as wide.
      if (passedOver.length > seen) break;
    }
  }
  // The sources are tried in one order. When Wikimedia could not be asked,
  // going on to the icon services could store a lesser mark than it holds
  // (they pass on whatever the site serves, a web builder's own icon
  // included), so the domain waits for the next run instead.
  if (reach.failed) return { ext: null, passedOver, unsettled: true };
  for (const [url, source] of [
    [`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, 'google'],
    [`https://icons.duckduckgo.com/ip3/${domain}.ico`, 'duckduckgo'],
    [`https://icon.horse/icon/${domain}`, 'icon.horse'],
  ]) {
    const got = await tryUrl(url, source, { service: source !== 'icon.horse' });
    if (got) return { ...got, passedOver };
  }
  return { ext: null, passedOver, unsettled: reach.failed };
}

const domains = readDomains();
const list = existsSync(LIST) ? JSON.parse(readFileSync(LIST, 'utf8')) : {};
mkdirSync(OUT, { recursive: true });
const tmpRoot = mkdtempSync(path.join(tmpdir(), 'logos-'));
const fresh = [];
const unsettled = [];
const queue = [];

// Decisions made by hand: store the mark or the refusal, remember it, stop.
const placed = valuesOf('--place').map((value) => [cleanDomain(value.slice(0, value.indexOf('='))), value.slice(value.indexOf('=') + 1)]);
const refused = valuesOf('--none').flatMap((value) => value.split(',')).map(cleanDomain);
if (placed.length > 0 || refused.length > 0) {
  if (!note) throw new Error('say where the mark is from, or why there is none, with --note "..."');
  for (const [domain, file] of placed) {
    if (!domain || !existsSync(file)) throw new Error(`--place takes domain=file; "${domain}=${file}" is not one`);
    const info = await inspect(file);
    if (!info) throw new Error(`${file}: not an image this can store (an SVG must be self-contained and under ${MAX_SVG_BYTES} bytes)`);
    const ext = await store(domain, file, info);
    for (const other of ['png', 'svg']) if (other !== ext) rmSync(path.join(OUT, `${domain}.${other}`), { force: true });
    delete NONE[domain];
    KEPT[domain] = { ext, from: note };
    list[domain] = ext;
    console.log(`${domain}: ${ext}, placed by hand${aspect(info) > MAX_ASPECT ? ` (wide, ${aspect(info).toFixed(1)} to 1: look at it at 28 px)` : ''}`);
  }
  for (const domain of refused) {
    if (!domain) throw new Error('--none takes a domain');
    for (const ext of ['png', 'svg']) rmSync(path.join(OUT, `${domain}.${ext}`), { force: true });
    delete KEPT[domain];
    NONE[domain] = note;
    list[domain] = null;
    console.log(`${domain}: lettermark (${note})`);
  }
  const ordered = (object) => Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]));
  writeFileSync(DECISIONS, `${JSON.stringify({ _about: decisions._about, none: ordered(NONE), kept: ordered(KEPT) }, null, 1)}\n`);
  writeFileSync(LIST, `${JSON.stringify(ordered(list), null, 1)}\n`);
  rmSync(tmpRoot, { recursive: true, force: true });
  process.exit(0);
}

for (const domain of [...domains.keys()].sort()) {
  if (only && !only.has(domain)) continue;
  if (NONE[domain]) {
    for (const ext of ['png', 'svg']) rmSync(path.join(OUT, `${domain}.${ext}`), { force: true });
    list[domain] = null;
    continue;
  }
  if (KEPT[domain]) {
    if (!existsSync(path.join(OUT, `${domain}.${KEPT[domain].ext}`))) throw new Error(`${domain}: the hand-placed mark is missing from ${OUT}`);
    list[domain] = KEPT[domain].ext;
    continue;
  }
  if (!force && list[domain] && existsSync(path.join(OUT, `${domain}.${list[domain]}`))) continue;
  if (!force && !retry && !only && list[domain] === null) continue;
  queue.push(domain);
}

let next = 0;
async function worker(id) {
  const tmp = path.join(tmpRoot, String(id));
  mkdirSync(tmp);
  while (next < queue.length) {
    const domain = queue[next];
    next += 1;
    let got = { ext: null, passedOver: [], unsettled: true };
    try {
      got = await fetchOne(domain, domains.get(domain), tmp);
    } catch (error) {
      got.passedOver.push(`failed: ${error.message}`);
    }
    for (const ext of ['png', 'svg']) {
      if (got.ext !== ext) rmSync(path.join(OUT, `${domain}.${ext}`), { force: true });
    }
    // "None" is only written down when every source answered: a domain a
    // source could not be asked about is left untried, for the next run.
    if (got.ext || !got.unsettled) list[domain] = got.ext;
    else delete list[domain];
    if (got.ext) fresh.push(domain);
    else if (got.unsettled) unsettled.push(domain);
    const aside = got.passedOver.length > 0 ? ` [${[...new Set(got.passedOver)].join('; ')}]` : '';
    console.log(`${domain}: ${got.ext ? `${got.ext} from ${got.source}` : got.unsettled ? 'not settled, a source did not answer: run again' : 'nothing that fits, lettermark'}${aside}`);
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, (_, id) => worker(id)));
rmSync(tmpRoot, { recursive: true, force: true });

// A stored mark stays in the list; a domain found to have none stays only
// while the data names it. --prune drops the marks the data no longer names.
const kept = {};
for (const domain of Object.keys(list).sort()) {
  const named = domains.has(domain);
  const ext = list[domain];
  if (ext && existsSync(path.join(OUT, `${domain}.${ext}`)) && (named || !prune)) kept[domain] = ext;
  else if (named) kept[domain] = null;
  else if (ext && prune) rmSync(path.join(OUT, `${domain}.${ext}`), { force: true });
}
writeFileSync(LIST, `${JSON.stringify(kept, null, 1)}\n`);

if (sheet) {
  // Each new mark as the page draws it: 44 and 28 px on its light tile, over
  // a light and a dark page.
  const tile = (domain, px) => `<img src="${path.join(OUT, `${domain}.${kept[domain]}`)}" width="${px}" height="${px}" alt="">`;
  const cell = (domain) => `<figure><div class="light">${tile(domain, 44)}${tile(domain, 28)}</div><div class="dark">${tile(domain, 44)}${tile(domain, 28)}</div><figcaption>${domain}<br>${(domains.get(domain) ?? []).join(', ')}</figcaption></figure>`;
  const css = 'body{margin:0;padding:16px;font:11px system-ui,sans-serif;background:#888;color:#111;display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;width:150px}figure div{display:flex;gap:8px;align-items:center;padding:8px}.light{background:#f5f5f6}.dark{background:#0b0b0c}img{background:#fff;border-radius:6px;object-fit:contain;padding:5px;box-sizing:border-box}figcaption{padding:4px 2px;overflow-wrap:anywhere}';
  writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><title>New logos</title><style>${css}</style>${fresh.sort().map(cell).join('')}\n`);
  console.log(`\n${sheet}: ${fresh.length} new marks to look at.`);
}

const stored = Object.values(kept).filter(Boolean).length;
console.log(`\n${stored} stored, ${Object.keys(kept).length - stored} on the lettermark; the data names ${domains.size} domains. ${queue.length} fetched in this run.`);
if (unsettled.length > 0) console.log(`${unsettled.length} not settled because a source did not answer; run again for: ${unsettled.sort().join(',')}`);
