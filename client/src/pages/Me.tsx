import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
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
  useChangePassword,
  useEmailOn,
  useMarkSeen,
  useSignOut,
  useUpdateApplication,
  useUpdateProfile,
  accountRoles,
  type AccountUser,
  type MyApplication,
  type MySkill,
  type SignedInAccount,
  type SkillStatus,
} from '../lib/account';
import { applicationStatusLabel, formatPlace } from '../lib/jobFormat';
import { goalNextSkills, nextSkillNames, useCareersInReach, type NextSkill } from '../lib/seeker';
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
  textButtonClass,
  useDebouncedValue,
} from '../components/account/parts';
import { SkillStatusControl } from '../components/account/SkillStatusButton';
import { PageContainer, PageHeader, PageSection } from '../components/layout/Page';

export default function Me() {
  return <AccountGate>{(account) => <MyPage account={account} />}</AccountGate>;
}

/**
 * The person's own page. What they are working toward comes first; the two
 * account fields come last. Nothing here asks for more than a tap: careers
 * and skills are picked from the catalogue, never typed out.
 */
function MyPage({ account }: { account: SignedInAccount }) {
  const { user } = account;
  const signOut = useSignOut();
  return (
    <PageContainer size="narrow">
      <PageHeader
        eyebrow={accountRoles(account).join(' · ')}
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
      <GoalsSection />
      <SkillsSection />
      <ApplicationsSection email={user.email} />
      <ProfileSection user={user} />
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

  const dirty = name !== user.name || homeZip !== (user.homeZip ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (update.isPending) return;
    update.mutate(
      { name, homeZip },
      {
        // The server trims what it stores; show exactly that.
        onSuccess: ({ user: saved }) => {
          setName(saved.name);
          setHomeZip(saved.homeZip ?? '');
        },
      }
    );
  };

  return (
    <PageSection title="Account" description="Name, email and ZIP code are shown to a company on application.">
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
              value={homeZip}
              onChange={(e) => setHomeZip(e.target.value)}
              className={fieldClass}
            />
          </Field>
        </div>
        <ErrorNote error={update.error} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!dirty || update.isPending} className="h-10 rounded-lg">
            {update.isPending && <Loader2 className="animate-spin" />}
            Save
          </Button>
          {update.isSuccess && !dirty && (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-success">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </form>
      <NoticeSwitch user={user} />
      <PasswordChange email={user.email} />
    </PageSection>
  );
}

/**
 * Emails about applications and company access, on or off. Only there when
 * the app can send mail. Sign-in emails (a reset link) are not affected.
 */
function NoticeSwitch({ user }: { user: AccountUser }) {
  const emailOn = useEmailOn();
  const update = useUpdateProfile();
  if (!emailOn) return null;
  // While saving, show what was chosen; if it fails, fall back to what is stored.
  const checked = update.isPending ? update.variables?.emailNotices === true : user.emailNotices;

  return (
    <div className={cn(cardClass, 'mt-3 px-4 py-3 sm:px-6')} data-email-notices>
      <div className="flex items-center gap-4">
        <label htmlFor="email-notices" className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-medium text-fg-default">Email me about applications and access</span>
          <span className="mt-0.5 block break-all text-xs text-fg-muted">{user.email}</span>
        </label>
        {/* A button, so the label, Space and Enter all work; marked busy while saving, never disabled. */}
        <button
          type="button"
          role="switch"
          id="email-notices"
          aria-checked={checked}
          aria-busy={update.isPending}
          onClick={() => {
            if (!update.isPending) update.mutate({ emailNotices: !checked });
          }}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
            checked ? 'bg-fg-default' : 'bg-border-strong'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-bg-surface shadow-sm transition-transform',
              checked && 'translate-x-5'
            )}
          />
        </button>
      </div>
      <ErrorNote error={update.error} className="mt-2" />
    </div>
  );
}

/**
 * Changing the password stays out of the way: one quiet line under the
 * account card, which opens two fields. Other devices are signed out by the
 * change; this one stays signed in.
 */
