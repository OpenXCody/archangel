import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, LogOut, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { skillsApi } from '../lib/api';
import {
  isFinished,
  useMyApplications,
  useMyGoals,
  useMySkills,
  useRemoveGoal,
  useRemoveSkill,
  useSetSkillStatus,
  useSignOut,
  useUpdateApplication,
  useUpdateProfile,
  type AccountUser,
  type MyApplication,
  type MySkill,
  type SkillStatus,
} from '../lib/account';
import { formatAgo, formatPlace } from '../lib/jobFormat';
import {
  AccountGate,
  ApplicationStatusBadge,
  CardNote,
  ENTITY,
  ErrorNote,
  Field,
  HeldMeter,
  LoadError,
  RowsSkeleton,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
  useDebouncedValue,
} from '../components/account/parts';
import { SkillStatusControl } from '../components/account/SkillStatusButton';
import { PageContainer, PageHeader, PageSection } from '../components/layout/Page';

export default function Me() {
  return <AccountGate>{(account) => <MyPage user={account.user} />}</AccountGate>;
}

function MyPage({ user }: { user: AccountUser }) {
  const signOut = useSignOut();
  return (
    <PageContainer size="narrow">
      <PageHeader
        eyebrow="My page"
        title={user.name}
        description={user.email}
        actions={
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button
              type="button"
              variant="outline"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
              className={cn('h-10', outlineButtonClass)}
            >
              {signOut.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
              Sign out
            </Button>
            <ErrorNote error={signOut.error} />
          </div>
        }
      />
      <ProfileSection user={user} />
      <GoalsSection />
      <SkillsSection />
      <ApplicationsSection />
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfileSection({ user }: { user: AccountUser }) {
  const update = useUpdateProfile();
  const [name, setName] = useState(user.name);
  const [homeZip, setHomeZip] = useState(user.homeZip ?? '');
  const [about, setAbout] = useState(user.about ?? '');

  const dirty = name !== user.name || homeZip !== (user.homeZip ?? '') || about !== (user.about ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (update.isPending) return;
    update.mutate(
      { name, homeZip, about },
      {
        // The server trims what it stores; show exactly that.
        onSuccess: ({ user: saved }) => {
          setName(saved.name);
          setHomeZip(saved.homeZip ?? '');
          setAbout(saved.about ?? '');
        },
      }
    );
  };

  return (
    <PageSection title="Profile" description="Companies see your name, email and ZIP code when you apply.">
      <form onSubmit={submit} noValidate className={cn(cardClass, 'space-y-4 p-4 sm:p-6')}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Field label="Name" htmlFor="profile-name">
            <input
              id="profile-name"
              type="text"
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="ZIP code" htmlFor="profile-zip">
            <input
              id="profile-zip"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={10}
              placeholder="78701"
              value={homeZip}
              onChange={(e) => setHomeZip(e.target.value)}
              className={fieldClass}
            />
          </Field>
        </div>
        <Field label="About" htmlFor="profile-about" optional hint="A few lines on what you do and what you are looking for.">
          <textarea
            id="profile-about"
            rows={4}
            maxLength={2000}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            className={cn(fieldClass, 'resize-y')}
          />
        </Field>
        <ErrorNote error={update.error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!dirty || update.isPending} className="h-10 rounded-lg">
            {update.isPending && <Loader2 className="animate-spin" />}
            Save profile
          </Button>
          {update.isSuccess && !dirty && (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </form>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Careers I'm aiming at
// ---------------------------------------------------------------------------

function GoalsSection() {
  const goals = useMyGoals();
  const removeGoal = useRemoveGoal();
  const CareerIcon = ENTITY.career.icon;

  return (
    <PageSection title="Careers I'm aiming at" description="How many of each career's skills you already hold.">
      {goals.isPending ? (
        <RowsSkeleton rows={2} />
      ) : goals.isError ? (
        <LoadError error={goals.error} onRetry={() => void goals.refetch()} retrying={goals.isFetching} />
      ) : goals.data.length === 0 ? (
        <CardNote>
          You are not aiming at a career yet.{' '}
          <Link to="/explore?tab=occupations" className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
            Browse careers
          </Link>{' '}
          and pick one to see which skills it takes.
        </CardNote>
      ) : (
        <ul className={cardClass}>
          {goals.data.map((goal) => {
            const removing = removeGoal.isPending && removeGoal.variables === goal.occupationId;
            return (
              <li key={goal.occupationId} className={cn(rowClass, 'flex items-center gap-3 p-4')}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-elevated">
                  <CareerIcon className={cn('h-4 w-4', ENTITY.career.text)} />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/occupations/${goal.occupationId}`}
                    className="block truncate text-sm font-medium text-fg-default underline-offset-4 hover:underline"
                  >
                    {goal.title}
                  </Link>
                  {goal.totalSkills > 0 ? (
                    <HeldMeter held={goal.heldSkills} total={goal.totalSkills} noun="skills held" className="mt-1" />
                  ) : (
                    <p className="mt-1 text-sm text-fg-muted">No skills are listed for this career yet.</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Stop aiming at ${goal.title}`}
                  title="Remove"
                  disabled={removing}
                  onClick={() => removeGoal.mutate(goal.occupationId)}
                  className="h-10 w-10 shrink-0 text-fg-muted hover:bg-bg-elevated hover:text-fg-default"
                >
                  {removing ? <Loader2 className="animate-spin" /> : <X />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ErrorNote error={removeGoal.error} className="mt-2" />
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// My skills
// ---------------------------------------------------------------------------

function SkillsSection() {
  const skills = useMySkills();
  const setStatus = useSetSkillStatus();
  const removeSkill = useRemoveSkill();

  const heldCount = skills.data?.filter((skill) => skill.status === 'held').length ?? 0;
  const pendingId = setStatus.isPending ? setStatus.variables?.skillId : removeSkill.isPending ? removeSkill.variables : undefined;

  const change = (skillId: string, status: SkillStatus) => {
    removeSkill.reset();
    setStatus.mutate({ skillId, status });
  };

  return (
    <PageSection
      title="My skills"
      description={
        skills.data && skills.data.length > 0
          ? `${heldCount} held, ${skills.data.length - heldCount} learning. Skills are self-reported.`
          : 'Skills you hold or are learning. They are self-reported.'
      }
    >
      <SkillSearch mySkills={skills.data ?? []} onAdd={change} pendingId={pendingId} disabled={skills.isPending} />

      <div className="mt-3">
        {skills.isPending ? (
          <RowsSkeleton rows={3} />
        ) : skills.isError ? (
          <LoadError error={skills.error} onRetry={() => void skills.refetch()} retrying={skills.isFetching} />
        ) : skills.data.length === 0 ? (
          <CardNote>No skills yet. Search above to add the ones you hold or are learning.</CardNote>
        ) : (
          <ul className={cardClass}>
            {skills.data.map((skill) => (
              <SkillRow
                key={skill.skillId}
                skill={skill}
                busy={pendingId === skill.skillId}
                onChange={(status) => change(skill.skillId, status)}
                onRemove={() => {
                  setStatus.reset();
                  removeSkill.mutate(skill.skillId);
                }}
              />
            ))}
          </ul>
        )}
      </div>
      <ErrorNote error={setStatus.error ?? removeSkill.error} className="mt-2" />
    </PageSection>
  );
}

function SkillRow({ skill, busy, onChange, onRemove }: { skill: MySkill; busy: boolean; onChange: (status: SkillStatus) => void; onRemove: () => void }) {
  return (
    <li className={cn(rowClass, 'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3')}>
      <Link
        to={`/skills/${skill.skillId}`}
        className="min-w-0 flex-1 basis-28 break-words text-sm font-medium text-fg-default underline-offset-4 hover:underline"
      >
        {skill.name}
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        <SkillStatusControl
          label={`Status of ${skill.name}`}
          hideNone
          value={skill.status}
          disabled={busy}
          onChange={(next) => {
            if (next !== 'none') onChange(next);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${skill.name}`}
          title="Remove"
          disabled={busy}
          onClick={onRemove}
          className="h-10 w-10 shrink-0 text-fg-muted hover:bg-bg-elevated hover:text-fg-default"
        >
          {busy ? <Loader2 className="animate-spin" /> : <X />}
        </Button>
      </div>
    </li>
  );
}

interface SkillSearchProps {
  mySkills: MySkill[];
  onAdd: (skillId: string, status: SkillStatus) => void;
  pendingId: string | undefined;
  disabled: boolean;
}

/** Search the skills catalogue and add a result as learning or held. */
function SkillSearch({ mySkills, onAdd, pendingId, disabled }: SkillSearchProps) {
  const [term, setTerm] = useState('');
  const query = useDebouncedValue(term.trim());
  const results = useQuery({
    queryKey: ['picker', 'skills', query],
    queryFn: () => skillsApi.list({ search: query, limit: 8 }),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
  const showResults = term.trim().length >= 2 && query.length >= 2;
  const statusOf = (skillId: string) => mySkills.find((skill) => skill.skillId === skillId)?.status;

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          role="searchbox"
          enterKeyHint="search"
          aria-label="Search skills to add"
          placeholder="Add a skill, e.g. welding"
          autoComplete="off"
          value={term}
          disabled={disabled}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setTerm('');
          }}
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

      {showResults && (
        <div className={cn(cardClass, 'mt-2')} aria-live="polite">
          {results.isPending ? (
            <p className="flex items-center gap-2 p-4 text-sm text-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching skills
            </p>
          ) : results.isError ? (
            <ErrorNote error={results.error} className="p-4" />
          ) : results.data.data.length === 0 ? (
            <p className="p-4 text-sm text-fg-muted">No skills match “{query}”. Try a shorter or different word.</p>
          ) : (
            <ul>
              {results.data.data.map((skill) => {
                const status = statusOf(skill.id);
                const busy = pendingId === skill.id;
                return (
                  <li key={skill.id} className={cn(rowClass, 'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3')}>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="break-words text-sm font-medium text-fg-default">{skill.name}</p>
                      {skill.category && <p className="truncate text-xs text-fg-muted">{skill.category}</p>}
                    </div>
                    {status ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        On your list ({status})
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => onAdd(skill.id, 'learning')}
                          aria-label={`Add ${skill.name} as learning`}
                          className={cn('h-9', outlineButtonClass)}
                        >
                          Learning
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy}
                          onClick={() => onAdd(skill.id, 'held')}
                          aria-label={`Add ${skill.name} as held`}
                          className="h-9"
                        >
                          {busy && <Loader2 className="animate-spin" />}
                          Held
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My applications
// ---------------------------------------------------------------------------

function ApplicationsSection() {
  const applications = useMyApplications();
  return (
    <PageSection title="My applications" description="Where each one stands with the company.">
      {applications.isPending ? (
        <RowsSkeleton rows={2} />
      ) : applications.isError ? (
        <LoadError error={applications.error} onRetry={() => void applications.refetch()} retrying={applications.isFetching} />
      ) : applications.data.length === 0 ? (
        <CardNote>
          You have not applied to a job yet.{' '}
          <Link to="/jobs" className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
            See open jobs
          </Link>
        </CardNote>
      ) : (
        <ul className={cardClass}>
          {applications.data.map((application) => (
            <ApplicationRow key={application.id} application={application} />
          ))}
        </ul>
      )}
    </PageSection>
  );
}

function ApplicationRow({ application }: { application: MyApplication }) {
  const update = useUpdateApplication();
  const [confirming, setConfirming] = useState(false);
  const finished = isFinished(application.status);
  const place = formatPlace(application.city, application.state);

  // If the company finishes it while the confirm step is open, drop the step.
  useEffect(() => {
    if (finished) setConfirming(false);
  }, [finished]);

  const withdraw = () => {
    update.mutate(
      { applicationId: application.id, patch: { status: 'withdrawn' } },
      { onSettled: () => setConfirming(false) }
    );
  };

  return (
    <li className={cn(rowClass, 'p-4')} data-application={application.id}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to={`/jobs/${application.jobId}`}
            className="block break-words text-sm font-medium text-fg-default underline-offset-4 hover:underline"
          >
            {application.jobTitle}
          </Link>
          <p className="mt-0.5 break-words text-sm text-fg-muted">
            {application.companyName}
            {place && ` · ${place}`}
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Applied {formatAgo(application.createdAt)}
            {application.jobStatus === 'closed' && ' · This job has closed'}
          </p>
        </div>
        <ApplicationStatusBadge status={application.status} className="mt-0.5" />
      </div>

      {!finished && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <span className="min-w-0 flex-1 basis-56 text-sm text-fg-muted">
                Withdraw this application? You cannot apply to this job again.
              </span>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="destructive" size="sm" disabled={update.isPending} onClick={withdraw} className="h-9">
                  {update.isPending && <Loader2 className="animate-spin" />}
                  Yes, withdraw
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => setConfirming(false)}
                  className={cn('h-9', outlineButtonClass)}
                >
                  Keep it
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                update.reset();
                setConfirming(true);
              }}
              className={cn('h-9', outlineButtonClass)}
            >
              Withdraw
            </Button>
          )}
        </div>
      )}
      <ErrorNote error={update.error} className="mt-2" />
    </li>
  );
}
