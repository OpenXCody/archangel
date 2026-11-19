import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  INVITE_ROLES,
  inviteRoleLabel,
  useEmailOn,
  type InviteRole,
} from '../../lib/account';
import {
  useAdminInvites,
  useAdminPastInvites,
  useCreateInvite,
  useRevokeInvite,
  type AdminCompany,
  type CreatedInvite,
} from '../../lib/admin';
import { ApiError } from '../../lib/http';
import { onGroupArrowKeys } from '../../lib/roving';
import {
  CardNote,
  ErrorNote,
  Field,
  LoadError,
  RowsSkeleton,
  busyButtonClass,
  cardClass,
  fieldClass,
  rowClass,
  textButtonClass,
  Dot,
} from '../account/parts';
import { DAY_MS, formatDay } from '../../lib/dates';
import { PageSection } from '../layout/Page';
import { useAdminNotice } from './AdminNotice';
import CompanyPicker from './CompanyPicker';
import CopyLinkField from './CopyLinkField';

// The link of the last invite created exists nowhere else (only its hash is
// stored), so it is kept for as long as the page is open: looking at another
// tab and coming back must not lose it.
let lastCreated: CreatedInvite | null = null;

/** "3 days", "14 days": how long a link made now lasts, from its expiry. */
function daysLeft(expiresAt: string): string {
  const days = Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Invite a person by link: create, hand over the link, see what is pending
 * and what became of earlier invites. When the app can send mail the link is
 * emailed to the address as well; it is still shown here once.
 */
export default function InvitesTab() {
  const emailOn = useEmailOn();
  const [created, setCreatedState] = useState<CreatedInvite | null>(lastCreated);
  const setCreated = (next: CreatedInvite | null) => {
    lastCreated = next;
    setCreatedState(next);
  };
  return (
    <>
      <PageSection
        title="New invite"
        description={emailOn ? 'The link is emailed to the address, and shown here once.' : 'No email is sent. The link is passed on by hand.'}
      >
        <InviteForm onCreated={setCreated} />
        {created && <InviteLink created={created} />}
      </PageSection>
      <PendingInvites
        onRevoked={(inviteId) => {
          if (created?.invite.id === inviteId) setCreated(null);
        }}
      />
      <EarlierInvites />
    </>
  );
}

function InviteForm({ onCreated }: { onCreated: (created: CreatedInvite) => void }) {
  const create = useCreateInvite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('user');
  const [company, setCompany] = useState<AdminCompany | null>(null);
  const [attempted, setAttempted] = useState(false);

  const problems = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? undefined : 'Enter the email address to invite.',
    company: role === 'employer' && !company ? 'Choose the company they will post jobs for.' : undefined,
  };
  const payload = create.error instanceof ApiError ? (create.error.payload as { field?: unknown; existing?: { id?: unknown; name?: unknown } } | null) : null;
  // The address already has an account: the way on is that person, under People.
  const existing = typeof payload?.existing?.id === 'string' ? { id: payload.existing.id, name: String(payload.existing.name ?? '') } : null;
  const shown = (field: 'email' | 'company') =>
    (attempted ? problems[field] : undefined) ?? (payload?.field === field && !existing ? (create.error as Error).message : undefined);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    setAttempted(true);
    create.reset();
    if (problems.email) return void document.getElementById('invite-email')?.focus();
    if (problems.company) return void document.getElementById('invite-company')?.focus();
    create.mutate(
      { email: email.trim(), role, companyId: role === 'employer' ? company?.id : undefined },
      {
        onSuccess: (result) => {
          onCreated(result);
          setEmail('');
          setCompany(null);
          setAttempted(false);
          // Back to the ordinary role, so the next invite is not an admin's by accident.
          setRole('user');
        },
        // What was refused is about the address: put focus back on it.
        onError: () => document.getElementById('invite-email')?.focus(),
      }
    );
  };

  return (
    <form onSubmit={submit} noValidate className={cn(cardClass, 'p-4 sm:p-5')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="Email" htmlFor="invite-email">
          <input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={shown('email') || existing ? true : undefined}
            aria-describedby={shown('email') || existing ? 'invite-email-error' : undefined}
            className={cn(fieldClass, (shown('email') || existing) && 'border-danger/60')}
          />
          {existing ? (
            <p id="invite-email-error" role="alert" className="mt-1.5 text-xs text-fg-muted" data-invite-existing>
              That address has an account:{' '}
              <Link to={`/admin?q=${encodeURIComponent(email.trim())}&open=${existing.id}`} className="font-medium text-fg-default underline underline-offset-4 hover:no-underline">
                {existing.name || email.trim()}
              </Link>
              . Its roles are changed under People.
            </p>
          ) : (
            shown('email') && (
              <p id="invite-email-error" role="alert" className="mt-1.5 text-xs text-danger">
                {shown('email')}
              </p>
            )
          )}
        </Field>
        <div className="min-w-0">
          <p id="invite-role-label" className="mb-1.5 text-sm font-medium text-fg-muted">
            Role
          </p>
          <div
            role="radiogroup"
            aria-labelledby="invite-role-label"
            onKeyDown={(event) => onGroupArrowKeys(event, INVITE_ROLES, role, setRole)}
            className="grid h-[42px] grid-cols-3 gap-1 rounded-lg border border-border-strong bg-bg-elevated p-1 sm:w-72"
          >
            {INVITE_ROLES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={role === value}
                tabIndex={role === value ? 0 : -1}
                onClick={() => setRole(value)}
                className={cn(
                  'min-w-0 truncate rounded-md px-2 text-sm font-medium transition-colors',
                  role === value ? 'bg-bg-surface text-fg-default' : 'text-fg-muted hover:text-fg-default'
                )}
              >
                {inviteRoleLabel(value)}
              </button>
            ))}
          </div>
        </div>
        {role === 'employer' && (
          <Field label="Company" htmlFor="invite-company" className="sm:col-span-2">
            <CompanyPicker
              id="invite-company"
              value={company}
              onChange={setCompany}
              disabled={create.isPending}
              invalid={Boolean(shown('company'))}
              describedBy={shown('company') ? 'invite-company-error' : undefined}
            />
            {shown('company') && (
              <p id="invite-company-error" role="alert" className="mt-1.5 text-xs text-danger">
                {shown('company')}
              </p>
            )}
          </Field>
        )}
      </div>
      {role === 'admin' && (
        <p className="mt-3 text-sm text-fg-muted" data-admin-invite-note>
          An admin can change every record, decide who gets in, and make or remove other admins. The link lasts 3 days.
        </p>
      )}
      {!existing && !payload?.field && <ErrorNote error={create.error} className="mt-4" />}
      <Button type="submit" aria-disabled={create.isPending} aria-busy={create.isPending} className={cn('mt-4 h-10 rounded-lg', busyButtonClass)}>
        {create.isPending && <Loader2 className="animate-spin" />}
        Create invite
      </Button>
    </form>
  );
}

