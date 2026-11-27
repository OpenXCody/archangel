import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, focusRing, plural } from '@/lib/utils';
import {
  goalNextSkills,
  useCareersInReach,
  type NextSkill,
  useAddGoal,
  useMyGoals,
  useMySkills,
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
import GoalPlate, { GoalPlateGround } from '../atlas/GoalPlate';
import { useAtlasModel } from '../atlas/useAtlasModel';
import { ShareRing } from '../path/HeldShare';
import { SkillsLine } from '../path/SkillsLine';
import { accountKeys } from '../../lib/queryKeys';
import { reachOrClosest } from '@shared/reach';
import { linkClass, RemovedRow } from './parts';

export default function GoalsSection() {
  const queryClient = useQueryClient();
  const goals = useMyGoals();
  const removeGoal = useRemoveGoal();
  const addGoal = useAddGoal();
  // Goals removed while this page is open keep their place until it is left, with a way back.
  const [removed, setRemoved] = useState<MyGoal[]>([]);

  // Each goal's career as a small plate, filled as far as the person holds it. The plates read the taxonomy
  // and the person's skills, which the Skills section below reads too: no request of their own.
  const { model } = useAtlasModel();
  const mySkills = useMySkills();
  const statusById = useMemo(() => new Map((mySkills.data ?? []).map((skill) => [skill.skillId, skill.status])), [mySkills.data]);
  const statusOf = useCallback((skillId: string) => statusById.get(skillId), [statusById]);

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
        <>
        {/* The ground every goal's small plate shows, drawn once. */}
        {model && model.N > 0 && <GoalPlateGround />}
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
              <li key={goal.occupationId} className={cn(rowClass, 'flex items-center gap-3 py-4')} data-goal={goal.occupationId}>
                {/* The career on the Atlas, small: how much of it is filled. It opens the career's page at its path, the route. */}
                {model && model.N > 0 && goal.skillIds && goal.skillIds.length > 0 && (
                  <Link
                    to={`/occupations/${goal.occupationId}#skills`}
                    aria-label={`Path of ${goal.title}`}
                    data-goal-plate-link
                    className={cn('-my-1 -ml-1 shrink-0 self-start rounded-full p-1 transition-opacity hover:opacity-80', focusRing)}
                  >
                    <GoalPlate model={model} skillIds={goal.skillIds} statusOf={statusOf} className="h-16 w-16" />
                  </Link>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/occupations/${goal.occupationId}`}
                    data-goal-link
                    className="block truncate text-sm font-medium text-text-1 hover:underline"
                  >
                    {goal.title}
                  </Link>
                  {goal.totalSkills > 0 ? (
                    // The same ring the career's own page carries above its path.
                    <p className="mt-1 flex items-center gap-2 text-sm text-text-2" data-goal-held>
                      <ShareRing share={{ held: goal.heldSkills, learning: 0, total: goal.totalSkills }} className="h-4 w-4" />
                      <span>
                        <span className="font-semibold tabular-nums text-text-1">
                          {goal.heldSkills} of {goal.totalSkills}
                        </span>{' '}
                        skills held
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-text-2">Path not written yet.</p>
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
                  className="-mr-3 h-11 w-11 shrink-0"
                >
                  {removing ? <Loader2 className="animate-spin" /> : <X />}
                </Button>
              </li>
            );
          })}
        </ul>
        </>
      )}
      <ErrorNote error={removeGoal.error ?? addGoal.error} className="mt-2" />
      <CareersInReach />
    </PageSection>
  );
}

/** The skills to pick up next for a career: the one line a goal and a career within reach both carry. */
function NextSkills({ next, className }: { next: NextSkill[]; className?: string }) {
  return <SkillsLine lead="Next" skills={next} className={className} />;
}

/** How many careers within reach are listed before "Show all". */
const REACH_SHOWN = 4;

/**
 * Careers the person's held skills already cover a third of, closest first:
 * the same rule a military career's page lists civilian careers by. With none
 * that near, the closest careers under their own heading. Renders nothing
 * until there is something to show: a person with no held skills sees no
 * heading and no placeholder.
 */
function CareersInReach() {
  const reach = useCareersInReach();
  const [showAll, setShowAll] = useState(false);

  if (reach.isError && !reach.data) {
    return (
      <div className="mt-8">
        <h3 className="mb-2 text-sm font-medium text-text-2">Within reach</h3>
        <LoadError error={reach.error} onRetry={() => void reach.refetch()} retrying={reach.isFetching} />
      </div>
    );
  }
  if (!reach.data || reach.data.length === 0) return null;
  // "Within reach" means one thing wherever it is said: a third of a path of five skills or more (shared/reach.ts).
  // A person whose skills reach no career yet is shown the closest ones, under those words.
  const listed = reachOrClosest(reach.data);
  const careers = showAll ? listed.careers : listed.careers.slice(0, REACH_SHOWN);

  return (
    <div className="mt-8" data-careers-in-reach={listed.within ? 'within' : 'closest'}>
      <h3 className="mb-2 text-sm font-medium text-text-2">{listed.within ? 'Within reach' : 'Closest careers'}</h3>
      <ul className={cardClass}>
        {careers.map((career) => (
          <li key={career.id} className={cn(rowClass, 'py-3')}>
            <div className="flex items-baseline gap-3">
              <Link
                to={`/occupations/${career.id}`}
                className="min-w-0 flex-1 break-words text-sm font-medium text-text-1 hover:underline"
              >
                {career.title}
              </Link>
              <span className="inline-flex shrink-0 items-center gap-1.5 self-center text-sm tabular-nums text-text-2" aria-label={`${career.held} of ${career.total} skills held`}>
                {career.held} of {career.total}
                <ShareRing share={{ held: career.held, learning: 0, total: career.total }} className="h-3.5 w-3.5" />
              </span>
            </div>
            <NextSkills next={career.next} className="mt-0.5" />
            {/* Where the work is: the jobs open for it now. */}
            {(career.openJobs ?? 0) > 0 && (
              <Link to={`/jobs?career=${career.id}`} className="mt-0.5 inline-block py-1 text-xs text-text-2 underline hover:text-text-1" data-reach-jobs>
                {plural(career.openJobs ?? 0, 'open job', 'open jobs')}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {!showAll && listed.careers.length > REACH_SHOWN && (
        <button type="button" onClick={() => setShowAll(true)} className={cn(textButtonClass, 'mt-3')}>
          Show all
        </button>
      )}
    </div>
  );
}
