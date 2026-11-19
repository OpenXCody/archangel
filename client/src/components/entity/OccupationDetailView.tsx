import { Link, useLocation } from 'react-router-dom';
import GoalButton from '../account/GoalButton';
import { SkillHeldToggle } from '../account/SkillStatusButton';
import { ErrorNote } from '../account/parts';
import { signInPath, useAccount } from '../../lib/account';
import { useMarkSkill, type SkillMark, useMySkills, type SkillStatus } from '../../lib/seeker';
import { useSeekerTools } from '../../lib/viewer';
import { type OccupationDetail, type RelatedSkill } from '../../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { cityState, stateName } from '../../lib/places';
import {
  DetailHeader,
  DetailSection,
  RecordList,
  RecordRow,
} from '../layout/Page';
import { type Head, STAGES, StageHeading, UNSTAGED, OpenJobsSection, IndustryRows } from './parts';

/**
 * One skill on a career's path. Signed out, the row is a link to the skill.
 * For a seeker the mark at its head sets the skill held (or clears it) in
 * place, and the rest of the row is the link.
 */
function PathSkill({
  skill,
  status,
  onMark,
  disabled,
}: {
  skill: RelatedSkill;
  status: SkillStatus | undefined;
  /** Present for a signed-in seeker. */
  onMark?: (mark: SkillMark) => void;
  disabled?: boolean;
}) {
  if (!onMark) return <RecordRow to={`/skills/${skill.id}`} title={skill.name} />;
  return (
    <RecordRow
      to={`/skills/${skill.id}`}
      title={skill.name}
      control={<SkillHeldToggle label={skill.name} value={status ?? 'none'} onChange={onMark} disabled={disabled} />}
      data-path-skill={skill.id}
      data-status={status ?? 'none'}
    />
  );
}

