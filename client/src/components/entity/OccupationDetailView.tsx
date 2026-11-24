import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorNote } from '../account/parts';
import { type CareerService, type OccupationDetail } from '../../lib/api';
import { cn, focusRing } from '@/lib/utils';
import { serviceShortName } from '@shared/military';
import { formatFactoryName, formatCompanyName } from '@shared/displayName';
import { versionPath } from '@shared/versions';
import CompanyLogo from '../CompanyLogo';
import { versionLine } from '../../lib/versions';
import { cityState } from '../../lib/places';
import { DetailHeader, DetailSection, RecordList, RecordRow, ShowAll } from '../layout/Page';
import { CivilianReach } from '../reach/CivilianReach';
import { useSkillMarks } from '../path/useSkillMarks';
import { CareerLadder } from '../route/CareerLadder';
import { SkillGroups } from '../route/SkillGroups';
import { type Head, OpenJobsSection, MilitaryCareerRows } from './parts';

/**
 * Career (occupation) detail. One story, told once, the same for a civilian
 * and a military career, in the contained system (`components/layout/Panel.tsx`):
 *
 * 1. What it is: the way back, the kind above the name, the name, and one or
 *    two sentences. Nothing else stands in the heading block. A military
 *    career's kind says its service, with the service's mark, and the
 *    service's word is the way to its page ("Air Force specialty · 2A7X1");
 *    its name is the service's own title for the job.
 * 2. Its skills, straight after (`SkillGroups`): one sentence that says how
 *    many skills in how many groups and why they stand in this order (and,
 *    for a seeker who holds some, how many), then one frame holding a
 *    connector tree (`Tree`): the career as the root, an elbow to each skill
 *    group, every group closed when the page arrives; a group opens its own
 *    branch of skills, and a skill opens what it is under itself
 *    (`SkillPreview`). Nothing asks anyone to sign in.
 * 3. Where it leads (a civilian career on a ladder): one panel, where people
 *    come from, this career, where it leads, as the same connector tree
 *    (`CareerLadder`). Its frame is the place the career's own Atlas will take.
 * 4. What else a person can do with it. A military career: the civilian
 *    careers within reach (`CivilianReach`), the same connector tree, the
 *    career its root and each civilian career a node that opens to what it
 *    asks that this path does not. A civilian career: its open
 *    jobs, the companies with their own version of it, the factories that
 *    have it on record, and last the military careers that reach it. Each a
 *    panel of rows. A section with nothing in it is not drawn, and nothing is
 *    listed twice.
 *
 * The page reads a person's marks and changes none: setting a goal and
 * marking a skill are done on Profile, never here.
 */

