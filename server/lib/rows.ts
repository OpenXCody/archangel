/**
 * Reading what `db.execute` returns. A hand-written statement comes back as
 * the driver's own list of rows, which the type system knows nothing about:
 * these make it an array and read one column as text or as a number.
 */

export type Row = Record<string, unknown>;

/** The rows of a `db.execute` result, as an array. `T` is what the statement selects. */
export function rowsOf<T = Row>(result: unknown): T[] {
  return Array.from(result as Iterable<T>);
}

/** A column as text, or null when it is not text or is blank. */
export const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** A column as a number, or 0 when it is not one. */
export const int = (value: unknown): number => Number(value) || 0;