// Career (occupation) detail: the path of skills by stage, where the work is done, open jobs, and the plants that have it.
export default function OccupationDetailView({ data, head }: { data: OccupationDetail; head: Head }) {
  const { data: account } = useAccount();
  // Marks and "You have N of M" are a seeker's: someone here to hire reads the path as a visitor does.
  const seekerTools = useSeekerTools();
  const signedIn = Boolean(account?.user) && seekerTools;
  const { data: mySkills, isPending: skillsPending } = useMySkills(signedIn);
  const statusBySkill = new Map((mySkills ?? []).map((s) => [s.skillId, s.status]));
  const markSkill = useMarkSkill();
  const { pathname, search } = useLocation();

  const skills = data.skills ?? [];
  const jobs = data.jobs ?? [];
  const plants = data.factories ?? [];
  const counted = plants.some((plant) => (plant.headcount ?? 0) > 0);
  const heldCount = skills.filter((s) => statusBySkill.get(s.id) === 'held').length;
  const staged = STAGES.map((def) => ({ ...def, skills: skills.filter((s) => s.stage === def.stage) }));
  const unstaged = skills.filter((s) => !s.stage);
  const hasStages = staged.some((group) => group.skills.length > 0);

  const pathSkill = (skill: RelatedSkill) => (
    <PathSkill
      key={skill.id}
      skill={skill}
      status={statusBySkill.get(skill.id)}
      disabled={skillsPending}
      onMark={signedIn ? (mark) => markSkill.mutate({ skillId: skill.id, name: skill.name, mark }) : undefined}
    />
  );

  return (
    <>
      <DetailHeader
        {...head}
        kind="Career"
        title={data.title}
        description={data.description}
        action={
          <>
            <GoalButton occupationId={data.id} />
            {signedIn && skills.length > 0 && (
              <span className="text-sm text-fg-muted" data-held-count>
                You have <span className="font-medium tabular-nums text-fg-default">{heldCount}</span> of {skills.length} skills
              </span>
            )}
          </>
        }
      />

      {/* What it is: the path, skills in the order they are learned */}
      {skills.length === 0 && (
        <DetailSection id="skills" title="Path">
          <p className="text-sm text-fg-muted">Path not written yet.</p>
        </DetailSection>
      )}
      {skills.length > 0 && (
        <DetailSection
          id="skills"
          title={hasStages ? 'Path' : 'Skills'}
          note={
            hasStages && data.pathStatus === 'draft' ? (
              // Honest without undermining the page: one quiet word, with the sentence for anyone who asks.
              <details className="group text-xs text-fg-soft" data-draft-path>
                <summary className="inline-flex min-h-6 cursor-pointer list-none items-center underline decoration-dotted underline-offset-4 hover:text-fg-muted [&::-webkit-details-marker]:hidden">
                  Draft
                </summary>
                <p className="mt-1 max-w-prose text-sm text-fg-muted">A starting point that has not been reviewed by a person yet.</p>
              </details>
            ) : undefined
          }
        >
          {signedIn && <ErrorNote error={markSkill.error} className="mb-3" />}
          {hasStages ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {staged.map((group) => (
                <div key={group.stage} className="min-w-0">
                  <StageHeading number={group.stage} label={group.label} hint={group.hint} />
                  {group.skills.length > 0 ? (
                    <RecordList>{group.skills.map(pathSkill)}</RecordList>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border-subtle p-3 text-sm text-fg-soft">Nothing at this stage yet.</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {unstaged.length > 0 && (
            <div className={hasStages ? 'mt-6' : ''}>
              {hasStages && <StageHeading label={UNSTAGED} />}
              <RecordList>{unstaged.map(pathSkill)}</RecordList>
            </div>
          )}
          {account && !signedIn && seekerTools && (
            <p className="mt-4 text-sm text-fg-soft">
              <Link to={signInPath(`${pathname}${search}`)} className="text-fg-muted underline underline-offset-2 hover:text-fg-default">
                Sign in
              </Link>{' '}
              to mark the skills you have.
            </p>
          )}
        </DetailSection>
      )}

      <WhereWorkIsDone data={data} />

      {/* Like the company and plant pages: a section only when there is a job to show. */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} />}

      {/* Plants where this career is on record */}
      {plants.length > 0 && (
        <DetailSection id="factories" title="Plants with this career" column={counted ? 'People' : undefined}>
          <RecordList>
            {plants.map((plant) => {
              const plantName = formatFactoryName(plant.name);
              const company = plant.companyName ? formatCompanyName(plant.companyName) : null;
              return (
                <RecordRow
                  key={plant.id}
                  to={`/factories/${plant.id}`}
                  title={plantName}
                  // The company is said only when the plant is not simply named after it.
                  subtitle={
                    [company && !plantName.toLowerCase().startsWith(company.toLowerCase()) ? company : null, cityState(plant.city, plant.state)]
                      .filter(Boolean)
                      .join(' · ') || null
                  }
                  figure={counted ? (plant.headcount ?? 0) || null : undefined}
                  figureLabel="people"
                />
              );
            })}
          </RecordList>
        </DetailSection>
      )}
    </>
  );
}

/** A place that opens on the map: the one thing on these pages drawn as a chip. */
const placeChipClass =
  'inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 text-sm text-fg-muted transition-colors hover:bg-tint/5 hover:text-fg-default sm:min-h-9';

/**
 * Where a career's work is done: the industries that typically have it, with
 * how many plants each has, and the states with the most of them (each opens
 * on the map). It describes industries, not what any one plant employs.
 */
function WhereWorkIsDone({ data }: { data: OccupationDetail }) {
  const industries = data.industries ?? [];
  const states = data.topStates ?? [];
  if (industries.length === 0 && !data.everywhere) return null;
  return (
    <DetailSection id="where" title="Where this work is done" column={data.everywhere ? undefined : 'Plants'}>
      {data.everywhere ? (
        <p className="text-sm text-fg-muted">Plants of every industry.</p>
      ) : (
        <>
          <IndustryRows industries={industries} />
          {data.elsewhereToo && <p className="mt-2 text-xs text-fg-soft">And plants of every other industry.</p>}
          {states.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-fg-soft">Most plants in these industries</p>
              <div className="flex flex-wrap gap-2">
                {states.map((state) => (
                  <Link key={state.code} to={`/map?state=${state.code}`} className={placeChipClass}>
                    {stateName(state.code)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </DetailSection>
  );
}
