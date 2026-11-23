import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
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

/** One tap in the door: what it changed, and where it was made. */
type Tap = DoneCareer & { from: DoorPlace };

/** The door's state, held by the page so it outlasts the starting page it may be used from. */
export interface Door {
  /**
   * The taps of this visit that changed something and have not been taken back, oldest first. Each keeps its
   * own Undo: a second rating chosen does not cost the first its way back.
   */
  taps: Tap[];
  /** The last answer, when it changed nothing: said, with nothing to undo, until the next tap or Undo. */
  nothing: Tap | null;
  /** How many taps have been answered this visit: the search at the end of Skills closes when one is. */
  answers: number;
  choose: (occupationId: string, from: DoorPlace) => void;
  undo: (tap: Tap) => void;
  marking: boolean;
  undoing: boolean;
  /** Why the last tap, or the last Undo, did not go through. Each is said beside its own control. */
  markError: Error | null;
  undoError: Error | null;
  /**
   * When what held the keyboard's focus went with nothing said to take it (the last Undo pressed, an answer
   * with no Undo): the moment, or 0. Whichever of the door's own controls is on the page takes the focus, and
   * for a moment after: the page may still be changing from the one the door filled to the one it started
   * on, and the control that took the focus first may go with it.
   */
  focusDoor: MutableRefObject<number>;
}

export function useServiceDoor(): Door {
  const { mark, undo } = useCareerDone();
  const [taps, setTaps] = useState<Tap[]>([]);
  const [nothing, setNothing] = useState<Tap | null>(null);
  const [answers, setAnswers] = useState(0);
  // Two taps in one frame are one: `isPending` is only as new as the last render.
  const writing = useRef(false);
  const focusDoor = useRef(0);
  return {
    taps,
    nothing,
    answers,
    choose: (occupationId, from) => {
      if (writing.current) return;
      writing.current = true;
      undo.reset();
      mark.mutate(occupationId, {
        onSuccess: (answer) => {
          const tap = { ...answer, from };
          setAnswers((count) => count + 1);
          if (answer.added.length + answer.raised.length > 0) {
            setTaps((before) => [...before, tap]);
            setNothing(null);
          } else {
            setNothing(tap);
            focusDoor.current = Date.now();
          }
        },
        onSettled: () => {
          writing.current = false;
        },
      });
    },
    undo: (tap) => {
      if (writing.current) return;
      writing.current = true;
      undo.mutate(tap, {
        onSuccess: () => {
          // An earlier tap made in the same place takes the focus with its own Undo; with none, the door does.
          if (!taps.some((other) => other !== tap && other.from === tap.from)) focusDoor.current = Date.now();
          setTaps((before) => before.filter((other) => other !== tap));
          setNothing(null);
        },
        onSettled: () => {
          writing.current = false;
        },
      });
    },
    marking: mark.isPending,
    undoing: undo.isPending,
    markError: mark.error,
    undoError: undo.error,
    focusDoor,
  };
}

/** How long the door goes on asking for the focus: the page it stands on settles well within it. */
const FOCUS_WINDOW_MS = 1500;

/** Give the keyboard's focus to one of the door's controls when the door asked for it (`Door.focusDoor`). */
function useDoorFocus(door: Door, target: () => HTMLElement | null) {
  // After every render: the control may only just have come back.
  useEffect(() => {
    if (Date.now() - door.focusDoor.current > FOCUS_WINDOW_MS) return;
    // Only focus that was lost: nothing is taken from wherever the person has gone since.
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    target()?.focus();
  });
}

/** What a tap did, in the product's words. */
function doneSentence(done: DoneCareer): string {
  const changed = done.added.length + done.raised.length;
  if (changed > 0) return `Marked ${plural(changed, 'skill', 'skills')} held.`;
  return done.total > 0 ? `You already hold all ${plural(done.total, 'skill', 'skills')} of its path.` : 'Its path has no skills yet.';
}

/**
 * What the tap did, with the way back: "Marked 23 skills held. Undo". The
 * keyboard's focus lands on Undo, since the field or the button that was
 * pressed is gone, and a failed Undo says so here, beside it. `children`
 * follow the sentence (a career's page adds the way to Profile).
 */
