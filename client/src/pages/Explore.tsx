import { Fragment, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../lib/api';
import { readStored, writeStored } from '../lib/storage';
import { PageContainer, PageHeader } from '../components/layout/Page';
import ExploreNav, { isBrowseTab, type BrowseTab, type ExploreView } from '../components/explorer/ExploreNav';
import ExploreOverview from '../components/explorer/ExploreOverview';
import BrowseList, { LIST_NOUN, counted } from '../components/explorer/BrowseList';
import IndustryList from '../components/explorer/IndustryList';
import { publicKeys } from '../lib/queryKeys';

const FIGURES: BrowseTab[] = ['companies', 'factories', 'occupations', 'skills'];

/**
 * The overview's first line: how much is here, of each kind. Holds its place
 * while the figures load, and is left out if they cannot be had.
 */
function Figures() {
  const counts = useQuery({
    queryKey: publicKeys.counts,
    queryFn: statsApi.counts,
    staleTime: 1000 * 60 * 10,
  });
  if (counts.isError) return null;
  const parts = counts.data ? FIGURES.filter((key) => counts.data[key] > 0) : [];
  return (
    <p className="mt-4 text-sm tabular-nums text-fg-muted [text-wrap:balance] sm:mt-5 sm:text-base" data-explore-figures>
      {!counts.data ? (
        <span aria-hidden="true" className="inline-block h-3.5 w-72 max-w-full animate-pulse rounded bg-primary/10 align-middle" />
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
function View({ view }: { view: ExploreView }) {
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
 * Explore: an overview of what is here (/explore), and behind it each level
 * of the product as a tab: the industries (/industries), then a list of every
 * company, plant, career and skill (/explore?tab=companies, factories,
 * occupations, skills). One heading and one tab row for all of them; the tab
 * row sits straight under the heading, so it is in the same place on every
 * view. What a view holds is said by the view, as its first line: the four
 * figures on the overview, a list's own count under its filters.
 */
export default function Explore() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const view: ExploreView = pathname.startsWith('/industries') ? 'industries' : isBrowseTab(tab) ? tab : 'overview';

  return (
    <PageContainer>
      <PageHeader title="Explore" className="mb-2 sm:mb-4" />
      <ExploreNav active={view} />
      <View key={view} view={view} />
    </PageContainer>
  );
}
