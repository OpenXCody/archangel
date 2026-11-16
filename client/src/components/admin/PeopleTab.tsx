import { useId, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  RESET_HOURS,
  personRoles,
  useAddMembership,
  useAdminUsers,
  useCreateResetLink,
  useDecideMembership,
  useDeleteUser,
  useSetAdmin,
  type AccountUser,
  type AdminCompany,
  type AdminUser,
} from '../../lib/account';
import { formatDate } from '../../lib/jobFormat';
import { CardNote, ErrorNote, LoadError, RowsSkeleton, cardClass, fieldClass, outlineButtonClass, rowClass, textButtonClass, useDebouncedValue } from '../account/parts';
import { PageSection } from '../layout/Page';
import CompanyPicker from './CompanyPicker';
import ConfirmDialog from './ConfirmDialog';
import CopyLinkField from './CopyLinkField';

/** Everyone with an account: search, roles, company access, password reset, deletion. */
export default function PeopleTab({ me }: { me: AccountUser }) {
  const [term, setTerm] = useState('');
  const q = useDebouncedValue(term.trim());
  const people = useAdminUsers(q);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = people.data?.pages.flatMap((page) => page.users) ?? [];
  const total = people.data?.pages[0]?.total ?? 0;

  return (
    <PageSection>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
        <input
          type="text"
          role="searchbox"
          enterKeyHint="search"
          aria-label="Search people"
          placeholder="Name or email"
          autoComplete="off"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className={cn(fieldClass, 'h-11 bg-bg-surface pl-9')}
        />
      </div>

      {people.isPending ? (
        <RowsSkeleton rows={4} />
      ) : people.isError ? (
        <LoadError error={people.error} onRetry={() => void people.refetch()} retrying={people.isFetching} />
      ) : rows.length === 0 ? (
        <CardNote>{q ? 'No match.' : 'None.'}</CardNote>
      ) : (
        <>
          <ul className={cn(cardClass, people.isPlaceholderData && 'opacity-60')} aria-busy={people.isPlaceholderData}>
            {rows.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                isSelf={person.id === me.id}
                open={openId === person.id}
                onToggle={() => setOpenId((current) => (current === person.id ? null : person.id))}
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
                disabled={people.isFetchingNextPage}
                onClick={() => void people.fetchNextPage()}
                className={cn('h-9', outlineButtonClass)}
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
  return (
    <li className={rowClass} data-person-email={person.email}>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-fg-default">{person.name}</p>
          <p className="break-all text-sm text-fg-muted">{person.email}</p>
          <p className="mt-1 break-words text-xs text-fg-muted">
            <span data-person-roles>{personRoles(person).join(' · ')}</span>
            <span className="mx-1.5" aria-hidden="true">
              ·
            </span>
            Joined {formatDate(person.createdAt)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? 'Close' : 'Manage'} ${person.name}`}
          onClick={onToggle}
          className={cn('h-9 justify-self-start sm:justify-self-end', outlineButtonClass)}
        >
          {open ? 'Close' : 'Manage'}
        </Button>
      </div>
      {open && <PersonPanel id={panelId} person={person} isSelf={isSelf} />}
    </li>
  );
}

const panelLabelClass = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-soft';

function PersonPanel({ id, person, isSelf }: { id: string; person: AdminUser; isSelf: boolean }) {
  const pickerId = useId();
  const resetLinkId = useId();
  const setAdmin = useSetAdmin();
  const resetLink = useCreateResetLink();
  const addMembership = useAddMembership();
  const removeMembership = useDecideMembership();
  const deleteUser = useDeleteUser();
  const [company, setCompany] = useState<AdminCompany | null>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <div id={id} className="space-y-5 border-t border-border-subtle bg-bg-base px-4 py-4">
      <div>
        <p className={panelLabelClass}>Admin</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={setAdmin.isPending || (isSelf && person.isAdmin)}
            onClick={() => setAdmin.mutate({ userId: person.id, isAdmin: !person.isAdmin })}
            className={cn('h-9', outlineButtonClass)}
          >
            {setAdmin.isPending && <Loader2 className="animate-spin" />}
            {person.isAdmin ? 'Remove admin' : 'Make admin'}
          </Button>
          {isSelf && <p className="text-xs text-fg-muted">Signed-in account. Its admin role and deletion are locked.</p>}
        </div>
        <ErrorNote error={setAdmin.error} className="mt-2" />
      </div>

      <div>
        <p className={panelLabelClass}>Companies</p>
        {person.memberships.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">None.</p>
        ) : (
          <ul className="mt-1">
            {person.memberships.map((membership) => (
              <li key={membership.companyId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5" data-membership={membership.companyId}>
                <span className="min-w-0 break-words text-sm text-fg-default">{membership.companyName}</span>
                {membership.status === 'requested' && <span className="text-xs text-fg-muted">Requested</span>}
                <button
                  type="button"
                  disabled={removeMembership.isPending}
                  onClick={() => removeMembership.mutate({ companyId: membership.companyId, userId: person.id, decision: 'remove' })}
                  aria-label={`Remove ${person.name} from ${membership.companyName}`}
                  className={textButtonClass}
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
            disabled={!company || addMembership.isPending}
            onClick={() => {
              if (!company) return;
              addMembership.mutate({ companyId: company.id, userId: person.id }, { onSuccess: () => setCompany(null) });
            }}
            className={cn('h-[42px] justify-self-start', outlineButtonClass)}
          >
            {addMembership.isPending && <Loader2 className="animate-spin" />}
            Add to company
          </Button>
        </div>
        <ErrorNote error={addMembership.error ?? removeMembership.error} className="mt-2" />
      </div>

      <div data-password-reset>
        <p className={panelLabelClass}>Password</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={resetLink.isPending}
            onClick={() => resetLink.mutate(person.id)}
            className={cn('h-9', outlineButtonClass)}
          >
            {resetLink.isPending && <Loader2 className="animate-spin" />}
            Password reset link
          </Button>
          <p className="text-xs text-fg-muted">No email is sent. The link is passed on by hand.</p>
        </div>
        {/* Shown once: only its hash is kept, so closing this panel loses it. A new one replaces it. */}
        {resetLink.data && (
          <div className="mt-3 max-w-xl">
            <CopyLinkField
              id={resetLinkId}
              label={`Reset link for ${person.email}`}
              hint={`Shown once. Expires in ${RESET_HOURS} hours. Replaces any earlier link.`}
              path={resetLink.data.link}
            />
          </div>
        )}
        <ErrorNote error={resetLink.error} className="mt-2" />
      </div>

      {!isSelf && (
        <div>
          <button
            type="button"
            onClick={() => {
              deleteUser.reset();
              setConfirming(true);
            }}
            className={textButtonClass}
          >
            Delete account
          </button>
          <ConfirmDialog
            open={confirming}
            title="Delete account"
            description={
              <>
                <p>
                  <span className="font-medium text-fg-default">{person.name}</span> ({person.email})
                </p>
                <p>Removes the account with its sessions, company memberships, applications, skills and goals. Cannot be undone.</p>
              </>
            }
            confirmLabel="Delete account"
            busy={deleteUser.isPending}
            error={deleteUser.error}
            onConfirm={() => deleteUser.mutate(person.id)}
            onCancel={() => setConfirming(false)}
          />
        </div>
      )}
    </div>
  );
}
