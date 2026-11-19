import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { EntityType } from '../../lib/api';

/** What can be browsed as a list. */
export type BrowseTab = EntityType;
/** A view of Explore: the overview, the industries, one of the lists, or the skills drawn as the Atlas. */
export type ExploreView = 'overview' | 'industries' | BrowseTab | 'atlas';

/** A tab of the row. The Atlas has none of its own: it is the Skills tab's other view (`SkillsViewSwitch`). */
type ExploreTab = Exclude<ExploreView, 'atlas'>;

const BROWSE_LABEL: Record<BrowseTab, string> = {
  companies: 'Companies',
  factories: 'Plants',
  occupations: 'Careers',
  skills: 'Skills',
};

// The order the product is explored in: an industry, its companies, their plants, the careers there, their skills.
const VIEWS: ExploreTab[] = ['overview', 'industries', 'companies', 'factories', 'occupations', 'skills'];

export const isBrowseTab = (value: string | null): value is BrowseTab =>
  value !== null && Object.prototype.hasOwnProperty.call(BROWSE_LABEL, value);

/** A view's address. Industries keep their own (/industries), where their pages hang; the lists are tabs of /explore. */
export const exploreHref = (view: ExploreView) =>
  view === 'overview' ? '/explore' : view === 'industries' ? '/industries' : view === 'atlas' ? '/atlas' : `/explore?tab=${view}`;

const exploreLabel = (view: ExploreTab) =>
  view === 'overview' ? 'Overview' : view === 'industries' ? 'Industries' : BROWSE_LABEL[view];

// The current view is heavier and underlined. Every label reserves its heavier
// width (the hidden copy), so choosing one never nudges its neighbours.
const ITEM =
  'relative inline-flex h-11 shrink-0 flex-col items-center justify-center border-b-2 text-sm transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-primary';
const ITEM_ON = 'border-fg-default font-semibold text-fg-default';
const ITEM_OFF = 'border-transparent text-fg-muted hover:text-fg-default';

function Reserve({ text }: { text: string }) {
  return (
    <span aria-hidden="true" className="invisible block h-0 overflow-hidden font-semibold">
      {text}
    </span>
  );
}

/** How far the row fades at an edge it continues past. */
const FADE = '2.5rem';

/**
 * The Explore page's own navigation: the overview, then each level of the
 * product. Plain text; position on the page and weight say where you are.
 *
 * Six labels do not fit a phone. The row then scrolls sideways inside itself,
 * the current view is brought into sight, and an edge with more beyond it
 * fades out, so a label is never cut mid-word against the screen's edge.
 */
export default function ExploreNav({ active }: { active: ExploreView }) {
  const navRef = useRef<HTMLElement>(null);
  const [more, setMore] = useState({ before: false, after: false });

  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const before = nav.scrollLeft > 1;
    const after = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
    setMore((current) => (current.before === before && current.after === after ? current : { before, after }));
  }, []);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (nav.scrollWidth > nav.clientWidth) {
      const current = nav.querySelector<HTMLElement>('[aria-current="page"]');
      // Centred where there is room to; the first and the last rest against their edge.
      if (current) nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
    }
    measure();
  }, [active, measure]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [measure]);

  const mask =
    more.before || more.after
      ? `linear-gradient(to right, ${more.before ? 'transparent' : '#000'}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${more.after ? 'transparent' : '#000'})`
      : undefined;

  return (
    // The hairline belongs to the frame, so it runs the full width while the labels fade.
    <div className="border-b border-border-subtle">
      <nav
        ref={navRef}
        aria-label="Explore"
        onScroll={measure}
        data-more-before={more.before || undefined}
        data-more-after={more.after || undefined}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        // The current view's underline sits on the frame's hairline.
        className="-mb-px flex items-center justify-between gap-x-6 overflow-x-auto [scrollbar-width:none] sm:justify-start sm:gap-x-8 [&::-webkit-scrollbar]:hidden"
      >
        {VIEWS.map((view) => {
          // The Atlas is the skills, drawn: the Skills tab is where it lives.
          const on = view === (active === 'atlas' ? 'skills' : active);
          return (
            <Link key={view} to={exploreHref(view)} aria-current={on ? 'page' : undefined} className={cn(ITEM, on ? ITEM_ON : ITEM_OFF)}>
              {exploreLabel(view)}
              <Reserve text={exploreLabel(view)} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
