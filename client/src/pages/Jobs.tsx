import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Loader2, MapPin, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import CompanyLogo from '../components/CompanyLogo';
import JobPlaceFilter, { DEFAULT_WITHIN, WITHIN_CHOICES, jobPlaceLabel, type JobPlace } from '../components/jobs/JobPlaceFilter';
import { occupationsApi, skillsApi } from '../lib/api';
import { useAccount } from '../lib/account';
import { useJobs, useJobsSummary, type JobSummary } from '../lib/jobs';
import { usePostJobLink } from '../lib/viewer';
import { employmentLabel, formatPay, formatPlace } from '../lib/jobFormat';
import { formatAgo } from '../lib/dates';
import { formatCompanyName, formatFactoryName } from '@shared/displayName';
import { LoadError, busyButtonClass, cardClass, fieldClass, outlineButtonClass } from '../components/account/parts';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { EmptyState, PageContainer, PageHeader } from '../components/layout/Page';
import { isUuid } from '../lib/validation';
import { publicKeys } from '../lib/queryKeys';

/** `?near=30.5083,-97.6789`: a point, as latitude then longitude. */
function readPoint(raw: string | null): { lat: number; lng: number } | null {
  const match = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(raw ?? '');
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** "12 miles", "2.4 miles", "Under 1 mile". */
function milesAway(miles: number): string {
  if (miles < 1) return 'Under 1 mile';
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
 *
 * Two fields: what (a job, a company or a career, typed) and where. A career
 * is narrowed to by its page's link (`?career=`), and the line above the list
 * then names it; a company's, a plant's and a skill's page link to all of
 * their open jobs the same way (`?company=`, `?plant=`, `?skill=`). With no open job anywhere there is nothing to filter: the
 * page is one sentence and the way on.
 */
export default function Jobs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const homeZip = useAccount().data?.user?.homeZip ?? null;
  // "Post a job" is offered to a visitor and to someone here to hire, never to a seeker.
  const postJob = usePostJobLink();
  const q = searchParams.get('q')?.trim() ?? '';
  const careerParam = searchParams.get('career') ?? '';
  const career = isUuid(careerParam) ? careerParam : '';
  // A company's, a plant's and a skill's page link here the same way, for all of their open jobs.
  const linked = (name: string) => {
    const value = searchParams.get(name) ?? '';
    return isUuid(value) ? value : '';
  };
  const company = linked('company');
  const plant = linked('plant');
  const skill = linked('skill');
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
    companyId: company || undefined,
    factoryId: plant || undefined,
    skillId: skill || undefined,
    near: point ? `${point.lat},${point.lng}` : undefined,
    within: point ? within : undefined,
  });
  // What is open anywhere: whether there is anything to filter, and the states on offer.
  const allJobs = useJobsSummary();

  // The states that have open jobs.
  const jobStates = useMemo(() => (allJobs.data?.states ?? []).map((row) => row.state), [allJobs.data]);

  // The career a link narrowed the list to, by name: from a job that has it, else looked up
  // (a career linked to from its page may have no open job).
  const careerInList = career ? (jobs.jobs ?? []).find((job) => job.occupationId === career)?.occupationTitle : undefined;
  const linkedCareer = useQuery({
    queryKey: publicKeys.picker('occupation', career),
    queryFn: () => occupationsApi.get(career),
    enabled: Boolean(career) && jobs.isSuccess && !careerInList,
    staleTime: 5 * 60_000,
  });
  const careerTitle = careerInList ?? linkedCareer.data?.title ?? null;
  // What else a link narrowed the list to, in the words the line above the list uses.
  const first = jobs.jobs?.[0];
  const linkedSkill = useQuery({
    queryKey: publicKeys.picker('skill', skill),
    queryFn: () => skillsApi.get(skill),
    enabled: Boolean(skill),
    staleTime: 5 * 60_000,
  });
  const narrowedTo = career
    ? careerTitle && `for ${careerTitle}`
    : company
      ? first && `at ${formatCompanyName(first.companyName)}`
      : plant
        ? first && `at ${formatFactoryName(first.factoryName)}`
        : skill
          ? linkedSkill.data && `that ask for ${linkedSkill.data.name}`
          : null;

  const filtered = Boolean(q || career || company || plant || skill || place);
  // How many match in all, not how many are on screen: the list shows a page at a time.
  const count = jobs.total;
  const shown = jobs.jobs ?? [];
  const placeName = jobPlaceLabel(place);
  // Nothing is open anywhere: no fields over an empty list.
  const nothingOpen = !filtered && allJobs.isSuccess && allJobs.data.total === 0;
  const jobWord = (n: number) => (n === 1 ? 'job' : 'jobs');
  const where = place?.kind === 'near' ? ` within ${within} miles of ${placeName}` : place ? ` in ${placeName}` : '';
  // What the list is, in one line: how many, and what narrowed it.
  const counted = count.toLocaleString('en-US');
  const summary =
    narrowedTo && !q
      ? `${counted} open ${jobWord(count)} ${narrowedTo}${where}`
      : place?.kind === 'near'
        ? `${counted} ${jobWord(count)} within ${within} miles of ${placeName}`
        : `${counted} ${filtered ? (count === 1 ? 'job matches' : 'jobs match') : `open ${jobWord(count)}`}`;
  // Where a job opened from this list comes back to.
  const here = `${location.pathname}${location.search}`;

  return (
    <PageContainer>
      <PageHeader title="Jobs" description="Open jobs. Each is tied to a career and its skills." />

      {!filtered && allJobs.isPending ? (
        // Whether there is anything to filter is not known yet: the fields' room is held, not the fields.
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]" aria-hidden="true">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      ) : nothingOpen ? null : (
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-2" />
            <input
              type="text"
              role="searchbox"
              enterKeyHint="search"
              // Heard as it is read.
              aria-label="Job, company or career"
              placeholder="Job, company or career"
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
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-text-2 hover:text-text-1"
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
        </div>
      )}

      {jobs.isPending ? (
        <JobCardsSkeleton />
      ) : jobs.isError ? (
        <LoadError error={jobs.error} onRetry={() => void jobs.refetch()} retrying={jobs.isFetching} />
      ) : count === 0 ? (
        filtered ? (
          <EmptyState
            title="No jobs match"
            description={
              place?.kind === 'near'
                ? q || career
                  ? `No open job within ${within} miles of ${placeName} fits these filters.`
                  : `No open jobs within ${within} miles of ${placeName}.`
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
            title="No open jobs"
            description="Jobs posted by employers appear here."
            action={
              postJob && !postJob.visitor ? (
                // Someone here to hire: the one thing to do about an empty list is theirs.
                <Button asChild className="h-10 rounded-lg" data-post-a-job>
                  <Link to={postJob.to}>Post a job</Link>
                </Button>
              ) : (
                // Everyone else: the one way on. A visitor who came to hire is told, quietly, that they can.
                <div className="flex flex-col items-center gap-3">
                  <Button asChild className="h-10 rounded-lg">
                    <Link to="/explore?tab=occupations">Browse careers</Link>
                  </Button>
                  {postJob && (
                    <p className="text-sm text-text-2" data-post-a-job>
                      Hiring?{' '}
                      <Link to={postJob.to} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-text-1">
                        Post a job
                      </Link>
                    </p>
                  )}
                </div>
              )
            }
          />
        )
      ) : (
        <>
          <p className="mb-3 flex items-center gap-2 text-sm text-text-2" role="status">
            {summary}
            {jobs.isFetching && !jobs.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Updating" />}
            {filtered && (
              <button type="button" onClick={clearFilters} className="shrink-0 whitespace-nowrap font-medium text-text-1 underline underline-offset-4 hover:no-underline">
                Clear filters
              </button>
            )}
          </p>
          <ul className={cn('grid grid-cols-1 gap-3 lg:grid-cols-2', jobs.isPlaceholderData && 'opacity-60')}>
            {shown.map((job) => (
              <li key={job.id} className="min-w-0">
                <JobCard job={job} from={filtered ? here : undefined} />
              </li>
            ))}
          </ul>
          {jobs.hasNextPage && (
            // The list is a page at a time: the next page is asked for, never the whole of a long list.
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button
                type="button"
                variant="outline"
                aria-disabled={jobs.isFetchingNextPage}
                aria-busy={jobs.isFetchingNextPage}
                onClick={() => {
                  if (!jobs.isFetchingNextPage) void jobs.fetchNextPage();
                }}
                className={cn('h-11 rounded-lg', outlineButtonClass, busyButtonClass)}
                data-more-jobs
              >
                {jobs.isFetchingNextPage && <Loader2 className="animate-spin" />}
                Show more
              </Button>
              <p className="text-sm text-text-2" data-jobs-shown>
                {shown.length.toLocaleString('en-US')} of {counted}
              </p>
            </div>
          )}
          {/* The one place a visiting employer learns they can list a job here. A seeker is not asked. */}
          {postJob && (
            <p className="mt-6 text-sm text-text-2" data-post-a-job>
              {postJob.visitor && 'Hiring? '}
              <Link to={postJob.to} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-text-1">
                Post a job
              </Link>
            </p>
          )}
        </>
      )}
    </PageContainer>
  );
}

