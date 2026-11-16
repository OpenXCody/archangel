import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness, Clock, Loader2, MapPin, Search, SearchX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { STATE_CODE_TO_NAME, type StateCode } from '@shared/states';
import CompanyLogo from '../components/CompanyLogo';
import { occupationsApi } from '../lib/api';
import { useJobs, type JobSummary } from '../lib/account';
import { employmentLabel, formatAgo, formatPay, formatPlace } from '../lib/jobFormat';
import { ENTITY, LoadError, cardClass, fieldClass, outlineButtonClass, useDebouncedValue } from '../components/account/parts';
import { EmptyState, PageContainer, PageHeader } from '../components/layout/Page';

const ALL_CAREERS = 'all';
const ANYWHERE = 'anywhere';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Open jobs, newest first. The search text and the filters live in the URL
 * (`?q=`, `?state=`, `?career=`), so a filtered list can be linked to and Back
 * returns to it. The places and careers on offer come from the jobs that are
 * open: nothing here names a place of its own.
 */
export default function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q')?.trim() ?? '';
  const careerParam = searchParams.get('career') ?? '';
  const career = UUID_RE.test(careerParam) ? careerParam : '';
  const stateParam = (searchParams.get('state') ?? '').toUpperCase();
  const state = /^[A-Z]{2}$/.test(stateParam) ? stateParam : '';

  const [term, setTerm] = useState(q);
  const debouncedTerm = useDebouncedValue(term.trim(), 300);

  // Typing updates the URL a beat later; the URL is what the list reads.
  const writtenQ = useRef(q);
  useEffect(() => {
    if (debouncedTerm === q) return;
    writtenQ.current = debouncedTerm;
    const params = new URLSearchParams(searchParams);
    if (debouncedTerm) params.set('q', debouncedTerm);
    else params.delete('q');
    setSearchParams(params, { replace: true });
    // Only a change in what was typed should write the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTerm]);

  // The URL changed without our typing (Back, or the Jobs link in the header): show what it says.
  useEffect(() => {
    if (q === writtenQ.current) return;
    writtenQ.current = q;
    setTerm(q);
  }, [q]);

  const setFilter = (name: 'career' | 'state', value: string, none: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== none) params.set(name, value);
    else params.delete(name);
    setSearchParams(params, { replace: true });
  };

  const clearFilters = () => {
    setTerm('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const jobs = useJobs({ q: q || undefined, state: state || undefined, occupationId: career || undefined });
  // Every open job, unfiltered: the careers on offer come from this.
  const allJobs = useJobs({});

  const careerOptions = useMemo(() => {
    const byId = new Map<string, { id: string; title: string; count: number }>();
    for (const job of allJobs.data ?? []) {
      const entry = byId.get(job.occupationId);
      if (entry) entry.count += 1;
      else byId.set(job.occupationId, { id: job.occupationId, title: job.occupationTitle, count: 1 });
    }
    return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [allJobs.data]);

  // Where the open jobs are, by state.
  const stateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of allJobs.data ?? []) {
      if (job.state) counts.set(job.state, (counts.get(job.state) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count, name: STATE_CODE_TO_NAME[code as StateCode] ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allJobs.data]);
  const stateListed = stateOptions.some((option) => option.code === state);

  // A career linked to from elsewhere may have no open jobs; still name it in the filter.
  const careerListed = careerOptions.some((option) => option.id === career);
  const linkedCareer = useQuery({
    queryKey: ['picker', 'occupation', career],
    queryFn: () => occupationsApi.get(career),
    enabled: Boolean(career) && allJobs.isSuccess && !careerListed,
    staleTime: 5 * 60_000,
  });

  const filtered = Boolean(q || career || state);
  const count = jobs.data?.length ?? 0;

  return (
    <PageContainer>
      <PageHeader
        icon={BriefcaseBusiness}
        title="Jobs"
        description="Open positions. Each is tied to a career and its skills."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_260px]">
        <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            role="searchbox"
            enterKeyHint="search"
            aria-label="Search jobs by title"
            placeholder="Search job titles"
            autoComplete="off"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className={cn(fieldClass, 'h-11 bg-bg-surface pl-9 pr-10')}
          />
          {term && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setTerm('')}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:text-fg-default"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={state || ANYWHERE} onValueChange={(value) => setFilter('state', value, ANYWHERE)}>
          <SelectTrigger
            aria-label="Filter by location"
            className="h-11 min-w-0 rounded-lg border-border-strong bg-bg-surface px-3 text-base text-fg-default shadow-none sm:text-sm"
          >
            <SelectValue placeholder="Anywhere" />
          </SelectTrigger>
          <SelectContent className="max-w-[calc(100vw-2rem)] rounded-lg border-border-strong bg-bg-surface">
            <SelectItem value={ANYWHERE} className="py-2.5">Anywhere</SelectItem>
            {state && !stateListed && (
              <SelectItem value={state} className="py-2.5">
                {STATE_CODE_TO_NAME[state as StateCode] ?? state}
              </SelectItem>
            )}
            {stateOptions.map((option) => (
              <SelectItem key={option.code} value={option.code} className="py-2.5">
                {option.name} ({option.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={career || ALL_CAREERS} onValueChange={(value) => setFilter('career', value, ALL_CAREERS)}>
          <SelectTrigger
            aria-label="Filter by career"
            className="h-11 min-w-0 rounded-lg border-border-strong bg-bg-surface px-3 text-base text-fg-default shadow-none sm:text-sm"
          >
            <SelectValue placeholder="All careers" />
          </SelectTrigger>
          <SelectContent className="max-w-[calc(100vw-2rem)] rounded-lg border-border-strong bg-bg-surface">
            <SelectItem value={ALL_CAREERS} className="py-2.5">All careers</SelectItem>
            {career && !careerListed && (
              <SelectItem value={career} className="py-2.5">
                {linkedCareer.data?.title ?? 'Selected career'}
              </SelectItem>
            )}
            {careerOptions.map((option) => (
              <SelectItem key={option.id} value={option.id} className="py-2.5">
                {option.title} ({option.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {jobs.isPending ? (
        <JobCardsSkeleton />
      ) : jobs.isError ? (
        <LoadError error={jobs.error} onRetry={() => void jobs.refetch()} retrying={jobs.isFetching} />
      ) : count === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No jobs match"
            description="No open job fits these filters."
            action={
              <Button type="button" variant="outline" onClick={clearFilters} className={cn('h-10', outlineButtonClass)}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={BriefcaseBusiness}
            title="No open jobs"
            description="Jobs posted by employers appear here."
            action={
              <div className="flex flex-col items-center gap-4">
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild className="h-10 rounded-lg">
                    <Link to="/explore?tab=occupations">Browse careers</Link>
                  </Button>
                  <Button asChild variant="outline" className={cn('h-10 rounded-lg', outlineButtonClass)}>
                    <Link to="/map">Open the map</Link>
                  </Button>
                </div>
                <Link to="/employer" className="text-sm text-fg-muted underline underline-offset-4 hover:text-fg-default">
                  Post a job
                </Link>
              </div>
            }
          />
        )
      ) : (
        <>
          <p className="mb-3 flex items-center gap-2 text-sm text-fg-muted" role="status">
            {count} {filtered ? (count === 1 ? 'job matches' : 'jobs match') : count === 1 ? 'open job' : 'open jobs'}
            {jobs.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Updating" />}
            {filtered && (
              <button type="button" onClick={clearFilters} className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
                Clear filters
              </button>
            )}
          </p>
          <ul className={cn('grid grid-cols-1 gap-3 lg:grid-cols-2', jobs.isPlaceholderData && 'opacity-60')}>
            {jobs.data.map((job) => (
              <li key={job.id} className="min-w-0">
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        </>
      )}
    </PageContainer>
  );
}

function JobCard({ job }: { job: JobSummary }) {
  // Not every factory has a city on record; its name places it well enough.
  const place = job.city ? formatPlace(job.city, job.state) : [job.factoryName, job.state].filter(Boolean).join(', ');
  return (
    <Link
      to={`/jobs/${job.id}`}
      className={cn(cardClass, 'flex h-full flex-col p-4 transition-colors hover:border-border-strong hover:bg-bg-elevated')}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 break-words text-base font-medium text-fg-default">{job.title}</h2>
        <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-fg-muted">Posted {formatAgo(job.postedAt)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <CompanyLogo name={job.companyName} domain={job.companyDomain} size={20} className="rounded" />
          <span className="min-w-0 truncate">{job.companyName}</span>
        </span>
        {place && (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{place}</span>
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-semibold text-fg-default">{formatPay(job.payMin, job.payMax, job.payPeriod)}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Chip>{employmentLabel(job.employmentType)}</Chip>
        {job.shift && (
          <Chip>
            <Clock className="h-3 w-3" />
            <span className="sr-only">Shift: </span>
            {job.shift}
          </Chip>
        )}
        {job.occupationTitle !== job.title && <Chip className={cn('border-transparent', ENTITY.career.badge)}>{job.occupationTitle}</Chip>}
      </div>
    </Link>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-border-strong px-2.5 py-0.5 text-xs text-fg-muted',
        className
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-1 truncate">{children}</span>
    </span>
  );
}

function JobCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-busy="true" aria-label="Loading jobs">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={cn(cardClass, 'space-y-3 p-4')}>
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-1/3" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
