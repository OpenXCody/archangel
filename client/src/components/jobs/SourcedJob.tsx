import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JobDetail } from '../../lib/jobs';
import { formatCompanyName } from '@shared/displayName';
import { cardClass } from '../account/parts';
import { detailActionClass } from '../layout/Page';

/*
 * What is particular to a job that came from the company's own careers site.
 * Its page is the job page (pages/JobDetail.tsx): the same heading, facts and
 * skills as any job. There is no description (the company's wording stays on
 * the company's site), nothing to manage and nobody to apply to here: the one
 * action is Apply, which opens the company's page, and the people who manage
 * the company's jobs are told where this one comes from.
 */

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
      <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className={cn(detailActionClass, 'border-transparent bg-inverse-bg text-inverse-text hover:bg-inverse-bg/90')} data-apply-on-site>
        Apply
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">, in a new tab</span>
      </a>
      <span className="min-w-0 break-words text-sm text-text-2" data-apply-where>
        On {careersSite(job.companyName)}
      </span>
    </>
  );
}

/** Said to the people who manage the company's jobs: where this one comes from, and that it is not changed here. */
export function FromSourceNote({ job }: { job: JobDetail }) {
  return (
    <p className={cn(cardClass, 'mt-6 text-sm text-text-1')} role="note" data-job-from-source>
      This job comes from {careersSite(job.companyName)} and is kept in step with it.
      <span className="text-text-2">{job.isOpen ? ' It is changed there.' : ' It is no longer listed there.'}</span>
    </p>
  );
}
