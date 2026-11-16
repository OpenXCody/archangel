import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigationType, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { statsApi, type EntityCounts } from '../lib/api';
import { PageContainer, PageHeader } from '../components/layout/Page';
import ExploreNav, { isBrowseTab, type ExploreView } from '../components/explorer/ExploreNav';
import ExploreOverview from '../components/explorer/ExploreOverview';
import BrowseList from '../components/explorer/BrowseList';

const FIGURES: { key: 'companies' | 'factories' | 'occupations' | 'skills'; one: string; many: string }[] = [
  { key: 'companies', one: 'company', many: 'companies' },
  { key: 'factories', one: 'factory', many: 'factories' },
  { key: 'occupations', one: 'career', many: 'careers' },
  { key: 'skills', one: 'skill', many: 'skills' },
];

/** How much is here, as one line of text. Holds its line while the figures load. */
function Figures({ counts }: { counts?: EntityCounts }) {
  if (!counts) {
    return <span aria-hidden="true" className="inline-block h-3.5 w-72 max-w-full animate-pulse rounded bg-primary/10 align-middle" />;
  }
  const parts = FIGURES.filter(({ key }) => counts[key] > 0);
  return (
    <span className="block tabular-nums [text-wrap:balance]">
      {parts.map(({ key, one, many }, i) => (
        // Each figure stays whole when the line wraps, and no line starts with a separator.
        <Fragment key={key}>
          <span className="whitespace-nowrap">
            {counts[key].toLocaleString()} {counts[key] === 1 ? one : many}
            {i < parts.length - 1 && ' ·'}
          </span>{' '}
        </Fragment>
      ))}
    </span>
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
  const [saved] = useState(() => Number(sessionStorage.getItem(key) || 0));
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
      sessionStorage.setItem(key, String(lastGood.current.y));
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
function ExploreView({ view }: { view: ExploreView }) {
  useScrollMemory(`explore.scroll.${view}`);
  return view === 'overview' ? <ExploreOverview /> : <BrowseList tab={view} />;
}

/**
 * Explore: an overview of what is here (/explore), and behind it a list of
 * everything of each kind (/explore?tab=companies, factories, occupations,
 * skills, refs, schools, programs).
 */
export default function Explore() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const view: ExploreView = isBrowseTab(tab) ? tab : 'overview';

  const counts = useQuery({
    queryKey: ['entity-counts'],
    queryFn: statsApi.counts,
    staleTime: 1000 * 60 * 10,
  });

  return (
    <PageContainer>
      <PageHeader
        title={<span className="block text-4xl leading-tight sm:text-5xl sm:leading-tight">Explore</span>}
        description={counts.isError ? undefined : <Figures counts={counts.data} />}
        className="mb-4 sm:mb-6"
      />
      <ExploreNav active={view} counts={counts.data} />
      <ExploreView key={view} view={view} />
    </PageContainer>
  );
}
