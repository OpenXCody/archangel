import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useEmailOn, type AccountUser } from '../../lib/account';
import {
  RESET_HOURS,
  personRoles,
  useAddMembership,
  useAdminUsers,
  useCorrectUser,
  useCreateResetLink,
  useDecideMembership,
  useDeleteUser,
  useSetAdmin,
  useSignOutUser,
  type AdminCompany,
  type AdminUser,
  type PeopleRole,
} from '../../lib/admin';
import { ApiError } from '../../lib/http';
import {
  CardNote,
  ErrorNote,
  LoadError,
  RowsSkeleton,
  busyButtonClass,
  cardClass,
  fieldClass,
  outlineButtonClass,
  rowClass,
  selectContentClass,
  selectTriggerClass,
  textButtonClass,
} from '../account/parts';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { formatDay } from '../../lib/dates';
import { PageSection } from '../layout/Page';
import { useAdminNotice } from './AdminNotice';
import CompanyPicker from './CompanyPicker';
import ConfirmDialog from '../layout/ConfirmDialog';
import CopyLinkField from './CopyLinkField';

const ROLES: { value: PeopleRole; label: string }[] = [
  { value: 'admin', label: 'Admins' },
  { value: 'employer', label: 'Employers' },
  { value: 'waiting', label: 'Waiting for approval' },
  { value: 'user', label: 'Users' },
];

/** A text action inside a panel, tall enough to press on a phone. */
const panelActionClass = cn(textButtonClass, 'flex min-h-9 items-center aria-disabled:pointer-events-none aria-disabled:opacity-50');

/**
 * Everyone with an account: found by name, email or company and by role,
 * then roles, company access, name and email, sign-in and deletion. The
 * search, the role and the open person are kept in the address.
 */
