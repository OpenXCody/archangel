import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ExternalLink, Loader2, Lock, MapPin, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ApiError,
  signInPath,
  useAccount,
  useApply,
  useJob,
  useMySkills,
  useUpdateJob,
  type JobDetail as JobDetailData,
  type JobDetailResponse,
  type JobSkill,
} from '../lib/account';
import { useApplicantList, useDeleteJob } from '../lib/employerJobs';
import { useMarkSkill } from '../lib/seeker';
import { employmentLabel, formatAgo, formatDate, formatPay, formatPlace } from '../lib/jobFormat';
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
  textButtonClass,
} from '../components/account/parts';
import ApplicantList from '../components/account/ApplicantList';
import { SkillHeldToggle } from '../components/account/SkillStatusButton';
import { busyButtonClass } from '../components/account/JobForm';
import ConfirmDialog from '../components/admin/ConfirmDialog';
import { EmptyState, PageContainer, PageHeader, PageSection } from '../components/layout/Page';
import CompanyLogo from '../components/CompanyLogo';

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const account = useAccount();
  const job = useJob(id);
  const signedIn = Boolean(account.data?.user);
  // A person who manages the job sees it as its company does, until they
  // choose to apply to it themselves.
  const [applyAsManager, setApplyAsManager] = useState(false);

  const title = job.data?.job.title;
  useEffect(() => {
    if (title) document.title = `${title} · Jobs · Archangel`;
  }, [title]);

  // A link to a part of the page (#manage-job) arrives before the job has
  // loaded, so the browser finds nothing to scroll to. Go there once it has.
  const loaded = Boolean(job.data);
  useEffect(() => {
    if (!loaded || location.hash.length < 2) return;
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, [loaded, location.hash]);

  useEffect(() => {
    if (applyAsManager) document.getElementById('apply-note')?.focus();
  }, [applyAsManager]);

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
  const manages = data.canManage;
  const applying = !manages || applyAsManager || Boolean(data.myApplication);
  // Skills are marked against the reader's own only when they are here to apply.
  const marksHeld = signedIn && applying;
  const requiredSkills = data.skills.filter((skill) => skill.required);
  const optionalSkills = data.skills.filter((skill) => !skill.required);
  // Not every factory has a city on record; its name places it well enough.
  const place = data.job.city
    ? formatPlace(data.job.city, data.job.state)
    : [data.job.factoryName, data.job.state].filter(Boolean).join(', ');

  // A person who can mark skills meets them before the Apply button: the
  // company ranks applicants by the required skills they hold, so marking
  // first is what helps them.
  const applyAfterSkills = marksHeld && !manages && data.job.isOpen && !data.myApplication && requiredSkills.length > 0;
  const terms = <TermsCard job={data.job} showApplications={manages} />;
  const apply = (
    <PageSection title="Apply">
      <ApplyPanel data={data} signedIn={signedIn} />
    </PageSection>
  );

  return (
    <PageContainer size="narrow">
      <PageHeader
        backTo={manages ? { to: '/employer', label: 'Your jobs' } : { to: '/jobs', label: 'All jobs' }}
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

      {manages ? (
        // The company's view comes first: the job's state, then who applied.
        <>
          <ManageSection job={data.job} />
          <PageSection title="Listing" description="The job as applicants see it." className="mt-10 border-t border-border-subtle pt-8">
            {terms}
          </PageSection>
        </>
      ) : (
        <>
          {!data.job.isOpen && <ClosedNotice job={data.job} />}
          <PageSection>{terms}</PageSection>
          {!applyAfterSkills && apply}
        </>
      )}

      {data.job.description && (
        <PageSection title="About the job">
          <div className={cn(cardClass, 'whitespace-pre-line break-words p-4 text-sm leading-relaxed text-fg-default sm:p-6')}>
            {data.job.description}
          </div>
        </PageSection>
      )}

      <PageSection
        title="Required skills"
        description={requiredSkills.length > 0 && marksHeld ? 'Mark the ones you have. The company sees how many you hold.' : undefined}
      >
        {requiredSkills.length === 0 ? (
          <CardNote>No required skills are listed for this job.</CardNote>
        ) : (
          <>
            {marksHeld ? (
              <HeldMeter
                held={requiredSkills.filter((skill) => skill.held).length}
                total={requiredSkills.length}
                noun="required skills held"
                className="mb-3"
              />
            ) : (
              !signedIn && (
                <p className="mb-3 text-sm text-fg-muted">
                  <Link
                    to={signInPath(`/jobs/${data.job.id}`)}
                    className="font-medium text-fg-default underline underline-offset-4 hover:no-underline"
                  >
                    Sign in
                  </Link>{' '}
                  to see which of these you already hold.
                </p>
              )
            )}
            <SkillList skills={requiredSkills} marksHeld={marksHeld} />
          </>
        )}
      </PageSection>

      {optionalSkills.length > 0 && (
        <PageSection title="Optional skills" description="Good to have, not needed to apply.">
          <SkillList skills={optionalSkills} marksHeld={marksHeld} />
        </PageSection>
      )}

      {applyAfterSkills && apply}

      {manages &&
        (applying ? (
          apply
        ) : (
          data.job.isOpen &&
          !data.job.applyUrl && (
            <button type="button" onClick={() => setApplyAsManager(true)} className={textButtonClass}>
              Apply to this job myself
            </button>
          )
        ))}
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

function TermsCard({ job, showApplications }: { job: JobDetailData; showApplications: boolean }) {
  const host = job.applyUrl ? hostOf(job.applyUrl) : null;
  return (
    <div className={cardClass}>
      <dl className="grid grid-cols-1 gap-4 p-4 xs:grid-cols-2 sm:grid-cols-4 sm:p-6">
        <Term label="Pay">{formatPay(job.payMin, job.payMax, job.payPeriod)}</Term>
        <Term label="Type">{employmentLabel(job.employmentType)}</Term>
        <Term label="Shift">{job.shift || 'Not stated'}</Term>
        <Term label="Posted">{formatDate(job.postedAt)}</Term>
        {/* Applicants meet this as the Apply panel; the company has none. */}
        {showApplications && (
          <div className="min-w-0 xs:col-span-2 sm:col-span-4">
            <Term label="Applications">
              {job.applyUrl ? (
                <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4 hover:no-underline">
                  {host ?? job.applyUrl}
                </a>
              ) : (
                'In the app'
              )}
            </Term>
          </div>
        )}
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

function SkillList({ skills, marksHeld }: { skills: JobSkill[]; marksHeld: boolean }) {
  // For a signed-in person each row carries the same mark as a career's path:
  // one tap says "I have this", and the figure above follows at once.
  const { data: mySkills } = useMySkills(marksHeld);
  const markSkill = useMarkSkill();
  const statusBySkill = new Map((mySkills ?? []).map((s) => [s.skillId, s.status]));
  return (
    <>
      {marksHeld && <ErrorNote error={markSkill.error} className="mb-2" />}
      <ul className={cardClass}>
        {skills.map((skill) => {
          // The person's own list is the live answer; the job's copy is the fallback until it loads.
          const status = (mySkills ? statusBySkill.get(skill.id) : skill.held ? 'held' : undefined) ?? 'none';
          const held = status === 'held';
          return (
            <li
              key={skill.id}
              className={cn(rowClass, 'flex items-center gap-1 py-0.5 pr-4', marksHeld ? 'pl-1' : 'gap-3 px-4 py-2.5')}
              data-held={marksHeld ? String(held) : undefined}
            >
              {marksHeld ? (
                <SkillHeldToggle
                  value={status}
                  label={skill.name}
                  onChange={(mark) => markSkill.mutate({ skillId: skill.id, name: skill.name, mark })}
                />
              ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg-soft" aria-hidden="true" />
              )}
              <Link
                to={`/skills/${skill.id}`}
                className="min-w-0 flex-1 break-words text-sm text-fg-default underline-offset-4 hover:underline"
              >
                {skill.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
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
      <Button
        type="submit"
        aria-disabled={apply.isPending}
        aria-busy={apply.isPending}
        className={cn('h-11 w-full rounded-lg sm:w-auto sm:px-8', busyButtonClass)}
      >
        {apply.isPending && <Loader2 className="animate-spin" />}
        Apply
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// For the company: the job's state and what can be done with it, then applicants
// ---------------------------------------------------------------------------

function ManageSection({ job }: { job: JobDetailData }) {
  const applicants = useApplicantList(job.id);
  const count = applicants.data?.applications.length;
  // With an application link the company collects applications itself.
  const offsite = Boolean(job.applyUrl);

  return (
    <div id="manage-job" className="scroll-mt-20">
      <PageSection title="Manage" description={`Seen only by people who manage jobs for ${job.companyName.replace(/\.$/, '')}.`}>
        <JobStatusControl job={job} applicantCount={count} />
      </PageSection>

      <PageSection
        title={
          <span id="applicants" className="scroll-mt-20">
            Applicants{count ? <span className="ml-2 font-normal tabular-nums text-fg-muted">{count}</span> : null}
          </span>
        }
        description={count ? 'Ranked by required skills held. Skills are self-reported, not verified.' : undefined}
      >
        {applicants.isPending ? (
          <RowsSkeleton rows={2} />
        ) : applicants.isError ? (
          <LoadError error={applicants.error} onRetry={() => void applicants.refetch()} retrying={applicants.isFetching} />
        ) : applicants.data.applications.length === 0 ? (
          <CardNote>{offsite ? 'People apply on your own site, so none are listed here.' : 'Nobody has applied yet.'}</CardNote>
        ) : (
          <ApplicantList data={applicants.data} job={job} />
        )}
      </PageSection>
    </div>
  );
}

function JobStatusControl({ job, applicantCount }: { job: JobDetailData; applicantCount: number | undefined }) {
  const navigate = useNavigate();
  const update = useUpdateJob(job.id);
  const remove = useDeleteJob();
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
    <div className={cn(cardClass, 'p-4 sm:p-6')}>
      <p className="text-sm font-medium text-fg-default" data-job-state={closed ? 'closed' : job.isOpen ? 'open' : 'expired'}>
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
        {applicantCount === 0 && (
          <button
            type="button"
            onClick={() => {
              remove.reset();
              setDeleting(true);
            }}
            className={cn(textButtonClass, 'ml-2 h-10')}
          >
            Delete
          </button>
        )}
      </div>

      {closing && listed && (
        <form onSubmit={close} className="mt-4 space-y-3 border-t border-border-subtle pt-4">
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
            <Button
              type="submit"
              variant="destructive"
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
              Keep it open
            </Button>
          </div>
        </form>
      )}
      <ErrorNote error={update.error} className="mt-3" />

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
