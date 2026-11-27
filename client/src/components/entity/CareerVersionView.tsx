import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ErrorNote, LoadError } from '../account/parts';
import { useAccount } from '../../lib/account';
import { type OccupationDetail } from '../../lib/api';
import { isNoVersion, useVersion, type Version } from '../../lib/versions';
import { useViewer } from '../../lib/viewer';
import { BackLink, DetailHeader, DetailSection, EmptyState } from '../layout/Page';
import { secondaryActionClass } from '../layout/Panel';
import { type PlacedSkill } from '../path/model';
import { useSkillMarks } from '../path/useSkillMarks';
import { CareerLadderSection } from '../route/CareerLadder';
import { SkillGroups } from '../route/SkillGroups';
import { type Head, OpenJobsSection } from './parts';
import { CareerTag, CompanyTag, RecordTags } from '../layout/RecordTag';

/** Where a company's people change its version of a career: Your jobs, with the version in the address. */
export function versionEditorPath(companyId: string, occupationId: string): string {
  return `/employer?company=${companyId}&career=${occupationId}`;
}

/**
 * A company's version of a career ("Boeing CNC Operator"): the career's own
 * page, at the company. The same heading block and the same tree of skills,
 * drawn from the standard's skills with the company's changes applied: a
 * skill it adds says "Added", one it leaves out is not among the groups (the
 * tree's last node, "Left out of the standard", says how many and opens
 * their names), and a skill's node names the makes the company runs. A
 * version that changes nothing is the standard's tree, with neither.
 *
 * A seeker's marks and progress work as on the standard, counted against the
 * version's skills; a make the company runs that the person has run too is
 * brighter. The tags under the name lead to the company and back to the
 * standard. After the skills, where the career leads: the same ladder as the
 * standard's page (`CareerLadderSection`).
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
  const { marks, error: markError, ranMakes } = useSkillMarks();
  const { data: account } = useAccount();
  const viewer = useViewer();

  const company = version.company;
  const standard = `/occupations/${data.id}`;

  // The version's path: each skill with the makes the company runs, the person's own among them lit.
  const skills: PlacedSkill[] = useMemo(
    () =>
      version.skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        level: skill.level,
        group: skill.group,
        domain: skill.domain,
        howLearned: skill.howLearned,
        description: skill.description,
        added: skill.added,
        makes: skill.makes.filter((make) => make.runs).map((make) => ({ name: make.name, lit: ranMakes.has(make.id) })),
      })),
    [version.skills, ranMakes]
  );

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
              className={cn(secondaryActionClass, 'px-3 sm:h-9')}
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

      {skills.length === 0 ? (
        <DetailSection id="skills" title="Skills">
          <p className="text-sm text-text-2">None yet.</p>
        </DetailSection>
      ) : (
        // The same skills by group as the standard's page, the company's changes applied.
        <SkillGroups
          skills={skills}
          marks={marks}
          keepAs={`${data.id}@${company.id}`}
          before={marks && <ErrorNote error={markError} className="mb-3" />}
          // What the company leaves out of the standard is not among the groups: the tree's last node holds it, closed.
          leftOut={version.leftOut}
        />
      )}

      {/* Where the career stands among careers: the ladder is the career's own, so it is the standard page's, and each career on it opens its standard page. */}
      <CareerLadderSection comesFrom={data.comesFrom} leadsTo={data.leadsTo} />

      {/* Open jobs for this career at this company. */}
      {(version.jobs?.length ?? 0) > 0 && <OpenJobsSection jobs={version.jobs ?? []} said={{ career: true, company: true }} />}
    </>
  );
}
