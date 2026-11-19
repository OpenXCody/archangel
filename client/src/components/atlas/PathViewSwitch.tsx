import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import ViewSwitch from '../layout/ViewSwitch';
import { readStored, writeStored } from '../../lib/storage';
import { pathViewSearch, readPathView, type PathView } from './pathView';

/** Where the view last shown is kept, for the visit. */
const KEY = 'archangel.pathView';

/**
 * Which view of its path a career's page shows: the address's, else the one
 * last shown in this visit, else the flow. A view the address names is
 * remembered, so the next career opens the same way.
 */
export function usePathView(): PathView {
  const [params] = useSearchParams();
  const named = params.get('path');
  const view = readPathView(named, readStored(KEY, 'session'));
  useEffect(() => {
    if (named === 'flow' || named === 'atlas') writeStored(KEY, named, 'session');
  }, [named]);
  return view;
}

/**
 * A career's path as a flow or on the Atlas: the same quiet switch the Skills
 * list and the Atlas have between them. Each is an address of this page.
 */
export default function PathViewSwitch({ current }: { current: PathView }) {
  const { search } = useLocation();
  const views = [
    { key: 'flow', label: 'Flow', to: pathViewSearch(search, 'flow') },
    { key: 'atlas', label: 'Atlas', to: pathViewSearch(search, 'atlas') },
  ] as const;
  return <ViewSwitch label="Path as" views={views} current={current} replace data={{ 'data-path-view': current }} />;
}
