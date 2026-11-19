import type { KeyboardEvent } from 'react';

/**
 * Arrow keys for a tablist or a radio group built from buttons: Left/Up and
 * Right/Down move to the neighbouring option and choose it, Home and End go
 * to the ends. Put it on the group's own element; its options are the
 * `role="tab"` or `role="radio"` buttons inside. Pair it with a roving
 * tabindex (0 on the chosen option, -1 on the rest) so Tab enters the group
 * once.
 */
export function onGroupArrowKeys<T>(event: KeyboardEvent<HTMLElement>, values: readonly T[], current: T, choose: (value: T) => void): void {
  const step =
    event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
  const index = values.indexOf(current);
  let next: number;
  if (step !== 0) next = ((index === -1 ? (step === 1 ? -1 : 0) : index) + step + values.length) % values.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = values.length - 1;
  else return;
  event.preventDefault();
  if (next !== index) choose(values[next]);
  const options = event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"], [role="radio"]');
  options[next]?.focus();
}

/**
 * The same as an `onKeyDown` handler for the group: the next or previous
 * option is chosen and takes focus. Each button in the group takes
 * `tabIndex={selected ? 0 : -1}`, so the group is one tab stop.
 */
export function arrowKeyChoice<T extends string>(values: readonly T[], current: T, onChange: (value: T) => void) {
  return (event: KeyboardEvent<HTMLElement>) => onGroupArrowKeys(event, values, current, onChange);
}
