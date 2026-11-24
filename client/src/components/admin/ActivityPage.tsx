import { useSearchParams } from 'react-router-dom';
import { SegmentedChoice } from '../account/parts';
import HistoryTab from './HistoryTab';
import IntakeSources from './IntakeSources';
import { PostingRuns } from './Postings';
import QualityTable from './QualityTable';

type View = 'history' | 'sources' | 'postings' | 'quality';
const VIEWS: readonly { value: View; label: string }[] = [
  { value: 'history', label: 'History' },
  { value: 'sources', label: 'Sources' },
  { value: 'postings', label: 'Postings' },
  { value: 'quality', label: 'Data quality' },
];

/**
 * Activity: what changed and what came in, one view at a time
 * (`?view=history|sources|postings|quality`). History is what admins
 * changed (`&show=<kind>`); Sources the intake runner's sources with their
 * latest runs; Postings each employer's board with its latest run; Data
 * quality how complete the factory data is, state by state. Nothing here
 * waits for a decision: that is Review.
 */
export default function ActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = VIEWS.find((option) => option.value === searchParams.get('view'))?.value ?? 'history';
  const choose = (next: View) => {
    const params = new URLSearchParams();
    if (next !== 'history') params.set('view', next);
    setSearchParams(params);
  };
  return (
    <>
      <SegmentedChoice label="Activity shown" options={VIEWS} value={view} onChange={choose} className="mb-4 grid-cols-4 sm:mb-5 sm:max-w-xl" optionClassName="min-w-0 truncate px-1" />
      {view === 'history' && <HistoryTab />}
      {view === 'sources' && <IntakeSources />}
      {view === 'postings' && <PostingRuns />}
      {view === 'quality' && <QualityTable />}
    </>
  );
}
