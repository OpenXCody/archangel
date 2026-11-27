import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../lib/api';
import { readStored, writeStored } from '../lib/storage';
import { cn } from '@/lib/utils';
import { PageContainer, PageHeader, pageWidthClass } from '../components/layout/Page';
import ExploreNav, { isBrowseTab, type BrowseTab, type ExploreView } from '../components/explorer/ExploreNav';
import ExploreOverview from '../components/explorer/ExploreOverview';
import BrowseList, { LIST_NOUN, counted } from '../components/explorer/BrowseList';
import IndustryList from '../components/explorer/IndustryList';
import { publicKeys } from '../lib/queryKeys';
import { useTaxonomy } from '../lib/queries';

// The Atlas is its own chunk: the lists do not carry the drawing.
const Atlas = lazy(() => import('../components/atlas/Atlas'));

const FIGURES: BrowseTab[] = ['companies', 'factories', 'occupations', 'skills'];

/**
 * The overview's first line: how much is here, of each kind. Holds its place
 * while the figures load, and is left out if they cannot be had.
 */
function Figures() {
  const counts = useQuery({
    queryKey: publicKeys.counts,
    queryFn: statsApi.counts,
    staleTime: 10 * 60_000,
  });
  if (counts.isError) return null;
  const parts = counts.data ? FIGURES.filter((key) => counts.data[key] > 0) : [];
  return (
    <p className="mt-4 text-sm tabular-nums text-text-2 [text-wrap:balance] sm:mt-5 sm:text-base" data-explore-figures>
      {!counts.data ? (
        <span aria-hidden="true" className="inline-block h-3.5 w-72 max-w-full animate-pulse rounded bg-surface align-middle" />
      ) : (
        parts.map((key, i) => (
          // Each figure stays whole when the line wraps, and no line starts with a separator.
          <Fragment key={key}>
            <span className="whitespace-nowrap">
              {counted(counts.data[key], LIST_NOUN[key])}
              {i < parts.length - 1 && ' ·'}
            </span>{' '}
          </Fragment>
        ))
      )}
    </p>
  );
}

/**
 * Browser Back from a detail page should land where you left the page.
 * Native restoration cannot: the content has no height until it has loaded.
 * So remember scrollY per view and put it back once the page is tall enough.
 * Arriving by a link is a fresh visit: it starts at the top.
 */
function useScrollMemory(key: string) {
  const arrivedBy = useNavigationType();
  const [saved] = useState(() => Number(readStored(key, 'session') || 0));
  // While navigating away the document shrinks and the browser clamps scrollY
  // before the cleanup runs, so only trust readings taken at (roughly) full
  // height and write the last trusted one on the way out.
  const lastGood = useRef({ y: 0, h: 0 });
  useEffect(() => {
    lastGood.current = { y: window.scrollY, h: document.documentElement.scrollHeight };
    const onScroll = () => {
      const h = document.documentElement.scrollHeight;
      if (h < lastGood.current.h * 0.6) return; // a clamp during a route change, not a real scroll
      lastGood.current = { y: window.scrollY, h };
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      writeStored(key, String(lastGood.current.y), 'session');
    };
  }, [key]);
  useEffect(() => {
    // POP is Back, Forward or a reload; anything else is a link that was followed.
    if (arrivedBy !== 'POP') {
      window.scrollTo(0, 0);
      return;
    }
    if (!saved) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      if (document.documentElement.scrollHeight - window.innerHeight >= saved) {
        window.scrollTo(0, saved);
        return;
      }
      if (tries++ < 40) timer = setTimeout(attempt, 50);
    };
    attempt();
    return () => clearTimeout(timer);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** One view of the page; remounted per view so each remembers its own scroll. */
function View({ view }: { view: Exclude<ExploreView, 'atlas'> }) {
  useScrollMemory(`explore.scroll.${view}`);
  if (view === 'overview') {
    return (
      <>
        <Figures />
        <ExploreOverview />
      </>
    );
  }
  if (view === 'industries') return <IndustryList />;
  return <BrowseList tab={view} />;
}

/**
 * The Atlas: a working view like the map, as tall as the window under the
 * header, never a scrolling page. Explore's tab row stays over it, on the
 * same two edges as on the other views, so the person is still in Explore,
 * and gives its place up on a screen too short to spare it. Its one request,
 * the taxonomy, is asked for here, at once, so it travels while the drawing's
 * code is fetched rather than after it.
 */
function AtlasView() {
  useTaxonomy();
  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col overflow-hidden" data-atlas-page>
      {/* In the page's width, where the tab row stands on Explore's other views. */}
      <div className={cn(pageWidthClass, '[@media(max-height:519px)]:hidden')}>
        <ExploreNav active="atlas" />
      </div>
      <Suspense fallback={<div aria-busy="true" aria-label="Loading" className="flex-1" />}>
        <Atlas />
      </Suspense>
    </div>
  );
}

/**
 * Explore: an overview of what is here (/explore), and behind it each level
 * of the product as a tab: the industries (/industries), then a list of every
 * company, factory, career and skill (/explore?tab=companies, factories,
 * occupations, skills). The skills are also drawn, as the Atlas (/atlas),
 * under the Skills tab: a view as tall as the window, with the tab row and no
 * heading over it. One heading and one tab row for the rest; the tab row sits
 * straight under the heading, so it is in the same place on each of them.
 * What a view holds is said by the view, as its first line: the four figures
 * on the overview, a list's own count under its filters.
 */
export default function Explore() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const view: ExploreView = pathname.startsWith('/industries')
    ? 'industries'
    : pathname === '/atlas'
      ? 'atlas'
      : isBrowseTab(tab)
        ? tab
        : 'overview';

  if (view === 'atlas') return <AtlasView />;
  return (
    // The Factories list stands in four columns on a very wide screen, and the page is wider for it there.
    <PageContainer className={view === 'factories' ? 'min-[1600px]:max-w-[96rem]' : undefined}>
      <PageHeader title="Explore" className="mb-2 sm:mb-4" />
      <ExploreNav active={view} />
      <View key={view} view={view} />
    </PageContainer>
  );
}
