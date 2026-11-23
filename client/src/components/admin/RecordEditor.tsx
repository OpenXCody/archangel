import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiError } from '../../lib/http';
import { editPath, useDeleteRecord, useMergeRecord, useRecord, type FoundRecord, type RecordKind, type RecordView } from '../../lib/records';
import { CardNote, LoadError, RowsSkeleton, busyButtonClass, cardClass, outlineButtonClass, textButtonClass, rowHoverClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import { useAdminNotice } from './AdminNotice';
import RecordPicker from './RecordPicker';
import ConfirmDialog from '../layout/ConfirmDialog';
import HistoryList, { attachedWords } from './HistoryList';
import PathEditor from './PathEditor';
import MakesEditor from './MakesEditor';
import RecordForm from './RecordForm';
import Picker from './Picker';
import { PairCard } from './PlantPairs';
import { usePlantPair, usePlantsNear } from '../../lib/plantPairs';

const KIND_WORD: Record<RecordKind, string> = { company: 'company', factory: 'factory', career: 'career', skill: 'skill' };
const PAGE_WORD: Record<RecordKind, string> = { company: 'Company page', factory: 'Factory page', career: 'Career page', skill: 'Skill page' };

/** What moves with a merge: a job's applications follow the job, so they are not counted apart. */
function movedWords(record: RecordView): string {
  const { applications: _applications, ...moving } = record.attached;
  return attachedWords(moving);
}

/**
 * One record, corrected in one place: its fields, a career's path, a skill's makes, merging
 * it into another (a factory: with another row of the same factory, side by
 * side), deleting it, and the history of what admins did to it.
 * Opened from Admin Tools → Data, or by Edit on the record's own page.
 */
export default function RecordEditor({ kind, id }: { kind: RecordKind; id: string }) {
  const record = useRecord(kind, id);
  const notice = useAdminNotice();
  const { hash } = useLocation();
  // A new form after each save: it starts again from what is now stored.
  const [round, setRound] = useState(0);

  // "#path" in the address opens on the path, once it is on the page.
  const loaded = Boolean(record.data);
  useEffect(() => {
    if (loaded && hash === '#path') document.getElementById('path')?.scrollIntoView({ block: 'start' });
  }, [loaded, hash]);

  const back = (
    <Link to="/admin?tab=data" className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm text-text-2 transition-colors hover:text-text-1">
      <ArrowLeft className="h-4 w-4" />
      {/* The tab above already says Data: this is only the way back to its lists. */}
      Back
    </Link>
  );

  if (record.isPending) {
    return (
      <>
        {back}
        <RowsSkeleton rows={3} />
      </>
    );
  }
  if (record.isError) {
    const gone = record.error instanceof ApiError && record.error.status === 404;
    return (
      <>
        {back}
        {gone ? (
          <CardNote>This {KIND_WORD[kind]} is no longer on record. It may have been merged or deleted.</CardNote>
        ) : (
          <LoadError error={record.error} onRetry={() => void record.refetch()} retrying={record.isFetching} />
        )}
      </>
    );
  }

  const data = record.data;
  return (
    <div data-record-editor={kind}>
      {back}
      <div className="mb-6 min-w-0">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-text-2">Correct a {KIND_WORD[kind]}</p>
        <h2 className="break-words text-xl font-semibold text-text-1">{data.name}</h2>
        <Link to={data.href} className="mt-1 inline-block text-sm text-text-1 underline">
          {PAGE_WORD[kind]}
        </Link>
      </div>

      <PageSection>
        <div className={cardClass}>
          <RecordForm
            key={round}
            kind={kind}
            record={data}
            onSaved={async (saved) => {
              await record.refetch();
              setRound((value) => value + 1);
              notice.say(`Saved ${saved.name}.`);
            }}
          />
        </div>
      </PageSection>

      {kind === 'career' && <PathEditor record={data} onChanged={() => record.refetch()} />}

      {kind === 'skill' && <MakesEditor record={data} onChanged={() => record.refetch()} />}

      {kind === 'factory' ? <PlantMergeSection record={data} /> : <MergeSection record={data} />}

      <PageSection title="History">
        <HistoryList filter={{ kind, record: id }} ownRecord />
      </PageSection>

      <DeleteSection record={data} />
    </div>
  );
}

function MergeSection({ record }: { record: RecordView }) {
  const navigate = useNavigate();
  const notice = useAdminNotice();
  const merge = useMergeRecord(record.kind, record.id);
  const [into, setInto] = useState<FoundRecord | null>(null);
  const [confirming, setConfirming] = useState(false);
  const word = KIND_WORD[record.kind];
  const moving = movedWords(record);

  return (
    <PageSection title="Merge" description={`When this is the same ${word} as another. Everything here moves to the other, and this name is kept as another name for it.`}>
      <div className={cardClass}>
        <label htmlFor="merge-into" className="mb-1.5 block text-sm font-medium text-text-2">
          Merge into
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,28rem)_auto]">
          <RecordPicker id="merge-into" kind={record.kind} value={into} onChange={setInto} excludeId={record.id} />
          <Button
            type="button"
            variant="outline"
            aria-disabled={!into}
            onClick={() => {
              if (!into) return;
              merge.reset();
              setConfirming(true);
            }}
            className={cn('h-[42px] justify-self-start', outlineButtonClass, busyButtonClass)}
            data-merge
          >
            Merge
          </Button>
        </div>
        <ConfirmDialog
          open={confirming && Boolean(into)}
          title={`Merge ${word}`}
          description={
            <>
              <p>
                <span className="font-medium text-text-1">{record.name}</span> into <span className="font-medium text-text-1">{into?.name}</span>
                {into?.detail ? ` (${into.detail})` : ''}.
              </p>
              <p>{moving ? `Moves to ${into?.name}: ${moving}.` : 'Nothing is attached to it that would move.'}</p>
              <p>
                “{record.name}” is kept as another name for {into?.name}, and this record is deleted. Cannot be undone.
              </p>
            </>
          }
          confirmLabel="Merge"
          busy={merge.isPending}
          error={merge.error}
          onConfirm={() => {
            if (!into) return;
            merge.mutate(into.id, {
              onSuccess: (result) => {
                setConfirming(false);
                navigate(editPath(record.kind, result.kept.id), { replace: true });
                notice.say(`Merged ${result.merged.name} into ${result.kept.name}.`);
              },
            });
          }}
          onCancel={() => setConfirming(false)}
        />
      </div>
    </PageSection>
  );
}

