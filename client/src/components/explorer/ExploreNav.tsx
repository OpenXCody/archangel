import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { EntityCounts, EntityType } from '../../lib/api';

/** What can be browsed as a list. People records are admin-only and never listed here. */
export type BrowseTab = Exclude<EntityType, 'persons'>;
export type ExploreView = 'overview' | BrowseTab;

export const BROWSE_LABEL: Record<BrowseTab, string> = {
  companies: 'Companies',
  factories: 'Factories',
  occupations: 'Careers',
  skills: 'Skills',
  refs: 'Elements',
  schools: 'Schools',
  programs: 'Programs',
};

const PRIMARY: ExploreView[] = ['overview', 'companies', 'factories', 'occupations', 'skills'];
/** A phone's row holds one item fewer: this list moves behind "More" there. */
export const FOLDED_ON_PHONE: BrowseTab = 'skills';
/** The lists behind "More". */
export const MORE_TABS: BrowseTab[] = ['refs', 'schools', 'programs'];

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
/** "More" while the list folded behind it on a phone is the current one: on there, off from sm up. */
const ITEM_ON_PHONE =
  'border-fg-default font-semibold text-fg-default sm:border-transparent sm:font-normal sm:text-fg-muted sm:hover:text-fg-default';

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
export default function ExploreNav({ active, counts }: { active: ExploreView; counts?: EntityCounts }) {
  const inMore = MORE_TABS.includes(active as BrowseTab);
  const moreLabel = inMore ? label(active) : 'More';

  // On the narrowest phones the row is wider than the screen and scrolls
  // sideways inside itself: bring the current view into sight.
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    // The first one that is on screen: a folded item is marked too, but takes no room.
    const current = [...nav.querySelectorAll<HTMLElement>('[data-current="true"]')].find((el) => el.offsetWidth > 0);
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
      {PRIMARY.map((view) => {
        const on = view === active;
        return (
          <Link
            key={view}
            to={exploreHref(view)}
            aria-current={on ? 'page' : undefined}
            data-current={on}
            className={cn(ITEM, on ? ITEM_ON : ITEM_OFF, view === FOLDED_ON_PHONE && 'hidden sm:inline-flex')}
          >
            {label(view)}
            <Reserve text={label(view)} />
          </Link>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More lists"
            data-current={inMore || active === FOLDED_ON_PHONE}
            className={cn(ITEM, inMore ? ITEM_ON : active === FOLDED_ON_PHONE ? ITEM_ON_PHONE : ITEM_OFF)}
          >
            <span className="inline-flex items-center gap-1">
              {/* A phone has no room for the longer name here: the list names itself above its rows. */}
              <span className="sm:hidden">More</span>
              <span className="hidden sm:inline">{moreLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-fg-soft" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          {[FOLDED_ON_PHONE, ...MORE_TABS].map((view) => (
            <DropdownMenuItem
              key={view}
              asChild
              className={cn('min-h-11 cursor-pointer gap-3 sm:min-h-9', view === FOLDED_ON_PHONE && 'sm:hidden')}
            >
              <Link to={exploreHref(view)} aria-current={view === active ? 'page' : undefined}>
                <span className={cn('flex-1', view === active && 'font-semibold')}>{label(view)}</span>
                {counts && counts[view] > 0 && (
                  <span className="text-xs tabular-nums text-fg-soft">{counts[view].toLocaleString()}</span>
                )}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
