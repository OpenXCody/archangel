// The theme's tokens (client/src/styles/globals.css): the eleven exist in both
// themes, the ink reaches 4.5:1 on both surfaces, neither theme is the other
// with its lightness flipped, and the Atlas's wheel has a hue for each of its
// twelve core groups in both. `npm run test:unit`. No browser.
//
//   node --import tsx --test tests/unit/theme.unit.ts
// prints the ratios it measured (the lines that begin "contrast").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
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

// The Atlas's wheel: the one place a kind of thing has a hue (components/atlas/). One for each of the twelve core
// groups on its centre ring, `--core-<slug>`, handed out by the `[data-core]` rules and read for the canvas by ink.ts.
const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = (JSON.parse(readFileSync(path.join(here, '..', '..', 'data', 'skills', 'atlas.json'), 'utf8')) as { core: string[] }).core;
/** The one of the twelve with no hue: a grey. */
const NO_HUE = 'workplace-safety';

/** A colour in OKLab, where a distance of 0.02 is about the least the eye sees. */
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
const chroma = (hex: string) => Math.hypot(oklab(hex)[1], oklab(hex)[2]);
/** How far round the colour circle two hues stand from each other, in degrees: 0 to 180. */
const turn = (a: string, b: string) => {
  const angle = (hex: string) => (Math.atan2(oklab(hex)[2], oklab(hex)[1]) * 180) / Math.PI;
  const d = Math.abs(angle(a) - angle(b)) % 360;
  return d > 180 ? 360 - d : d;
};

test('the wheel has twelve core groups, and Shop safety is one of them', () => {
  assert.equal(CORE.length, 12);
  assert.equal(new Set(CORE).size, 12);
  assert.ok(CORE.includes(NO_HUE));
});

for (const theme of ['dark', 'light'] as const) {
  test(`${theme}: each of the twelve core groups has a hue, as plain as the ink on both surfaces`, () => {
    const found = tokens(theme);
    for (const slug of CORE) {
      const hue = found.get(`--core-${slug}`);
      assert.ok(hue, `${theme} has no --core-${slug}`);
      // A hue is drawn as a line a pixel or two wide on the wheel, a 3px bar and a 2px ring in the list: no text is
      // set in it, but a line that thin has to read as plainly as small text does, so it is held to 4.5:1, as the ink is.
      for (const ground of ['--bg', '--surface']) {
        const ratio = contrast(hue, found.get(ground)!);
        assert.ok(ratio >= 4.5, `${theme}: --core-${slug} on ${ground} is ${ratio.toFixed(2)}:1, under 4.5:1`);
      }
    }
    // And no hue for a group that is not one of the twelve.
    const named = [...found.keys()].filter((name) => name.startsWith('--core-')).map((name) => name.slice('--core-'.length));
    assert.deepEqual(named.sort(), [...CORE].sort());
  });

  test(`${theme}: the hues are muted and of one lightness, and neighbours on the centre ring are told apart`, () => {
    const found = tokens(theme);
    const hues = CORE.map((slug) => found.get(`--core-${slug}`)!);
    const lightness = hues.map((hue) => oklab(hue)[0]);
    assert.ok(Math.max(...lightness) - Math.min(...lightness) <= 0.02, `${theme}: the hues span ${(Math.max(...lightness) - Math.min(...lightness)).toFixed(3)} of lightness`);
    const hued = CORE.filter((slug) => slug !== NO_HUE);
    assert.equal(hued.length, 11);
    // Tinted greys rather than a rainbow, yet each plainly a hue.
    for (const slug of hued) {
      const c = chroma(found.get(`--core-${slug}`)!);
      assert.ok(c >= 0.05 && c <= 0.1, `${theme}: --core-${slug} has a chroma of ${c.toFixed(3)}`);
    }
    // Round the centre ring, the last beside the first. Two hued neighbours stand a quarter turn of hue apart or more;
    // beside the grey a hue is told from it by being a hue.
    CORE.forEach((slug, k) => {
      const next = CORE[(k + 1) % CORE.length];
      const [a, b] = [hues[k], hues[(k + 1) % CORE.length]];
      if (slug === NO_HUE || next === NO_HUE) {
        assert.ok(apart(a, b) >= 0.06, `${theme}: ${slug} and ${next} are ${apart(a, b).toFixed(3)} apart`);
        return;
      }
      assert.ok(apart(a, b) >= 0.1, `${theme}: ${slug} and ${next} are ${apart(a, b).toFixed(3)} apart`);
      assert.ok(turn(a, b) >= 90, `${theme}: ${slug} and ${next} are ${turn(a, b).toFixed(0)} degrees of hue apart`);
    });
    // With the grey taken out, the eleven still part from their neighbours, and from the next but one.
    hued.forEach((slug, k) => {
      const hue = found.get(`--core-${slug}`)!;
      const next = found.get(`--core-${hued[(k + 1) % hued.length]}`)!;
      const second = found.get(`--core-${hued[(k + 2) % hued.length]}`)!;
      assert.ok(apart(hue, next) >= 0.1, `${theme}: ${slug} and the next hue are ${apart(hue, next).toFixed(3)} apart`);
      assert.ok(apart(hue, second) >= 0.08, `${theme}: ${slug} and its next hue but one are ${apart(hue, second).toFixed(3)} apart`);
    });
  });

  test(`${theme}: no core hue passes for the accent, which is a career's alone`, () => {
    const found = tokens(theme);
    for (const slug of CORE) {
      const d = apart(found.get(`--core-${slug}`)!, found.get('--accent')!);
      assert.ok(d >= 0.1, `${theme}: --core-${slug} is ${d.toFixed(3)} from the accent`);
    }
  });

  test(`${theme}: Shop safety has no hue of its own`, () => {
    assert.ok(chroma(tokens(theme).get(`--core-${NO_HUE}`)!) < 0.01);
  });
}

