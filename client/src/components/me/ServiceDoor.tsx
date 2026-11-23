import { useEffect, useState, type ReactNode } from 'react';
import { cn, labelClass, plural } from '@/lib/utils';
import { useCareerDone, type DoneCareer } from '../../lib/seeker';
import CareerPicker from '../account/CareerPicker';
import { ErrorNote, textButtonClass } from '../account/parts';
import { PageSection } from '../layout/Page';

/*
 * "Start with what you have done": the door a person who served comes in by.
 * They choose their rating, MOS or specialty (the one search that offers
 * military careers) and every skill of its path is marked held in that one
 * tap. What was done is said in the product's way, with Undo, which takes
 * back exactly what the tap changed. Nothing is kept about which career it
 * was: the person's skills are the record, and from them Profile lists the
 * civilian careers within reach.
 *
 * On a Profile with nothing on it the door is a section beside "Start with a
 * career"; on one that has goals or skills it is one line at the end of
 * Skills, which opens in place. It is a seeker's: nobody else is shown it.
 */

/** Where on Profile the door was used: the starting page, or the line at the end of Skills. */
type DoorPlace = 'start' | 'skills';

/** The door's state, held by the page so it outlasts the starting page it may be used from. */
export interface Door {
  /** What the last tap changed, and where it was made; null until one is, and again once it is undone. */
  done: (DoneCareer & { from: DoorPlace }) | null;
  choose: (occupationId: string, from: DoorPlace) => void;
  undo: () => void;
  marking: boolean;
  undoing: boolean;
  error: Error | null;
}

export function useServiceDoor(): Door {
  const { mark, undo } = useCareerDone();
  const [done, setDone] = useState<Door['done']>(null);
  return {
    done,
    choose: (occupationId, from) => {
      if (mark.isPending) return;
      undo.reset();
      mark.mutate(occupationId, { onSuccess: (answer) => setDone({ ...answer, from }) });
    },
    undo: () => {
      if (!done || undo.isPending) return;
      undo.mutate(done, { onSuccess: () => setDone(null) });
    },
    marking: mark.isPending,
    undoing: undo.isPending,
    error: mark.error ?? undo.error,
  };
}

/**
 * What the tap did, with the way back: "Marked 23 skills held. Undo". A
 * person who already held every skill is told so, and has nothing to undo.
 * `children` follow the sentence (a career's page adds the way to Profile).
 */
export function DoneNotice({
  done,
  onUndo,
  undoing,
  children,
  className,
}: {
  done: DoneCareer;
  onUndo: () => void;
  undoing: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const changed = done.added.length + done.raised.length;
  return (
    <p role="status" className={cn('flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-2', className)} data-done-notice>
      <span>{changed > 0 ? `Marked ${plural(changed, 'skill', 'skills')} held.` : `You already hold all ${plural(done.total, 'skill', 'skills')} of its path.`}</span>
      {changed > 0 && (
        // Focus lands here: the field or the button that was pressed is gone.
        <button
          type="button"
          autoFocus
          aria-busy={undoing}
          onClick={() => {
            if (!undoing) onUndo();
          }}
          className={cn(textButtonClass, 'py-2 text-text-1')}
          data-done-undo
        >
          Undo
        </button>
      )}
      {children}
    </p>
  );
}

/** The door on a Profile with nothing on it: a second question beside "Start with a career". */
export function ServiceDoorSection({ door, className }: { door: Door; className?: string }) {
  return (
    <PageSection
      title="Start with what you have done"
      description="Choose your rating, MOS or specialty. Its skills are marked held."
      className={className}
    >
      <div data-service-door="start">
        <CareerPicker id="door-career" military value={null} onChange={(career) => career && door.choose(career.id, 'start')} disabled={door.marking} />
        <ErrorNote error={door.error} className="mt-2" />
      </div>
    </PageSection>
  );
}

/**
 * The door on a Profile that already has goals or skills: one line at the end
 * of Skills, which opens the search in its place. After a tap made here the
 * line says what was done, and the door stays under it for another.
 */
export function ServiceDoorLine({ door, className }: { door: Door; className?: string }) {
  const [open, setOpen] = useState(false);
  const here = door.done?.from === 'skills' ? door.done : null;
  // The search takes the focus when it opens: the line that was pressed is gone.
  useEffect(() => {
    if (open) document.getElementById('door-career')?.focus();
  }, [open]);
  // A tap closes the search again: what was done is said in its place.
  useEffect(() => {
    if (here) setOpen(false);
  }, [here]);

  return (
    <div className={cn('mt-8', className)} data-service-door="skills">
      {here && <DoneNotice done={here} onUndo={door.undo} undoing={door.undoing} className="mb-1" />}
      {open ? (
        <div>
          <label htmlFor="door-career" className={cn(labelClass, 'mb-2 block')}>
            Your rating, MOS or specialty
          </label>
          <CareerPicker id="door-career" military value={null} onChange={(career) => career && door.choose(career.id, 'skills')} disabled={door.marking} />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={cn(textButtonClass, 'min-h-11 text-left')} data-door-open>
          Start with what you have done
        </button>
      )}
      <ErrorNote error={door.error} className="mt-2" />
    </div>
  );
}