export function DoneNotice({
  done,
  onUndo,
  undoing,
  error,
  children,
  className,
}: {
  done: DoneCareer;
  onUndo: () => void;
  undoing: boolean;
  /** Why Undo did not go through. */
  error?: Error | null;
  children?: ReactNode;
  className?: string;
}) {
  const undoRef = useRef<HTMLButtonElement>(null);
  // On arriving, and again when it comes to stand for another tap (the one before, once this one is undone).
  useEffect(() => {
    undoRef.current?.focus();
  }, [done.at, done.occupationId]);
  return (
    <div className={className}>
      <p className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-2" data-done-notice>
        <span role="status">{doneSentence(done)}</span>
        <button
          ref={undoRef}
          type="button"
          aria-busy={undoing}
          onClick={() => {
            if (!undoing) onUndo();
          }}
          className={cn(textButtonClass, 'py-2 text-text-1')}
          data-done-undo
        >
          Undo
        </button>
        {children}
      </p>
      <ErrorNote error={error ?? null} />
    </div>
  );
}

/**
 * What the door did in one place on Profile: the latest tap made there that
 * still stands, with its Undo, and under it an answer that changed nothing.
 * Undoing a tap brings the one before it back with its own Undo.
 */
export function DoorNotice({ door, place, className }: { door: Door; place: DoorPlace; className?: string }) {
  const tap = [...door.taps].reverse().find((made) => made.from === place);
  const nothing = door.nothing?.from === place ? door.nothing : null;
  if (!tap && !nothing) return null;
  return (
    <div className={className}>
      {tap && <DoneNotice done={tap} onUndo={() => door.undo(tap)} undoing={door.undoing} error={door.undoError} />}
      {nothing && (
        <p role="status" className="flex min-h-11 items-center text-sm text-text-2" data-done-nothing>
          {doneSentence(nothing)}
        </p>
      )}
    </div>
  );
}

/** The door on a Profile with nothing on it: a second question beside "Start with a career". */
export function ServiceDoorSection({ door, className }: { door: Door; className?: string }) {
  useDoorFocus(door, () => document.getElementById('door-career'));
  return (
    <PageSection
      title="Start with what you have done"
      description="Choose your rating, MOS or specialty. Its skills are marked held."
      className={className}
    >
      <div data-service-door="start">
        {/* Never disabled while the write runs: a disabled field drops the keyboard's focus. The door takes one tap at a time. */}
        <CareerPicker id="door-career" military value={null} onChange={(career) => career && door.choose(career.id, 'start')} />
        <ErrorNote error={door.markError} className="mt-2" />
        {/* A tap that changed something fills the page, and is said there; one that changed nothing is said here. */}
        {door.nothing?.from === 'start' && (
          <p role="status" className="mt-1 flex min-h-11 items-center text-sm text-text-2" data-done-nothing>
            {doneSentence(door.nothing)}
          </p>
        )}
      </div>
    </PageSection>
  );
}

/**
 * The door on a Profile that already has goals or skills: one line at the end
 * of Skills, which opens the search in its place. After a tap made here the
 * line says what was done, and the door stays under it for another. It is the
 * last thing on the page, so its list opens above the field when there is no
 * room under it (`flip`).
 */
export function ServiceDoorLine({ door, className }: { door: Door; className?: string }) {
  // Open until a tap is answered: what was done is then said in the search's place, in the same render.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const open = openedAt === door.answers;
  const lineRef = useRef<HTMLButtonElement>(null);
  // The search takes the focus when it opens: the line that was pressed is gone.
  useEffect(() => {
    if (open) document.getElementById('door-career')?.focus();
  }, [open]);
  useDoorFocus(door, () => lineRef.current ?? document.getElementById('door-career'));

  return (
    <div className={cn('mt-8', className)} data-service-door="skills">
      <DoorNotice door={door} place="skills" className="mb-1" />
      {open ? (
        <div>
          <label htmlFor="door-career" className={cn(labelClass, 'mb-2 block')}>
            Your rating, MOS or specialty
          </label>
          <CareerPicker id="door-career" military flip value={null} onChange={(career) => career && door.choose(career.id, 'skills')} />
        </div>
      ) : (
        <button ref={lineRef} type="button" onClick={() => setOpenedAt(door.answers)} className={cn(textButtonClass, 'min-h-11 text-left')} data-door-open>
          Start with what you have done
        </button>
      )}
      <ErrorNote error={door.markError} className="mt-2" />
    </div>
  );
}
