import { lazy, Suspense, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ErrorNote } from '../account/parts';
import { signInPath } from '../../lib/account';
import { type OccupationDetail } from '../../lib/api';
import { useViewer } from '../../lib/viewer';
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
import { RecordTag, RecordTags } from '../layout/RecordTag';
import { ShareRing } from '../path/HeldShare';
import { shareOf } from '../path/model';
import { CivilianReach } from '../reach/CivilianReach';
import { useSkillMarks } from '../path/useSkillMarks';
import { Route } from '../route/Route';
import { RouteAlone } from '../route/RouteLadder';
import { type Head, OpenJobsSection, IndustryRows, MilitaryCareerRows, factLinkClass } from './parts';

// The path on the Atlas arrives with the Atlas's own code, only when that view is asked for.
const CareerAtlas = lazy(() => import('../atlas/CareerAtlas'));

/**
 * Career (occupation) detail: the path of skills drawn as a route, where the
 * work is done, open jobs, and the factories that have it.
 *
 * The path is the page. It reads a person's marks and changes none: a seeker
 * sees how much of the career they hold directly above the route, and the
 * route says what is next and how much of each section is held. Setting a goal
 * and marking a skill are done on Profile, never here.
 *
 * A military career (a Navy rating, an Army MOS, an Air Force specialty) is
 * the same page. Its kind and code stand above the name ("Navy rating · HT"),
 * the name is the service's own title for the job, and its service is the tag
 * under it, which leads to the service's page. It is where a person comes
 * from, not where they are going, so where it leads comes first: the civilian
 * careers within reach, as a flow from its skills to those careers to their
 * industries (`CivilianReach`), then its path. It has no ladder, industries,
 * jobs, companies or factories of its own, and draws none.
 */
