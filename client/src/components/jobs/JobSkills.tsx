import { Link, useLocation } from 'react-router-dom';
import { cn, labelClass } from '@/lib/utils';
import { signInPath } from '../../lib/account';
import type { JobDetail, JobPath, JobPathSkill } from '../../lib/jobs';
import { companyShortName, versionTitle } from '@shared/versions';
import { SkillMark } from '../account/SkillStatusButton';
import { DetailSection, RecordList, RecordRow } from '../layout/Page';
import { ShareRing } from '../path/HeldShare';
import { buildPath, shareOf, type MarkStatus, type PathSkillItem, type SkillMarks } from '../path/model';
import { SkillGroupBox } from '../path/SkillGroupBox';
import { SkillTags } from '../path/SkillTag';
import { useSkillMarks } from '../path/useSkillMarks';

/*
 * A job's skills, as its page draws them (`path` on GET /api/jobs/:id).
 *
 * A job is an opening for a career, so what is drawn is the career's path
 * (the company's version of it where there is one), level by level and group
 * by group as the career's own page lays it out. A skill the posting itself
 * names says so on its second line; what the posting names that is not on the
 * path follows under its own heading. A job a company posted here by hand
 * shows the skills it chose, the same way.
 *
 * The page is read, not worked on: a seeker's held skills carry the product's
 * tick and one line says how many they hold, and nothing here is a control.
 * Skills are marked on Profile and on a skill's own page.
 */

/** What a tag says under a skill's name on this page. */
function secondLine(skill: JobPathSkill): string | null {
  const words = [skill.named ? 'Named in the posting' : null, skill.added ? 'Added' : null, skill.optional ? 'Optional' : null].filter(Boolean);
  return words.length > 0 ? words.join(' · ') : null;
}

/** One skill as a tag that is only read: the reader's mark where they have marks, the name, and what this job says of it. */
function ReadTag({ skill, status, named }: { skill: PathSkillItem; status: MarkStatus | undefined; named: boolean }) {
  return (
    <li className="skill-tag" data-skill-tag={skill.id} data-status={status} data-named={named || undefined}>
      {status && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center">
          <SkillMark status={status} />
          <span className="sr-only">{status === 'held' ? 'Held: ' : status === 'learning' ? 'Learning: ' : 'Not held: '}</span>
        </span>
      )}
      <Link
        to={`/skills/${skill.id}`}
        className={cn('flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg py-1.5 pr-3 text-sm leading-snug [overflow-wrap:anywhere] hover:underline focus-visible:[outline-offset:-2px]', status ? 'pl-0' : 'pl-3')}
      >
        <span className="block">{skill.name}</span>
        {skill.note && (
          <span className="block text-xs font-normal text-text-3" data-tag-line>
            {skill.note}
          </span>
        )}
      </Link>
    </li>
  );
}

interface JobSkillsProps {
  job: JobDetail;
  path: JobPath;
  /**
   * The reader is here as someone who might apply: a seeker is told how many
   * of the skills they hold, a visitor how to find out. Off for the people who
   * manage the job, who read the listing as the company wrote it.
   */
  forApplicant: boolean;
}

