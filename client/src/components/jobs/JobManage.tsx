import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { JobDetail as JobDetailData } from '../../lib/jobs';
import { useUpdateJob } from '../../lib/jobs';
import { useApplicantList, useDeleteJob, useExtendJob } from '../../lib/employerJobs';
import { DAY_MS, formatDay } from '../../lib/dates';
import { CardNote, ErrorNote, Field, LoadError, RowsSkeleton, busyButtonClass, cardClass, fieldClass, outlineButtonClass } from '../account/parts';
import ConfirmDialog from '../layout/ConfirmDialog';
import { DetailSection, detailActionClass } from '../layout/Page';
import ApplicantList from './ApplicantList';

// ---------------------------------------------------------------------------
// For the company: the job's state and what can be done with it, then applicants
// ---------------------------------------------------------------------------

export default function JobManage({ job }: { job: JobDetailData }) {
  const applicants = useApplicantList(job.id);
  const count = applicants.data?.applications.length;
  // With an application link the company collects applications itself.
  const offsite = Boolean(job.applyUrl);

  return (
    <div id="manage-job" className="scroll-mt-20">
      <DetailSection title="Manage" description={`Seen only by people who manage jobs for ${job.companyName.replace(/\.$/, '')}.`}>
        <JobStatusControl job={job} applicantCount={count} />
      </DetailSection>

      <DetailSection
        id="applicants"
        title="Applicants"
        description={
          !count
            ? undefined
            : applicants.data?.skills.some((skill) => skill.required)
              ? 'Ranked by required skills held. Skills are self-reported, not verified.'
              : 'In order of application: this job lists no required skills.'
        }
      >
        {applicants.isPending ? (
          <RowsSkeleton rows={2} />
        ) : applicants.isError ? (
          <LoadError error={applicants.error} onRetry={() => void applicants.refetch()} retrying={applicants.isFetching} />
        ) : applicants.data.applications.length === 0 ? (
          <CardNote>{offsite ? 'People apply on your own website, so none are listed here.' : 'None yet.'}</CardNote>
        ) : (
          <ApplicantList data={applicants.data} job={job} />
        )}
      </DetailSection>
    </div>
  );
}

function JobStatusControl({ job, applicantCount }: { job: JobDetailData; applicantCount: number | undefined }) {
  const navigate = useNavigate();
  const update = useUpdateJob(job.id);
  const remove = useDeleteJob();
  const extend = useExtendJob();
  // Offered once the 60 days are nearly up; before that there is nothing to gain.
  const daysLeft = Math.ceil((new Date(job.expiresAt).getTime() - Date.now()) / DAY_MS);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState('');
  const closed = job.status === 'closed';
  const listed = !closed && job.isOpen;

  const close = (event: FormEvent) => {
    event.preventDefault();
    if (update.isPending) return;
    update.mutate(
      { status: 'closed', closedReason: reason },
      {
        onSuccess: () => {
          setClosing(false);
          setReason('');
        },
      }
    );
  };

  return (
    <div className={cardClass}>
      <p className="text-sm text-text-1" data-job-state={closed ? 'closed' : job.isOpen ? 'open' : 'expired'}>
        {closed ? 'Closed' : job.isOpen ? 'Open' : 'Expired'}
        <span className="font-normal text-text-2">
          {closed
            ? job.closedReason
              ? `: ${job.closedReason}`
              : ''
            : job.isOpen
              ? ` until ${formatDay(job.expiresAt)}`
              : ` ${formatDay(job.expiresAt)}`}
        </span>
      </p>
      <p className="mt-0.5 text-sm text-text-2">
        {listed
          ? 'Closing takes it off the jobs list. People who applied can still see it.'
          : 'Reopening lists the job again for 60 days.'}
        {applicantCount ? ' A job with applicants can be closed, not deleted.' : ''}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" className={cn('h-10 rounded-lg', outlineButtonClass)}>
          <Link to={`/employer?edit=${job.id}&from=job`}>Edit</Link>
        </Button>
        <Button asChild variant="outline" className={cn('h-10 rounded-lg', outlineButtonClass)}>
          <Link to={`/employer?copy=${job.id}&from=job`}>Post another like this</Link>
        </Button>
        {listed ? (
          !closing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                update.reset();
                setClosing(true);
              }}
              className={cn('h-10 rounded-lg', outlineButtonClass)}
            >
              Close job
            </Button>
          )
        ) : (
          <Button
            type="button"
            aria-disabled={update.isPending}
            aria-busy={update.isPending}
            onClick={() => {
              if (!update.isPending) update.mutate({ status: 'open' });
            }}
            className={cn('h-10 rounded-lg', busyButtonClass)}
          >
            {update.isPending && <Loader2 className="animate-spin" />}
            Reopen job
          </Button>
        )}
        {listed && daysLeft <= 14 && (
          <Button
            type="button"
            variant="outline"
            aria-disabled={extend.isPending}
            aria-busy={extend.isPending}
            onClick={() => {
              if (!extend.isPending) extend.mutate(job.id);
            }}
            className={cn('h-10 rounded-lg', outlineButtonClass, busyButtonClass)}
            data-extend-job
          >
            {extend.isPending && <Loader2 className="animate-spin" />}
            Extend 60 days
          </Button>
        )}
        {applicantCount === 0 && (
          <button
            type="button"
            onClick={() => {
              remove.reset();
              setDeleting(true);
            }}
            className={cn(detailActionClass, 'h-10')}
          >
            Delete
          </button>
        )}
      </div>

      {closing && listed && (
        <form
          onSubmit={close}
          onKeyDown={(event) => {
            // Escape leaves the job open, as Cancel does.
            if (event.key === 'Escape' && !update.isPending) setClosing(false);
          }}
          className="mt-4 space-y-3 border-t border-line pt-4"
        >
          <Field label="Reason" htmlFor="close-reason" optional hint="Shown to people who applied, e.g. “Position filled”.">
            <input
              id="close-reason"
              type="text"
              maxLength={120}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {/* Looks like the rest: the step it took to get here carries the weight. */}
            <Button
              type="submit"
              aria-disabled={update.isPending}
              aria-busy={update.isPending}
              className={cn('h-10 rounded-lg', busyButtonClass)}
            >
              {update.isPending && <Loader2 className="animate-spin" />}
              Close this job
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!update.isPending) setClosing(false);
              }}
              className={cn('h-10 rounded-lg', outlineButtonClass)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <ErrorNote error={update.error ?? extend.error} className="mt-3" />

      <ConfirmDialog
        open={deleting}
        title="Delete this job?"
        description={
          <p>
            Job #{job.serial}, {job.title}, is removed for good. Nobody has applied to it.
          </p>
        }
        confirmLabel="Delete job"
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutate(job.id, { onSuccess: () => navigate('/employer', { replace: true }) })}
        onCancel={() => setDeleting(false)}
      />
    </div>
  );
}
