import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JobDetail } from '../../lib/jobs';
import { formatCompanyName } from '@shared/displayName';
import { detailActionClass } from '../layout/Page';

/*
 * What is particular to a job that came from the company's own careers site.
 * Its page is the job page (pages/JobDetail.tsx): the same heading, facts and
 * skills as any job. There is no description (the company's wording stays on
 * the company's site), nothing to manage and nobody to apply to here: the one
 * action opens the company's page. Every reader has it as a button in the
 * facts panel: Apply for a seeker and a visitor, "View on <Company>'s careers
 * site" for everyone else, with one line for the company's own people that
 * says where the job comes from.
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

/**
 * The way to the posting for a reader who is not here to apply (someone here
 * to hire, the company's own people, an admin): a button that opens it on the
 * company's site in a new tab. With `managed`, one quiet line beside it says
 * where the job comes from and that it is not changed here.
 */
export function SourcedView({ job, managed }: { job: JobDetail; managed: boolean }) {
  const line = managed ? (
    <span className="min-w-0 flex-1 basis-64 break-words text-sm text-text-2" role="note" data-job-from-source>
      This job comes from {careersSite(job.companyName)} and is kept in step with it. {job.isOpen ? 'It is changed there.' : 'It is no longer listed there.'}
    </span>
  ) : null;
  // A posting that is gone leads nowhere: the line alone is left.
  if (!job.applyUrl || !job.isOpen) return line;
  return (
    <>
      <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className={detailActionClass} data-view-on-site>
        View on {careersSite(job.companyName)}
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">, in a new tab</span>
      </a>
      {line}
    </>
  );
}
