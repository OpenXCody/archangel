// The theme's tokens (client/src/styles/globals.css): the eleven exist in both
// themes, the ink reaches 4.5:1 on both surfaces, and neither theme is the
// other with its lightness flipped. `npm run test:unit`. No browser.
//
//   node --import tsx --test tests/unit/theme.unit.ts
// prints the ratios it measured (the lines that begin "contrast").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'src', 'styles', 'globals.css'), 'utf8');

const ELEVEN = ['--bg', '--surface', '--surface-hover', '--line', '--line-strong', '--text-1', '--text-2', '--text-3', '--accent', '--inverse-bg', '--inverse-text'];

type Theme = 'dark' | 'light';

/** The custom properties a theme's `:root` block declares. */
function tokens(theme: Theme): Map<string, string> {
  const block = theme === 'light' ? /:root\[data-theme='light'\]\s*\{([^}]*)\}/ : /:root\s*\{([^}]*)\}/;
  const body = (css.match(block)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  const found = new Map<string, string>();
  for (const match of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) found.set(match[1], match[2].trim());
  return found;
}

function channels(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(match, `${hex} is not a six-digit hex colour`);
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

for (const theme of ['dark', 'light'] as const) {
  test(`${theme}: the eleven tokens are each a hex colour`, () => {
    const found = tokens(theme);
    for (const name of ELEVEN) {
      assert.ok(found.has(name), `${theme} has no ${name}`);
      channels(found.get(name)!);
    }
  });

  test(`${theme}: the ink reaches 4.5:1 on the canvas and on the raised surface`, () => {
    const found = tokens(theme);
    for (const ink of ['--text-1', '--text-2', '--text-3']) {
      for (const ground of ['--bg', '--surface']) {
        const ratio = contrast(found.get(ink)!, found.get(ground)!);
        console.log(`contrast ${theme.padEnd(5)} ${ink} on ${ground.padEnd(9)} ${ratio.toFixed(2)}:1`);
        assert.ok(ratio >= 4.5, `${theme}: ${ink} on ${ground} is ${ratio.toFixed(2)}:1, under 4.5:1`);
      }
    }
  });

  test(`${theme}: a primary button's words and an error read on their grounds`, () => {
    const found = tokens(theme);
    assert.ok(contrast(found.get('--inverse-text')!, found.get('--inverse-bg')!) >= 4.5);
    // The danger colour is set once per theme, beside the eleven.
    const danger = found.get('--danger') ?? tokens('dark').get('--danger')!;
    for (const ground of ['--bg', '--surface']) assert.ok(contrast(danger, found.get(ground)!) >= 4.5, `${theme}: --danger on ${ground}`);
  });
}

// The Atlas's domains: the one place a kind of thing has a hue (components/atlas/, the `[data-domain]` rules).
const taxonomy = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'skills', 'taxonomy.json'), 'utf8')) as { domains: { slug: string }[] };
const DOMAINS = taxonomy.domains.map((domain) => domain.slug);

/** How far apart two colours are to the eye: the distance in OKLab, where 0.02 is about the least seen. */
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const apart = (a: string, b: string) => Math.hypot(...oklab(a).map((value, i) => value - oklab(b)[i]));

for (const theme of ['dark', 'light'] as const) {
  test(`${theme}: every domain of the taxonomy has a hue, legible as its 10px name on the rim on both surfaces`, () => {
    const found = tokens(theme);
    for (const slug of DOMAINS) {
      const hue = found.get(`--domain-${slug}`);
      assert.ok(hue, `${theme} has no --domain-${slug}`);
      // A domain's name is small text (10 to 12.5px) in its hue: 4.5:1, as for the ink.
      for (const ground of ['--bg', '--surface']) {
        const ratio = contrast(hue, found.get(ground)!);
        assert.ok(ratio >= 4.5, `${theme}: --domain-${slug} on ${ground} is ${ratio.toFixed(2)}:1, under 4.5:1`);
      }
    }
    // And no hue for a domain the taxonomy does not have.
    const named = [...found.keys()].filter((name) => name.startsWith('--domain-')).map((name) => name.slice('--domain-'.length));
    assert.deepEqual(named.sort(), [...DOMAINS].sort());
  });

  test(`${theme}: the hues are muted and near one lightness, and neighbours on the plate are told apart`, () => {
    const found = tokens(theme);
    const hues = DOMAINS.map((slug) => found.get(`--domain-${slug}`)!);
    const lightness = hues.map((hue) => oklab(hue)[0]);
    assert.ok(Math.max(...lightness) - Math.min(...lightness) <= 0.1, `${theme}: the hues span ${(Math.max(...lightness) - Math.min(...lightness)).toFixed(3)} of lightness`);
    for (const hue of hues) assert.ok(Math.hypot(oklab(hue)[1], oklab(hue)[2]) <= 0.12, `${theme}: ${hue} is not muted`);
    // Round the plate, the last beside the first: each domain is far from its neighbour, and clear of the next but one.
    hues.forEach((hue, i) => {
      const next = hues[(i + 1) % hues.length];
      const second = hues[(i + 2) % hues.length];
      assert.ok(apart(hue, next) >= 0.08, `${theme}: ${DOMAINS[i]} and ${DOMAINS[(i + 1) % hues.length]} are ${apart(hue, next).toFixed(3)} apart`);
      assert.ok(apart(hue, second) >= 0.06, `${theme}: ${DOMAINS[i]} and its next but one are ${apart(hue, second).toFixed(3)} apart`);
      // No hue passes for the accent, which keeps its meaning on the plate.
      assert.ok(apart(hue, found.get('--accent')!) >= 0.08, `${theme}: ${DOMAINS[i]} is ${apart(hue, found.get('--accent')!).toFixed(3)} from the accent`);
    });
  });

  test(`${theme}: Safety has no hue of its own`, () => {
    const safety = oklab(tokens(theme).get('--domain-safety')!);
    assert.ok(Math.hypot(safety[1], safety[2]) < 0.03);
  });
}

test('each theme is set by hand: light is not dark with its lightness flipped', () => {
  const dark = tokens('dark');
  const light = tokens('light');
  // Were one made from the other, every channel of every token would mirror: c -> 255 - c.
  const mirrored = ELEVEN.filter((name) => {
    const a = channels(dark.get(name)!);
    const b = channels(light.get(name)!);
    return a.every((value, index) => value + b[index] === 255);
  });
  assert.deepEqual(mirrored, []);
});

test('a surface is one of two: the canvas and the one raised fill', () => {
  for (const theme of ['dark', 'light'] as const) {
    const found = tokens(theme);
    const fills = [...found.keys()].filter((name) => /^--(bg|surface)/.test(name));
    assert.deepEqual(fills.sort(), ['--bg', '--surface', '--surface-hover']);
  }
});
