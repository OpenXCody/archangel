import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JobDetail, JobRequirements, JobSkill } from '../../lib/jobs';
import { employmentLabel, formatPay } from '../../lib/jobFormat';
import { formatDayCapital } from '../../lib/dates';
import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import { versionPath, versionTitle } from '@shared/versions';
import { CardNote, ErrorNote, HeldMeter, cardClass } from '../account/parts';
import { DetailSection, RecordRow, detailActionClass, recordListClass } from '../layout/Page';
import { SkillTag, SkillTags } from '../path/SkillTag';
import { useSkillMarks } from '../path/useSkillMarks';

/*
 * A job that came from the company's own careers site: what the posting says
 * as facts, and the way to it. The same heading as any job; under it the
 * terms that were stated, what it asks for, the company, plant and career it
 * belongs to, and its skills as the tags a path uses. There is no
 * description (the company's wording stays on the company's site), nothing to
 * manage and nobody to apply to here: the one action is Apply, which opens
 * the company's page.
 */

/** "2 to 4 years", "2 years or more", "Up to 4 years". */
function years(min?: number, max?: number): string | null {
  const plural = (n: number) => (n === 1 ? 'year' : 'years');
  if (typeof min === 'number' && typeof max === 'number') return min === max ? `${min} ${plural(min)}` : `${min} to ${max} years`;
  if (typeof min === 'number') return `${min} ${plural(min)} or more`;
  if (typeof max === 'number') return `Up to ${max} ${plural(max)}`;
  return null;
}

/** The schooling a posting asks for, as the reader names it, in the words a person reads. Anything else is shown as it is. */
const EDUCATION: Record<string, string> = {
  'high school': 'High school diploma',
  certificate: 'Technical certificate',
  associate: 'Associate degree',
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate: 'Doctorate',
};

/** "Secret" is a clearance: said so. */
const clearance = (level: string) => (/clearance|trust/i.test(level) ? level : `${level} clearance`);

/** What a posting asks for, as at most two quiet lines: experience and schooling, then papers. */
export function requirementLines(requirements: JobRequirements | null | undefined): string[] {
  if (!requirements) return [];
  const schooling = requirements.education ? EDUCATION[requirements.education.toLowerCase()] ?? requirements.education : null;
  const first = [years(requirements.yearsMin, requirements.yearsMax), schooling].filter(Boolean);
  const second = [...(requirements.certifications ?? []), requirements.clearance ? clearance(requirements.clearance) : null, requirements.citizenship].filter(Boolean);
  return [first.join(' · '), second.join(' · ')].filter(Boolean);
}

/** "SpaceX's careers site", "Lucid Motors' careers site": whose page Apply opens, by the name the company is shown under. */
export function careersSite(companyName: string): string {
  const company = formatCompanyName(companyName).replace(/\.$/, '');
  return `${company}${/s$/i.test(company) ? "'" : "'s"} careers site`;
}

/** The page's one action: Apply, on the company's own site, in a new tab, and whose site that is. */
export function SourcedApply({ job }: { job: JobDetail }) {
  if (!job.applyUrl || !job.isOpen) return null;
  return (
    <>
      <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className={cn(detailActionClass, 'border-transparent bg-fg-default text-bg-base hover:bg-fg-default/90')} data-apply-on-site>
        Apply
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">, in a new tab</span>
      </a>
      <span className="min-w-0 break-words text-sm text-fg-muted" data-apply-where>
        On {careersSite(job.companyName)}
      </span>
    </>
  );
}

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-fg-default">{children}</dd>
    </div>
  );
}

interface SourcedJobProps {
  job: JobDetail;
  skills: JobSkill[];
  /** The reader manages jobs for the company: they are told where this one comes from. */
  manages: boolean;
}

export default function SourcedJob({ job, skills, manages }: SourcedJobProps) {
  const { marks, error, ranMakes } = useSkillMarks();
  const asksFor = requirementLines(job.requirements);
  const paid = job.payMin !== null || job.payMax !== null;
  const held = marks ? skills.filter((skill) => marks.statusOf(skill.id) === 'held').length : 0;

  return (
    <>
      {manages && (
        <p className={cn(cardClass, 'mt-6 p-4 text-sm text-fg-default')} role="note" data-job-from-source>
          This job comes from {careersSite(job.companyName)} and is kept in step with it.
          <span className="text-fg-muted">{job.isOpen ? ' It is changed there.' : ' It is no longer listed there.'}</span>
        </p>
      )}

      <div className={cn(recordListClass, 'mt-6')} data-job-terms>
        <dl className="grid grid-cols-1 gap-4 p-4 xs:grid-cols-2 sm:grid-cols-4 sm:p-6">
          {paid && <Term label="Pay">{formatPay(job.payMin, job.payMax, job.payPeriod)}</Term>}
          {job.levelWord && <Term label="Level">{job.levelWord}</Term>}
          {job.employmentType && <Term label="Type">{employmentLabel(job.employmentType)}</Term>}
          {job.shift && <Term label="Shift">{job.shift}</Term>}
          <Term label="Posted">{formatDayCapital(job.postedAt)}</Term>
          {asksFor.length > 0 && (
            <div className="min-w-0 xs:col-span-2 sm:col-span-4" data-job-requirements>
              <dt className="text-xs text-fg-muted">Asks for</dt>
              {asksFor.map((line) => (
                <dd key={line} className="mt-0.5 break-words text-sm text-fg-default">
                  {line}
                </dd>
              ))}
            </div>
          )}
        </dl>
        <ul className="border-t border-border-subtle">
          <RecordRow to={`/companies/${job.companyId}`} label="Company" title={formatCompanyName(job.companyName)} />
          <RecordRow to={`/factories/${job.factoryId}`} label="Plant" title={formatFactoryName(job.factoryName)} />
          {job.hasVersion ? (
            <RecordRow to={versionPath(job.occupationId, { id: job.companyId })} label="Career" title={versionTitle(job.companyName, job.occupationTitle)} data-job-version="" />
          ) : (
            <RecordRow to={`/occupations/${job.occupationId}`} label="Career" title={job.occupationTitle} />
          )}
        </ul>
      </div>

      <DetailSection title="Skills">
        {skills.length === 0 ? (
          <CardNote>None yet.</CardNote>
        ) : (
          <>
            {marks && <HeldMeter held={held} total={skills.length} noun="skills held" className="mb-3" />}
            <ErrorNote error={error} className="mb-2" />
            <SkillTags>
              {skills.map((skill) => (
                <SkillTag
                  key={skill.id}
                  skill={{ id: skill.id, name: skill.name, makes: (skill.makes ?? []).map((make) => ({ name: make.name, lit: ranMakes.has(make.id) })) }}
                  marks={marks}
                />
              ))}
            </SkillTags>
          </>
        )}
      </DetailSection>
    </>
  );
}
