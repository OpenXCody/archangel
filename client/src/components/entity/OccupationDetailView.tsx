import { lazy, Suspense, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import DoneButton from '../account/DoneButton';
import GoalButton from '../account/GoalButton';
import { ErrorNote } from '../account/parts';
import { signInPath } from '../../lib/account';
import { type CareerWithinReach, type OccupationDetail } from '../../lib/api';
import { kindLine } from '@shared/military';
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
} from '../layout/Page';
import PathViewSwitch, { usePathView } from '../atlas/PathViewSwitch';
import PlateSkeleton from '../atlas/PlateSkeleton';
import { atlasHref } from '../atlas/state';
import { ShareRing } from '../path/HeldShare';
import { LadderAlone, PathFlow } from '../path/PathFlow';
import { SkillGroupBox } from '../path/SkillGroupBox';
import { SkillsLine } from '../path/SkillsLine';
import { buildPath, shareOf } from '../path/model';
import { useSkillMarks } from '../path/useSkillMarks';
import { type Head, UNPLACED, OpenJobsSection, IndustryRows, MilitaryCareerRows, factLinkClass } from './parts';

// The path on the Atlas arrives with the Atlas's own code, only when that view is asked for.
const CareerAtlas = lazy(() => import('../atlas/CareerAtlas'));

/**
 * Career (occupation) detail: the path of skills drawn as a flow, where the
 * work is done, open jobs, and the plants that have it.
 *
 * The path is the page: the heading block's action ("Set as goal") and the
 * person's progress over the whole career sit together directly above it,
 * and the diagram carries the same progress for each level and each group.
 *
 * A military career (a Navy rating, an Army MOS, an Air Force specialty) is
 * the same page. Its kind and code stand above the name ("Navy rating · HT"),
 * the name is the service's own title for the job, and its service is a quiet
 * fact that leads to the service's page. It is where a person comes from, not
 * where they are going: it is no goal, and for a seeker its one action is
 * "I have done this" (its skills marked held in one tap). After the path it
 * lists the civilian careers within reach, each with the skills missing. It
 * has no ladder, industries, jobs, companies or plants, and draws none.
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
  // Where people come to this career from the services: computed from the two paths, never stored.
  const reachedBy = data.reachedBy ?? [];
  const [showAllVersions, setShowAllVersions] = useState(false);
  // The path as a flow, or on the Atlas: from the address, else as last shown in this visit.
  const pathView = usePathView();
  // A military career: the service it belongs to, and the civilian careers its path covers.
  const service = data.service ?? null;
  const withinReach = data.withinReach ?? [];

  return (
    <>
      <DetailHeader
        {...head}
        // "Navy rating · HT" says the service once, so the name under it is the service's own title for the job.
        kind={service ? (kindLine(data.kind, data.code) ?? 'Career') : 'Career'}
        title={service ? (data.officialTitle ?? data.title) : data.title}
        // A service's title for a job can run far past any career's of the catalogue ("Test, Measurement and
        // Diagnostic Equipment Maintenance Support Specialist"): at the page-title size it fills a phone's screen.
        longTitle={Boolean(service) && (data.officialTitle ?? data.title).length > LONG_TITLE}
        description={data.description}
        action={
          <>
            {/* A military career is where a person comes from, never a goal: its action is to say so. */}
            {service ? <DoneButton occupationId={data.id} whole={whole !== null && whole.held === whole.total} /> : <GoalButton occupationId={data.id} />}
            {whole && (
              <span className="inline-flex items-center gap-2 text-sm text-text-2" data-held-count>
                <ShareRing share={whole} className="h-5 w-5" />
                <span>
                  You have <span className="font-medium tabular-nums text-text-1">{whole.held}</span> of {whole.total} {whole.total === 1 ? 'skill' : 'skills'}
                </span>
              </span>
            )}
          </>
        }
      >
        {/* Its service, which leads to the service's page; then its home: the domain most of its work is in,
            which opens the Careers list narrowed to it (for a military career, the military careers of that home). */}
        {(service || data.home) && (
          <DetailFacts>
            {service && (
              <Link to={`/companies/${service.slug ?? service.id}`} className={factLinkClass} data-career-service>
                {service.name}
              </Link>
            )}
            {service && data.home && ' · '}
            {data.home && (
              <Link to={`/explore?tab=occupations${service ? '&military=1' : ''}&domain=${data.home.slug}`} className={factLinkClass} data-career-home>
                {data.home.name}
              </Link>
            )}
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
            <p className="text-sm text-text-2">Path not written yet.</p>
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
              <details className="group text-xs text-text-3" data-draft-path>
                <summary className="inline-flex min-h-6 cursor-pointer list-none items-center underline decoration-dotted [&::-webkit-details-marker]:hidden">
                  Draft
                </summary>
                <p className="mt-1 max-w-prose text-sm text-text-2">A starting point that has not been reviewed by a person yet.</p>
              </details>
            ) : undefined
          }
          action={
            hasPath ? (
              // Two views of one path: the flow, and the same skills on the Atlas among all the others.
              <PathViewSwitch current={pathView} />
            ) : undefined
          }
        >
          {marks && <ErrorNote error={markError} className="mb-3" />}
          {hasPath && pathView === 'flow' && <PathFlow path={path} marks={marks} comesFrom={data.comesFrom} leadsTo={data.leadsTo} />}
          {hasPath && pathView === 'atlas' && (
            <Suspense fallback={<PlateSkeleton className="mx-auto max-w-md" />}>
              <CareerAtlas career={data} path={path} marks={marks} />
            </Suspense>
          )}
          {path.unplaced.length > 0 && <SkillGroupBox name={UNPLACED} skills={path.unplaced} marks={marks} className={hasPath ? 'mt-4' : undefined} />}
          {canSignIn && (
            <p className="mt-4 text-sm text-text-3">
              <Link to={signInPath(`${pathname}${search}`)} className="text-text-1 underline">
                Sign in
              </Link>{' '}
              to mark the skills you have.
            </p>
          )}
        </DetailSection>
      )}

      {/* A military career: where it leads. The civilian careers its path covers a third or more of, the most covered first. */}
      {service && withinReach.length > 0 && <WithinReach career={data} careers={withinReach} />}

      <WhereWorkIsDone data={data} />

      {/* Like the company and plant pages: a section only when there is a job to show. */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs} total={data.openJobCount} all={`/jobs?career=${data.id}`} />}

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
                  lead={<CompanyLogo name={company} domain={version.company.domain} size={32} />}
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

      {/* Last, and only when some do: the military careers whose path covers a third or more of this one's. */}
      {reachedBy.length > 0 && (
        <DetailSection id="military" title="Military careers that reach this" description="How much of this path each already covers.">
          <MilitaryCareerRows careers={reachedBy} data-reached-by="" />
        </DetailSection>
      )}
    </>
  );
}