export default function PeopleTab({ me }: { me: AccountUser }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [term, setTerm] = useState(searchParams.get('q') ?? '');
  const q = useDebouncedValue(term.trim());
  const role = ROLES.find((option) => option.value === searchParams.get('role'))?.value ?? '';
  const openId = searchParams.get('open');
  const people = useAdminUsers(q, role);

  const setParam = (name: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(name, value);
    else params.delete(name);
    setSearchParams(params, { replace: true });
  };
  // The address follows the search a beat after typing stops.
  const inAddress = searchParams.get('q') ?? '';
  useEffect(() => {
    if (q !== inAddress) setParam('q', q || null);
    // Only the settled search writes the address; the address itself changing must not write it back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const rows = people.data?.pages.flatMap((page) => page.users) ?? [];
  const total = people.data?.pages[0]?.total ?? 0;

  return (
    <PageSection>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            role="searchbox"
            enterKeyHint="search"
            aria-label="Search people"
            placeholder="Name, email or company"
            autoComplete="off"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className={cn(fieldClass, 'h-11 bg-bg-surface pl-9')}
          />
        </div>
        <Select value={role || 'all'} onValueChange={(value) => setParam('role', value === 'all' ? null : value)}>
          <SelectTrigger aria-label="Role" className={cn(selectTriggerClass, 'h-11 w-full bg-bg-surface')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContentClass}>
            <SelectItem value="all" className="py-2.5">
              Everyone
            </SelectItem>
            {ROLES.map((option) => (
              <SelectItem key={option.value} value={option.value} className="py-2.5">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {people.isPending ? (
        <RowsSkeleton rows={4} />
      ) : people.isError ? (
        <LoadError error={people.error} onRetry={() => void people.refetch()} retrying={people.isFetching} />
      ) : rows.length === 0 ? (
        <CardNote>{q || role ? 'No match.' : 'None yet.'}</CardNote>
      ) : (
        <>
          <ul className={cn(cardClass, people.isPlaceholderData && 'opacity-60')} aria-busy={people.isPlaceholderData}>
            {rows.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                isSelf={person.id === me.id}
                open={openId === person.id}
                onToggle={() => setParam('open', openId === person.id ? null : person.id)}
              />
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs tabular-nums text-fg-muted">
              {rows.length.toLocaleString('en-US')} of {total.toLocaleString('en-US')}
            </p>
            {people.hasNextPage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-disabled={people.isFetchingNextPage}
                onClick={() => {
                  if (!people.isFetchingNextPage) void people.fetchNextPage();
                }}
                className={cn('h-9', outlineButtonClass, busyButtonClass)}
              >
                {people.isFetchingNextPage && <Loader2 className="animate-spin" />}
                More
              </Button>
            )}
          </div>
        </>
      )}
    </PageSection>
  );
}

interface PersonRowProps {
  person: AdminUser;
  isSelf: boolean;
  open: boolean;
  onToggle: () => void;
}

function PersonRow({ person, isSelf, open, onToggle }: PersonRowProps) {
  const panelId = useId();
  const roles = personRoles(person);
  return (
    <li className={rowClass} data-person-email={person.email}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-fg-default">{person.name}</p>
          <p className="break-all text-sm text-fg-muted">{person.email}</p>
          <p className="mt-1 break-words text-xs text-fg-muted">
            {/* A plain account has no role label: only when it joined. */}
            {roles.length > 0 && (
              <>
                <span data-person-roles>{roles.join(' · ')}</span>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
              </>
            )}
            Joined {formatDay(person.createdAt)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          // The address tells two people of one name apart.
          aria-label={`${open ? 'Close' : 'Manage'} ${person.name}, ${person.email}`}
          onClick={onToggle}
          className={cn('h-9', outlineButtonClass)}
          data-manage
        >
          {open ? 'Close' : 'Manage'}
        </Button>
      </div>
      {open && <PersonPanel id={panelId} person={person} isSelf={isSelf} />}
    </li>
  );
}

const panelLabelClass = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft';

/** What a confirmation asks, and what runs when it is given. */
interface Asking {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone: 'danger' | 'plain';
  run: (done: () => void, failed: (error: unknown) => void) => void;
}

function PersonPanel({ id, person, isSelf }: { id: string; person: AdminUser; isSelf: boolean }) {
  const pickerId = useId();
  const resetLinkId = useId();
  const notice = useAdminNotice();
  const setAdmin = useSetAdmin();
  const resetLink = useCreateResetLink();
  const signOut = useSignOutUser();
  const emailOn = useEmailOn();
  const addMembership = useAddMembership();
  const decideMembership = useDecideMembership();
  const deleteUser = useDeleteUser();
  const [company, setCompany] = useState<AdminCompany | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  const who = <span className="font-medium text-fg-default">{person.name}</span>;
  const ask = (next: Asking) => {
    setProblem(null);
    setAsking(next);
  };
  const confirm = () => {
    if (!asking || busy) return;
    setBusy(true);
    setProblem(null);
    asking.run(
      () => {
        setBusy(false);
        setAsking(null);
      },
      (error) => {
        setBusy(false);
        setProblem(error);
      }
    );
  };

  // Only another admin's role is this admin's to change; the first admin's is nobody else's.
  const roleLocked = person.isAdmin && (isSelf || person.isFirstAdmin);
  const deleteLocked = isSelf || (person.isAdmin && person.isFirstAdmin);
  const going = [
    person.applications > 0 && `${person.applications} ${person.applications === 1 ? 'application' : 'applications'}`,
    person.memberships.length > 0 && `${person.memberships.length} company ${person.memberships.length === 1 ? 'membership' : 'memberships'}`,
    'skills and goals',
  ].filter(Boolean);

  return (
    <div id={id} className="space-y-5 border-t border-border-subtle bg-bg-base px-4 py-4" data-person-panel>
      <CorrectPerson person={person} />

      <div>
        <p className={panelLabelClass}>Admin</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {!roleLocked && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                ask(
                  person.isAdmin
                    ? {
                        title: 'Remove admin role',
                        description: (
                          <>
                            <p>
                              {who} ({person.email})
                            </p>
                            <p>Admin Tools closes to them at once. The account and everything else of theirs stays.</p>
                          </>
                        ),
                        confirmLabel: 'Remove admin role',
                        tone: 'danger',
                        run: (done, failed) =>
                          setAdmin.mutate(
                            { userId: person.id, isAdmin: false },
                            {
                              onSuccess: () => {
                                done();
                                notice.say(`${person.name} is no longer an admin.`);
                              },
                              onError: failed,
                            }
                          ),
                      }
                    : {
                        title: 'Make admin',
                        description: (
                          <>
                            <p>
                              {who} ({person.email})
                            </p>
                            <p>An admin can change every record, decide who gets in, and make or remove other admins.</p>
                          </>
                        ),
                        confirmLabel: 'Make admin',
                        tone: 'plain',
                        run: (done, failed) =>
                          setAdmin.mutate(
                            { userId: person.id, isAdmin: true },
                            {
                              onSuccess: () => {
                                done();
                                notice.say(`${person.name} is now an admin.`);
                              },
                              onError: failed,
                            }
                          ),
                      }
                )
              }
              className={cn('h-9', outlineButtonClass)}
              data-admin-role
            >
              {person.isAdmin ? 'Remove admin role' : 'Make admin'}
            </Button>
          )}
          {isSelf ? (
            <p className="text-xs text-fg-muted">Signed-in account. Its admin role and deletion are locked.</p>
          ) : (
            person.isAdmin &&
            person.isFirstAdmin && (
              <p className="text-xs text-fg-muted" data-first-admin>
                First admin. Another admin cannot remove this role or delete the account.
              </p>
            )
          )}
        </div>
      </div>

      <div>
        <p className={panelLabelClass}>Companies</p>
        {person.memberships.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">None yet.</p>
        ) : (
          <ul className="mt-1">
            {person.memberships.map((membership) => (
              <li key={membership.companyId} className="flex flex-wrap items-center gap-x-3" data-membership={membership.companyId}>
                <span className="min-w-0 break-words text-sm text-fg-default">{membership.companyName}</span>
                {membership.status === 'requested' && <span className="text-xs text-fg-muted">Waiting for approval</span>}
                {membership.status === 'declined' && <span className="text-xs text-fg-muted">Declined</span>}
                {membership.status !== 'active' && (
                  <button
                    type="button"
                    aria-disabled={decideMembership.isPending}
                    onClick={() => {
                      if (decideMembership.isPending) return;
                      decideMembership.mutate(
                        { companyId: membership.companyId, userId: person.id, decision: 'approve' },
                        { onSuccess: () => notice.say(`Approved ${person.name} for ${membership.companyName}.`) }
                      );
                    }}
                    aria-label={`Approve ${person.name} for ${membership.companyName}`}
                    className={panelActionClass}
                  >
                    Approve
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    ask({
                      title: membership.status === 'active' ? 'Remove from company' : 'Clear request',
                      description: (
                        <>
                          <p>
                            {who} and <span className="font-medium text-fg-default">{membership.companyName}</span>
                          </p>
                          <p>
                            {membership.status === 'active'
                              ? 'They can no longer post its jobs or read its applicants. Jobs they posted stay.'
                              : 'The request is removed, and they can ask again.'}
                          </p>
                        </>
                      ),
                      confirmLabel: membership.status === 'active' ? 'Remove' : 'Clear request',
                      tone: 'danger',
                      run: (done, failed) =>
                        decideMembership.mutate(
                          { companyId: membership.companyId, userId: person.id, decision: 'remove' },
                          {
                            onSuccess: () => {
                              done();
                              notice.say(
                                membership.status === 'active'
                                  ? `Removed ${person.name} from ${membership.companyName}.`
                                  : `Cleared ${person.name}’s request for ${membership.companyName}.`
                              );
                            },
                            onError: failed,
                          }
                        ),
                    })
                  }
                  aria-label={`Remove ${person.name} from ${membership.companyName}`}
                  className={panelActionClass}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,24rem)_auto]">
          <div className="min-w-0">
            <label htmlFor={pickerId} className="sr-only">
              Add to a company
            </label>
            <CompanyPicker id={pickerId} value={company} onChange={setCompany} disabled={addMembership.isPending} />
          </div>
          <Button
            type="button"
            variant="outline"
            aria-disabled={!company || addMembership.isPending}
            aria-busy={addMembership.isPending}
            onClick={() => {
              if (!company || addMembership.isPending) return;
              addMembership.mutate(
                { companyId: company.id, userId: person.id },
                {
                  onSuccess: () => {
                    notice.say(`Added ${person.name} to ${company.name}.`);
                    setCompany(null);
                  },
                }
              );
            }}
            className={cn('h-[42px] justify-self-start', outlineButtonClass, busyButtonClass)}
          >
            {addMembership.isPending && <Loader2 className="animate-spin" />}
            Add to company
          </Button>
        </div>
        <ErrorNote error={addMembership.error ?? (asking ? null : decideMembership.error)} className="mt-2" />
      </div>

      <div data-password-reset>
        <p className={panelLabelClass}>Sign-in</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-disabled={resetLink.isPending}
            aria-busy={resetLink.isPending}
            onClick={() => {
              if (!resetLink.isPending) resetLink.mutate(person.id);
            }}
            className={cn('h-9', outlineButtonClass, busyButtonClass)}
          >
            {resetLink.isPending && <Loader2 className="animate-spin" />}
            Password reset link
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-disabled={signOut.isPending}
            aria-busy={signOut.isPending}
            onClick={() => {
              if (signOut.isPending) return;
              signOut.mutate(person.id, {
                onSuccess: ({ ended }) =>
                  notice.say(
                    ended === 0
                      ? isSelf
                        ? 'No other session of yours was open.'
                        : `${person.name} was not signed in anywhere.`
                      : `Signed ${isSelf ? 'you' : person.name} out of ${ended} ${isSelf ? 'other ' : ''}${ended === 1 ? 'session' : 'sessions'}.`
                  ),
              });
            }}
            className={cn('h-9', outlineButtonClass, busyButtonClass)}
            data-sign-out
          >
            {signOut.isPending && <Loader2 className="animate-spin" />}
            {isSelf ? 'Sign out my other sessions' : 'Sign out everywhere'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-fg-muted">
          {emailOn ? 'A reset link is emailed to the person, and shown here once.' : 'No email is sent. A reset link is passed on by hand.'}{' '}
          {isSelf ? '' : 'Signing out ends every session; the password stays.'}
        </p>
        {/* Shown once: only its hash is kept, so closing this panel loses it. A new one replaces it. */}
        {resetLink.data && (
          <div className="mt-3 max-w-xl">
            <CopyLinkField
              id={resetLinkId}
              label={`Reset link for ${person.email}`}
              hint={`${
                resetLink.data.emailed ? `Sent to ${person.email}. ` : emailOn ? 'The email could not be sent. Pass the link on by hand. ' : ''
              }Shown once. Expires in ${RESET_HOURS} hours. Replaces any earlier link.`}
              path={resetLink.data.link}
            />
          </div>
        )}
        <ErrorNote error={resetLink.error ?? signOut.error} className="mt-2" />
      </div>

      {!deleteLocked && (
        <div>
          <button
            type="button"
            onClick={() =>
              ask({
                title: 'Delete account',
                description: (
                  <>
                    <p>
                      {who} ({person.email})
                    </p>
                    <p data-delete-takes>Goes with it: {going.join(', ')}. They are signed out at once.</p>
                    {person.jobsPosted > 0 && (
                      <p>
                        {person.jobsPosted} {person.jobsPosted === 1 ? 'job they posted stays' : 'jobs they posted stay'} with the company.
                      </p>
                    )}
                    <p>Cannot be undone.</p>
                  </>
                ),
                confirmLabel: 'Delete account',
                tone: 'danger',
                run: (done, failed) =>
                  deleteUser.mutate(person.id, {
                    onSuccess: () => {
                      done();
                      notice.say(`Deleted the account of ${person.name} (${person.email}).`);
                    },
                    onError: failed,
                  }),
              })
            }
            className={panelActionClass}
            data-delete-account
          >
            Delete account
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(asking)}
        title={asking?.title ?? ''}
        description={asking?.description}
        confirmLabel={asking?.confirmLabel ?? ''}
        tone={asking?.tone}
        busy={busy}
        error={problem}
        onConfirm={confirm}
        onCancel={() => setAsking(null)}
      />
    </div>
  );
}

/** A person's name and email address, corrected in place. Each problem is said beside its field. */
function CorrectPerson({ person }: { person: AdminUser }) {
  const nameId = useId();
  const emailId = useId();
  const notice = useAdminNotice();
  const correct = useCorrectUser();
  const [name, setName] = useState(person.name);
  const [email, setEmail] = useState(person.email);
  const [attempted, setAttempted] = useState(false);

  const changed = name.trim() !== person.name || email.trim().toLowerCase() !== person.email;
  const problems = {
    name: !name.trim() ? 'Enter a name.' : name.trim().length > 80 ? 'A name is up to 80 characters.' : undefined,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? undefined : 'Enter a valid email address.',
  };
  const refused = correct.error instanceof ApiError ? (correct.error.payload as { field?: unknown } | null)?.field : null;
  const shown = (field: 'name' | 'email') => (attempted ? problems[field] : undefined) ?? (refused === field ? (correct.error as Error).message : undefined);

  useEffect(() => {
    if (refused === 'email') document.getElementById(emailId)?.focus();
    if (refused === 'name') document.getElementById(nameId)?.focus();
  }, [refused, correct.error, emailId, nameId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (correct.isPending || !changed) return;
    setAttempted(true);
    correct.reset();
    if (problems.name) return void document.getElementById(nameId)?.focus();
    if (problems.email) return void document.getElementById(emailId)?.focus();
    correct.mutate(
      { userId: person.id, patch: { name: name.trim(), email: email.trim() } },
      { onSuccess: (saved) => notice.say(`Saved ${saved.name} (${saved.email}).`) }
    );
  };

  return (
    <form onSubmit={submit} noValidate data-correct-person>
      <p className={panelLabelClass}>Name and email</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <label htmlFor={nameId} className="sr-only">
            Name
          </label>
          <input
            id={nameId}
            type="text"
            autoComplete="off"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={shown('name') ? true : undefined}
            aria-describedby={shown('name') ? `${nameId}-error` : undefined}
            className={cn(fieldClass, shown('name') && 'border-danger/60')}
          />
          {shown('name') && (
            <p id={`${nameId}-error`} role="alert" className="mt-1.5 text-xs text-danger">
              {shown('name')}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <label htmlFor={emailId} className="sr-only">
            Email
          </label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={shown('email') ? true : undefined}
            aria-describedby={shown('email') ? `${emailId}-error` : undefined}
            className={cn(fieldClass, shown('email') && 'border-danger/60')}
          />
          {shown('email') && (
            <p id={`${emailId}-error`} role="alert" className="mt-1.5 text-xs text-danger">
              {shown('email')}
            </p>
          )}
        </div>
        <Button
          type="submit"
          variant="outline"
          aria-disabled={!changed || correct.isPending}
          aria-busy={correct.isPending}
          className={cn('h-[42px] justify-self-start', outlineButtonClass, busyButtonClass)}
        >
          {correct.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
      {!refused && <ErrorNote error={correct.error} className="mt-2" />}
    </form>
  );
}
