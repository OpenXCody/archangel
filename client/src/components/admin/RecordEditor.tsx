import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiError } from '../../lib/account';
import { editPath, useDeleteRecord, useMergeRecord, useRecord, type FoundRecord, type RecordKind, type RecordView } from '../../lib/records';
import { CardNote, LoadError, RowsSkeleton, busyButtonClass, cardClass, outlineButtonClass, textButtonClass } from '../account/parts';
import { PageSection } from '../layout/Page';
import { useAdminNotice } from './AdminNotice';
import { RecordPicker } from './CompanyPicker';
import ConfirmDialog from './ConfirmDialog';
import HistoryList, { attachedWords } from './HistoryList';
import PathEditor from './PathEditor';
import RecordForm from './RecordForm';

const KIND_WORD: Record<RecordKind, string> = { company: 'company', factory: 'factory', career: 'career', skill: 'skill' };
const PAGE_WORD: Record<RecordKind, string> = { company: 'Company page', factory: 'Factory page', career: 'Career page', skill: 'Skill page' };

/** What moves with a merge: a job's applications follow the job, so they are not counted apart. */
function movedWords(record: RecordView): string {
  const { applications: _applications, ...moving } = record.attached;
  return attachedWords(moving);
}

/**
 * One record, corrected in one place: its fields, a career's path, merging
 * it into another, deleting it, and the history of what admins did to it.
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
    <Link to="/admin?tab=data" className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm text-fg-muted transition-colors hover:text-fg-default">
      <ArrowLeft className="h-4 w-4" />
      Data
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
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft">Correct a {KIND_WORD[kind]}</p>
        <h2 className="break-words text-xl font-semibold text-fg-default">{data.name}</h2>
        <Link to={data.href} className="mt-1 inline-block text-sm text-fg-muted underline underline-offset-4 hover:text-fg-default">
          {PAGE_WORD[kind]}
        </Link>
      </div>

      <PageSection>
        <div className={cn(cardClass, 'p-4 sm:p-5')}>
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

      {kind !== 'factory' && <MergeSection record={data} />}

      <PageSection title="History">
        <HistoryList filter={{ kind, record: id }} ownRecord empty="No changes by an admin on record." />
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
      <div className={cn(cardClass, 'p-4 sm:p-5')}>
        <label htmlFor="merge-into" className="mb-1.5 block text-sm font-medium text-fg-muted">
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
                <span className="font-medium text-fg-default">{record.name}</span> into <span className="font-medium text-fg-default">{into?.name}</span>
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
              <span className="font-medium text-fg-default">{record.name}</span>
            </p>
            <p data-delete-takes>{going ? `Goes with it: ${going}.` : 'Nothing else is attached to it.'}</p>
            <p>Cannot be undone.{record.kind !== 'factory' ? ' If it is a duplicate, merge it instead.' : ''}</p>
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
