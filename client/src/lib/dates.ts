/** How days are written, and the arithmetic behind them. */

export const DAY_MS = 86_400_000;

/** Whole days from the day of `date` to today, by this browser's calendar: 0 today, 1 yesterday, negative ahead. */
export function daysSince(date: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);
}

/**
 * The one way a day is written on a job's page and the account pages:
 * "today", "yesterday", then "Nov 18", with the year only once it is not this
 * one. (The time of day is given in History alone.)
 */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = daysSince(date);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

/** The same, after a verb: "declined today", "declined on Nov 18". */
export function formatOnDay(iso: string): string {
  const day = formatDay(iso);
  return day === 'today' || day === 'yesterday' || !day ? day : `on ${day}`;
}

/** The same, to stand at the start of a line: "Today". */
export function formatDayCapital(iso: string): string {
  const day = formatDay(iso);
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/**
 * How long ago, for the list of open jobs alone: "today", "yesterday",
 * "5 days ago", then "on Nov 16, 2026" once it is a month old (always with
 * the year).
 */
export function formatAgo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = daysSince(date);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
