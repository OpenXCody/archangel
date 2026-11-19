import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, MoreHorizontal, Search, SearchX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useEmailOn, useUpdateProfile, type AccountUser } from '../lib/account';
import { useCancelMembership, useEmployer, useRequestMembership, type EmployerCompany, type EmployerJob } from '../lib/employer';
import { useJob, type JobDetailResponse } from '../lib/jobs';
import { ApiError } from '../lib/http';
import { useDeleteJob } from '../lib/employerJobs';
import {
  COMPANY_SEARCH_LIMIT,
  useCompanyRequests,
  useCompanySearch,
  useWithdrawCompanyRequest,
  type CompanyRequest,
} from '../lib/employerCompanies';
import { formatFactoryName } from '@shared/displayName';
import { latestDraftCompany } from '../lib/jobDraft';
import { useViewer } from '../lib/viewer';
import { isExpired } from '../lib/jobFormat';
import CompanyRequestForm from '../components/account/CompanyRequestForm';
import JobForm, { type JobFormCompany } from '../components/jobs/JobForm';
import {
  selectContentClass,
  selectTriggerClass,
  AccountGate,
  CardNote,
  KIND_ICON,
  ErrorNote,
  Field,
  LoadError,
  PageLoading,
  RowsSkeleton,
  busyButtonClass,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
  textButtonClass,
} from '../components/account/parts';
import ConfirmDialog from '../components/layout/ConfirmDialog';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { DAY_MS, formatDay, formatOnDay } from '../lib/dates';
import { EmptyState, PageContainer, PageHeader, PageSection } from '../components/layout/Page';

export default function Employer() {
  return <AccountGate>{(account) => <EmployerPage user={account.user} />}</AccountGate>;
}

/**
 * "Your jobs": the list of a person's companies and their jobs. The
 * job form takes the page over when asked for in the address: `?post=1` for a
 * new job, `?copy=<job>` for another like an existing one, `?edit=<job>` to
 * change one. `&from=job` says the form was opened from the job's own page.
 */
function EmployerPage({ user }: { user: AccountUser }) {
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const copyId = params.get('copy');
  const sourceId = editId ?? copyId;
  if (sourceId) {
    return <JobFormPage key={sourceId} mode={editId ? 'edit' : 'copy'} jobId={sourceId} fromJob={params.get('from') === 'job'} />;
  }
  return <EmployerHome user={user} posting={params.has('post')} />;
}

