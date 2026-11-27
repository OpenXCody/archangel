import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { JobDetail, JobPath, JobPathSkill } from '../../lib/jobs';
import { jobSkillParts } from '../../lib/jobSkills';
import { companyShortName } from '@shared/versions';
import { SkillMark } from '../account/SkillStatusButton';
import { DetailSection, RecordList, RecordRow } from '../layout/Page';
import { ShareRing } from '../path/HeldShare';
import { shareOf, type MarkStatus, type PathSkillItem, type PlacedSkill, type Share, type SkillMarks } from '../path/model';
import { SkillGroupBox } from '../path/SkillGroupBox';
import { SkillTags } from '../path/SkillTag';
import { useSkillMarks } from '../path/useSkillMarks';
import { SkillGroups } from '../route/SkillGroups';

/*
 * A job's skills, as its page draws them (`path` on GET /api/jobs/:id).
 *
 * A career is a template with a wide range of skills; a job has its own
 * combination of them. So a job from a company's careers site is drawn in two
 * parts, and the career's whole path is never said to be what the job takes:
 *
 * 1. the job's own skills: every skill its posting names, as rows, the ones
 *    on the career's path first in the route's order, then the others;
 * 2. one closed line for the rest of the career's range ("Welder career · 19
 *    more"; the company's version of the career where it has one), which
 *    opens to the rest of the path by skill group, as the career's page draws
 *    it, and the way to that page.
 *
 * A job a company posted here by hand shows the skills it chose, by group.
 * The equipment a posting names follows in its own section, each make beside
 * its skill.
 *
 * The page is read, not worked on: a seeker's held skills carry the product's
 * tick and one line says how many of the job's own skills they hold, and
 * nothing here is a control. Skills are marked on Profile. A visitor reads the
 * same skills with no line above them: nothing here asks anyone to sign in
 * (the owner's decision; the page's one action is Apply).
 */

/** A section of the job's page: set apart by a hairline over its heading, so no block floats between two others. */
export const jobSectionClass = 'mt-10 border-t border-line pt-8';

/**
 * A job's skills by skill group, in the order they arrive (the server's path
 * order, so the groups stand in the order the route reaches them): the skills
 * a company chose for a job it posted here, side by side, with no level named.
 */
function byGroup(skills: readonly PlacedSkill[]) {
  const groups: { slug: string; name: string; skills: PathSkillItem[] }[] = [];
  const unplaced: PathSkillItem[] = [];
  for (const skill of skills) {
    if (!skill.group) {
      unplaced.push(skill);
      continue;
    }
    let group = groups.find((each) => each.slug === skill.group?.slug);
    if (!group) {
      group = { slug: skill.group.slug, name: skill.group.name, skills: [] };
      groups.push(group);
    }
    group.skills.push(skill);
  }
  return { groups, unplaced };
}

/** A mark, for someone who hears the row. */
const SAID: Record<MarkStatus, string> = { held: 'Held: ', learning: 'Learning: ', none: 'Not held: ' };

