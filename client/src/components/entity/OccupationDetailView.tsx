import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import GoalButton from '../account/GoalButton';
import { ErrorNote } from '../account/parts';
import { signInPath } from '../../lib/account';
import { type OccupationDetail } from '../../lib/api';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { versionPath } from '@shared/versions';
import CompanyLogo from '../CompanyLogo';
import { versionLine } from '../../lib/versions';
import { cityState, stateName } from '../../lib/places';
import {
  DetailFacts,
  DetailHeader,
  DetailSection,
  RecordList,
  RecordRow,
  ShowAll,
  sectionLinkClass,
} from '../layout/Page';
import { ShareRing } from '../path/HeldShare';
import { LadderAlone, PathFlow } from '../path/PathFlow';
import { SkillGroupBox } from '../path/SkillGroupBox';
import { buildPath, shareOf } from '../path/model';
import { useSkillMarks } from '../path/useSkillMarks';
import { type Head, UNPLACED, OpenJobsSection, IndustryRows, factLinkClass } from './parts';

/**
 * Career (occupation) detail: the path of skills drawn as a flow, where the
 * work is done, open jobs, and the plants that have it.
 *
 * The path is the page: the heading block's action ("Set as goal") and the
 * person's progress over the whole career sit together directly above it,
 * and the diagram carries the same progress for each level and each group.
 */
export default function OccupationDetailView({ data, head }: { data: OccupationDetail; head: Head }) {
  // Marks and progress are a seeker's: a visitor, or someone here to hire, reads the same diagram without them.
  const { marks, canSignIn, error: markError } = useSkillMarks();
  const { pathname, search } = useLocation();

  const skills = data.skills ?? [];
  const jobs = data.jobs ?? [];
  const plants = data.factories ?? [];
  const counted = plants.some((plant) => (plant.headcount ?? 0) > 0);
  const path = buildPath(skills);
  // Every skill has its own level and group, so any career with skills has a path to draw, whether or not
  // anyone has written one for it (`pathStatus`: that only decides the word "Draft"). Only skills that no
  // taxonomy has placed (a database nothing was loaded into) are left to list by themselves.
  const hasPath = path.levels.some((level) => level.groups.length > 0);
  const whole = marks && skills.length > 0 ? shareOf(skills, marks) : null;
  const onLadder = (data.comesFrom?.length ?? 0) + (data.leadsTo?.length ?? 0) > 0;
  // Companies that say how this career is done with them: each row opens that company's version.
  const versions = data.versions ?? [];
  const [showAllVersions, setShowAllVersions] = useState(false);

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
            {whole && (
              <span className="inline-flex items-center gap-2 text-sm text-fg-muted" data-held-count>
                <ShareRing share={whole} className="h-5 w-5" />
                <span>
                  You have <span className="font-medium tabular-nums text-fg-default">{whole.held}</span> of {whole.total} {whole.total === 1 ? 'skill' : 'skills'}
                </span>
              </span>
            )}
          </>
        }
      >
        {/* Its home: the domain most of its work is in, which opens the Careers list narrowed to it. */}
        {data.home && (
          <DetailFacts>
            <Link to={`/explore?tab=occupations&domain=${data.home.slug}`} className={factLinkClass} data-career-home>
              {data.home.name}
            </Link>
          </DetailFacts>
        )}
      </DetailHeader>

      {/* What it is: the path, from the foundation to the specialties */}
      {skills.length === 0 && (
        <DetailSection id="skills" title="Path">
          {onLadder ? (
            // No skills to lay out yet, but the career still has its place between others.
            <LadderAlone comesFrom={data.comesFrom} leadsTo={data.leadsTo}>
              Path not written yet.
            </LadderAlone>
          ) : (
            <p className="text-sm text-fg-muted">Path not written yet.</p>
          )}
        </DetailSection>
      )}
      {skills.length > 0 && (
        <DetailSection
          id="skills"
          title={hasPath ? 'Path' : 'Skills'}
          note={
            hasPath && data.pathStatus === 'draft' ? (
              // Honest without undermining the page: one quiet word, with the sentence for anyone who asks.
              <details className="group text-xs text-fg-soft" data-draft-path>
                <summary className="inline-flex min-h-6 cursor-pointer list-none items-center underline decoration-dotted underline-offset-4 hover:text-fg-muted [&::-webkit-details-marker]:hidden">
                  Draft
                </summary>
                <p className="mt-1 max-w-prose text-sm text-fg-muted">A starting point that has not been reviewed by a person yet.</p>
              </details>
            ) : undefined
          }
          action={
            hasPath ? (
              // The same skills among all the others: the atlas opens with this career drawn on it.
              <Link to={`/atlas?career=${data.id}`} className={cn(sectionLinkClass, '-my-3 py-3')} data-atlas-link>
                See on the atlas
              </Link>
            ) : undefined
          }
        >
          {marks && <ErrorNote error={markError} className="mb-3" />}
          {hasPath && <PathFlow path={path} marks={marks} comesFrom={data.comesFrom} leadsTo={data.leadsTo} />}
          {path.unplaced.length > 0 && <SkillGroupBox name={UNPLACED} skills={path.unplaced} marks={marks} className={hasPath ? 'mt-4' : undefined} />}
          {canSignIn && (
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

      {/* Companies with their own version of this career: the page stays the standard, and says where it differs. */}
      {versions.length > 0 && (
        <DetailSection id="companies" title="Companies" description="Each says how this career is done there.">
          <RecordList data-career-versions="">
            {(showAllVersions ? versions : versions.slice(0, VERSIONS_SHOWN)).map((version) => {
              const company = formatCompanyName(version.company.name);
              return (
                <RecordRow
                  key={version.company.id}
                  to={versionPath(data.id, version.company)}
                  lead={<CompanyLogo name={company} domain={version.company.domain} size={28} />}
                  title={company}
                  subtitle={versionLine(version)}
                  data-career-version={version.company.id}
                />
              );
            })}
          </RecordList>
          {versions.length > VERSIONS_SHOWN && (
            <ShowAll open={showAllVersions} total={versions.length} onToggle={() => setShowAllVersions((value) => !value)} />
          )}
        </DetailSection>
      )}

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

/** How many companies with a version are listed before "Show all". */
const VERSIONS_SHOWN = 8;

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
