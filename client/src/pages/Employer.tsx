import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MoreHorizontal, Search, SearchX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { companiesApi } from '../lib/api';
import {
  ApiError,
  useCancelMembership,
  useEmployer,
  useJob,
  useRequestMembership,
  type AccountUser,
  type EmployerCompany,
  type EmployerJob,
  type JobDetailResponse,
} from '../lib/account';
import { useDeleteJob } from '../lib/employerJobs';
import { formatAgo, isExpired } from '../lib/jobFormat';
import JobForm, { selectContentClass, selectTriggerClass, type JobFormCompany } from '../components/account/JobForm';
import ConfirmDialog from '../components/admin/ConfirmDialog';
import {
  AccountGate,
  CardNote,
  ENTITY,
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
  useDebouncedValue,
} from '../components/account/parts';
import { EmptyState, PageContainer, PageHeader, PageSection } from '../components/layout/Page';

export default function Employer() {
  return <AccountGate>{(account) => <EmployerPage user={account.user} />}</AccountGate>;
}

/**
 * The employer page is the list of a person's companies and their jobs. The
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
  const companies = employer.data ?? [];
  const active = companies.filter((company) => company.status === 'active');
  const pending = companies.filter((company) => company.status === 'requested');
  const declined = companies.filter((company) => company.status === 'declined');
  const [joiningAnother, setJoiningAnother] = useState(false);
  const hasJobs = active.some((company) => company.jobs.length > 0);

  if (posting && active.length > 0) {
    return (
      <PageContainer size="narrow">
        <PageHeader backTo={{ to: '/employer', label: 'Your jobs' }} title="Post a job" description="Listed at once. Open for 60 days." />
        <PostJob companies={active} onCancel={() => navigate('/employer')} />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="narrow">
      <PageHeader
        eyebrow={active.length > 0 ? 'Employer' : undefined}
        title={active.length > 0 ? active.map((company) => company.companyName).join(', ') : 'Employer'}
        description={
          active.length > 0
            ? 'Post jobs and review applicants.'
            : "Post jobs at a company's factories and review applicants."
        }
        actions={
          hasJobs ? (
            <Button asChild className="h-10 rounded-lg px-5">
              <Link to="/employer?post=1">Post a job</Link>
            </Button>
          ) : undefined
        }
      />

      {employer.isPending ? (
        <RowsSkeleton rows={3} />
      ) : employer.isError ? (
        <LoadError error={employer.error} onRetry={() => void employer.refetch()} retrying={employer.isFetching} />
      ) : (
        <>
          {pending.length > 0 && <PendingRequests companies={pending} />}
          {declined.length > 0 && <DeclinedRequests companies={declined} />}

          {/* With nothing posted yet the form is the page; after that it is one press away, above the list. */}
          {active.length > 0 && !hasJobs && (
            <PageSection title="Post a job" description="Listed at once. Open for 60 days.">
              <PostJob companies={active} />
            </PageSection>
          )}

          {hasJobs &&
            active.map((company) => <CompanyJobs key={company.companyId} company={company} showCompanyName={active.length > 1} />)}

          {active.length === 0 ? (
            <PageSection
              title="Company"
              description={user.isAdmin ? 'Admins join at once.' : 'Request access. An admin approves each request.'}
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
        </>
      )}
    </PageContainer>
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
  // A copy needs the company's factories; an edit keeps the job's own.
  if (!source || (mode === 'copy' && employer.isPending)) return <PageLoading label="Loading job" />;

  const { job: from } = source;
  const membership = (employer.data ?? []).find((company) => company.companyId === from.companyId && company.status === 'active');
  // An admin can manage a job without belonging to its company: the copy then stays at the same factory.
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

function PendingRequests({ companies }: { companies: EmployerCompany[] }) {
  const cancel = useCancelMembership();
  return (
    <PageSection title="Pending approval">
      <ul className={cardClass}>
        {companies.map((company) => {
          const cancelling = cancel.isPending && cancel.variables === company.companyId;
          return (
            <li key={company.companyId} className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4')} data-pending-company={company.companyId}>
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words text-sm font-medium text-fg-default">{company.companyName}</p>
                <p className="mt-0.5 text-sm text-fg-muted">Awaiting admin approval. Posting opens once approved.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={cancelling}
                onClick={() => cancel.mutate(company.companyId)}
                className={cn('h-9', outlineButtonClass)}
              >
                {cancelling && <Loader2 className="animate-spin" />}
                Cancel request
              </Button>
            </li>
          );
        })}
      </ul>
      <ErrorNote error={cancel.error} className="mt-2" />
    </PageSection>
  );
}