/** How many likely rows are offered before anything is typed. */
const LIKELY_SHOWN = 3;

/**
 * Merging a factory with another row that is the same factory. The other row is
 * found among the company's factories and the ones near by (the likeliest are
 * offered at once); then both are set side by side, with the row to keep
 * chosen there. A factory has no other names: the row that is kept keeps its
 * own name and takes the facts it lacks.
 */
function PlantMergeSection({ record }: { record: RecordView }) {
  const navigate = useNavigate();
  const [other, setOther] = useState<FoundRecord | null>(null);
  const likely = usePlantsNear(record.id, '');
  const pair = usePlantPair(record.id, other?.id ?? null);
  const useOptions = (term: string) => usePlantsNear(record.id, term, term.length >= 2);
  const offered = (likely.data ?? []).slice(0, LIKELY_SHOWN);

  return (
    <PageSection
      title="Merge"
      description="When this is the same factory as another row. One row is kept: it takes the facts it lacks from the other, and everything attached moves to it."
    >
      <div className={cardClass} data-plant-merge>
        <label htmlFor="merge-with" className="mb-1.5 block text-sm font-medium text-text-2">
          The other row
        </label>
        <div className="max-w-[28rem]">
          <Picker<FoundRecord>
            id="merge-with"
            value={other}
            onChange={setOther}
            useOptions={useOptions}
            placeholder="Factory name"
            listLabel="Factories"
            detail={(option) => option.detail}
            excludeId={record.id}
          />
        </div>
        <p className="mt-1.5 text-xs text-text-3">Factories of the same company, and any within two kilometres.</p>
        {!other && offered.length > 0 && (
          <ul className="mt-3 max-w-[28rem]" aria-label="Likely rows" data-plant-merge-likely>
            {offered.map((option) => (
              <li key={option.id} className="border-t border-line first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOther(option)}
                  className={cn(rowHoverClass, 'block w-[calc(100%+1.5rem)] py-2 text-left')}
                >
                  <span className="block break-words text-sm text-text-1">{option.name}</span>
                  {option.detail && <span className="block break-words text-xs text-text-3">{option.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {other && (
        <div className="mt-3">
          {pair.isPending ? (
            <RowsSkeleton rows={2} />
          ) : pair.isError ? (
            <LoadError error={pair.error} onRetry={() => void pair.refetch()} retrying={pair.isFetching} />
          ) : (
            <PairCard
              key={`${pair.data.a.id}:${pair.data.b.id}:${pair.data.apart}`}
              pair={pair.data}
              onMerged={(kept) => {
                setOther(null);
                // The row that was kept is the one to go on correcting.
                if (kept.id !== record.id) navigate(editPath('factory', kept.id), { replace: true });
              }}
            />
          )}
        </div>
      )}
    </PageSection>
  );
}

function DeleteSection({ record }: { record: RecordView }) {
  const navigate = useNavigate();
  const notice = useAdminNotice();
  const remove = useDeleteRecord(record.kind, record.id);
  const [confirming, setConfirming] = useState(false);
  const word = KIND_WORD[record.kind];
  const going = attachedWords(record.attached);

  return (
    <PageSection>
      <button
        type="button"
        onClick={() => {
          remove.reset();
          setConfirming(true);
        }}
        className={cn(textButtonClass, 'flex min-h-9 items-center')}
        data-delete-record
      >
        Delete this {word}
      </button>
      <ConfirmDialog
        open={confirming}
        title={`Delete ${word}`}
        description={
          <>
            <p>
              <span className="font-medium text-text-1">{record.name}</span>
            </p>
            <p data-delete-takes>{going ? `Goes with it: ${going}.` : 'Nothing else is attached to it.'}</p>
            <p>Cannot be undone. If it is a duplicate, merge it instead.</p>
          </>
        }
        confirmLabel={`Delete ${word}`}
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              setConfirming(false);
              navigate('/admin?tab=data', { replace: true });
              notice.say(`Deleted ${record.name}.`);
            },
          })
        }
        onCancel={() => setConfirming(false)}
      />
    </PageSection>
  );
}