/** How many civilian careers within reach are listed before "Show all", and how many missing skills a row names. */
const REACH_SHOWN = 5;
const MISSING_NAMED = 4;

/** The longest title a career of the catalogue has, in letters: a military career's own title past this is set smaller on a phone. */
const LONG_TITLE = 40;

/**
 * "Civilian careers within reach": for a military career, the civilian
 * careers whose path it already holds a third or more of. Each row leads to
 * the career and says how much of that career's path this one holds; under
 * it, the skills missing, lowest level first, and the two careers compared on
 * the Atlas. Computed from the two paths: nothing here is a stored link.
 */
function WithinReach({ career, careers }: { career: OccupationDetail; careers: CareerWithinReach[] }) {
  const [showAll, setShowAll] = useState(false);
  // A list a row or two longer than the cut is shown whole.
  const cut = careers.length > REACH_SHOWN + 2;
  return (
    <DetailSection id="reach" title="Civilian careers within reach" description="How much of each career's path this one already covers, and the skills missing.">
      <RecordList data-within-reach="">
        {(showAll || !cut ? careers : careers.slice(0, REACH_SHOWN)).map((other) => (
          <RecordRow
            key={other.id}
            to={`/occupations/${other.id}`}
            title={other.title}
            subtitle={`${other.held} of ${other.total} skills`}
            data-reach-career={other.id}
            below={
              <>
                <SkillsLine
                  lead="Missing"
                  skills={other.missing.slice(0, MISSING_NAMED)}
                  more={Math.max(0, other.missing.length - MISSING_NAMED)}
                  // No wider than a line reads: on a wide screen it does not run under the row's chevron.
                  className="max-w-prose text-xs leading-relaxed"
                />
                {/* The two paths on one plate: this career's skills a disc, the other's a ring. */}
                <Link
                  to={atlasHref({ career: career.id, with: other.id })}
                  className="mt-0.5 inline-block py-1 text-xs text-text-2 underline hover:text-text-1"
                  // The same words under every row: said with the career's name to someone who hears the links alone.
                  aria-label={`Compare with ${other.title} on the atlas`}
                  data-reach-compare
                >
                  Compare on the atlas
                </Link>
              </>
            }
          />
        ))}
      </RecordList>
      {cut && <ShowAll open={showAll} total={careers.length} onToggle={() => setShowAll((value) => !value)} />}
    </DetailSection>
  );
}

/** How many companies with a version are listed before "Show all". */
const VERSIONS_SHOWN = 8;

/** A place that opens on the map: the one thing on these pages drawn as a chip. */
const placeChipClass =
  'inline-flex min-h-11 items-center rounded-md border border-line-strong px-3 text-sm text-text-2 transition-colors hover:bg-surface-hover hover:text-text-1 sm:min-h-9';

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
        <p className="text-sm text-text-2">Plants of every industry.</p>
      ) : (
        <>
          <IndustryRows industries={industries} />
          {data.elsewhereToo && <p className="mt-2 text-xs text-text-3">And plants of every other industry.</p>}
          {states.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-text-3">Most plants in these industries</p>
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
