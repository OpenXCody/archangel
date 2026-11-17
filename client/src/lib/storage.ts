/**
 * Browser storage that never throws.
 *
 * A browser can refuse storage outright (private mode, "block all cookies",
 * an embedded view): then even naming `localStorage` throws. Here a read
 * answers "nothing stored" and a write is dropped, so the page works and
 * simply does not remember. Every read and write in the client goes through
 * these.
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

export function writeStored(key: string, value: string, kind: Area = 'local'): void {
  try {
    area(kind).setItem(key, value);
  } catch {
    // Not remembered beyond this page.
  }
}

export function removeStored(key: string, kind: Area = 'local'): void {
  try {
    area(kind).removeItem(key);
  } catch {
    // Nothing was stored.
  }
}
