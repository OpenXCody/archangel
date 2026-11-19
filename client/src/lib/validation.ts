/** Checks a form runs before it sends anything. The server applies the same rules and has the last word. */

/** An email address, as the server reads one (`normalizeEmail` in server/lib/auth.ts). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether the text is a record's id. */
export function isUuid(text: string): boolean {
  return UUID_RE.test(text);
}