function JobCard({ job, from }: { job: JobSummary; from?: string }) {
  // Not every plant has a city on record; its name places it well enough.
  // (A city is stored as its source wrote it, often in capitals: it is read as a name.)
  const town = job.city ? formatPlace(formatFactoryName(job.city), job.state) : [formatFactoryName(job.factoryName), job.state].filter(Boolean).join(', ');
  // Near a chosen place, how far the job is from it.
  const place = [town, typeof job.miles === 'number' ? milesAway(job.miles) : null].filter(Boolean).join(' · ');
  return (
    <Link
      to={`/jobs/${job.id}`}
      state={from ? { from } : undefined}
      className={cn(cardClass, 'flex h-full flex-col p-4 transition-colors hover:border-line-strong hover:bg-surface-hover')}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 break-words text-base font-medium text-text-1">{job.title}</h2>
        <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-text-2">{job.undated ? 'Listed' : 'Posted'} {formatAgo(job.postedAt)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-2">
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
      {/* A job from a company's careers site that states no pay says nothing about pay. */}
      {(job.payMin !== null || job.payMax !== null) && (
        <p className="mt-3 text-sm font-semibold text-text-1">{formatPay(job.payMin, job.payMax, job.payPeriod)}</p>
      )}
      {(job.employmentType || job.shift || job.occupationTitle !== job.title) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {job.employmentType && <Chip>{employmentLabel(job.employmentType)}</Chip>}
          {job.shift && (
            <Chip>
              <Clock className="h-3 w-3" />
              <span className="sr-only">Shift: </span>
              {job.shift}
            </Chip>
          )}
          {job.occupationTitle !== job.title && <Chip className="border-transparent bg-surface text-text-2">{job.occupationTitle}</Chip>}
        </div>
      )}
    </Link>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-text-2',
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
