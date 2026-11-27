import { STATE_CODE_TO_NAME, US_STATES } from '@shared/states';

/** How places are written. The states themselves are in shared/states.ts. */

const NAME_BY_CODE: Record<string, string | undefined> = STATE_CODE_TO_NAME;

/** "Texas" for "TX". A code that is not a state comes back as it was given. */
export function stateName(code: string): string {
  return NAME_BY_CODE[code] ?? code;
}

/** "TX" for "Texas": the code of a state written out in full. */
export const STATE_CODE_BY_NAME: Record<string, string> = Object.fromEntries(US_STATES.map((state) => [state.name, state.code]));

/**
 * "ROUND ROCK" as "Round Rock", and "Austin, TX": the one way a place is written (shared/places.ts, which the
 * server's search writes its lines with too). Every screen that prints a place does it through these.
 */
export { cityState, titleCase } from '@shared/places';
