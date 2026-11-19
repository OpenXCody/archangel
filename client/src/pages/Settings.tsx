import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, labelClass, optionDetailClass, optionTileClass, optionTitleClass } from '@/lib/utils';
import {
  useChangeEmail,
  justLeft,
  signInPath,
  useAccount,
  useChangePassword,
  useDeleteAccount,
  useEmailOn,
  useUpdateProfile,
  type AccountUser,
  type Purpose,
  type SignedInAccount,
} from '../lib/account';
import { ApiError } from '../lib/http';
import { onGroupArrowKeys } from '../lib/roving';
import { setTheme, useTheme, type Theme } from '../lib/theme';
import { VIEW_AS, setViewAs, useViewer, type ViewAs } from '../lib/viewer';
import {
  AccountGate,
  ErrorNote,
  Field,
  busyButtonClass,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
  textButtonClass,
} from '../components/account/parts';
import { PageContainer, PageHeader, PageSection } from '../components/layout/Page';
import { EMAIL_RE } from '../lib/validation';

export default function Settings() {
  const { data } = useAccount();
  // How the app looks is kept in the browser, not on an account: it is offered to a visitor too.
  if (data && !data.user) return justLeft(data) ? <Navigate to="/map" replace /> : <VisitorSettings />;
  return <AccountGate>{(account) => <SettingsPage account={account} />}</AccountGate>;
}

/** Settings with nobody signed in: the one setting that needs no account, then the way to the rest. */
function VisitorSettings() {
  return (
    <PageContainer size="narrow">
      <PageHeader title="Settings" />
      <AppearanceSection />
      <PageSection title="Account" description="Your name, sign-in and what the account is for are here once you are signed in.">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3" data-settings-sign-in>
          <Button asChild className="h-10 rounded-lg px-5">
            <Link to={signInPath('/settings')}>Sign in</Link>
          </Button>
          <Link to={signInPath('/settings', 'create')} className={textButtonClass}>
            Create an account
          </Link>
        </div>
      </PageSection>
    </PageContainer>
  );
}

/**
 * Everything about the account itself, in one place: the name a company sees,
 * how the person signs in, what they are emailed, how the app looks, what the
 * account is for, and its deletion. A person's own work (goals, skills,
 * applications; companies, jobs, applicants) lives on their own pages.
 *
 * An admin also chooses here how to see the product ("View as"). The page
 * itself is the same in every view, so the way back is always here.
 */
function SettingsPage({ account }: { account: SignedInAccount }) {
  const { user } = account;
  return (
    <PageContainer size="narrow">
      <PageHeader title="Settings" />
      <ProfileSection user={user} />
      <SignInSection account={account} />
      <NoticeSection user={user} />
      <AppearanceSection />
      <PurposeSection user={user} />
      {user.isAdmin && <ViewAsSection user={user} />}
      <DeleteSection account={account} />
    </PageContainer>
  );
}

