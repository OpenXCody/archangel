/**
 * A list's page size from the query string: at least 1, at most `max`.
 * Without the lower bound a negative limit reached the database as "no limit"
 * and one request returned a whole table.
 */
export function pageLimit(raw: unknown, fallback: number, max: number): number {
  const parsed = parseInt(String(raw ?? ''), 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : fallback, 1), max);
}

/** An `offset` query value as a whole number from 0 to a million. */
export function pageOffset(raw: unknown): number {
  const parsed = parseInt(String(raw ?? ''), 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 0, 0), 1_000_000);
}