export default function JobSkills({ job, path, forApplicant }: JobSkillsProps) {
  const { pathname, search } = useLocation();
  const found = useSkillMarks();
  // The person's own list is the live answer; the job's copy stands in until it has loaded.
  const held = new Set(path.skills.concat(path.alsoNamed).filter((skill) => skill.held).map((skill) => skill.id));
  const marks: SkillMarks | null =
    forApplicant && found.marks
      ? {
          statusOf: (id) => (found.marks?.pending ? (held.has(id) ? 'held' : 'none') : (found.marks?.statusOf(id) ?? 'none')),
          // Nothing is marked from this page.
          mark: () => undefined,
          pending: false,
        }
      : null;

  const placed = path.skills.map((skill) => ({ id: skill.id, name: skill.name, level: skill.level, group: skill.group, domain: skill.domain, note: secondLine(skill) }));
  const laid = buildPath(placed);
  const levels = laid.levels.filter((level) => level.groups.length > 0);
  const share = marks && path.skills.length > 0 ? shareOf(path.skills, marks) : null;
  const named = new Set(path.skills.concat(path.alsoNamed).filter((skill) => skill.named).map((skill) => skill.id));
  const tag = (skill: PathSkillItem) => <ReadTag key={skill.id} skill={skill} status={marks?.statusOf(skill.id)} named={named.has(skill.id)} />;

  // The equipment the posting names: each make beside the skill it is a make of.
  const equipment = path.skills.concat(path.alsoNamed).flatMap((skill) => skill.makes.map((make) => ({ ...make, skill })));

  // Whose list this is, in one sentence.
  const career = { id: job.occupationId, title: job.occupationTitle };
  const whose =
    path.of === 'job' ? (
      `The skills ${companyShortName(job.companyName)} lists for this job.`
    ) : (
      <>
        What the career takes: the path of{' '}
        <Link to={path.of === 'version' ? `/occupations/${career.id}?at=${encodeURIComponent(job.companySlug ?? job.companyId)}` : `/occupations/${career.id}`} className="text-text-1 underline">
          {path.of === 'version' ? versionTitle(job.companyName, career.title) : career.title}
        </Link>
        .
      </>
    );

  if (path.skills.length === 0 && path.alsoNamed.length === 0) return null;

  return (
    <>
      <DetailSection id="skills" title="Skills" description={path.skills.length > 0 ? whose : undefined}>
        {path.skills.length > 0 && share && (
          <p className="mb-5 flex min-w-0 items-center gap-2 text-sm text-text-2" data-job-overlap>
            <ShareRing share={share} className="h-5 w-5" />
            <span className="min-w-0">
              You hold{' '}
              <span className="font-semibold tabular-nums text-text-1">
                {share.held} of {share.total}
              </span>
            </span>
          </p>
        )}
        {path.skills.length > 0 && forApplicant && found.canSignIn && (
          <p className="mb-5 text-sm text-text-2" data-job-overlap-sign-in>
            <Link to={signInPath(`${pathname}${search}`)} className="font-medium text-text-1 underline hover:no-underline">
              Sign in
            </Link>{' '}
            to see how many of these skills you hold.
          </p>
        )}

        <div className="space-y-7" data-job-path={path.of}>
          {levels.map((level) => (
            <div key={level.level} data-job-level={level.level}>
              <h3 className={cn(labelClass, 'mb-2 text-[11px]')}>{level.name}</h3>
              <ul className="grid grid-cols-1 items-start gap-x-8 gap-y-4 sm:grid-cols-2">
                {level.groups.map((group) => (
                  <li key={group.slug} className="min-w-0">
                    <SkillGroupBox name={group.name} skills={group.skills} marks={marks} renderSkill={tag} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {laid.unplaced.length > 0 && <SkillTags>{laid.unplaced.map(tag)}</SkillTags>}

          {/* What the posting names that the career's path does not have. */}
          {path.alsoNamed.length > 0 && (
            <div data-job-also-named>
              <h3 className={cn(labelClass, 'mb-1 text-[11px]')}>{path.skills.length > 0 ? 'Also named in the posting' : 'Named in the posting'}</h3>
              <SkillTags>{path.alsoNamed.map((skill) => tag({ id: skill.id, name: skill.name }))}</SkillTags>
            </div>
          )}
        </div>
      </DetailSection>

      {equipment.length > 0 && (
        <DetailSection id="equipment" title="Equipment" description="The machines and software the posting names.">
          <RecordList data-job-equipment="">
            {equipment.map((make) => (
              <RecordRow
                key={make.id}
                to={`/skills/${make.skill.id}`}
                title={make.name}
                subtitle={make.skill.name}
                // One the reader has run stands in full ink among the rest.
                quiet={Boolean(marks) && !found.ranMakes.has(make.id)}
                data-make={Boolean(marks) && found.ranMakes.has(make.id) ? 'lit' : ''}
              />
            ))}
          </RecordList>
        </DetailSection>
      )}
    </>
  );
}
