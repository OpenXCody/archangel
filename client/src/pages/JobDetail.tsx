import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Lock, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { signInPath, useAccount } from '../lib/account';
import { useApply, useJobPage, useUpdateJob, type JobDetail as JobDetailData, type JobDetailResponse } from '../lib/jobs';
import type { CareerJob } from '../lib/api';
import { ApiError } from '../lib/http';
import { accountKeys } from '../lib/queryKeys';
import { useApplicantList, useDeleteJob, useExtendJob } from '../lib/employerJobs';
import { useViewer } from '../lib/viewer';
import type { JobListSays } from '../lib/jobRow';
import { jobPageTitle, jobTabTitle } from '../lib/jobTitle';
import { formatCompanyName } from '@shared/displayName';
import { readJobNumber } from '@shared/jobs';
import { isUuid } from '../lib/validation';
import {
  ApplicationStatusBadge,
  CardNote,
  ErrorNote,
  Field,
  LoadError,
  PageLoading,
  RowsSkeleton,
  cardClass,
  fieldClass,
  outlineButtonClass,
  busyButtonClass,
} from '../components/account/parts';
import { DAY_MS, formatDay } from '../lib/dates';
import ApplicantList from '../components/jobs/ApplicantList';
import JobDescription from '../components/jobs/JobDescription';
import JobFacts from '../components/jobs/JobFacts';
import JobSkills, { jobSectionClass } from '../components/jobs/JobSkills';
import { SourcedApply, SourcedView } from '../components/jobs/SourcedJob';
import ConfirmDialog from '../components/layout/ConfirmDialog';
import { JobRecordRow } from '../components/jobs/JobRow';
import { DetailHeader, DetailSection, EmptyState, PageContainer, RecordList, detailActionClass, sectionLinkClass } from '../components/layout/Page';
import { CareerTag, CompanyTag, FactoryTag, RecordTags } from '../components/layout/RecordTag';
import { versionPath, versionTitle } from '@shared/versions';

/*
 * A job's page, top to bottom:
 *
 * 1. the title, and under it the company, the factory and the career as tags.
 *    A job from a careers site is an opening for a career as one company does
 *    it, and its title says whose: the company's variant of the career, as a
 *    company's version of a career is titled ("SpaceX Welder", `versionTitle`
 *    in shared/versions.ts; the job's stored title stays the career's). The
 *    opening's own name stands directly under it, in secondary ink ("Pipe
 *    Welder (Starship)": `ownName`, what the employer called the posting), and
 *    the third tag is the standard career ("Standard Welder"). A job posted
 *    here keeps the title its poster wrote, and its career as the tag;
 * 2. the facts the job states (pay where it is stated, level, type, shift, the
 *    day, what it asks for);
 * 3. the one action: Apply. On a job from the company's careers site it opens
 *    the company's page; on a job posted here it is the form;
 * 4. the skills. A job from a careers site: the skills its posting names, as
 *    rows, then one closed line for the rest of its career's range ("Welder
 *    career · 19 more"), which opens to that range by skill group. A job
 *    posted here: the skills the company chose, by group. One line above them
 *    for a seeker ("You hold 2 of 5": the job's own skills); a visitor reads
 *    the skills with nothing above them, and nothing there asks them to sign in;
 * 5. the equipment the posting names, each make beside its skill;
 * 6. other open jobs for this career at this company, each by its own name,
 *    and at this factory.
 *
 * The people who manage the job see the company's view first (its state, what
 * can be done with it, the applicants) and the listing under it.
 *
 * The address is /jobs/<company>/<career>/<number> (`jobPath` in
 * shared/jobs.ts) and only the number is read. An older /jobs/<id>, or an
 * address whose words are no longer the company's or the career's, opens the
 * same job and is replaced by the right one.
 */

