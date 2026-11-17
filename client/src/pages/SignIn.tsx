import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ApiError,
  inviteRoleLabel,
  safeNextPath,
  useAccount,
  useEmailOn,
  useForgotPassword,
  useInvite,
  usePasswordReset,
  useResetPassword,
  useSignIn,
  useSignOut,
  useSignUp,
} from '../lib/account';
import { ErrorNote, Field, LoadError, PageLoading, busyButtonClass, cardClass, fieldClass, textButtonClass } from '../components/account/parts';
import { PageContainer, PageHeader } from '../components/layout/Page';

type Mode = 'sign-in' | 'create';
/** What a new account is for. It only decides where the person lands. */
type Purpose = 'careers' | 'employer';

const MODES: { value: Mode; label: string }[] = [
  { value: 'sign-in', label: 'Sign in' },
  { value: 'create', label: 'Create account' },
];

const PURPOSES: { value: Purpose; label: string; detail: string }[] = [
  { value: 'careers', label: 'Find a career', detail: 'Explore careers, track skills, apply.' },
  { value: 'employer', label: 'Hire', detail: 'Post jobs, review applicants.' },
];

/**
 * One page for both signing in and creating an account. A new account says
 * what it is for (`?as=employer`), which is the only extra question asked.
 *
 * Where the person lands: an employer goes to the employer page; otherwise
 * `?next=` when it is a path on this site; otherwise the map, to start
 * exploring.
 *
 * An invite link (`?invite=<token>`) opens on Create account with the invited
 * email fixed and no purpose question: the invite already says what the
 * account is. An invited employer lands on the employer page, an invited
 * admin on Admin Tools. A link that is unknown, used or expired says so and
 * leaves the normal form.
 *
 * A password reset link (`?reset=<token>`) opens on one field, the new
 * password, for the person the link was made for. Saving it signs them in and
 * they land where a sign-in would. An unusable link says so and leaves the
 * normal form.
 *
 * When the app can send mail, "Forgot password?" under the form opens one
 * field, the email address, and sends that link. The answer is the same
 * whether or not the address has an account. When it cannot, the line says
 * that an admin makes the link.
 */
