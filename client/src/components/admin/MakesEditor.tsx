import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChangeMakes, type EditorMake, type MakeChange, type RecordView } from '../../lib/records';
import { ErrorNote, busyButtonClass, cardClass, fieldClass, outlineButtonClass, rowClass, textButtonClass } from '../account/parts';
import ConfirmDialog from '../layout/ConfirmDialog';
import { PageSection } from '../layout/Page';
import { useAdminNotice } from './AdminNotice';

const MAKES_MAX = 12;
const iconButtonClass = cn(
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:text-fg-default',
  'aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:text-fg-muted'
);

/**
 * A skill's makes, where they are corrected: the named equipment and software
 * the skill is run on, in the order they are shown. One is added by name,
 * renamed in place, moved up or down, or removed; each act is saved as it is
 * made and written to the history. Removing a make people have marked says
 * how many and asks first: their marks go with it.
 */
export default function MakesEditor({ record, onChanged }: { record: RecordView; onChanged: () => Promise<unknown> }) {
  const notice = useAdminNotice();
  const change = useChangeMakes(record.id);
  const makes = record.makes ?? [];
  const [adding, setAdding] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState<EditorMake | null>(null);

  const send = (what: MakeChange, said: string, after?: () => void, focus?: string) => {
    if (change.isPending) return;
    change.mutate(what, {
      onSuccess: async () => {
        await onChanged();
        after?.();
        notice.say(said, { focus });
      },
    });
  };

  const add = () => {
    const name = adding.replace(/\s+/g, ' ').trim();
    if (!name) return;
    send({ act: 'add', name }, `Added ${name} to the makes of ${record.name}.`, () => setAdding(''));
  };
  const rename = (make: EditorMake) => {
    const name = (renaming?.name ?? '').replace(/\s+/g, ' ').trim();
    if (!name || name === make.name) {
      setRenaming(null);
      return;
    }
    send({ act: 'rename', makeId: make.id, name }, `Renamed ${make.name} to ${name}.`, () => setRenaming(null));
  };
  const move = (index: number, by: -1 | 1) => {
    const order = makes.map((make) => make.id);
    const to = index + by;
    if (to < 0 || to >= order.length) return;
    [order[index], order[to]] = [order[to], order[index]];
    send({ act: 'order', order }, `Moved ${makes[index].name} ${by < 0 ? 'up' : 'down'}.`);
  };
  const remove = (make: EditorMake) =>
    send({ act: 'remove', makeId: make.id }, `Removed ${make.name} from the makes of ${record.name}.`, () => setRemoving(null), '#make-add');

  return (
    <PageSection title="Makes" description="The named equipment and software this skill is run on, in the order they are shown. A person who has the skill marks the ones they have run.">
      <div className={cn(cardClass, 'p-4 sm:p-5')} data-makes-editor>
        {makes.length === 0 ? (
          <p className="text-sm text-fg-muted">None yet.</p>
        ) : (
          <ul>
            {makes.map((make, index) => (
              <li key={make.id} className={cn(rowClass, 'flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5')} data-make-row={make.id}>
                {renaming?.id === make.id ? (
                  <form
                    className="flex min-w-0 flex-1 basis-56 flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      rename(make);
                    }}
                  >
                    <input
                      autoFocus
                      aria-label={`New name for ${make.name}`}
                      value={renaming.name}
                      maxLength={60}
                      onChange={(event) => setRenaming({ id: make.id, name: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenaming(null);
                      }}
                      className={cn(fieldClass, 'min-h-9 flex-1 basis-40 py-1')}
                    />
                    <button type="submit" aria-busy={change.isPending} aria-disabled={change.isPending} className={cn(textButtonClass, 'flex min-h-9 items-center')}>
                      Save
                    </button>
                    <button type="button" onClick={() => setRenaming(null)} className={cn(textButtonClass, 'flex min-h-9 items-center')}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 basis-20 break-words text-sm text-fg-default">{make.name}</span>
                    <span className="flex shrink-0 items-center">
                      <button
                        type="button"
                        aria-label={`Move ${make.name} up`}
                        aria-disabled={index === 0 || change.isPending}
                        onClick={() => move(index, -1)}
                        className={iconButtonClass}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${make.name} down`}
                        aria-disabled={index === makes.length - 1 || change.isPending}
                        onClick={() => move(index, 1)}
                        className={iconButtonClass}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          change.reset();
                          setRenaming({ id: make.id, name: make.name });
                        }}
                        aria-label={`Rename ${make.name}`}
                        className={cn(textButtonClass, 'ml-1 flex min-h-9 items-center')}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          change.reset();
                          // Nobody marked it: nothing to ask about.
                          if (make.people > 0) setRemoving(make);
                          else remove(make);
                        }}
                        aria-label={`Remove ${make.name}`}
                        className={cn(textButtonClass, 'ml-3 flex min-h-9 items-center')}
                        data-remove-make
                      >
                        Remove
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          className={cn('pt-4', makes.length > 0 && 'mt-3 border-t border-border-subtle')}
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <label htmlFor="make-add" className="mb-1.5 block text-sm font-medium text-fg-muted">
            Add a make
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,24rem)_auto]">
            <input
              id="make-add"
              value={adding}
              maxLength={60}
              autoComplete="off"
              placeholder="A maker or a product, as people say it"
              onChange={(event) => {
                change.reset();
                setAdding(event.target.value);
              }}
              className={fieldClass}
            />
            <Button
              type="submit"
              variant="outline"
              aria-disabled={!adding.trim() || change.isPending || makes.length >= MAKES_MAX}
              aria-busy={change.isPending}
              className={cn('h-[42px] justify-self-start', outlineButtonClass, busyButtonClass)}
            >
              Add
            </Button>
          </div>
          {makes.length >= MAKES_MAX && <p className="mt-1.5 text-xs text-fg-muted">A skill has at most {MAKES_MAX} makes.</p>}
        </form>
        {/* While the question is open the refusal is shown in it. */}
        {!removing && <ErrorNote error={change.error} className="mt-3" />}

        <ConfirmDialog
          open={Boolean(removing)}
          title="Remove make"
          description={
            <>
              <p>
                <span className="font-medium text-fg-default">{removing?.name}</span>, a make of {record.name}.
              </p>
              <p data-make-people>
                {removing?.people === 1 ? '1 person has marked it. Their mark goes with it.' : `${(removing?.people ?? 0).toLocaleString('en-US')} people have marked it. Their marks go with it.`}
              </p>
              <p>Cannot be undone.</p>
            </>
          }
          confirmLabel="Remove make"
          busy={change.isPending}
          error={change.error}
          onConfirm={() => {
            if (removing) remove(removing);
          }}
          onCancel={() => setRemoving(null)}
        />
      </div>
    </PageSection>
  );
}