export default function JobDetail() {
  const params = useParams<{ id?: string; serial?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const account = useAccount();
  // The address ends in the job's number; an older one is the job's id.
  const serial = readJobNumber(params.serial);
  const ref = serial !== null ? { serial } : params.serial === undefined && params.id && isUuid(params.id) ? { id: params.id } : null;
  const job = useJobPage(ref);
  const signedIn = Boolean(account.data?.user);
  const viewer = useViewer();
  // A person who manages the job sees it as its company does, until they
  // choose to apply to it themselves.
  const [applyAsManager, setApplyAsManager] = useState(false);

  // The tab is the page's title, then the opening's own name where it has one: "SpaceX Welder · Pipe Welder (Starship)".
  // A job posted here is named as running text names it: "Line Lead at Acme". The page names itself (Layout leaves a
  // job's tab alone), so the title holds when an older address is replaced by the job's own.
  const tab = job.data ? jobTabTitle(job.data.job) : null;
  useEffect(() => {
    document.title = tab ? `${tab} · Archangel` : 'Jobs · Archangel';
  }, [tab, location.pathname]);

  // The address the job has today, in place of an older or a mistaken one. The
  // answer is kept under the number as well, so the page does not ask twice.
  const loadedJob = job.data;
  const href = loadedJob?.job.href;
  useEffect(() => {
    if (!loadedJob || !href || location.pathname === href) return;
    queryClient.setQueryData(accountKeys.job(`number:${loadedJob.job.serial}`), loadedJob);
    navigate(`${href}${location.search}${location.hash}`, { replace: true, state: location.state });
  }, [loadedJob, href, location.pathname, location.search, location.hash, location.state, navigate, queryClient]);

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

  if (ref && job.isPending) return <PageLoading label="Loading job" />;

  const gone = !ref || (job.error instanceof ApiError && (job.error.status === 404 || job.error.status === 400));
  // Only a job that never loaded is "not available". One that was on screen
  // and has since closed stays on screen and says so.
  if (!job.data) {
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
  const here = data.job.href ?? location.pathname;
  const sourced = Boolean(data.job.fromSource);
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
  const company = { id: data.job.companyId, slug: data.job.companySlug, name: data.job.companyName, domain: data.job.companyDomain };
  const career = { id: data.job.occupationId, title: data.job.occupationTitle };

  const facts = (
    <JobFacts
      job={data.job}
      // Applicants meet this as the Apply panel; the company has none.
      applications={manages && !sourced ? <ApplicationsGoTo job={data.job} /> : undefined}
      notice={!data.job.isOpen && !manages ? <ClosedNotice job={data.job} justClosed={justClosed} /> : undefined}
      // A job from the company's careers site has one way out, and every reader has it as a button:
      // Apply for a seeker and a visitor; for everyone else (someone here to hire, the company's own
      // people, an admin) the posting itself, with one line for the people who manage the company's jobs.
      action={
        sourced ? (
          !manages && (!signedIn || viewer.seeker) ? (
            <SourcedApply job={data.job} />
          ) : (
            <SourcedView job={data.job} managed={manages} />
          )
        ) : undefined
      }
    />
  );
  const apply = (
    <DetailSection id="apply" title="Apply" className={jobSectionClass}>
      <ApplyPanel data={data} signedIn={signedIn} here={here} />
    </DetailSection>
  );
  // The company's view of a job it posted here comes first; the listing is then a section of its own.
  const managesPosted = manages && !sourced;

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
        kind={managesPosted ? `Job #${data.job.serial}` : 'Job'}
        title={jobPageTitle(data.job)}
        // What the employer called this opening, as plain text under the name the page gives it: not a tag, not a label.
        qualifier={
          data.job.ownName ? (
            <p className="mt-2 max-w-prose break-words text-[15px] leading-snug text-text-2" data-job-own-name>
              {data.job.ownName}
            </p>
          ) : undefined
        }
      >
        {/* Whose job it is, where, and for which career: each opens its own page. */}
        <RecordTags data-job-tags="">
          <CompanyTag company={company} />
          {/* The company is named by the tag before it: the factory's tag does not say it again. */}
          <FactoryTag factory={{ id: data.job.factoryId, name: data.job.factoryName, city: data.job.city, state: data.job.state }} beside={company.name} />
          {data.job.hasVersion ? (
            // Where the company has its own version of the career, the job leads to that.
            <CareerTag career={{ id: career.id, title: versionTitle(company.name, career.title) }} to={versionPath(career.id, company)} data-job-version="" />
          ) : sourced ? (
            // The title is the company's variant of the career: the tag is the standard it varies, as on a version's page.
            <CareerTag career={{ id: career.id, title: career.title }} data-job-standard="" />
          ) : (
            <CareerTag career={career} />
          )}
        </RecordTags>
        {!managesPosted && <div className="mt-5">{facts}</div>}
      </DetailHeader>

      {lostAccess && !manages && (
        <p role="status" className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line px-4 py-3 text-sm text-text-1" data-lost-access>
          {signedIn ? (
            `You no longer manage jobs for ${data.job.companyName.replace(/\.$/, '')}.`
          ) : (
            <>
              <span className="min-w-0 flex-1 basis-48">You are signed out. Sign in to manage this job.</span>
              <Link to={signInPath(here)} className={detailActionClass}>
                Sign in
              </Link>
            </>
          )}
        </p>
      )}

      {managesPosted && (
        // The company's view comes first: the job's state, then who applied.
        <>
          <ManageSection job={data.job} />
          <DetailSection title="Listing" description="The job as applicants see it." className="mt-10 border-t border-line pt-8">
            {facts}
          </DetailSection>
        </>
      )}

      {!sourced && data.job.description && (
        <DetailSection title="About the job" className={jobSectionClass}>
          <div className={cn(cardClass, 'text-sm leading-relaxed text-text-1')}>
            <JobDescription text={data.job.description} />
          </div>
        </DetailSection>
      )}

      {/* The one action of a job posted here: the form, or what became of the person's application. */}
      {!sourced && !manages && applying && apply}

      <JobSkills job={data.job} path={data.path} forApplicant={!manages} />

      {managesPosted &&
        (applying ? (
          apply
        ) : (
          data.job.isOpen &&
          // Offered to someone whose account is for finding work and who also manages this job.
          viewer.seeker &&
          !data.job.applyUrl && (
            <button type="button" onClick={() => setApplyAsManager(true)} className={cn(detailActionClass, 'mt-8')}>
              Apply to this job myself
            </button>
          )
        ))}

      {/* Other open jobs: this career at this company, then the rest at this factory. */}
      <OtherJobs
        id="more-for-career"
        title={`More ${career.title} jobs at ${formatCompanyName(company.name).replace(/\.$/, '')}`}
        list={data.others?.career}
        all={`/jobs?company=${company.id}&career=${career.id}`}
        // The heading names the career and the company: a row leads with the opening's own name, then where it is and its day.
        said={{ career: true, company: true }}
      />
      <OtherJobs
        id="more-at-factory"
        title="Other jobs at this factory"
        list={data.others?.factory}
        all={`/jobs?plant=${data.job.factoryId}`}
        // The factory and its company stand in the tags above: a row is the job's name, and the opening's own under it.
        said={{ factory: true }}
      />
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Parts of the listing
// ---------------------------------------------------------------------------

function ClosedNotice({ job, justClosed = false }: { job: JobDetailData; justClosed?: boolean }) {
  const closed = job.status === 'closed';
  return (
    <div className="flex items-start gap-3" role="status" data-job-closed>
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

/** Where a job's applications go, said to the people who manage it. */
function ApplicationsGoTo({ job }: { job: JobDetailData }) {
  if (!job.applyUrl) return <>In the app</>;
  return (
    <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="break-all underline hover:no-underline">
      {hostOf(job.applyUrl) ?? job.applyUrl}
    </a>
  );
}

/** A few other open jobs under one heading, with the way to all of them. Nothing when there are none. */
function OtherJobs({
  id,
  title,
  list,
  all,
  said,
}: {
  id: string;
  title: string;
  list: { jobs: CareerJob[]; total: number } | undefined;
  all: string;
  /** What the heading and the page have already said of every job in the list: a row does not say it again. */
  said: JobListSays;
}) {
  if (!list || list.jobs.length === 0) return null;
  return (
    <DetailSection
      id={id}
      title={title}
      className={jobSectionClass}
      action={
        list.total > list.jobs.length ? (
          <Link to={all} className={sectionLinkClass} data-all-jobs>
            All {list.total.toLocaleString('en-US')}
          </Link>
        ) : undefined
      }
    >
      <RecordList>
        {list.jobs.map((job) => (
          <JobRecordRow key={job.id} job={job} said={{ ...said, among: list.jobs }} />
        ))}
      </RecordList>
    </DetailSection>
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

function ApplyPanel({ data, signedIn, here }: { data: JobDetailResponse; signedIn: boolean; here: string }) {
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
