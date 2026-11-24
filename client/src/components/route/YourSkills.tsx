import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn, labelClass, plural } from '@/lib/utils';
import { ActionPanel, Panel, PanelFooterLink, PanelHead, panelRowClass, primaryActionClass } from '../layout/Panel';
import { ShareRing } from '../path/HeldShare';
import type { PlacedSkill, Share } from '../path/model';

interface YourSkillsProps {
  /** How many skills the path has. */
  total: number;
  /** A seeker's share of it, once their marks have arrived; null for anyone else. */
  share: Share | null;
  /** A visitor, who could have marks by signing in: the address that signs them in and brings them back. */
  signIn: string | null;
  /** A seeker's next skill, said here on a narrow screen (a wide one previews it beside the groups). */
  next: PlacedSkill | null;
}

/**
 * The person beside a career's skills, in one panel: for a visitor the call
 * to sign in (one sentence and one button), for a seeker how much of the path
 * they hold and where their skills are marked (Profile). Someone here to hire
 * has no panel. On a wide screen it stands at the top of the column beside
 * the groups; on a narrow one between the Skills heading and the groups.
 */
export function YourSkills({ total, share, signIn, next }: YourSkillsProps) {
  if (signIn) {
    return (
      <ActionPanel title="Your skills" action={<Link to={signIn} className={cn(primaryActionClass, 'w-full')} data-sign-in-skills>Sign in</Link>} data-your-skills="visitor">
        Sign in to see which of these {plural(total, 'skill', 'skills')} you already have.
      </ActionPanel>
    );
  }
  if (!share) return null;
  const any = share.held > 0;
  return (
    <Panel data-your-skills="seeker">
      <PanelHead title="Your progress" as="h2" />
      {any ? (
        <div className="flex items-center gap-3 px-4 py-3" data-held-count>
          <ShareRing share={share} className="h-8 w-8" />
          <p className="text-sm text-text-2">
            <span className="font-semibold tabular-nums text-text-1">{share.held}</span> of {plural(total, 'skill', 'skills')} held
            {share.learning > 0 && <span className="block text-[13px] text-text-3">{share.learning} being learned</span>}
          </p>
        </div>
      ) : (
        <p className="px-4 py-3 text-sm leading-relaxed text-text-2">None of these {plural(total, 'skill', 'skills')} is on your profile yet.</p>
      )}
      {/* The next skill, by name, where there is no column beside the groups to say what it is. */}
      {any && next && (
        <Link to={`/skills/${next.id}`} className={cn(panelRowClass, 'border-t border-line lg:hidden')} data-next-up={next.id}>
          <span className="min-w-0 flex-1">
            <span className={cn(labelClass, 'block')}>Next for you</span>
            <span className="mt-0.5 block break-words text-sm font-medium text-text-1">{next.name}</span>
          </span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-2" />
        </Link>
      )}
      <PanelFooterLink to="/me" data-profile-skills="">
        {any ? 'Your skills on Profile' : 'Add your skills on Profile'}
      </PanelFooterLink>
    </Panel>
  );
}