export default function SignIn() {
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || null;
  const inviteQuery = useInvite(inviteToken);
  const invite = inviteQuery.data ?? null;
  const resetToken = searchParams.get('reset') || null;
  const resetQuery = usePasswordReset(resetToken);
  const resetPassword = useResetPassword();
  const resetPending = Boolean(resetToken) && resetQuery.isPending;
  // Until the new password is saved. Afterwards the person is signed in and is sent on like anyone else.
  const resetting = resetQuery.data && !resetPassword.isSuccess ? resetQuery.data : null;
  const requestedMode = searchParams.get('mode');
  // An invite is for a new account, so its link opens on Create account.
  const mode: Mode = requestedMode === 'create' || (invite && requestedMode !== 'sign-in') ? 'create' : 'sign-in';
  const invited = mode === 'create' ? invite : null;
  const next = safeNextPath(searchParams.get('next'));
  // Arriving from the employer page says what the account is for.
  const purpose: Purpose =
    searchParams.get('as') === 'employer' || (searchParams.get('as') === null && next?.startsWith('/employer'))
      ? 'employer'
      : 'careers';

  const account = useAccount();
  const signIn = useSignIn();
  const signUp = useSignUp();
  const emailOn = useEmailOn();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgetting, setForgetting] = useState(false);

  const active = mode === 'create' ? signUp : signIn;
  const busy = signIn.isPending || signUp.isPending;

  // Signed in (already, or a moment ago through this form): carry on to where they were headed.
  // A usable reset link comes first, whoever is signed in here: its owner may still have a
  // session on this device and cannot change a password they have forgotten.
  if (account.data?.user && !resetPending && !resetting) {
    // An invite for another address, opened while someone is signed in here: say whose it is
    // rather than sending them on unexplained. It grants this account nothing.
    if (invite && invite.email !== account.data.user.email) {
      return <InviteForAnother inviteEmail={invite.email} signedInAs={account.data.user.email} />;
    }
    // The account decides, not the link: an invite link opened by someone else's session grants nothing.
    if (invited?.role === 'admin' && account.data.user.isAdmin) return <Navigate to="/admin" replace />;
    const hiring =
      (invited ? invited.role === 'employer' && account.data.isEmployer : mode === 'create' && purpose === 'employer') ||
      (!next && account.data.isEmployer);
    return <Navigate to={hiring ? '/employer' : (next ?? '/map')} replace />;
  }
  if (!account.data || (inviteToken && inviteQuery.isPending) || resetPending) {
    if (account.error) {
      return (
        <PageContainer size="narrow">
          <LoadError error={account.error} onRetry={() => void account.refetch()} retrying={account.isFetching} />
        </PageContainer>
      );
    }
    return <PageLoading label="Checking who is signed in" />;
  }

  if (resetting && resetToken) {
    return (
      <ChoosePassword
        email={resetting.email}
        busy={resetPassword.isPending}
        error={resetPassword.error}
        onSubmit={(newPassword) => resetPassword.mutate({ token: resetToken, password: newPassword })}
      />
    );
  }

  if (forgetting && emailOn) return <ForgotPassword initialEmail={email} onBack={() => setForgetting(false)} />;

  const switchMode = (nextMode: Mode) => {
    if (nextMode === mode) return;
    signIn.reset();
    signUp.reset();
    const params = new URLSearchParams(searchParams);
    if (nextMode === 'create') params.set('mode', 'create');
    // With an invite the page opens on Create account, so signing in has to be asked for.
    else if (invite) params.set('mode', 'sign-in');
    else params.delete('mode');
    setSearchParams(params, { replace: true });
  };

  const setPurpose = (value: Purpose) => {
    const params = new URLSearchParams(searchParams);
    params.set('as', value);
    setSearchParams(params, { replace: true });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (invited && inviteToken) signUp.mutate({ name, email: invited.email, password, invite: inviteToken });
    else if (mode === 'create') signUp.mutate({ name, email, password });
    else signIn.mutate({ email, password });
  };

  return (
    <PageContainer size="narrow">
      <div className="mx-auto w-full max-w-md">
        <PageHeader
          title={mode === 'create' ? 'Create account' : 'Sign in'}
        />

        <div className={cn(cardClass, 'p-4 sm:p-6')}>
          <div role="tablist" aria-label="Sign in or create an account" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-bg-elevated p-1">
            {MODES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => switchMode(value)}
                className={cn(
                  'h-9 rounded-md text-sm font-medium transition-colors',
                  mode === value ? 'bg-bg-surface text-fg-default' : 'text-fg-muted hover:text-fg-default'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} noValidate className="space-y-4">
            {resetToken && resetQuery.isError && (
              <p role="status" className="text-sm text-fg-muted" data-reset-problem>
                {resetQuery.error instanceof ApiError && resetQuery.error.status === 404
                  ? 'Reset link not valid or expired.'
                  : 'Reset link could not be checked.'}
              </p>
            )}
            {inviteToken && inviteQuery.isError && (
              <p role="status" className="text-sm text-fg-muted" data-invite-problem>
                {inviteQuery.error instanceof ApiError && inviteQuery.error.status === 404
                  ? inviteProblem(inviteQuery.error)
                  : 'Invite could not be checked.'}
              </p>
            )}
            {invited && (
              <p className="text-sm text-fg-muted" data-invite-grant>
                Invited as {inviteRoleLabel(invited.role, invited.companyName)}
                {invited.invitedBy ? ` by ${invited.invitedBy}` : ''}
              </p>
            )}
            {mode === 'create' && !invited && (
              <div role="radiogroup" aria-label="Account purpose" className="grid grid-cols-2 gap-2">
                {PURPOSES.map(({ value, label, detail }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={purpose === value}
                    onClick={() => setPurpose(value)}
                    className={cn(
                      'min-w-0 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      purpose === value
                        ? 'border-fg-default bg-bg-elevated'
                        : 'border-border-subtle hover:border-border-strong'
                    )}
                  >
                    <span className={cn('block text-sm font-medium', purpose === value ? 'text-fg-default' : 'text-fg-muted')}>
                      {label}
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-muted">{detail}</span>
                  </button>
                ))}
              </div>
            )}
            {mode === 'create' && (
              <Field label="Name" htmlFor="sign-name">
                <input
                  id="sign-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
                />
              </Field>
            )}
            <Field label="Email" htmlFor="sign-email">
              <input
                id="sign-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                readOnly={Boolean(invited)}
                aria-readonly={invited ? true : undefined}
                value={invited ? invited.email : email}
                onChange={(e) => setEmail(e.target.value)}
                className={cn(fieldClass, invited && 'cursor-default text-fg-muted')}
              />
            </Field>
            <Field label="Password" htmlFor="sign-password" hint={mode === 'create' ? 'At least 8 characters.' : undefined}>
              <input
                id="sign-password"
                name="password"
                type="password"
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                maxLength={200}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
              />
            </Field>

            <ErrorNote error={active.error} />

            <Button type="submit" disabled={busy} className="h-11 w-full rounded-lg text-sm">
              {busy && <Loader2 className="animate-spin" />}
              {mode === 'create' ? 'Create account' : 'Sign in'}
            </Button>
          </form>
        </div>

        {mode === 'sign-in' &&
          (emailOn ? (
            <p className="mt-4 text-center" data-forgot-password>
              <button
                type="button"
                onClick={() => {
                  signIn.reset();
                  setForgetting(true);
                }}
                className={textButtonClass}
              >
                Forgot password?
              </button>
            </p>
          ) : (
            <p className="mt-4 text-center text-sm text-fg-muted" data-forgot-password>
              {/* Two lines on a phone, so the break falls between the sentences. */}
              <span className="block sm:inline">Forgot your password?</span> An admin can give you a reset link.
            </p>
          ))}
      </div>
    </PageContainer>
  );
}

