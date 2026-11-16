import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { safeNextPath, useAccount, useSignIn, useSignUp } from '../lib/account';
import { ErrorNote, Field, LoadError, PageLoading, cardClass, fieldClass } from '../components/account/parts';
import { PageContainer, PageHeader } from '../components/layout/Page';

type Mode = 'sign-in' | 'create';

const MODES: { value: Mode; label: string }[] = [
  { value: 'sign-in', label: 'Sign in' },
  { value: 'create', label: 'Create account' },
];

/**
 * One page for both signing in and creating an account. On success the person
 * goes to `?next=` when it is a path on this site, otherwise to their page.
 */
export default function SignIn() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: Mode = searchParams.get('mode') === 'create' ? 'create' : 'sign-in';
  const next = safeNextPath(searchParams.get('next')) ?? '/me';

  const account = useAccount();
  const signIn = useSignIn();
  const signUp = useSignUp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const active = mode === 'create' ? signUp : signIn;
  const busy = signIn.isPending || signUp.isPending;

  // Signed in (already, or a moment ago through this form): carry on to where they were headed.
  if (account.data?.user) return <Navigate to={next} replace />;
  if (!account.data) {
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
    else params.delete('mode');
    setSearchParams(params, { replace: true });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (mode === 'create') signUp.mutate({ name, email, password });
    else signIn.mutate({ email, password });
  };

  return (
    <PageContainer size="narrow">
      <div className="mx-auto w-full max-w-md">
        <PageHeader
          title={mode === 'create' ? 'Create your account' : 'Sign in'}
          description={
            mode === 'create'
              ? 'Keep track of your skills, aim for a career and apply to jobs.'
              : 'Pick up where you left off: your skills, careers and applications.'
          }
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
            {mode === 'create' && (
              <Field label="Your name" htmlFor="sign-name">
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
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

        <p className="mt-4 text-center text-sm text-fg-muted">
          {mode === 'create' ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'create' ? 'sign-in' : 'create')}
            className="font-medium text-fg-default underline underline-offset-4 hover:no-underline"
          >
            {mode === 'create' ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>
    </PageContainer>
  );
}
