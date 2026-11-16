/**
 * How the search shortcut is written on this machine: "⌘K" on Apple
 * hardware, "Ctrl K" everywhere else. Both keys open search on every machine;
 * this is only what the hint says.
 */
const APPLE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');

export const SEARCH_SHORTCUT = APPLE ? '⌘K' : 'Ctrl K';