/**
 * "Forgot password?": one field. What it says afterwards is the same for
 * every address, so it never tells whether an address has an account.
 */
function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState(initialEmail);
  const [problem, setProblem] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (forgot.isPending) return;
    forgot.reset();
    if (!email.trim()) {
      setProblem('Enter your email address.');
      fieldRef.current?.focus();
      return;
    }
    setProblem(null);
    forgot.mutate(email.trim(), { onError: () => fieldRef.current?.focus() });
  };

  return (
    <PageContainer size="narrow">
      <div className="mx-auto w-full max-w-md">
        <PageHeader title="Reset password" />
        {forgot.isSuccess ? (
          <div className={cn(cardClass, 'p-4 sm:p-6')} role="status" data-forgot-sent>
            <p className="text-sm text-fg-default">If that address has an account, a reset link is on its way.</p>
            <p className="mt-1.5 break-all text-sm text-fg-muted">{forgot.variables}</p>
            <p className="mt-1.5 text-sm text-fg-muted">The link works once and lasts 24 hours.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className={cn(cardClass, 'space-y-4 p-4 sm:p-6')} data-forgot-form>
            <Field label="Email" htmlFor="forgot-email">
              <input
                ref={fieldRef}
                id="forgot-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                aria-invalid={problem || forgot.error ? true : undefined}
                aria-describedby={problem || forgot.error ? 'forgot-problem' : undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
              />
              <div id="forgot-problem">
                <ErrorNote error={problem ?? forgot.error} className="mt-2" />
              </div>
            </Field>
            <Button
              type="submit"
              aria-busy={forgot.isPending}
              aria-disabled={forgot.isPending}
              className={cn('h-11 w-full rounded-lg text-sm', busyButtonClass)}
            >
              {forgot.isPending && <Loader2 className="animate-spin" />}
              Send reset link
            </Button>
          </form>
        )}
        <p className="mt-4 text-center">
          <button type="button" onClick={onBack} className={textButtonClass}>
            Back to sign in
          </button>
        </p>
      </div>
    </PageContainer>
  );
}

interface ChoosePasswordProps {
  email: string;
  busy: boolean;
  error: unknown;
  onSubmit: (password: string) => void;
}

/** What a password reset link opens: whose password it is, and one field. */
function ChoosePassword({ email, busy, error, onSubmit }: ChoosePasswordProps) {
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) onSubmit(password);
  };

  return (
    <PageContainer size="narrow">
      <div className="mx-auto w-full max-w-md">
        <PageHeader title="Choose a new password" description={email} />
        <form onSubmit={submit} noValidate className={cn(cardClass, 'space-y-4 p-4 sm:p-6')} data-reset-form>
          {/* Not shown: it tells a password manager which account the new password belongs to. */}
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <Field label="New password" htmlFor="reset-password" hint="At least 8 characters.">
            <input
              id="reset-password"
              name="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <ErrorNote error={error} />
          <Button type="submit" disabled={busy} className="h-11 w-full rounded-lg text-sm">
            {busy && <Loader2 className="animate-spin" />}
            Save password
          </Button>
        </form>
      </div>
    </PageContainer>
  );
}

/** Why an invite link cannot be used, as the server told it: used, expired, or not one of ours. */
function inviteProblem(error: ApiError): string {
  const reason = (error.payload as { reason?: unknown } | null)?.reason;
  if (reason === 'used') return 'This invite has been used. Sign in with the account it made.';
  if (reason === 'expired') return 'This invite has expired. Ask an admin for a new one.';
  return 'This invite link is not valid. It may have been replaced or withdrawn: ask an admin for a new one.';
}

/** An invite for one address, opened while another account is signed in on this device. */
function InviteForAnother({ inviteEmail, signedInAs }: { inviteEmail: string; signedInAs: string }) {
  const signOut = useSignOut();
  return (
    <PageContainer size="narrow">
      <div className="mx-auto w-full max-w-md">
        <PageHeader title="Invite" />
        <div className={cn(cardClass, 'space-y-4 p-4 sm:p-6')} data-invite-other>
          <p className="break-words text-sm text-fg-muted">
            This invite is for <span className="font-medium text-fg-default">{inviteEmail}</span>. You are signed in as{' '}
            <span className="font-medium text-fg-default">{signedInAs}</span>.
          </p>
          <ErrorNote error={signOut.error} />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              aria-disabled={signOut.isPending}
              aria-busy={signOut.isPending}
              onClick={() => {
                if (!signOut.isPending) signOut.mutate();
              }}
              className={cn('h-10', busyButtonClass)}
            >
              Sign out to use it
            </Button>
            <Link to="/map" className="text-sm font-medium text-fg-muted underline underline-offset-4 hover:text-fg-default">
              Stay signed in
            </Link>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
