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
