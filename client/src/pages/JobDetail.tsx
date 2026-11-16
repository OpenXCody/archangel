import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Circle, ExternalLink, Info, Loader2, Lock, MapPin, SearchX, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  ApiError,
  EMPLOYER_STATUSES,
  isFinished,
  signInPath,
  useAccount,
  useApply,
  useJob,
  useJobApplicants,
  useUpdateApplication,
  useUpdateJob,
  type Applicant,
  type ApplicationStatus,
  type JobDetail as JobDetailData,
  type JobDetailResponse,
  type JobSkill,
} from '../lib/account';
import { applicationStatusLabel, employmentLabel, formatAgo, formatDate, formatPay, formatPlace } from '../lib/jobFormat';
import {
  ApplicationStatusBadge,
  CardNote,
  ENTITY,
  ErrorNote,
  Field,
  HeldMeter,
  LoadError,
  PageLoading,
  RowsSkeleton,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
} from '../components/account/parts';
import { EmptyState, PageContainer, PageHeader, PageSection } from '../components/layout/Page';
import CompanyLogo from '../components/CompanyLogo';

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const account = useAccount();
  const job = useJob(id);
  const signedIn = Boolean(account.data?.user);

  const title = job.data?.job.title;
  useEffect(() => {
    if (title) document.title = `${title} · Jobs · Archangel`;
  }, [title]);

  if (job.isPending) return <PageLoading label="Loading job" />;

  if (job.isError) {
    const gone = job.error instanceof ApiError && (job.error.status === 404 || job.error.status === 400);
    return (
      <PageContainer size="narrow">
        {gone ? (
          <EmptyState
            icon={SearchX}
            title="This job is not available"
            description="It may have been filled or closed, or the link is wrong."
            action={
              <Button asChild className="h-10 rounded-lg">
                <Link to="/jobs">See open jobs</Link>
              </Button>
            }
          />
        ) : (
          <LoadError error={job.error} onRetry={() => void job.refetch()} retrying={job.isFetching} />
        )}
      </PageContainer>
    );
  }

  const data = job.data;
  const requiredSkills = data.skills.filter((skill) => skill.required);
  const optionalSkills = data.skills.filter((skill) => !skill.required);
  // Not every factory has a city on record; its name places it well enough.
  const place = data.job.city
    ? formatPlace(data.job.city, data.job.state)
    : [data.job.factoryName, data.job.state].filter(Boolean).join(', ');

  return (
    <PageContainer size="narrow">
      <PageHeader
        backTo={{ to: '/jobs', label: 'All jobs' }}
        eyebrow={`Job #${data.job.serial}`}
        title={data.job.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-2">
              <CompanyLogo name={data.job.companyName} domain={data.job.companyDomain} size={22} className="rounded" />
              {data.job.companyName}
            </span>
            {place && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" />
                {place}
              </span>
            )}
          </span>
        }
      />

      {!data.job.isOpen && <ClosedNotice job={data.job} />}

      <PageSection>
        <TermsCard job={data.job} />
      </PageSection>

      <PageSection title="Apply">
        <ApplyPanel data={data} signedIn={signedIn} />
      </PageSection>

      {data.job.description && (
        <PageSection title="About the job">
          <div className={cn(cardClass, 'whitespace-pre-line break-words p-4 text-sm leading-relaxed text-fg-default sm:p-6')}>
            {data.job.description}
          </div>
        </PageSection>
      )}

      <PageSection
        title="Required skills"
        description={
          requiredSkills.length === 0
            ? undefined
            : signedIn
              ? 'Marked against the skills you hold on your page.'
              : undefined
        }
      >
        {requiredSkills.length === 0 ? (
          <CardNote>No required skills are listed for this job.</CardNote>
        ) : (
          <>
            {signedIn ? (
              <HeldMeter
                held={requiredSkills.filter((skill) => skill.held).length}
                total={requiredSkills.length}
                noun="required skills held"
                className="mb-3"
              />
            ) : (
              <p className="mb-3 text-sm text-fg-muted">
                <Link
                  to={signInPath(`/jobs/${data.job.id}`)}
                  className="font-medium text-fg-default underline underline-offset-4 hover:no-underline"
                >
                  Sign in
                </Link>{' '}
                to see which of these you already hold.
              </p>
            )}
            <SkillList skills={requiredSkills} signedIn={signedIn} />
          </>
        )}
      </PageSection>

      {optionalSkills.length > 0 && (
        <PageSection title="Optional skills" description="Good to have, not needed to apply.">
          <SkillList skills={optionalSkills} signedIn={signedIn} />
        </PageSection>
      )}

      {data.canManage && <ManageSection job={data.job} />}
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