function Done({ children }: { children: ReactNode }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm text-text-1">
      <Check className="h-4 w-4 shrink-0" />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Name and ZIP code
// ---------------------------------------------------------------------------

function ProfileSection({ user }: { user: AccountUser }) {
  const update = useUpdateProfile();
  const { seeker } = useViewer();
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
    <PageSection
      title="Account"
      // A ZIP code is for finding work near home: someone here to hire is not asked for one.
      description={seeker ? 'Name, email and ZIP code are shown to a company on application.' : undefined}
    >
      <form onSubmit={submit} noValidate className={cn(cardClass, 'space-y-4')} data-profile-form>
        <div className={cn('grid grid-cols-1 gap-4', seeker && 'sm:grid-cols-[minmax(0,1fr)_160px]')}>
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
          {seeker && (
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
          )}
        </div>
        <ErrorNote error={update.error} />
        <div className="flex flex-wrap items-center gap-3">
          {/* Marked, never disabled: with nothing changed or while it saves, the button keeps the focus. */}
          <Button
            type="submit"
            aria-busy={update.isPending}
            aria-disabled={!dirty || update.isPending}
            className={cn('h-10 rounded-lg', busyButtonClass)}
          >
            {update.isPending && <Loader2 className="animate-spin" />}
            Save
          </Button>
          {update.isSuccess && !dirty && <Done>Saved</Done>}
        </div>
      </form>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Signing in: email and password
// ---------------------------------------------------------------------------

type SignInAction = 'email' | 'password';

/**
 * How the person signs in: the address, and the password. Each is one row
 * with "Change" at its end, opening only what it needs in the row's place.
 * Both changes are confirmed by the current password.
 */
function SignInSection({ account }: { account: SignedInAccount }) {
  const [open, setOpen] = useState<SignInAction | null>(null);
  const [done, setDone] = useState<SignInAction | null>(null);
  const triggers = useRef<Partial<Record<SignInAction, HTMLButtonElement | null>>>({});

  // A form that closes hands the focus back to the button that opened it.
  const close = (action: SignInAction, changed: boolean) => {
    setOpen(null);
    setDone(changed ? action : null);
    window.setTimeout(() => triggers.current[action]?.focus(), 0);
  };
  const row = (action: SignInAction, label: string, value: ReactNode, changed: string) => (
    <li className={cn(rowClass, 'flex items-center gap-3 py-3')}>
      <div className="min-w-0 flex-1">
        <p className={labelClass}>{label}</p>
        <p className="mt-1 break-all text-sm text-text-1">{value}</p>
        {done === action && (
          <p className="mt-1">
            <Done>{changed}</Done>
          </p>
        )}
      </div>
      <button
        type="button"
        ref={(element) => {
          triggers.current[action] = element;
        }}
        aria-label={`Change ${label.toLowerCase()}`}
        onClick={() => {
          setDone(null);
          setOpen(action);
        }}
        className={cn(textButtonClass, 'shrink-0 py-2')}
      >
        Change
      </button>
    </li>
  );

  return (
    <PageSection title="Sign-in">
      <ul className={cardClass} data-account-actions>
        {open === 'email' ? (
          <li className={rowClass}>
            <EmailChange email={account.user.email} onClose={(changed) => close('email', changed)} />
          </li>
        ) : (
          row('email', 'Email', account.user.email, 'Email changed.')
        )}
        {open === 'password' ? (
          <li className={rowClass}>
            <PasswordChange email={account.user.email} onClose={(changed) => close('password', changed)} />
          </li>
        ) : (
          row('password', 'Password', <span aria-hidden="true">••••••••</span>, 'Password changed.')
        )}
      </ul>
    </PageSection>
  );
}

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
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        // Escape leaves the address as it is, as Cancel does.
        if (event.key === 'Escape' && !change.isPending) onClose(false);
      }}
      noValidate
      className="space-y-4 py-4"
      data-email-form
    >
      <p className="break-all text-sm text-text-2">
        Now <span className="text-text-1">{email}</span>. Your other devices are signed out by the change.
      </p>
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
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        // Escape leaves the password as it is, as Cancel does.
        if (event.key === 'Escape' && !change.isPending) onClose(false);
      }}
      noValidate
      className="space-y-4 py-4"
      data-password-form
    >
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

// ---------------------------------------------------------------------------
// Email notices
// ---------------------------------------------------------------------------

/**
 * Emails about applications and company access, on or off. Only there when
 * the app can send mail. Sign-in emails (a reset link) are not affected.
 */
function NoticeSection({ user }: { user: AccountUser }) {
  const emailOn = useEmailOn();
  const update = useUpdateProfile();
  if (!emailOn) return null;
  // While saving, show what was chosen; if it fails, fall back to what is stored.
  const checked = update.isPending ? update.variables?.emailNotices === true : user.emailNotices;

  return (
    <PageSection title="Email notices">
      <div className={cn(cardClass, 'py-3')} data-email-notices>
        <div className="flex items-center gap-4">
          <label htmlFor="email-notices" className="min-w-0 flex-1 cursor-pointer">
            <span className="block text-sm text-text-1">Email me about applications and access</span>
            <span className="mt-0.5 block text-xs text-text-3">Sign-in emails are always sent.</span>
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
            className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-inverse-bg' : 'bg-line-strong')}
          >
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-bg transition-transform',
                checked && 'translate-x-5'
              )}
            />
          </button>
        </div>
        <ErrorNote error={update.error} className="mt-2" />
      </div>
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Choices: theme, what the account is for, view as
// ---------------------------------------------------------------------------

interface Choice<T extends string> {
  value: T;
  label: string;
  detail?: string;
}

interface ChoiceGroupProps<T extends string> {
  /** Names the group for screen readers. */
  label: string;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The choice being saved, if one is. It is marked busy; nothing is disabled. */
  saving?: T | null;
  name: string;
}

/**
 * One choice of a few, each a button that says what it means. A radio group:
 * Tab reaches it once, arrow keys move between the choices. Three choices sit
 * side by side even on a phone, where they are named and not described.
 */
