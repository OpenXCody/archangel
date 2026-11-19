import { Link, useLocation } from 'react-router-dom';
import { Check, Loader2, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { signInPath, useAccount } from '../../lib/account';
import { useAddGoal, useMyGoals, useRemoveGoal } from '../../lib/seeker';
import { useSeekerTools } from '../../lib/viewer';
import { ErrorNote, busyButtonClass, outlineButtonClass } from './parts';

interface GoalButtonProps {
  /** The career (occupation) to aim at. */
  occupationId: string;
  className?: string;
}

/**
 * Add a career to, or remove it from, the signed-in person's goals. One word
 * for it everywhere: "Set as goal", then "Goal". Signed out, it is a link to
 * sign in that returns to this page. While it saves it keeps the focus.
 * Someone here to hire has no goals: for them it draws nothing.
 */
export default function GoalButton({ occupationId, className }: GoalButtonProps) {
  const location = useLocation();
  const account = useAccount();
  const signedIn = Boolean(account.data?.user);
  const goals = useMyGoals(signedIn);
  const addGoal = useAddGoal();
  const removeGoal = useRemoveGoal();
  const seekerTools = useSeekerTools();

  if (!seekerTools) return null;

  if (account.isPending) {
    // Hold the button's place until we know who is signed in.
    return (
      <Button type="button" variant="outline" aria-busy aria-disabled className={cn('h-11 sm:h-10', outlineButtonClass, busyButtonClass, className)}>
        <Loader2 className="animate-spin" />
        Set as goal
      </Button>
    );
  }

  if (!signedIn) {
    // A press that found the session had ended says so, here, beside the way back in.
    const unsaved = addGoal.error ?? removeGoal.error;
    return (
      <div className={cn('inline-flex max-w-full flex-col gap-1.5', className)}>
        <Button asChild variant="outline" className={cn('h-11 sm:h-10', outlineButtonClass)}>
          <Link to={signInPath(`${location.pathname}${location.search}`)}>
            <Target />
            Sign in to set as goal
          </Link>
        </Button>
        <ErrorNote error={unsaved} />
      </div>
    );
  }

  const isGoal = Boolean(goals.data?.some((goal) => goal.occupationId === occupationId));
  const busy = addGoal.isPending || removeGoal.isPending || goals.isPending;
  const error = addGoal.error ?? removeGoal.error ?? goals.error;

  const toggle = () => {
    if (busy) return;
    addGoal.reset();
    removeGoal.reset();
    if (isGoal) removeGoal.mutate(occupationId);
    else addGoal.mutate(occupationId);
  };

  return (
    <div className={cn('inline-flex max-w-full flex-col gap-1.5', className)}>
      <Button
        type="button"
        variant={isGoal ? 'outline' : 'default'}
        aria-pressed={isGoal}
        aria-busy={busy}
        aria-disabled={busy}
        onClick={toggle}
        title={isGoal ? 'Remove from your goals' : undefined}
        className={cn('h-11 sm:h-10', isGoal && outlineButtonClass, busyButtonClass)}
      >
        {busy ? <Loader2 className="animate-spin" /> : isGoal ? <Check /> : <Target />}
        {isGoal ? 'Goal' : 'Set as goal'}
      </Button>
      <ErrorNote error={error} />
    </div>
  );
}
