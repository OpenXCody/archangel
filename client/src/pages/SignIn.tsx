import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiError, inviteRoleLabel, safeNextPath, useAccount, useInvite, useSignIn, useSignUp } from '../lib/account';
import { ErrorNote, Field, LoadError, PageLoading, cardClass, fieldClass } from '../components/account/parts';
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
 */
export default function SignIn() {
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || null;
  const inviteQuery = useInvite(inviteToken);
  const invite = inviteQuery.data ?? null;
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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const active = mode === 'create' ? signUp : signIn;
  const busy = signIn.isPending || signUp.isPending;

  // Signed in (already, or a moment ago through this form): carry on to where they were headed.
  if (account.data?.user) {
    // The account decides, not the link: an invite link opened by someone else's session grants nothing.
    if (invited?.role === 'admin' && account.data.user.isAdmin) return <Navigate to="/admin" replace />;
    const hiring =
      (invited ? invited.role === 'employer' && account.data.isEmployer : mode === 'create' && purpose === 'employer') ||
      (!next && account.data.isEmployer);
    return <Navigate to={hiring ? '/employer' : (next ?? '/map')} replace />;
  }
  if (!account.data || (inviteToken && inviteQuery.isPending)) {
    if (account.error) {
      return (
        <PageContainer size="narrow">
          <LoadError error={account.error} onRetry={() => void account.refetch()} retrying={account.isFetching} />
        </PageContainer>
      );
    }
    return <PageLoading label="Checking who is signed in" />;
  }

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
            {inviteToken && inviteQuery.isError && (
              <p role="status" className="text-sm text-fg-muted" data-invite-problem>
                {inviteQuery.error instanceof ApiError && inviteQuery.error.status === 404
                  ? 'Invite link not valid or expired.'
                  : 'Invite could not be checked.'}
              </p>
            )}
            {invited && (
              <p className="text-sm text-fg-muted" data-invite-grant>
                Invited as {inviteRoleLabel(invited.role, invited.companyName)}
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

      </div>
    </PageContainer>
  );
}
