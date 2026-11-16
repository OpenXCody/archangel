import { Link, useLocation } from 'react-router-dom';
import { Check, Loader2, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { signInPath, useAccount, useAddGoal, useMyGoals, useRemoveGoal } from '../../lib/account';
import { ErrorNote, outlineButtonClass } from './parts';

interface GoalButtonProps {
  /** The career (occupation) to aim at. */
  occupationId: string;
  className?: string;
}

/**
 * Add a career to, or remove it from, the signed-in person's "Careers I'm
 * aiming at". Signed out, it is a link to sign in that returns to this page.
 */
export default function GoalButton({ occupationId, className }: GoalButtonProps) {
  const location = useLocation();
  const account = useAccount();
  const signedIn = Boolean(account.data?.user);
  const goals = useMyGoals(signedIn);
  const addGoal = useAddGoal();
  const removeGoal = useRemoveGoal();

  if (account.isPending) {
    // Hold the button's place until we know who is signed in.
    return (
      <Button type="button" variant="outline" disabled className={cn('h-10', outlineButtonClass, className)}>
        <Loader2 className="animate-spin" />
        Aim for this career
      </Button>
    );
  }

  if (!signedIn) {
    return (
      <Button asChild variant="outline" className={cn('h-10', outlineButtonClass, className)}>
        <Link to={signInPath(`${location.pathname}${location.search}`)}>
          <Target />
          Sign in to aim for this career
        </Link>
      </Button>
    );
  }

  const isGoal = Boolean(goals.data?.some((goal) => goal.occupationId === occupationId));
  const busy = addGoal.isPending || removeGoal.isPending;
  const error = addGoal.error ?? removeGoal.error ?? goals.error;

  const toggle = () => {
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
        disabled={busy || goals.isPending}
        onClick={toggle}
        title={isGoal ? 'Remove from the careers you are aiming at' : undefined}
        className={cn('h-10', isGoal && outlineButtonClass)}
      >
        {busy || goals.isPending ? <Loader2 className="animate-spin" /> : isGoal ? <Check className="text-success" /> : <Target />}
        {isGoal ? 'Aiming at this career' : 'Aim for this career'}
      </Button>
      <ErrorNote error={error} />
    </div>
  );
}