test('the stylesheet hands each core group its hue by its slug, and no other', () => {
  for (const slug of CORE) {
    assert.ok(css.includes(`[data-core='${slug}'] { --core-hue: var(--core-${slug}); }`), `no [data-core='${slug}'] rule`);
  }
  const rules = [...css.matchAll(/\[data-core='([a-z0-9-]+)'\]/g)].map((match) => match[1]);
  assert.deepEqual(rules.sort(), [...CORE].sort());
  // Each token is declared twice, once a theme, and used once, by its rule.
  for (const slug of CORE) assert.equal(css.split(`--core-${slug}`).length - 1, 3, `--core-${slug} is named ${css.split(`--core-${slug}`).length - 1} times`);
  // What takes a hue takes it through --core-hue, with ink where a group has none.
  const uses = [...css.matchAll(/var\(--core-hue[^)]*\)?\)/g)].map((match) => match[0]);
  assert.ok(uses.length > 0);
  for (const use of uses) assert.equal(use, 'var(--core-hue, var(--text-3))');
});

test("the old Atlas's sixteen domain hues are gone: no token, no rule, no swatch, in the stylesheet or any component", () => {
  const src = path.join(here, '..', '..', 'client', 'src');
  const left: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|css)$/.test(entry.name)) {
        const text = readFileSync(full, 'utf8');
        // `data-domain` as the old Atlas's attribute; another attribute that only begins with it is not it.
        for (const match of text.matchAll(/--domain-[a-z-]*|\[?data-domain(?![\w-])|domain-swatch|domainHue/g)) left.push(`${path.relative(src, full)}: ${match[0]}`);
      }
    }
  };
  walk(src);
  assert.deepEqual(left, []);
  for (const theme of ['dark', 'light'] as const) {
    assert.deepEqual([...tokens(theme).keys()].filter((name) => name.startsWith('--domain-')), []);
  }
});

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