/** "Nov 3", with the year once it is not this one. */
function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

/** A declined request can be made again once its week is up. */
function canAskAgain(company: EmployerCompany): boolean {
  return !company.askAgainAt || new Date(company.askAgainAt).getTime() <= Date.now();
}

// ---------------------------------------------------------------------------
// Requests an admin declined
// ---------------------------------------------------------------------------

function DeclinedRequests({ companies }: { companies: EmployerCompany[] }) {
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
                  An admin declined this request{company.decidedAt && ` on ${formatDay(company.decidedAt)}`}.
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
  const query = useDebouncedValue(term.trim());
  const request = useRequestMembership();
  const results = useQuery({
    queryKey: ['picker', 'companies', query],
    queryFn: () => companiesApi.list({ search: query, limit: 8 }),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
  const showResults = term.trim().length >= 2 && query.length >= 2;
  const CompanyIcon = ENTITY.company.icon;

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
        <input
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
            onClick={() => setTerm('')}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:text-fg-default"
          >
            {results.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          </button>
        )}
      </div>

      {!showResults ? (
        <p className="mt-2 text-sm text-fg-muted">Enter at least two letters.</p>
      ) : (
        <div className={cn(cardClass, 'mt-2')} aria-live="polite">
          {results.isPending ? (
            <p className="flex items-center gap-2 p-4 text-sm text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching companies
            </p>
          ) : results.isError ? (
            <ErrorNote error={results.error} className="p-4" />
          ) : results.data.data.length === 0 ? (
            <p className="p-4 text-sm text-fg-muted">No company matches “{query}”.</p>
          ) : (
            <ul>
              {results.data.data.map((company) => {
                const membership = memberships.find((m) => m.companyId === company.id);
                const busy = request.isPending && request.variables === company.id;
                const factoryCount = company.factoryCount ?? 0;
                return (
                  <li key={company.id} className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4')}>
                    <div className="flex min-w-0 flex-1 basis-48 items-start gap-3">
                      <CompanyIcon className={cn('mt-0.5 h-4 w-4 shrink-0', ENTITY.company.text)} />
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-fg-default">{company.name}</p>
                        <p className="mt-0.5 text-xs text-fg-muted">
                          {[company.industry, `${factoryCount} ${factoryCount === 1 ? 'factory' : 'factories'}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>
                    {membership && !(membership.status === 'declined' && canAskAgain(membership)) ? (
                      <span className="shrink-0 text-xs text-fg-muted">
                        {membership.status === 'active' ? 'Member' : membership.status === 'declined' ? 'Declined' : 'Pending approval'}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={request.isPending}
                        onClick={() => request.mutate(company.id)}
                        aria-label={`${instant ? 'Join' : 'Request access to'} ${company.name}`}
                        className="h-9"
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
      <PageSection title={`Jobs at ${company.companyName}`}>
        <CardNote>No jobs posted.</CardNote>
      </PageSection>
    );
  }

  return (
    <PageSection title={showCompanyName ? `Jobs at ${company.companyName}` : 'Jobs'}>
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
                    {state}
                  </span>
                  {' · '}Job #{job.serial} · {[job.factoryName, job.city].filter(Boolean).join(' · ')} · Posted {formatAgo(job.postedAt)}
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

function PostJob({ companies, onCancel }: { companies: EmployerCompany[]; onCancel?: () => void }) {
  const [companyId, setCompanyId] = useState(companies[0].companyId);
  const company = companies.find((c) => c.companyId === companyId) ?? companies[0];

  return (
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
        <p className="text-sm text-fg-muted">
          {company.companyName} has no factory on record, so a job cannot be posted for it yet.
        </p>
      ) : (
        // A fresh form per company: its factories differ.
        <JobForm key={company.companyId} company={company} mode="post" onCancel={onCancel} />
      )}
    </div>
  );
}