function EmployerHome({ user, posting }: { user: AccountUser; posting: boolean }) {
  const navigate = useNavigate();
  const employer = useEmployer();
  const asked = useCompanyRequests();
  const companies = employer.data ?? [];
  const active = companies.filter((company) => company.status === 'active');
  const pending = companies.filter((company) => company.status === 'requested');
  const declined = companies.filter((company) => company.status === 'declined');
  // Companies and plants the person asked to have added.
  const requests = asked.data ?? [];
  const waiting = requests.filter((request) => request.status === 'requested');
  const refused = requests.filter((request) => request.status === 'declined');
  const [joiningAnother, setJoiningAnother] = useState(false);
  const hasJobs = active.some((company) => company.jobs.length > 0);
  const viewer = useViewer();

  // The page has one name, here as in the header, the menu and the links back to it.
  useEffect(() => {
    // After the layout has named the page, which it does on arrival.
    const timer = window.setTimeout(() => {
      document.title = 'Your jobs · Archangel';
    }, 0);
    return () => window.clearTimeout(timer);
  }, [posting]);

  if (posting && active.length > 0) {
    return (
      <PageContainer size="narrow">
        <PageHeader backTo={{ to: '/employer', label: 'Your jobs' }} title="Post a job" description="Listed at once. Open for 60 days." />
        <PostJob user={user} companies={active} onCancel={() => navigate('/employer')} />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Your jobs"
        // One company is named here; several are named where their jobs are listed.
        description={
          active.length === 1
            ? active[0].companyName
            : active.length > 1
              ? `${active.length} companies`
              : "Post jobs at a company's plants and review applicants."
        }
        actions={
          hasJobs ? (
            <Button asChild className="h-10 rounded-lg px-5">
              <Link to="/employer?post=1">Post a job</Link>
            </Button>
          ) : undefined
        }
      />

      {/* Reached by its address from an account that is for finding a career: the page works, and says how to keep it. */}
      {viewer.seeker && !viewer.viewingAs && <HiringSwitch />}

      {employer.isPending ? (
        <RowsSkeleton rows={3} />
      ) : employer.isError ? (
        <LoadError error={employer.error} onRetry={() => void employer.refetch()} retrying={employer.isFetching} />
      ) : (
        <>
          {(pending.length > 0 || waiting.length > 0) && <PendingRequests user={user} companies={pending} requests={waiting} />}
          {(declined.length > 0 || refused.length > 0) && <DeclinedRequests companies={declined} requests={refused} />}

          {/* With nothing posted yet the form is the page; after that it is one press away, above the list. */}
          {active.length > 0 && !hasJobs && (
            <PageSection title="Post a job" description="Listed at once. Open for 60 days.">
              <PostJob user={user} companies={active} />
            </PageSection>
          )}

          {hasJobs &&
            active.map((company) => <CompanyJobs key={company.companyId} company={company} showCompanyName={active.length > 1} />)}

          {active.length === 0 ? (
            <PageSection
              title="Company"
              description={
                viewer.viewingAs === 'employer'
                  ? "Join a company to see its employer's page. Admins join at once."
                  : user.isAdmin
                    ? 'Admins join at once.'
                    : 'Find your company and request access. An admin approves each request.'
              }
            >
              <CompanySearch memberships={companies} instant={user.isAdmin} />
            </PageSection>
          ) : (
            <PageSection title="Other companies">
              {joiningAnother ? (
                <CompanySearch memberships={companies} instant={user.isAdmin} />
              ) : (
                <Button type="button" variant="outline" onClick={() => setJoiningAnother(true)} className={cn('h-10 rounded-lg', outlineButtonClass)}>
                  Add a company
                </Button>
              )}
            </PageSection>
          )}

          {/* For someone here to hire, the header's jobs item is this page: the open list is one link away. */}
          {viewer.employer && (
            <p className="mt-8 text-sm text-fg-muted" data-all-jobs>
              <Link to="/jobs" className="underline underline-offset-4 hover:text-fg-default">
                All open jobs
              </Link>
            </p>
          )}
        </>
      )}
    </PageContainer>
  );
}

/**
 * One line for a person whose account is for finding a career and who has
 * opened the employer page: one press makes the account one for hiring, so
 * the header and the menu lead here. Nothing of theirs is removed, and
 * settings changes it back.
 */
function HiringSwitch() {
  const update = useUpdateProfile();
  return (
    <div className={cn(cardClass, 'mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 p-4')} data-hiring-switch>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium text-fg-default">This account is set to find a career.</p>
        <p className="mt-0.5 text-sm text-fg-muted">Set it to hire and this page leads your menu. Nothing is removed.</p>
        <ErrorNote error={update.error} className="mt-2" />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-busy={update.isPending}
        aria-disabled={update.isPending}
        onClick={() => {
          if (!update.isPending) update.mutate({ purpose: 'hire' });
        }}
        className={cn('h-9', outlineButtonClass, busyButtonClass)}
      >
        {update.isPending && <Loader2 className="animate-spin" />}
        Set to hire
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The job form as a page: edit a job, or post another like it
// ---------------------------------------------------------------------------

function JobFormPage({ mode, jobId, fromJob }: { mode: 'edit' | 'copy'; jobId: string; fromJob: boolean }) {
  const navigate = useNavigate();
  const job = useJob(jobId);
  const employer = useEmployer();
  // The form starts from the job as it was when the page opened. A refetch
  // while the person is typing must not start it again.
  const [source, setSource] = useState<JobDetailResponse | null>(null);
  useEffect(() => {
    if (job.data) setSource((current) => current ?? job.data);
  }, [job.data]);

  const back = fromJob ? { to: `/jobs/${jobId}`, label: 'Job' } : { to: '/employer', label: 'Your jobs' };

  if (job.isError || (job.data && !job.data.canManage)) {
    const gone = !job.isError || (job.error instanceof ApiError && (job.error.status === 404 || job.error.status === 400));
    return (
      <PageContainer size="narrow">
        {gone ? (
          <EmptyState
            icon={SearchX}
            title="This job is not available"
            description="It may have been deleted, or it belongs to another company."
            action={
              <Button asChild className="h-10 rounded-lg">
                <Link to="/employer">Your jobs</Link>
              </Button>
            }
          />
        ) : (
          <LoadError error={job.error} onRetry={() => void job.refetch()} retrying={job.isFetching} />
        )}
      </PageContainer>
    );
  }
  // A copy needs the company's plants; an edit keeps the job's own.
  if (!source || (mode === 'copy' && employer.isPending)) return <PageLoading label="Loading job" />;

  const { job: from } = source;
  const membership = (employer.data ?? []).find((company) => company.companyId === from.companyId && company.status === 'active');
  // An admin can manage a job without belonging to its company: the copy then stays at the same plant.
  const company: JobFormCompany = membership ?? {
    companyId: from.companyId,
    companyName: from.companyName,
    factories: [{ id: from.factoryId, companyId: from.companyId, name: from.factoryName, city: from.city, state: from.state }],
  };

  return (
    <PageContainer size="narrow">
      <PageHeader
        backTo={back}
        eyebrow={mode === 'edit' ? `Job #${from.serial}` : undefined}
        title={mode === 'edit' ? 'Edit job' : 'Post a job'}
        description={
          mode === 'edit'
            ? 'Changes show on the listing at once.'
            : `Copied from job #${from.serial}, ${from.title}. Posted as a new job, open for 60 days.`
        }
      />
      <div className={cn(cardClass, 'p-4 sm:p-6')}>
        <JobForm company={company} mode={mode} source={source} onCancel={() => navigate(back.to)} />
      </div>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Requests waiting for an admin
// ---------------------------------------------------------------------------

/** What a request to add something is about: the company, or a plant of it and where. */
function requestSubject(request: CompanyRequest): string {
  return request.companyId ? `${request.name}, plant at ${request.place}` : request.name;
}

interface PendingRequestsProps {
  user: AccountUser;
  /** Companies the person asked to join. */
  companies: EmployerCompany[];
  /** Companies and plants the person asked to have added. */
  requests: CompanyRequest[];
}

function PendingRequests({ user, companies, requests }: PendingRequestsProps) {
  const cancel = useCancelMembership();
  const withdraw = useWithdrawCompanyRequest();
  const emailOn = useEmailOn();
  // Said once, under the list: how the person will hear.
  const hears = emailOn && user.emailNotices ? `An email goes to ${user.email} when an admin answers.` : 'The answer shows here.';
  return (
    <PageSection title="Waiting for approval" description={hears}>
      <ul className={cardClass}>
        {companies.map((company) => {
          const cancelling = cancel.isPending && cancel.variables === company.companyId;
          return (
            <li key={company.companyId} className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4')} data-pending-company={company.companyId}>
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words text-sm font-medium text-fg-default">{company.companyName}</p>
                <p className="mt-0.5 text-sm text-fg-muted">Posting opens once approved.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-busy={cancelling}
                aria-disabled={cancel.isPending}
                onClick={() => {
                  if (!cancel.isPending) cancel.mutate(company.companyId);
                }}
                className={cn('h-9', outlineButtonClass, busyButtonClass)}
              >
                {cancelling && <Loader2 className="animate-spin" />}
                Cancel request
              </Button>
            </li>
          );
        })}
        {requests.map((request) => {
          const withdrawing = withdraw.isPending && withdraw.variables === request.id;
          return (
            <li key={request.id} className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4')} data-company-request-row={request.id}>
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words text-sm font-medium text-fg-default">{requestSubject(request)}</p>
                <p className="mt-0.5 text-sm text-fg-muted">
                  {request.companyId
                    ? `Asked ${formatOnDay(request.createdAt)} for this plant to be added.`
                    : `Asked ${formatOnDay(request.createdAt)} for this company to be added. Posting opens once it is.`}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-busy={withdrawing}
                aria-disabled={withdraw.isPending}
                onClick={() => {
                  if (!withdraw.isPending) withdraw.mutate(request.id);
                }}
                className={cn('h-9', outlineButtonClass, busyButtonClass)}
              >
                {withdrawing && <Loader2 className="animate-spin" />}
                Cancel request
              </Button>
            </li>
          );
        })}
      </ul>
      <ErrorNote error={cancel.error ?? withdraw.error} className="mt-2" />
    </PageSection>
  );
}

/** A declined request can be made again once its week is up. */
function canAskAgain(company: EmployerCompany): boolean {
  return !company.askAgainAt || new Date(company.askAgainAt).getTime() <= Date.now();
}

// ---------------------------------------------------------------------------
// Requests an admin declined
// ---------------------------------------------------------------------------

function DeclinedRequests({ companies, requests }: { companies: EmployerCompany[]; requests: CompanyRequest[] }) {
  const request = useRequestMembership();
  return (
    <PageSection title="Declined">
      <ul className={cardClass}>
        {companies.map((company) => {
          const again = canAskAgain(company);
          const asking = request.isPending && request.variables === company.companyId;
          return (
            <li key={company.companyId} className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4')} data-declined-company={company.companyId}>
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words text-sm font-medium text-fg-default">{company.companyName}</p>
                <p className="mt-0.5 text-sm text-fg-muted">
                  An admin declined this request{company.decidedAt && ` ${formatOnDay(company.decidedAt)}`}.
                  {!again && company.askAgainAt && ` It can be made again from ${formatDay(company.askAgainAt)}.`}
                </p>
              </div>
              {again && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-busy={asking}
                  aria-disabled={request.isPending}
                  onClick={() => {
                    if (!request.isPending) request.mutate(company.companyId);
                  }}
                  className={cn('h-9', outlineButtonClass, busyButtonClass)}
                >
                  {asking && <Loader2 className="animate-spin" />}
                  Request access again
                </Button>
              )}
            </li>
          );
        })}
        {requests.map((asked) => (
          <li key={asked.id} className={cn(rowClass, 'p-4')} data-company-request-row={asked.id}>
            <p className="break-words text-sm font-medium text-fg-default">{requestSubject(asked)}</p>
            <p className="mt-0.5 text-sm text-fg-muted">
              An admin declined the request to add this {asked.companyId ? 'plant' : 'company'}
              {asked.decidedAt && ` ${formatOnDay(asked.decidedAt)}`}.
            </p>
          </li>
        ))}
      </ul>
      <ErrorNote error={request.error} className="mt-2" />
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Join a company
// ---------------------------------------------------------------------------

function CompanySearch({ memberships, instant }: { memberships: EmployerCompany[]; instant: boolean }) {
  const [term, setTerm] = useState('');
  // The form that asks for a company that is not listed.
  const [asking, setAsking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useDebouncedValue(term.trim());
  const request = useRequestMembership();
  const results = useCompanySearch(query);
  const showResults = term.trim().length >= 2 && query.length >= 2;
  const CompanyIcon = KIND_ICON.company;
  const found = results.data;

  const askToAdd = (
    <button type="button" onClick={() => setAsking(true)} className={textButtonClass} data-ask-to-add>
      Ask for it to be added
    </button>
  );

  if (asking) {
    return (
      <CompanyRequestForm
        initialName={term.trim()}
        onCancel={() => setAsking(false)}
        onDone={() => {
          setAsking(false);
          setTerm('');
        }}
      />
    );
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
        <input
          ref={inputRef}
          type="text"
          role="searchbox"
          enterKeyHint="search"
          aria-label="Search companies"
          placeholder="Company name"
          autoComplete="off"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className={cn(fieldClass, 'h-11 pl-9 pr-10')}
        />
        {term && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setTerm('');
              inputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:text-fg-default"
          >
            {results.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </button>
        )}
      </div>

      {!showResults ? (
        <p className="mt-2 text-sm text-fg-muted">Enter at least two letters.</p>
      ) : (
        <div aria-live="polite">
          {found?.close && (
            <p className="mt-3 text-sm text-fg-muted" data-company-close>
              No company is named “{query}”. The closest:
            </p>
          )}
          <div className={cn(cardClass, 'mt-2')}>
            {results.isPending ? (
              <p className="flex items-center gap-2 p-4 text-sm text-fg-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching companies
              </p>
            ) : results.isError ? (
              <ErrorNote error={results.error} className="p-4" />
            ) : !found || found.companies.length === 0 ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4" data-company-none>
                <p className="min-w-0 flex-1 basis-48 break-words text-sm text-fg-muted">No company matches “{query}”.</p>
                {askToAdd}
              </div>
            ) : (
              <ul>
                {found.companies.map((company) => {
                  const membership = memberships.find((m) => m.companyId === company.id);
                  const busy = request.isPending && request.variables === company.id;
                  return (
                    <li key={company.id} className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4')} data-company-result={company.id}>
                      <div className="flex min-w-0 flex-1 basis-48 items-start gap-3">
                        <CompanyIcon className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" />
                        <div className="min-w-0">
                          {/* The company's page, to check it is the right one; in a new tab so the search stays. */}
                          <a
                            href={`/companies/${company.slug ?? company.id}`}
                            target="_blank"
                            rel="noopener"
                            className="break-words text-sm font-medium text-fg-default underline-offset-4 hover:underline"
                          >
                            {company.name}
                          </a>
                          <p className="mt-0.5 break-words text-xs text-fg-muted">
                            {[
                              `${company.factoryCount} ${company.factoryCount === 1 ? 'plant' : 'plants'}`,
                              company.where,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </div>
                      {membership && !(membership.status === 'declined' && canAskAgain(membership)) ? (
                        <span className="shrink-0 text-xs text-fg-muted">
                          {membership.status === 'active' ? 'Member' : membership.status === 'declined' ? 'Declined' : 'Waiting for approval'}
                        </span>
                      ) : (
                        // Marked, not disabled, while it saves; focus then returns to the search box,
                        // since the button gives way to the request's state.
                        <Button
                          type="button"
                          size="sm"
                          aria-busy={busy}
                          aria-disabled={request.isPending}
                          onClick={() => {
                            if (request.isPending) return;
                            request.mutate(company.id, { onSuccess: () => inputRef.current?.focus() });
                          }}
                          aria-label={`${instant ? 'Join' : 'Request access to'} ${company.name}`}
                          className={cn('h-9', busyButtonClass)}
                        >
                          {busy && <Loader2 className="animate-spin" />}
                          {instant ? 'Join' : 'Request access'}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {found && found.companies.length > 0 && (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-fg-muted">
              {!found.close && found.total > found.companies.length && (
                <span data-company-more>
                  {Math.min(found.companies.length, COMPANY_SEARCH_LIMIT)} of {found.total.toLocaleString('en-US')}. Type more of the name to narrow the list.
                </span>
              )}
              <span>Not listed? {askToAdd}</span>
            </p>
          )}
        </div>
      )}
      <ErrorNote error={request.error} className="mt-2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// A company's jobs
// ---------------------------------------------------------------------------

type JobState = 'Open' | 'Expired' | 'Closed' | 'Draft';

function jobState(job: EmployerJob): JobState {
  if (job.status === 'closed') return 'Closed';
  if (job.status === 'open') return isExpired(job.expiresAt) ? 'Expired' : 'Open';
  return 'Draft';
}

/** Open jobs first, then the rest; newest first within each (the server's order). */
const STATE_ORDER: Record<JobState, number> = { Open: 0, Draft: 1, Expired: 2, Closed: 3 };

/** "Open until Jan 15", or how soon it closes once that is within two weeks. */
function openUntil(expiresAt: string): string {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS);
  if (days > 14 || Number.isNaN(days)) return `Open until ${formatDay(expiresAt)}`;
  return days <= 1 ? 'Open, closes tomorrow' : `Open, closes in ${days} days`;
}

/** The plant a job is at, with its town when the plant's name does not already say it: "North Campus, Dallas". */
function plantAndTown(job: EmployerJob): string {
  const plant = formatFactoryName(job.factoryName);
  const town = job.city ? formatFactoryName(job.city) : null;
  return town && !plant.toLowerCase().includes(town.toLowerCase()) ? `${plant}, ${town}` : plant;
}

const menuItemClass = 'cursor-pointer px-2.5 py-2.5 text-sm text-fg-default focus:bg-bg-elevated';

function CompanyJobs({ company, showCompanyName }: { company: EmployerCompany; showCompanyName: boolean }) {
  const navigate = useNavigate();
  const remove = useDeleteJob();
  const [deleting, setDeleting] = useState<EmployerJob | null>(null);
  const jobs = company.jobs
    .map((job) => ({ job, state: jobState(job) }))
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);

  if (jobs.length === 0) {
    return (
      <PageSection title={company.companyName}>
        <CardNote>None yet.</CardNote>
      </PageSection>
    );
  }

  return (
    // One company is named in the page's heading; several each head their own list.
    <PageSection title={showCompanyName ? company.companyName : undefined}>
      <ul className={cardClass}>
        {jobs.map(({ job, state }) => (
          <li key={job.id} className={cn(rowClass, 'flex items-stretch')} data-job-row={job.id}>
            <Link
              to={`/jobs/${job.id}`}
              className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-1 py-3 pl-4 pr-2 transition-colors hover:bg-bg-elevated sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className={cn('break-words text-sm font-medium', state === 'Open' ? 'text-fg-default' : 'text-fg-muted')}>{job.title}</p>
                <p className="mt-0.5 break-words text-sm text-fg-muted">
                  <span className={cn(state === 'Open' && 'text-fg-default')} data-job-state={state.toLowerCase()}>
                    {state === 'Open' ? openUntil(job.expiresAt) : state}
                  </span>
                  {' · '}
                  {plantAndTown(job)}
                </p>
              </div>
              <p className={cn('text-sm sm:text-right', job.newApplicants > 0 ? 'text-fg-default' : 'text-fg-muted')}>
                {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
                {job.newApplicants > 0 && `, ${job.newApplicants} new`}
              </p>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Actions for job #${job.serial}, ${job.title}`}
                className="flex w-11 shrink-0 items-center justify-center text-fg-muted transition-colors hover:bg-bg-elevated hover:text-fg-default"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl border-border-strong bg-bg-surface p-1.5">
                <DropdownMenuItem className={menuItemClass} onSelect={() => navigate(`/employer?edit=${job.id}`)}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem className={menuItemClass} onSelect={() => navigate(`/employer?copy=${job.id}`)}>
                  Post another like this
                </DropdownMenuItem>
                {/* A job with applicants can only be closed, which is done on its page. */}
                {job.applicants === 0 && (
                  <DropdownMenuItem
                    className={menuItemClass}
                    onSelect={() => {
                      remove.reset();
                      setDeleting(job);
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this job?"
        description={
          deleting && (
            <p>
              Job #{deleting.serial}, {deleting.title}, is removed for good. Nobody has applied to it.
            </p>
          )
        }
        confirmLabel="Delete job"
        busy={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
        onCancel={() => setDeleting(null)}
      />
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Post a job
// ---------------------------------------------------------------------------

function PostJob({ user, companies, onCancel }: { user: AccountUser; companies: EmployerCompany[]; onCancel?: () => void }) {
  // Opens on the company whose job was being written last, if one was.
  const [companyId, setCompanyId] = useState(
    () => latestDraftCompany(user.id, companies.map((c) => c.companyId)) ?? companies[0].companyId
  );
  const company = companies.find((c) => c.companyId === companyId) ?? companies[0];
  // The form that asks for a plant that is not in the list.
  const [askingFor, setAskingFor] = useState<string | null>(null);
  const asking = askingFor === company.companyId;

  return (
    <>
      <div className={cn(cardClass, 'p-4 sm:p-6')}>
        {companies.length > 1 && (
          <Field label="Company" htmlFor="job-company" className="mb-4">
            <Select value={company.companyId} onValueChange={setCompanyId}>
              <SelectTrigger id="job-company" className={selectTriggerClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                {companies.map((c) => (
                  <SelectItem key={c.companyId} value={c.companyId} className="py-2.5">
                    {c.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {company.factories.length === 0 ? (
          <p className="text-sm text-fg-muted" data-no-factory>
            {company.companyName} has no plant on record. A job is posted at a plant, so one has to be added first.
          </p>
        ) : (
          // A form per company: its plants differ. What was typed for each is kept.
          <JobForm key={company.companyId} company={company} mode="post" onCancel={onCancel} />
        )}
      </div>
      {asking ? (
        <div className="mt-4">
          <CompanyRequestForm
            company={{ id: company.companyId, name: company.companyName }}
            onCancel={() => setAskingFor(null)}
            onDone={() => setAskingFor(null)}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-fg-muted">
          {company.factories.length === 0 ? '' : 'Plant not in the list? '}
          <button type="button" onClick={() => setAskingFor(company.companyId)} className={textButtonClass} data-ask-for-plant>
            Ask for {company.factories.length === 0 ? 'a plant' : 'it'} to be added
          </button>
        </p>
      )}
    </>
  );
}
