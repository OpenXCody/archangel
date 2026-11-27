import { shouts } from './displayName.js';

/**
 * How a place is written: "City, ST", in ordinary capitals, wherever one is
 * printed. The data's cities come as their sources wrote them, often in
 * capitals ("COSTA MESA"); a screen never shows one that way.
 */

/**
 * A city's name in ordinary capitals. "ROUND ROCK" and "round rock" are "Round
 * Rock"; "MCHENRY" is "McHenry", "O'FALLON" "O'Fallon" and "BOSTON (BRIGHTON)"
 * "Boston (Brighton)". A name that already
 * mixes capitals and small letters is kept as it was written ("McGregor",
 * "DeSoto", "Coeur d'Alene"), unless it still shouts ("McALLEN").
 */
export function titleCase(text: string): string {
  const name = text.trim().replace(/\s+/g, ' ');
  if (/[a-z]/.test(name) && /[A-Z]/.test(name) && !shouts(name)) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase())
    .replace(/\b(Mc|[A-Z]')([a-z])(?=[a-z]{2})/g, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

/**
 * "Austin, TX": the one way a place is written, from a city as the source data has it. A city some source wrote with
 * its state ("KINGSVILLE, TX") says the state once.
 */
export function cityState(city: string | null | undefined, state: string | null | undefined): string {
  const code = (state ?? '').trim();
  const town = (city ?? '').trim();
  const alone = code && town.toLowerCase().endsWith(`, ${code.toLowerCase()}`) ? town.slice(0, -code.length - 2).trim() : town;
  return [alone ? titleCase(alone) : null, state].filter(Boolean).join(', ');
}
