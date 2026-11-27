import { useEffect, useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { plural } from '@/lib/utils';
import { ErrorNote, LoadError } from '../account/parts';
import { signInPath, useAccount } from '../../lib/account';
import { type OccupationDetail } from '../../lib/api';
import { isNoVersion, useVersion, type Version } from '../../lib/versions';
import { useViewer } from '../../lib/viewer';
import { BackLink, DetailHeader, EmptyState } from '../layout/Page';
import { SkillTag, SkillTags } from '../path/SkillTag';
import { shareOf, type PlacedSkill } from '../path/model';
import { useSkillMarks } from '../path/useSkillMarks';
import { Route } from '../route/Route';
import { type Head, OpenJobsSection, SkillsHeading } from './parts';
import { CareerTag, CompanyTag, RecordTags } from '../layout/RecordTag';

/** Where a company's people change its version of a career: Your jobs, with the version in the address. */
export function versionEditorPath(companyId: string, occupationId: string): string {
  return `/employer?company=${companyId}&career=${occupationId}`;
}

/**
 * A company's version of a career ("Boeing CNC Operator"): the career's own
 * page, at the company. The same heading block and the same route, drawn from
 * the standard's skills with the company's changes applied: a skill it adds
 * says "Added", one it leaves out is not drawn (a line under the path says how
 * many, and opens them), and a skill's tag names the makes the company runs.
 *
 * A seeker's marks and progress work as on the standard, counted against the
 * version's skills; a make the company runs that the person has run too is
 * brighter. One line under the name leads to the company and back to the
 * standard.
 */
export default function CareerVersionView({ data, at, head }: { data: OccupationDetail; at: string; head: Head }) {
  const version = useVersion(at, data.id);
  const standard = `/occupations/${data.id}`;

  // The tab is named as the page's heading is.
  const title = version.data?.title;
  useEffect(() => {
    if (title) document.title = `${title} · Archangel`;
  }, [title]);

  if (version.isPending) {
    return (
      <div className="flex min-h-[400px] items-center justify-center" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-text-2" />
      </div>
    );
  }
  if (version.isError) {
    return (
      <>
        <div className="-mt-2">
          <BackLink fallback={standard} />
        </div>
        {isNoVersion(version.error) ? (
          <EmptyState
            title="No version of this career here"
            description="The link may be old, or the company removed its version."
            action={
              <Link to={standard} className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-text-1 hover:bg-surface-hover" data-standard-link>
                {data.title}
              </Link>
            }
          />
        ) : (
          <LoadError error={version.error} onRetry={() => void version.refetch()} retrying={version.isFetching} className="mt-4" />
        )}
      </>
    );
  }
  return <VersionPage data={data} version={version.data} head={head} />;
}

function VersionPage({ data, version, head }: { data: OccupationDetail; version: Version; head: Head }) {
  // Marks and progress are a seeker's: a visitor, or someone here to hire, reads the same route without them.
  const { marks, canSignIn, error: markError, ranMakes } = useSkillMarks();
  const { pathname, search } = useLocation();
  const { data: account } = useAccount();
  const viewer = useViewer();

  const company = version.company;
  const standard = `/occupations/${data.id}`;

  // The version's path: each skill with the makes the company runs, the person's own among them lit.
  const skills: PlacedSkill[] = version.skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    level: skill.level,
    group: skill.group,
    domain: skill.domain,
    howLearned: skill.howLearned,
    added: skill.added,
    makes: skill.makes.filter((make) => make.runs).map((make) => ({ name: make.name, lit: ranMakes.has(make.id) })),
  }));
  const whole = marks && !marks.pending && skills.length > 0 ? shareOf(skills, marks) : null;
  const headingId = useId();
  const leftOut = version.leftOut;
  const same = leftOut.length === 0 && !skills.some((skill) => skill.added);

  // The company's own people, and an admin, change it from here.
  const user = account?.user;
  const belongs = Boolean(account?.memberships.some((membership) => membership.companyId === company.id && membership.status === 'active'));
  const canEdit = Boolean(user) && (viewer.admin || (viewer.employer && belongs)) && viewer.manages(company.id);

  return (
    <>
      <DetailHeader
        back={head.back}
        edit={
          canEdit ? (
            <Link
              to={versionEditorPath(company.id, data.id)}
              className="inline-flex min-h-11 items-center text-sm font-medium text-text-1 underline"
              data-version-edit
            >
              Edit
            </Link>
          ) : undefined
        }
        kind="Career"
        title={version.title}
        description={data.description}
      >
        {/* Whose version this is, and the one tap back to the standard. */}
        <RecordTags>
          <CompanyTag company={company} data-version-company="" />
          <CareerTag career={{ id: data.id, title: `Standard ${data.title}` }} to={standard} data-standard-link="" />
        </RecordTags>
      </DetailHeader>

      <section id="skills" aria-labelledby={headingId} className="mt-12 scroll-mt-20">
        {marks && <ErrorNote error={markError} className="mb-3" />}
        {skills.length === 0 && (
          <>
            <SkillsHeading id={headingId} held={null} />
            <p className="mt-3 text-sm text-text-2">None yet.</p>
          </>
        )}
        {/* The same skills by group as the standard's page, the company's changes applied. */}
        <Route
          grouped
          skills={skills}
          marks={marks}
          comesFrom={data.comesFrom}
          leadsTo={data.leadsTo}
          keepAs={`${data.id}@${company.id}`}
          heading={<SkillsHeading id={headingId} held={whole} />}
        />

        {/* What the company leaves out of the standard is not drawn: one line says how many, and opens them. */}
        {leftOut.length > 0 && (
          <details className="group mt-4" data-left-out>
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm text-text-1 underline [&::-webkit-details-marker]:hidden">
              {plural(leftOut.length, 'skill', 'skills')} of the standard path left out
            </summary>
            <SkillTags className="mt-1">
              {leftOut.map((skill) => (
                <SkillTag key={skill.id} skill={{ id: skill.id, name: skill.name }} className="grow-0 text-text-2" />
              ))}
            </SkillTags>
          </details>
        )}
        {same && skills.length > 0 && (
          <p className="mt-4 text-sm text-text-3" data-version-same>
            The same skills as the standard path.
          </p>
        )}
        {canSignIn && (
          <p className="mt-4 text-sm text-text-3">
            <Link to={signInPath(`${pathname}${search}`)} className="text-text-1 underline">
              Sign in
            </Link>{' '}
            to see which of these skills you have.
          </p>
        )}
      </section>

      {/* Open jobs for this career at this company. */}
      {(version.jobs?.length ?? 0) > 0 && <OpenJobsSection jobs={version.jobs ?? []} said={{ career: true, company: true }} />}
    </>
  );
}