/** The link of the invite just created. It cannot be shown again: only its hash is kept. */
function InviteLink({ created }: { created: CreatedInvite }) {
  const emailOn = useEmailOn();
  return (
    <div className={cn(cardClass, 'mt-3 p-4 sm:p-5')} data-invite-link>
      <CopyLinkField
        id="invite-link"
        label={`Invite link for ${created.invite.email}`}
        path={created.path}
        hint={
          <span data-invite-sent={created.emailed || undefined}>
            {created.emailed ? `Sent to ${created.invite.email}. ` : emailOn ? 'The email could not be sent. Pass the link on by hand. ' : ''}
            {inviteRoleLabel(created.invite.role, created.invite.companyName)}. Shown once. Expires in {daysLeft(created.invite.expiresAt)}.
            {created.replaced && <span data-invite-replaced> The earlier link for this address no longer works.</span>}
          </span>
        }
      />
    </div>
  );
}

const PENDING_SHOWN = 12;

function PendingInvites({ onRevoked }: { onRevoked: (inviteId: string) => void }) {
  const invites = useAdminInvites();
  const revoke = useRevokeInvite();
  const notice = useAdminNotice();
  const [filter, setFilter] = useState('');

  const all = invites.data?.invites ?? [];
  const wanted = filter.trim().toLowerCase();
  const shown = all.filter((invite) => !wanted || invite.email.includes(wanted) || (invite.companyName ?? '').toLowerCase().includes(wanted));

  return (
    <PageSection title="Pending">
      {invites.isPending ? (
        <RowsSkeleton rows={2} />
      ) : invites.isError ? (
        <LoadError error={invites.error} onRetry={() => void invites.refetch()} retrying={invites.isFetching} />
      ) : all.length === 0 ? (
        <CardNote>None yet.</CardNote>
      ) : (
        <>
          {all.length > PENDING_SHOWN && (
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by email or company"
              aria-label="Filter pending invites"
              className={cn(fieldClass, 'mb-3 sm:max-w-xs')}
            />
          )}
          {shown.length === 0 ? (
            <CardNote>No match.</CardNote>
          ) : (
            <ul className={cardClass}>
              {shown.map((invite, index) => (
                <li
                  key={invite.id}
                  className={cn(rowClass, 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3')}
                  data-invite-email={invite.email}
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-fg-default">{invite.email}</p>
                    <p className="mt-0.5 break-words text-xs text-fg-muted">
                      {inviteRoleLabel(invite.role, invite.companyName)}
                      <Dot />
                      Invited {formatDay(invite.createdAt)}
                      {invite.invitedBy ? ` by ${invite.invitedBy}` : ''}
                      <Dot />
                      Expires {formatDay(invite.expiresAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-disabled={revoke.isPending}
                    onClick={() => {
                      if (revoke.isPending) return;
                      const next = shown[index + 1];
                      revoke.mutate(invite.id, {
                        onSuccess: () => {
                          onRevoked(invite.id);
                          notice.say(`Revoked the invite for ${invite.email}. Its link no longer works.`, {
                            focus: next ? `[data-invite-email="${next.email}"] button` : undefined,
                          });
                        },
                      });
                    }}
                    aria-label={`Revoke the invite for ${invite.email}`}
                    className={cn(textButtonClass, 'flex min-h-9 items-center aria-disabled:pointer-events-none aria-disabled:opacity-50')}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <ErrorNote error={revoke.error} className="mt-2" />
    </PageSection>
  );
}

/** What became of earlier invites: accepted, or run out unused. A revoked one is in History. */
function EarlierInvites() {
  const past = useAdminPastInvites();
  if (!past.data || past.data.length === 0) return null;
  return (
    <PageSection title="Earlier" description="Accepted, or expired without being used. Revoked invites are under History.">
      <ul className={cardClass} data-earlier-invites>
        {past.data.map((invite) => (
          <li key={invite.id} className={cn(rowClass, 'px-4 py-3')} data-earlier-invite={invite.state}>
            <p className="break-all text-sm text-fg-default">{invite.email}</p>
            <p className="mt-0.5 break-words text-xs text-fg-muted">
              {invite.state === 'accepted' && invite.acceptedAt ? `Accepted ${formatDay(invite.acceptedAt)}` : `Expired ${formatDay(invite.expiresAt)}`}
              <Dot />
              {inviteRoleLabel(invite.role, invite.companyName)}
              <Dot />
              Invited {formatDay(invite.createdAt)}
              {invite.invitedBy ? ` by ${invite.invitedBy}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
