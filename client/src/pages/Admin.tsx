import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Database, KeyRound, Loader2, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getAdminSecret, setAdminSecret } from '../lib/api';
import {
  signInPath,
  useAccount,
  useAdminMemberships,
  useAdminOverview,
  useAdminUsers,
  useClaimAdmin,
  useDecideMembership,
  type AccountUser,
  type AdminMembership,
  type AdminUser,
  type MembershipDecision,
} from '../lib/account';
import { formatAgo, formatDate } from '../lib/jobFormat';
import {
  CardNote,
  ENTITY,
  ErrorNote,
  Field,
  LoadError,
  PageLoading,
  RowsSkeleton,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
} from '../components/account/parts';
import { EmptyState, PageContainer, PageHeader, PageSection } from '../components/layout/Page';

export default function Admin() {
  const account = useAccount();

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

  const user = account.data.user;
  if (!user) {
    return (
      <PageContainer size="narrow">
        <EmptyState
          icon={ShieldAlert}
          title="Admins only"
          description="This page is for the people who run Archangel. Sign in with an admin account to open it."
          action={
            <Button asChild className="h-10 rounded-lg">
              <Link to={signInPath('/admin')}>Sign in</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }
  if (!user.isAdmin) return <NotAuthorized user={user} />;
  return <AdminDashboard />;
}

// ---------------------------------------------------------------------------
// Signed in, not an admin
// ---------------------------------------------------------------------------

function NotAuthorized({ user }: { user: AccountUser }) {
  const claim = useClaimAdmin();
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // The same key the Data import page keeps in this browser, if it was entered there.
  const savedKey = getAdminSecret();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (claim.isPending) return;
    claim.reset();
    const key = draft.trim() || savedKey;
    if (!key) return setProblem('Enter the admin key.');
    setProblem(null);
    claim.mutate(key, {
      // Keep the key for the import pipeline only once the server has accepted it.
      onSuccess: () => setAdminSecret(key),
    });
  };

  return (
    <PageContainer size="narrow">
      <EmptyState
        className="pb-8 sm:pb-10"
        icon={ShieldAlert}
        title="You are not an admin"
        description={`You are signed in as ${user.email}. This page is only for admins, so there is nothing to show here.`}
        action={
          <Button asChild variant="outline" className={cn('h-10 rounded-lg', outlineButtonClass)}>
            <Link to="/me">Go to my page</Link>
          </Button>
        }
      />

      <div className={cn(cardClass, 'mx-auto max-w-md p-4 sm:p-6')}>
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-elevated">
            <KeyRound className="h-5 w-5 text-fg-muted" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg-default">Become admin</h2>
            <p className="text-sm text-fg-muted">If you run this deployment, enter its admin key to make this account an admin.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field
            label="Admin key"
            htmlFor="admin-key"
            hint={savedKey ? 'A key is already saved in this browser. Leave this empty to use it.' : undefined}
          >
            <input
              id="admin-key"
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <ErrorNote error={problem ?? claim.error} />
          <Button type="submit" disabled={claim.isPending} className="h-10 w-full rounded-lg">
            {claim.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Become admin
          </Button>
        </form>
      </div>
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// The admin's page
// ---------------------------------------------------------------------------

function AdminDashboard() {
  return (
    <PageContainer>
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Admin"
        title="Admin"
        description="People, requests to join companies, and the data behind the map."
      />
      <OverviewSection />
      <RequestsSection />
      <UsersSection />
      <PageSection title="Data">
        <Link
          to="/import"
          className={cn(cardClass, 'flex items-center gap-3 p-4 transition-colors hover:border-border-strong hover:bg-bg-elevated')}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-elevated">
            <Database className="h-5 w-5 text-fg-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg-default">Data import</p>
            <p className="text-sm text-fg-muted">Add or update companies, factories, careers and skills.</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
        </Link>
      </PageSection>
    </PageContainer>
  );
}

function OverviewSection() {
  const overview = useAdminOverview();
  const tiles: { label: string; value: number | undefined; highlight?: boolean }[] = [
    { label: 'People', value: overview.data?.users },
    { label: 'Requests waiting', value: overview.data?.pendingMemberships, highlight: (overview.data?.pendingMemberships ?? 0) > 0 },
    { label: 'Open jobs', value: overview.data?.openJobs },
    { label: 'Applications', value: overview.data?.applications },
  ];
  return (
    <PageSection title="Overview">
      {overview.isError ? (
        <LoadError error={overview.error} onRetry={() => void overview.refetch()} retrying={overview.isFetching} />
      ) : (
        <dl className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className={cn(cardClass, 'min-w-0 p-4', tile.highlight && 'border-amber-500/30')}>
              <dt className="truncate text-sm text-fg-muted">{tile.label}</dt>
              <dd className={cn('mt-1 text-2xl font-semibold tabular-nums', tile.highlight ? 'text-amber-400' : 'text-fg-default')}>
                {tile.value === undefined ? <Skeleton className="h-8 w-12" /> : tile.value.toLocaleString('en-US')}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </PageSection>
  );
}

function RequestsSection() {
  const requests = useAdminMemberships('requested');
  const decide = useDecideMembership();
  const CompanyIcon = ENTITY.company.icon;

  const isBusy = (request: AdminMembership, decision: MembershipDecision) =>
    decide.isPending &&
    decide.variables?.companyId === request.companyId &&
    decide.variables?.userId === request.userId &&
    decide.variables?.decision === decision;

  return (
    <PageSection title="Requests to join a company" description="Approving lets the person post jobs for that company and read its applicants.">
      {requests.isPending ? (
        <RowsSkeleton rows={2} />
      ) : requests.isError ? (
        <LoadError error={requests.error} onRetry={() => void requests.refetch()} retrying={requests.isFetching} />
      ) : requests.data.length === 0 ? (
        <CardNote>No requests are waiting.</CardNote>
      ) : (
        <ul className={cardClass}>
          {requests.data.map((request) => (
            <li
              key={`${request.companyId}:${request.userId}`}
              className={cn(rowClass, 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4')}
              data-request-email={request.userEmail}
            >
              <div className="min-w-0 flex-1 basis-64">
                <p className="break-words text-sm font-medium text-fg-default">{request.userName}</p>
                <p className="break-all text-sm text-fg-muted">{request.userEmail}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
                  <CompanyIcon className={cn('h-4 w-4 shrink-0', ENTITY.company.text)} />
                  <span className="min-w-0 break-words">
                    wants to join{' '}
                    <Link to={`/companies/${request.companyId}`} className="font-medium text-fg-default underline-offset-4 hover:underline">
                      {request.companyName}
                    </Link>
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">Asked {formatAgo(request.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ companyId: request.companyId, userId: request.userId, decision: 'approve' })}
                  aria-label={`Approve ${request.userName} for ${request.companyName}`}
                  className="h-9"
                >
                  {isBusy(request, 'approve') && <Loader2 className="animate-spin" />}
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ companyId: request.companyId, userId: request.userId, decision: 'remove' })}
                  aria-label={`Remove the request from ${request.userName} for ${request.companyName}`}
                  className={cn('h-9', outlineButtonClass)}
                >
                  {isBusy(request, 'remove') && <Loader2 className="animate-spin" />}
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={decide.error} className="mt-2" />
    </PageSection>
  );
}

function UsersSection() {
  const users = useAdminUsers();
  const [term, setTerm] = useState('');

  const shown = useMemo(() => {
    const all = users.data ?? [];
    const needle = term.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((user) => user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle));
  }, [users.data, term]);

  const total = users.data?.length ?? 0;

  return (
    <PageSection
      title={total > 0 ? `People (${total.toLocaleString('en-US')})` : 'People'}
      description="Everyone with an account, newest first."
    >
      {users.isPending ? (
        <RowsSkeleton rows={3} />
      ) : users.isError ? (
        <LoadError error={users.error} onRetry={() => void users.refetch()} retrying={users.isFetching} />
      ) : total === 0 ? (
        <CardNote>Nobody has an account yet.</CardNote>
      ) : (
        <>
          {total > 8 && (
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
              <input
                type="text"
                role="searchbox"
                aria-label="Filter people by name or email"
                placeholder="Filter by name or email"
                autoComplete="off"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className={cn(fieldClass, 'h-11 bg-bg-surface pl-9')}
              />
            </div>
          )}
          {shown.length === 0 ? (
            <CardNote>Nobody matches “{term.trim()}”.</CardNote>
          ) : (
            <ul className={cardClass}>
              {shown.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </ul>
          )}
        </>
      )}
    </PageSection>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  return (
    <li className={cn(rowClass, 'grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center')}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-fg-default">
          <span className="min-w-0 break-words">{user.name}</span>
          {user.isAdmin && (
            <span className="shrink-0 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-300">
              Admin
            </span>
          )}
        </p>
        <p className="break-all text-sm text-fg-muted">{user.email}</p>
      </div>
      <p className="text-xs text-fg-muted md:text-right">
        Joined {formatDate(user.createdAt)}
        <span className="mx-1.5" aria-hidden="true">
          ·
        </span>
        {user.companies} {user.companies === 1 ? 'company' : 'companies'}
        <span className="mx-1.5" aria-hidden="true">
          ·
        </span>
        {user.applications} {user.applications === 1 ? 'application' : 'applications'}
      </p>
    </li>
  );
}
