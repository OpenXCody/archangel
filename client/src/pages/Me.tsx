import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, LogOut, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { exploreApi, skillsApi } from '../lib/api';
import {
  ApiError,
  isFinished,
  useAddGoal,
  useChangeEmail,
  useDeleteAccount,
  useMyApplications,
  useMyGoals,
  useMySkills,
  useRemoveGoal,
  useChangePassword,
  useEmailOn,
  useMarkSeen,
  useSignOut,
  useUpdateApplication,
  useUpdateProfile,
  accountRoles,
  type AccountUser,
  type MyApplication,
  type MyGoal,
  type MySkill,
  type SignedInAccount,
  type SkillStatus,
} from '../lib/account';
import { applicationStatusLabel, formatPlace } from '../lib/jobFormat';
import {
  goalNextSkills,
  nextSkillNames,
  suggestedSkillsKey,
  useCareersInReach,
  useMarkSkill,
  useSuggestedSkills,
  type NextSkill,
  type SkillMark,
} from '../lib/seeker';
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
  busyButtonClass,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
  textButtonClass,
  useDebouncedValue,
} from '../components/account/parts';
import CareerPicker from '../components/account/CareerPicker';
import { SkillHeldToggle, SkillStatusControl } from '../components/account/SkillStatusButton';
import { PageContainer, PageHeader, PageSection } from '../components/layout/Page';

export default function Me() {
  return <AccountGate>{(account) => <MyPage account={account} />}</AccountGate>;
}

const linkClass = 'font-medium text-fg-default underline underline-offset-4 hover:no-underline';

/**
 * The person's own page. What they are working toward comes first; the
 * account fields come last. Nothing here asks for more than a tap: careers
 * and skills are picked from the catalogue, never typed out.
 *
 * With nothing on it yet (no goal, no skill, no application) the page is one
 * question, which career, in place of three empty lists. Choosing one fills
 * the page: the goal, and its skills to mark off.
 */
