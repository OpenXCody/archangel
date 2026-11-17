import { useSyncExternalStore } from 'react';
import { writeStored } from './storage';

/**
 * The app's theme: dark by default, light by choice. The choice is kept in
 * this browser and applied as `data-theme` on <html>, which is what the
 * tokens in globals.css switch on. client/index.html applies the stored
 * choice before first paint; the key and values here must match it.
 */
export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'archangel.theme';
/** The browser chrome colour for each theme: --color-bg-base. */
const CHROME_COLOR: Record<Theme, string> = { dark: '#0f0f0f', light: '#f6f7f8' };

const listeners = new Set<() => void>();

export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME_COLOR[theme]);
  // With storage unavailable (private mode) the choice lasts for this page only.
  writeStored(STORAGE_KEY, theme);
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The theme in use, re-rendering the caller when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'dark');
}

// The pre-paint script in index.html runs before the theme-color tag exists.
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME_COLOR[currentTheme()]);
