import { useEffect, useRef, type ReactNode } from 'react';
import { cn, plural } from '@/lib/utils';
import type { DoneCareer } from '../../lib/seeker';
import { ErrorNote, textButtonClass } from '../account/parts';

/*
 * What is said after a person marks a military career as done ("I have done
 * this" on the career's page, components/account/DoneButton): every skill of
 * its path was marked held in one write, and Undo takes back exactly that.
 *
 * Profile itself asks nothing about military service: it had a second door
 * here, "Start with what you have done", which mixed a question for people
 * who served into every civilian's page. The way to the military careers is
 * the Careers list (Industry | Military).
 */

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
