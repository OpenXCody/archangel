import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { companiesApi, factoriesApi, occupationsApi } from '../lib/api';
import {
  EMPLOYMENT_TYPES,
  useCancelMembership,
  useCreateJob,
  useEmployer,
  useRequestMembership,
  type AccountUser,
  type EmployerCompany,
  type EmployerJob,
  type EmploymentType,
  type PayPeriod,
} from '../lib/account';
import { employmentLabel, formatAgo, formatPlace, isExpired, parseDollars } from '../lib/jobFormat';
import CareerPicker, { type CareerOption } from '../components/account/CareerPicker';
import JobSkillTags, { type JobSkillTag } from '../components/account/JobSkillTags';
import {
  AccountGate,
  CardNote,
  ENTITY,
  ErrorNote,
  Field,
  LoadError,
  RowsSkeleton,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
  useDebouncedValue,
} from '../components/account/parts';
import { PageContainer, PageHeader, PageSection } from '../components/layout/Page';

export default function Employer() {
  return <AccountGate>{(account) => <EmployerPage user={account.user} />}</AccountGate>;
}

function EmployerPage({ user }: { user: AccountUser }) {
  const employer = useEmployer();
  const companies = employer.data ?? [];
  const active = companies.filter((company) => company.status === 'active');
  const pending = companies.filter((company) => company.status === 'requested');
  const [joiningAnother, setJoiningAnother] = useState(false);

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
      />

      {employer.isPending ? (
        <RowsSkeleton rows={3} />
      ) : employer.isError ? (
        <LoadError error={employer.error} onRetry={() => void employer.refetch()} retrying={employer.isFetching} />
      ) : (
        <>
          {pending.length > 0 && <PendingRequests companies={pending} />}

          {active.map((company) => (
            <CompanyJobs key={company.companyId} company={company} showCompanyName={active.length > 1} />
          ))}

          {active.length > 0 && <PostJobSection companies={active} />}

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
                    {membership ? (
                      <span className="shrink-0 text-xs text-fg-muted">
                        {membership.status === 'active' ? 'Member' : 'Pending approval'}
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

function jobState(job: EmployerJob): 'Open' | 'Expired' | 'Closed' | 'Draft' {
  if (job.status === 'closed') return 'Closed';
  if (job.status === 'open') return isExpired(job.expiresAt) ? 'Expired' : 'Open';
  return 'Draft';
}

function CompanyJobs({ company, showCompanyName }: { company: EmployerCompany; showCompanyName: boolean }) {
  return (
    <PageSection
      title={showCompanyName ? `Jobs at ${company.companyName}` : 'Jobs'}
      description={company.jobs.length > 0 ? 'Select a job to review applicants or close it.' : undefined}
    >
      {company.jobs.length === 0 ? (
        <CardNote>No jobs posted.</CardNote>
      ) : (
        <ul className={cardClass}>
          {company.jobs.map((job) => {
            const state = jobState(job);
            return (
              <li key={job.id} className={rowClass}>
                <Link to={`/jobs/${job.id}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-bg-elevated">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-fg-default">{job.title}</p>
                    <p className="mt-0.5 break-words text-sm text-fg-muted">
                      <span className={cn(state === 'Open' && 'text-fg-default')} data-job-state={state.toLowerCase()}>
                        {state}
                      </span>
                      {' · '}Job #{job.serial} · {[job.factoryName, job.city].filter(Boolean).join(' · ')} · Posted {formatAgo(job.postedAt)}
                    </p>
                    <p className={cn('mt-1 text-sm', job.newApplicants > 0 ? 'text-fg-default' : 'text-fg-muted')}>
                      {job.applicants} {job.applicants === 1 ? 'applicant' : 'applicants'}
                      {job.newApplicants > 0 && `, ${job.newApplicants} new`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Post a job
// ---------------------------------------------------------------------------

const selectTriggerClass = 'h-[42px] rounded-lg border-border-strong bg-bg-elevated px-3 text-base text-fg-default shadow-none sm:text-sm';
const selectContentClass = 'max-w-[calc(100vw-2rem)] rounded-lg border-border-strong bg-bg-surface';

function PostJobSection({ companies }: { companies: EmployerCompany[] }) {
  const [companyId, setCompanyId] = useState(companies[0].companyId);
  const company = companies.find((c) => c.companyId === companyId) ?? companies[0];

  return (
    <PageSection title="Post a job" description="Listed at once. Open for 60 days.">
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
          <PostJobForm key={company.companyId} company={company} />
        )}
      </div>
    </PageSection>
  );
}

function PostJobForm({ company }: { company: EmployerCompany }) {
  const navigate = useNavigate();
  const createJob = useCreateJob();

  const [factoryId, setFactoryId] = useState(company.factories.length === 1 ? company.factories[0].id : '');
  const [career, setCareer] = useState<CareerOption | null>(null);
  const [skills, setSkills] = useState<JobSkillTag[]>([]);
  // The career whose skills the tags started from. Null until those have loaded.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [payMin, setPayMin] = useState('');
  const [payMax, setPayMax] = useState('');
  const [payPeriod, setPayPeriod] = useState<PayPeriod>('hour');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full-time');
  const [shift, setShift] = useState('');
  const [description, setDescription] = useState('');
  const [applyIn, setApplyIn] = useState<'app' | 'link'>('app');
  const [applyUrl, setApplyUrl] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  // Careers already recorded at the chosen factory are the likeliest picks.
  const factoryCareers = useQuery({
    queryKey: ['picker', 'factory-careers', factoryId],
    queryFn: () => factoriesApi.get(factoryId),
    enabled: Boolean(factoryId),
    staleTime: 5 * 60_000,
  });
  const suggestions: CareerOption[] = (factoryCareers.data?.occupations ?? []).map((o) => ({ id: o.id, title: o.title }));

  // The career's own skills are the default tags: stage 3 optional, the rest required.
  const careerId = career?.id ?? '';
  const careerSkills = useQuery({
    queryKey: ['picker', 'career-skills', careerId],
    queryFn: () => occupationsApi.get(careerId),
    enabled: Boolean(careerId),
    staleTime: 5 * 60_000,
  });
  const seeded = Boolean(careerId) && seededFor === careerId;
  if (careerId && careerSkills.data && !seeded) {
    // Set while rendering, so tags the client already has never flash a loader.
    const defaults = careerSkills.data.skills.map((skill) => ({ id: skill.id, name: skill.name, required: skill.stage !== 3 }));
    setSeededFor(careerId);
    // Anything added while the defaults were unavailable stays.
    setSkills([...defaults, ...skills.filter((tag) => !defaults.some((skill) => skill.id === tag.id))]);
  }

  const pickCareer = (next: CareerOption | null) => {
    setCareer(next);
    if (next?.id !== career?.id) {
      setSkills([]);
      setSeededFor(null);
    }
    // The title follows the career until the person writes their own.
    if (!titleEdited || !title.trim()) {
      setTitle(next?.title ?? '');
      setTitleEdited(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (createJob.isPending) return;
    createJob.reset();

    if (!factoryId || !career) return setProblem('Choose a factory and a career.');
    const min = parseDollars(payMin);
    const max = parseDollars(payMax);
    if (min === null || max === null || max < min) {
      return setProblem('Enter a pay range in dollars, lowest first.');
    }
    const link = applyUrl.trim();
    if (applyIn === 'link' && !/^https:\/\/\S+$/i.test(link)) {
      return setProblem('The application link must start with https://');
    }
    setProblem(null);

    createJob.mutate(
      {
        companyId: company.companyId,
        factoryId,
        occupationId: career.id,
        title: title.trim() || career.title,
        description,
        employmentType,
        shift,
        payMin: min,
        payMax: max,
        payPeriod,
        applyUrl: applyIn === 'link' ? link : null,
        // Without the career's defaults and with nothing added, the server applies the defaults.
        skills: seeded || skills.length > 0 ? skills.map((skill) => ({ skillId: skill.id, required: skill.required })) : undefined,
      },
      { onSuccess: (created) => navigate(`/jobs/${created.id}`) }
    );
  };

  const per = payPeriod === 'hour' ? 'per hour' : 'per year';

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Factory" htmlFor="job-factory">
          <Select value={factoryId} onValueChange={setFactoryId}>
            <SelectTrigger id="job-factory" className={selectTriggerClass}>
              <SelectValue placeholder="Choose a factory" />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {company.factories.map((factory) => (
                <SelectItem key={factory.id} value={factory.id} className="py-2.5">
                  {[factory.name, formatPlace(factory.city, factory.state)].filter(Boolean).join(' · ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Career" htmlFor="job-career" hint="Sets the default skills.">
          <CareerPicker
            id="job-career"
            value={career}
            onChange={pickCareer}
            suggestions={suggestions}
            suggestionsLabel="Careers at this factory"
          />
        </Field>
      </div>

      {career && (
        <fieldset className="min-w-0" data-job-skills>
          <legend className="mb-1.5 text-sm font-medium text-fg-muted">Skills</legend>
          {!seeded && careerSkills.isPending ? (
            <p className="flex min-h-[42px] items-center gap-2 text-sm text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading skills
            </p>
          ) : (
            <div className="space-y-3">
              {!seeded && careerSkills.isError && (
                <LoadError error={careerSkills.error} onRetry={() => void careerSkills.refetch()} retrying={careerSkills.isFetching} />
              )}
              <JobSkillTags
                id="job-skill-add"
                value={skills}
                onChange={setSkills}
                emptyNote={
                  !seeded
                    ? "Unless skills are added, the job uses the career's defaults."
                    : careerSkills.data?.skills.length === 0
                      ? 'No skills on record for this career.'
                      : 'No skills tagged.'
                }
              />
              {skills.length > 0 && <p className="text-xs text-fg-muted">Applicants are ranked by required skills held.</p>}
            </div>
          )}
        </fieldset>
      )}

      <Field label="Job title" htmlFor="job-title" hint="Defaults to the career name.">
        <input
          id="job-title"
          type="text"
          maxLength={120}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleEdited(true);
          }}
          className={fieldClass}
        />
      </Field>

      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-sm font-medium text-fg-muted">Pay range, in dollars</legend>
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <DollarInput id="job-pay-min" label={`Lowest ${per}`} value={payMin} onChange={setPayMin} placeholder={payPeriod === 'hour' ? '24.00' : '52,000'} />
          <DollarInput id="job-pay-max" label={`Highest ${per}`} value={payMax} onChange={setPayMax} placeholder={payPeriod === 'hour' ? '29.00' : '60,000'} />
          <div role="radiogroup" aria-label="Pay is per" className="grid h-[42px] grid-cols-2 gap-1 rounded-lg border border-border-strong bg-bg-elevated p-1 xs:col-span-2 sm:col-span-1 sm:w-48">
            {(['hour', 'year'] as const).map((period) => (
              <button
                key={period}
                type="button"
                role="radio"
                aria-checked={payPeriod === period}
                onClick={() => setPayPeriod(period)}
                className={cn(
                  'rounded-md text-sm font-medium transition-colors',
                  payPeriod === period ? 'bg-bg-surface text-fg-default' : 'text-fg-muted hover:text-fg-default'
                )}
              >
                Per {period}
              </button>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="job-type">
          <Select value={employmentType} onValueChange={(value) => setEmploymentType(value as EmploymentType)}>
            <SelectTrigger id="job-type" className={selectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {EMPLOYMENT_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="py-2.5">
                  {employmentLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Shift" htmlFor="job-shift" optional>
          <input
            id="job-shift"
            type="text"
            maxLength={40}
            placeholder="Days, 2nd shift, rotating"
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            className={fieldClass}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="job-description" optional hint="The work, the schedule, and anything an applicant should know.">
        <textarea
          id="job-description"
          rows={5}
          maxLength={8000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={cn(fieldClass, 'resize-y')}
        />
      </Field>

      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-sm font-medium text-fg-muted">Applications</legend>
        <div role="radiogroup" aria-label="Applications" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ApplyChoice
            selected={applyIn === 'app'}
            onSelect={() => setApplyIn('app')}
            title="In the app"
            detail="Applicants are listed on the job page, ranked by skills held."
          />
          <ApplyChoice
            selected={applyIn === 'link'}
            onSelect={() => setApplyIn('link')}
            title="Company site"
            detail="The job links to an external application page."
          />
        </div>
        {applyIn === 'link' && (
          <Field label="Application link" htmlFor="job-apply-url" className="mt-3">
            <input
              id="job-apply-url"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={500}
              placeholder="https://"
              value={applyUrl}
              onChange={(e) => setApplyUrl(e.target.value)}
              className={fieldClass}
            />
          </Field>
        )}
      </fieldset>

      <ErrorNote error={problem ?? createJob.error} />

      <Button type="submit" disabled={createJob.isPending} className="h-11 w-full rounded-lg sm:w-auto sm:px-8">
        {createJob.isPending && <Loader2 className="animate-spin" />}
        Post job
      </Button>
    </form>
  );
}

function DollarInput({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="min-w-0">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-muted" aria-hidden="true">
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldClass, 'pl-7')}
        />
      </div>
      <span className="mt-1 block text-xs text-fg-muted">{label}</span>
    </div>
  );
}

function ApplyChoice({ selected, onSelect, title, detail }: { selected: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-[color:var(--color-fg-muted)] bg-bg-elevated' : 'border-border-subtle hover:border-border-strong'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-[color:var(--color-fg-default)]' : 'border-[color:var(--color-fg-soft)]'
        )}
        aria-hidden="true"
      >
        {selected && <span className="h-2 w-2 rounded-full bg-[color:var(--color-fg-default)]" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg-default">{title}</span>
        <span className="mt-0.5 block text-xs text-fg-muted">{detail}</span>
      </span>
    </button>
  );
}
