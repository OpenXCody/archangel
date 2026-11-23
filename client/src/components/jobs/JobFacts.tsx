import type { ReactNode } from 'react';
import { cn, labelClass } from '@/lib/utils';
import type { JobDetail, JobRequirements } from '../../lib/jobs';
import { employmentLabel, formatPay } from '../../lib/jobFormat';
import { formatDayCapital } from '../../lib/dates';

/*
 * What a job says of itself, as one quiet block of facts under its name: the
 * pay where it is stated, the level as the company wrote it, type, shift, the
 * day it was posted, and what it asks for (experience, schooling,
 * certificates, clearance, citizenship). Only what is stored is said: a fact
 * the posting does not state has no line, and none of the employer's wording
 * is shown.
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

/** What a posting asks for, each under the word for it. Only the keys that were said. */
export function requirementFacts(requirements: JobRequirements | null | undefined): { label: string; value: string }[] {
  if (!requirements) return [];
  const experience = years(requirements.yearsMin, requirements.yearsMax);
  const schooling = requirements.education ? (EDUCATION[requirements.education.toLowerCase()] ?? requirements.education) : null;
  const certificates = (requirements.certifications ?? []).join(', ');
  return [
    experience ? { label: 'Experience', value: experience } : null,
    schooling ? { label: 'Schooling', value: schooling } : null,
    certificates ? { label: 'Certificates', value: certificates } : null,
    requirements.clearance ? { label: 'Clearance', value: clearance(requirements.clearance) } : null,
    requirements.citizenship ? { label: 'Citizenship', value: requirements.citizenship } : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className={cn(labelClass, 'text-[11px]')}>{label}</dt>
      <dd className="mt-1 break-words text-sm text-text-1">{children}</dd>
    </div>
  );
}

export default function JobFacts({ job, applications, className }: { job: JobDetail; /** Where applications go: said to the people who manage the job. */ applications?: ReactNode; className?: string }) {
  const paid = job.payMin !== null || job.payMax !== null;
  const asks = requirementFacts(job.requirements);
  return (
    <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-4', className)} data-job-terms>
      {paid && <Fact label="Pay">{formatPay(job.payMin, job.payMax, job.payPeriod)}</Fact>}
      {job.levelWord && <Fact label="Level">{job.levelWord}</Fact>}
      {job.employmentType && <Fact label="Type">{employmentLabel(job.employmentType)}</Fact>}
      {job.shift && <Fact label="Shift">{job.shift}</Fact>}
      <Fact label={job.undated ? 'Listed' : 'Posted'}>{formatDayCapital(job.postedAt)}</Fact>
      {asks.map((fact) => (
        <Fact key={fact.label} label={fact.label} wide={fact.value.length > 28}>
          <span data-job-requirement={fact.label.toLowerCase()}>{fact.value}</span>
        </Fact>
      ))}
      {applications && (
        <Fact label="Applications" wide>
          {applications}
        </Fact>
      )}
    </dl>
  );
}
