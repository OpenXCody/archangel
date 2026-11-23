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
 * Type (the hierarchy pass, step 5). A page title is 40px / 600, a section
 * heading 20px / 600, body and values 15px / 400 (`text-sm`) in full or
 * secondary ink, meta 13px / 400 (`text-xs`) in the quietest. Numbers are
 * tabular and a text link is underlined in its own ink, 1px, 3px below the
 * words: both are the page's rules (globals.css).
 */

/** A label: a field's name, the word above a page's name, a column's heading. Small capitals in secondary ink. */
export const labelClass = 'text-[12px] font-medium uppercase leading-4 tracking-[0.08em] text-text-2';

/** A page's title. */
export const pageTitleClass = 'text-[40px] font-semibold leading-[1.1] tracking-tight text-text-1';

/** A section's heading, on the pages a person works in. */
export const sectionHeadingClass = 'text-xl font-semibold text-text-1';

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

/** "1 factory", "2,340 factories". */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