function ChoiceGroup<T extends string>({ label, choices, value, onChange, saving, name }: ChoiceGroupProps<T>) {
  const choose = (next: T) => {
    if (!saving && next !== value) onChange(next);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-choice={name}
      onKeyDown={(event) => onGroupArrowKeys(event, choices.map((choice) => choice.value), value, choose)}
      className={cn('grid gap-2', choices.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}
    >
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-busy={saving === choice.value || undefined}
            tabIndex={selected ? 0 : -1}
            data-value={choice.value}
            onClick={() => choose(choice.value)}
            className={cn(
              'flex min-h-11 min-w-0 items-start gap-2 px-3 py-2.5',
              optionTileClass(selected)
            )}
          >
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm font-medium', optionTitleClass(selected))}>{choice.label}</span>
              {choice.detail && (
                <span className={cn('mt-0.5 text-xs', optionDetailClass(selected), choices.length === 2 ? 'block' : 'hidden sm:block')}>{choice.detail}</span>
              )}
            </span>
            {saving === choice.value && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-text-2" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

const THEMES: Choice<Theme>[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

/** Dark or light, kept in this browser. */
function AppearanceSection() {
  const theme = useTheme();
  return (
    <PageSection title="Appearance">
      <ChoiceGroup label="Theme" name="theme" choices={THEMES} value={theme} onChange={setTheme} />
    </PageSection>
  );
}

const PURPOSES: Choice<Purpose>[] = [
  // The words a new account is asked the same question in.
  { value: 'work', label: 'Find a career', detail: 'Explore careers, track skills, apply.' },
  { value: 'hire', label: 'Hire', detail: 'Post jobs, review applicants.' },
];

/**
 * What the account is for. It decides which tools the app puts in front of
 * the person, and nothing else: changing it removes nothing, and changing it
 * back brings the other tools back as they were.
 */
function PurposeSection({ user }: { user: AccountUser }) {
  const update = useUpdateProfile();
  const { viewingAs } = useViewer();
  const saving = update.isPending ? (update.variables?.purpose ?? null) : null;
  // Said only after a change made here, with where the other tools are.
  const changed = update.isSuccess && update.variables?.purpose === user.purpose;

  return (
    <PageSection title="This account is for" description="Decides which tools you see. Nothing is removed by changing it.">
      <ChoiceGroup
        label="This account is for"
        name="purpose"
        choices={PURPOSES}
        value={saving ?? user.purpose}
        saving={saving}
        onChange={(purpose) => update.mutate({ purpose })}
      />
      <ErrorNote error={update.error} className="mt-2" />
      {changed && !viewingAs && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1" data-purpose-changed>
          <Done>Saved</Done>
          <Link to={user.purpose === 'hire' ? '/employer' : '/me'} className={textButtonClass}>
            {user.purpose === 'hire' ? 'Your jobs' : 'Profile'}
          </Link>
        </p>
      )}
    </PageSection>
  );
}

const VIEW_LABEL: Record<ViewAs, Choice<ViewAs>> = {
  admin: { value: 'admin', label: 'Admin', detail: 'Your own view.' },
  // Each view is one of the two kinds of account, in the words that describe it above.
  employer: { value: 'employer', label: 'Employer', detail: PURPOSES[1].detail },
  user: { value: 'user', label: 'User', detail: PURPOSES[0].detail },
};

/**
 * For an admin: see the product as a user or an employer does. Kept in this
 * browser; only what is drawn changes. The account, what it may do and what
 * the server answers stay exactly as they are.
 */
function ViewAsSection({ user }: { user: AccountUser }) {
  const { viewingAs } = useViewer();
  return (
    <PageSection title="View as" description="See the app as someone else does, in this browser. What you can do stays the same.">
      <ChoiceGroup
        label="View as"
        name="view-as"
        choices={VIEW_AS.map((view) => VIEW_LABEL[view])}
        value={viewingAs ?? 'admin'}
        onChange={(view) => setViewAs(user.id, view)}
      />
    </PageSection>
  );
}

// ---------------------------------------------------------------------------
// Delete the account
// ---------------------------------------------------------------------------

/**
 * Deleting the account: the one step here that cannot be taken back, so it
 * says what goes and asks for the password. Escape and Cancel leave
 * everything as it was. Afterwards nobody is signed in and the map opens.
 */
function DeleteSection({ account }: { account: SignedInAccount }) {
  const remove = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const companies = account.memberships.filter((membership) => membership.status === 'active').map((membership) => membership.companyName);

  const cancel = () => {
    if (remove.isPending) return;
    remove.reset();
    setPassword('');
    setProblem(null);
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
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
    <section className="mt-10 border-t border-line pt-6">
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={textButtonClass} data-delete-trigger>
        Delete account
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) cancel();
        }}
      >
        <DialogContent
          role="alertdialog"
          className="w-[calc(100%-2rem)] max-w-md gap-5 rounded-xl border-line-strong bg-bg p-5 text-text-1 sm:rounded-xl [&>button]:hidden"
        >
          <form onSubmit={submit} noValidate className="grid gap-5" data-delete-account>
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-base font-semibold leading-snug">Delete your account?</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 break-words text-sm text-text-2">
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
    </section>
  );
}