function ClosedNotice({ job }: { job: JobDetailData }) {
  const closed = job.status === 'closed';
  return (
    <div className={cn(cardClass, 'mb-6 flex items-start gap-3 border-warning/30 p-4')} role="status">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p className="min-w-0 break-words text-sm text-fg-default">
        {closed ? 'This job is closed and no longer takes applications.' : 'This job has expired and no longer takes applications.'}
        {closed && job.closedReason && <span className="text-fg-muted"> Reason: {job.closedReason}</span>}
      </p>
    </div>
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

function EntityLink({ kind, to, label, name }: { kind: 'company' | 'factory' | 'career'; to: string; label: string; name: string }) {
  const { icon: Icon, text } = ENTITY[kind];
  return (
    <Link
      to={to}
      className={cn(rowClass, 'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-elevated sm:px-6')}
    >
      <Icon className={cn('h-4 w-4 shrink-0', text)} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-fg-muted">{label}</span>
        <span className="block break-words text-sm font-medium text-fg-default">{name}</span>
      </span>
      <span className="shrink-0 text-xs text-fg-muted" aria-hidden="true">
        View
      </span>
    </Link>
  );
}

function TermsCard({ job }: { job: JobDetailData }) {
  return (
    <div className={cardClass}>
      <dl className="grid grid-cols-1 gap-4 p-4 xs:grid-cols-2 sm:grid-cols-4 sm:p-6">
        <Term label="Pay">{formatPay(job.payMin, job.payMax, job.payPeriod)}</Term>
        <Term label="Type">{employmentLabel(job.employmentType)}</Term>
        <Term label="Shift">{job.shift || 'Not stated'}</Term>
        <Term label="Posted">{formatDate(job.postedAt)}</Term>
      </dl>
      <EntityLink kind="company" to={`/companies/${job.companyId}`} label="Company" name={job.companyName} />
      <EntityLink
        kind="factory"
        to={`/factories/${job.factoryId}`}
        label="Factory"
        name={[job.factoryName, formatPlace(job.city, job.state)].filter(Boolean).join(' · ')}
      />
      <EntityLink kind="career" to={`/occupations/${job.occupationId}`} label="Career" name={job.occupationTitle} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

function SkillList({ skills, signedIn }: { skills: JobSkill[]; signedIn: boolean }) {
  return (
    <ul className={cardClass}>
      {skills.map((skill) => (
        <li key={skill.id} className={cn(rowClass, 'flex items-center gap-3 px-4 py-2.5')} data-held={signedIn ? String(skill.held) : undefined}>
          {signedIn ? (
            skill.held ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-fg-soft" aria-hidden="true" />
            )
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
          )}
          <Link
            to={`/skills/${skill.id}`}
            className="min-w-0 flex-1 break-words text-sm text-fg-default underline-offset-4 hover:underline"
          >
            {skill.name}
          </Link>
          {signedIn && (
            <span className={cn('shrink-0 text-xs font-medium', skill.held ? 'text-success' : 'text-fg-muted')}>
              {skill.held ? 'You hold this' : 'Not yet'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function ApplyPanel({ data, signedIn }: { data: JobDetailResponse; signedIn: boolean }) {
  const { job, myApplication } = data;
  const apply = useApply(job.id);
  const [note, setNote] = useState('');
  const [applyAsManager, setApplyAsManager] = useState(false);

  // A withdrawn application can be taken up again while the job is open, so
  // the form comes back; otherwise the application's state is all there is to show.
  const canReapply = myApplication?.status === 'withdrawn' && job.isOpen && !job.applyUrl;
  if (myApplication && !canReapply) {
    return (
      <div className={cn(cardClass, 'flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:p-6')}>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm font-medium text-fg-default">You applied {formatAgo(myApplication.createdAt)}.</p>
          <p className="mt-0.5 text-sm text-fg-muted">
            Follow it on{' '}
            <Link to="/me" className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
              your page
            </Link>
            .
          </p>
        </div>
        <ApplicationStatusBadge status={myApplication.status} />
      </div>
    );
  }

  if (!job.isOpen) {
    return <CardNote>This job is not taking applications.</CardNote>;
  }

  if (data.canManage && !applyAsManager) {
    // The people who run the job mostly come here for its applicants, not to apply.
    return (
      <div className={cn(cardClass, 'p-4 sm:p-6')}>
        <p className="text-sm text-fg-muted">
          You manage this job for {job.companyName.replace(/\.$/, '')}.{' '}
          {job.applyUrl ? 'People apply on your own site.' : 'People who apply are listed further down.'}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button asChild variant="outline" className={cn('h-10 rounded-lg', outlineButtonClass)}>
            <a href="#manage-job">{job.applyUrl ? 'Manage this job' : 'Go to applicants'}</a>
          </Button>
          <button
            type="button"
            onClick={() => setApplyAsManager(true)}
            className="text-sm font-medium text-fg-muted underline underline-offset-4 hover:text-fg-default"
          >
            Apply to it myself
          </button>
        </div>
      </div>
    );
  }

  if (job.applyUrl) {
    const host = hostOf(job.applyUrl);
    return (
      <div className={cn(cardClass, 'p-4 sm:p-6')}>
        <p className="mb-3 text-sm text-fg-muted">
          {job.companyName} takes applications for this job on its own site{host ? ` (${host})` : ''}.
        </p>
        <Button asChild className="h-11 w-full rounded-lg sm:w-auto">
          <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
            Apply on the company site
            <ExternalLink />
          </a>
        </Button>
      </div>
    );
  }

  if (!signedIn) {
    const here = `/jobs/${job.id}`;
    return (
      <div className={cn(cardClass, 'p-4 sm:p-6')}>
        <p className="mb-3 text-sm text-fg-muted">Apply here with your name, email and the skills on your page.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button asChild className="h-11 w-full rounded-lg sm:w-auto">
            <Link to={signInPath(here)}>Sign in to apply</Link>
          </Button>
          <Link
            to={signInPath(here, 'create')}
            className="text-sm font-medium text-fg-default underline underline-offset-4 hover:no-underline"
          >
            Create an account
          </Link>
        </div>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!apply.isPending) apply.mutate(note);
  };

  return (
    <form onSubmit={submit} className={cn(cardClass, 'space-y-4 p-4 sm:p-6')}>
      <Field
        label="Note to the company"
        htmlFor="apply-note"
        optional
        hint="The company sees your name, email, ZIP code and how many of the job's skills you hold."
      >
        <textarea
          id="apply-note"
          rows={3}
          maxLength={2000}
          placeholder="When you can start, what you have done before"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={cn(fieldClass, 'resize-y')}
        />
      </Field>
      <ErrorNote error={apply.error} />
      <Button type="submit" disabled={apply.isPending} className="h-11 w-full rounded-lg sm:w-auto sm:px-8">
        {apply.isPending && <Loader2 className="animate-spin" />}
        Apply
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// For the company: close or reopen, and the applicants
// ---------------------------------------------------------------------------

function ManageSection({ job }: { job: JobDetailData }) {
  const applicants = useJobApplicants(job.id);
  const count = applicants.data?.applications.length;
  // With an application link the company collects applications itself.
  const offsite = Boolean(job.applyUrl);

  return (
    <div id="manage-job" className="mt-10 scroll-mt-16 border-t border-border-subtle pt-8">
      <PageSection
        title="Manage this job"
        description={`Only people who manage jobs for ${job.companyName} see this part of the page.`}
      >
        <JobStatusControl job={job} />
      </PageSection>

      <PageSection
        title={
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-fg-muted" />
            Applicants{typeof count === 'number' ? ` (${count})` : ''}
          </span>
        }
        description={
          offsite && !count ? undefined : 'Ranked by required skills held, then optional skills held, then who applied first.'
        }
      >
        {applicants.isPending ? (
          <RowsSkeleton rows={2} />
        ) : applicants.isError ? (
          <LoadError error={applicants.error} onRetry={() => void applicants.refetch()} retrying={applicants.isFetching} />
        ) : (
          <>
            {applicants.data.skillsAreSelfReported && !(offsite && count === 0) && (
              <p className={cn(cardClass, 'mb-3 flex items-start gap-2 p-3 text-sm text-fg-muted')}>
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Skills are self-reported by applicants. Nothing here has been verified.</span>
              </p>
            )}
            {applicants.data.applications.length === 0 ? (
              <CardNote>
                {offsite
                  ? 'People apply to this job on your own site, so applicants are not listed here.'
                  : 'Nobody has applied yet. Applicants appear here as soon as they do.'}
              </CardNote>
            ) : (
              <ol className="space-y-3">
                {applicants.data.applications.map((applicant, index) => (
                  <ApplicantCard key={applicant.id} applicant={applicant} rank={index + 1} />
                ))}
              </ol>
            )}
          </>
        )}
      </PageSection>
    </div>
  );
}

function JobStatusControl({ job }: { job: JobDetailData }) {
  const update = useUpdateJob(job.id);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  const closed = job.status === 'closed';

  const close = (event: FormEvent) => {
    event.preventDefault();
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
    <div className={cn(cardClass, 'p-4 sm:p-6')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-medium text-fg-default">
            {closed ? 'Closed' : job.isOpen ? 'Open' : 'Expired'}
            <span className="font-normal text-fg-muted">
              {closed
                ? job.closedReason
                  ? `: ${job.closedReason}`
                  : ''
                : job.isOpen
                  ? ` until ${formatDate(job.expiresAt)}`
                  : ` on ${formatDate(job.expiresAt)}`}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-fg-muted">
            {closed || !job.isOpen
              ? 'Reopening lists the job again for 60 days.'
              : 'Closing takes it off the jobs list. People who applied can still see it.'}
          </p>
        </div>
        {closed || !job.isOpen ? (
          <Button type="button" disabled={update.isPending} onClick={() => update.mutate({ status: 'open' })} className="h-10 rounded-lg">
            {update.isPending && <Loader2 className="animate-spin" />}
            Reopen job
          </Button>
        ) : (
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
        )}
      </div>

      {closing && !closed && job.isOpen && (
        <form onSubmit={close} className="mt-4 space-y-3 border-t border-border-subtle pt-4">
          <Field label="Reason" htmlFor="close-reason" optional hint="Shown to people who applied, e.g. “Position filled”.">
            <input
              id="close-reason"
              type="text"
              maxLength={120}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" disabled={update.isPending} className="h-10 rounded-lg">
              {update.isPending && <Loader2 className="animate-spin" />}
              Close this job
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={update.isPending}
              onClick={() => setClosing(false)}
              className={cn('h-10 rounded-lg', outlineButtonClass)}
            >
              Keep it open
            </Button>
          </div>
        </form>
      )}
      <ErrorNote error={update.error} className="mt-3" />
    </div>
  );
}

function ApplicantCard({ applicant, rank }: { applicant: Applicant; rank: number }) {
  const move = useUpdateApplication();
  const saveNote = useUpdateApplication();
  const savedNote = applicant.employerNote ?? '';
  const [note, setNote] = useState(savedNote);
  const [pendingFinal, setPendingFinal] = useState<ApplicationStatus | null>(null);
  const finished = isFinished(applicant.status);
  const noteDirty = note !== savedNote;
  const noteId = `employer-note-${applicant.id}`;

  const moveTo = (status: ApplicationStatus) => {
    move.mutate({ applicationId: applicant.id, patch: { status } }, { onSettled: () => setPendingFinal(null) });
  };

  const chooseStage = (value: string) => {
    const status = value as ApplicationStatus;
    if (status === applicant.status) return;
    move.reset();
    // Hired and declined cannot be undone, so they take a second step.
    if (isFinished(status)) setPendingFinal(status);
    else moveTo(status);
  };

  return (
    <li className={cn(cardClass, 'p-4 sm:p-5')} data-applicant={applicant.applicant.email}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-xs font-semibold tabular-nums text-fg-muted"
            aria-label={`Rank ${rank}`}
          >
            {rank}
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-fg-default">{applicant.applicant.name}</p>
            <a
              href={`mailto:${applicant.applicant.email}`}
              className="block break-all text-sm text-fg-muted underline-offset-4 hover:text-fg-default hover:underline"
            >
              {applicant.applicant.email}
            </a>
            <p className="mt-0.5 text-xs text-fg-muted">
              {applicant.applicant.homeZip ? `ZIP ${applicant.applicant.homeZip} · ` : ''}Applied {formatAgo(applicant.createdAt)}
            </p>
          </div>
        </div>

        <div className="w-full shrink-0 sm:w-44">
          {finished ? (
            <div className="flex items-center gap-2 sm:justify-end">
              <ApplicationStatusBadge status={applicant.status} />
              <span className="text-xs text-fg-muted">Final</span>
            </div>
          ) : (
            <Select value={applicant.status} onValueChange={chooseStage} disabled={move.isPending}>
              <SelectTrigger
                aria-label={`Stage for ${applicant.applicant.name}`}
                className="h-[42px] rounded-lg border-border-strong bg-bg-elevated px-3 text-sm text-fg-default shadow-none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-border-strong bg-bg-surface">
                {EMPLOYER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status} className="py-2.5">
                    {applicationStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {pendingFinal && !finished && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-bg-elevated p-3" role="group" aria-label="Confirm final stage">
          <span className="min-w-0 flex-1 basis-48 text-sm text-fg-default">
            Mark {applicant.applicant.name} as {applicationStatusLabel(pendingFinal).toLowerCase()}? This is final and cannot be changed.
          </span>
          <div className="flex shrink-0 gap-2">
            <Button type="button" size="sm" disabled={move.isPending} onClick={() => moveTo(pendingFinal)} className="h-9">
              {move.isPending && <Loader2 className="animate-spin" />}
              Confirm
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={move.isPending}
              onClick={() => setPendingFinal(null)}
              className={cn('h-9', outlineButtonClass)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      <ErrorNote error={move.error} className="mt-3" />

      <div className="mt-4">
        {applicant.totalRequired > 0 ? (
          <HeldMeter held={applicant.heldRequired} total={applicant.totalRequired} noun="required skills held" />
        ) : (
          <p className="text-sm text-fg-muted">This job lists no required skills.</p>
        )}
        {applicant.heldOptional > 0 && (
          <p className="mt-1 text-xs text-fg-muted">
            Plus {applicant.heldOptional} optional {applicant.heldOptional === 1 ? 'skill' : 'skills'} held.
          </p>
        )}
      </div>

      {applicant.note && (
        <div className="mt-4">
          <p className="text-xs text-fg-muted">Note from {applicant.applicant.name}</p>
          <p className="mt-1 whitespace-pre-line break-words rounded-lg bg-bg-elevated p-3 text-sm text-fg-default">{applicant.note}</p>
        </div>
      )}

      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!noteDirty || saveNote.isPending) return;
          // The server stores the note trimmed; match it so the form reads as saved.
          saveNote.mutate({ applicationId: applicant.id, patch: { employerNote: note } }, { onSuccess: () => setNote((text) => text.trim()) });
        }}
      >
        <Field label="Private note" htmlFor={noteId} hint="Only your company sees this. The applicant never does.">
          <textarea
            id={noteId}
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={cn(fieldClass, 'resize-y')}
          />
        </Field>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={!noteDirty || saveNote.isPending}
            className={cn('h-9', outlineButtonClass)}
          >
            {saveNote.isPending && <Loader2 className="animate-spin" />}
            Save note
          </Button>
          {saveNote.isSuccess && !noteDirty && (
            <span role="status" className="inline-flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
        </div>
        <ErrorNote error={saveNote.error} className="mt-2" />
      </form>
    </li>
  );
}
