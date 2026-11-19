/**
 * Typed text inside a LIKE or ILIKE pattern. A person's "100%" or "a_b" means
 * those characters, not "anything": the pattern's own wildcards and the
 * escape character are made literal before the text goes into one.
 */

/** Text with its own LIKE wildcards made literal. */
export function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

/** The pattern for "contains this text". */
export function containing(text: string): string {
  return `%${likeLiteral(text)}%`;
}