/** One skill as a tag that is only read: the reader's mark where they have marks, the name, and what this job says of it. */
function ReadTag({ skill, status }: { skill: PathSkillItem; status: MarkStatus | undefined }) {
  return (
    <li className="skill-tag" data-skill-tag={skill.id} data-status={status}>
      {status && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center">
          <SkillMark status={status} />
          <span className="sr-only">{SAID[status]}</span>
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

/** One line for a seeker: the ring, and how many of the skills it stands above they hold. */
function Overlap({ share }: { share: Share }) {
  return (
    <p className="mb-5 flex min-w-0 items-center gap-2 text-sm text-text-2" data-job-overlap>
      <ShareRing share={share} className="h-5 w-5" />
      <span className="min-w-0">
        You hold{' '}
        <span className="font-semibold tabular-nums text-text-1">
          {share.held} of {share.total}
        </span>
      </span>
    </p>
  );
}

interface JobSkillsProps {
  job: JobDetail;
  path: JobPath;
  /**
   * The reader is here as someone who might apply: a seeker is told how many
   * of the skills they hold. Off for the people who manage the job, who read
   * the listing as the company wrote it.
   */
  forApplicant: boolean;
}

export default function JobSkills({ job, path, forApplicant }: JobSkillsProps) {
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

  if (path.skills.length === 0 && path.alsoNamed.length === 0) return null;

  const part = { job, path, marks };
  // The equipment the posting names: a skill's makes on one row, beside the skill they are makes of.
  const equipment = path.skills.concat(path.alsoNamed).filter((skill) => skill.makes.length > 0);

  return (
    <>
      {path.of === 'job' ? <ChosenSkills {...part} /> : <PostingSkills {...part} />}

      {equipment.length > 0 && (
        <DetailSection id="equipment" title="Equipment" className={jobSectionClass} description="The machines and software the posting names.">
          <RecordList data-job-equipment="">
            {equipment.map((skill) => (
              <RecordRow
                key={skill.id}
                to={`/skills/${skill.id}`}
                title={skill.makes.map((make, index) => {
                  // For a seeker, a make they have run stands in full ink among the rest.
                  const lit = Boolean(marks) && found.ranMakes.has(make.id);
                  return (
                    <span key={make.id}>
                      {index > 0 && <span className={marks ? 'text-text-2' : undefined}>, </span>}
                      <span data-make={lit ? 'lit' : ''} className={marks ? (lit ? 'font-medium text-text-1' : 'text-text-2') : undefined}>
                        {make.name}
                      </span>
                    </span>
                  );
                })}
                subtitle={skill.name}
              />
            ))}
          </RecordList>
        </DetailSection>
      )}
    </>
  );
}

interface PartProps {
  job: JobDetail;
  path: JobPath;
  /** A seeker's marks, read and never changed here. */
  marks: SkillMarks | null;
}

/**
 * A job from a company's careers site: the skills its posting names, as the
 * same tree a career's page draws (skill groups, then their skills), and under
 * it one link to the rest of its career's range. Nothing here says the
 * career's whole path is what the job takes.
 */
function PostingSkills({ job, path, marks }: PartProps) {
  // The job's own skills, and the rest of the career's range (`jobSkillParts` in lib/jobSkills.ts is the rule).
  const { own } = jobSkillParts(path);
  // A posting that names no skill has no Skills section: the career's tag leads to the career's own.
  if (own.length === 0) return null;
  return (
    <div className="border-t border-line [&>section]:mt-8" data-job-path={path.of} data-job-own="">
      <SkillGroups skills={own} marks={marks} keepAs={`job ${job.id}`} />
    </div>
  );
}

/** What a tag says under a skill's name, on a job posted here. */
function secondLine(skill: JobPathSkill): string | null {
  const words = [skill.added ? 'Added' : null, skill.optional ? 'Optional' : null].filter(Boolean);
  return words.length > 0 ? words.join(' · ') : null;
}

/**
 * A job a company posted here by hand: the skills it chose, group by group
 * in the route's order, an optional one saying so. A seeker is told how many
 * of them they hold.
 */
function ChosenSkills({ job, path, marks }: PartProps) {
  const placed = path.skills.map((skill) => ({ id: skill.id, name: skill.name, level: skill.level, group: skill.group, domain: skill.domain, note: secondLine(skill) }));
  const laid = byGroup(placed);
  const tag = (skill: PathSkillItem) => <ReadTag key={skill.id} skill={skill} status={marks?.statusOf(skill.id)} />;
  return (
    <DetailSection id="skills" title="Skills" className={jobSectionClass} description={`The skills ${companyShortName(job.companyName)} lists for this job.`}>
      {marks && <Overlap share={shareOf(path.skills, marks)} />}
      {/* A group's skills stand one under another here: two groups share a row, and a column reads down. */}
      <div className="space-y-7 [&_.skill-group_.skill-tags]:flex-col" data-job-path={path.of}>
        {laid.groups.length > 0 && (
          <ul className="grid grid-cols-1 items-start gap-x-8 gap-y-4 sm:grid-cols-2" data-job-groups>
            {laid.groups.map((group) => (
              <li key={group.slug} className="min-w-0">
                <SkillGroupBox name={group.name} skills={group.skills} marks={marks} renderSkill={tag} />
              </li>
            ))}
          </ul>
        )}
        {laid.unplaced.length > 0 && <SkillTags>{laid.unplaced.map(tag)}</SkillTags>}
      </div>
    </DetailSection>
  );
}
