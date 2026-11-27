import type { JobDetail, JobPath, JobPathSkill } from '../../lib/jobs';
import { jobSkillParts } from '../../lib/jobSkills';
import { DetailSection, RecordList, RecordRow } from '../layout/Page';
import type { SkillMarks } from '../path/model';
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
 * A job a company posted here by hand shows the skills it chose, as the same
 * tree.
 * The equipment a posting names follows in its own section, each make beside
 * its skill.
 *
 * The page is read, not worked on: a seeker's held skills carry the product's
 * tick and the heading says how many they hold, and nothing here is a control. Skills are marked on Profile. A visitor reads the
 * same skills with no line above them: nothing here asks anyone to sign in
 * (the owner's decision; the page's one action is Apply).
 */

/** A section of the job's page: set apart by a hairline over its heading, so no block floats between two others. */
export const jobSectionClass = 'mt-10 border-t border-line pt-8';

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

/** What a skill's row says when the posting itself names the skill. */
const IN_POSTING = 'In this posting';

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
  // The job's own skills (`jobSkillParts` in lib/jobSkills.ts is the rule): the ones its posting names.
  const { own } = jobSkillParts(path);
  const named = new Set(own.map((skill) => skill.id));
  // The career's whole path in the route's order, then what the posting names beyond it; a named skill says so
  // under its name, and its group arrives open.
  const all = path.skills.concat(path.alsoNamed).map((skill) => ({ ...skill, added: undefined, makes: undefined, note: named.has(skill.id) ? IN_POSTING : null }));
  if (all.length === 0) return null;
  return (
    <div className="[&>section]:mt-10" data-job-path={path.of} data-job-own="">
      <SkillGroups skills={all} marks={marks} keepAs={`job ${job.id}`} openWith={named} />
    </div>
  );
}

/** What a skill's node says under its name, on a job posted here. */
function secondLine(skill: JobPathSkill): string | null {
  const words = [skill.added ? 'Added' : null, skill.optional ? 'Optional' : null].filter(Boolean);
  return words.length > 0 ? words.join(' · ') : null;
}

/**
 * A job a company posted here by hand: the skills it chose, as the same tree
 * (skill groups, then their skills, in the route's order), an optional one
 * saying so under its name.
 */
function ChosenSkills({ job, path, marks }: PartProps) {
  // "Added" is said in the second line with "Optional", so the tree is not asked to say it again.
  const chosen = path.skills.map((skill) => ({ ...skill, added: undefined, makes: undefined, note: secondLine(skill) }));
  return (
    <div className="[&>section]:mt-10" data-job-path={path.of}>
      <SkillGroups skills={chosen} marks={marks} keepAs={`job ${job.id}`} />
    </div>
  );
}
