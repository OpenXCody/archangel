/**
 * Browser storage that never throws.
 *
 * A browser can refuse storage outright (private mode, "block all cookies",
 * an embedded view): then even naming `localStorage` throws. Here a read
 * answers "nothing stored" and a write is dropped, so the page works and
 * simply does not remember. Every read and write in the client goes through
 * these; the one exception is the theme script in client/index.html, which
 * runs before any module and so cannot import them.
 */
type Area = 'local' | 'session';

function area(kind: Area): Storage {
  return kind === 'local' ? window.localStorage : window.sessionStorage;
}

export function readStored(key: string, kind: Area = 'local'): string | null {
  try {
    return area(kind).getItem(key);
  } catch {
    return null;
  }
}

/** Whether the value was stored. Most callers do not need to know. */
export function writeStored(key: string, value: string, kind: Area = 'local'): boolean {
  try {
    area(kind).setItem(key, value);
    return true;
  } catch {
    // Not remembered beyond this page.
    return false;
  }
}

export function removeStored(key: string, kind: Area = 'local'): void {
  try {
    area(kind).removeItem(key);
  } catch {
    // Nothing was stored.
  }
}
