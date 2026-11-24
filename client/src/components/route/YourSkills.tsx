import { Link } from 'react-router-dom';
import { plural } from '@/lib/utils';
import { ActionPanel, primaryActionClass, secondaryActionClass } from '../layout/Panel';
import { ShareRing } from '../path/HeldShare';
import type { Share } from '../path/model';

interface YourSkillsProps {
  /** How many skills the path has. */
  total: number;
  /** A seeker's share of it, once their marks have arrived; null for anyone else. */
  share: Share | null;
  /** A visitor, who could have marks by signing in: the address that signs them in and brings them back. */
  signIn: string | null;
  className?: string;
}

/**
 * The person and a career's skills, in one `ActionPanel` directly under the
 * groups it is about, at every width: for a visitor the question the page can
 * answer and the button that answers it (Sign in), for a seeker how much of
 * the path they hold and the way to Profile, where skills are marked. Someone
 * here to hire has none.
 */
export function YourSkills({ total, share, signIn, className }: YourSkillsProps) {
  const skills = plural(total, 'skill', 'skills');
  if (signIn) {
    return (
      <ActionPanel
        className={className}
        action={
          <Link to={signIn} className={primaryActionClass} data-sign-in-skills>
            Sign in
          </Link>
        }
        data-your-skills="visitor"
      >
        <p className="font-medium text-text-1">Which of these {skills} do you hold?</p>
        <p className="text-text-2">Sign in and each one you hold is marked, group by group.</p>
      </ActionPanel>
    );
  }
  if (!share) return null;
  const any = share.held > 0;
  return (
    <ActionPanel
      className={className}
      lead={<ShareRing share={share} className="h-8 w-8" />}
      action={
        <Link to="/me" className={secondaryActionClass} data-profile-skills="">
          Your skills on Profile
        </Link>
      }
      data-your-skills="seeker"
    >
      <p className="font-medium text-text-1" data-held-count>
        {any ? (
          <>
            You hold <span className="tabular-nums">{share.held}</span> of these {skills}.
          </>
        ) : (
          <>None of these {skills} is on your profile yet.</>
        )}
      </p>
      <p className="text-text-2">
        {share.learning > 0 ? `${share.learning} more being learned. ` : ''}Skills are marked on Profile, and each one you hold is ticked here.
      </p>
    </ActionPanel>
  );
}
