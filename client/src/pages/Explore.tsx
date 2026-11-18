import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { statsApi, type EntityCounts } from '../lib/api';
import { readStored, writeStored } from '../lib/storage';
import { PageContainer, PageHeader } from '../components/layout/Page';
import ExploreNav, { isBrowseTab, type BrowseTab, type ExploreView } from '../components/explorer/ExploreNav';
import ExploreOverview from '../components/explorer/ExploreOverview';
import BrowseList from '../components/explorer/BrowseList';
import IndustryList from '../components/explorer/IndustryList';

/** What each list holds, in the words the tabs use. */
const NOUN: Record<BrowseTab | 'industries', [one: string, many: string]> = {
  industries: ['industry', 'industries'],
  companies: ['company', 'companies'],
  factories: ['plant', 'plants'],
  occupations: ['career', 'careers'],
  skills: ['skill', 'skills'],
};
const FIGURES: BrowseTab[] = ['companies', 'factories', 'occupations', 'skills'];

const counted = (n: number, [one, many]: [string, string]) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** The line's place while its figure is on the way, so nothing below it moves. */
function Holding({ wide = false }: { wide?: boolean }) {
  return <span aria-hidden="true" className={`inline-block h-3.5 max-w-full animate-pulse rounded bg-primary/10 align-middle ${wide ? 'w-72' : 'w-28'}`} />;
}

/** The overview's line: how much is here, of each kind. Holds its line while the figures load. */
function Figures({ counts }: { counts?: EntityCounts }) {
  if (!counts) return <Holding wide />;
  const parts = FIGURES.filter((key) => counts[key] > 0);
  return (
    <span className="block tabular-nums [text-wrap:balance]">
      {parts.map((key, i) => (
        // Each figure stays whole when the line wraps, and no line starts with a separator.
        <Fragment key={key}>
          <span className="whitespace-nowrap">
            {counted(counts[key], NOUN[key])}
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
function View({ view, onCount }: { view: ExploreView; onCount: (count: number | undefined) => void }) {
  useScrollMemory(`explore.scroll.${view}`);
  if (view === 'overview') return <ExploreOverview />;
  if (view === 'industries') return <IndustryList onCount={onCount} />;
  return <BrowseList tab={view} onCount={onCount} />;
}

/**
 * Explore: an overview of what is here (/explore), and behind it each level
 * of the product as a tab: the industries (/industries), then a list of every
 * company, plant, career and skill (/explore?tab=companies, factories,
 * occupations, skills). One heading and one tab row for all of them.
 *
 * Under the heading is one line: on the overview, how much there is of each
 * kind; on a tab, how many that tab is showing, filters applied.
 */
export default function Explore() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const view: ExploreView = pathname.startsWith('/industries') ? 'industries' : isBrowseTab(tab) ? tab : 'overview';

  const counts = useQuery({
    queryKey: ['entity-counts'],
    queryFn: statsApi.counts,
    staleTime: 1000 * 60 * 10,
  });

  // What the open tab says it is showing. Kept with the view it came from, so
  // one tab's figure is never shown under another.
  const [shown, setShown] = useState<{ view: ExploreView; count: number | undefined }>({ view, count: undefined });
  const onCount = useCallback((count: number | undefined) => setShown({ view, count }), [view]);
  // A list with no filter holds what the overview's line says it does: no need to wait for it.
  const filtered = ['state', 'industry', 'category'].some((name) => searchParams.get(name));
  const whole = isBrowseTab(view) && !filtered ? counts.data?.[view] : undefined;
  const count = (shown.view === view ? shown.count : undefined) ?? whole;

  return (
    <PageContainer>
      <PageHeader
        title="Explore"
        description={
          view === 'overview' ? (
            counts.isError ? undefined : <Figures counts={counts.data} />
          ) : (
            <span role="status" className="block tabular-nums" data-explore-count>
              {count === undefined ? <Holding /> : counted(count, NOUN[view])}
            </span>
          )
        }
        className="mb-3 sm:mb-5"
      />
      <ExploreNav active={view} />
      <View key={view} view={view} onCount={onCount} />
    </PageContainer>
  );
}
