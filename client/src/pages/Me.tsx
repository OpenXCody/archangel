import { useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, plural } from '@/lib/utils';
import { type SignedInAccount } from '../lib/account';
import { useAddGoal, useMyApplications, useMyGoals, useMySkills } from '../lib/seeker';
import { useViewer } from '../lib/viewer';
import {
  AccountGate,
  ErrorNote,
  RowsSkeleton,
  busyButtonClass,
  cardClass,
  outlineButtonClass,
  rowClass,
} from '../components/account/parts';
import CareerPicker from '../components/account/CareerPicker';
import { PageContainer, PageHeader, PageSection } from '../components/layout/Page';
import { useExploreOverview } from '../lib/queries';
import { accountKeys } from '../lib/queryKeys';
import ApplicationsSection from '../components/me/ApplicationsSection';
import GoalsSection from '../components/me/GoalsSection';
import SkillsSection from '../components/me/SkillsSection';
import { linkClass } from '../components/me/parts';

export default function Me() {
  return <AccountGate>{(account) => <MyPage account={account} />}</AccountGate>;
}

/**
 * Profile, the seeker's own page: where they have applied (first, when they
 * have: it is what the account's dot points to), what they are working toward
 * (goals) and what they can do (skills, their own before any suggested). Nothing here asks for more than a
 * tap: careers and skills are picked from the catalogue, never typed out.
 * The account itself (name, sign-in, notices) is in settings.
 *
 * With nothing on it yet (no goal, no skill, no application) the page is one
 * question, which career, in place of three empty lists. Choosing one fills
 * the page: the goal, and its skills to mark off. That question is a
 * seeker's: someone here to hire who opens this page with nothing on it is
 * sent to their own.
 *
 * The three sections are files in components/me/.
 */
function MyPage({ account }: { account: SignedInAccount }) {
  const { user } = account;
  const viewer = useViewer();
  const goals = useMyGoals();
  const skills = useMySkills();
  const applications = useMyApplications();

  // Until all three have answered there is no telling which page to draw.
  const loading = goals.isPending || skills.isPending || applications.isPending;
  const firstRun = goals.data?.length === 0 && skills.data?.length === 0 && applications.data?.length === 0;

  // A goal chosen from the starting state replaces it with the full page: put
  // the focus on what took its place, not back at the top.
  const startedHere = useRef(false);
  useEffect(() => {
    if (firstRun || !startedHere.current) return;
    startedHere.current = false;
    document.querySelector<HTMLElement>('[data-goal-link]')?.focus();
  }, [firstRun]);

  if (firstRun && !viewer.seeker) return <Navigate to="/employer" replace />;

  return (
    <PageContainer size="narrow">
      {/* The page is called Profile wherever it is pointed to; here it carries the person's name under that word. */}
      <PageHeader eyebrow="Profile" title={user.name} description="Goals, skills and applications." />
      {loading ? (
        <div className="mb-8">
          <RowsSkeleton rows={3} />
        </div>
      ) : firstRun ? (
        <Starter onStart={() => (startedHere.current = true)} />
      ) : (
        <>
          {/* Only when there is one to follow (or the list could not be read). */}
          {(applications.isError || (applications.data?.length ?? 0) > 0) && <ApplicationsSection email={user.email} />}
          <GoalsSection />
          <SkillsSection />
        </>
      )}
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Starting out
// ---------------------------------------------------------------------------

/** How many careers the starting state offers before any is searched for. */
const STARTER_CAREERS = 5;

/**
 * What a page with nothing on it shows: one question. A career is chosen by
 * searching or from a few that have a path; either is one tap, and nothing is
 * typed that the catalogue does not already hold.
 */
function Starter({ onStart }: { onStart: () => void }) {
  const queryClient = useQueryClient();
  const addGoal = useAddGoal();
  // The same answer the Explore overview reads, so it is usually already here.
  const overview = useExploreOverview();
  const careers = (overview.data?.careers ?? []).slice(0, STARTER_CAREERS);

  const choose = (occupationId: string) => {
    if (addGoal.isPending) return;
    onStart();
    addGoal.mutate(occupationId, {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: accountKeys.suggestedSkills }),
    });
  };

  return (
    <PageSection title="Start with a career" description="Choose one to aim for. Its skills become your list to mark off." className="mb-10">
      <div data-starter>
        <CareerPicker id="starter-career" value={null} onChange={(career) => career && choose(career.id)} disabled={addGoal.isPending} />
        {careers.length > 0 && (
          <ul className={cn(cardClass, 'mt-3')}>
            {careers.map((career) => {
              const busy = addGoal.isPending && addGoal.variables === career.id;
              const count = (career.levels ?? []).reduce((sum, level) => sum + level.count, 0);
              return (
                <li key={career.id} className={cn(rowClass, 'flex items-center gap-3 py-3')}>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/occupations/${career.id}`}
                      className="block break-words text-sm font-medium text-text-1 underline-offset-4 hover:underline"
                    >
                      {career.title}
                    </Link>
                    {/* What the career is, in two lines at most: the whole of it is on the career's page. */}
                    {career.description && <p className="mt-0.5 line-clamp-2 break-words text-sm text-text-2">{career.description}</p>}
                    <p className="mt-0.5 text-sm text-text-3">{plural(count, 'skill', 'skills')}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-busy={busy}
                    aria-disabled={addGoal.isPending}
                    aria-label={`Set ${career.title} as a goal`}
                    onClick={() => choose(career.id)}
                    className={cn('h-9 shrink-0', outlineButtonClass, busyButtonClass)}
                  >
                    {busy && <Loader2 className="animate-spin" />}
                    Set as goal
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <ErrorNote error={addGoal.error} className="mt-2" />
        <p className="mt-3 text-sm text-text-2">
          <Link to="/explore?tab=occupations" className={linkClass}>
            All careers
          </Link>
          {' · '}
          <Link to="/map" className={linkClass}>
            Open the map
          </Link>
        </p>
      </div>
    </PageSection>
  );
}
