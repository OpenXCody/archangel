import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { EntityType } from '../../lib/api';

/** What can be browsed as a list. */
export type BrowseTab = EntityType;
export type ExploreView = 'overview' | BrowseTab;

export const BROWSE_LABEL: Record<BrowseTab, string> = {
  companies: 'Companies',
  factories: 'Factories',
  occupations: 'Careers',
  skills: 'Skills',
};

const VIEWS: ExploreView[] = ['overview', 'companies', 'factories', 'occupations', 'skills'];

export const isBrowseTab = (value: string | null): value is BrowseTab =>
  value !== null && Object.prototype.hasOwnProperty.call(BROWSE_LABEL, value);

export const exploreHref = (view: ExploreView) => (view === 'overview' ? '/explore' : `/explore?tab=${view}`);

const label = (view: ExploreView) => (view === 'overview' ? 'Overview' : BROWSE_LABEL[view]);

// The current view is heavier and underlined. Every label reserves its heavier
// width (the hidden copy), so choosing one never nudges its neighbours.
const ITEM =
  'relative inline-flex h-11 shrink-0 flex-col items-center justify-center border-b-2 text-[13px] transition-colors xs:text-sm ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';
const ITEM_ON = 'border-fg-default font-semibold text-fg-default';
const ITEM_OFF = 'border-transparent text-fg-muted hover:text-fg-default';

function Reserve({ text }: { text: string }) {
  return (
    <span aria-hidden="true" className="invisible block h-0 overflow-hidden font-semibold">
      {text}
    </span>
  );
}

/**
 * The Explore page's own navigation: the overview, then each list. Plain
 * text; position on the page and weight say where you are.
 */
export default function ExploreNav({ active }: { active: ExploreView }) {
  // On the narrowest phones the row is wider than the screen and scrolls
  // sideways inside itself: bring the current view into sight.
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const current = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;
    nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label="Explore"
      // The hairline is an inset shadow so the current view's underline sits on it, inside the scroll box.
      className="relative flex items-center justify-between gap-x-2 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border-subtle)] [scrollbar-width:none] sm:justify-start sm:gap-x-8 [&::-webkit-scrollbar]:hidden"
    >
      {VIEWS.map((view) => {
        const on = view === active;
        return (
          <Link key={view} to={exploreHref(view)} aria-current={on ? 'page' : undefined} className={cn(ITEM, on ? ITEM_ON : ITEM_OFF)}>
            {label(view)}
            <Reserve text={label(view)} />
          </Link>
        );
      })}
    </nav>
  );
}