function MyPage({ account }: { account: SignedInAccount }) {
  const { user } = account;
  const signOut = useSignOut();
  const goals = useMyGoals();
  const skills = useMySkills();
  const applications = useMyApplications();
  const roles = accountRoles(account);

  // Until all three have answered there is no telling which page to draw.
  const loading = goals.isPending || skills.isPending || applications.isPending;
  const firstRun = goals.data?.length === 0 && skills.data?.length === 0 && applications.data?.length === 0;

  // A goal chosen from the starting state replaces it with the full page: put
  // the focus on what took its place, not back at the top.
  const startedHere = useRef(false);
  useEffect(() => {
    if (firstRun || !startedHere.current) return;
    startedHere.current = false;
    document.querySelector<HTMLElement>('[data-goal-link]')?.focus();
  }, [firstRun]);

  return (
    <PageContainer size="narrow">
      <PageHeader
        eyebrow={roles.length > 0 ? roles.join(' · ') : undefined}
        title={user.name}
        description={user.email}
        actions={
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button
              type="button"
              variant="outline"
              aria-busy={signOut.isPending}
              aria-disabled={signOut.isPending}
              onClick={() => {
                if (!signOut.isPending) signOut.mutate();
              }}
              className={cn('h-10', outlineButtonClass, busyButtonClass)}
            >
              {signOut.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
              Sign out
            </Button>
            <ErrorNote error={signOut.error} />
          </div>
        }
      />
      {loading ? (
        <div className="mb-8">
          <RowsSkeleton rows={3} />
        </div>
      ) : firstRun ? (
        <Starter onStart={() => (startedHere.current = true)} />
      ) : (
        <>
          <GoalsSection />
          <SkillsSection />
          <ApplicationsSection email={user.email} />
        </>
      )}
      <ProfileSection account={account} />
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Starting out
// ---------------------------------------------------------------------------

/** How many careers the starting state offers before any is searched for. */
const STARTER_CAREERS = 5;

/**
 * What a page with nothing on it shows: one question. A career is chosen by
 * searching or from a few that have a path; either is one tap, and nothing is
 * typed that the catalogue does not already hold.
 */
function Starter({ onStart }: { onStart: () => void }) {
  const queryClient = useQueryClient();
  const addGoal = useAddGoal();
  // The same answer the Explore overview reads, so it is usually already here.
  const overview = useQuery({ queryKey: ['explore-overview'], queryFn: exploreApi.overview, staleTime: 5 * 60_000 });
  const careers = (overview.data?.careers ?? []).slice(0, STARTER_CAREERS);

  const choose = (occupationId: string) => {
    if (addGoal.isPending) return;
    onStart();
    addGoal.mutate(occupationId, {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: suggestedSkillsKey }),
    });
  };

  return (
    <PageSection title="Start with a career" description="Choose one to aim for. Its skills become your list to mark off." className="mb-10">
      <div data-starter>
        <CareerPicker id="starter-career" value={null} onChange={(career) => career && choose(career.id)} disabled={addGoal.isPending} />
        {careers.length > 0 && (
          <ul className={cn(cardClass, 'mt-3')}>
            {careers.map((career) => {
              const busy = addGoal.isPending && addGoal.variables === career.id;
              const count = career.stages.reduce((sum, stage) => sum + stage.count, 0);
              return (
                <li key={career.id} className={cn(rowClass, 'flex items-center gap-3 px-4 py-3')}>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/occupations/${career.id}`}
                      className="block break-words text-sm font-medium text-fg-default underline-offset-4 hover:underline"
                    >
                      {career.title}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-fg-muted">
                      {career.description ? `${career.description} · ` : ''}
                      {count} skills
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-busy={busy}
                    aria-disabled={addGoal.isPending}
                    aria-label={`Set ${career.title} as a goal`}
                    onClick={() => choose(career.id)}
                    className={cn('h-9 shrink-0', outlineButtonClass, busyButtonClass)}
                  >
                    {busy && <Loader2 className="animate-spin" />}
                    Set as goal
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <ErrorNote error={addGoal.error} className="mt-2" />
        <p className="mt-3 px-1 text-sm text-fg-muted">
          <Link to="/explore?tab=occupations" className={linkClass}>
            All careers
          </Link>
          {' · '}
          <Link to="/map" className={linkClass}>
            Open the map
          </Link>
        </p>
      </div>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

function ProfileSection({ account }: { account: SignedInAccount }) {
  const { user } = account;
  const update = useUpdateProfile();
  const [name, setName] = useState(user.name);
  const [homeZip, setHomeZip] = useState(user.homeZip ?? '');

  const dirty = name !== user.name || homeZip !== (user.homeZip ?? '');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (update.isPending || !dirty) return;
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
          <Button
            type="submit"
            disabled={!dirty && !update.isPending}
            aria-busy={update.isPending}
            aria-disabled={update.isPending}
            className={cn('h-10 rounded-lg', busyButtonClass)}
          >
            {update.isPending && <Loader2 className="animate-spin" />}
            Save
          </Button>
          {update.isSuccess && !dirty && <Done>Saved</Done>}
        </div>
      </form>
      <NoticeSwitch user={user} />
      <AccountActions account={account} />
    </PageSection>
  );
}

function Done({ children }: { children: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm text-success">
      <Check className="h-4 w-4" />
      {children}
    </span>
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

type AccountAction = 'email' | 'password' | 'delete';

/**
 * The rest of the account stays out of the way: one quiet line under the
 * card (change email, change password, delete account), each opening only
 * what it needs. Every one is confirmed by the current password.
 */
function AccountActions({ account }: { account: SignedInAccount }) {
  const [open, setOpen] = useState<AccountAction | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const triggers = useRef<Partial<Record<AccountAction, HTMLButtonElement | null>>>({});

  // A form that closes hands the focus back to the line that opened it.
  const close = (action: AccountAction, message?: string) => {
    setOpen(null);
    setDone(message ?? null);
    window.setTimeout(() => triggers.current[action]?.focus(), 0);
  };
  const trigger = (action: AccountAction, label: string) => (
    <button
      key={action}
      type="button"
      ref={(element) => {
        triggers.current[action] = element;
      }}
      onClick={() => {
        setDone(null);
        setOpen(action);
      }}
      className={textButtonClass}
    >
      {label}
    </button>
  );

  return (
    <>
      {open === 'email' && <EmailChange email={account.user.email} onClose={(changed) => close('email', changed ? 'Email changed.' : undefined)} />}
      {open === 'password' && (
        <PasswordChange email={account.user.email} onClose={(changed) => close('password', changed ? 'Password changed.' : undefined)} />
      )}
      {(open === null || open === 'delete') && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1" data-account-actions>
          {trigger('email', 'Change email')}
          {trigger('password', 'Change password')}
          {trigger('delete', 'Delete account')}
          {done && <Done>{done}</Done>}
        </div>
      )}
      <DeleteAccount account={account} open={open === 'delete'} onCancel={() => close('delete')} />
    </>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Which field a refusal is about, when the server says. */
function fieldOf(error: unknown): string | null {
  const payload = error instanceof ApiError ? error.payload : null;
  const field = payload && typeof payload === 'object' && 'field' in payload ? (payload as { field: unknown }).field : null;
  return typeof field === 'string' ? field : null;
}

/** The address the person signs in with. Their other devices are signed out by the change; this one stays signed in. */
function EmailChange({ email, onClose }: { email: string; onClose: (changed: boolean) => void }) {
  const change = useChangeEmail();
  const [next, setNext] = useState('');
  const [password, setPassword] = useState('');
  const [problems, setProblems] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (change.isPending) return;
    change.reset();
    const found: { email?: string; password?: string } = {};
    const typed = next.trim();
    if (!EMAIL_RE.test(typed)) found.email = 'Enter a valid email address.';
    else if (typed.toLowerCase() === email) found.email = 'That is already your email address.';
    if (!password) found.password = 'Enter your current password.';
    setProblems(found);
    if (found.email || found.password) {
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    change.mutate(
      { email: typed, password },
      {
        onSuccess: () => onClose(true),
        onError: (error) => (fieldOf(error) === 'password' ? passwordRef : emailRef).current?.focus(),
      }
    );
  };

  // What the server refused goes beside the field it is about.
  const refusedField = change.error ? fieldOf(change.error) : null;
  const emailProblem = problems.email ?? (refusedField === 'email' ? change.error : null);
  const passwordProblem = problems.password ?? (refusedField === 'password' ? change.error : null);

  return (
    <form onSubmit={submit} noValidate className={cn(cardClass, 'mt-3 space-y-4 p-4 sm:p-6')} data-email-form>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="New email" htmlFor="email-next">
          <input
            ref={emailRef}
            id="email-next"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            maxLength={254}
            aria-invalid={emailProblem ? true : undefined}
            aria-describedby={emailProblem ? 'email-next-problem' : undefined}
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setProblems((current) => ({ ...current, email: undefined }));
            }}
            className={fieldClass}
          />
          <div id="email-next-problem">
            <ErrorNote error={emailProblem} className="mt-2" />
          </div>
        </Field>
        <Field label="Current password" htmlFor="email-password">
          <input
            ref={passwordRef}
            id="email-password"
            type="password"
            autoComplete="current-password"
            maxLength={200}
            aria-invalid={passwordProblem ? true : undefined}
            aria-describedby={passwordProblem ? 'email-password-problem' : undefined}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setProblems((current) => ({ ...current, password: undefined }));
            }}
            className={fieldClass}
          />
          <div id="email-password-problem">
            <ErrorNote error={passwordProblem} className="mt-2" />
          </div>
        </Field>
      </div>
      {!refusedField && <ErrorNote error={change.error} />}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" aria-busy={change.isPending} aria-disabled={change.isPending} className={cn('h-10 rounded-lg', busyButtonClass)}>
          {change.isPending && <Loader2 className="animate-spin" />}
          Change email
        </Button>
        <button
          type="button"
          onClick={() => {
            if (!change.isPending) onClose(false);
          }}
          className={textButtonClass}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Two fields. Other devices are signed out by the change; this one stays signed in. */
function PasswordChange({ email, onClose }: { email: string; onClose: (changed: boolean) => void }) {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [problems, setProblems] = useState<{ current?: string; next?: string }>({});
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (change.isPending) return;
    change.reset();
    const found: { current?: string; next?: string } = {};
    if (!current) found.current = 'Enter your current password.';
    if (next.length < 8) found.next = 'Use a password of at least 8 characters.';
    setProblems(found);
    if (found.current || found.next) {
      (found.current ? currentRef : nextRef).current?.focus();
      return;
    }
    change.mutate({ current, next }, { onSuccess: () => onClose(true), onError: () => currentRef.current?.focus() });
  };

  return (
    <form onSubmit={submit} noValidate className={cn(cardClass, 'mt-3 space-y-4 p-4 sm:p-6')} data-password-form>
      {/* Not shown: it tells a password manager which account the new password belongs to. */}
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Current password" htmlFor="password-current">
          <input
            ref={currentRef}
            id="password-current"
            type="password"
            autoComplete="current-password"
            autoFocus
            maxLength={200}
            aria-invalid={problems.current ? true : undefined}
            aria-describedby={problems.current ? 'password-current-problem' : undefined}
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setProblems((found) => ({ ...found, current: undefined }));
            }}
            className={fieldClass}
          />
          <div id="password-current-problem">
            <ErrorNote error={problems.current} className="mt-2" />
          </div>
        </Field>
        <Field label="New password" htmlFor="password-next" hint={problems.next ? undefined : 'At least 8 characters.'}>
          <input
            ref={nextRef}
            id="password-next"
            type="password"
            autoComplete="new-password"
            maxLength={200}
            aria-invalid={problems.next ? true : undefined}
            aria-describedby={problems.next ? 'password-next-problem' : undefined}
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setProblems((found) => ({ ...found, next: undefined }));
            }}
            className={fieldClass}
          />
          <div id="password-next-problem">
            <ErrorNote error={problems.next} className="mt-2" />
          </div>
        </Field>
      </div>
      <ErrorNote error={change.error} />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" aria-busy={change.isPending} aria-disabled={change.isPending} className={cn('h-10 rounded-lg', busyButtonClass)}>
          {change.isPending && <Loader2 className="animate-spin" />}
          Change password
        </Button>
        <button
          type="button"
          onClick={() => {
            if (!change.isPending) onClose(false);
          }}
          className={textButtonClass}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Deleting the account: the one step here that cannot be taken back, so it
 * says what goes and asks for the password. Escape and Cancel leave
 * everything as it was. Afterwards nobody is signed in and the map opens.
 */
function DeleteAccount({ account, open, onCancel }: { account: SignedInAccount; open: boolean; onCancel: () => void }) {
  const remove = useDeleteAccount();
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const companies = account.memberships.filter((membership) => membership.status === 'active').map((membership) => membership.companyName);

  const cancel = () => {
    if (remove.isPending) return;
    remove.reset();
    setPassword('');
    setProblem(null);
    onCancel();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (remove.isPending) return;
    remove.reset();
    if (!password) {
      setProblem('Enter your password.');
      passwordRef.current?.focus();
      return;
    }
    setProblem(null);
    remove.mutate(password, { onError: () => passwordRef.current?.focus() });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) cancel();
      }}
    >
      <DialogContent
        role="alertdialog"
        className="w-[calc(100%-2rem)] max-w-md gap-5 rounded-xl border-border-strong bg-bg-surface p-5 text-fg-default sm:rounded-xl [&>button]:hidden"
      >
        <form onSubmit={submit} noValidate className="grid gap-5" data-delete-account>
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-base font-semibold leading-snug">Delete your account?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 break-words text-sm text-fg-muted">
                <p>Your skills, goals and applications are removed. Companies you applied to no longer see them.</p>
                {companies.length > 0 && (
                  <p>
                    Your access to {companies.join(', ')} ends. Jobs you posted stay with the company.
                  </p>
                )}
                <p>This cannot be undone.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <Field label="Password" htmlFor="delete-password">
            <input
              ref={passwordRef}
              id="delete-password"
              type="password"
              autoComplete="current-password"
              maxLength={200}
              aria-invalid={problem || remove.error ? true : undefined}
              aria-describedby={problem || remove.error ? 'delete-password-problem' : undefined}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setProblem(null);
              }}
              className={fieldClass}
            />
            <div id="delete-password-problem">
              <ErrorNote error={problem ?? remove.error} className="mt-2" />
            </div>
          </Field>
          <DialogFooter className="flex-row justify-end gap-2 space-x-0 sm:space-x-0">
            <Button type="button" variant="outline" onClick={cancel} className={cn('h-10', outlineButtonClass)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              aria-busy={remove.isPending}
              aria-disabled={remove.isPending}
              className={cn('h-10', busyButtonClass)}
            >
              {remove.isPending && <Loader2 className="animate-spin" />}
              Delete account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

/** "Removed X." with the way back, in the place the row was. */
function RemovedRow({ name, onUndo, busy }: { name: string; onUndo: () => void; busy?: boolean }) {
  return (
    <li className={cn(rowClass, 'flex min-h-[52px] items-center gap-3 px-4 py-2')} data-removed>
      <p className="min-w-0 flex-1 break-words text-sm text-fg-muted" role="status">
        Removed {name}.
      </p>
      {/* Focus lands here: the button that was pressed is gone with its row. */}
      <button
        type="button"
        autoFocus
        aria-busy={busy}
        onClick={() => {
          if (!busy) onUndo();
        }}
        className={cn(textButtonClass, 'shrink-0 py-2 text-fg-default')}
      >
        Undo
      </button>
    </li>
  );
}

function GoalsSection() {
  const queryClient = useQueryClient();
  const goals = useMyGoals();
  const removeGoal = useRemoveGoal();
  const addGoal = useAddGoal();
  // Goals removed while this page is open keep their place until it is left, with a way back.
  const [removed, setRemoved] = useState<MyGoal[]>([]);
  const CareerIcon = ENTITY.career.icon;

  const refreshSuggestions = () => void queryClient.invalidateQueries({ queryKey: suggestedSkillsKey });
  const removedIds = new Set(removed.map((goal) => goal.occupationId));
  const listed = [
    ...(goals.data ?? []).filter((goal) => !removedIds.has(goal.occupationId)),
    ...removed,
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <PageSection title="Goals" description="Careers you are aiming for, and the skills you hold toward each.">
      {goals.isPending ? (
        <RowsSkeleton rows={2} />
      ) : goals.isError ? (
        <LoadError error={goals.error} onRetry={() => void goals.refetch()} retrying={goals.isFetching} />
      ) : listed.length === 0 ? (
        <CardNote>
          No goals yet.{' '}
          <Link to="/explore?tab=occupations" className={linkClass}>
            Browse careers
          </Link>
        </CardNote>
      ) : (
        <ul className={cardClass}>
          {listed.map((goal) => {
            if (removedIds.has(goal.occupationId)) {
              return (
                <RemovedRow
                  key={goal.occupationId}
                  name={goal.title}
                  busy={addGoal.isPending && addGoal.variables === goal.occupationId}
                  onUndo={() =>
                    addGoal.mutate(goal.occupationId, {
                      onSuccess: () => {
                        setRemoved((current) => current.filter((each) => each.occupationId !== goal.occupationId));
                        refreshSuggestions();
                      },
                    })
                  }
                />
              );
            }
            const removing = removeGoal.isPending && removeGoal.variables === goal.occupationId;
            return (
              <li key={goal.occupationId} className={cn(rowClass, 'flex items-center gap-3 p-4')}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-elevated">
                  <CareerIcon className={cn('h-4 w-4', ENTITY.career.text)} />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/occupations/${goal.occupationId}`}
                    data-goal-link
                    className="block truncate text-sm font-medium text-fg-default underline-offset-4 hover:underline"
                  >
                    {goal.title}
                  </Link>
                  {goal.totalSkills > 0 ? (
                    <HeldMeter held={goal.heldSkills} total={goal.totalSkills} noun="skills held" className="mt-1" />
                  ) : (
                    <p className="mt-1 text-sm text-fg-muted">Path not written yet.</p>
                  )}
                  <NextSkills next={goalNextSkills(goal)} className="mt-1.5" />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${goal.title}`}
                  title="Remove"
                  aria-busy={removing}
                  onClick={() => {
                    if (removeGoal.isPending) return;
                    addGoal.reset();
                    removeGoal.mutate(goal.occupationId, {
                      onSuccess: () => {
                        setRemoved((current) => [...current, goal]);
                        refreshSuggestions();
                      },
                    });
                  }}
                  className="h-11 w-11 shrink-0 text-fg-muted hover:bg-bg-elevated hover:text-fg-default"
                >
                  {removing ? <Loader2 className="animate-spin" /> : <X />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ErrorNote error={removeGoal.error ?? addGoal.error} className="mt-2" />
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
// Skills
// ---------------------------------------------------------------------------

function SkillsSection() {
  const skills = useMySkills();
  const markSkill = useMarkSkill();
  // Skills removed while this page is open keep their place until it is left, with a way back.
  const [removed, setRemoved] = useState<MySkill[]>([]);

  const mine = skills.data ?? [];
  const heldCount = mine.filter((skill) => skill.status === 'held').length;
  const mark = (skillId: string, name: string, next: SkillMark) => {
    // Marked again, by any route, it is no longer "removed".
    if (next !== 'none') setRemoved((current) => current.filter((each) => each.skillId !== skillId));
    markSkill.mutate({ skillId, name, mark: next });
  };
  const remove = (skill: MySkill) => {
    setRemoved((current) => [...current.filter((each) => each.skillId !== skill.skillId), skill]);
    markSkill.mutate(
      { skillId: skill.skillId, name: skill.name, mark: 'none' },
      // Refused: it is still on the list, so there is nothing to undo.
      { onError: () => setRemoved((current) => current.filter((each) => each.skillId !== skill.skillId)) }
    );
  };

  const hasSuggestions = (useSuggestedSkills().data?.length ?? 0) > 0;
  const learningCount = mine.length - heldCount;
  const counts = [heldCount > 0 ? `${heldCount} held` : null, learningCount > 0 ? `${learningCount} learning` : null].filter(Boolean).join(', ');
  const onList = new Set(mine.map((skill) => skill.skillId));
  const gone = removed.filter((skill) => !onList.has(skill.skillId));
  const goneIds = new Set(gone.map((skill) => skill.skillId));
  const listed = [...mine, ...gone].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PageSection
      title="Skills"
      description={`${counts || 'Held or learning'}. A company sees both when you apply.`}
    >
      <SkillSearch mySkills={mine} onAdd={mark} disabled={skills.isPending} />
      <SuggestedSkills mySkills={mine} onMark={mark} />

      <div className={hasSuggestions ? 'mt-5' : 'mt-3'}>
        {/* Two lists, so each is named. Alone, the person's own list needs no name under "Skills". */}
        {hasSuggestions && listed.length > 0 && <h3 className="mb-2 text-sm font-medium text-fg-muted">On your list</h3>}
        {skills.isPending ? (
          <RowsSkeleton rows={3} />
        ) : skills.isError ? (
          <LoadError error={skills.error} onRetry={() => void skills.refetch()} retrying={skills.isFetching} />
        ) : listed.length === 0 ? (
          hasSuggestions ? null : <CardNote>
            None yet.{' '}
            <Link to="/explore?tab=occupations" className={linkClass}>
              Mark skills on a career's path
            </Link>
          </CardNote>
        ) : (
          <ul className={cardClass} data-my-skills>
            {listed.map((skill) =>
              goneIds.has(skill.skillId) ? (
                <RemovedRow key={skill.skillId} name={skill.name} onUndo={() => mark(skill.skillId, skill.name, skill.status)} />
              ) : (
                <SkillRow
                  key={skill.skillId}
                  skill={skill}
                  onChange={(status) => mark(skill.skillId, skill.name, status)}
                  onRemove={() => remove(skill)}
                />
              )
            )}
          </ul>
        )}
      </div>
      <ErrorNote error={markSkill.error} className="mt-2" />
    </PageSection>
  );
}

function SkillRow({ skill, onChange, onRemove }: { skill: MySkill; onChange: (status: SkillStatus) => void; onRemove: () => void }) {
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
          onClick={onRemove}
          className="h-11 w-11 shrink-0 text-fg-muted hover:bg-bg-elevated hover:text-fg-default"
        >
          <X />
        </Button>
      </div>
    </li>
  );
}

/** How many suggestions are listed before "More". */
const SUGGESTED_SHOWN = 6;

/**
 * Skills of the person's goals and of the careers within reach that are not
 * on their list, each added with one tap on its mark (and taken off again
 * with another). The list holds still while it is being marked; "More" brings
 * the next ones. Nothing is shown when there is nothing to suggest.
 */
function SuggestedSkills({ mySkills, onMark }: { mySkills: MySkill[]; onMark: (skillId: string, name: string, mark: SkillMark) => void }) {
  const suggested = useSuggestedSkills();
  const [expanded, setExpanded] = useState(false);
  const list = suggested.data ?? [];
  if (list.length === 0) return null;

  const statusOf = new Map(mySkills.map((skill) => [skill.skillId, skill.status]));
  const shown = expanded ? list : list.slice(0, SUGGESTED_SHOWN);
  const marked = list.some((skill) => statusOf.has(skill.id));
  // Which career a skill is for is worth saying only when there is more than one.
  const severalCareers = new Set(list.map((skill) => skill.career)).size > 1 || list.some((skill) => skill.careers > 1);
  // More to show from this answer, or a fresh answer worth asking for.
  const hasMore = list.length > shown.length || marked;

  return (
    <div className="mt-4" data-suggested-skills>
      <h3 className="mb-2 text-sm font-medium text-fg-muted">Suggested</h3>
      <ul className={cn(cardClass, suggested.isPlaceholderData && 'opacity-60')}>
        {shown.map((skill) => (
          <li key={skill.id} className={cn(rowClass, 'flex items-center gap-1 py-0.5 pl-1 pr-4')}>
            <SkillHeldToggle value={statusOf.get(skill.id) ?? 'none'} label={skill.name} onChange={(mark) => onMark(skill.id, skill.name, mark)} />
            <Link
              to={`/skills/${skill.id}`}
              className="min-w-0 flex-1 break-words py-2 text-sm text-fg-default underline-offset-4 hover:underline"
            >
              {skill.name}
            </Link>
            {severalCareers && (
              <span className="hidden max-w-[45%] shrink-0 truncate pl-2 text-xs text-fg-muted xs:block">
                {skill.career}
                {skill.careers > 1 && ` and ${skill.careers - 1} more`}
              </span>
            )}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          aria-busy={suggested.isFetching}
          onClick={() => {
            if (list.length > shown.length) setExpanded(true);
            else if (!suggested.isFetching) {
              setExpanded(false);
              void suggested.refetch();
            }
          }}
          className={cn(textButtonClass, 'mt-3 px-1')}
        >
          More
        </button>
      )}
    </div>
  );
}

interface SkillSearchProps {
  mySkills: MySkill[];
  onAdd: (skillId: string, name: string, status: SkillStatus) => void;
  disabled: boolean;
}

/** Search the skills catalogue and add a result as learning or held. The box empties once one is added. */
function SkillSearch({ mySkills, onAdd, disabled }: SkillSearchProps) {
  const [term, setTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useDebouncedValue(term.trim());
  const results = useQuery({
    queryKey: ['picker', 'skills', query],
    queryFn: () => skillsApi.list({ search: query, limit: 8 }),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
  const showResults = term.trim().length >= 2 && query.length >= 2;
  const statusOf = (skillId: string) => mySkills.find((skill) => skill.skillId === skillId)?.status;

  const add = (skillId: string, name: string, status: SkillStatus) => {
    onAdd(skillId, name, status);
    // Ready for the next one, with the focus back in the box.
    setTerm('');
    inputRef.current?.focus();
  };

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
        <input
          ref={inputRef}
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
            onClick={() => {
              setTerm('');
              inputRef.current?.focus();
            }}
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted hover:text-fg-default"
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
                return (
                  <li key={skill.id} className={cn(rowClass, 'flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3')}>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="break-words text-sm font-medium text-fg-default">{skill.name}</p>
                      {skill.category && <p className="truncate text-xs text-fg-muted">{skill.category}</p>}
                    </div>
                    {status ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
                        <Check className="h-3.5 w-3.5" />
                        On your list
                      </span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => add(skill.id, skill.name, 'learning')}
                          aria-label={`Add ${skill.name} as learning`}
                          className={cn('h-9', outlineButtonClass)}
                        >
                          Learning
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => add(skill.id, skill.name, 'held')}
                          aria-label={`Add ${skill.name} as held`}
                          className="h-9"
                        >
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
// Applications
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
          None yet.{' '}
          <Link to="/jobs" className={linkClass}>
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
  const jobRef = useRef<HTMLAnchorElement>(null);
  const withdrawRef = useRef<HTMLButtonElement>(null);
  // Where the focus goes once the confirm step has closed: back to Withdraw
  // when the application was kept, to the job's name when it was withdrawn
  // (the buttons are gone by then).
  const focusAfter = useRef<'withdraw' | 'job' | null>(null);

  // If the company finishes it while the confirm step is open, drop the step.
  useEffect(() => {
    if (finished) setConfirming(false);
  }, [finished]);

  useEffect(() => {
    if (confirming || !focusAfter.current) return;
    (focusAfter.current === 'job' || finished ? jobRef : withdrawRef).current?.focus();
    focusAfter.current = null;
  }, [confirming, finished]);

  const keep = () => {
    if (update.isPending) return;
    focusAfter.current = 'withdraw';
    setConfirming(false);
  };

  const withdraw = () => {
    if (update.isPending) return;
    update.mutate(
      { applicationId: application.id, patch: { status: 'withdrawn' } },
      {
        onSuccess: () => (focusAfter.current = 'job'),
        onSettled: () => setConfirming(false),
      }
    );
  };

  return (
    <li className={cn(rowClass, 'p-4')} data-application={application.id}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            ref={jobRef}
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
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          onKeyDown={(event) => {
            // Escape leaves the application as it is.
            if (event.key === 'Escape' && confirming) keep();
          }}
        >
          {confirming ? (
            <>
              <span className="min-w-0 flex-1 basis-56 text-sm text-fg-muted" id={`withdraw-${application.id}`}>
                Withdraw this application? You can apply again while the job is open.
              </span>
              <div className="flex shrink-0 gap-2" role="group" aria-labelledby={`withdraw-${application.id}`}>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  aria-busy={update.isPending}
                  aria-disabled={update.isPending}
                  onClick={withdraw}
                  className={cn('h-9', busyButtonClass)}
                >
                  {update.isPending && <Loader2 className="animate-spin" />}
                  Yes, withdraw
                </Button>
                {/* Focus starts on the answer that changes nothing. */}
                <Button type="button" variant="outline" size="sm" autoFocus onClick={keep} className={cn('h-9', outlineButtonClass)}>
                  Keep it
                </Button>
              </div>
            </>
          ) : (
            <Button
              ref={withdrawRef}
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
