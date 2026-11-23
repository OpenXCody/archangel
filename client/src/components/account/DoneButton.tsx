import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { signInPath, useAccount } from '../../lib/account';
import { useCareerDone, type DoneCareer } from '../../lib/seeker';
import { useSeekerTools } from '../../lib/viewer';
import { DoneNotice } from '../me/ServiceDoor';
import { ErrorNote, busyButtonClass, outlineButtonClass, textButtonClass } from './parts';

interface DoneButtonProps {
  /** The military career the person has done. */
  occupationId: string;
  /** Every skill of its path is already held: there is nothing left to mark. */
  whole: boolean;
  className?: string;
}

/**
 * A military career's one action, for a seeker: "I have done this". It is
 * Profile's door, in place: every skill of the career's path is marked held
 * in one tap, what was done is said with Undo, and the way on is Profile,
 * where the civilian careers within reach are. A military career is never a
 * goal, so this stands where "Set as goal" stands on any other career.
 * Signed out it is the way to sign in, which returns to this page; someone
 * here to hire has no skills to mark, and for them it draws nothing.
 */
export default function DoneButton({ occupationId, whole, className }: DoneButtonProps) {
  const location = useLocation();
  const account = useAccount();
  const signedIn = Boolean(account.data?.user);
  const seekerTools = useSeekerTools();
  const { mark, undo } = useCareerDone();
  // What this visit's tap changed: said, with its Undo, until the page is left.
  const [done, setDone] = useState<DoneCareer | null>(null);
  // Two presses in one frame are one: `isPending` is only as new as the last render.
  const writing = useRef(false);
  // Undo brings the button back: the keyboard's focus goes with it.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusButton = useRef(false);
  useEffect(() => {
    if (!focusButton.current || !buttonRef.current) return;
    focusButton.current = false;
    buttonRef.current.focus();
  });

  if (!seekerTools) return null;

  if (account.isPending) {
    // Hold the button's place until we know who is signed in.
    return (
      <Button type="button" aria-busy aria-disabled className={cn('h-11 sm:h-10', busyButtonClass, className)}>
        <Loader2 className="animate-spin" />
        I have done this
      </Button>
    );
  }

  if (!signedIn) {
    return (
      <div className={cn('inline-flex max-w-full flex-col gap-1.5', className)}>
        <Button asChild variant="outline" className={cn('h-11 sm:h-10', outlineButtonClass)}>
          <Link to={signInPath(`${location.pathname}${location.search}`)} data-done-sign-in>
            Sign in to mark its skills held
          </Link>
        </Button>
        <ErrorNote error={mark.error} />
      </div>
    );
  }

  if (done) {
    return (
      <div className={cn('max-w-full', className)}>
        <DoneNotice
          done={done}
          undoing={undo.isPending}
          error={undo.error}
          onUndo={() =>
            undo.mutate(done, {
              onSuccess: () => {
                focusButton.current = true;
                setDone(null);
              },
            })
          }
        >
          {/* Where the careers these skills reach are listed. */}
          <Link to="/me" className={cn(textButtonClass, 'py-2 text-text-1')} data-done-profile>
            Open Profile
          </Link>
        </DoneNotice>
      </div>
    );
  }

  // Held whole already: the figure beside this says so, and there is nothing to press.
  if (whole) return null;

  const busy = mark.isPending;
  return (
    <div className={cn('inline-flex max-w-full flex-col gap-1.5', className)}>
      <Button
        ref={buttonRef}
        type="button"
        aria-busy={busy}
        aria-disabled={busy}
        onClick={() => {
          if (busy || writing.current) return;
          writing.current = true;
          undo.reset();
          mark.mutate(occupationId, {
            onSuccess: setDone,
            onSettled: () => {
              writing.current = false;
            },
          });
        }}
        className={cn('h-11 sm:h-10', busyButtonClass)}
        data-done-button
      >
        {busy ? <Loader2 className="animate-spin" /> : <Check />}
        I have done this
      </Button>
      <ErrorNote error={mark.error} />
    </div>
  );
}