export default function OccupationDetailView({ data, head }: { data: OccupationDetail; head: Head }) {
  // Marks and progress are a seeker's: a visitor, or someone here to hire, reads the same diagram without them.
  const { marks, canSignIn, error: markError } = useSkillMarks();
  const { pathname, search } = useLocation();
  const viewer = useViewer();

  const skills = data.skills ?? [];
  const jobs = data.jobs ?? [];
  const plants = data.factories ?? [];
  const counted = plants.some((plant) => (plant.headcount ?? 0) > 0);
  // Any career with skills has a path to draw, whether or not anyone has written one for it (`pathStatus`:
  // that only decides the word "Draft"). The skills arrive in the route's order and are drawn in it.
  const whole = marks && skills.length > 0 ? shareOf(skills, marks) : null;
  const onLadder = (data.comesFrom?.length ?? 0) + (data.leadsTo?.length ?? 0) > 0;
  // Companies that say how this career is done with them: each row opens that company's version.
  const versions = data.versions ?? [];
  // Where people come to this career from the services: computed from the two paths, never stored.
  const reachedBy = data.reachedBy ?? [];
  const [showAllVersions, setShowAllVersions] = useState(false);
  // The path as a route, or on the Atlas: from the address, else as last shown in this visit.
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
        // A military career belongs to its service: named under the title as the record the page belongs to, the way
        // a factory names its company. No mark: a service's is a lettermark on purpose, and three of them are a "U".
        qualifier={
          service && (
            <RecordTags>
              <RecordTag to={`/companies/${service.slug ?? service.id}`} kind="Military service" name={service.name} data-career-service="" />
            </RecordTags>
          )
        }
        description={data.description}
        action={
          <>
            {/* The page has no action of its own: goals and marks are made on Profile. A seeker is shown how much of the path they hold. */}
            {whole && (
              <span className="inline-flex items-center gap-2 text-sm text-text-2" data-held-count>
                <ShareRing share={whole} className="h-[22px] w-[22px]" />
                <span>
                  You have <span className="font-medium tabular-nums text-text-1">{whole.held}</span> of {whole.total} {whole.total === 1 ? 'skill' : 'skills'}
                </span>
              </span>
            )}
          </>
        }
      >
        {/* Its home: the domain most of its work is in, which opens the Careers list narrowed to it (for a
            military career, the military careers of that home). */}
        {data.home && (
          <DetailFacts>
            <Link to={`/explore?tab=occupations${service ? '&military=1' : ''}&domain=${data.home.slug}`} className={factLinkClass} data-career-home>
              {data.home.name}
            </Link>
          </DetailFacts>
        )}
      </DetailHeader>

      {/* A military career: where it leads, first, since that is what its page is read for. Its skills by group, the
          civilian careers its path covers a third or more of (the most covered first), and their industries. */}
      {service && withinReach.length > 0 && (
        // Keyed by the career: going from one military career to another starts again at the closest.
        <CivilianReach key={data.id} careerId={data.id} careerTitle={data.officialTitle ?? data.title} skills={skills} careers={withinReach} />
      )}

      {/* What it is: the path, from the foundation to the specialties */}
      {skills.length === 0 && (
        <DetailSection id="skills" title="Path">
          {onLadder ? (
            // No skills to lay out yet, but the career still has its place between others.
            <RouteAlone comesFrom={data.comesFrom} leadsTo={data.leadsTo}>
              Path not written yet.
            </RouteAlone>
          ) : (
            <p className="text-sm text-text-2">Path not written yet.</p>
          )}
        </DetailSection>
      )}
      {skills.length > 0 && (
        <DetailSection
          id="skills"
          title="Path"
          note={
            data.pathStatus === 'draft' && viewer.admin ? (
              // For an admin only: whether a person has reviewed the path is the admin's business, not a reader's.
              <details className="group text-xs text-text-3" data-draft-path>
                <summary className="inline-flex min-h-6 cursor-pointer list-none items-center underline decoration-dotted [&::-webkit-details-marker]:hidden">
                  Draft
                </summary>
                <p className="mt-1 max-w-prose text-sm text-text-2">A starting point that has not been reviewed by a person yet.</p>
              </details>
            ) : undefined
          }
          // Two views of one path: the route, and the same skills on the Atlas among all the others.
          action={<PathViewSwitch current={pathView} />}
        >
          {marks && <ErrorNote error={markError} className="mb-3" />}
          {pathView === 'route' && <Route skills={skills} marks={marks} comesFrom={data.comesFrom} leadsTo={data.leadsTo} keepAs={data.id} />}
          {pathView === 'atlas' && (
            <Suspense fallback={<PlateSkeleton className="mx-auto max-w-md" />}>
              <CareerAtlas career={data} marks={marks} />
            </Suspense>
          )}
          {canSignIn && (
            <p className="mt-4 text-sm text-text-3">
              <Link to={signInPath(`${pathname}${search}`)} className="text-text-1 underline">
                Sign in
              </Link>{' '}
              to see which of these skills you have.
            </p>
          )}
        </DetailSection>
      )}

      <WhereWorkIsDone data={data} />

      {/* Like the company and factory pages: a section only when there is a job to show. */}
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

      {/* Factories where this career is on record */}
      {plants.length > 0 && (
        <DetailSection id="factories" title="Factories with this career" column={counted ? 'People' : undefined}>
          <RecordList>
            {plants.map((plant) => {
              const plantName = formatFactoryName(plant.name);
              const company = plant.companyName ? formatCompanyName(plant.companyName) : null;
              return (
                <RecordRow
                  key={plant.id}
                  to={`/factories/${plant.id}`}
                  title={plantName}
                  // The company is said only when the factory is not simply named after it.
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

/** The longest title a career of the catalogue has, in letters: a military career's own title past this is set smaller on a phone. */
const LONG_TITLE = 40;

/** How many companies with a version are listed before "Show all". */
const VERSIONS_SHOWN = 8;

/** A place that opens on the map: the one thing on these pages drawn as a chip. */
const placeChipClass =
  'inline-flex min-h-11 items-center rounded-md border border-line-strong px-3 text-sm text-text-2 transition-colors hover:bg-surface-hover hover:text-text-1 sm:min-h-9';

/**
 * Where a career's work is done: the industries that typically have it, with
 * how many factories each has, and the states with the most of them (each opens
 * on the map). It describes industries, not what any one factory employs.
 */
function WhereWorkIsDone({ data }: { data: OccupationDetail }) {
  const industries = data.industries ?? [];
  const states = data.topStates ?? [];
  if (industries.length === 0 && !data.everywhere) return null;
  return (
    <DetailSection id="where" title="Where this work is done" column={data.everywhere ? undefined : 'Factories'}>
      {data.everywhere ? (
        <p className="text-sm text-text-2">Factories of every industry.</p>
      ) : (
        <>
          <IndustryRows industries={industries} />
          {data.elsewhereToo && <p className="mt-2 text-xs text-text-3">And factories of every other industry.</p>}
          {states.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-text-3">Most factories in these industries</p>
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
