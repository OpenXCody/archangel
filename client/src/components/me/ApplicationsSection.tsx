import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMarkSeen } from '../../lib/account';
import { isFinished, useUpdateApplication } from '../../lib/jobs';
import { applicationStatusLabel, formatPlace } from '../../lib/jobFormat';
import { useMyApplications, type MyApplication } from '../../lib/seeker';
import {
  ApplicationStatusBadge,
  ErrorNote,
  LoadError,
  RowsSkeleton,
  busyButtonClass,
  cardClass,
  outlineButtonClass,
  rowClass,
} from '../account/parts';
import { formatDay } from '../../lib/dates';
import { PageSection } from '../layout/Page';

export default function ApplicationsSection({ email }: { email: string }) {
  const applications = useMyApplications();
  const { mutate: markSeen } = useMarkSeen();
  // Applications the company moved since the last visit are listed first, and
  // stay first for as long as this page is open: opening it is what marks them
  // seen, and the list must not reshuffle under the person a moment later.
  const movedRef = useRef(new Set<string>());
  const moved = (applications.data ?? []).filter((application) => application.changed).map((application) => application.id);
  for (const id of moved) movedRef.current.add(id);
  const movedKey = moved.join(',');
  useEffect(() => {
    if (movedKey) markSeen({ applications: true });
  }, [movedKey, markSeen]);
  const rank = (application: MyApplication) => (movedRef.current.has(application.id) ? 0 : 1);
  // A stable sort: within each group the server's order (newest first) stands.
  const listed = [...(applications.data ?? [])].sort((a, b) => rank(a) - rank(b));

  return (
    <PageSection title="Applications">
      {applications.isPending ? (
        <RowsSkeleton rows={2} />
      ) : applications.isError ? (
        <LoadError error={applications.error} onRetry={() => void applications.refetch()} retrying={applications.isFetching} />
      ) : (
        <ul className={cardClass}>
          {listed.map((application) => (
            <ApplicationRow key={application.id} application={application} email={email} />
          ))}
        </ul>
      )}
    </PageSection>
  );
}

/** Stages at which the next move is the company's, and the person should know how it will come. */
const CONTACT_STAGES: ReadonlySet<string> = new Set(['interview', 'offer']);

function ApplicationRow({ application, email }: { application: MyApplication; email: string }) {
  const update = useUpdateApplication();
  const [confirming, setConfirming] = useState(false);
  const finished = isFinished(application.status);
  const place = formatPlace(application.city, application.state);
  const jobRef = useRef<HTMLAnchorElement>(null);
  const withdrawRef = useRef<HTMLButtonElement>(null);
  // Where the focus goes once the confirm step has closed: back to Withdraw
  // when the application was kept, to the job's name when it was withdrawn
  // (the buttons are gone by then).
  const focusAfter = useRef<'withdraw' | 'job' | null>(null);

  // If the company finishes it while the confirm step is open, drop the step.
  useEffect(() => {
    if (finished) setConfirming(false);
  }, [finished]);

  useEffect(() => {
    if (confirming || !focusAfter.current) return;
    (focusAfter.current === 'job' || finished ? jobRef : withdrawRef).current?.focus();
    focusAfter.current = null;
  }, [confirming, finished]);

  const keep = () => {
    if (update.isPending) return;
    focusAfter.current = 'withdraw';
    setConfirming(false);
  };

  const withdraw = () => {
    if (update.isPending) return;
    update.mutate(
      { applicationId: application.id, patch: { status: 'withdrawn' } },
      {
        onSuccess: () => (focusAfter.current = 'job'),
        onSettled: () => setConfirming(false),
      }
    );
  };

  return (
    <li className={cn(rowClass, 'py-4')} data-application={application.id}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            ref={jobRef}
            to={`/jobs/${application.jobId}`}
            className="block break-words text-sm font-medium text-text-1 underline-offset-4 hover:underline"
          >
            {application.jobTitle}
          </Link>
          <p className="mt-0.5 break-words text-sm text-text-2">
            {application.companyName}
            {place && ` · ${place}`}
          </p>
          {/* Its history in one line; the stage it is at now is the bright one. */}
          <p className="mt-1.5 break-words text-xs text-text-2" data-application-history>
            {application.events.map((event, index) => (
              <Fragment key={`${event.at}:${event.status}`}>
                {index > 0 && ' · '}
                {/* A stage and its date stay on one line together. */}
                <span className={cn('whitespace-nowrap', index === application.events.length - 1 && 'text-text-1')}>
                  {applicationStatusLabel(event.status)} {formatDay(event.at)}
                </span>
              </Fragment>
            ))}
            {application.jobStatus === 'closed' && <span>{application.events.length > 0 && ' · '}This job has closed</span>}
          </p>
          {CONTACT_STAGES.has(application.status) && (
            <p className="mt-1.5 break-words text-sm text-text-1" data-application-next>
              {application.companyName} will contact you at {email}.
            </p>
          )}
        </div>
        <ApplicationStatusBadge status={application.status} className="mt-0.5" />
      </div>

      {!finished && (
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          onKeyDown={(event) => {
            // Escape leaves the application as it is.
            if (event.key === 'Escape' && confirming) keep();
          }}
        >
          {confirming ? (
            <>
              <span className="min-w-0 flex-1 basis-56 text-sm text-text-2" id={`withdraw-${application.id}`}>
                Withdraw this application? You can apply again while the job is open.
              </span>
              <div className="flex shrink-0 gap-2" role="group" aria-labelledby={`withdraw-${application.id}`}>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  aria-busy={update.isPending}
                  aria-disabled={update.isPending}
                  onClick={withdraw}
                  className={cn('h-9', busyButtonClass)}
                >
                  {update.isPending && <Loader2 className="animate-spin" />}
                  Yes, withdraw
                </Button>
                {/* Focus starts on the answer that changes nothing. */}
                <Button type="button" variant="outline" size="sm" autoFocus onClick={keep} className={cn('h-9', outlineButtonClass)}>
                  Keep it
                </Button>
              </div>
            </>
          ) : (
            <Button
              ref={withdrawRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                update.reset();
                setConfirming(true);
              }}
              className={cn('h-9', outlineButtonClass)}
            >
              Withdraw
            </Button>
          )}
        </div>
      )}
      <ErrorNote error={update.error} className="mt-2" />
    </li>
  );
}
