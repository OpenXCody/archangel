import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness, Clock, Loader2, MapPin, Search, SearchX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import CompanyLogo from '../components/CompanyLogo';
import JobPlaceFilter, { DEFAULT_WITHIN, WITHIN_CHOICES, jobPlaceLabel, type JobPlace } from '../components/account/JobPlaceFilter';
import { occupationsApi } from '../lib/api';
import { useAccount, useJobs, type JobSummary } from '../lib/account';
import { employmentLabel, formatAgo, formatPay, formatPlace } from '../lib/jobFormat';
import { ENTITY, LoadError, cardClass, fieldClass, outlineButtonClass, useDebouncedValue } from '../components/account/parts';
import { EmptyState, PageContainer, PageHeader } from '../components/layout/Page';

const ALL_CAREERS = 'all';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?near=30.5083,-97.6789`: a point, as latitude then longitude. */
function readPoint(raw: string | null): { lat: number; lng: number } | null {
  const match = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(raw ?? '');
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** "12 miles", "0.4 miles", "1 mile". */
function milesAway(miles: number): string {
  const shown = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  return `${shown} ${shown === 1 ? 'mile' : 'miles'}`;
}

/**
 * Open jobs, newest first. The search text and the filters live in the URL
 * (`?q=`, `?career=`, and a place: `?state=`, or `?near=<lat>,<lng>` with
 * `&place=<its name>` and `&within=<miles>`), so a filtered list can be linked
 * to and Back returns to it. Near a place, the nearest jobs come first and
 * each says how far it is. The place is one the person typed or picked: the
 * browser is never asked where they are.
 */
export default function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const homeZip = useAccount().data?.user?.homeZip ?? null;
  const q = searchParams.get('q')?.trim() ?? '';
  const careerParam = searchParams.get('career') ?? '';
  const career = UUID_RE.test(careerParam) ? careerParam : '';
  const stateParam = (searchParams.get('state') ?? '').toUpperCase();
  const point = readPoint(searchParams.get('near'));
  // A point wins over a state: the address holds one place.
  const state = !point && /^[A-Z]{2}$/.test(stateParam) ? stateParam : '';
  const withinParam = Number(searchParams.get('within'));
  const within = WITHIN_CHOICES.includes(withinParam) ? withinParam : DEFAULT_WITHIN;
  const place: JobPlace | null = point
    ? { kind: 'near', ...point, label: searchParams.get('place')?.trim() || `${point.lat.toFixed(2)}, ${point.lng.toFixed(2)}` }
    : state
      ? { kind: 'state', code: state }
      : null;

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

  const setFilter = (name: 'career', value: string, none: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value !== none) params.set(name, value);
    else params.delete(name);
    setSearchParams(params, { replace: true });
  };

  const setPlace = (next: JobPlace | null, miles = within) => {
    const params = new URLSearchParams(searchParams);
    for (const name of ['state', 'near', 'place', 'within']) params.delete(name);
    if (next?.kind === 'state') params.set('state', next.code);
    else if (next?.kind === 'near') {
      params.set('near', `${next.lat.toFixed(4)},${next.lng.toFixed(4)}`);
      params.set('place', next.label);
      if (miles !== DEFAULT_WITHIN) params.set('within', String(miles));
    }
    setSearchParams(params, { replace: true });
  };

  const clearFilters = () => {
    setTerm('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const jobs = useJobs({
    q: q || undefined,
    state: state || undefined,
    occupationId: career || undefined,
    near: point ? `${point.lat},${point.lng}` : undefined,
    within: point ? within : undefined,
  });
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

  // The states that have open jobs.
  const jobStates = useMemo(() => [...new Set((allJobs.data ?? []).map((job) => job.state).filter((code): code is string => Boolean(code)))], [allJobs.data]);

  // A career linked to from elsewhere may have no open jobs; still name it in the filter.
  const careerListed = careerOptions.some((option) => option.id === career);
  const linkedCareer = useQuery({
    queryKey: ['picker', 'occupation', career],
    queryFn: () => occupationsApi.get(career),
    enabled: Boolean(career) && allJobs.isSuccess && !careerListed,
    staleTime: 5 * 60_000,
  });

  const filtered = Boolean(q || career || place);
  const count = jobs.data?.length ?? 0;
  const placeName = jobPlaceLabel(place);
  // Where a job opened from this list comes back to.
  const here = `${location.pathname}${location.search}`;

  return (
    <PageContainer>
      <PageHeader
        icon={BriefcaseBusiness}
        title="Jobs"
        description="Open positions. Each is tied to a career and its skills."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_300px_240px]">
        <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            role="searchbox"
            enterKeyHint="search"
            aria-label="Search jobs by title, company, career or town"
            placeholder="Job, company or career"
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
        <JobPlaceFilter
          value={place}
          onChange={(next) => setPlace(next)}
          within={within}
          onWithinChange={(miles) => setPlace(place, miles)}
          states={jobStates}
          homeZip={homeZip}
        />
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
                {option.title}
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
            description={
              place?.kind === 'near'
                ? `No open job within ${within} miles of ${placeName} fits.`
                : 'No open job fits these filters.'
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {place?.kind === 'near' && within < 100 && (
                  <Button type="button" onClick={() => setPlace(place, 100)} className="h-10 rounded-lg">
                    Within 100 miles
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={clearFilters} className={cn('h-10', outlineButtonClass)}>
                  Clear filters
                </Button>
              </div>
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
            {place?.kind === 'near'
              ? `${count} ${count === 1 ? 'job' : 'jobs'} within ${within} miles of ${placeName}`
              : `${count} ${filtered ? (count === 1 ? 'job matches' : 'jobs match') : count === 1 ? 'open job' : 'open jobs'}`}
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
                <JobCard job={job} from={filtered ? here : undefined} />
              </li>
            ))}
          </ul>
        </>
      )}
    </PageContainer>
  );
}

function JobCard({ job, from }: { job: JobSummary; from?: string }) {
  // Not every factory has a city on record; its name places it well enough.
  const town = job.city ? formatPlace(job.city, job.state) : [job.factoryName, job.state].filter(Boolean).join(', ');
  // Near a chosen place, how far the job is from it.
  const place = [town, typeof job.miles === 'number' ? milesAway(job.miles) : null].filter(Boolean).join(' · ');
  return (
    <Link
      to={`/jobs/${job.id}`}
      state={from ? { from } : undefined}
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
