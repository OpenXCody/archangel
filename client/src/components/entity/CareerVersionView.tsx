import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn, plural } from '@/lib/utils';
import { ErrorNote, LoadError } from '../account/parts';
import { signInPath, useAccount } from '../../lib/account';
import { type OccupationDetail } from '../../lib/api';
import { isNoVersion, useVersion, type Version } from '../../lib/versions';
import { useViewer } from '../../lib/viewer';
import { BackLink, DetailHeader, DetailSection, EmptyState } from '../layout/Page';
import { Disclosure, panelRowClass, secondaryActionClass } from '../layout/Panel';
import { type PlacedSkill } from '../path/model';
import { useSkillMarks } from '../path/useSkillMarks';
import { SkillGroups } from '../route/SkillGroups';
import { type Head, OpenJobsSection } from './parts';
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
  const signIn = canSignIn ? signInPath(`${pathname}${search}`) : null;
  const [leftOutOpen, setLeftOutOpen] = useState(false);
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
              className={cn(secondaryActionClass, 'h-9 px-3 sm:h-9')}
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
          signIn={signIn}
          before={marks && <ErrorNote error={markError} className="mb-3" />}
          after={
            <>
              {/* What the company leaves out of the standard is not among the groups: one more panel holds it, closed. */}
              {leftOut.length > 0 && (
                <Disclosure
                  className="mt-2"
                  title={`${plural(leftOut.length, 'skill', 'skills')} of the standard path left out`}
                  open={leftOutOpen}
                  onToggle={() => setLeftOutOpen((value) => !value)}
                  data-left-out=""
                >
                  <ul>
                    {leftOut.map((skill) => (
                      <li key={skill.id} className="border-t border-line first:border-t-0">
                        <Link to={`/skills/${skill.id}`} className={cn(panelRowClass, 'min-h-11 justify-between text-sm text-text-2')}>
                          <span className="min-w-0 break-words">{skill.name}</span>
                          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-text-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              )}
              {same && (
                <p className="mt-4 text-sm text-text-3" data-version-same>
                  The same skills as the standard path.
                </p>
              )}
            </>
          }
        />
      )}

      {/* Open jobs for this career at this company. */}
      {(version.jobs?.length ?? 0) > 0 && <OpenJobsSection jobs={version.jobs ?? []} showCareer />}
    </>
  );
}
