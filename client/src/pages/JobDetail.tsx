import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ExternalLink, Loader2, Lock, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, labelClass } from '@/lib/utils';
import { signInPath, useAccount } from '../lib/account';
import { useApply, useJob, useUpdateJob, type JobDetail as JobDetailData, type JobDetailResponse, type JobSkill } from '../lib/jobs';
import { ApiError } from '../lib/http';
import { useApplicantList, useDeleteJob, useExtendJob } from '../lib/employerJobs';
import { useMarkSkill, useMySkills } from '../lib/seeker';
import { useViewer } from '../lib/viewer';
import { employmentLabel, formatPay, formatPlace } from '../lib/jobFormat';
import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import {
  ApplicationStatusBadge,
  CardNote,
  ErrorNote,
  Field,
  HeldMeter,
  LoadError,
  PageLoading,
  RowsSkeleton,
  cardClass,
  fieldClass,
  outlineButtonClass,
  textButtonClass,
  busyButtonClass,
} from '../components/account/parts';
import { DAY_MS, formatDay, formatDayCapital } from '../lib/dates';
import ApplicantList from '../components/jobs/ApplicantList';
import JobDescription from '../components/jobs/JobDescription';
import SourcedJob, { SourcedApply } from '../components/jobs/SourcedJob';
import { SkillHeldToggle } from '../components/account/SkillStatusButton';
import ConfirmDialog from '../components/layout/ConfirmDialog';
import {
  DetailFacts,
  DetailHeader,
  DetailSection,
  EmptyState,
  PageContainer,
  RecordList,
  RecordRow,
  recordListClass,
} from '../components/layout/Page';
import CompanyLogo from '../components/CompanyLogo';
import { versionPath, versionTitle } from '@shared/versions';

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const account = useAccount();
  const job = useJob(id);
  const signedIn = Boolean(account.data?.user);
  const viewer = useViewer();
  // A person who manages the job sees it as its company does, until they
  // choose to apply to it themselves.
  const [applyAsManager, setApplyAsManager] = useState(false);

  const title = job.data?.job.title;
  useEffect(() => {
    if (title) document.title = `${title} · Archangel`;
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

  // A person who was managing this job and no longer can (signed out in
  // another tab, or removed from the company) is told, not left with a page
  // that quietly lost its applicants. Who is signed in is checked again.
  const canManage = job.data?.canManage;
  const managed = useRef(false);
  const [lostAccess, setLostAccess] = useState(false);
  const recheckAccount = account.refetch;
  useEffect(() => {
    if (canManage) {
      managed.current = true;
      setLostAccess(false);
    } else if (canManage === false && managed.current) {
      managed.current = false;
      setLostAccess(true);
      void recheckAccount();
    }
  }, [canManage, recheckAccount]);

  if (job.isPending) return <PageLoading label="Loading job" />;

  const gone = job.error instanceof ApiError && (job.error.status === 404 || job.error.status === 400);
  // Only a job that never loaded is "not available". One that was on screen
  // and has since closed stays on screen and says so.
  if (job.isError && !job.data) {
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

  const justClosed = job.isError && gone;
  const data = justClosed ? { ...job.data, job: { ...job.data.job, isOpen: false } } : job.data;
  // Whether the company's view is drawn: the server says who can manage the job; an admin
  // looking at the product as someone else sees it as that person would.
  const manages = data.canManage && viewer.manages(data.job.companyId);
  // Back to the list as it was filtered, when the job was opened from it.
  const cameFrom = (location.state as { from?: unknown } | null)?.from;
  const jobsList = typeof cameFrom === 'string' && cameFrom.startsWith('/jobs?') ? cameFrom : null;
  // Applying is a seeker's, and a visitor's way in. Someone here to hire reads the listing
  // without it, unless they have an application of their own on this job.
  const applying =
    Boolean(data.myApplication) || (manages ? applyAsManager : !signedIn || viewer.seeker);
  // Skills are marked against the reader's own only when they are here to apply.
  const marksHeld = signedIn && applying;
  const requiredSkills = data.skills.filter((skill) => skill.required);
  const optionalSkills = data.skills.filter((skill) => !skill.required);
  // Not every factory has a city on record; its name places it well enough.
  const place = data.job.city
    ? formatPlace(formatFactoryName(data.job.city), data.job.state)
    : [formatFactoryName(data.job.factoryName), data.job.state].filter(Boolean).join(', ');
  const companyName = formatCompanyName(data.job.companyName);

  // A person who can mark skills meets them before the Apply button: the
  // company ranks applicants by the required skills they hold, so marking
  // first is what helps them.
  const applyAfterSkills = marksHeld && !manages && data.job.isOpen && !data.myApplication && requiredSkills.length > 0;
  const terms = <TermsCard job={data.job} showApplications={manages} />;
  const apply = (
    <DetailSection id="apply" title="Apply">
      <ApplyPanel data={data} signedIn={signedIn} />
    </DetailSection>
  );

  return (
    <PageContainer size="narrow">
      <DetailHeader
        longTitle
        back={
          // "Your jobs" is a place only for someone drawn as an employer: an admin who manages
          // every job without belonging to the company came from the open list, and goes back to it.
          manages && viewer.employer
            ? { to: '/employer', label: 'Your jobs' }
            : jobsList
              ? { to: jobsList, label: 'Back to results' }
              : { to: '/jobs', label: 'All jobs' }
        }
        // The number is the company's own count of its jobs: said to the people who manage it.
        // (A job from the company's careers site is not one of the jobs it posted here: no number.)
        kind={manages && !data.job.fromSource ? `Job #${data.job.serial}` : 'Job'}
        title={data.job.title}
        mark={<CompanyLogo name={companyName} domain={data.job.companyDomain} size={44} />}
        // A job from the company's careers site has one action, and it is the page's: Apply, there.
        action={data.job.fromSource && (manages ? false : !signedIn || viewer.seeker) ? <SourcedApply job={data.job} /> : undefined}
      >
        <DetailFacts>{[companyName, place].filter(Boolean).join(' · ')}</DetailFacts>
      </DetailHeader>

      {lostAccess && !manages && (
        <p role="status" className={cn(cardClass, 'mt-6 text-sm text-text-1')} data-lost-access>
          {signedIn ? (
            `You no longer manage jobs for ${data.job.companyName.replace(/\.$/, '')}.`
          ) : (
            <>
              You are signed out.{' '}
              <Link to={signInPath(`/jobs/${data.job.id}`)} className="font-medium underline hover:no-underline">
                Sign in
              </Link>{' '}
              to manage this job.
            </>
          )}
        </p>
      )}

      {data.job.fromSource ? (
        // What the posting says, as facts: nothing to manage, nobody to apply to here.
        <>
          {!data.job.isOpen && !manages && <ClosedNotice job={data.job} justClosed={justClosed} />}
          <SourcedJob job={data.job} skills={data.skills} manages={manages} />
        </>
      ) : manages ? (
        // The company's view comes first: the job's state, then who applied.
        <>
          <ManageSection job={data.job} />
          <DetailSection title="Listing" description="The job as applicants see it." className="mt-10 border-t border-line pt-8">
            {terms}
          </DetailSection>
        </>
      ) : (
        <>
          {!data.job.isOpen && <ClosedNotice job={data.job} justClosed={justClosed} />}
          <div className="mt-6">{terms}</div>
          {applying && !applyAfterSkills && apply}
        </>
      )}

      {!data.job.fromSource && data.job.description && (
        <DetailSection title="About the job">
          <div className={cn(cardClass, 'text-sm leading-relaxed text-text-1')}>
            <JobDescription text={data.job.description} />
          </div>
        </DetailSection>
      )}

      {!data.job.fromSource && (
        <DetailSection
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
                  <p className="mb-3 text-sm text-text-2">
                    <Link
                      to={signInPath(`/jobs/${data.job.id}`)}
                      className="font-medium text-text-1 underline hover:no-underline"
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
        </DetailSection>
      )}

      {!data.job.fromSource && optionalSkills.length > 0 && (
        <DetailSection title="Optional skills" description="Good to have, not needed to apply.">
          <SkillList skills={optionalSkills} marksHeld={marksHeld} />
        </DetailSection>
      )}

      {!data.job.fromSource && applyAfterSkills && apply}

      {manages &&
        !data.job.fromSource &&
        (applying ? (
          apply
        ) : (
          data.job.isOpen &&
          // Offered to someone whose account is for finding work and who also manages this job.
          viewer.seeker &&
          !data.job.applyUrl && (
            <button type="button" onClick={() => setApplyAsManager(true)} className={cn(textButtonClass, 'mt-8 inline-flex min-h-11 items-center')}>
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

function ClosedNotice({ job, justClosed = false }: { job: JobDetailData; justClosed?: boolean }) {
  const closed = job.status === 'closed';
  return (
    <div className={cn(cardClass, 'mt-6 flex items-start gap-3')} role="status" data-job-closed>
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-text-2" />
      <p className="min-w-0 break-words text-sm text-text-1">
        {justClosed
          ? 'This job has just closed and no longer takes applications.'
          : closed
            ? 'This job is closed and no longer takes applications.'
            : 'This job has expired and no longer takes applications.'}
        {closed && job.closedReason && <span className="text-text-2"> Reason: {job.closedReason}</span>}
      </p>
    </div>
  );
}

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={labelClass}>{label}</dt>
      <dd className="mt-1 break-words text-sm text-text-1">{children}</dd>
    </div>
  );
}

/**
 * What the job is, in one block: its terms, then the company, the factory and
 * the career it belongs to, each leading to its own page.
 */
function TermsCard({ job, showApplications }: { job: JobDetailData; showApplications: boolean }) {
  const host = job.applyUrl ? hostOf(job.applyUrl) : null;
  return (
    <div className={recordListClass} data-job-terms>
      <dl className="grid grid-cols-1 gap-4 pb-5 xs:grid-cols-2 sm:grid-cols-4">
        <Term label="Pay">{formatPay(job.payMin, job.payMax, job.payPeriod)}</Term>
        <Term label="Type">{job.employmentType ? employmentLabel(job.employmentType) : 'Not stated'}</Term>
        <Term label="Shift">{job.shift || 'Not stated'}</Term>
        <Term label="Posted">{formatDayCapital(job.postedAt)}</Term>
        {/* Applicants meet this as the Apply panel; the company has none. */}
        {showApplications && (
          <div className="min-w-0 xs:col-span-2 sm:col-span-4">
            <Term label="Applications">
              {job.applyUrl ? (
                <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="break-all underline hover:no-underline">
                  {host ?? job.applyUrl}
                </a>
              ) : (
                'In the app'
              )}
            </Term>
          </div>
        )}
      </dl>
      <ul className="border-t border-line">
        <RecordRow to={`/companies/${job.companyId}`} label="Company" title={formatCompanyName(job.companyName)} />
        <RecordRow to={`/factories/${job.factoryId}`} label="Factory" title={formatFactoryName(job.factoryName)} />
        {/* Where the company has its own version of the career, the job leads to that. */}
        {job.hasVersion ? (
          <RecordRow
            to={versionPath(job.occupationId, { id: job.companyId })}
            label="Career"
            title={versionTitle(job.companyName, job.occupationTitle)}
            data-job-version=""
          />
        ) : (
          <RecordRow to={`/occupations/${job.occupationId}`} label="Career" title={job.occupationTitle} />
        )}
      </ul>
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
      <RecordList>
        {skills.map((skill) => {
          // The person's own list is the live answer; the job's copy is the fallback until it loads.
          const status = (mySkills ? statusBySkill.get(skill.id) : skill.held ? 'held' : undefined) ?? 'none';
          return (
            <RecordRow
              key={skill.id}
              to={`/skills/${skill.id}`}
              title={skill.name}
              control={
                marksHeld ? (
                  <SkillHeldToggle value={status} label={skill.name} onChange={(mark) => markSkill.mutate({ skillId: skill.id, name: skill.name, mark })} />
                ) : undefined
              }
              quiet={marksHeld && status === 'none'}
              data-held={marksHeld ? String(status === 'held') : undefined}
            />
          );
        })}
      </RecordList>
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
      <div className={cn(cardClass, 'flex flex-wrap items-center gap-x-4 gap-y-2')}>
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm text-text-1">
            {myApplication.status === 'withdrawn' ? 'You withdrew this application.' : `You applied ${formatDay(myApplication.createdAt)}.`}
          </p>
          <p className="mt-0.5 text-sm text-text-2">
            Follow it on{' '}
            <Link to="/me" className="font-medium text-text-1 underline hover:no-underline">
              your profile
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
      <div className={cardClass}>
        <p className="mb-3 text-sm text-text-2">
          {job.companyName} takes applications for this job on its own website{host ? ` (${host})` : ''}.
        </p>
        <Button asChild className="h-11 w-full rounded-lg sm:w-auto">
          <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
            Apply on the company website
            <ExternalLink />
          </a>
        </Button>
      </div>
    );
  }

  if (!signedIn) {
    const here = `/jobs/${job.id}`;
    return (
      <div className={cardClass}>
        <p className="mb-3 text-sm text-text-2">Apply here with your name, email and the skills on your profile.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button asChild className="h-11 w-full rounded-lg sm:w-auto">
            <Link to={signInPath(here)}>Sign in to apply</Link>
          </Button>
          <Link
            to={signInPath(here, 'create')}
            className="text-sm font-medium text-text-1 underline hover:no-underline"
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
    <form onSubmit={submit} className={cn(cardClass, 'space-y-4')}>
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
            className={cn(textButtonClass, 'ml-2 h-10')}
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
