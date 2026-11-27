import { cn, focusRing } from '@/lib/utils';
import type { Occupation } from '../../lib/api';
import { pageWidthClass } from '../layout/Page';

/*
 * What the Atlas's page and its sheet share: the one button, the gutter that
 * keeps clear of a phone's rounded corners, the bar's width, and how a career
 * is named.
 */

/** The Atlas's one button: the bar's, the sheet's two, and "Whole atlas". */
export const ATLAS_BUTTON = cn(
  'inline-flex min-h-9 items-center gap-2 rounded-lg border border-line-strong px-3 py-1.5 text-xs text-text-1 transition-colors hover:bg-surface-hover',
  focusRing
);

/** Sixteen pixels at each side, or the screen's own safe inset where that is more. */
export const GUTTER = 'pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]';

/**
 * The bar's width: the page's own (the two edges Explore's tab row stands on, `pageWidthClass`), its gutters giving
 * way to the screen's safe inset where that is more (a phone lying down, where the tab row is not shown).
 */
export const BAR_WIDTH = cn(
  pageWidthClass,
  'pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]',
  'sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))]'
);

/** A military career by the service's own title, where its kind and code stand beside it; any other by its title. */
export const careerName = (career: Pick<Occupation, 'title' | 'officialTitle' | 'kind'>): string => (career.kind && career.officialTitle) || career.title;
