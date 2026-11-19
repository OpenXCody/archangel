import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  goalNextSkills,
  nextSkillNames,
  useCareersInReach,
  type NextSkill,
  useAddGoal,
  useMyGoals,
  useRemoveGoal,
  type MyGoal,
} from '../../lib/seeker';
import {
  CardNote,
  ErrorNote,
  LoadError,
  RowsSkeleton,
  cardClass,
  rowClass,
  textButtonClass,
} from '../account/parts';
import { PageSection } from '../layout/Page';
import { ShareRing } from '../path/HeldShare';
import { levelName } from '../../lib/stages';
import { accountKeys } from '../../lib/queryKeys';
import { linkClass, RemovedRow } from './parts';

export default function GoalsSection() {
  const queryClient = useQueryClient();
  const goals = useMyGoals();
  const removeGoal = useRemoveGoal();
  const addGoal = useAddGoal();
  // Goals removed while this page is open keep their place until it is left, with a way back.
  const [removed, setRemoved] = useState<MyGoal[]>([]);

  const refreshSuggestions = () => void queryClient.invalidateQueries({ queryKey: accountKeys.suggestedSkills });
  const removedIds = new Set(removed.map((goal) => goal.occupationId));
  const listed = [
    ...(goals.data ?? []).filter((goal) => !removedIds.has(goal.occupationId)),
    ...removed,
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <PageSection title="Goals" description="Careers you are aiming for, and the skills you hold toward each.">
      {goals.isPending ? (
        <RowsSkeleton rows={2} />
      ) : goals.isError ? (
        <LoadError error={goals.error} onRetry={() => void goals.refetch()} retrying={goals.isFetching} />
      ) : listed.length === 0 ? (
        <CardNote>
          None yet.{' '}
          <Link to="/explore?tab=occupations" className={linkClass}>
            Browse careers
          </Link>
        </CardNote>
      ) : (
        <ul className={cardClass}>
          {listed.map((goal) => {
            if (removedIds.has(goal.occupationId)) {
              return (
                <RemovedRow
                  key={goal.occupationId}
                  name={goal.title}
                  busy={addGoal.isPending && addGoal.variables === goal.occupationId}
                  onUndo={() =>
                    addGoal.mutate(goal.occupationId, {
                      onSuccess: () => {
                        setRemoved((current) => current.filter((each) => each.occupationId !== goal.occupationId));
                        refreshSuggestions();
                      },
                    })
                  }
                />
              );
            }
            const removing = removeGoal.isPending && removeGoal.variables === goal.occupationId;
            return (
              <li key={goal.occupationId} className={cn(rowClass, 'flex items-center gap-3 py-3 pl-4 pr-2')}>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/occupations/${goal.occupationId}`}
                    data-goal-link
                    className="block truncate text-sm font-medium text-fg-default underline-offset-4 hover:underline"
                  >
                    {goal.title}
                  </Link>
                  {goal.totalSkills > 0 ? (
                    // The same ring the career's own page carries beside "Set as goal".
                    <p className="mt-1 flex items-center gap-2 text-sm text-fg-muted" data-goal-held>
                      <ShareRing share={{ held: goal.heldSkills, learning: 0, total: goal.totalSkills }} className="h-4 w-4" />
                      <span>
                        <span className="font-semibold tabular-nums text-fg-default">
                          {goal.heldSkills} of {goal.totalSkills}
                        </span>{' '}
                        skills held
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-fg-muted">Path not written yet.</p>
                  )}
                  <NextSkills next={goalNextSkills(goal)} className="mt-1.5" />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${goal.title}`}
                  title="Remove"
                  aria-busy={removing}
                  onClick={() => {
                    if (removeGoal.isPending) return;
                    addGoal.reset();
                    removeGoal.mutate(goal.occupationId, {
                      onSuccess: () => {
                        setRemoved((current) => [...current, goal]);
                        refreshSuggestions();
                      },
                    });
                  }}
                  className="h-11 w-11 shrink-0 text-fg-muted hover:bg-bg-elevated hover:text-fg-default"
                >
                  {removing ? <Loader2 className="animate-spin" /> : <X />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ErrorNote error={removeGoal.error ?? addGoal.error} className="mt-2" />
      <CareersInReach />
    </PageSection>
  );
}

/**
 * The skills to pick up next for a career, as one line of text under the
 * level they are at: "Next, Fundamentals: Blueprint Reading, Lot Tracking".
 * They come lowest level first, so a second level is named only where the
 * first runs out. Nothing when none are left.
 */
function NextSkills({ next, className }: { next: NextSkill[]; className?: string }) {
  if (next.length === 0) return null;
  const runs: { level: string | null; skills: NextSkill[] }[] = [];
  for (const skill of next) {
    const level = levelName(skill.level);
    const last = runs[runs.length - 1];
    if (last && last.level === level) last.skills.push(skill);
    else runs.push({ level, skills: [skill] });
  }
  return (
    <p className={cn('break-words text-sm text-fg-muted', className)} data-next-skills>
      {runs.map((run, index) => (
        <span key={run.level ?? index}>
          {index > 0 && ' · '}
          <span className="text-fg-soft">
            {index === 0 ? (run.level ? `Next, ${run.level}:` : 'Next') : `${run.level}:`}
          </span>{' '}
          {nextSkillNames(run.skills)}
        </span>
      ))}
    </p>
  );
}

/** How many careers within reach are listed before "Show all". */
const REACH_SHOWN = 4;

/**
 * Careers the person's held skills already cover part of, closest first.
 * Renders nothing until there is something to show: a person with no held
 * skills sees no heading and no placeholder.
 */
function CareersInReach() {
  const reach = useCareersInReach();
  const [showAll, setShowAll] = useState(false);

  if (reach.isError && !reach.data) {
    return (
      <div className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-fg-muted">Within reach</h3>
        <LoadError error={reach.error} onRetry={() => void reach.refetch()} retrying={reach.isFetching} />
      </div>
    );
  }
  if (!reach.data || reach.data.length === 0) return null;
  const careers = showAll ? reach.data : reach.data.slice(0, REACH_SHOWN);

  return (
    <div className="mt-5" data-careers-in-reach>
      <h3 className="mb-2 text-sm font-medium text-fg-muted">Within reach</h3>
      <ul className={cardClass}>
        {careers.map((career) => (
          <li key={career.id} className={cn(rowClass, 'px-4 py-3')}>
            <div className="flex items-baseline gap-3">
              <Link
                to={`/occupations/${career.id}`}
                className="min-w-0 flex-1 break-words text-sm font-medium text-fg-default underline-offset-4 hover:underline"
              >
                {career.title}
              </Link>
              <span className="inline-flex shrink-0 items-center gap-1.5 self-center text-sm tabular-nums text-fg-muted" aria-label={`${career.held} of ${career.total} skills held`}>
                {career.held} of {career.total}
                <ShareRing share={{ held: career.held, learning: 0, total: career.total }} className="h-3.5 w-3.5" />
              </span>
            </div>
            <NextSkills next={career.next} className="mt-0.5" />
          </li>
        ))}
      </ul>
      {!showAll && reach.data.length > REACH_SHOWN && (
        <button type="button" onClick={() => setShowAll(true)} className={cn(textButtonClass, 'mt-3 px-1')}>
          Show all
        </button>
      )}
    </div>
  );
}