function PasswordChange({ email }: { email: string }) {
  const change = useChangePassword();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const close = () => {
    setOpen(false);
    setCurrent('');
    setNext('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (change.isPending) return;
    change.mutate({ current, next }, { onSuccess: close });
  };

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        <button
          type="button"
          onClick={() => {
            change.reset();
            setOpen(true);
          }}
          className={textButtonClass}
        >
          Change password
        </button>
        {change.isSuccess && (
          <span role="status" className="inline-flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" />
            Password changed.
          </span>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className={cn(cardClass, 'mt-3 space-y-4 p-4 sm:p-6')} data-password-form>
      {/* Not shown: it tells a password manager which account the new password belongs to. */}
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor="password-current">
          <input
            id="password-current"
            type="password"
            autoComplete="current-password"
            autoFocus
            maxLength={200}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={fieldClass}
          />
        </Field>
        <Field label="New password" htmlFor="password-next" hint="At least 8 characters.">
          <input
            id="password-next"
            type="password"
            autoComplete="new-password"
            maxLength={200}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={fieldClass}
          />
        </Field>
      </div>
      <ErrorNote error={change.error} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={!current || !next || change.isPending} className="h-10 rounded-lg">
          {change.isPending && <Loader2 className="animate-spin" />}
          Change password
        </Button>
        <button type="button" disabled={change.isPending} onClick={close} className={textButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Careers
// ---------------------------------------------------------------------------

function GoalsSection() {
  const goals = useMyGoals();
  const removeGoal = useRemoveGoal();
  const CareerIcon = ENTITY.career.icon;

  return (
    <PageSection title="Careers" description="Skills held toward each selected career.">
      {goals.isPending ? (
        <RowsSkeleton rows={2} />
      ) : goals.isError ? (
        <LoadError error={goals.error} onRetry={() => void goals.refetch()} retrying={goals.isFetching} />
      ) : goals.data.length === 0 ? (
        <CardNote>
          None selected.{' '}
          <Link to="/explore?tab=occupations" className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
            Browse careers
          </Link>
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
                    <p className="mt-1 text-sm text-fg-muted">No skills on record.</p>
                  )}
                  <NextSkills next={goalNextSkills(goal)} className="mt-1.5" />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${goal.title}`}
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
      <CareersInReach />
    </PageSection>
  );
}

/** The skills to pick up next for a career, as one line of text. Nothing when none are left. */
function NextSkills({ next, className }: { next: NextSkill[]; className?: string }) {
  if (next.length === 0) return null;
  return (
    <p className={cn('break-words text-sm text-fg-muted', className)}>
      <span className="text-fg-soft">Next</span> {nextSkillNames(next)}
    </p>
  );
}

/** How many careers within reach are listed before "Show all". */
const REACH_SHOWN = 4;

/**
 * Careers the person's held skills already cover part of, closest first.
 * Renders nothing until there is something to show: a person with no held
 * skills sees no heading and no placeholder.
 */
function CareersInReach() {
  const reach = useCareersInReach();
  const [showAll, setShowAll] = useState(false);

  if (reach.isError && !reach.data) {
    return (
      <div className="mt-5">
        <h3 className="mb-2 text-sm font-medium text-fg-muted">Within reach</h3>
        <LoadError error={reach.error} onRetry={() => void reach.refetch()} retrying={reach.isFetching} />
      </div>
    );
  }
  if (!reach.data || reach.data.length === 0) return null;
  const careers = showAll ? reach.data : reach.data.slice(0, REACH_SHOWN);

  return (
    <div className="mt-5" data-careers-in-reach>
      <h3 className="mb-2 text-sm font-medium text-fg-muted">Within reach</h3>
      <ul className={cardClass}>
        {careers.map((career) => (
          <li key={career.id} className={cn(rowClass, 'px-4 py-3')}>
            <div className="flex items-baseline gap-3">
              <Link
                to={`/occupations/${career.id}`}
                className="min-w-0 flex-1 break-words text-sm font-medium text-fg-default underline-offset-4 hover:underline"
              >
                {career.title}
              </Link>
              <span className="shrink-0 text-sm tabular-nums text-fg-muted" aria-label={`${career.held} of ${career.total} skills held`}>
                {career.held} of {career.total}
              </span>
            </div>
            <NextSkills next={career.next} className="mt-0.5" />
          </li>
        ))}
      </ul>
      {!showAll && reach.data.length > REACH_SHOWN && (
        <button type="button" onClick={() => setShowAll(true)} className={cn(textButtonClass, 'mt-3 px-1')}>
          Show all
        </button>
      )}
    </div>
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
      title="Skills"
      description={
        skills.data && skills.data.length > 0
          ? `${heldCount} held, ${skills.data.length - heldCount} learning.`
          : 'Held or learning.'
      }
    >
      <SkillSearch mySkills={skills.data ?? []} onAdd={change} pendingId={pendingId} disabled={skills.isPending} />

      <div className="mt-3">
        {skills.isPending ? (
          <RowsSkeleton rows={3} />
        ) : skills.isError ? (
          <LoadError error={skills.error} onRetry={() => void skills.refetch()} retrying={skills.isFetching} />
        ) : skills.data.length === 0 ? (
          <CardNote>
            None added.{' '}
            <Link to="/explore?tab=occupations" className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
              Mark skills on a career's path
            </Link>
          </CardNote>
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
          placeholder="Add a skill"
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
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-success">
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

/** "Nov 3", with the year once it is not this one. */
function formatStageDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

function ApplicationsSection({ email }: { email: string }) {
  const applications = useMyApplications();
  const { mutate: markSeen } = useMarkSeen();
  // Applications the company moved since the last visit are listed first, and
  // stay first for as long as this page is open: opening it is what marks them
  // seen, and the list must not reshuffle under the person a moment later.
  const movedRef = useRef(new Set<string>());
  const moved = (applications.data ?? []).filter((application) => application.changed).map((application) => application.id);
  for (const id of moved) movedRef.current.add(id);
  const movedKey = moved.join(',');
  useEffect(() => {
    if (movedKey) markSeen({ applications: true });
  }, [movedKey, markSeen]);
  const rank = (application: MyApplication) => (movedRef.current.has(application.id) ? 0 : 1);
  // A stable sort: within each group the server's order (newest first) stands.
  const listed = [...(applications.data ?? [])].sort((a, b) => rank(a) - rank(b));

  return (
    <PageSection title="Applications">
      {applications.isPending ? (
        <RowsSkeleton rows={2} />
      ) : applications.isError ? (
        <LoadError error={applications.error} onRetry={() => void applications.refetch()} retrying={applications.isFetching} />
      ) : applications.data.length === 0 ? (
        <CardNote>
          None.{' '}
          <Link to="/jobs" className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
            Open jobs
          </Link>
        </CardNote>
      ) : (
        <ul className={cardClass}>
          {listed.map((application) => (
            <ApplicationRow key={application.id} application={application} email={email} />
          ))}
        </ul>
      )}
    </PageSection>
  );
}

/** Stages at which the next move is the company's, and the person should know how it will come. */
const CONTACT_STAGES: ReadonlySet<string> = new Set(['interview', 'offer']);

function ApplicationRow({ application, email }: { application: MyApplication; email: string }) {
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
          {/* Its history in one line; the stage it is at now is the bright one. */}
          <p className="mt-1.5 break-words text-xs text-fg-muted" data-application-history>
            {application.events.map((event, index) => (
              <Fragment key={`${event.at}:${event.status}`}>
                {index > 0 && ' · '}
                {/* A stage and its date stay on one line together. */}
                <span className={cn('whitespace-nowrap', index === application.events.length - 1 && 'text-fg-default')}>
                  {applicationStatusLabel(event.status)} {formatStageDate(event.at)}
                </span>
              </Fragment>
            ))}
            {application.jobStatus === 'closed' && <span>{application.events.length > 0 && ' · '}This job has closed</span>}
          </p>
          {CONTACT_STAGES.has(application.status) && (
            <p className="mt-1.5 break-words text-sm text-fg-default" data-application-next>
              {application.companyName} will contact you at {email}.
            </p>
          )}
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