export default function OccupationDetailView({ data, head }: { data: OccupationDetail; head: Head }) {
  // Marks and progress are a seeker's: a visitor, or someone here to hire, reads the same skills without them.
  const { marks, error: markError } = useSkillMarks();

  const skills = useMemo(() => data.skills ?? [], [data.skills]);
  const jobs = data.jobs ?? [];
  const plants = data.factories ?? [];
  const counted = plants.some((plant) => (plant.headcount ?? 0) > 0);
  // Any career with skills has a path to draw, whether or not anyone has written one for it. Whether a
  // person has reviewed it (`pathStatus`) is said inside the admin's editor, behind Edit, never on the page.
  // The skills arrive in the route's order.
  const onLadder = (data.comesFrom?.length ?? 0) + (data.leadsTo?.length ?? 0) > 0;
  // Companies that say how this career is done with them: each row opens that company's version.
  const versions = data.versions ?? [];
  // Where people come to this career from the services: computed from the two paths, never stored.
  const reachedBy = data.reachedBy ?? [];
  const [showAllVersions, setShowAllVersions] = useState(false);
  // A military career: the service it belongs to, and the civilian careers its path covers.
  const service = data.service ?? null;
  const withinReach = data.withinReach ?? [];


  return (
    <>
      <DetailHeader
        {...head}
        kind={service ? <ServiceKind service={service} kind={data.kind} code={data.code} /> : 'Career'}
        // "Navy rating · HT" says the service once, so the name under it is the service's own title for the job.
        title={service ? (data.officialTitle ?? data.title) : data.title}
        // A service's title for a job can run far past any career's of the catalogue ("Test, Measurement and
        // Diagnostic Equipment Maintenance Support Specialist"): at the page-title size it fills a phone's screen.
        longTitle={Boolean(service) && (data.officialTitle ?? data.title).length > LONG_TITLE}
        description={data.description}
      />

      {/* What it takes: its skills, by group, straight after what it is. */}
      {skills.length === 0 ? (
        <DetailSection id="skills" title="Skills">
          <p className="text-sm text-text-2">None yet.</p>
        </DetailSection>
      ) : (
        <SkillGroups
          title={service ? (data.officialTitle ?? data.title) : data.title}
          skills={skills}
          marks={marks}
          keepAs={data.id}
          before={marks && <ErrorNote error={markError} className="mb-3" />}
        />
      )}

      {/* Where it stands among careers: the place the career's own Atlas will take. */}
      {onLadder && (
        <DetailSection
          id="ladder"
          title={(data.leadsTo?.length ?? 0) > 0 ? 'Where it leads' : 'Where it comes from'}
          description={ladderSentence(data.comesFrom?.length ?? 0, data.leadsTo?.length ?? 0)}
        >
          <CareerLadder title={data.title} comesFrom={data.comesFrom} leadsTo={data.leadsTo} />
        </DetailSection>
      )}

      {/* A military career: what else its skills are for, the civilian careers they reach. */}
      {service && <CivilianReach key={data.id} title={data.officialTitle ?? data.title} careers={withinReach} />}

      {/* Like the company and factory pages: a section only when there is a job to show. */}
      {/* The newest five; "All N" leads to the rest on Jobs. */}
      {jobs.length > 0 && <OpenJobsSection jobs={jobs.slice(0, JOBS_SHOWN)} total={data.openJobCount ?? jobs.length} all={`/jobs?career=${data.id}`} />}

      {/* Companies with their own version of this career: the page stays the standard, and says where it differs. */}
      {versions.length > 0 && (
        <DetailSection id="companies" title="Companies" description="Each says how this career is done there.">
          <RecordList
            data-career-versions=""
            footer={
              versions.length > VERSIONS_SHOWN && (
                <ShowAll open={showAllVersions} total={versions.length} onToggle={() => setShowAllVersions((value) => !value)} />
              )
            }
          >
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
        <DetailSection id="military" title="Military careers that reach this" description="How much of this career's skills each already has.">
          <MilitaryCareerRows careers={reachedBy} data-reached-by="" />
        </DetailSection>
      )}
    </>
  );
}

/** The ladder's one sentence: what its sides are, and that several on a side are alternatives. */
function ladderSentence(from: number, to: number): string {
  const either = to > 1 || from > 1 ? ' Each is an alternative, not a sequence.' : '';
  if (from > 0 && to > 0) return `Where people usually come to this career from, and where it usually leads next.${either}`;
  if (to > 0) return `The careers people usually move on to from this one.${either}`;
  return `Where people usually come to this career from.${either}`;
}

/**
 * A military career's kind, above its name: the service's mark, then "Air
 * Force specialty · 2A7X1", the service's word the way to its page. The
 * mark is the service's as every company's is drawn (`CompanyLogo`).
 */
function ServiceKind({ service, kind, code }: { service: CareerService; kind?: string | null; code?: string | null }) {
  const short = serviceShortName(service.key) ?? service.name;
  const words = kind ?? short;
  // "Air Force" of "Air Force specialty" is the link; a kind that does not start with it is the link whole.
  const rest = words.startsWith(short) ? words.slice(short.length) : null;
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <CompanyLogo name={service.name} domain={service.domain} size={20} className="rounded" />
      <span className="min-w-0">
        <Link
          to={`/companies/${service.slug ?? service.id}`}
          className={cn('-my-2 py-2 underline decoration-line-strong underline-offset-2 transition-colors hover:text-text-1', focusRing)}
          data-career-service=""
        >
          {rest === null ? words : short}
        </Link>
        {rest ?? ''}
        {code ? ` · ${code}` : ''}
      </span>
    </span>
  );
}

/** The longest title a career of the catalogue has, in letters: a military career's own title past this is set smaller on a phone. */
const LONG_TITLE = 40;

/** How many open jobs a career's page lists before "All N". */
const JOBS_SHOWN = 5;

/** How many companies with a version are listed before "Show all". */
const VERSIONS_SHOWN = 8;
