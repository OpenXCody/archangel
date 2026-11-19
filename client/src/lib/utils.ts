import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes with conflict resolution (shadcn convention). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * The outline a link or button shows when the keyboard reaches it. Every
 * interactive element has it from the page's own rule (`:focus-visible` in
 * globals.css): this says the same thing where a component wants it written.
 */
export const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/*
 * States (the hierarchy pass, step 4). A state is carried by ink, a mark or a
 * line, never by a darker grey fill.
 */

/** A segmented control's frame: a hairline around the choices. */
export const segmentedClass = 'rounded-lg border border-line p-0.5';

/** One choice of a segmented control: the chosen one is the inverse pair, the rest are secondary ink on nothing. */
export const segmentClass = (selected: boolean): string =>
  selected ? 'bg-inverse-bg font-medium text-inverse-text' : 'text-text-2 hover:text-text-1';

/**
 * An option tile (Appearance, This account is for, View as): the chosen one
 * has a 2px edge in full ink and no fill. The second pixel is drawn inside
 * the tile, so choosing one moves nothing.
 */
export const optionTileClass = (selected: boolean): string =>
  cn(
    'rounded-lg border text-left transition-colors',
    selected ? 'border-text-1 shadow-[inset_0_0_0_1px_var(--text-1)]' : 'border-line-strong hover:bg-surface-hover'
  );
/** An option tile's title and the line under it. */
export const optionTitleClass = (selected: boolean): string => (selected ? 'text-text-1' : 'text-text-2');
export const optionDetailClass = (selected: boolean): string => (selected ? 'text-text-2' : 'text-text-3');

/** "1 plant", "2,340 plants". */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
